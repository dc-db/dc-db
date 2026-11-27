package cmdb

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"
)

var ErrConflict = errors.New("记录已被更新，请刷新后重试")

type DiskSpec struct {
	Type    string `json:"type"`           // "", "nvme", "ssd", "hdd"
	SizeGiB int    `json:"sizeGiB"`        // 1..1048576
	Count   int    `json:"count"`          // 1..256 (default 1)
	Note    string `json:"note,omitempty"` // <= 40 runes
}

const (
	maxDiskEntries = 32
	maxDiskSizeGiB = 1048576
	maxDiskCount   = 256
	maxDiskNoteLen = 40
)

type Fields struct {
	Services     *[]AssetServiceInstance `json:"services,omitempty"`
	Kind         string                  `json:"kind"`
	Name         string                  `json:"name"`
	Brand        string                  `json:"brand"`
	Model        string                  `json:"model"`
	Platform     string                  `json:"platform"`
	Status       string                  `json:"status"`
	Lifecycle    string                  `json:"lifecycle"`
	Owner        string                  `json:"owner"`
	Environment  string                  `json:"environment"`
	Address      string                  `json:"address"`
	ProbeEnabled bool                    `json:"probeEnabled"`
	CPU          int                     `json:"cpu"`
	MemoryMiB    int64                   `json:"memoryMiB"`
	Disks        []DiskSpec              `json:"disks"`
	TeamID       int64                   `json:"teamId"`
	PersonID     int64                   `json:"personId"`
	GroupID      int64                   `json:"groupId"`
	Notes        string                  `json:"notes"`
	RoomID       int64                   `json:"roomId"`
}

type Asset struct {
	Fields
	ID             int64           `json:"id"`
	Version        int             `json:"version"`
	CreatedAt      *time.Time      `json:"createdAt"`
	UpdatedAt      time.Time       `json:"updatedAt"`
	ProbeStatus    string          `json:"probeStatus"`
	ProbeCheckedAt *time.Time      `json:"probeCheckedAt"`
	SourceKey      string          `json:"sourceKey,omitempty"`
	ExternalKey    string          `json:"externalKey,omitempty"`
	LastSeenAt     *time.Time      `json:"lastSeenAt,omitempty"`
	MissingCount   int             `json:"missingCount"`
	Observed       json.RawMessage `json:"observed"`
}

type Link struct {
	ID        int64  `json:"id"`
	Kind      string `json:"kind"`
	FromID    int64  `json:"fromId"`
	FromName  string `json:"fromName"`
	ToID      int64  `json:"toId"`
	ToName    string `json:"toName"`
	SourceKey string `json:"sourceKey,omitempty"`
}

type Change struct {
	ID        int64           `json:"id"`
	AssetID   int64           `json:"assetId"`
	AssetName string          `json:"assetName"`
	Actor     string          `json:"actor"`
	Action    string          `json:"action"`
	Before    json.RawMessage `json:"before"`
	After     json.RawMessage `json:"after"`
	CreatedAt time.Time       `json:"createdAt"`
}

// The text owner is retained for CSV imports and older entries that have no directory record.
const assetOwnerSQL = "COALESCE((SELECT p.name FROM people p WHERE p.id=assets.person_id), assets.owner)"

const assetColumns = `id, kind, name, brand, model, platform, status, lifecycle, ` + assetOwnerSQL + `, environment, address, cpu,
	memory_mib, disks, notes, COALESCE(room_id, 0), version, created_at, updated_at, COALESCE(source_key, ''),
	COALESCE(external_key, ''), last_seen_at, missing_count, observed, COALESCE(group_id, 0),
	probe_enabled, probe_status, probe_checked_at, COALESCE(team_id,0), COALESCE(person_id,0)`

type scanner interface{ Scan(...any) error }

func readAsset(row scanner) (Asset, error) {
	var a Asset
	var disksRaw string
	var observed string
	err := row.Scan(&a.ID, &a.Kind, &a.Name, &a.Brand, &a.Model, &a.Platform, &a.Status, &a.Lifecycle, &a.Owner,
		&a.Environment, &a.Address, &a.CPU, &a.MemoryMiB, &disksRaw, &a.Notes, &a.RoomID,
		&a.Version, &a.CreatedAt, &a.UpdatedAt, &a.SourceKey, &a.ExternalKey, &a.LastSeenAt, &a.MissingCount, &observed,
		&a.GroupID, &a.ProbeEnabled, &a.ProbeStatus, &a.ProbeCheckedAt, &a.TeamID, &a.PersonID)
	if err != nil {
		return a, err
	}
	a.Disks = parseStoredDisks(disksRaw)
	a.Observed = json.RawMessage(observed)
	return a, nil
}

