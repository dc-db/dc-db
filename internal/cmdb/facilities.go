package cmdb

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"
)

type RegionFields struct {
	Name string `json:"name"`
}

type Region struct {
	RegionFields
	ID      int64 `json:"id"`
	Version int   `json:"version"`
}

type RoomFields struct {
	Name     string `json:"name"`
	RegionID int64  `json:"regionId"`
}

type Room struct {
	RoomFields
	ID      int64 `json:"id"`
	Version int   `json:"version"`
}

type RackFields struct {
	Name    string `json:"name"`
	Zone    string `json:"zone"`
	HeightU int    `json:"heightU"`
}

type Rack struct {
	RackFields
	ID      int64 `json:"id"`
	RoomID  int64 `json:"roomId"`
	Version int   `json:"version"`
}

type PlacementFields struct {
	RackID int64  `json:"rackId"`
	StartU int    `json:"startU"`
	Units  int    `json:"units"`
	Face   string `json:"face"`
	Depth  string `json:"depth"`
}

type RackPlacement struct {
	PlacementFields
	AssetID int64 `json:"assetId"`
	Version int   `json:"version"`
}

type Facilities struct {
	Regions    []Region        `json:"regions"`
	Rooms      []Room          `json:"rooms"`
	Racks      []Rack          `json:"racks"`
	Placements []RackPlacement `json:"placements"`
}

const regionColumns = "id,name,version"
const roomColumns = "id,name,COALESCE(region_id,0),version"
const rackColumns = "id,room_id,name,zone,height_u,version"
const placementColumns = "asset_id,rack_id,start_u,units,face,depth,version"

func readRegion(row scanner) (Region, error) {
	var region Region
	err := row.Scan(&region.ID, &region.Name, &region.Version)
	return region, err
}

func readRoom(row scanner) (Room, error) {
	var room Room
	err := row.Scan(&room.ID, &room.Name, &room.RegionID, &room.Version)
	return room, err
}

func readRack(row scanner) (Rack, error) {
	var rack Rack
	err := row.Scan(&rack.ID, &rack.RoomID, &rack.Name, &rack.Zone, &rack.HeightU, &rack.Version)
	return rack, err
}

func readPlacement(row scanner) (RackPlacement, error) {
	var placement RackPlacement
	err := row.Scan(&placement.AssetID, &placement.RackID, &placement.StartU, &placement.Units,
		&placement.Face, &placement.Depth, &placement.Version)
	return placement, err
}

func normalizePlacementFields(fields *PlacementFields) error {
	fields.Face = strings.TrimSpace(fields.Face)
	fields.Depth = strings.TrimSpace(fields.Depth)
	if fields.Face == "" {
		fields.Face = "front"
	}
	if fields.Depth == "" {
		fields.Depth = "full"
	}
	switch fields.Face {
	case "front", "rear":
	default:
		return invalidFacility("设备安装面无效")
	}
	switch fields.Depth {
	case "full", "half":
	default:
		return invalidFacility("设备安装深度无效")
	}
	return nil
}

func placementConflict(candidate, existing RackPlacement) bool {
	if candidate.AssetID == existing.AssetID {
		return false
	}
	if candidate.StartU > existing.StartU+existing.Units-1 || existing.StartU > candidate.StartU+candidate.Units-1 {
		return false
	}
	if candidate.Depth == "full" || existing.Depth == "full" {
		return true
	}
	return candidate.Face == existing.Face
}

