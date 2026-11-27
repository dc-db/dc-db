package cmdb

import (
	"context"
	"database/sql"
	"fmt"
	"reflect"
	"strings"
	"time"
	"unicode/utf8"
)

type ServiceInstance struct {
	Name string `json:"name"`
}

type ServiceRef struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
	Kind string `json:"kind,omitempty"`
}

type ServiceEntry struct {
	ID           int64        `json:"id"`
	Name         string       `json:"name"`
	Category     string       `json:"category"`
	Builtin      bool         `json:"builtin"`
	Port         *int         `json:"port,omitempty"`
	Description  string       `json:"description"`
	Assets       []ServiceRef `json:"assets"`
	AssetCount   int          `json:"assetCount"`
	Projects     []ServiceRef `json:"projects"`
	ProjectCount int          `json:"projectCount"`
	CreatedAt    time.Time    `json:"createdAt"`
	UpdatedAt    time.Time    `json:"updatedAt"`
}

type ServiceInput struct {
	Name        string   `json:"name"`
	Category    string   `json:"category"`
	Builtin     bool     `json:"builtin"`
	Port        *int     `json:"port"`
	Description string   `json:"description"`
	AssetIDs    *[]int64 `json:"assetIds"`
	ProjectIDs  *[]int64 `json:"projectIds"`
}

