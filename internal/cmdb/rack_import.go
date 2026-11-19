package cmdb

import (
	"context"
	"database/sql"
	"encoding/csv"
	"fmt"
	"io"
	"strconv"
	"strings"
)

// RackCSVImportResult reports what a rack import did.
type RackCSVImportResult struct {
	Created int              `json:"created"`
	Errors  []ImportRowError `json:"errors"`
}

const maxRackImportRows = 500

// rackHeader maps the accepted column names to a field.
func rackHeader(name string) string {
	value := strings.TrimSpace(strings.TrimPrefix(name, "\ufeff"))
	switch strings.ToLower(value) {
	case "机柜编号", "名称", "编号", "name":
		return "name"
	case "区域/排", "区域", "排", "zone":
		return "zone"
	case "高度（u）", "高度(u)", "高度", "heightu", "height":
		return "height"
	}
	return ""
}

// ImportRacks creates racks for a room from a CSV file. Every row is validated
// before anything is written, so a bad row leaves the room untouched.
func ImportRacks(ctx context.Context, db *sql.DB, roomID int64, source io.Reader, actor string) (RackCSVImportResult, error) {
	result := RackCSVImportResult{Errors: make([]ImportRowError, 0)}
	reader := csv.NewReader(source)
	reader.FieldsPerRecord = -1
	reader.TrimLeadingSpace = true

	header, err := reader.Read()
	if err != nil {
		return result, invalidFacility("CSV 文件为空或无法读取")
	}
	index := map[string]int{}
	for position, column := range header {
		if field := rackHeader(column); field != "" {
			index[field] = position
		}
	}
	if _, ok := index["name"]; !ok {
		return result, invalidFacility("CSV 缺少「机柜编号」列")
	}

	type row struct {
		line   int
		name   string
		zone   string
		height int
	}
	rows := make([]row, 0, 32)
	seen := map[string]bool{}
	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return result, invalidFacility("CSV 解析失败：" + err.Error())
		}
		line := len(rows) + 2
		name := ""
		if position, ok := index["name"]; ok && position < len(record) {
			name = strings.TrimSpace(record[position])
		}
		if name == "" && len(record) == 0 {
			continue
		}
		if name == "" {
			result.Errors = append(result.Errors, ImportRowError{Row: line, Message: "机柜编号不能为空"})
			continue
		}
		if len([]rune(name)) > 80 {
			result.Errors = append(result.Errors, ImportRowError{Row: line, Message: "机柜编号不能超过 80 个字符"})
			continue
		}
		key := strings.ToLower(name)
		if seen[key] {
			result.Errors = append(result.Errors, ImportRowError{Row: line, Message: "文件内机柜编号重复：" + name})
			continue
		}
		seen[key] = true

		zone := ""
		if position, ok := index["zone"]; ok && position < len(record) {
			zone = strings.TrimSpace(record[position])
		}
		if len([]rune(zone)) > 40 {
			result.Errors = append(result.Errors, ImportRowError{Row: line, Message: "区域 / 排不能超过 40 个字符"})
			continue
		}

		height := 42
		if position, ok := index["height"]; ok && position < len(record) {
			value := strings.TrimSpace(record[position])
			if value != "" {
				parsed, err := strconv.Atoi(strings.TrimSuffix(strings.TrimSuffix(value, "U"), "u"))
				if err != nil || parsed < 1 || parsed > 80 {
					result.Errors = append(result.Errors, ImportRowError{Row: line, Message: "高度须为 1–80U 的整数"})
					continue
				}
				height = parsed
			}
		}
		rows = append(rows, row{line: line, name: name, zone: zone, height: height})
		if len(rows) > maxRackImportRows {
			return result, invalidFacility(fmt.Sprintf("单次最多导入 %d 个机柜", maxRackImportRows))
		}
	}
	if len(result.Errors) > 0 {
		return result, nil
	}
	if len(rows) == 0 {
		return result, invalidFacility("CSV 中没有可导入的机柜")
	}

	existing, err := ListFacilities(ctx, db)
	if err != nil {
		return result, err
	}
	names := map[string]bool{}
	for _, rack := range existing.Racks {
		if rack.RoomID == roomID {
			names[strings.ToLower(rack.Name)] = true
		}
	}
	for _, item := range rows {
		if names[strings.ToLower(item.name)] {
			result.Errors = append(result.Errors, ImportRowError{Row: item.line, Message: "该数据中心已有同名机柜：" + item.name})
		}
	}
	if len(result.Errors) > 0 {
		return result, nil
	}

	for _, item := range rows {
		if _, err := SaveRack(ctx, db, 0, roomID, RackFields{Name: item.name, Zone: item.zone, HeightU: item.height}, 0, actor); err != nil {
			result.Errors = append(result.Errors, ImportRowError{Row: item.line, Message: err.Error()})
			continue
		}
		result.Created++
	}
	return result, nil
}