func facilityRows[T any](ctx context.Context, tx *sql.Tx, query string, scan func(scanner) (T, error)) ([]T, error) {
	rows, err := tx.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]T, 0)
	for rows.Next() {
		item, err := scan(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func ListFacilities(ctx context.Context, db *sql.DB) (Facilities, error) {
	tx, err := db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		return Facilities{}, err
	}
	defer tx.Rollback()

	regions, err := facilityRows(ctx, tx, "SELECT "+regionColumns+" FROM regions ORDER BY lower(name), id", readRegion)
	if err != nil {
		return Facilities{}, err
	}
	rooms, err := facilityRows(ctx, tx, "SELECT "+roomColumns+" FROM rooms ORDER BY lower(name), id", readRoom)
	if err != nil {
		return Facilities{}, err
	}
	racks, err := facilityRows(ctx, tx, "SELECT "+rackColumns+" FROM racks ORDER BY room_id, lower(name), id", readRack)
	if err != nil {
		return Facilities{}, err
	}
	placements, err := facilityRows(ctx, tx, "SELECT "+placementColumns+" FROM rack_placements ORDER BY rack_id, start_u", readPlacement)
	if err != nil {
		return Facilities{}, err
	}
	return Facilities{Regions: regions, Rooms: rooms, Racks: racks, Placements: placements}, tx.Commit()
}

func facilityTx(ctx context.Context, db *sql.DB) (*sql.Tx, error) {
	// Open() configures immediate transactions, so the cross-row checks for
	// room bounds, rack capacity, and occupied U positions cannot interleave
	// with another writer.
	return db.BeginTx(ctx, nil)
}

func invalidFacility(message string) error {
	return fmt.Errorf("%w: %s", ErrInvalid, message)
}

func facilityUniqueError(err error, message string) error {
	if isUniqueViolation(err) {
		return invalidFacility(message)
	}
	return err
}

func SaveRegion(ctx context.Context, db *sql.DB, id int64, fields RegionFields, version int, actor string) (Region, error) {
	fields.Name = strings.TrimSpace(fields.Name)
	if fields.Name == "" || utf8.RuneCountInString(fields.Name) > 80 {
		return Region{}, invalidFacility("区域名称须为 1–80 个字符")
	}
	tx, err := facilityTx(ctx, db)
	if err != nil {
		return Region{}, err
	}
	defer tx.Rollback()

	var region, before Region
	if id == 0 {
		region, err = readRegion(tx.QueryRowContext(ctx, `INSERT INTO regions (name) VALUES ($1) RETURNING `+regionColumns, fields.Name))
	} else {
		before, err = readRegion(tx.QueryRowContext(ctx, "SELECT "+regionColumns+" FROM regions WHERE id=$1", id))
		if err != nil {
			return Region{}, err
		}
		if before.Version != version {
			return Region{}, ErrConflict
		}
		if before.RegionFields == fields {
			return before, tx.Commit()
		}
		region, err = readRegion(tx.QueryRowContext(ctx, `UPDATE regions SET name=$2,version=version+1
			WHERE id=$1 RETURNING `+regionColumns, id, fields.Name))
	}
	if err != nil {
		return Region{}, facilityUniqueError(err, "区域名称已存在")
	}
	if err := writeFacilityChange(ctx, tx, region.Name, actor, "region", before.ID, before.RegionFields, region.RegionFields); err != nil {
		return Region{}, err
	}
	return region, tx.Commit()
}

func DeleteRegion(ctx context.Context, db *sql.DB, id int64, version int, actor string) error {
	tx, err := facilityTx(ctx, db)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	region, err := readRegion(tx.QueryRowContext(ctx, "SELECT "+regionColumns+" FROM regions WHERE id=$1", id))
	if err != nil {
		return err
	}
	if region.Version != version {
		return ErrConflict
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM regions WHERE id=$1", id); err != nil {
		return err
	}
	if err := writeNamedChange(ctx, tx, nil, region.Name, actor, "region_delete", region.RegionFields, nil); err != nil {
		return err
	}
	return tx.Commit()
}

func SaveRoom(ctx context.Context, db *sql.DB, id int64, fields RoomFields, version int, actor string) (Room, error) {
	tx, err := facilityTx(ctx, db)
	if err != nil {
		return Room{}, err
	}
	defer tx.Rollback()

	if fields.RegionID != 0 {
		var exists bool
		if err := tx.QueryRowContext(ctx, "SELECT EXISTS (SELECT 1 FROM regions WHERE id=$1)", fields.RegionID).Scan(&exists); err != nil {
			return Room{}, err
		}
		if !exists {
			return Room{}, invalidFacility("所属区域不存在")
		}
	}

	var room, before Room
	if id == 0 {
		room, err = readRoom(tx.QueryRowContext(ctx, `INSERT INTO rooms (name,region_id)
			VALUES ($1,$2) RETURNING `+roomColumns, fields.Name, nullID(fields.RegionID)))
	} else {
		before, err = readRoom(tx.QueryRowContext(ctx, "SELECT "+roomColumns+" FROM rooms WHERE id=$1", id))
		if err != nil {
			return Room{}, err
		}
		if before.Version != version {
			return Room{}, ErrConflict
		}
		if before.RoomFields == fields {
			return before, tx.Commit()
		}
		room, err = readRoom(tx.QueryRowContext(ctx, `UPDATE rooms SET name=$2,region_id=$3,
			version=version+1 WHERE id=$1 RETURNING `+roomColumns, id, fields.Name, nullID(fields.RegionID)))
	}
	if err != nil {
		return Room{}, facilityUniqueError(err, "数据中心名称已存在")
	}
	if err := writeFacilityChange(ctx, tx, room.Name, actor, "room", before.ID, before.RoomFields, room.RoomFields); err != nil {
		return Room{}, err
	}
	return room, tx.Commit()
}

func SaveRack(ctx context.Context, db *sql.DB, id, roomID int64, fields RackFields, version int, actor string) (Rack, error) {
	tx, err := facilityTx(ctx, db)
	if err != nil {
		return Rack{}, err
	}
	defer tx.Rollback()

	var before Rack
	if id != 0 {
		before, err = readRack(tx.QueryRowContext(ctx, "SELECT "+rackColumns+" FROM racks WHERE id=$1", id))
		if err != nil {
			return Rack{}, err
		}
		if before.Version != version {
			return Rack{}, ErrConflict
		}
		if before.RackFields == fields {
			return before, tx.Commit()
		}
		roomID = before.RoomID
	}
	room, err := readRoom(tx.QueryRowContext(ctx, "SELECT "+roomColumns+" FROM rooms WHERE id=$1", roomID))
	if err != nil {
		return Rack{}, err
	}

	var rack Rack
	if id == 0 {
		rack, err = readRack(tx.QueryRowContext(ctx, `INSERT INTO racks (room_id,name,zone,height_u)
			VALUES ($1,$2,$3,$4) RETURNING `+rackColumns,
			roomID, fields.Name, fields.Zone, fields.HeightU))
	} else {
		if fields.HeightU < before.HeightU {
			var outside bool
			if err := tx.QueryRowContext(ctx, `SELECT EXISTS (
				SELECT 1 FROM rack_placements WHERE rack_id=$1 AND start_u+units-1>$2)`,
				id, fields.HeightU).Scan(&outside); err != nil {
				return Rack{}, err
			}
			if outside {
				return Rack{}, invalidFacility("缩减机柜高度前，请先移动超出范围的设备")
			}
		}
		rack, err = readRack(tx.QueryRowContext(ctx, `UPDATE racks SET name=$2,zone=$3,height_u=$4,
			version=version+1 WHERE id=$1 RETURNING `+rackColumns,
			id, fields.Name, fields.Zone, fields.HeightU))
	}
	if err != nil {
		return Rack{}, facilityUniqueError(err, "该数据中心已使用此机柜名称或布局位置")
	}
	if err := writeFacilityChange(ctx, tx, room.Name+" / "+rack.Name, actor, "rack", before.ID, before.RackFields, rack.RackFields); err != nil {
		return Rack{}, err
	}
	return rack, tx.Commit()
}

func writeFacilityChange(ctx context.Context, tx *sql.Tx, name, actor, kind string, beforeID int64, before, after any) error {
	action := kind + "_update"
	if beforeID == 0 {
		action, before = kind+"_create", nil
	}
	return writeNamedChange(ctx, tx, nil, name, actor, action, before, after)
}

func DeleteRoom(ctx context.Context, db *sql.DB, id int64, version int, actor string) error {
	tx, err := facilityTx(ctx, db)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	room, err := readRoom(tx.QueryRowContext(ctx, "SELECT "+roomColumns+" FROM rooms WHERE id=$1", id))
	if err != nil {
		return err
	}
	if room.Version != version {
		return ErrConflict
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM rooms WHERE id=$1", id); err != nil {
		return facilityDeleteError(err, "请先清空数据中心中的机柜")
	}
	if err := writeNamedChange(ctx, tx, nil, room.Name, actor, "room_delete", room.RoomFields, nil); err != nil {
		return err
	}
	return tx.Commit()
}

func DeleteRack(ctx context.Context, db *sql.DB, id int64, version int, actor string) error {
	tx, err := facilityTx(ctx, db)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	rack, err := readRack(tx.QueryRowContext(ctx, "SELECT "+rackColumns+" FROM racks WHERE id=$1", id))
	if err != nil {
		return err
	}
	if rack.Version != version {
		return ErrConflict
	}
	var roomName string
	if err := tx.QueryRowContext(ctx, "SELECT name FROM rooms WHERE id=$1", rack.RoomID).Scan(&roomName); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM racks WHERE id=$1", id); err != nil {
		return facilityDeleteError(err, "请先将该机柜中的设备下架")
	}
	if err := writeNamedChange(ctx, tx, nil, roomName+" / "+rack.Name, actor, "rack_delete", rack.RackFields, nil); err != nil {
		return err
	}
	return tx.Commit()
}

