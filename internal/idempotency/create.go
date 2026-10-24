// Package idempotency saves creation outcomes atomically with their native objects.
package idempotency

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"noteapp/internal/apperr"
	"unicode/utf8"
)

func Create[T any](ctx context.Context, db *sql.DB, key, scope string, input any, create func(*sql.Tx) (T, error)) (T, error) {
	var result T
	if utf8.RuneCountInString(key) > 128 {
		return result, apperr.Invalid("request_id 不能超过 128 个字符")
	}
	payload, err := json.Marshal(input)
	if err != nil {
		return result, err
	}
	// Decode and re-encode to canonicalize nested document object key ordering.
	var canonical any
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.UseNumber()
	if err = decoder.Decode(&canonical); err != nil {
		return result, err
	}
	payload, err = json.Marshal(canonical)
	if err != nil {
		return result, err
	}
	sum := sha256.Sum256(payload)
	hash := hex.EncodeToString(sum[:])
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return result, err
	}
	defer tx.Rollback()
	if key != "" {
		var savedScope, savedHash string
		var raw []byte
		err = tx.QueryRowContext(ctx, "SELECT scope,payload_hash,result FROM creation_requests WHERE request_id=?", key).Scan(&savedScope, &savedHash, &raw)
		if err == nil {
			if savedScope != scope || savedHash != hash {
				return result, apperr.Conflict("request_id 已用于其他创建请求")
			}
			err = json.Unmarshal(raw, &result)
			return result, err
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return result, err
		}
	}
	result, err = create(tx)
	if err != nil {
		return result, err
	}
	if key != "" {
		raw, e := json.Marshal(result)
		if e != nil {
			return result, e
		}
		if _, err = tx.ExecContext(ctx, "INSERT INTO creation_requests(request_id,scope,payload_hash,result) VALUES(?,?,?,?)", key, scope, hash, raw); err != nil {
			return result, err
		}
	}
	return result, tx.Commit()
}
