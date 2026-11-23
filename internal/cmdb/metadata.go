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
	RoomID      int64  `json:"roomId,omitempty"`
}

type MetadataEntry struct {
	MetadataFields
	ID         int64  `json:"id"`
	RoomName   string `json:"roomName,omitempty"`
	AssetCount int64  `json:"assetCount"`
}

const metadataColumns = "id,kind,name,description,COALESCE(room_id,0)"

func readMetadata(row scanner) (MetadataEntry, error) {
	var entry MetadataEntry
	err := row.Scan(&entry.ID, &entry.Kind, &entry.Name, &entry.Description, &entry.RoomID)
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
	query := `
		SELECT m.id, m.kind, m.name, m.description, COALESCE(m.room_id, 0), COALESCE(r.name, ''),
			CASE WHEN m.kind = 'owner'
				THEN (SELECT count(*) FROM assets a WHERE lower(a.owner) = lower(m.name))
				ELSE 0
			END
		FROM metadata_entries m
		LEFT JOIN rooms r ON r.id = m.room_id`
	args := []any{}
	if strings.TrimSpace(kind) != "" {
		query += " WHERE m.kind=$1"
		args = append(args, strings.TrimSpace(strings.ToLower(kind)))
	}
	query += " ORDER BY lower(m.name), m.id"
	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	entries := make([]MetadataEntry, 0)
	for rows.Next() {
		var entry MetadataEntry
		if err := rows.Scan(&entry.ID, &entry.Kind, &entry.Name, &entry.Description, &entry.RoomID, &entry.RoomName, &entry.AssetCount); err != nil {
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
	if fields.RoomID != 0 {
		var exists bool
		if err := db.QueryRowContext(ctx, "SELECT EXISTS (SELECT 1 FROM rooms WHERE id=$1)", fields.RoomID).Scan(&exists); err != nil {
			return MetadataEntry{}, err
		}
		if !exists {
			return MetadataEntry{}, invalidFacility("所属数据中心不存在")
		}
	}
	var entry MetadataEntry
	var err error
	if id == 0 {
		entry, err = readMetadata(db.QueryRowContext(ctx, `
			INSERT INTO metadata_entries (kind,name,description,room_id) VALUES ($1,$2,$3,$4)
			RETURNING `+metadataColumns, fields.Kind, fields.Name, fields.Description, nullID(fields.RoomID)))
	} else {
		entry, err = readMetadata(db.QueryRowContext(ctx, `
			UPDATE metadata_entries SET kind=$2, name=$3, description=$4, room_id=$5 WHERE id=$1
			RETURNING `+metadataColumns, id, fields.Kind, fields.Name, fields.Description, nullID(fields.RoomID)))
	}
	if err != nil {
		if isUniqueViolation(err) {
			return MetadataEntry{}, fmt.Errorf("%w: 名称已存在", ErrInvalid)
		}
		return MetadataEntry{}, err
	}
	if entry.RoomID != 0 {
		_ = db.QueryRowContext(ctx, "SELECT name FROM rooms WHERE id=$1", entry.RoomID).Scan(&entry.RoomName)
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
