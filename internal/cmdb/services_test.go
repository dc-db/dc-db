package cmdb

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestValidateServiceInstances(t *testing.T) {
	if err := validateServiceInstances("switch", nil); err != nil {
		t.Fatalf("nil services on switch: %v", err)
	}
	empty := []AssetServiceInstance{}
	if err := validateServiceInstances("switch", &empty); err != nil {
		t.Fatalf("empty services on switch: %v", err)
	}

	for _, kind := range []string{"switch", "router", "firewall", "load_balancer"} {
		entries := []AssetServiceInstance{{Name: "nginx"}}
		if err := validateServiceInstances(kind, &entries); !errors.Is(err, ErrInvalid) {
			t.Fatalf("kind %s error = %v, want ErrInvalid", kind, err)
		}
	}

	entries := []AssetServiceInstance{
		{Name: "  Nginx  "},
		{Name: "nginx"},
		{Name: "REDIS"},
		{Name: "redis"},
		{Name: "Order-API"},
		{Name: "order-api"},
	}
	if err := validateServiceInstances("host", &entries); err != nil {
		t.Fatalf("validate dedupe: %v", err)
	}
	want := []string{"Nginx", "REDIS", "Order-API"}
	if len(entries) != len(want) {
		t.Fatalf("deduped len = %d (%+v), want %d", len(entries), entries, len(want))
	}
	for i, w := range want {
		if entries[i].Name != w {
			t.Fatalf("entries[%d].Name = %q, want %q", i, entries[i].Name, w)
		}
	}

	invalidCases := []struct {
		name    string
		entries []AssetServiceInstance
	}{
		{"empty name", []AssetServiceInstance{{Name: "   "}}},
		{"too long name", []AssetServiceInstance{{Name: strings.Repeat("a", 121)}}},
	}
	for _, tc := range invalidCases {
		t.Run(tc.name, func(t *testing.T) {
			in := append([]AssetServiceInstance(nil), tc.entries...)
			if err := validateServiceInstances("vm", &in); !errors.Is(err, ErrInvalid) {
				t.Fatalf("error = %v, want ErrInvalid", err)
			}
		})
	}

	tooMany := make([]AssetServiceInstance, 101)
	for i := range tooMany {
		tooMany[i] = AssetServiceInstance{Name: fmt.Sprintf("svc-%d", i)}
	}
	if err := validateServiceInstances("vm", &tooMany); !errors.Is(err, ErrInvalid) {
		t.Fatalf("too many services error = %v, want ErrInvalid", err)
	}
}

func TestBuiltinServiceCatalog(t *testing.T) {
	if len(builtinServiceCatalog) != 28 {
		t.Fatalf("builtinServiceCatalog len = %d, want 28", len(builtinServiceCatalog))
	}
	cases := []struct {
		query    string
		wantName string
		wantCat  string
	}{
		{"NGINX", "nginx", "Web 服务"},
		{"PostgreSQL", "postgresql", "数据库"},
		{"Redis", "redis", "缓存"},
		{"kafka", "kafka", "消息队列"},
		{"Elasticsearch", "elasticsearch", "搜索"},
		{"Prometheus", "prometheus", "监控"},
		{"MinIO", "minio", "存储"},
		{"GitLab", "gitlab", "研发工具"},
		{"etcd", "etcd", "基础设施"},
	}
	for _, tc := range cases {
		spec, ok := lookupBuiltinService(tc.query)
		if !ok {
			t.Fatalf("lookupBuiltinService(%q) = false, want true", tc.query)
		}
		if spec.Name != tc.wantName || spec.Category != tc.wantCat {
			t.Fatalf("lookupBuiltinService(%q) = %+v, want {%s %s}", tc.query, spec, tc.wantName, tc.wantCat)
		}
	}
	if _, ok := lookupBuiltinService("order-api"); ok {
		t.Fatalf("expected custom service to not be in builtinServiceCatalog")
	}
}

