package database

import (
	"context"
	"database/sql"
	"fmt"
	_ "modernc.org/sqlite"
	"net/url"
	"noteapp/migrations"
	"time"
)

func Open(ctx context.Context, path string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", "file:"+url.PathEscape(path)+"?_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)")
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	if err = db.PingContext(ctx); err != nil {
		db.Close()
		return nil, err
	}
	if err = migrate(ctx, db); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return db, nil
}
func migrate(ctx context.Context, db *sql.DB) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,applied_at INTEGER NOT NULL)`); err != nil {
		return err
	}
	var n int
	if err = tx.QueryRowContext(ctx, "SELECT count(*) FROM schema_migrations WHERE version=1").Scan(&n); err != nil {
		return err
	}
	if n == 0 {
		if _, err = tx.ExecContext(ctx, migrations.Core); err != nil {
			return err
		}
		if _, err = tx.ExecContext(ctx, "INSERT INTO schema_migrations VALUES(1,?)", time.Now().UTC().UnixMilli()); err != nil {
			return err
		}
	}
	if err = tx.QueryRowContext(ctx, "SELECT count(*) FROM schema_migrations WHERE version=2").Scan(&n); err != nil {
		return err
	}
	if n == 0 {
		if _, err = tx.ExecContext(ctx, migrations.PagesAssets); err != nil {
			return err
		}
		if _, err = tx.ExecContext(ctx, "INSERT INTO schema_migrations VALUES(2,?)", time.Now().UTC().UnixMilli()); err != nil {
			return err
		}
	}

	return tx.Commit()
}
