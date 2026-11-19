package cmdb

import (
	"context"
	"strings"
	"testing"
)

func TestImportRacksParsesAndValidates(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	room, err := SaveRoom(ctx, db, 0, RoomFields{Name: "import-room"}, 0, "tester")
	if err != nil {
		t.Fatalf("save room: %v", err)
	}

	csv := "机柜编号,区域/排,高度（U）\nA-01,A 区,42\nA-02,,24\n"
	result, err := ImportRacks(ctx, db, room.ID, strings.NewReader(csv), "tester")
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if result.Created != 2 {
		t.Fatalf("created = %d, want 2 (errors: %v)", result.Created, result.Errors)
	}

	facilities, err := ListFacilities(ctx, db)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	var heights []int
	for _, rack := range facilities.Racks {
		if rack.RoomID == room.ID {
			heights = append(heights, rack.HeightU)
		}
	}
	if len(heights) != 2 {
		t.Fatalf("racks in room = %d, want 2", len(heights))
	}
}

func TestImportRacksRejectsBadRows(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	room, err := SaveRoom(ctx, db, 0, RoomFields{Name: "import-bad-room"}, 0, "tester")
	if err != nil {
		t.Fatalf("save room: %v", err)
	}

	result, err := ImportRacks(ctx, db, room.ID, strings.NewReader("机柜编号,高度\n dup,42\nDUP,42\nbad,999\n"), "tester")
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if result.Created != 0 || len(result.Errors) < 2 {
		t.Fatalf("expected rejections, got created=%d errors=%v", result.Created, result.Errors)
	}

	_, err = ImportRacks(ctx, db, room.ID, strings.NewReader("区域,高度\nA,42\n"), "tester")
	if err == nil {
		t.Fatal("missing 机柜编号 column should error")
	}
}