func TestAssetServiceInstances(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	instances := []AssetServiceInstance{{Name: "mysql"}, {Name: "custom-app"}}
	fields := baseFields("host", "example-host")
	fields.Services = &instances
	asset, err := SaveAsset(ctx, db, 0, 0, fields, "tester")
	if err != nil {
		t.Fatal(err)
	}
	if asset.Services == nil || len(*asset.Services) != 2 {
		t.Fatalf("created asset services: %+v", asset.Services)
	}
	if (*asset.Services)[0].ID == 0 || (*asset.Services)[0].ServiceID == 0 || (*asset.Services)[0].Category != "数据库" {
		t.Fatalf("unexpected mysql service instance: %+v", (*asset.Services)[0])
	}
	if (*asset.Services)[1].ID == 0 || (*asset.Services)[1].ServiceID == 0 || (*asset.Services)[1].Category != defaultCustomServiceCategory {
		t.Fatalf("unexpected custom-app service instance: %+v", (*asset.Services)[1])
	}

	items, err := ListAssets(ctx, db)
	if err != nil || len(items) != 1 || items[0].Services == nil || len(*items[0].Services) != 2 {
		t.Fatalf("list services: %+v, %v", items, err)
	}
	updated := []AssetServiceInstance{{Name: "redis"}}
	fields.Services = &updated
	next, err := SaveAsset(ctx, db, asset.ID, asset.Version, fields, "tester")
	if err != nil {
		t.Fatal(err)
	}
	if next.Version <= asset.Version {
		t.Fatalf("service edit did not update version: %+v", next)
	}
	if _, err := SaveAsset(ctx, db, asset.ID, asset.Version, fields, "tester"); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale write = %v", err)
	}
	bad := []AssetServiceInstance{{Name: ""}}
	fields.Services = &bad
	if _, err := SaveAsset(ctx, db, asset.ID, next.Version, fields, "tester"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("invalid service = %v", err)
	}
	items, err = ListAssets(ctx, db)
	if err != nil || len(*items[0].Services) != 1 || (*items[0].Services)[0].Name != "redis" || (*items[0].Services)[0].Category != "缓存" {
		t.Fatalf("invalid update changed services: %+v %v", items, err)
	}
	empty := []AssetServiceInstance{}
	fields.Services = &empty
	if _, err := SaveAsset(ctx, db, asset.ID, next.Version, fields, "tester"); err != nil {
		t.Fatal(err)
	}
	items, err = ListAssets(ctx, db)
	if err != nil || items[0].Services != nil {
		t.Fatalf("clear services: %+v %v", items, err)
	}
}

