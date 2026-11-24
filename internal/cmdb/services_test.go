package cmdb

import (
	"context"
	"errors"
	"testing"
)

func TestAssetServiceInstances(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	instances := []ServiceInstance{{Name: "mysql", Port: 3306, Version: "8", Notes: "example"}, {Name: "custom-app"}}
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
	updated := []ServiceInstance{{Name: "mysql", Port: 3307}}
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
	bad := []ServiceInstance{{Name: "bad", Port: 65536}}
	fields.Services = &bad
	if _, err := SaveAsset(ctx, db, asset.ID, next.Version, fields, "tester"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("invalid service = %v", err)
	}
	items, err = ListAssets(ctx, db)
	if err != nil || len(*items[0].Services) != 1 || (*items[0].Services)[0].Port != 3307 {
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
