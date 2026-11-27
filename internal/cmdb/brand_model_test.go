package cmdb

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestBrandModelValidation(t *testing.T) {
	fields := baseFields("host", "demo-srv-01")
	fields.Brand = "  Dell \t"
	fields.Model = "\n PowerEdge R750  "
	if err := validateFields(&fields); err != nil {
		t.Fatalf("validateFields valid brand/model: %v", err)
	}
	if fields.Brand != "Dell" || fields.Model != "PowerEdge R750" {
		t.Fatalf("normalized brand/model = %q/%q, want Dell/PowerEdge R750", fields.Brand, fields.Model)
	}

	// Exact rune boundaries using multi-byte Chinese characters.
	boundary := baseFields("host", "demo-srv-02")
	boundary.Brand = strings.Repeat("华", 80)
	boundary.Model = strings.Repeat("型", 120)
	if err := validateFields(&boundary); err != nil {
		t.Fatalf("validateFields exact rune boundary: %v", err)
	}

	tooLongBrand := baseFields("host", "demo-srv-03")
	tooLongBrand.Brand = strings.Repeat("华", 81)
	if err := validateFields(&tooLongBrand); !errors.Is(err, ErrInvalid) {
		t.Fatalf("brand overflow error = %v, want ErrInvalid", err)
	}

	tooLongModel := baseFields("host", "demo-srv-04")
	tooLongModel.Model = strings.Repeat("型", 121)
	if err := validateFields(&tooLongModel); !errors.Is(err, ErrInvalid) {
		t.Fatalf("model overflow error = %v, want ErrInvalid", err)
	}

	negTeam := baseFields("host", "demo-srv-05")
	negTeam.TeamID = -1
	if err := validateFields(&negTeam); err == nil {
		t.Fatal("negative teamId should be rejected")
	}

	other := fields
	other.Model = "PowerEdge R650"
	if equalFields(fields, other) {
		t.Fatal("equalFields should detect model change")
	}
	other.Model = fields.Model
	other.Brand = "HPE"
	if equalFields(fields, other) {
		t.Fatal("equalFields should detect brand change")
	}

	payload, err := json.Marshal(Asset{Fields: fields})
	if err != nil {
		t.Fatalf("marshal asset: %v", err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatalf("unmarshal asset: %v", err)
	}
	if decoded["brand"] != "Dell" || decoded["model"] != "PowerEdge R750" {
		t.Fatalf("json brand/model = %v/%v, want Dell/PowerEdge R750", decoded["brand"], decoded["model"])
	}
}

func TestImportBrandModelParsing(t *testing.T) {
	withBrandModel := strings.Join([]string{
		"资源名称,类型,品牌,型号,状态",
		"demo-host-a,服务器,  华为  , FusionServer 2288H V6 ,在线",
	}, "\n") + "\n"
	rows, err := parseImportFile(strings.NewReader(withBrandModel))
	if err != nil {
		t.Fatalf("parseImportFile with brand/model: %v", err)
	}
	if len(rows) != 1 || rows[0].fields.Brand != "华为" || rows[0].fields.Model != "FusionServer 2288H V6" {
		t.Fatalf("parsed brand/model = %+v", rows)
	}

	englishHeaders := strings.Join([]string{
		"name,kind,brand,model",
		"demo-host-b,host,Dell,PowerEdge R750",
	}, "\n") + "\n"
	rows, err = parseImportFile(strings.NewReader(englishHeaders))
	if err != nil {
		t.Fatalf("parseImportFile english headers: %v", err)
	}
	if len(rows) != 1 || rows[0].fields.Brand != "Dell" || rows[0].fields.Model != "PowerEdge R750" {
		t.Fatalf("parsed english brand/model = %+v", rows)
	}

	// Existing CSV files without brand/model columns must still parse cleanly.
	legacyCSV := "资源名称,类型,状态\ndemo-host-c,服务器,在线\n"
	rows, err = parseImportFile(strings.NewReader(legacyCSV))
	if err != nil {
		t.Fatalf("parseImportFile legacy CSV: %v", err)
	}
	if len(rows) != 1 || rows[0].fields.Brand != "" || rows[0].fields.Model != "" {
		t.Fatalf("legacy CSV brand/model = %+v, want empty", rows)
	}

	overflowCSV := "资源名称,类型,品牌,型号\ndemo-host-d,服务器," + strings.Repeat("X", 81) + ",R750\n"
	_, err = parseImportFile(strings.NewReader(overflowCSV))
	if !errors.Is(err, ErrInvalid) {
		t.Fatalf("overflow CSV error = %v, want ErrInvalid", err)
	}
	if strings.Count(err.Error(), ErrInvalid.Error()) > 1 {
		t.Fatalf("overflow CSV error duplicated ErrInvalid prefix: %v", err)
	}
}

func TestBulkAssetPatchEmpty(t *testing.T) {
	if !(BulkAssetPatch{}).empty() {
		t.Fatal("zero BulkAssetPatch should be empty")
	}
	teamID := int64(1)
	if (BulkAssetPatch{TeamID: &teamID}).empty() {
		t.Fatal("BulkAssetPatch with TeamID should not be empty")
	}
	brand := "Dell"
	if (BulkAssetPatch{Brand: &brand}).empty() {
		t.Fatal("BulkAssetPatch with Brand should not be empty")
	}
	model := "PowerEdge R750"
	if (BulkAssetPatch{Model: &model}).empty() {
		t.Fatal("BulkAssetPatch with Model should not be empty")
	}
}

func TestBrandModelPersistenceAndBulkUpdate(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()

	teamID, err := SaveTeam(ctx, db, 0, TeamFields{
		DirectoryFields: DirectoryFields{Name: "示例基础架构组"},
	})
	if err != nil {
		t.Fatalf("save team: %v", err)
	}

	fields := baseFields("host", "demo-bm-host-01")
	fields.Brand = "  Dell  "
	fields.Model = " PowerEdge R750 "
	asset, err := SaveAsset(ctx, db, 0, 0, fields, "tester")
	if err != nil {
		t.Fatalf("create asset: %v", err)
	}
	if asset.Brand != "Dell" || asset.Model != "PowerEdge R750" {
		t.Fatalf("created brand/model = %q/%q, want Dell/PowerEdge R750", asset.Brand, asset.Model)
	}

	overflow := asset.Fields
	overflow.Brand = strings.Repeat("a", 81)
	if _, err := SaveAsset(ctx, db, asset.ID, asset.Version, overflow, "tester"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("direct SaveAsset brand overflow error = %v, want ErrInvalid", err)
	}

	update := asset.Fields
	update.Brand = " 浪潮 "
	update.Model = " NF5280M6 "
	updatedAsset, err := SaveAsset(ctx, db, asset.ID, asset.Version, update, "tester")
	if err != nil {
		t.Fatalf("update asset: %v", err)
	}
	if updatedAsset.Version != 2 || updatedAsset.Brand != "浪潮" || updatedAsset.Model != "NF5280M6" {
		t.Fatalf("updated asset = %+v", updatedAsset)
	}

	results, err := Search(ctx, db, "NF5280M6")
	if err != nil || len(results) == 0 || results[0].AssetID != asset.ID {
		t.Fatalf("search by model = %+v, %v", results, err)
	}
	results, err = Search(ctx, db, "浪潮")
	if err != nil || len(results) == 0 || results[0].AssetID != asset.ID {
		t.Fatalf("search by brand = %+v, %v", results, err)
	}

	newBrand := " HPE "
	newModel := " ProLiant DL380 Gen10 "
	updated, err := BulkUpdateAssets(ctx, db, []int64{asset.ID}, BulkAssetPatch{
		TeamID: &teamID,
		Brand:  &newBrand,
		Model:  &newModel,
	}, "tester")
	if err != nil || updated != 1 {
		t.Fatalf("bulk update brand/model/team = %d, %v", updated, err)
	}
	assets, err := ListAssets(ctx, db)
	if err != nil || len(assets) != 1 {
		t.Fatalf("list assets = %+v, %v", assets, err)
	}
	if assets[0].TeamID != teamID || assets[0].Brand != "HPE" || assets[0].Model != "ProLiant DL380 Gen10" {
		t.Fatalf("after bulk update = %+v", assets[0])
	}

	clearTeam := int64(0)
	updated, err = BulkUpdateAssets(ctx, db, []int64{asset.ID}, BulkAssetPatch{TeamID: &clearTeam}, "tester")
	if err != nil || updated != 1 {
		t.Fatalf("bulk clear team = %d, %v", updated, err)
	}
	assets, err = ListAssets(ctx, db)
	if err != nil || assets[0].TeamID != 0 {
		t.Fatalf("after bulk clear team = %+v, %v", assets, err)
	}

	badBrand := strings.Repeat("b", 81)
	if _, err := BulkUpdateAssets(ctx, db, []int64{asset.ID}, BulkAssetPatch{Brand: &badBrand}, "tester"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("bulk brand overflow error = %v, want ErrInvalid", err)
	}

	csvText := "资源名称,类型,品牌,型号,状态\ndemo-csv-host,服务器,新华三,UniServer R4900 G5,在线\n"
	preview, err := PreviewImport(ctx, db, strings.NewReader(csvText))
	if err != nil || preview.Valid != 1 || len(preview.Sample) != 1 ||
		preview.Sample[0].Brand != "新华三" || preview.Sample[0].Model != "UniServer R4900 G5" {
		t.Fatalf("preview import brand/model = %+v, %v", preview, err)
	}
	res, err := ImportAssets(ctx, db, strings.NewReader(csvText), "tester")
	if err != nil || res.Imported != 1 {
		t.Fatalf("import brand/model = %+v, %v", res, err)
	}
}

func TestPlatformValidationAndImportNormalization(t *testing.T) {
	for _, platform := range []string{"", "pve", "kvm", "esxi"} {
		fields := baseFields("host", "demo-plat-"+platform)
		fields.Platform = platform
		if err := validateFields(&fields); err != nil {
			t.Fatalf("validateFields(platform=%q): %v", platform, err)
		}
	}

	invalid := baseFields("host", "demo-plat-bad")
	invalid.Platform = "xen"
	if err := validateFields(&invalid); err == nil {
		t.Fatal("validateFields should reject unsupported platform")
	}

	csvText := strings.Join([]string{
		"资源名称,类型,平台,状态",
		"demo-esxi-1,服务器,VMware ESXi,在线",
		"demo-esxi-2,服务器,VMware,在线",
		"demo-esxi-3,虚拟机,ESXi,运行中",
		"demo-esxi-4,虚拟机,vSphere,运行中",
		"demo-kvm-1,服务器,KVM,在线",
		"demo-pve-1,服务器,Proxmox VE,在线",
		"demo-empty-1,服务器,—,在线",
	}, "\n") + "\n"
	rows, err := parseImportFile(strings.NewReader(csvText))
	if err != nil {
		t.Fatalf("parseImportFile platforms: %v", err)
	}
	want := []string{"esxi", "esxi", "esxi", "esxi", "kvm", "pve", ""}
	if len(rows) != len(want) {
		t.Fatalf("parsed %d rows, want %d", len(rows), len(want))
	}
	for i, w := range want {
		if rows[i].fields.Platform != w {
			t.Fatalf("row %d (%s) platform = %q, want %q", i, rows[i].fields.Name, rows[i].fields.Platform, w)
		}
	}

	badCSV := "资源名称,类型,平台\ndemo-bad-plat,服务器,Hyper-V\n"
	_, err = parseImportFile(strings.NewReader(badCSV))
	if !errors.Is(err, ErrInvalid) {
		t.Fatalf("invalid platform CSV error = %v, want ErrInvalid", err)
	}
	if !strings.Contains(err.Error(), "VMware ESXi") {
		t.Fatalf("invalid platform CSV error %q should mention VMware ESXi", err.Error())
	}
}

func TestPlatformESXiPersistenceAndBulkUpdate(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()

	fields := baseFields("host", "demo-esxi-host-01")
	fields.Platform = "esxi"
	asset, err := SaveAsset(ctx, db, 0, 0, fields, "tester")
	if err != nil {
		t.Fatalf("create esxi host: %v", err)
	}
	if asset.Platform != "esxi" {
		t.Fatalf("created platform = %q, want esxi", asset.Platform)
	}

	vmFields := baseFields("vm", "demo-esxi-vm-01")
	vm, err := SaveAsset(ctx, db, 0, 0, vmFields, "tester")
	if err != nil {
		t.Fatalf("create vm: %v", err)
	}
	esxi := "esxi"
	updated, err := BulkUpdateAssets(ctx, db, []int64{vm.ID}, BulkAssetPatch{Platform: &esxi}, "tester")
	if err != nil || updated != 1 {
		t.Fatalf("bulk update platform to esxi = %d, %v", updated, err)
	}

	csvText := strings.Join([]string{
		"资源名称,类型,平台,状态",
		"demo-csv-esxi-1,服务器,VMware ESXi,在线",
		"demo-csv-esxi-2,虚拟机,VMware,运行中",
		"demo-csv-esxi-3,虚拟机,ESXi,运行中",
		"demo-csv-kvm-1,服务器,KVM,在线",
	}, "\n") + "\n"
	res, err := ImportAssets(ctx, db, strings.NewReader(csvText), "tester")
	if err != nil || res.Imported != 4 {
		t.Fatalf("import esxi/kvm CSV = %+v, %v", res, err)
	}
}
