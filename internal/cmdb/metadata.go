package cmdb

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"unicode/utf8"
)

// MetadataFields is a single reference-data entry: 负责人, 运营商 and any future
// dictionary category that only needs a name and a note.
type MetadataFields struct {
	Kind        string `json:"kind"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

type MetadataEntry struct {
	MetadataFields
	ID int64 `json:"id"`
}

const metadataColumns = "id,kind,name,description"

func readMetadata(row scanner) (MetadataEntry, error) {
	var entry MetadataEntry
	err := row.Scan(&entry.ID, &entry.Kind, &entry.Name, &entry.Description)
	return entry, err
}

func normalizeMetadataFields(fields *MetadataFields) error {
	fields.Kind = strings.TrimSpace(strings.ToLower(fields.Kind))
	fields.Name = strings.TrimSpace(fields.Name)
	fields.Description = strings.TrimSpace(fields.Description)
	if fields.Kind == "" || utf8.RuneCountInString(fields.Kind) > 40 {
		return fmt.Errorf("%w: 分类无效", ErrInvalid)
	}
	if fields.Name == "" || utf8.RuneCountInString(fields.Name) > 80 {
		return fmt.Errorf("%w: 名称须为 1–80 个字符", ErrInvalid)
	}
	if utf8.RuneCountInString(fields.Description) > 200 {
		return fmt.Errorf("%w: 说明不能超过 200 个字符", ErrInvalid)
	}
	return nil
}

// ListMetadata returns the entries of one kind, or every kind when kind is
// empty, so the page can show counts per category without extra requests.
func ListMetadata(ctx context.Context, db *sql.DB, kind string) ([]MetadataEntry, error) {
	query := "SELECT " + metadataColumns + " FROM metadata_entries"
	args := []any{}
	if strings.TrimSpace(kind) != "" {
		query += " WHERE kind=$1"
		args = append(args, strings.TrimSpace(strings.ToLower(kind)))
	}
	query += " ORDER BY lower(name), id"
	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	entries := make([]MetadataEntry, 0)
	for rows.Next() {
		entry, err := readMetadata(rows)
		if err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}
	return entries, rows.Err()
}

func SaveMetadata(ctx context.Context, db *sql.DB, id int64, fields MetadataFields) (MetadataEntry, error) {
	if err := normalizeMetadataFields(&fields); err != nil {
		return MetadataEntry{}, err
	}
	var entry MetadataEntry
	var err error
	if id == 0 {
		entry, err = readMetadata(db.QueryRowContext(ctx, `
			INSERT INTO metadata_entries (kind,name,description) VALUES ($1,$2,$3)
			RETURNING `+metadataColumns, fields.Kind, fields.Name, fields.Description))
	} else {
		entry, err = readMetadata(db.QueryRowContext(ctx, `
			UPDATE metadata_entries SET kind=$2, name=$3, description=$4 WHERE id=$1
			RETURNING `+metadataColumns, id, fields.Kind, fields.Name, fields.Description))
	}
	if err != nil {
		if isUniqueViolation(err) {
			return MetadataEntry{}, fmt.Errorf("%w: 名称已存在", ErrInvalid)
		}
		return MetadataEntry{}, err
	}
	return entry, nil
}

func DeleteMetadata(ctx context.Context, db *sql.DB, id int64) error {
	result, err := db.ExecContext(ctx, "DELETE FROM metadata_entries WHERE id=$1", id)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}
