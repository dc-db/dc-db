package cmdb

import (
	"context"
	"database/sql"
	"errors"
	"testing"
)

func TestServiceAssets(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()

	svc, err := SaveService(ctx, db, 0, ServiceFields{Name: "demo-svc", Category: "Web 服务", Description: "测试服务"})
	if err != nil {
		t.Fatalf("create service: %v", err)
	}
	host, err := SaveAsset(ctx, db, 0, 0, baseFields("host", "svc-host-01"), "tester")
	if err != nil {
		t.Fatalf("create host: %v", err)
	}
	vm, err := SaveAsset(ctx, db, 0, 0, baseFields("vm", "svc-vm-01"), "tester")
	if err != nil {
		t.Fatalf("create vm: %v", err)
	}

	updated, err := SetServiceAssets(ctx, db, svc.ID, []int64{vm.ID, host.ID, vm.ID}, "tester")
	if err != nil {
		t.Fatalf("set service assets: %v", err)
	}
	if updated.AssetCount != 2 || len(updated.AssetIDs) != 2 {
		t.Fatalf("unexpected updated service: %+v", updated)
	}

	if _, err := SetServiceAssets(ctx, db, svc.ID, []int64{999999}, "tester"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("missing asset error = %v, want ErrInvalid", err)
	}
	if _, err := SetServiceAssets(ctx, db, 999999, []int64{host.ID}, "tester"); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("missing service error = %v, want sql.ErrNoRows", err)
	}

	listed, err := ListServices(ctx, db)
	if err != nil {
		t.Fatalf("list services: %v", err)
	}
	var found *Service
	for i := range listed {
		if listed[i].ID == svc.ID {
			found = &listed[i]
			break
		}
	}
	if found == nil || found.AssetCount != 2 || len(found.AssetIDs) != 2 {
		t.Fatalf("listed service = %+v", found)
	}

	cleared, err := SetServiceAssets(ctx, db, svc.ID, []int64{}, "tester")
	if err != nil {
		t.Fatalf("clear service assets: %v", err)
	}
	if cleared.AssetCount != 0 || len(cleared.AssetIDs) != 0 {
		t.Fatalf("cleared service = %+v", cleared)
	}
}

func TestSetAssetServices(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	host, err := SaveAsset(ctx, db, 0, 0, baseFields("host", "example-host"), "tester")
	if err != nil {
		t.Fatal(err)
	}
	vm, err := SaveAsset(ctx, db, 0, 0, baseFields("vm", "example-vm"), "tester")
	if err != nil {
		t.Fatal(err)
	}
	svc, err := SaveService(ctx, db, 0, ServiceFields{Name: "example-service"})
	if err != nil {
		t.Fatal(err)
	}
	if err := SetAssetServices(ctx, db, host.ID, []int64{svc.ID, svc.ID}, "tester"); err != nil {
		t.Fatal(err)
	}
	if err := SetAssetServices(ctx, db, vm.ID, []int64{svc.ID}, "tester"); err != nil {
		t.Fatal(err)
	}
	if err := SetAssetServices(ctx, db, host.ID, []int64{999999}, "tester"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("invalid service: %v", err)
	}
	var count int
	if err := db.QueryRowContext(ctx, "SELECT count(*) FROM asset_services WHERE service_id=$1", svc.ID).Scan(&count); err != nil || count != 2 {
		t.Fatalf("links after invalid update: %d, %v", count, err)
	}
	if err := SetAssetServices(ctx, db, host.ID, nil, "tester"); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, "SELECT count(*) FROM asset_services WHERE service_id=$1 AND asset_id=$2", svc.ID, vm.ID).Scan(&count); err != nil || count != 1 {
		t.Fatalf("other asset link: %d, %v", count, err)
	}
	changes, err := ListChanges(ctx, db, host.ID)
	if err != nil || len(changes) != 3 || changes[0].Action != "service_assets" {
		t.Fatalf("asset audit: %+v, %v", changes, err)
	}
}