func facilityDeleteError(err error, message string) error {
	if isForeignKeyViolation(err) {
		return invalidFacility(message)
	}
	return err
}

func mountable(kind string) bool {
	return kind == "host" || kind == "switch"
}

func SavePlacement(ctx context.Context, db *sql.DB, assetID int64, newAsset *Fields, fields PlacementFields, version int, actor string) (RackPlacement, error) {
	if err := normalizePlacementFields(&fields); err != nil {
		return RackPlacement{}, err
	}
	if fields.StartU < 1 || fields.Units < 1 {
		return RackPlacement{}, invalidFacility("起始 U 位和占用 U 数须为正整数")
	}
	tx, err := facilityTx(ctx, db)
	if err != nil {
		return RackPlacement{}, err
	}
	defer tx.Rollback()
	rack, err := readRack(tx.QueryRowContext(ctx, "SELECT "+rackColumns+" FROM racks WHERE id=$1", fields.RackID))
	if err != nil {
		return RackPlacement{}, err
	}
	if fields.StartU+fields.Units-1 > rack.HeightU {
		return RackPlacement{}, invalidFacility("设备超出机柜可用 U 位")
	}

	var before RackPlacement
	var asset Asset
	if newAsset == nil {
		asset, err = readAsset(tx.QueryRowContext(ctx, "SELECT "+assetColumns+" FROM assets WHERE id=$1", assetID))
		if err != nil {
			return RackPlacement{}, err
		}
		if !mountable(asset.Kind) || asset.Lifecycle != "active" {
			return RackPlacement{}, invalidFacility("只能上架在册的物理机或交换机")
		}
		before, err = readPlacement(tx.QueryRowContext(ctx, "SELECT "+placementColumns+" FROM rack_placements WHERE asset_id=$1", assetID))
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return RackPlacement{}, err
		}
		if before.Version != version {
			return RackPlacement{}, ErrConflict
		}
		if before.PlacementFields == fields {
			return before, tx.Commit()
		}
	}

	rows, err := tx.QueryContext(ctx,
		"SELECT "+placementColumns+" FROM rack_placements WHERE rack_id=$1 AND asset_id<>$2", rack.ID, assetID)
	if err != nil {
		return RackPlacement{}, err
	}
	candidate := RackPlacement{PlacementFields: fields, AssetID: assetID}
	for rows.Next() {
		existing, err := readPlacement(rows)
		if err != nil {
			rows.Close()
			return RackPlacement{}, err
		}
		if placementConflict(candidate, existing) {
			rows.Close()
			return RackPlacement{}, invalidFacility("所选 U 位已被占用")
		}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return RackPlacement{}, err
	}
	rows.Close()
	if newAsset != nil {
		asset, err = createAsset(ctx, tx, *newAsset, actor)
		if err != nil {
			return RackPlacement{}, err
		}
	}

	nextVersion := before.Version + 1
	placement, err := readPlacement(tx.QueryRowContext(ctx, `
		INSERT INTO rack_placements (asset_id,rack_id,start_u,units,face,depth,version)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		ON CONFLICT (asset_id) DO UPDATE SET rack_id=EXCLUDED.rack_id,start_u=EXCLUDED.start_u,
			units=EXCLUDED.units,face=EXCLUDED.face,depth=EXCLUDED.depth,version=EXCLUDED.version
		RETURNING `+placementColumns,
		asset.ID, rack.ID, fields.StartU, fields.Units, fields.Face, fields.Depth, nextVersion))
	if err != nil {
		return RackPlacement{}, err
	}
	action := "mount"
	if before.Version != 0 {
		action = "relocate"
	}
	if err := writePlacementChange(ctx, tx, asset, actor, action, before, placement); err != nil {
		return RackPlacement{}, err
	}
	return placement, tx.Commit()
}