func TestAssetServiceAutoRegisterAndSync(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()

	hostFields := baseFields("host", "sync-host-01")
	hostServices := []AssetServiceInstance{
		{Name: "  NGINX "},
		{Name: "nginx"},
		{Name: "order-api"},
		{Name: "ORDER-API"},
	}
	hostFields.Services = &hostServices
	host, err := SaveAsset(ctx, db, 0, 0, hostFields, "tester")
	if err != nil {
		t.Fatalf("create host with services: %v", err)
	}
	if host.Services == nil || len(*host.Services) != 2 {
		t.Fatalf("expected 2 deduped services, got %+v", host.Services)
	}

	services, err := ListServices(ctx, db)
	if err != nil || len(services) != 2 {
		t.Fatalf("ListServices after auto-register = %+v, %v", services, err)
	}
	byName := make(map[string]ServiceEntry, len(services))
	for _, s := range services {
		byName[s.Name] = s
	}
	nginxSvc, ok := byName["nginx"]
	if !ok || !nginxSvc.Builtin || nginxSvc.Category != "Web 服务" || nginxSvc.AssetCount != 1 {
		t.Fatalf("unexpected auto-registered nginx service: %+v", nginxSvc)
	}
	customSvc, ok := byName["order-api"]
	if !ok || customSvc.Builtin || customSvc.Category != defaultCustomServiceCategory || customSvc.AssetCount != 1 {
		t.Fatalf("unexpected auto-registered custom service: %+v", customSvc)
	}

	// Second asset binds same services with different casing: must reuse existing service IDs.
	vmFields := baseFields("vm", "sync-vm-01")
	vmServices := []AssetServiceInstance{{Name: "Nginx"}, {Name: "Order-Api"}}
	vmFields.Services = &vmServices
	vm, err := SaveAsset(ctx, db, 0, 0, vmFields, "tester")
	if err != nil {
		t.Fatalf("create vm with services: %v", err)
	}
	if vm.Services == nil || len(*vm.Services) != 2 {
		t.Fatalf("unexpected vm services: %+v", vm.Services)
	}
	if (*vm.Services)[0].ServiceID != nginxSvc.ID || (*vm.Services)[1].ServiceID != customSvc.ID {
		t.Fatalf("vm did not reuse existing service IDs: vm=%+v nginx=%d custom=%d", *vm.Services, nginxSvc.ID, customSvc.ID)
	}

	services, err = ListServices(ctx, db)
	if err != nil || len(services) != 2 {
		t.Fatalf("ListServices after second asset = %+v, %v", services, err)
	}
	for _, s := range services {
		if s.AssetCount != 2 {
			t.Fatalf("service %s AssetCount = %d, want 2", s.Name, s.AssetCount)
		}
	}

	// Re-saving host with equivalent case-insensitive service names is a no-op.
	sameServices := []AssetServiceInstance{{Name: "NGINX"}, {Name: "ORDER-API"}}
	hostFields.Services = &sameServices
	unchanged, err := SaveAsset(ctx, db, host.ID, host.Version, hostFields, "tester")
	if err != nil {
		t.Fatalf("no-op save host: %v", err)
	}
	if unchanged.Version != host.Version {
		t.Fatalf("no-op service save bumped version: %d -> %d", host.Version, unchanged.Version)
	}

	// Renaming a service reflects immediately on both bound assets via FK join.
	if _, err := SaveService(ctx, db, customSvc.ID, ServiceInput{
		Name:        "order-core-api",
		Category:    "其他",
		Builtin:     false,
		Description: "重命名后的订单接口",
	}, "tester"); err != nil {
		t.Fatalf("rename service: %v", err)
	}
	assets, err := ListAssets(ctx, db)
	if err != nil {
		t.Fatalf("ListAssets after rename: %v", err)
	}
	for _, a := range assets {
		if a.Services == nil || len(*a.Services) != 2 {
			t.Fatalf("asset %s services after rename = %+v", a.Name, a.Services)
		}
		if (*a.Services)[1].Name != "order-core-api" || (*a.Services)[1].Category != "其他" {
			t.Fatalf("asset %s did not reflect renamed service: %+v", a.Name, (*a.Services)[1])
		}
	}

	// Deleting a service cascades cleanly to asset_service_instances.
	if err := DeleteService(ctx, db, customSvc.ID, "tester"); err != nil {
		t.Fatalf("delete custom service: %v", err)
	}
	assets, err = ListAssets(ctx, db)
	if err != nil {
		t.Fatalf("ListAssets after delete: %v", err)
	}
	for _, a := range assets {
		if a.Services == nil || len(*a.Services) != 1 || (*a.Services)[0].Name != "nginx" {
			t.Fatalf("asset %s services after delete = %+v, want only nginx", a.Name, a.Services)
		}
	}
}

func TestAssetRoomAssignment(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	room, err := SaveRoom(ctx, db, 0, RoomFields{Name: "example-room"}, 0, "tester")
	if err != nil {
		t.Fatal(err)
	}
	fields := baseFields("host", "example-room-host")
	fields.RoomID = room.ID
	asset, err := SaveAsset(ctx, db, 0, 0, fields, "tester")
	if err != nil {
		t.Fatal(err)
	}
	listed, err := ListAssets(ctx, db)
	if err != nil || len(listed) != 1 || listed[0].RoomID != room.ID {
		t.Fatalf("room assignment = %+v, %v", listed, err)
	}
	fields.RoomID = 999999
	if _, err := SaveAsset(ctx, db, asset.ID, asset.Version, fields, "tester"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("invalid room = %v", err)
	}
	fields.RoomID = 0
	updated, err := SaveAsset(ctx, db, asset.ID, asset.Version, fields, "tester")
	if err != nil || updated.RoomID != 0 {
		t.Fatalf("clear room = %+v, %v", updated, err)
	}
}

