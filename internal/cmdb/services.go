package cmdb

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
	"strings"
	"unicode/utf8"
)

// ServiceFields describes a catalogue entry. Services are linked to assets via
// asset_services so operators can trace a service down through VMs, hosts,
// racks, and data centers.
type ServiceFields struct {
	Name        string `json:"name"`
	Category    string `json:"category"`
	DefaultPort int    `json:"defaultPort"`
	Description string `json:"description"`
}

type Service struct {
	ServiceFields
	ID         int64   `json:"id"`
	Builtin    bool    `json:"builtin"`
	AssetCount int64   `json:"assetCount"`
	AssetIDs   []int64 `json:"assetIds"`
}

const serviceColumns = "id,name,category,default_port,description,builtin"

func readService(row scanner) (Service, error) {
	var service Service
	err := row.Scan(&service.ID, &service.Name, &service.Category, &service.DefaultPort,
		&service.Description, &service.Builtin)
	service.AssetIDs = make([]int64, 0)
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

func serviceAssetIDs(ctx context.Context, q queryer, serviceID int64) ([]int64, error) {
	rows, err := q.QueryContext(ctx, `
		SELECT a.id FROM asset_services s
		JOIN assets a ON a.id = s.asset_id
		WHERE s.service_id = $1
		ORDER BY lower(a.name), a.id`, serviceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := make([]int64, 0)
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func serviceAssetNames(ctx context.Context, q queryer, serviceID int64) ([]string, error) {
	rows, err := q.QueryContext(ctx, `
		SELECT a.name FROM asset_services s
		JOIN assets a ON a.id = s.asset_id
		WHERE s.service_id = $1
		ORDER BY lower(a.name), a.id`, serviceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	names := make([]string, 0)
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		names = append(names, name)
	}
	return names, rows.Err()
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
	indexByID := make(map[int64]int)
	for rows.Next() {
		service, err := readService(rows)
		if err != nil {
			return nil, err
		}
		indexByID[service.ID] = len(services)
		services = append(services, service)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	linkRows, err := db.QueryContext(ctx, `
		SELECT s.service_id, s.asset_id
		FROM asset_services s
		JOIN assets a ON a.id = s.asset_id
		ORDER BY s.service_id, lower(a.name), a.id`)
	if err != nil {
		return nil, err
	}
	defer linkRows.Close()
	for linkRows.Next() {
		var serviceID, assetID int64
		if err := linkRows.Scan(&serviceID, &assetID); err != nil {
			return nil, err
		}
		if idx, ok := indexByID[serviceID]; ok {
			services[idx].AssetIDs = append(services[idx].AssetIDs, assetID)
			services[idx].AssetCount = int64(len(services[idx].AssetIDs))
		}
	}
	return services, linkRows.Err()
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
	if id != 0 {
		assetIDs, err := serviceAssetIDs(ctx, tx, service.ID)
		if err != nil {
			return Service{}, err
		}
		service.AssetIDs = assetIDs
		service.AssetCount = int64(len(assetIDs))
	}
	if err := tx.Commit(); err != nil {
		return Service{}, err
	}
	return service, nil
}

func SetServiceAssets(ctx context.Context, db *sql.DB, serviceID int64, assetIDs []int64, actor string) (Service, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return Service{}, err
	}
	defer tx.Rollback()

	service, err := readService(tx.QueryRowContext(ctx, "SELECT "+serviceColumns+" FROM services WHERE id=$1 FOR UPDATE", serviceID))
	if err != nil {
		return Service{}, err
	}
	beforeNames, err := serviceAssetNames(ctx, tx, serviceID)
	if err != nil {
		return Service{}, err
	}

	seen := make(map[int64]bool, len(assetIDs))
	ids := make([]int64, 0, len(assetIDs))
	for _, id := range assetIDs {
		if id < 1 {
			return Service{}, fmt.Errorf("%w: 资产编号无效", ErrInvalid)
		}
		if !seen[id] {
			seen[id] = true
			ids = append(ids, id)
		}
	}
	if len(ids) > 0 {
		inList := placeholders(1, len(ids))
		args := make([]any, len(ids))
		for i, id := range ids {
			args[i] = id
		}
		var valid int
		if err := tx.QueryRowContext(ctx,
			"SELECT count(*) FROM assets WHERE id IN ("+inList+")", args...).Scan(&valid); err != nil {
			return Service{}, err
		}
		if valid != len(ids) {
			return Service{}, fmt.Errorf("%w: 部分资产不存在", ErrInvalid)
		}
	}

	if _, err := tx.ExecContext(ctx, "DELETE FROM asset_services WHERE service_id=$1", serviceID); err != nil {
		return Service{}, err
	}
	for _, id := range ids {
		if _, err := tx.ExecContext(ctx,
			"INSERT INTO asset_services (asset_id,service_id) VALUES ($1,$2)", id, serviceID); err != nil {
			return Service{}, err
		}
	}

	afterIDs, err := serviceAssetIDs(ctx, tx, serviceID)
	if err != nil {
		return Service{}, err
	}
	afterNames, err := serviceAssetNames(ctx, tx, serviceID)
	if err != nil {
		return Service{}, err
	}
	if strings.Join(beforeNames, "\x00") != strings.Join(afterNames, "\x00") {
		if err := writeNamedChange(ctx, tx, nil, service.Name, actor, "service_assets", beforeNames, afterNames); err != nil {
			return Service{}, err
		}
	}

	if err := tx.Commit(); err != nil {
		return Service{}, err
	}
	service.AssetIDs = afterIDs
	service.AssetCount = int64(len(afterIDs))
	return service, nil
}

// SetAssetServices replaces only this asset's service links in one transaction.
func SetAssetServices(ctx context.Context, db *sql.DB, assetID int64, serviceIDs []int64, actor string) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var name, kind string
	if err := tx.QueryRowContext(ctx, "SELECT name, kind FROM assets WHERE id=$1 FOR NO KEY UPDATE", assetID).Scan(&name, &kind); err != nil {
		return err
	}
	if kind != "host" && kind != "vm" {
		return fmt.Errorf("%w: 仅服务器和虚拟机支持此操作", ErrInvalid)
	}
	seen := make(map[int64]bool, len(serviceIDs))
	for _, id := range serviceIDs {
		if id < 1 {
			return fmt.Errorf("%w: 服务编号无效", ErrInvalid)
		}
		seen[id] = true
	}
	// Lock services in a stable order, including currently linked services, so
	// service-centric edits cannot overwrite an in-flight asset-centric edit.
	if serviceIDs == nil {
		serviceIDs = []int64{}
	}
	rows, err := tx.QueryContext(ctx, `SELECT id, name FROM services WHERE id IN
		(SELECT service_id FROM asset_services WHERE asset_id=$1) OR id IN
		(SELECT unnest($2::bigint[])) ORDER BY id FOR UPDATE`, assetID, serviceIDs)
	if err != nil {
		return err
	}
	names := make(map[int64]string)
	for rows.Next() {
		var id int64
		var serviceName string
		if err := rows.Scan(&id, &serviceName); err != nil {
			rows.Close()
			return err
		}
		names[id] = serviceName
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()
	for id := range seen {
		if _, ok := names[id]; !ok {
			return fmt.Errorf("%w: 部分服务不存在", ErrInvalid)
		}
	}
	linked, err := tx.QueryContext(ctx, "SELECT service_id FROM asset_services WHERE asset_id=$1 ORDER BY service_id", assetID)
	if err != nil {
		return err
	}
	var before []string
	for linked.Next() {
		var id int64
		if err := linked.Scan(&id); err != nil {
			linked.Close()
			return err
		}
		before = append(before, names[id])
	}
	if err := linked.Err(); err != nil {
		linked.Close()
		return err
	}
	linked.Close()
	if _, err := tx.ExecContext(ctx, "DELETE FROM asset_services WHERE asset_id=$1", assetID); err != nil {
		return err
	}
	ids := make([]int64, 0, len(seen))
	for id := range seen {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	after := make([]string, 0, len(ids))
	for _, id := range ids {
		if _, err := tx.ExecContext(ctx, "INSERT INTO asset_services (asset_id,service_id) VALUES ($1,$2)", assetID, id); err != nil {
			return err
		}
		after = append(after, names[id])
	}
	if strings.Join(before, "\x00") != strings.Join(after, "\x00") {
		if err := writeNamedChange(ctx, tx, &assetID, name, actor, "service_assets", before, after); err != nil {
			return err
		}
	}
	return tx.Commit()
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
