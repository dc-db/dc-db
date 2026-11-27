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
	"strings"
	"testing"
	"time"
)

func TestAssetServiceInstances(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	instances := []ServiceInstance{{Name: "mysql"}, {Name: "custom-app"}}
	fields := baseFields("host", "example-host")
	fields.Services = &instances
	asset, err := SaveAsset(ctx, db, 0, 0, fields, "tester")
	if err != nil {
		t.Fatal(err)
	}
	items, err := ListAssets(ctx, db)
	if err != nil || len(items) != 1 || items[0].Services == nil || len(*items[0].Services) != 2 {
		t.Fatalf("list services: %+v, %v", items, err)
	}
	updated := []ServiceInstance{{Name: "redis"}}
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
	bad := []ServiceInstance{{Name: ""}}
	fields.Services = &bad
	if _, err := SaveAsset(ctx, db, asset.ID, next.Version, fields, "tester"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("invalid service = %v", err)
	}
	items, err = ListAssets(ctx, db)
	if err != nil || len(*items[0].Services) != 1 || (*items[0].Services)[0].Name != "redis" {
		t.Fatalf("invalid update changed services: %+v %v", items, err)
	}
	empty := []ServiceInstance{}
	fields.Services = &empty
	if _, err := SaveAsset(ctx, db, asset.ID, next.Version, fields, "tester"); err != nil {
		t.Fatal(err)
	}
	items, err = ListAssets(ctx, db)
	if err != nil || items[0].Services != nil {
		t.Fatalf("clear services: %+v %v", items, err)
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
	group, err := SaveGroup(ctx, db, 0, GroupFields{Name: "核心交易"})
	if err != nil {
		t.Fatalf("create group: %v", err)
	}

	created, err := SaveService(ctx, db, 0, ServiceInput{
		Name:        "Redis",
		Category:    "cache",
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

	// Rename service without passing AssetIDs: existing deployments must stay linked.
	updated, err := SaveService(ctx, db, created.ID, ServiceInput{
		Name:        "Redis-Cluster",
		Category:    "cache",
		Builtin:     true,
		Description: "主缓存集群",
	}, "tester")
	if err != nil {
		t.Fatalf("update service: %v", err)
	}
	if updated.Name != "Redis-Cluster" || updated.AssetCount != 2 || updated.ProjectCount != 1 {
		t.Fatalf("rename broke links: %+v", updated)
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

	// Asset service instances should have been removed on delete.
	assets, err := ListAssets(ctx, db)
	if err != nil {
		t.Fatalf("list assets: %v", err)
	}
	for _, a := range assets {
		if a.Services != nil && len(*a.Services) > 0 {
			t.Fatalf("asset %s still has services after delete: %+v", a.Name, *a.Services)
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
	token := "svc-test-token"
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
		"category":    "database",
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
		"category":    "database",
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
