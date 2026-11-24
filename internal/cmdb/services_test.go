package cmdb

import (
	"context"
	"errors"
	"testing"
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