func ListAssets(ctx context.Context, db *sql.DB) ([]Asset, error) {
	rows, err := db.QueryContext(ctx, "SELECT "+assetColumns+" FROM assets ORDER BY lower(name), id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	assets := make([]Asset, 0)
	indices := make(map[int64]int)
	for rows.Next() {
		asset, err := readAsset(rows)
		if err != nil {
			return nil, err
		}
		indices[asset.ID] = len(assets)
		assets = append(assets, asset)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	serviceRows, err := db.QueryContext(ctx, `
		SELECT asi.asset_id, asi.id, asi.service_id, s.name, s.category
		FROM asset_service_instances asi
		JOIN services s ON s.id = asi.service_id
		ORDER BY asi.asset_id, asi.id`)
	if err != nil {
		return nil, err
	}
	defer serviceRows.Close()
	for serviceRows.Next() {
		var assetID int64
		var item AssetServiceInstance
		if err := serviceRows.Scan(&assetID, &item.ID, &item.ServiceID, &item.Name, &item.Category); err != nil {
			return nil, err
		}
		if index, ok := indices[assetID]; ok {
			if assets[index].Services == nil {
				empty := []AssetServiceInstance{}
				assets[index].Services = &empty
			}
			*assets[index].Services = append(*assets[index].Services, item)
		}
	}
	return assets, serviceRows.Err()
}

func ListLinks(ctx context.Context, db *sql.DB, assetID int64) ([]Link, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT l.id, l.kind, a.id, a.name, b.id, b.name, COALESCE(l.source_key, '')
		FROM asset_links l JOIN assets a ON a.id=l.from_id JOIN assets b ON b.id=l.to_id
		WHERE $1=0 OR a.id=$1 OR b.id=$1 ORDER BY l.kind, a.name, b.name, l.id`, assetID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	links := make([]Link, 0)
	for rows.Next() {
		var link Link
		if err := rows.Scan(&link.ID, &link.Kind, &link.FromID, &link.FromName,
			&link.ToID, &link.ToName, &link.SourceKey); err != nil {
			return nil, err
		}
		links = append(links, link)
	}
	return links, rows.Err()
}

func ListChanges(ctx context.Context, db *sql.DB, assetID int64) ([]Change, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT id, COALESCE(asset_id, 0), asset_name, actor, action,
			COALESCE(before_data, 'null'), COALESCE(after_data, 'null'), created_at
		FROM changes WHERE $1=0 OR asset_id=$1 ORDER BY id DESC LIMIT 100`, assetID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	changes := make([]Change, 0)
	for rows.Next() {
		var change Change
		var before, after string
		if err := rows.Scan(&change.ID, &change.AssetID, &change.AssetName, &change.Actor,
			&change.Action, &before, &after, &change.CreatedAt); err != nil {
			return nil, err
		}
		change.Before = json.RawMessage(before)
		change.After = json.RawMessage(after)
		changes = append(changes, change)
	}
	return changes, rows.Err()
}

func normalizeAndValidateBrandModel(fields *Fields) error {
	fields.Brand = strings.TrimSpace(fields.Brand)
	fields.Model = strings.TrimSpace(fields.Model)
	if utf8.RuneCountInString(fields.Brand) > 80 {
		return fmt.Errorf("%w: 品牌不能超过 80 个字符", ErrInvalid)
	}
	if utf8.RuneCountInString(fields.Model) > 120 {
		return fmt.Errorf("%w: 型号不能超过 120 个字符", ErrInvalid)
	}
	return nil
}

func normalizeAndValidateDisks(disks []DiskSpec) ([]DiskSpec, error) {
	if len(disks) > maxDiskEntries {
		return nil, fmt.Errorf("%w: 硬盘条目不能超过 32 组", ErrInvalid)
	}
	normalized := make([]DiskSpec, 0, len(disks))
	for _, d := range disks {
		diskType := strings.ToLower(strings.TrimSpace(d.Type))
		switch diskType {
		case "", "nvme", "ssd", "hdd":
		default:
			return nil, fmt.Errorf("%w: 硬盘类型无效，可用 NVMe、SSD、HDD 或留空", ErrInvalid)
		}
		if d.SizeGiB < 1 || d.SizeGiB > maxDiskSizeGiB {
			return nil, fmt.Errorf("%w: 硬盘容量需在 1 至 1048576 GiB 之间", ErrInvalid)
		}
		count := d.Count
		if count == 0 {
			count = 1
		}
		if count < 1 || count > maxDiskCount {
			return nil, fmt.Errorf("%w: 硬盘块数需在 1 至 256 之间", ErrInvalid)
		}
		note := strings.TrimSpace(d.Note)
		if utf8.RuneCountInString(note) > maxDiskNoteLen {
			return nil, fmt.Errorf("%w: 硬盘备注不能超过 40 个字符", ErrInvalid)
		}
		normalized = append(normalized, DiskSpec{
			Type:    diskType,
			SizeGiB: d.SizeGiB,
			Count:   count,
			Note:    note,
		})
	}
	return normalized, nil
}

func marshalDisks(disks []DiskSpec) (string, error) {
	if len(disks) == 0 {
		return "[]", nil
	}
	encoded, err := json.Marshal(disks)
	if err != nil {
		return "", err
	}
	return string(encoded), nil
}

func parseStoredDisks(raw string) []DiskSpec {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "null" {
		return []DiskSpec{}
	}
	var disks []DiskSpec
	if err := json.Unmarshal([]byte(raw), &disks); err != nil || disks == nil {
		return []DiskSpec{}
	}
	for i := range disks {
		if disks[i].Count == 0 {
			disks[i].Count = 1
		}
	}
	return disks
}

func SaveAsset(ctx context.Context, db *sql.DB, id int64, version int, fields Fields, actor string) (Asset, error) {
	if err := normalizeAndValidateBrandModel(&fields); err != nil {
		return Asset{}, err
	}
	disks, err := normalizeAndValidateDisks(fields.Disks)
	if err != nil {
		return Asset{}, err
	}
	fields.Disks = disks
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return Asset{}, err
	}
	defer tx.Rollback()

	if fields.RoomID != 0 {
		var exists bool
		if err := tx.QueryRowContext(ctx, "SELECT EXISTS (SELECT 1 FROM rooms WHERE id=$1)", fields.RoomID).Scan(&exists); err != nil {
			return Asset{}, err
		}
		if !exists {
			return Asset{}, fmt.Errorf("%w: 所选数据中心不存在", ErrInvalid)
		}
	}
	requestedServices := fields.Services
	fields.Services = nil
	if err := validateServiceInstances(fields.Kind, requestedServices); err != nil {
		return Asset{}, err
	}
	if id == 0 {
		asset, err := createAsset(ctx, tx, fields, actor)
		if err != nil {
			return Asset{}, err
		}
		if _, err := replaceAssetServices(ctx, tx, asset.ID, requestedServices, actor, asset.Name); err != nil {
			return Asset{}, err
		}
		if requestedServices != nil {
			asset.Services = assetServicesPtr(*requestedServices)
		}
		return asset, tx.Commit()
	}

	before, err := readAsset(tx.QueryRowContext(ctx, "SELECT "+assetColumns+" FROM assets WHERE id=$1 FOR UPDATE", id))
	if err != nil {
		return Asset{}, err
	}
	if version != before.Version {
		return Asset{}, ErrConflict
	}
	if fields.Kind != before.Kind {
		return Asset{}, ErrConflict
	}
	if err := resolveAssetPerson(ctx, tx, &fields); err != nil {
		return Asset{}, err
	}
	if equalFields(fields, before.Fields) {
		changed, err := replaceAssetServices(ctx, tx, id, requestedServices, actor, before.Name)
		if err != nil {
			return Asset{}, err
		}
		if changed {
			if err := tx.QueryRowContext(ctx, "UPDATE assets SET version=version+1, updated_at=now() WHERE id=$1 RETURNING version, updated_at", id).Scan(&before.Version, &before.UpdatedAt); err != nil {
				return Asset{}, err
			}
		}
		if requestedServices != nil {
			before.Services = assetServicesPtr(*requestedServices)
		} else {
			currentServices, err := listAssetServices(ctx, tx, id)
			if err != nil {
				return Asset{}, err
			}
			before.Services = assetServicesPtr(currentServices)
		}
		return before, tx.Commit()
	}

	disksJSON, err := marshalDisks(fields.Disks)
	if err != nil {
		return Asset{}, err
	}
	asset, err := readAsset(tx.QueryRowContext(ctx, `
		UPDATE assets SET name=$2, brand=$18, model=$19, platform=$3, status=$4, lifecycle=$5, owner=CASE WHEN $17::bigint=0 THEN $6 ELSE '' END, environment=$7,
			address=$8, cpu=$9, memory_mib=$10, disks=$20, notes=$11, room_id=NULLIF($12,0),
			group_id=NULLIF($13,0), version=version+1, updated_at=$14,
			probe_status=CASE WHEN address IS DISTINCT FROM $8 OR probe_enabled IS DISTINCT FROM $15 OR lifecycle IS DISTINCT FROM $5 THEN 'unknown' ELSE probe_status END,
			probe_checked_at=CASE WHEN address IS DISTINCT FROM $8 OR probe_enabled IS DISTINCT FROM $15 OR lifecycle IS DISTINCT FROM $5 THEN NULL ELSE probe_checked_at END,
			probe_enabled=$15, team_id=NULLIF($16,0), person_id=NULLIF($17,0)
		WHERE id=$1 RETURNING `+assetColumns, id, fields.Name, fields.Platform, fields.Status,
		fields.Lifecycle, fields.Owner, fields.Environment, fields.Address, fields.CPU, fields.MemoryMiB,
		fields.Notes, fields.RoomID, fields.GroupID, nowText(), fields.ProbeEnabled, fields.TeamID, fields.PersonID,
		fields.Brand, fields.Model, disksJSON))
	if err != nil {
		return Asset{}, assetAssignmentError(err)
	}
	if err := writeChange(ctx, tx, asset, actor, "update", before.Fields, asset.Fields); err != nil {
		return Asset{}, err
	}
	if _, err := replaceAssetServices(ctx, tx, id, requestedServices, actor, asset.Name); err != nil {
		return Asset{}, err
	}
	if requestedServices != nil {
		asset.Services = assetServicesPtr(*requestedServices)
	} else {
		currentServices, err := listAssetServices(ctx, tx, id)
		if err != nil {
			return Asset{}, err
		}
		asset.Services = assetServicesPtr(currentServices)
	}
	return asset, tx.Commit()
}

// Matching a legacy or imported owner by name upgrades it to a directory link.
func resolveAssetPerson(ctx context.Context, tx *sql.Tx, fields *Fields) error {
	if fields.PersonID != 0 {
		err := tx.QueryRowContext(ctx, "SELECT name FROM people WHERE id=$1", fields.PersonID).Scan(&fields.Owner)
		if errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("%w: 所选负责人不存在", ErrInvalid)
		}
		return err
	}
	if fields.Owner == "" {
		return nil
	}
	err := tx.QueryRowContext(ctx, "SELECT id, name FROM people WHERE lower(name)=lower($1)", fields.Owner).
		Scan(&fields.PersonID, &fields.Owner)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	return err
}

