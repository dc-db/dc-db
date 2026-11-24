package cmdb

import (
	"context"
	"database/sql"
	"fmt"
	"reflect"
	"strings"
	"unicode/utf8"
)

type ServiceInstance struct {
	Name    string `json:"name"`
	Port    int    `json:"port"`
	Version string `json:"version"`
	Notes   string `json:"notes"`
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
		e.Version = strings.TrimSpace(e.Version)
		e.Notes = strings.TrimSpace(e.Notes)
		if e.Name == "" || utf8.RuneCountInString(e.Name) > 120 || e.Port < 0 || e.Port > 65535 || utf8.RuneCountInString(e.Version) > 100 || utf8.RuneCountInString(e.Notes) > 500 {
			return fmt.Errorf("%w: 服务名称、端口、版本或备注无效", ErrInvalid)
		}
	}
	return nil
}
func replaceAssetServices(ctx context.Context, tx *sql.Tx, assetID int64, entries *[]ServiceInstance, actor, name string) (bool, error) {
	if entries == nil {
		return false, nil
	}
	rows, err := tx.QueryContext(ctx, "SELECT name,port,version,notes FROM asset_service_instances WHERE asset_id=$1 ORDER BY id", assetID)
	if err != nil {
		return false, err
	}
	before := []ServiceInstance{}
	for rows.Next() {
		var e ServiceInstance
		if err := rows.Scan(&e.Name, &e.Port, &e.Version, &e.Notes); err != nil {
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
		if _, err := tx.ExecContext(ctx, "INSERT INTO asset_service_instances (asset_id,name,port,version,notes) VALUES ($1,$2,$3,$4,$5)", assetID, e.Name, e.Port, e.Version, e.Notes); err != nil {
			return false, err
		}
	}
	return true, writeNamedChange(ctx, tx, &assetID, name, actor, "asset_services", before, *entries)
}