func TestNormalizeServiceInput(t *testing.T) {
	t.Run("valid builtin and custom inputs", func(t *testing.T) {
		assetIDs := []int64{3, 1, 3}
		projectIDs := []int64{5, 2, 5}
		in := ServiceInput{
			Name:        "  Redis  ",
			Category:    "  cache  ",
			Builtin:     true,
			Description: "  in-memory cache  ",
			AssetIDs:    &assetIDs,
			ProjectIDs:  &projectIDs,
		}
		if err := normalizeServiceInput(&in); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if in.Name != "Redis" || in.Category != "cache" || in.Description != "in-memory cache" {
			t.Fatalf("fields not trimmed: %+v", in)
		}
		if len(*in.AssetIDs) != 2 || (*in.AssetIDs)[0] != 3 || (*in.AssetIDs)[1] != 1 {
			t.Fatalf("assetIds not deduped: %+v", *in.AssetIDs)
		}
		if len(*in.ProjectIDs) != 2 || (*in.ProjectIDs)[0] != 5 || (*in.ProjectIDs)[1] != 2 {
			t.Fatalf("projectIds not deduped: %+v", *in.ProjectIDs)
		}

		custom := ServiceInput{
			Name:        "custom-billing-svc",
			Category:    "",
			Builtin:     false,
			Description: "",
		}
		if err := normalizeServiceInput(&custom); err != nil {
			t.Fatalf("custom input error: %v", err)
		}
	})

	cases := []struct {
		name  string
		input ServiceInput
	}{
		{"empty name", ServiceInput{Name: "   "}},
		{"too long name", ServiceInput{Name: strings.Repeat("a", 121)}},
		{"too long category", ServiceInput{Name: "svc", Category: strings.Repeat("c", 41)}},
		{"too long description", ServiceInput{Name: "svc", Description: strings.Repeat("d", 301)}},
		{"invalid asset id", ServiceInput{Name: "svc", AssetIDs: &[]int64{0}}},
		{"invalid project id", ServiceInput{Name: "svc", ProjectIDs: &[]int64{-1}}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			in := tc.input
			if err := normalizeServiceInput(&in); !errors.Is(err, ErrInvalid) {
				t.Fatalf("error = %v, want ErrInvalid", err)
			}
		})
	}
}

