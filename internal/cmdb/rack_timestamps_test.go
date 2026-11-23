package cmdb

import (
	"context"
	"testing"
	"time"
)

func TestRackTimestamps(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	room, err := SaveRoom(ctx, db, 0, RoomFields{Name: "example-room"}, 0, "tester")
	if err != nil {
		t.Fatal(err)
	}
	fields := RackFields{Name: "example-rack", HeightU: 42}
	rack, err := SaveRack(ctx, db, 0, room.ID, fields, 0, "tester")
	if err != nil {
		t.Fatal(err)
	}
	if rack.CreatedAt == nil || rack.UpdatedAt == nil {
		t.Fatal("new rack must have creation and update times")
	}
	old := time.Date(2000, time.January, 1, 0, 0, 0, 0, time.UTC)
	if _, err := db.ExecContext(ctx, "UPDATE racks SET created_at=$2, updated_at=$2 WHERE id=$1", rack.ID, old); err != nil {
		t.Fatal(err)
	}
	unchanged, err := SaveRack(ctx, db, rack.ID, room.ID, fields, rack.Version, "tester")
	if err != nil {
		t.Fatal(err)
	}
	if unchanged.UpdatedAt == nil || !unchanged.UpdatedAt.Equal(old) {
		t.Fatal("unchanged rack must retain update time")
	}
	fields.Zone = "example-zone"
	updated, err := SaveRack(ctx, db, rack.ID, room.ID, fields, rack.Version, "tester")
	if err != nil {
		t.Fatal(err)
	}
	if updated.CreatedAt == nil || !updated.CreatedAt.Equal(old) || updated.UpdatedAt == nil || !updated.UpdatedAt.After(old) {
		t.Fatal("update must preserve creation time and refresh update time")
	}
	if _, err := db.ExecContext(ctx, "UPDATE racks SET created_at=NULL, updated_at=NULL WHERE id=$1", rack.ID); err != nil {
		t.Fatal(err)
	}
	layout, err := ListFacilities(ctx, db)
	if err != nil {
		t.Fatal(err)
	}
	if len(layout.Racks) != 1 || layout.Racks[0].CreatedAt != nil || layout.Racks[0].UpdatedAt != nil {
		t.Fatal("unknown historical times must remain empty")
	}
}
