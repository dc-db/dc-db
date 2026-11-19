package cmdb

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"unicode/utf8"
)

// ServiceFields describes a catalogue entry. Services are a flat reference
// list: name, category, default port and a note. They are not tied to assets
// yet, on purpose.
type ServiceFields struct {
	Name        string `json:"name"`
	Category    string `json:"category"`
	DefaultPort int    `json:"defaultPort"`
	Description string `json:"description"`
}

type Service struct {
	ServiceFields
	ID      int64 `json:"id"`
	Builtin bool  `json:"builtin"`
}

const serviceColumns = "id,name,category,default_port,description,builtin"

func readService(row scanner) (Service, error) {
	var service Service
	err := row.Scan(&service.ID, &service.Name, &service.Category, &service.DefaultPort,
		&service.Description, &service.Builtin)
	return service, err
}

func normalizeServiceFields(fields *ServiceFields) error {
	fields.Name = strings.TrimSpace(fields.Name)
	fields.Category = strings.TrimSpace(fields.Category)
	fields.Description = strings.TrimSpace(fields.Description)
	if fields.Name == "" || utf8.RuneCountInString(fields.Name) > 120 {
		return fmt.Errorf("%w: 服务名称须为 1–120 个字符", ErrInvalid)
	}
	if utf8.RuneCountInString(fields.Category) > 40 {
		return fmt.Errorf("%w: 服务分类不能超过 40 个字符", ErrInvalid)
	}
	if fields.DefaultPort < 0 || fields.DefaultPort > 65535 {
		return fmt.Errorf("%w: 默认端口须在 0–65535 之间", ErrInvalid)
	}
	if utf8.RuneCountInString(fields.Description) > 200 {
		return fmt.Errorf("%w: 服务说明不能超过 200 个字符", ErrInvalid)
	}
	return nil
}

func ListServices(ctx context.Context, db *sql.DB) ([]Service, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT `+serviceColumns+` FROM services
		ORDER BY lower(coalesce(nullif(category, ''), '')), lower(name), id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	services := make([]Service, 0)
	for rows.Next() {
		service, err := readService(rows)
		if err != nil {
			return nil, err
		}
		services = append(services, service)
	}
	return services, rows.Err()
}

func SaveService(ctx context.Context, db *sql.DB, id int64, fields ServiceFields) (Service, error) {
	if err := normalizeServiceFields(&fields); err != nil {
		return Service{}, err
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return Service{}, err
	}
	defer tx.Rollback()

	var service Service
	if id == 0 {
		service, err = readService(tx.QueryRowContext(ctx, `
			INSERT INTO services (name,category,default_port,description)
			VALUES ($1,$2,$3,$4) RETURNING `+serviceColumns,
			fields.Name, fields.Category, fields.DefaultPort, fields.Description))
	} else {
		service, err = readService(tx.QueryRowContext(ctx, `
			UPDATE services SET name=$2, category=$3, default_port=$4, description=$5
			WHERE id=$1 RETURNING `+serviceColumns,
			id, fields.Name, fields.Category, fields.DefaultPort, fields.Description))
	}
	if err != nil {
		if isUniqueViolation(err) {
			return Service{}, fmt.Errorf("%w: 服务名称已存在", ErrInvalid)
		}
		return Service{}, err
	}
	if err := tx.Commit(); err != nil {
		return Service{}, err
	}
	return service, nil
}

func DeleteService(ctx context.Context, db *sql.DB, id int64) error {
	result, err := db.ExecContext(ctx, "DELETE FROM services WHERE id=$1", id)
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
