package cmdb

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"strings"
	"unicode/utf8"
)

const (
	maxSubnetImportBytes = 2 << 20
	maxSubnetImportRows  = 500
)

// subnetImportHeaders maps the accepted CSV headers to SubnetFields names.
var subnetImportHeaders = map[string]string{
	"网段名称": "name", "名称": "name", "name": "name",
	"cidr": "cidr", "网段": "cidr", "子网": "cidr",
	"网关": "gateway", "gateway": "gateway",
	"vlan": "vlan",
	"状态":   "status", "status": "status",
	"用途": "role", "角色": "role", "role": "role",
	"备注": "notes", "notes": "notes",
}

var subnetImportStatus = map[string]string{
	"启用": "active", "预留": "reserved", "停用": "deprecated", "dhcp": "dhcp", "slaac": "slaac",
}

// ImportSubnets creates subnets from a CSV file. Every row is validated before
// the transaction commits, so a single bad row leaves the database untouched.
func ImportSubnets(ctx context.Context, db *sql.DB, source io.Reader, actor string) (int, error) {
	data, err := io.ReadAll(io.LimitReader(source, maxSubnetImportBytes+1))
	if err != nil {
		return 0, fmt.Errorf("%w: 读取 CSV 失败", ErrInvalid)
	}
	if len(data) > maxSubnetImportBytes {
		return 0, fmt.Errorf("%w: CSV 文件不能超过 2 MiB", ErrInvalid)
	}
	if !utf8.Valid(data) {
		return 0, fmt.Errorf("%w: CSV 须为 UTF-8 编码，Excel 请选择「CSV UTF-8」", ErrInvalid)
	}
	data = bytes.TrimPrefix(data, []byte{0xEF, 0xBB, 0xBF})

	reader := csv.NewReader(bytes.NewReader(data))
	reader.FieldsPerRecord = -1
	header, err := reader.Read()
	if errors.Is(err, io.EOF) {
		return 0, fmt.Errorf("%w: CSV 文件为空", ErrInvalid)
	}
	if err != nil {
		return 0, fmt.Errorf("%w: 无法读取 CSV 表头", ErrInvalid)
	}
	columns := make(map[string]int, len(header))
	for index, name := range header {
		key, ok := subnetImportHeaders[strings.ToLower(strings.TrimSpace(name))]
		if !ok {
			continue
		}
		if _, exists := columns[key]; exists {
			return 0, fmt.Errorf("%w: CSV 表头重复：%s", ErrInvalid, strings.TrimSpace(name))
		}
		columns[key] = index
	}
	if _, ok := columns["name"]; !ok {
		return 0, fmt.Errorf("%w: CSV 缺少「网段名称」列", ErrInvalid)
	}
	if _, ok := columns["cidr"]; !ok {
		return 0, fmt.Errorf("%w: CSV 缺少「CIDR」列", ErrInvalid)
	}

	records, err := reader.ReadAll()
	if err != nil {
		return 0, fmt.Errorf("%w: 解析 CSV 失败", ErrInvalid)
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	existing := make(map[string]bool)
	rows, err := tx.QueryContext(ctx, "SELECT lower(name) FROM subnets")
	if err != nil {
		return 0, err
	}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			rows.Close()
			return 0, err
		}
		existing[name] = true
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return 0, err
	}
	rows.Close()

	imported := 0
	for index, record := range records {
		rowNumber := index + 2
		if importRecordEmpty(record) {
			continue
		}
		fields := SubnetFields{Status: "active"}
		read := func(key string) string {
			position, ok := columns[key]
			if !ok || position >= len(record) {
				return ""
			}
			return strings.TrimSpace(record[position])
		}
		fields.Name = read("name")
		fields.CIDR = read("cidr")
		fields.Gateway = read("gateway")
		fields.VLAN = read("vlan")
		fields.Role = read("role")
		fields.Notes = read("notes")
		if raw := read("status"); raw != "" {
			status, ok := subnetImportStatus[raw]
			if !ok {
				status = raw
			}
			fields.Status = status
		}

		prefix, err := normalizeSubnetFields(&fields)
		if err != nil {
			return 0, fmt.Errorf("%w: 第 %d 行：%s", ErrInvalid, rowNumber, importReason(err))
		}
		key := strings.ToLower(fields.Name)
		if existing[key] {
			return 0, fmt.Errorf("%w: 第 %d 行：网段名称「%s」已存在", ErrInvalid, rowNumber, fields.Name)
		}
		existing[key] = true
		if err := checkSubnetOverlap(ctx, tx, 0, prefix); err != nil {
			return 0, fmt.Errorf("%w: 第 %d 行：%s", ErrInvalid, rowNumber, importReason(err))
		}
		vlan, err := canonicalVLAN(ctx, tx, fields.VLAN)
		if err != nil {
			return 0, fmt.Errorf("%w: 第 %d 行：%s", ErrInvalid, rowNumber, importReason(err))
		}
		fields.VLAN = vlan

		var id int64
		if err := tx.QueryRowContext(ctx, `
			INSERT INTO subnets (name,cidr,gateway,vlan,notes,status,role)
			VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
			fields.Name, fields.CIDR, fields.Gateway, fields.VLAN, fields.Notes,
			fields.Status, fields.Role).Scan(&id); err != nil {
			return 0, err
		}
		if err := writeNamedChange(ctx, tx, nil, fields.Name, actor, "subnet_create", nil, fields); err != nil {
			return 0, err
		}
		imported++
		if imported > maxSubnetImportRows {
			return 0, fmt.Errorf("%w: 单次最多导入 %d 行", ErrInvalid, maxSubnetImportRows)
		}
	}
	if imported == 0 {
		return 0, fmt.Errorf("%w: CSV 中没有可导入的数据", ErrInvalid)
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return imported, nil
}

func importReason(err error) string {
	message := strings.TrimPrefix(err.Error(), ErrInvalid.Error())
	message = strings.TrimPrefix(message, ": ")
	message = strings.TrimPrefix(message, "：")
	return strings.TrimSpace(message)
}