func TestServicesLifecycle(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()

	initial, err := ListServices(ctx, db)
	if err != nil {
		t.Fatalf("list empty services: %v", err)
	}
	if initial == nil || len(initial) != 0 {
		t.Fatalf("expected empty non-nil slice, got %#v", initial)
	}

	host, err := SaveAsset(ctx, db, 0, 0, baseFields("host", "app-host-01"), "tester")
	if err != nil {
		t.Fatalf("create host: %v", err)
	}
	vm, err := SaveAsset(ctx, db, 0, 0, baseFields("vm", "app-vm-01"), "tester")
	if err != nil {
		t.Fatalf("create vm: %v", err)
	}
	sw, err := SaveAsset(ctx, db, 0, 0, baseFields("switch", "core-sw-01"), "tester")
	if err != nil {
		t.Fatalf("create switch: %v", err)
	}
	group, err := SaveGroup(ctx, db, 0, GroupFields{Name: "核心交易"})
	if err != nil {
		t.Fatalf("create group: %v", err)
	}

	// Non-host/VM assets must be rejected.
	if _, err := SaveService(ctx, db, 0, ServiceInput{
		Name:     "redis",
		AssetIDs: &[]int64{host.ID, sw.ID},
	}, "tester"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("non-node asset error = %v, want ErrInvalid", err)
	}

	created, err := SaveService(ctx, db, 0, ServiceInput{
		Name:        "Redis",
		Category:    "缓存",
		Builtin:     true,
		Description: "缓存集群",
		AssetIDs:    &[]int64{host.ID, vm.ID, host.ID},
		ProjectIDs:  &[]int64{group.ID},
	}, "tester")
	if err != nil {
		t.Fatalf("create service: %v", err)
	}
	if created.ID == 0 || created.AssetCount != 2 || len(created.Assets) != 2 || created.ProjectCount != 1 || len(created.Projects) != 1 {
		t.Fatalf("unexpected created service: %+v", created)
	}

	got, err := GetService(ctx, db, created.ID)
	if err != nil || got.ID != created.ID || got.AssetCount != 2 || got.ProjectCount != 1 {
		t.Fatalf("GetService = %+v, %v", got, err)
	}

	// Case-insensitive duplicate name returns ErrConflict.
	if _, err := SaveService(ctx, db, 0, ServiceInput{Name: "redis"}, "tester"); !errors.Is(err, ErrConflict) {
		t.Fatalf("duplicate service error = %v, want ErrConflict", err)
	}

	// Invalid asset / project IDs fail validation.
	if _, err := SaveService(ctx, db, 0, ServiceInput{Name: "MySQL", AssetIDs: &[]int64{999999}}, "tester"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("missing asset error = %v, want ErrInvalid", err)
	}
	if _, err := SaveService(ctx, db, 0, ServiceInput{Name: "MySQL", ProjectIDs: &[]int64{999999}}, "tester"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("missing project error = %v, want ErrInvalid", err)
	}

	// Rename service without passing AssetIDs: existing deployments must stay linked via service_id FK.
	updated, err := SaveService(ctx, db, created.ID, ServiceInput{
		Name:        "Redis-Cluster",
		Category:    "缓存",
		Builtin:     true,
		Description: "主缓存集群",
	}, "tester")
	if err != nil {
		t.Fatalf("update service: %v", err)
	}
	if updated.Name != "Redis-Cluster" || updated.AssetCount != 2 || updated.ProjectCount != 1 {
		t.Fatalf("rename broke links: %+v", updated)
	}

	assets, err := ListAssets(ctx, db)
	if err != nil {
		t.Fatalf("list assets after rename: %v", err)
	}
	boundCount := 0
	for _, a := range assets {
		if a.ID == host.ID || a.ID == vm.ID {
			if a.Services == nil || len(*a.Services) != 1 || (*a.Services)[0].Name != "Redis-Cluster" || (*a.Services)[0].ServiceID != created.ID {
				t.Fatalf("asset %s did not reflect renamed service: %+v", a.Name, a.Services)
			}
			boundCount++
		}
	}
	if boundCount != 2 {
		t.Fatalf("expected 2 bound assets, saw %d", boundCount)
	}

	list, err := ListServices(ctx, db)
	if err != nil || len(list) != 1 || list[0].AssetCount != 2 || list[0].ProjectCount != 1 {
		t.Fatalf("list services after rename: %+v, %v", list, err)
	}

	if err := DeleteService(ctx, db, created.ID, "tester"); err != nil {
		t.Fatalf("delete service: %v", err)
	}
	if err := DeleteService(ctx, db, created.ID, "tester"); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("delete missing service = %v, want sql.ErrNoRows", err)
	}

	// Asset service instances should have been cascaded on delete.
	assets, err = ListAssets(ctx, db)
	if err != nil {
		t.Fatalf("list assets: %v", err)
	}
	for _, a := range assets {
		if a.Services != nil && len(*a.Services) > 0 {
			t.Fatalf("asset %s still has services after delete: %+v", a.Name, *a.Services)
		}
	}
}

