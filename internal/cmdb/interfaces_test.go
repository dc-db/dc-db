package cmdb

import (
	"context"
	"database/sql"
	"testing"
)

func createInterfaceAsset(t *testing.T, db *sql.DB, name, kind string) int64 {
	t.Helper()
	created, err := SaveAsset(context.Background(), db, 0, 0, baseFields(kind, name), "tester")
	if err != nil {
		t.Fatalf("create asset %q: %v", name, err)
	}
	return created.ID
}

func TestInterfaceLifecycle(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()

	server := createInterfaceAsset(t, db, "if-host-01", "host")
	peer := createInterfaceAsset(t, db, "if-switch-01", "switch")

	first, err := SaveInterface(ctx, db, server, 0, InterfaceFields{
		Name: "eth0", Medium: "fiber", SpeedMbps: 10000, MAC: "AA-BB-CC-DD-EE-01", Status: "up",
	}, 0, "tester")
	if err != nil {
		t.Fatalf("create interface: %v", err)
	}
	if first.MAC != "aa:bb:cc:dd:ee:01" {
		t.Fatalf("MAC not normalised: %q", first.MAC)
	}

	if _, err := SaveInterface(ctx, db, server, 0, InterfaceFields{Name: "eth0"}, 0, "tester"); err == nil {
		t.Fatal("duplicate name should fail")
	}
	if _, err := SaveInterface(ctx, db, server, 0, InterfaceFields{Name: "bad", MAC: "nope"}, 0, "tester"); err == nil {
		t.Fatal("invalid mac should fail")
	}

	second, err := SaveInterface(ctx, db, peer, 0, InterfaceFields{Name: "Gi0/1"}, 0, "tester")
	if err != nil {
		t.Fatalf("create peer interface: %v", err)
	}

	if err := ConnectInterface(ctx, db, first.ID, second.ID, "tester"); err != nil {
		t.Fatalf("connect: %v", err)
	}
	if err := ConnectInterface(ctx, db, first.ID, second.ID, "tester"); err == nil {
		t.Fatal("double connect should fail")
	}

	items, err := ListInterfaces(ctx, db, server)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(items) != 1 || items[0].PeerID != second.ID || items[0].PeerAssetName != "if-switch-01" {
		t.Fatalf("unexpected peer: %+v", items)
	}

	// Connecting bumps the version on both sides, so reload before updating.
	current := items[0]
	updated, err := SaveInterface(ctx, db, server, current.ID, InterfaceFields{
		Name: "eth0", Medium: "fiber", SpeedMbps: 25000, MAC: "", Status: "down", Description: "上联",
	}, current.Version, "tester")
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if updated.SpeedMbps != 25000 || updated.Version != current.Version+1 {
		t.Fatalf("update not applied: %+v", updated)
	}
	if _, err := SaveInterface(ctx, db, server, current.ID, InterfaceFields{Name: "eth0"}, current.Version, "tester"); err == nil {
		t.Fatal("stale version should conflict")
	}

	if err := DisconnectInterface(ctx, db, first.ID, "tester"); err != nil {
		t.Fatalf("disconnect: %v", err)
	}
	items, err = ListInterfaces(ctx, db, server)
	if err != nil {
		t.Fatalf("list after disconnect: %v", err)
	}
	if items[0].PeerID != 0 {
		t.Fatalf("peer not cleared: %+v", items[0])
	}

	if err := DeleteInterface(ctx, db, server, first.ID, "tester"); err != nil {
		t.Fatalf("delete: %v", err)
	}
	items, err = ListInterfaces(ctx, db, server)
	if err != nil {
		t.Fatalf("list after delete: %v", err)
	}
	if len(items) != 0 {
		t.Fatalf("interface not deleted: %+v", items)
	}
}