type serviceQuerier interface {
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

const serviceColumns = "id, name, category, builtin, port, description, created_at, updated_at"

func scanServiceEntry(row scanner) (ServiceEntry, error) {
	var entry ServiceEntry
	var port sql.NullInt64
	err := row.Scan(
		&entry.ID, &entry.Name, &entry.Category, &entry.Builtin,
		&port, &entry.Description, &entry.CreatedAt, &entry.UpdatedAt,
	)
	if err != nil {
		return ServiceEntry{}, err
	}
	if port.Valid {
		v := int(port.Int64)
		entry.Port = &v
	}
	entry.Assets = make([]ServiceRef, 0)
	entry.Projects = make([]ServiceRef, 0)
	return entry, nil
}

func normalizeServiceInput(input *ServiceInput) error {
	input.Name = strings.TrimSpace(input.Name)
	input.Category = strings.TrimSpace(input.Category)
	input.Description = strings.TrimSpace(input.Description)
	if input.Name == "" || utf8.RuneCountInString(input.Name) > 120 {
		return fmt.Errorf("%w: 服务名称须为 1–120 个字符", ErrInvalid)
	}
	if utf8.RuneCountInString(input.Category) > 40 {
		return fmt.Errorf("%w: 服务分类不能超过 40 个字符", ErrInvalid)
	}
	if input.Port != nil && (*input.Port < 1 || *input.Port > 65535) {
		return fmt.Errorf("%w: 端口须为 1–65535", ErrInvalid)
	}
	if utf8.RuneCountInString(input.Description) > 300 {
		return fmt.Errorf("%w: 服务说明不能超过 300 个字符", ErrInvalid)
	}
	if input.AssetIDs != nil {
		deduped, err := dedupePositiveIDs(*input.AssetIDs, "资产编号无效")
		if err != nil {
			return err
		}
		input.AssetIDs = &deduped
	}
	if input.ProjectIDs != nil {
		deduped, err := dedupePositiveIDs(*input.ProjectIDs, "项目编号无效")
		if err != nil {
			return err
		}
		input.ProjectIDs = &deduped
	}
	return nil
}

func dedupePositiveIDs(ids []int64, errMsg string) ([]int64, error) {
	result := make([]int64, 0, len(ids))
	seen := make(map[int64]bool, len(ids))
	for _, id := range ids {
		if id < 1 {
			return nil, fmt.Errorf("%w: %s", ErrInvalid, errMsg)
		}
		if !seen[id] {
			seen[id] = true
			result = append(result, id)
		}
	}
	return result, nil
}

func loadServiceEntry(ctx context.Context, q serviceQuerier, id int64) (ServiceEntry, error) {
	entry, err := scanServiceEntry(q.QueryRowContext(ctx,
		"SELECT "+serviceColumns+" FROM services WHERE id=$1", id))
	if err != nil {
		return ServiceEntry{}, err
	}

	assetRows, err := q.QueryContext(ctx, `
		SELECT DISTINCT a.id, a.name, a.kind
		FROM asset_service_instances asi
		JOIN assets a ON a.id = asi.asset_id
		WHERE lower(asi.name) = lower($1)
		ORDER BY a.name, a.id`, entry.Name)
	if err != nil {
		return ServiceEntry{}, err
	}
	for assetRows.Next() {
		var ref ServiceRef
		if err := assetRows.Scan(&ref.ID, &ref.Name, &ref.Kind); err != nil {
			assetRows.Close()
			return ServiceEntry{}, err
		}
		entry.Assets = append(entry.Assets, ref)
	}
	if err := assetRows.Err(); err != nil {
		assetRows.Close()
		return ServiceEntry{}, err
	}
	assetRows.Close()
	entry.AssetCount = len(entry.Assets)

	projectRows, err := q.QueryContext(ctx, `
		SELECT g.id, g.name
		FROM service_projects sp
		JOIN asset_groups g ON g.id = sp.group_id
		WHERE sp.service_id = $1
		ORDER BY g.name, g.id`, entry.ID)
	if err != nil {
		return ServiceEntry{}, err
	}
	for projectRows.Next() {
		var ref ServiceRef
		if err := projectRows.Scan(&ref.ID, &ref.Name); err != nil {
			projectRows.Close()
			return ServiceEntry{}, err
		}
		entry.Projects = append(entry.Projects, ref)
	}
	if err := projectRows.Err(); err != nil {
		projectRows.Close()
		return ServiceEntry{}, err
	}
	projectRows.Close()
	entry.ProjectCount = len(entry.Projects)

	return entry, nil
}

func ListServices(ctx context.Context, db *sql.DB) ([]ServiceEntry, error) {
	rows, err := db.QueryContext(ctx, "SELECT "+serviceColumns+" FROM services ORDER BY lower(name), id")
	if err != nil {
		return nil, err
	}
	entries := make([]ServiceEntry, 0)
	byID := make(map[int64]int)
	for rows.Next() {
		entry, err := scanServiceEntry(rows)
		if err != nil {
			rows.Close()
			return nil, err
		}
		byID[entry.ID] = len(entries)
		entries = append(entries, entry)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()
	if len(entries) == 0 {
		return entries, nil
	}

	assetRows, err := db.QueryContext(ctx, `
		SELECT DISTINCT s.id, a.id, a.name, a.kind
		FROM services s
		JOIN asset_service_instances asi ON lower(asi.name) = lower(s.name)
		JOIN assets a ON a.id = asi.asset_id
		ORDER BY a.name, a.id`)
	if err != nil {
		return nil, err
	}
	for assetRows.Next() {
		var serviceID int64
		var ref ServiceRef
		if err := assetRows.Scan(&serviceID, &ref.ID, &ref.Name, &ref.Kind); err != nil {
			assetRows.Close()
			return nil, err
		}
		if idx, ok := byID[serviceID]; ok {
			entries[idx].Assets = append(entries[idx].Assets, ref)
			entries[idx].AssetCount = len(entries[idx].Assets)
		}
	}
	if err := assetRows.Err(); err != nil {
		assetRows.Close()
		return nil, err
	}
	assetRows.Close()

	projectRows, err := db.QueryContext(ctx, `
		SELECT sp.service_id, g.id, g.name
		FROM service_projects sp
		JOIN asset_groups g ON g.id = sp.group_id
		ORDER BY g.name, g.id`)
	if err != nil {
		return nil, err
	}
	for projectRows.Next() {
		var serviceID int64
		var ref ServiceRef
		if err := projectRows.Scan(&serviceID, &ref.ID, &ref.Name); err != nil {
			projectRows.Close()
			return nil, err
		}
		if idx, ok := byID[serviceID]; ok {
			entries[idx].Projects = append(entries[idx].Projects, ref)
			entries[idx].ProjectCount = len(entries[idx].Projects)
		}
	}
	if err := projectRows.Err(); err != nil {
		projectRows.Close()
		return nil, err
	}
	projectRows.Close()

	return entries, nil
}

func SaveService(ctx context.Context, db *sql.DB, id int64, input ServiceInput, actor string) (ServiceEntry, error) {
	if err := normalizeServiceInput(&input); err != nil {
		return ServiceEntry{}, err
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return ServiceEntry{}, err
	}
	defer tx.Rollback()

	if input.AssetIDs != nil && len(*input.AssetIDs) > 0 {
		args := make([]any, len(*input.AssetIDs))
		for i, assetID := range *input.AssetIDs {
			args[i] = assetID
		}
		var count int
		err := tx.QueryRowContext(ctx,
			"SELECT count(*) FROM assets WHERE id IN ("+placeholders(1, len(args))+")",
			args...).Scan(&count)
		if err != nil {
			return ServiceEntry{}, err
		}
		if count != len(*input.AssetIDs) {
			return ServiceEntry{}, fmt.Errorf("%w: 所选资产不存在", ErrInvalid)
		}
	}

	if input.ProjectIDs != nil && len(*input.ProjectIDs) > 0 {
		args := make([]any, len(*input.ProjectIDs))
		for i, groupID := range *input.ProjectIDs {
			args[i] = groupID
		}
		var count int
		err := tx.QueryRowContext(ctx,
			"SELECT count(*) FROM asset_groups WHERE id IN ("+placeholders(1, len(args))+")",
			args...).Scan(&count)
		if err != nil {
			return ServiceEntry{}, err
		}
		if count != len(*input.ProjectIDs) {
			return ServiceEntry{}, fmt.Errorf("%w: 所选项目不存在", ErrInvalid)
		}
	}

	var portArg any
	if input.Port != nil {
		portArg = *input.Port
	}

	var before any
	var savedID int64
	action := "service.create"

	if id == 0 {
		err = tx.QueryRowContext(ctx, `
			INSERT INTO services (name, category, builtin, port, description)
			VALUES ($1, $2, $3, $4, $5)
			RETURNING id`,
			input.Name, input.Category, input.Builtin, portArg, input.Description,
		).Scan(&savedID)
		if err != nil {
			if isUniqueViolation(err) {
				return ServiceEntry{}, fmt.Errorf("%w: 服务名称已存在", ErrConflict)
			}
			return ServiceEntry{}, err
		}
	} else {
		action = "service.update"
		existing, err := loadServiceEntry(ctx, tx, id)
		if err != nil {
			return ServiceEntry{}, err
		}
		before = existing

		err = tx.QueryRowContext(ctx, `
			UPDATE services
			SET name=$2, category=$3, builtin=$4, port=$5, description=$6, updated_at=now()
			WHERE id=$1
			RETURNING id`,
			id, input.Name, input.Category, input.Builtin, portArg, input.Description,
		).Scan(&savedID)
		if err != nil {
			if isUniqueViolation(err) {
				return ServiceEntry{}, fmt.Errorf("%w: 服务名称已存在", ErrConflict)
			}
			return ServiceEntry{}, err
		}
		if existing.Name != input.Name {
			if _, err := tx.ExecContext(ctx,
				"UPDATE asset_service_instances SET name=$1 WHERE lower(name)=lower($2)",
				input.Name, existing.Name); err != nil {
				return ServiceEntry{}, err
			}
		}
	}

	if input.AssetIDs != nil {
		if _, err := tx.ExecContext(ctx,
			"DELETE FROM asset_service_instances WHERE lower(name)=lower($1)", input.Name); err != nil {
			return ServiceEntry{}, err
		}
		for _, assetID := range *input.AssetIDs {
			if _, err := tx.ExecContext(ctx,
				"INSERT INTO asset_service_instances (asset_id, name) VALUES ($1, $2)",
				assetID, input.Name); err != nil {
				return ServiceEntry{}, err
			}
		}
	}

	if input.ProjectIDs != nil {
		if _, err := tx.ExecContext(ctx,
			"DELETE FROM service_projects WHERE service_id=$1", savedID); err != nil {
			return ServiceEntry{}, err
		}
		for _, groupID := range *input.ProjectIDs {
			if _, err := tx.ExecContext(ctx,
				"INSERT INTO service_projects (service_id, group_id) VALUES ($1, $2)",
				savedID, groupID); err != nil {
				return ServiceEntry{}, err
			}
		}
	}

	entry, err := loadServiceEntry(ctx, tx, savedID)
	if err != nil {
		return ServiceEntry{}, err
	}
	if err := writeNamedChange(ctx, tx, nil, entry.Name, actor, action, before, entry); err != nil {
		return ServiceEntry{}, err
	}
	if err := tx.Commit(); err != nil {
		return ServiceEntry{}, err
	}
	return entry, nil
}

func DeleteService(ctx context.Context, db *sql.DB, id int64, actor string) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	existing, err := loadServiceEntry(ctx, tx, id)
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx,
		"DELETE FROM asset_service_instances WHERE lower(name)=lower($1)", existing.Name); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM services WHERE id=$1", id); err != nil {
		return err
	}
	if err := writeNamedChange(ctx, tx, nil, existing.Name, actor, "service.delete", existing, nil); err != nil {
		return err
	}
	return tx.Commit()
}