func TestDemoDataServicesSQL(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()

	raw, err := os.ReadFile(filepath.Join("..", "..", "demo-data.sql"))
	if err != nil {
		t.Fatalf("read demo-data.sql: %v", err)
	}
	if _, err := db.ExecContext(ctx, string(raw)); err != nil {
		t.Fatalf("execute demo-data.sql: %v", err)
	}

	services, err := ListServices(ctx, db)
	if err != nil {
		t.Fatalf("ListServices on demo data: %v", err)
	}
	if len(services) != 12 {
		t.Fatalf("demo services count = %d, want 12", len(services))
	}
	for _, s := range services {
		if s.AssetCount == 0 {
			t.Fatalf("demo service %s has 0 bound assets", s.Name)
		}
		if s.ProjectCount == 0 {
			t.Fatalf("demo service %s has 0 bound projects", s.Name)
		}
	}
}

func TestServicesHTTP(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()

	if _, err := CreateUser(ctx, db, UserFields{
		Username: "svc-admin", Password: "admin-password-123", Role: "admin",
	}, "system"); err != nil {
		t.Fatalf("create user: %v", err)
	}
	token := strings.Repeat("a", 43) // 32-byte base64url session token length required by requireUser
	if _, err := db.ExecContext(ctx,
		`INSERT INTO sessions (token_hash, username, expires_at) VALUES ($1, $2, $3)`,
		sessionHash(token), "svc-admin", timeText(time.Now().Add(time.Hour))); err != nil {
		t.Fatalf("create session: %v", err)
	}

	handler := NewServer(db, false, http.NotFoundHandler())
	doReq := func(method, path string, body any) *httptest.ResponseRecorder {
		t.Helper()
		var buf bytes.Buffer
		if body != nil {
			if err := json.NewEncoder(&buf).Encode(body); err != nil {
				t.Fatal(err)
			}
		}
		req := httptest.NewRequest(method, path, &buf)
		req.AddCookie(&http.Cookie{Name: sessionCookie, Value: token})
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		return rec
	}

	// Empty list returns [] (not null).
	rec := doReq(http.MethodGet, "/api/services", nil)
	if rec.Code != http.StatusOK || strings.TrimSpace(rec.Body.String()) != "[]" {
		t.Fatalf("GET /api/services = %d %q", rec.Code, rec.Body.String())
	}

	// Create returns 201 with non-null assets & projects.
	rec = doReq(http.MethodPost, "/api/services", map[string]any{
		"name":        "PostgreSQL",
		"category":    "数据库",
		"builtin":     true,
		"description": "主库",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("POST /api/services = %d %s", rec.Code, rec.Body.String())
	}
	var created ServiceEntry
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode created: %v", err)
	}
	if created.ID == 0 || created.Assets == nil || created.Projects == nil {
		t.Fatalf("unexpected created payload: %+v", created)
	}

	// Duplicate returns 409.
	rec = doReq(http.MethodPost, "/api/services", map[string]any{"name": "postgresql"})
	if rec.Code != http.StatusConflict {
		t.Fatalf("duplicate POST = %d %s, want 409", rec.Code, rec.Body.String())
	}

	// Update returns 200.
	rec = doReq(http.MethodPut, fmt.Sprintf("/api/services/%d", created.ID), map[string]any{
		"name":        "PostgreSQL-Primary",
		"category":    "数据库",
		"builtin":     true,
		"description": "核心数据库",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("PUT /api/services/%d = %d %s", created.ID, rec.Code, rec.Body.String())
	}

	// Update missing returns 404.
	rec = doReq(http.MethodPut, "/api/services/999999", map[string]any{"name": "Missing"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("missing PUT = %d %s, want 404", rec.Code, rec.Body.String())
	}

	// Delete returns 204, second delete returns 404.
	rec = doReq(http.MethodDelete, fmt.Sprintf("/api/services/%d", created.ID), nil)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("DELETE /api/services/%d = %d %s", created.ID, rec.Code, rec.Body.String())
	}
	rec = doReq(http.MethodDelete, fmt.Sprintf("/api/services/%d", created.ID), nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("second DELETE = %d %s, want 404", rec.Code, rec.Body.String())
	}
}
