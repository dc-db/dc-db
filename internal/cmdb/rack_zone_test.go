package cmdb

import (
	"context"
	"testing"
)

func TestRackZone(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()

	room, err := SaveRoom(ctx, db, 0, RoomFields{Name: "zone-room", Columns: 6, Rows: 4}, 0, "tester")
	if err != nil {
		t.Fatalf("create room: %v", err)
	}

	rack, err := SaveRack(ctx, db, 0, room.ID, RackFields{
		Name: "Z-01", Zone: "A 区", HeightU: 42, Column: 1, Row: 1,
	}, 0, "tester")
	if err != nil {
		t.Fatalf("create rack: %v", err)
	}
	if rack.Zone != "A 区" {
		t.Fatalf("zone not saved: %+v", rack)
	}

	facilities, err := ListFacilities(ctx, db)
	if err != nil {
		t.Fatalf("list facilities: %v", err)
	}
	found := false
	for _, item := range facilities.Racks {
		if item.ID == rack.ID {
			found = true
			if item.Zone != "A 区" {
				t.Fatalf("zone not read back: %+v", item)
			}
		}
	}
	if !found {
		t.Fatal("rack missing from facilities")
	}

	updated, err := SaveRack(ctx, db, rack.ID, room.ID, RackFields{
		Name: "Z-01", Zone: "B 区 3 排", HeightU: 42, Column: 1, Row: 1,
	}, rack.Version, "tester")
	if err != nil {
		t.Fatalf("update rack: %v", err)
	}
	if updated.Zone != "B 区 3 排" || updated.Version != rack.Version+1 {
		t.Fatalf("zone not updated: %+v", updated)
	}
}
