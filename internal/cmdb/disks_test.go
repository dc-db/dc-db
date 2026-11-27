package cmdb

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestNormalizeAndValidateDisks(t *testing.T) {
	// Empty and nil always produce a non-nil slice that marshals to [].
	for name, input := range map[string][]DiskSpec{
		"nil":   nil,
		"empty": {},
	} {
		got, err := normalizeAndValidateDisks(input)
		if err != nil {
			t.Fatalf("%s: unexpected error: %v", name, err)
		}
		if got == nil || len(got) != 0 {
			t.Fatalf("%s: got %#v, want non-nil empty slice", name, got)
		}
		encoded, err := json.Marshal(Asset{Fields: Fields{Disks: got}})
		if err != nil {
			t.Fatalf("%s: marshal asset: %v", name, err)
		}
		if !strings.Contains(string(encoded), `"disks":[]`) {
			t.Fatalf("%s: marshaled asset = %s, want \"disks\":[]", name, string(encoded))
		}
	}

	// Valid multi-disk normalization: case, whitespace, default count=1, note trimming.
	validIn := []DiskSpec{
		{Type: "  NVMe ", SizeGiB: 480, Count: 2, Note: " 系统盘 "},
		{Type: "SSD", SizeGiB: 1024, Count: 0, Note: ""},
		{Type: " hdd\t", SizeGiB: 4096, Count: 4, Note: strings.Repeat("盘", 40)},
		{Type: " ", SizeGiB: 1, Count: 256, Note: "min-size-max-count"},
		{Type: "", SizeGiB: 1048576, Count: 1, Note: "max-size"},
	}
	wantOut := []DiskSpec{
		{Type: "nvme", SizeGiB: 480, Count: 2, Note: "系统盘"},
		{Type: "ssd", SizeGiB: 1024, Count: 1, Note: ""},
		{Type: "hdd", SizeGiB: 4096, Count: 4, Note: strings.Repeat("盘", 40)},
		{Type: "", SizeGiB: 1, Count: 256, Note: "min-size-max-count"},
		{Type: "", SizeGiB: 1048576, Count: 1, Note: "max-size"},
	}
	got, err := normalizeAndValidateDisks(validIn)
	if err != nil {
		t.Fatalf("valid multi-disk error: %v", err)
	}
	if !reflect.DeepEqual(got, wantOut) {
		t.Fatalf("normalized disks = %#v, want %#v", got, wantOut)
	}

	// Exact 32 entries allowed; 33 rejected.
	thirtyTwo := make([]DiskSpec, 32)
	for i := range thirtyTwo {
		thirtyTwo[i] = DiskSpec{Type: "ssd", SizeGiB: 100, Count: 1}
	}
	if _, err := normalizeAndValidateDisks(thirtyTwo); err != nil {
		t.Fatalf("32 entries should succeed: %v", err)
	}
	thirtyThree := append(thirtyTwo, DiskSpec{Type: "ssd", SizeGiB: 100, Count: 1})
	if _, err := normalizeAndValidateDisks(thirtyThree); !errors.Is(err, ErrInvalid) {
		t.Fatalf("33 entries error = %v, want ErrInvalid", err)
	}

	invalidCases := []struct {
		name  string
		disks []DiskSpec
		want  string
	}{
		{
			name:  "invalid type",
			disks: []DiskSpec{{Type: "sas", SizeGiB: 500, Count: 1}},
			want:  "硬盘类型无效",
		},
		{
			name:  "zero size",
			disks: []DiskSpec{{Type: "ssd", SizeGiB: 0, Count: 1}},
			want:  "硬盘容量需在 1 至 1048576 GiB 之间",
		},
		{
			name:  "negative size",
			disks: []DiskSpec{{Type: "ssd", SizeGiB: -10, Count: 1}},
			want:  "硬盘容量需在 1 至 1048576 GiB 之间",
		},
		{
			name:  "size over max",
			disks: []DiskSpec{{Type: "hdd", SizeGiB: 1048577, Count: 1}},
			want:  "硬盘容量需在 1 至 1048576 GiB 之间",
		},
		{
			name:  "negative count",
			disks: []DiskSpec{{Type: "nvme", SizeGiB: 480, Count: -1}},
			want:  "硬盘块数需在 1 至 256 之间",
		},
		{
			name:  "count over max",
			disks: []DiskSpec{{Type: "nvme", SizeGiB: 480, Count: 257}},
			want:  "硬盘块数需在 1 至 256 之间",
		},
		{
			name:  "note over 40 runes",
			disks: []DiskSpec{{Type: "ssd", SizeGiB: 480, Count: 1, Note: strings.Repeat("备", 41)}},
			want:  "硬盘备注不能超过 40 个字符",
		},
	}
	for _, tc := range invalidCases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := normalizeAndValidateDisks(tc.disks)
			if !errors.Is(err, ErrInvalid) {
				t.Fatalf("error = %v, want ErrInvalid", err)
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("error = %q, want substring %q", err.Error(), tc.want)
			}
		})
	}

	// validateFields normalizes Disks and equalFields detects changes.
	f1 := baseFields("host", "demo-disk-host-01")
	f1.Disks = nil
	if err := validateFields(&f1); err != nil {
		t.Fatalf("validateFields nil disks: %v", err)
	}
	if f1.Disks == nil {
		t.Fatal("validateFields should initialize non-nil empty Disks")
	}
	f2 := f1
	f2.Disks = []DiskSpec{{Type: "nvme", SizeGiB: 480, Count: 2}}
	if equalFields(f1, f2) {
		t.Fatal("equalFields should detect disk change")
	}
}