func createAsset(ctx context.Context, tx *sql.Tx, fields Fields, actor string) (Asset, error) {
	if err := normalizeAndValidateBrandModel(&fields); err != nil {
		return Asset{}, err
	}
	disks, err := normalizeAndValidateDisks(fields.Disks)
	if err != nil {
		return Asset{}, err
	}
	fields.Disks = disks
	if err := resolveAssetPerson(ctx, tx, &fields); err != nil {
		return Asset{}, err
	}
	disksJSON, err := marshalDisks(fields.Disks)
	if err != nil {
		return Asset{}, err
	}
	asset, err := readAsset(tx.QueryRowContext(ctx, `
		INSERT INTO assets (kind, name, platform, status, lifecycle, owner, environment, address,
			cpu, memory_mib, disks, notes, room_id, group_id, updated_at, probe_enabled, team_id, person_id, brand, model)
		VALUES ($1,$2,$3,$4,$5,CASE WHEN $17::bigint=0 THEN $6 ELSE '' END,$7,$8,$9,$10,$20,$11,NULLIF($12,0),NULLIF($13,0),$14,$15,NULLIF($16,0),NULLIF($17,0),$18,$19) RETURNING `+assetColumns,
		fields.Kind, fields.Name, fields.Platform, fields.Status, fields.Lifecycle, fields.Owner,
		fields.Environment, fields.Address, fields.CPU, fields.MemoryMiB, fields.Notes,
		fields.RoomID, fields.GroupID, nowText(), fields.ProbeEnabled, fields.TeamID, fields.PersonID,
		fields.Brand, fields.Model, disksJSON))
	if err != nil {
		return Asset{}, assetAssignmentError(err)
	}
	return asset, writeChange(ctx, tx, asset, actor, "create", nil, asset.Fields)
}

