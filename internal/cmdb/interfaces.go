package cmdb

import (
	"context"
	"database/sql"
	"errors"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

var (
	interfaceMediums  = map[string]bool{"copper": true, "fiber": true, "virtual": true}
	interfaceStatuses = map[string]bool{"up": true, "down": true, "disabled": true}
	macPattern        = regexp.MustCompile(`^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$`)
)

type InterfaceFields struct {
	Name        string `json:"name"`
	Medium      string `json:"medium"`
	SpeedMbps   int    `json:"speedMbps"`
	MAC         string `json:"mac"`
	Status      string `json:"status"`
	Description string `json:"description"`
}

type Interface struct {
	InterfaceFields
	ID            int64     `json:"id"`
	AssetID       int64     `json:"assetId"`
	Version       int       `json:"version"`
	UpdatedAt     time.Time `json:"updatedAt"`
	PeerID        int64     `json:"peerId,omitempty"`
	PeerAssetID   int64     `json:"peerAssetId,omitempty"`
	PeerAssetName string    `json:"peerAssetName,omitempty"`
	PeerName      string    `json:"peerName,omitempty"`
}

const interfaceColumns = `i.id, i.asset_id, i.name, i.medium, i.speed_mbps, i.mac, i.status, i.description,
	i.version, i.updated_at, COALESCE(i.peer_id, 0), COALESCE(p.asset_id, 0),
	COALESCE(pa.name, ''), COALESCE(p.name, '')`

const interfaceFrom = `interfaces i
	LEFT JOIN interfaces p ON p.id = i.peer_id
	LEFT JOIN assets pa ON pa.id = p.asset_id`

func readInterface(row scanner) (Interface, error) {
	var item Interface
	err := row.Scan(&item.ID, &item.AssetID, &item.Name, &item.Medium, &item.SpeedMbps, &item.MAC,
		&item.Status, &item.Description, &item.Version, &item.UpdatedAt,
		&item.PeerID, &item.PeerAssetID, &item.PeerAssetName, &item.PeerName)
	return item, err
}

func ListInterfaces(ctx context.Context, db *sql.DB, assetID int64) ([]Interface, error) {
	rows, err := db.QueryContext(ctx,
		"SELECT "+interfaceColumns+" FROM "+interfaceFrom+" WHERE i.asset_id=$1 ORDER BY lower(i.name), i.id", assetID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]Interface, 0)
	for rows.Next() {
		item, err := readInterface(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func normalizeInterfaceFields(fields *InterfaceFields) error {
	fields.Name = strings.TrimSpace(fields.Name)
	if fields.Name == "" || utf8.RuneCountInString(fields.Name) > 64 {
		return invalidFacility("接口名称须为 1–64 个字符")
	}
	fields.Medium = strings.TrimSpace(fields.Medium)
	if fields.Medium == "" {
		fields.Medium = "copper"
	}
	if !interfaceMediums[fields.Medium] {
		return invalidFacility("接口介质无效")
	}
	if fields.SpeedMbps < 0 || fields.SpeedMbps > 1600000 {
		return invalidFacility("接口速率超出范围")
	}
	fields.MAC = strings.ToLower(strings.TrimSpace(fields.MAC))
	if fields.MAC != "" {
		if !macPattern.MatchString(fields.MAC) {
			return invalidFacility("MAC 地址格式不正确")
		}
		fields.MAC = strings.ReplaceAll(fields.MAC, "-", ":")
	}
	fields.Status = strings.TrimSpace(fields.Status)
	if fields.Status == "" {
		fields.Status = "up"
	}
	if !interfaceStatuses[fields.Status] {
		return invalidFacility("接口状态无效")
	}
	fields.Description = strings.TrimSpace(fields.Description)
	if utf8.RuneCountInString(fields.Description) > 200 {
		return invalidFacility("接口描述不能超过 200 个字符")
	}
	return nil
}

func SaveInterface(ctx context.Context, db *sql.DB, assetID, id int64, fields InterfaceFields, version int, actor string) (Interface, error) {
	if err := normalizeInterfaceFields(&fields); err != nil {
		return Interface{}, err
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return Interface{}, err
	}
	defer tx.Rollback()

	var assetName string
	if err := tx.QueryRowContext(ctx, "SELECT name FROM assets WHERE id=$1", assetID).Scan(&assetName); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Interface{}, invalidFacility("资产不存在")
		}
		return Interface{}, err
	}

	action := "interface_update"
	var before any
	if id == 0 {
		action = "interface_create"
		var newID int64
		err = tx.QueryRowContext(ctx, `
			INSERT INTO interfaces (asset_id,name,medium,speed_mbps,mac,status,description)
			VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
			assetID, fields.Name, fields.Medium, fields.SpeedMbps, fields.MAC, fields.Status, fields.Description).Scan(&newID)
		if err != nil {
			return Interface{}, facilityUniqueError(err, "该资产下已存在同名接口")
		}
		id = newID
	} else {
		existing, readErr := readInterface(tx.QueryRowContext(ctx,
			"SELECT "+interfaceColumns+" FROM "+interfaceFrom+" WHERE i.id=$1", id))
		if errors.Is(readErr, sql.ErrNoRows) {
			return Interface{}, invalidFacility("接口不存在")
		}
		if readErr != nil {
			return Interface{}, readErr
		}
		if existing.AssetID != assetID {
			return Interface{}, invalidFacility("接口不属于该资产")
		}
		if existing.Version != version {
			return Interface{}, ErrConflict
		}
		before = existing.InterfaceFields
		_, err = tx.ExecContext(ctx, `
			UPDATE interfaces SET name=$2,medium=$3,speed_mbps=$4,mac=$5,status=$6,description=$7,
				version=version+1,updated_at=now() WHERE id=$1`,
			id, fields.Name, fields.Medium, fields.SpeedMbps, fields.MAC, fields.Status, fields.Description)
		if err != nil {
			return Interface{}, facilityUniqueError(err, "该资产下已存在同名接口")
		}
	}
	if err := writeNamedChange(ctx, tx, assetID, assetName, actor, action, before, fields); err != nil {
		return Interface{}, err
	}
	item, err := readInterface(tx.QueryRowContext(ctx,
		"SELECT "+interfaceColumns+" FROM "+interfaceFrom+" WHERE i.id=$1", id))
	if err != nil {
		return Interface{}, err
	}
	if err := tx.Commit(); err != nil {
		return Interface{}, err
	}
	return item, nil
}

func DeleteInterface(ctx context.Context, db *sql.DB, assetID, id int64, actor string) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	item, err := readInterface(tx.QueryRowContext(ctx,
		"SELECT "+interfaceColumns+" FROM "+interfaceFrom+" WHERE i.id=$1", id))
	if errors.Is(err, sql.ErrNoRows) {
		return invalidFacility("接口不存在")
	}
	if err != nil {
		return err
	}
	if item.AssetID != assetID {
		return invalidFacility("接口不属于该资产")
	}
	var assetName string
	if err := tx.QueryRowContext(ctx, "SELECT name FROM assets WHERE id=$1", assetID).Scan(&assetName); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM interfaces WHERE id=$1", id); err != nil {
		return err
	}
	if err := writeNamedChange(ctx, tx, assetID, assetName, actor, "interface_delete", item.InterfaceFields, nil); err != nil {
		return err
	}
	return tx.Commit()
}

func ConnectInterface(ctx context.Context, db *sql.DB, id, peerID int64, actor string) error {
	if id == peerID {
		return invalidFacility("不能把接口连接到它自己")
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	local, err := readInterface(tx.QueryRowContext(ctx,
		"SELECT "+interfaceColumns+" FROM "+interfaceFrom+" WHERE i.id=$1", id))
	if errors.Is(err, sql.ErrNoRows) {
		return invalidFacility("接口不存在")
	}
	if err != nil {
		return err
	}
	peer, err := readInterface(tx.QueryRowContext(ctx,
		"SELECT "+interfaceColumns+" FROM "+interfaceFrom+" WHERE i.id=$1", peerID))
	if errors.Is(err, sql.ErrNoRows) {
		return invalidFacility("对端接口不存在")
	}
	if err != nil {
		return err
	}
	if local.PeerID != 0 || peer.PeerID != 0 {
		return invalidFacility("接口已连接其他对端，请先断开")
	}
	if local.AssetID == peer.AssetID {
		return invalidFacility("不能连接同一台设备的接口")
	}

	if _, err := tx.ExecContext(ctx,
		"UPDATE interfaces SET peer_id=$2,version=version+1,updated_at=now() WHERE id=$1", id, peerID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx,
		"UPDATE interfaces SET peer_id=$2,version=version+1,updated_at=now() WHERE id=$1", peerID, id); err != nil {
		return err
	}
	if err := writeInterfaceChange(ctx, tx, local.AssetID, actor, "interface_connect",
		map[string]any{"peerAsset": peer.PeerAssetName, "peerInterface": peer.PeerName}); err != nil {
		return err
	}
	if err := writeInterfaceChange(ctx, tx, peer.AssetID, actor, "interface_connect",
		map[string]any{"peerAsset": local.PeerAssetName, "peerInterface": local.PeerName}); err != nil {
		return err
	}
	return tx.Commit()
}

func DisconnectInterface(ctx context.Context, db *sql.DB, id int64, actor string) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	local, err := readInterface(tx.QueryRowContext(ctx,
		"SELECT "+interfaceColumns+" FROM "+interfaceFrom+" WHERE i.id=$1", id))
	if errors.Is(err, sql.ErrNoRows) {
		return invalidFacility("接口不存在")
	}
	if err != nil {
		return err
	}
	if local.PeerID == 0 {
		return invalidFacility("该接口尚未连接")
	}
	if _, err := tx.ExecContext(ctx,
		"UPDATE interfaces SET peer_id=NULL,version=version+1,updated_at=now() WHERE id IN ($1,$2)", id, local.PeerID); err != nil {
		return err
	}
	if err := writeInterfaceChange(ctx, tx, local.AssetID, actor, "interface_disconnect",
		map[string]any{"peerAsset": local.PeerAssetName, "peerInterface": local.PeerName}); err != nil {
		return err
	}
	return tx.Commit()
}

func writeInterfaceChange(ctx context.Context, tx *sql.Tx, assetID int64, actor, action string, after any) error {
	var name string
	if err := tx.QueryRowContext(ctx, "SELECT name FROM assets WHERE id=$1", assetID).Scan(&name); err != nil {
		return err
	}
	return writeNamedChange(ctx, tx, assetID, name, actor, action, nil, after)
}