func validateServiceInstances(kind string, entries *[]ServiceInstance) error {
	if entries == nil {
		return nil
	}
	if kind != "host" && kind != "vm" && len(*entries) > 0 {
		return fmt.Errorf("%w: 只有服务器和虚拟机可以添加服务", ErrInvalid)
	}
	if len(*entries) > 100 {
		return fmt.Errorf("%w: 最多添加 100 个服务", ErrInvalid)
	}
	for i := range *entries {
		e := &(*entries)[i]
		e.Name = strings.TrimSpace(e.Name)
		if e.Name == "" || utf8.RuneCountInString(e.Name) > 120 {
			return fmt.Errorf("%w: 服务名称无效", ErrInvalid)
		}
	}
	return nil
}
func replaceAssetServices(ctx context.Context, tx *sql.Tx, assetID int64, entries *[]ServiceInstance, actor, name string) (bool, error) {
	if entries == nil {
		return false, nil
	}
	rows, err := tx.QueryContext(ctx, "SELECT name FROM asset_service_instances WHERE asset_id=$1 ORDER BY id", assetID)
	if err != nil {
		return false, err
	}
	before := []ServiceInstance{}
	for rows.Next() {
		var e ServiceInstance
		if err := rows.Scan(&e.Name); err != nil {
			rows.Close()
			return false, err
		}
		before = append(before, e)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return false, err
	}
	rows.Close()
	if reflect.DeepEqual(before, *entries) {
		return false, nil
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM asset_service_instances WHERE asset_id=$1", assetID); err != nil {
		return false, err
	}
	for _, e := range *entries {
		if _, err := tx.ExecContext(ctx, "INSERT INTO asset_service_instances (asset_id,name) VALUES ($1,$2)", assetID, e.Name); err != nil {
			return false, err
		}
	}
	return true, writeNamedChange(ctx, tx, &assetID, name, actor, "asset_services", before, *entries)
}
