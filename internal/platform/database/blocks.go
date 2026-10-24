package database

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"fmt"
	"noteapp/internal/document"
)

// migrateBlocks consumes offline-prepared BlockNote conversions. All rows,
// including archived and deleted objects, are validated before dropping columns.
// The caller owns the migration transaction, so any failure preserves schema6.
func migrateBlocks(ctx context.Context, tx *sql.Tx) error {
	var hasPrepared int
	if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM sqlite_master WHERE type='table' AND name='block_migration_prepared'`).Scan(&hasPrepared); err != nil {
		return err
	}
	for _, table := range []string{"tasks", "pages", "events"} {
		rows, err := tx.QueryContext(ctx, "SELECT id,body,body_document FROM "+table)
		if err != nil {
			return err
		}
		type entry struct {
			id, source string
			doc        []byte
		}
		entries := []entry{}
		for rows.Next() {
			var e entry
			if err = rows.Scan(&e.id, &e.source, &e.doc); err != nil {
				rows.Close()
				return err
			}
			entries = append(entries, e)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		for _, e := range entries {
			if len(e.doc) == 0 {
				if e.source == "" {
					e.doc = document.Empty()
				} else {
					if hasPrepared == 0 {
						return fmt.Errorf("block-only migration: %s/%s has legacy Markdown; stop the app and run scripts/prepare-block-migration.mjs on a backed-up database", table, e.id)
					}
					var sourceHash string
					if err = tx.QueryRowContext(ctx, `SELECT source_sha256,body_document FROM block_migration_prepared WHERE object_type=? AND object_id=?`, table, e.id).Scan(&sourceHash, &e.doc); err != nil {
						return fmt.Errorf("block migration preparation missing for %s/%s: %w", table, e.id, err)
					}
					if sourceHash != fmt.Sprintf("%x", sha256.Sum256([]byte(e.source))) {
						return fmt.Errorf("block migration source changed for %s/%s", table, e.id)
					}
				}
			}
			if err = document.Validate(e.doc); err != nil {
				return fmt.Errorf("invalid block migration document %s/%s: %w", table, e.id, err)
			}
			if _, err = tx.ExecContext(ctx, "UPDATE "+table+" SET body_document=? WHERE id=?", []byte(e.doc), e.id); err != nil {
				return err
			}
		}
		// A fresh column establishes a nonnull default for direct SQL inserts too.
		// SQLite ALTER operations participate in the same transaction as the copies.
		statements := []string{
			"ALTER TABLE " + table + ` ADD COLUMN block_content BLOB NOT NULL DEFAULT '{"version":1,"blocks":[]}' CHECK(coalesce(json_valid(block_content) AND json_extract(block_content,'$.version')=1 AND json_type(block_content,'$.blocks')='array',0))`,
			"UPDATE " + table + " SET block_content=body_document",
			"ALTER TABLE " + table + " DROP COLUMN body_document",
			"ALTER TABLE " + table + " RENAME COLUMN block_content TO body_document",
			"ALTER TABLE " + table + " DROP COLUMN body",
			"ALTER TABLE " + table + " DROP COLUMN legacy_body",
		}
		for _, stmt := range statements {
			if _, err = tx.ExecContext(ctx, stmt); err != nil {
				return fmt.Errorf("migrate %s blocks: %w", table, err)
			}
		}
	}
	if hasPrepared > 0 {
		if _, err := tx.ExecContext(ctx, "DROP TABLE block_migration_prepared"); err != nil {
			return err
		}
	}
	return nil
}
