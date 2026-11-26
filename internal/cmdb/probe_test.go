package cmdb

import (
	"context"
	"runtime"
	"sync/atomic"
	"testing"
)

func TestProbeValidation(t *testing.T) {
	for _, tc := range []struct {
		kind, address  string
		enabled, valid bool
	}{
		{"host", "192.0.2.1", true, true}, {"vm", "2001:db8::1", true, true},
		{"host", "", true, false}, {"host", "example.invalid", true, false},
		{"host", "192.0.2.0/24", true, false}, {"switch", "192.0.2.1", true, true}, {"router", "192.0.2.1", true, true}, {"firewall", "192.0.2.1", true, true}, {"load_balancer", "192.0.2.1", true, true},
		{"host", "example.invalid", false, true},
	} {
		fields := baseFields(tc.kind, "example")
		fields.Address, fields.ProbeEnabled = tc.address, tc.enabled
		if err := validateFields(&fields); (err == nil) != tc.valid {
			t.Errorf("validation for %q, enabled=%v: %v", tc.kind, tc.enabled, err)
		}
	}
}

func TestProbeRound(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	create := func(name, address string, enabled bool) Asset {
		fields := baseFields("host", name)
		fields.Address = address
		fields.ProbeEnabled = enabled
		asset, err := SaveAsset(ctx, db, 0, 0, fields, "tester")
		if err != nil {
			t.Fatal(err)
		}
		return asset
	}
	enabled := create("example-enabled", "192.0.2.1", true)
	disabled := create("example-disabled", "192.0.2.2", false)
	stale := create("example-stale", "192.0.2.3", true)
	networkFields := baseFields("switch", "example-switch")
	networkFields.Address, networkFields.ProbeEnabled = "192.0.2.5", true
	network, err := SaveAsset(ctx, db, 0, 0, networkFields, "tester")
	if err != nil {
		t.Fatal(err)
	}
	var calls atomic.Int32
	err = runProbeRound(ctx, db, func(ctx context.Context, address string) string {
		calls.Add(1)
		if address == "192.0.2.3" {
			_, err := db.ExecContext(ctx, "UPDATE assets SET address=$1 WHERE id=$2", "192.0.2.4", stale.ID)
			if err != nil {
				t.Error(err)
			}
		}
		if address == "192.0.2.5" {
			return "unreachable"
		}
		return "reachable"
	})
	if err != nil {
		t.Fatal(err)
	}
	if calls.Load() != 3 {
		t.Fatalf("probed %d assets, want 3", calls.Load())
	}
	assets, err := ListAssets(ctx, db)
	if err != nil {
		t.Fatal(err)
	}
	found := map[int64]Asset{}
	for _, asset := range assets {
		found[asset.ID] = asset
	}
	if found[enabled.ID].ProbeStatus != "reachable" || found[enabled.ID].ProbeCheckedAt == nil {
		t.Fatal("enabled asset did not receive probe result")
	}
	if found[network.ID].ProbeStatus != "unreachable" || found[network.ID].ProbeCheckedAt == nil {
		t.Fatal("network device did not receive probe result")
	}
	results, err := ListProbeResults(ctx, db)
	if err != nil || len(results) != 4 {
		t.Fatalf("probe results do not include network devices: %v", err)
	}
	if found[disabled.ID].ProbeStatus != "unknown" || found[disabled.ID].ProbeCheckedAt != nil {
		t.Fatal("disabled asset was probed")
	}
	if found[stale.ID].ProbeStatus != "unknown" || found[stale.ID].ProbeCheckedAt != nil {
		t.Fatal("stale probe result was applied")
	}
	// Only enabled assets whose last check was over 60 seconds ago are due.
	if _, err := db.ExecContext(ctx, `
		UPDATE assets SET probe_checked_at=now() -
		    CASE WHEN id IN ($1,$2) THEN interval '61 seconds' ELSE interval '59 seconds' END`,
		enabled.ID, disabled.ID); err != nil {
		t.Fatal(err)
	}
	calls.Store(0)
	if err := runProbeRound(ctx, db, func(_ context.Context, address string) string {
		calls.Add(1)
		if address != enabled.Address {
			t.Errorf("probed asset that was not due: %s", address)
		}
		return "reachable"
	}); err != nil {
		t.Fatal(err)
	}
	if calls.Load() != 1 {
		t.Fatalf("probed %d due assets, want 1", calls.Load())
	}
}

func TestProbeLoopback(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("ping command uses Linux iputils options")
	}
	ctx := context.Background()
	if result := pingAddress(ctx, "127.0.0.1"); result == "error" {
		t.Skip("ping command or ICMP permissions unavailable")
	} else if result != "reachable" {
		t.Fatalf("loopback probe: %s", result)
	}
	db := testDB(t)
	fields := baseFields("host", "example-loopback")
	fields.Address, fields.ProbeEnabled = "127.0.0.1", true
	asset, err := SaveAsset(ctx, db, 0, 0, fields, "tester")
	if err != nil {
		t.Fatal(err)
	}
	if err := runProbeRound(ctx, db, pingAddress); err != nil {
		t.Fatal(err)
	}
	assets, err := ListAssets(ctx, db)
	if err != nil || len(assets) != 1 || assets[0].ProbeStatus != "reachable" || assets[0].ProbeCheckedAt == nil {
		t.Fatalf("unexpected probe result: %v", err)
	}
	fields.Address = "192.0.2.1"
	updated, err := SaveAsset(ctx, db, asset.ID, asset.Version, fields, "tester")
	if err != nil {
		t.Fatal(err)
	}
	if updated.ProbeStatus != "unknown" || updated.ProbeCheckedAt != nil {
		t.Fatal("address change must clear the old probe result")
	}
}
