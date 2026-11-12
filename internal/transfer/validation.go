package transfer

import (
	"context"
	"database/sql"
)

// Foreign keys prove that a parent exists, but cannot prove that walking parents
// terminates. Match the normal services' hierarchy rules before publishing rows.
func validateHierarchy(ctx context.Context, tx *sql.Tx) error {
	for _, name := range []string{"tasks", "pages"} {
		type node struct {
			parent  sql.NullString
			deleted sql.NullInt64
		}
		nodes := map[string]node{}
		rows, err := tx.QueryContext(ctx, "SELECT id,parent_id,deleted_at FROM "+name)
		if err != nil {
			return err
		}
		for rows.Next() {
			var key string
			var n node
			if err = rows.Scan(&key, &n.parent, &n.deleted); err != nil {
				rows.Close()
				return err
			}
			nodes[key] = n
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		done := map[string]bool{}
		for key, n := range nodes {
			if name == "tasks" && !n.deleted.Valid && n.parent.Valid && nodes[n.parent.String].parent.Valid {
				return invalid()
			}
			if done[key] {
				continue
			}
			seen := map[string]bool{}
			for current := key; current != "" && !done[current]; {
				if seen[current] {
					return invalid()
				}
				seen[current] = true
				parent := nodes[current].parent
				if !parent.Valid {
					break
				}
				current = parent.String
			}
			for key := range seen {
				done[key] = true
			}
		}
	}
	return nil
}