func TestImportDiskSpecParsing(t *testing.T) {
	csvText := strings.Join([]string{
		"资源名称,类型,硬盘,状态",
		"disk-empty,服务器,,在线",
		"disk-int,虚拟机,500,运行中",
		"disk-prefix-multi,服务器,2x480G NVMe + 4x4T HDD,在线",
		"disk-suffix-semi,服务器,NVMe 480G×2; SSD 1T,在线",
		"disk-single,虚拟机,100G SSD,运行中",
		"disk-cn-sep,服务器,2*960GiB NVMe、6x1920GB SSD、1.5TiB HDD,在线",
		"disk-notype,虚拟机,2x256G + 2TB,运行中",
	}, "\n") + "\n"

	rows, err := parseImportFile(strings.NewReader(csvText))
	if err != nil {
		t.Fatalf("parseImportFile valid disks: %v", err)
	}
	want := [][]DiskSpec{
		{},
		{{Type: "", SizeGiB: 500, Count: 1}},
		{
			{Type: "nvme", SizeGiB: 480, Count: 2},
			{Type: "hdd", SizeGiB: 4096, Count: 4},
		},
		{
			{Type: "nvme", SizeGiB: 480, Count: 2},
			{Type: "ssd", SizeGiB: 1024, Count: 1},
		},
		{{Type: "ssd", SizeGiB: 100, Count: 1}},
		{
			{Type: "nvme", SizeGiB: 960, Count: 2},
			{Type: "ssd", SizeGiB: 1920, Count: 6},
			{Type: "hdd", SizeGiB: 1536, Count: 1},
		},
		{
			{Type: "", SizeGiB: 256, Count: 2},
			{Type: "", SizeGiB: 2048, Count: 1},
		},
	}
	if len(rows) != len(want) {
		t.Fatalf("parsed %d rows, want %d", len(rows), len(want))
	}
	for i := range want {
		if rows[i].fields.Disks == nil {
			t.Fatalf("row %d (%s) Disks is nil", i, rows[i].fields.Name)
		}
		if !reflect.DeepEqual(rows[i].fields.Disks, want[i]) {
			t.Fatalf("row %d (%s) disks = %#v, want %#v", i, rows[i].fields.Name, rows[i].fields.Disks, want[i])
		}
	}

	// Verify all supported header aliases work and legacy CSVs without disk column still work.
	for _, header := range []string{"硬盘", "磁盘", "硬盘 GiB", "disks"} {
		text := "name,kind," + header + "\ndemo-" + header + ",vm,100G SSD\n"
		parsed, err := parseImportFile(strings.NewReader(text))
		if err != nil {
			t.Fatalf("header %q failed: %v", header, err)
		}
		if len(parsed) != 1 || !reflect.DeepEqual(parsed[0].fields.Disks, []DiskSpec{{Type: "ssd", SizeGiB: 100, Count: 1}}) {
			t.Fatalf("header %q disks = %#v", header, parsed)
		}
	}

	legacyCSV := "资源名称,类型,状态\nlegacy-host-1,服务器,在线\n"
	legacyRows, err := parseImportFile(strings.NewReader(legacyCSV))
	if err != nil {
		t.Fatalf("legacy CSV failed: %v", err)
	}
	if len(legacyRows) != 1 || legacyRows[0].fields.Disks == nil || len(legacyRows[0].fields.Disks) != 0 {
		t.Fatalf("legacy CSV disks = %#v, want empty non-nil slice", legacyRows[0].fields.Disks)
	}

	malformed := []string{
		"0",
		"-500",
		"0x480G NVMe",
		"480G×0 NVMe",
		"2x0G SSD",
		"100G SAS",
		"NVMe",
		"100MB",
		"1.5G SSD",
		"2x480G×3 NVMe",
		"100G SSD + ",
		"+",
		"2000000G HDD",
		"300x100G SSD",
		strings.Repeat("100G SSD + ", 32) + "100G SSD",
	}
	for _, raw := range malformed {
		t.Run("malformed_"+raw, func(t *testing.T) {
			text := "资源名称,类型,硬盘\nbad-row,服务器," + raw + "\n"
			_, err := parseImportFile(strings.NewReader(text))
			if !errors.Is(err, ErrInvalid) {
				t.Fatalf("raw=%q: error = %v, want ErrInvalid", raw, err)
			}
			if strings.Count(err.Error(), ErrInvalid.Error()) > 1 {
				t.Fatalf("raw=%q: duplicated ErrInvalid prefix: %v", raw, err)
			}
		})
	}
}

