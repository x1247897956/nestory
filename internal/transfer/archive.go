// Package transfer provides portable, lossless workspace archives.
package transfer

import (
	"archive/zip"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"noteapp/internal/apperr"
	"noteapp/internal/document"
	"noteapp/internal/platform/id"
)

const MaxArchiveBytes int64 = 512 << 20
const maxJSONBytes int64 = 64 << 20
const schemaVersion = 10
const maxArchiveEntries = 10002 // manifest, workspace data and up to 10,000 attachments

// Only these server-owned identifiers enter SQL; never archive-supplied names.
var tables = []string{"projects", "tasks", "pages", "events", "assets", "task_pages", "task_events", "page_events", "recent_visits", "delete_batches", "creation_requests", "custom_property_definitions", "custom_property_values"}
var hexKey = regexp.MustCompile(`^[a-f0-9]{32}$`)

type Service struct {
	db  *sql.DB
	dir string
}

func New(db *sql.DB, dataDir string) *Service {
	return &Service{db: db, dir: filepath.Join(dataDir, "assets")}
}

type cell struct {
	Type  string `json:"type"`
	Value string `json:"value,omitempty"`
}
type table struct {
	Name    string   `json:"name"`
	Columns []string `json:"columns"`
	Rows    [][]cell `json:"rows"`
}
type workspace struct {
	Tables []table `json:"tables"`
}
type fileInfo struct {
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
}
type manifest struct {
	Format  string              `json:"format"`
	Version int                 `json:"version"`
	Schema  int                 `json:"schema"`
	Files   map[string]fileInfo `json:"files"`
}

func pack(value any) (cell, error) {
	switch v := value.(type) {
	case nil:
		return cell{Type: "null"}, nil
	case int64:
		return cell{Type: "integer", Value: strconv.FormatInt(v, 10)}, nil
	case float64:
		return cell{Type: "real", Value: strconv.FormatFloat(v, 'g', -1, 64)}, nil
	case string:
		return cell{Type: "text", Value: v}, nil
	case []byte:
		return cell{Type: "blob", Value: base64.StdEncoding.EncodeToString(v)}, nil
	default:
		return cell{}, fmt.Errorf("unsupported SQLite value %T", value)
	}
}
func (c cell) unpack() (any, error) {
	switch c.Type {
	case "null":
		if c.Value == "" {
			return nil, nil
		}
	case "integer":
		return strconv.ParseInt(c.Value, 10, 64)
	case "real":
		return strconv.ParseFloat(c.Value, 64)
	case "text":
		return c.Value, nil
	case "blob":
		return base64.StdEncoding.DecodeString(c.Value)
	}
	return nil, apperr.Invalid("备份中的数据类型无效")
}

func readTable(ctx context.Context, tx *sql.Tx, name string) (table, error) {
	out := table{Name: name, Rows: [][]cell{}}
	rows, err := tx.QueryContext(ctx, "SELECT * FROM "+name)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	out.Columns, err = rows.Columns()
	if err != nil {
		return out, err
	}
	for rows.Next() {
		values := make([]any, len(out.Columns))
		ptrs := make([]any, len(values))
		for i := range values {
			ptrs[i] = &values[i]
		}
		if err = rows.Scan(ptrs...); err != nil {
			return out, err
		}
		row := make([]cell, len(values))
		for i, v := range values {
			row[i], err = pack(v)
			if err != nil {
				return out, err
			}
		}
		out.Rows = append(out.Rows, row)
	}
	return out, rows.Err()
}

