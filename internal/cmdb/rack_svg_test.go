package cmdb

import (
	"strings"
	"testing"
)

func TestRackElevationSVG(t *testing.T) {
	rack := Rack{ID: 7, RoomID: 1, RackFields: RackFields{Name: "SH-S01", Zone: "S 区", HeightU: 42}}
	placements := []RackPlacement{
		{PlacementFields: PlacementFields{RackID: 7, StartU: 1, Units: 2, Face: "front", Depth: "full"}, AssetID: 1},
		{PlacementFields: PlacementFields{RackID: 7, StartU: 9, Units: 1, Face: "front", Depth: "full"}, AssetID: 2},
		{PlacementFields: PlacementFields{RackID: 7, StartU: 20, Units: 1, Face: "rear", Depth: "half"}, AssetID: 3},
	}
	assets := map[int64]Asset{
		1: {ID: 1, Fields: Fields{Name: "demo-host-01", Status: "online"}},
		2: {ID: 2, Fields: Fields{Name: "demo-host-02", Status: "offline"}},
		3: {ID: 3, Fields: Fields{Name: "demo-rear-01", Status: "unknown"}},
	}

	front := RackElevationSVG(rack, placements, assets, "front", rackSVGOptions{})
	if !strings.Contains(front, `width="269"`) || !strings.Contains(front, `height="928"`) {
		t.Fatalf("unexpected size: %s", front[:120])
	}
	for _, want := range []string{"demo-host-01", `fill="#2ea043"`, `fill="#cf222e"`, `>42</text>`, `>1</text>`, "#fafafa"} {
		if !strings.Contains(front, want) {
			t.Fatalf("front drawing missing %q", want)
		}
	}
	if strings.Contains(front, "demo-rear-01") {
		t.Fatal("rear-only device leaked into the front drawing")
	}
	if strings.Contains(front, `data-unit=`) {
		t.Fatal("non-interactive drawing should not carry slot data")
	}

	interactive := RackElevationSVG(rack, placements, assets, "front", rackSVGOptions{Interactive: true})
	if !strings.Contains(interactive, `data-unit="42"`) || !strings.Contains(interactive, `data-asset="1"`) {
		t.Fatal("interactive drawing is missing click targets")
	}
	if !strings.Contains(interactive, "添加设备") {
		t.Fatal("interactive drawing is missing the add-device hint")
	}

	dark := RackElevationSVG(rack, placements, assets, "front", rackSVGOptions{Dark: true})
	if !strings.Contains(dark, "#0a0a0a") || strings.Contains(dark, "#fafafa") {
		t.Fatal("dark palette not applied")
	}

	rear := RackElevationSVG(rack, placements, assets, "rear", rackSVGOptions{})
	if !strings.Contains(rear, "demo-rear-01") || !strings.Contains(rear, "demo-host-01") {
		t.Fatal("rear drawing should show rear-only and full-depth devices")
	}
	if !strings.Contains(rear, `class="device-bar opposite"`) || !strings.Contains(rear, `fill="url(#rack-hatch)"`) {
		t.Fatal("front-mounted devices should be hatched in the rear drawing")
	}
	if strings.Contains(front, "url(#rack-hatch)") {
		t.Fatal("front drawing should not hatch its own devices")
	}
}