func TestDisksPersistenceAndDemoSQL(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()

	// Create asset with nil Disks -> persisted as [] and marshals as "disks":[].
	emptyFields := baseFields("switch", "demo-sw-disk-01")
	sw, err := SaveAsset(ctx, db, 0, 0, emptyFields, "tester")
	if err != nil {
		t.Fatalf("create switch: %v", err)
	}
	if sw.Disks == nil || len(sw.Disks) != 0 {
		t.Fatalf("switch disks = %#v, want non-nil empty slice", sw.Disks)
	}

	// Create host with multi-disk config.
	hostFields := baseFields("host", "demo-srv-disk-01")
	hostFields.Disks = []DiskSpec{
		{Type: " NVMe ", SizeGiB: 480, Count: 2, Note: " 系统盘 "},
		{Type: "HDD", SizeGiB: 4096, Count: 0, Note: "数据盘"},
	}
	host, err := SaveAsset(ctx, db, 0, 0, hostFields, "tester")
	if err != nil {
		t.Fatalf("create host with disks: %v", err)
	}
	wantCreated := []DiskSpec{
		{Type: "nvme", SizeGiB: 480, Count: 2, Note: "系统盘"},
		{Type: "hdd", SizeGiB: 4096, Count: 1, Note: "数据盘"},
	}
	if !reflect.DeepEqual(host.Disks, wantCreated) {
		t.Fatalf("created host disks = %#v, want %#v", host.Disks, wantCreated)
	}

	// No-op save keeps version unchanged.
	unchanged, err := SaveAsset(ctx, db, host.ID, host.Version, host.Fields, "tester")
	if err != nil {
		t.Fatalf("no-op save: %v", err)
	}
	if unchanged.Version != host.Version {
		t.Fatalf("no-op save bumped version from %d to %d", host.Version, unchanged.Version)
	}

	// Updating disks bumps version and persists new config.
	update := host.Fields
	update.Disks = []DiskSpec{
		{Type: "nvme", SizeGiB: 1920, Count: 4, Note: "全闪存"},
	}
	updated, err := SaveAsset(ctx, db, host.ID, host.Version, update, "tester")
	if err != nil {
		t.Fatalf("update disks: %v", err)
	}
	if updated.Version != 2 || !reflect.DeepEqual(updated.Disks, update.Disks) {
		t.Fatalf("updated host = %+v", updated)
	}

	// Direct SaveAsset rejects invalid disks.
	invalidUpdate := updated.Fields
	invalidUpdate.Disks = []DiskSpec{{Type: "tape", SizeGiB: 100, Count: 1}}
	if _, err := SaveAsset(ctx, db, updated.ID, updated.Version, invalidUpdate, "tester"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("invalid disks update error = %v, want ErrInvalid", err)
	}

	// BulkUpdateAssets preserves existing disks.
	newStatus := "online"
	bulkCount, err := BulkUpdateAssets(ctx, db, []int64{host.ID}, BulkAssetPatch{Status: &newStatus}, "tester")
	if err != nil || bulkCount != 1 {
		t.Fatalf("bulk update: %d, %v", bulkCount, err)
	}
	listed, err := ListAssets(ctx, db)
	if err != nil {
		t.Fatalf("list assets: %v", err)
	}
	var foundHost Asset
	for _, a := range listed {
		if a.ID == host.ID {
			foundHost = a
		}
	}
	if !reflect.DeepEqual(foundHost.Disks, update.Disks) {
		t.Fatalf("host disks after bulk update = %#v, want %#v", foundHost.Disks, update.Disks)
	}

	// CSV PreviewImport + ImportAssets round-trip with disks column.
	csvText := "资源名称,类型,硬盘,状态\ndemo-csv-disk-01,服务器,2x480G NVMe + 4x4T HDD,在线\n"
	preview, err := PreviewImport(ctx, db, strings.NewReader(csvText))
	if err != nil || preview.Valid != 1 || len(preview.Sample) != 1 || len(preview.Sample[0].Disks) != 2 {
		t.Fatalf("preview import disks = %+v, %v", preview, err)
	}
	res, err := ImportAssets(ctx, db, strings.NewReader(csvText), "tester")
	if err != nil || res.Imported != 1 {
		t.Fatalf("import disks = %+v, %v", res, err)
	}

	// Verify demo-data.sql loads cleanly on an empty database and populates host/vm disks.
	demoDB := testDB(t)
	demoSQL, err := os.ReadFile(filepath.Join("..", "..", "demo-data.sql"))
	if err != nil {
		t.Fatalf("read demo-data.sql: %v", err)
	}
	if _, err := demoDB.ExecContext(ctx, string(demoSQL)); err != nil {
		t.Fatalf("exec demo-data.sql: %v", err)
	}
	demoAssets, err := ListAssets(ctx, demoDB)
	if err != nil {
		t.Fatalf("list demo assets: %v", err)
	}
	if len(demoAssets) != 536 {
		t.Fatalf("demo assets = %d, want 536", len(demoAssets))
	}
	var hosts, vms, netDevs int
	for _, a := range demoAssets {
		switch a.Kind {
		case "host":
			hosts++
			if len(a.Disks) == 0 {
				t.Fatalf("demo host %d (%s) has empty disks", a.ID, a.Name)
			}
			if _, err := normalizeAndValidateDisks(a.Disks); err != nil {
				t.Fatalf("demo host %d invalid disks: %v", a.ID, err)
			}
		case "vm":
			vms++
			if len(a.Disks) == 0 {
				t.Fatalf("demo vm %d (%s) has empty disks", a.ID, a.Name)
			}
			if _, err := normalizeAndValidateDisks(a.Disks); err != nil {
				t.Fatalf("demo vm %d invalid disks: %v", a.ID, err)
			}
		default:
			netDevs++
			if a.Disks == nil || len(a.Disks) != 0 {
				t.Fatalf("demo network device %d (%s) disks = %#v, want empty []", a.ID, a.Name, a.Disks)
			}
		}
	}
	if hosts != 153 || vms != 287 || netDevs != 96 {
		t.Fatalf("demo counts: hosts=%d vms=%d net=%d, want 153/287/96", hosts, vms, netDevs)
	}
}