func assetAssignmentError(err error) error {
	if isForeignKeyViolation(err) {
		return fmt.Errorf("%w: 所选项目、团队、负责人或数据中心已不存在", ErrInvalid)
	}
	return err
}

func equalFields(a, b Fields) bool {
	aJSON, err := json.Marshal(a)
	if err != nil {
		return false
	}
	bJSON, err := json.Marshal(b)
	if err != nil {
		return false
	}
	var left, right any
	leftDecoder := json.NewDecoder(strings.NewReader(string(aJSON)))
	rightDecoder := json.NewDecoder(strings.NewReader(string(bJSON)))
	leftDecoder.UseNumber()
	rightDecoder.UseNumber()
	if leftDecoder.Decode(&left) != nil || rightDecoder.Decode(&right) != nil {
		return false
	}
	normalizedLeft, _ := json.Marshal(left)
	normalizedRight, _ := json.Marshal(right)
	return string(normalizedLeft) == string(normalizedRight)
}

func ChangeLink(ctx context.Context, db *sql.DB, link Link, remove bool, actor string) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if remove {
		err := tx.QueryRowContext(ctx, `
			DELETE FROM asset_links WHERE id=$1 AND source_key IS NULL
			RETURNING from_id, to_id, kind`, link.ID).Scan(&link.FromID, &link.ToID, &link.Kind)
		if err != nil {
			return err
		}
	}
	from, err := readAsset(tx.QueryRowContext(ctx, "SELECT "+assetColumns+" FROM assets WHERE id=$1", link.FromID))
	if err != nil {
		return err
	}
	to, err := readAsset(tx.QueryRowContext(ctx, "SELECT "+assetColumns+" FROM assets WHERE id=$1", link.ToID))
	if err != nil {
		return err
	}
	link.FromName, link.ToName = from.Name, to.Name
	if remove {
		if err := writeChange(ctx, tx, from, actor, "unlink", link, nil); err != nil {
			return err
		}
		if err := writeChange(ctx, tx, to, actor, "unlink", link, nil); err != nil {
			return err
		}
		return tx.Commit()
	}
	if !ValidLink(link.Kind, from.Kind, to.Kind) {
		return fmt.Errorf("%w: 所选资源类型与关系不匹配", ErrInvalid)
	}
	err = tx.QueryRowContext(ctx, `
		INSERT INTO asset_links (from_id,to_id,kind) VALUES ($1,$2,$3) RETURNING id`,
		link.FromID, link.ToID, link.Kind).Scan(&link.ID)
	if err != nil {
		if isUniqueViolation(err) {
			return fmt.Errorf("%w: 此关系已存在，或目标已关联到另一上级资源", ErrInvalid)
		}
		return err
	}
	if err := writeChange(ctx, tx, from, actor, "link", nil, link); err != nil {
		return err
	}
	if err := writeChange(ctx, tx, to, actor, "link", nil, link); err != nil {
		return err
	}
	return tx.Commit()
}

func ValidLink(kind, from, to string) bool {
	switch kind {
	case "hosts":
		return from == "host" && to == "vm"
	default:
		return false
	}
}

func writeChange(ctx context.Context, tx *sql.Tx, asset Asset, actor, action string, before, after any) error {
	return writeNamedChange(ctx, tx, asset.ID, asset.Name, actor, action, before, after)
}

func writeNamedChange(ctx context.Context, tx *sql.Tx, assetID any, name, actor, action string, before, after any) error {
	oldData, err := json.Marshal(before)
	if err != nil {
		return err
	}
	newData, err := json.Marshal(after)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO changes (asset_id, asset_name, actor, action, before_data, after_data)
		VALUES ($1,$2,$3,$4,$5,$6)`, assetID, name, actor, action, string(oldData), string(newData))
	return err
}