// Export stages the complete archive before the HTTP response starts. The caller
// removes the returned file. One read transaction keeps row/asset metadata aligned.
func (s *Service) Export(ctx context.Context) (path string, err error) {
	f, err := os.CreateTemp("", "nestory-export-*.zip")
	if err != nil {
		return "", err
	}
	path = f.Name()
	tempPath := path
	defer f.Close()
	defer func() {
		if err != nil {
			os.Remove(tempPath)
		}
	}()
	z := zip.NewWriter(f)
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return "", err
	}
	defer tx.Rollback()
	data := workspace{}
	for _, name := range tables {
		t, e := readTable(ctx, tx, name)
		if e != nil {
			return "", e
		}
		data.Tables = append(data.Tables, t)
	}
	m := manifest{Format: "nestory-workspace", Version: 1, Schema: schemaVersion, Files: map[string]fileInfo{}}
	var total int64
	add := func(name string, src io.Reader) error {
		w, e := z.Create(name)
		if e != nil {
			return e
		}
		h := sha256.New()
		n, e := io.Copy(io.MultiWriter(w, h), io.LimitReader(src, MaxArchiveBytes-total+1))
		if e != nil {
			return e
		}
		total += n
		if total > MaxArchiveBytes {
			return apperr.TooLarge("工作空间超过 512 MiB，请使用部署备份脚本")
		}
		m.Files[name] = fileInfo{Size: n, SHA256: hex.EncodeToString(h.Sum(nil))}
		return nil
	}
	raw, err := json.Marshal(data)
	if err != nil {
		return "", err
	}
	if int64(len(raw)) > maxJSONBytes {
		return "", apperr.TooLarge("工作空间内容超过在线导出限制，请使用部署备份脚本")
	}
	if err = add("workspace.json", strings.NewReader(string(raw))); err != nil {
		return "", err
	}
	var assets table
	for _, t := range data.Tables {
		if t.Name == "assets" {
			assets = t
		}
	}
	if len(assets.Rows) > maxArchiveEntries-2 {
		return "", apperr.TooLarge("附件数量超过在线备份上限（10,000 个），请使用部署备份脚本")
	}
	for _, row := range assets.Rows {
		aid, key, size, e := assetRow(assets.Columns, row)
		if e != nil {
			return "", e
		}
		file, e := os.Open(filepath.Join(s.dir, key))
		if e != nil {
			return "", fmt.Errorf("读取附件 %s: %w", aid, e)
		}
		stat, e := file.Stat()
		if e == nil && (!stat.Mode().IsRegular() || stat.Size() != size) {
			e = fmt.Errorf("附件 %s 大小不匹配", aid)
		}
		if e == nil {
			e = add("assets/"+aid, file)
		}
		file.Close()
		if e != nil {
			return "", e
		}
	}
	if err = tx.Commit(); err != nil {
		return "", err
	}
	manifestBytes, err := json.Marshal(m)
	if err != nil {
		return "", err
	}
	if int64(len(manifestBytes)) > 2<<20 || total+int64(len(manifestBytes)) > MaxArchiveBytes {
		return "", apperr.TooLarge("备份超过在线大小限制，请使用部署备份脚本")
	}
	w, err := z.Create("manifest.json")
	if err != nil {
		return "", err
	}
	if _, err = w.Write(manifestBytes); err != nil {
		return "", err
	}
	if err = z.Close(); err != nil {
		return "", err
	}
	stat, err := f.Stat()
	if err != nil {
		return "", err
	}
	if stat.Size() > MaxArchiveBytes {
		return "", apperr.TooLarge("备份超过在线大小限制，请使用部署备份脚本")
	}
	if err = f.Close(); err != nil {
		return "", err
	}
	return path, nil
}

func assetRow(columns []string, row []cell) (aid, key string, size int64, err error) {
	if len(row) != len(columns) {
		return "", "", 0, apperr.Invalid("附件记录列数不匹配")
	}
	for i, col := range columns {
		switch col {
		case "id":
			aid = row[i].Value
		case "storage_key":
			key = row[i].Value
		case "size":
			size, err = strconv.ParseInt(row[i].Value, 10, 64)
			if err != nil {
				return
			}
		}
	}
	if !hexKey.MatchString(aid) || !hexKey.MatchString(key) || size < 0 {
		return "", "", 0, apperr.Invalid("附件标识或大小无效")
	}
	return
}

func invalid() error {
	return apperr.Invalid("备份文件无效或已损坏，请重新导出 Nestory 工作空间 ZIP")
}

