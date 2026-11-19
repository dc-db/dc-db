package cmdb

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"io"
	"strings"
	"testing"
)

func TestRackElevationXLSX(t *testing.T) {
	rack := Rack{ID: 7, RoomID: 1, RackFields: RackFields{Name: "SH-S01", Zone: "S 区", HeightU: 42}}
	room := Room{ID: 1, RoomFields: RoomFields{Name: "上海数据中心"}}
	placements := []RackPlacement{
		{PlacementFields: PlacementFields{RackID: 7, StartU: 1, Units: 2, Face: "front", Depth: "full"}, AssetID: 1},
		{PlacementFields: PlacementFields{RackID: 7, StartU: 5, Units: 1, Face: "front", Depth: "full"}, AssetID: 2},
		{PlacementFields: PlacementFields{RackID: 7, StartU: 9, Units: 3, Face: "rear", Depth: "half"}, AssetID: 3},
	}
	assets := map[int64]Asset{
		1: {ID: 1, Fields: Fields{Name: "demo-host-01", Status: "online"}},
		2: {ID: 2, Fields: Fields{Name: "demo-host-02", Status: "offline"}},
		3: {ID: 3, Fields: Fields{Name: "demo-rear-01", Status: "unknown"}},
	}

	file := RackElevationXLSX(rack, room, placements, assets, "front")
	if len(file) < 1000 {
		t.Fatalf("workbook too small: %d bytes", len(file))
	}

	reader, err := zip.NewReader(bytes.NewReader(file), int64(len(file)))
	if err != nil {
		t.Fatalf("not a valid zip: %v", err)
	}
	entries := map[string]string{}
	for _, entry := range reader.File {
		handle, err := entry.Open()
		if err != nil {
			t.Fatalf("open %s: %v", entry.Name, err)
		}
		body, err := io.ReadAll(handle)
		handle.Close()
		if err != nil {
			t.Fatalf("read %s: %v", entry.Name, err)
		}
		entries[entry.Name] = string(body)
	}
	for _, name := range []string{"[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/styles.xml", "xl/worksheets/sheet1.xml"} {
		if _, ok := entries[name]; !ok {
			t.Fatalf("missing part %s", name)
		}
	}
	for name, body := range entries {
		if strings.HasSuffix(name, ".xml") || strings.HasSuffix(name, ".rels") {
			if err := xml.Unmarshal([]byte(body), new(interface{})); err != nil {
				t.Fatalf("%s is not valid xml: %v", name, err)
			}
		}
	}

	sheet := entries["xl/worksheets/sheet1.xml"]
	for _, want := range []string{"SH-S01", "上海数据中心", "前视图", "demo-host-01", "demo-host-02", `r="A44"`} {
		if !strings.Contains(sheet, want) {
			t.Fatalf("sheet missing %q", want)
		}
	}
	if strings.Contains(sheet, "demo-rear-01") {
		t.Fatal("rear-only device leaked into the front sheet")
	}
	if !strings.Contains(sheet, `<c r="B43" s="4"`) {
		t.Fatal("online device should use the green style")
	}
	if !strings.Contains(sheet, `<mergeCell ref="B43:B44"/>`) {
		t.Fatal("two-unit device was not merged")
	}

	rearSheet := sheetOf(t, RackElevationXLSX(rack, room, placements, assets, "rear"))
	if !strings.Contains(rearSheet, "demo-rear-01") {
		t.Fatal("rear-only device missing from the rear sheet")
	}
	if !strings.Contains(rearSheet, "demo-host-01") {
		t.Fatal("full-depth device should also appear on the rear sheet")
	}
}

func sheetOf(t *testing.T, file []byte) string {
	t.Helper()
	reader, err := zip.NewReader(bytes.NewReader(file), int64(len(file)))
	if err != nil {
		t.Fatalf("not a valid zip: %v", err)
	}
	for _, entry := range reader.File {
		if entry.Name != "xl/worksheets/sheet1.xml" {
			continue
		}
		handle, err := entry.Open()
		if err != nil {
			t.Fatalf("open sheet: %v", err)
		}
		body, err := io.ReadAll(handle)
		handle.Close()
		if err != nil {
			t.Fatalf("read sheet: %v", err)
		}
		return string(body)
	}
	t.Fatal("sheet part missing")
	return ""
}