func DeletePlacement(ctx context.Context, db *sql.DB, assetID int64, version int, actor string) error {
	tx, err := facilityTx(ctx, db)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	asset, err := readAsset(tx.QueryRowContext(ctx, "SELECT "+assetColumns+" FROM assets WHERE id=$1", assetID))
	if err != nil {
		return err
	}
	before, err := readPlacement(tx.QueryRowContext(ctx, "SELECT "+placementColumns+" FROM rack_placements WHERE asset_id=$1", assetID))
	if err != nil {
		return err
	}
	if before.Version != version {
		return ErrConflict
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM rack_placements WHERE asset_id=$1", assetID); err != nil {
		return err
	}
	if err := writePlacementChange(ctx, tx, asset, actor, "unmount", before, RackPlacement{}); err != nil {
		return err
	}
	return tx.Commit()
}

func writePlacementChange(ctx context.Context, tx *sql.Tx, asset Asset, actor, action string, before, after RackPlacement) error {
	snapshot := func(placement RackPlacement) (any, error) {
		if placement.Version == 0 {
			return nil, nil
		}
		var roomName, rackName string
		err := tx.QueryRowContext(ctx, "SELECT rooms.name,racks.name FROM racks JOIN rooms ON rooms.id=racks.room_id WHERE racks.id=$1",
			placement.RackID).Scan(&roomName, &rackName)
		return map[string]any{
			"roomName": roomName, "rackName": rackName, "startU": placement.StartU, "units": placement.Units,
			"face": placement.Face, "depth": placement.Depth,
		}, err
	}
	old, err := snapshot(before)
	if err != nil {
		return err
	}
	next, err := snapshot(after)
	if err != nil {
		return err
	}
	return writeChange(ctx, tx, asset, actor, action, old, next)
}