// Import never replaces existing content. Rows remain invisible until all schema,
// document, foreign key and attachment checks have passed and the transaction commits.
func (s *Service) Import(ctx context.Context, reader io.ReaderAt, size int64) (err error) {
	if size > MaxArchiveBytes {
		return apperr.TooLarge("备份文件不能超过 512 MiB")
	}
	z, err := zip.NewReader(reader, size)
	if err != nil {
		return invalid()
	}
	entries := map[string]*zip.File{}
	var total uint64
	if len(z.File) > maxArchiveEntries {
		return invalid()
	}
	for _, f := range z.File {
		validName := f.Name == "manifest.json" || f.Name == "workspace.json" || (strings.HasPrefix(f.Name, "assets/") && hexKey.MatchString(strings.TrimPrefix(f.Name, "assets/")))
		if !validName || !f.Mode().IsRegular() || entries[f.Name] != nil {
			return invalid()
		}
		if f.UncompressedSize64 > uint64(MaxArchiveBytes) || total > uint64(MaxArchiveBytes)-f.UncompressedSize64 {
			return invalid()
		}
		total += f.UncompressedSize64
		entries[f.Name] = f
	}
	read := func(name string, limit int64) ([]byte, error) {
		f := entries[name]
		if f == nil || f.UncompressedSize64 > uint64(limit) {
			return nil, invalid()
		}
		r, e := f.Open()
		if e != nil {
			return nil, invalid()
		}
		defer r.Close()
		raw, e := io.ReadAll(io.LimitReader(r, limit+1))
		if e != nil || int64(len(raw)) > limit {
			return nil, invalid()
		}
		return raw, nil
	}
	raw, err := read("manifest.json", 2<<20)
	if err != nil {
		return err
	}
	var m manifest
	if json.Unmarshal(raw, &m) != nil || m.Format != "nestory-workspace" || m.Version != 1 || m.Schema != schemaVersion || len(m.Files) != len(entries)-1 {
		return invalid()
	}
	stage, err := os.MkdirTemp("", "nestory-import-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(stage)
	checkedPaths := map[string]string{}
	for name, info := range m.Files {
		if name == "manifest.json" || entries[name] == nil || info.Size < 0 || uint64(info.Size) != entries[name].UncompressedSize64 {
			return invalid()
		}
		r, e := entries[name].Open()
		if e != nil {
			return invalid()
		}
		// The archive member itself is never used as a filesystem path.
		f, e := os.CreateTemp(stage, "checked-")
		if e != nil {
			r.Close()
			return e
		}
		h := sha256.New()
		n, e := io.Copy(io.MultiWriter(f, h), io.LimitReader(r, info.Size+1))
		r.Close()
		closeErr := f.Close()
		if e != nil || closeErr != nil || n != info.Size || hex.EncodeToString(h.Sum(nil)) != info.SHA256 {
			return invalid()
		}
		checkedPaths[name] = f.Name()
	}
	rawPath := checkedPaths["workspace.json"]
	if rawPath == "" {
		return invalid()
	}
	stat, err := os.Stat(rawPath)
	if err != nil || stat.Size() > maxJSONBytes {
		return invalid()
	}
	raw, err = os.ReadFile(rawPath)
	if err != nil {
		return err
	}
	var data workspace
	if json.Unmarshal(raw, &data) != nil || len(data.Tables) != len(tables) {
		return invalid()
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	// Acquire SQLite's writer lock before testing emptiness, including other processes.
	if _, err = tx.ExecContext(ctx, "UPDATE projects SET version=version WHERE 0"); err != nil {
		return err
	}
	for _, name := range tables {
		var n int
		if err = tx.QueryRowContext(ctx, "SELECT count(*) FROM "+name).Scan(&n); err != nil {
			return err
		}
		if n > 0 {
			return apperr.Conflict("只能恢复到空工作空间；请使用新的部署，原有数据不会被覆盖")
		}
	}
	if _, err = tx.ExecContext(ctx, "PRAGMA defer_foreign_keys=ON"); err != nil {
		return err
	}
	created := []string{}
	defer func() {
		if err != nil {
			for _, path := range created {
				os.Remove(path)
			}
		}
	}()
	used := map[string]bool{"workspace.json": true}
	for index, name := range tables {
		t := data.Tables[index]
		if t.Name != name {
			return invalid()
		}
		empty, e := readTable(ctx, tx, name)
		if e != nil {
			return e
		}
		if !slices.Equal(t.Columns, empty.Columns) {
			return invalid()
		}
		// Identifiers are fixed by the live schema comparison above; values are bound.
		columns := make([]string, len(t.Columns))
		for i, col := range t.Columns {
			columns[i] = `"` + col + `"`
		}
		statement := "INSERT INTO " + name + " (" + strings.Join(columns, ",") + ") VALUES (" + strings.TrimSuffix(strings.Repeat("?,", len(columns)), ",") + ")"
		for _, row := range t.Rows {
			if len(row) != len(columns) {
				return invalid()
			}
			values := make([]any, len(row))
			for i, c := range row {
				values[i], e = c.unpack()
				if e != nil {
					return invalid()
				}
				if t.Columns[i] == "body_document" {
					var doc []byte
					switch v := values[i].(type) {
					case []byte:
						doc = v
					case string:
						doc = []byte(v)
					default:
						return invalid()
					}
					if document.Validate(doc) != nil {
						return invalid()
					}
				}
			}
			if name == "assets" {
				aid, _, n, e := assetRow(t.Columns, row)
				if e != nil {
					return invalid()
				}
				entry := "assets/" + aid
				info, ok := m.Files[entry]
				if !ok || info.Size != n || used[entry] {
					return invalid()
				}
				used[entry] = true
				key, e := id.New()
				if e != nil {
					return e
				}
				if e = os.MkdirAll(s.dir, 0700); e != nil {
					return e
				}
				dest := filepath.Join(s.dir, key)
				src, e := os.Open(checkedPaths[entry])
				if e != nil {
					return e
				}
				out, e := os.OpenFile(dest, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
				if e != nil {
					src.Close()
					return e
				}
				created = append(created, dest)
				_, e = io.Copy(out, src)
				src.Close()
				closeErr := out.Close()
				if e != nil {
					return e
				}
				if closeErr != nil {
					return closeErr
				}
				for i, col := range t.Columns {
					if col == "storage_key" {
						values[i] = key
					}
				}
			}
			if _, e = tx.ExecContext(ctx, statement, values...); e != nil {
				return invalid()
			}
		}
	}
	if len(used) != len(m.Files) {
		return invalid()
	}
	rows, err := tx.QueryContext(ctx, "PRAGMA foreign_key_check")
	if err != nil {
		return err
	}
	hasViolation := rows.Next()
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	if hasViolation {
		return invalid()
	}
	if err = validateHierarchy(ctx, tx); err != nil {
		return err
	}
	if err = ctx.Err(); err != nil {
		return err
	}
	return tx.Commit()
}
