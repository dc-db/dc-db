package cmdb

import (
	"context"
	"net/http"
	"net/http/httptest"
	"runtime"
	"strings"
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

func TestProbeRoundAndSettings(t *testing.T) {
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
	if err := SetProbeSettings(ctx, db, 9, "tester"); err == nil {
		t.Fatal("invalid interval accepted")
	}
	if err := SetProbeSettings(ctx, db, 30, "tester"); err != nil {
		t.Fatal(err)
	}
	settings, err := GetProbeSettings(ctx, db)
	if err != nil || settings.IntervalSeconds != 30 {
		t.Fatalf("settings: %+v, %v", settings, err)
	}
	changes, err := ListChanges(ctx, db, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(changes) == 0 || changes[0].Action != "probe.settings" {
		t.Fatal("setting change was not audited")
	}
}

func TestProbeSettingsPermissions(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	for _, user := range []struct{ name, role, token string }{
		{"example-admin", "admin", strings.Repeat("a", 43)},
		{"example-viewer", "viewer", strings.Repeat("b", 43)},
	} {
		if err := EnsureUser(ctx, db, user.name, "example-password-only", user.role); err != nil {
			t.Fatal(err)
		}
		if _, err := db.ExecContext(ctx, "INSERT INTO sessions (token_hash,username,expires_at) VALUES ($1,$2,'2099-01-01T00:00:00Z')", sessionHash(user.token), user.name); err != nil {
			t.Fatal(err)
		}
	}
	handler := NewServer(db, false, http.NotFoundHandler())
	for _, tc := range []struct {
		token, method, body string
		want                int
	}{
		{"", "GET", "", http.StatusUnauthorized},
		{strings.Repeat("b", 43), "GET", "", http.StatusForbidden},
		{strings.Repeat("b", 43), "PUT", `{"intervalSeconds":60}`, http.StatusForbidden},
		{strings.Repeat("a", 43), "PUT", `{"intervalSeconds":9}`, http.StatusBadRequest},
		{strings.Repeat("a", 43), "PUT", `{"intervalSeconds":60}`, http.StatusOK},
		{strings.Repeat("a", 43), "GET", "", http.StatusOK},
	} {
		req := httptest.NewRequest(tc.method, "/api/probe-settings", strings.NewReader(tc.body))
		if tc.body != "" {
			req.Header.Set("Content-Type", "application/json")
		}
		if tc.token != "" {
			req.AddCookie(&http.Cookie{Name: sessionCookie, Value: tc.token})
		}
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != tc.want {
			t.Errorf("%s: got %d, want %d", tc.method, rec.Code, tc.want)
		}
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
