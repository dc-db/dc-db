package cmdb

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"unicode/utf8"
)

type DirectoryFields struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

func (f *DirectoryFields) normalize() error {
	f.Name = strings.TrimSpace(f.Name)
	f.Description = strings.TrimSpace(f.Description)
	if n := utf8.RuneCountInString(f.Name); n == 0 || n > 80 {
		return fmt.Errorf("%w: 名称须为 1–80 个字符", ErrInvalid)
	}
	if utf8.RuneCountInString(f.Description) > 200 {
		return fmt.Errorf("%w: 备注不能超过 200 个字符", ErrInvalid)
	}
	return nil
}

type PersonFields struct {
	DirectoryFields
	// Nil leaves an existing association intact. An empty string clears it.
	Username *string `json:"username,omitempty"`
}

type Person struct {
	PersonFields
	ID         int64 `json:"id"`
	AssetCount int64 `json:"assetCount"`
}

func ListPeople(ctx context.Context, db *sql.DB, includeAccounts bool) ([]Person, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT p.id, p.name, p.description, CASE WHEN $1 THEN p.username END,
		       (SELECT count(*) FROM assets WHERE person_id=p.id)
		FROM people p ORDER BY lower(p.name), p.id`, includeAccounts)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	people := make([]Person, 0)
	for rows.Next() {
		var person Person
		if err := rows.Scan(&person.ID, &person.Name, &person.Description, &person.Username, &person.AssetCount); err != nil {
			return nil, err
		}
		people = append(people, person)
	}
	return people, rows.Err()
}

func SavePerson(ctx context.Context, db *sql.DB, id int64, fields PersonFields) (int64, error) {
	if err := fields.normalize(); err != nil {
		return 0, err
	}
	var err error
	if id == 0 {
		err = db.QueryRowContext(ctx, `
			INSERT INTO people (name, description, username) VALUES ($1,$2,NULLIF($3,''))
			RETURNING id`, fields.Name, fields.Description, fields.Username).Scan(&id)
	} else {
		err = db.QueryRowContext(ctx, `
			UPDATE people SET name=$2, description=$3,
				username=CASE WHEN $4::text IS NULL THEN username ELSE NULLIF($4,'') END
			WHERE id=$1 RETURNING id`, id, fields.Name, fields.Description, fields.Username).Scan(&id)
	}
	if isUniqueViolation(err) {
		return 0, fmt.Errorf("%w: 人员名称已存在或账号已关联其他人员", ErrInvalid)
	}
	if isForeignKeyViolation(err) {
		return 0, fmt.Errorf("%w: 所选账号不存在", ErrInvalid)
	}
	return id, err
}

type TeamFields struct {
	DirectoryFields
	MemberIDs []int64 `json:"memberIds"`
}

type Team struct {
	TeamFields
	ID         int64 `json:"id"`
	AssetCount int64 `json:"assetCount"`
}

func ListTeams(ctx context.Context, db *sql.DB) ([]Team, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT t.id, t.name, t.description,
		       COALESCE((SELECT json_agg(person_id ORDER BY person_id) FROM team_members WHERE team_id=t.id), '[]'),
		       (SELECT count(*) FROM assets WHERE team_id=t.id)
		FROM teams t ORDER BY lower(t.name), t.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	teams := make([]Team, 0)
	for rows.Next() {
		var team Team
		var members []byte
		if err := rows.Scan(&team.ID, &team.Name, &team.Description, &members, &team.AssetCount); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(members, &team.MemberIDs); err != nil {
			return nil, err
		}
		teams = append(teams, team)
	}
	return teams, rows.Err()
}

func SaveTeam(ctx context.Context, db *sql.DB, id int64, fields TeamFields) (int64, error) {
	if err := fields.normalize(); err != nil {
		return 0, err
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	if id == 0 {
		err = tx.QueryRowContext(ctx, "INSERT INTO teams (name, description) VALUES ($1,$2) RETURNING id",
			fields.Name, fields.Description).Scan(&id)
	} else {
		err = tx.QueryRowContext(ctx, "UPDATE teams SET name=$2, description=$3 WHERE id=$1 RETURNING id",
			id, fields.Name, fields.Description).Scan(&id)
	}
	if isUniqueViolation(err) {
		return 0, fmt.Errorf("%w: 团队名称已存在", ErrInvalid)
	}
	if err != nil {
		return 0, err
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM team_members WHERE team_id=$1", id); err != nil {
		return 0, err
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO team_members (team_id, person_id)
		SELECT DISTINCT $1::bigint, member FROM unnest($2::bigint[]) AS members(member)`, id, fields.MemberIDs)
	if isForeignKeyViolation(err) {
		return 0, fmt.Errorf("%w: 所选成员不存在，请刷新后重试", ErrInvalid)
	}
	if err != nil {
		return 0, err
	}
	return id, tx.Commit()
}

func deleteDirectoryEntry(ctx context.Context, db *sql.DB, query string, id int64) error {
	result, err := db.ExecContext(ctx, query, id)
	if isForeignKeyViolation(err) {
		return fmt.Errorf("%w: 仍有关联资产，请先调整资产归属", ErrInvalid)
	}
	if err != nil {
		return err
	}
	n, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}
