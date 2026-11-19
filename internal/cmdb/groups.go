package cmdb

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"unicode/utf8"
)

// GroupFields is the editable part of an asset group. Groups are the flat
// "project" dimension of the CMDB: one level, no nesting, no permissions.
type GroupFields struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

type Group struct {
	GroupFields
	ID         int64 `json:"id"`
	AssetCount int64 `json:"assetCount"`
}

const groupColumns = "id,name,description"

func readGroup(row scanner) (Group, error) {
	var group Group
	err := row.Scan(&group.ID, &group.Name, &group.Description)
	return group, err
}

func normalizeGroupFields(fields *GroupFields) error {
	fields.Name = strings.TrimSpace(fields.Name)
	fields.Description = strings.TrimSpace(fields.Description)
	if fields.Name == "" || utf8.RuneCountInString(fields.Name) > 80 {
		return fmt.Errorf("%w: 群组名称须为 1–80 个字符", ErrInvalid)
	}
	if utf8.RuneCountInString(fields.Description) > 200 {
		return fmt.Errorf("%w: 群组说明不能超过 200 个字符", ErrInvalid)
	}
	return nil
}

func ListGroups(ctx context.Context, db *sql.DB) ([]Group, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT g.id, g.name, g.description, count(a.id)
		FROM asset_groups g LEFT JOIN assets a ON a.group_id = g.id
		GROUP BY g.id
		ORDER BY lower(g.name), g.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	groups := make([]Group, 0)
	for rows.Next() {
		var group Group
		if err := rows.Scan(&group.ID, &group.Name, &group.Description, &group.AssetCount); err != nil {
			return nil, err
		}
		groups = append(groups, group)
	}
	return groups, rows.Err()
}

func SaveGroup(ctx context.Context, db *sql.DB, id int64, fields GroupFields) (Group, error) {
	if err := normalizeGroupFields(&fields); err != nil {
		return Group{}, err
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return Group{}, err
	}
	defer tx.Rollback()

	var group Group
	if id == 0 {
		group, err = readGroup(tx.QueryRowContext(ctx, `
			INSERT INTO asset_groups (name,description) VALUES ($1,$2)
			RETURNING `+groupColumns, fields.Name, fields.Description))
	} else {
		group, err = readGroup(tx.QueryRowContext(ctx, `
			UPDATE asset_groups SET name=$2, description=$3 WHERE id=$1
			RETURNING `+groupColumns, id, fields.Name, fields.Description))
	}
	if err != nil {
		if isUniqueViolation(err) {
			return Group{}, fmt.Errorf("%w: 群组名称已存在", ErrInvalid)
		}
		return Group{}, err
	}
	if err := tx.Commit(); err != nil {
		return Group{}, err
	}
	return group, nil
}

func DeleteGroup(ctx context.Context, db *sql.DB, id int64) error {
	result, err := db.ExecContext(ctx, "DELETE FROM asset_groups WHERE id=$1", id)
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
