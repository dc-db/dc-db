package cmdb

import (
	"fmt"
	"strings"
)

// rackSVGOptions controls the palette and whether the drawing carries the data
// attributes the board uses for click targets.
type rackSVGOptions struct {
	Dark        bool
	Interactive bool
}

type rackPalette struct {
	bg         string
	slot       string
	slotBorder string
	frame      string
	unit       string
	hatchBg    string
	hatchLine  string
	hatchText  string
}

var rackPalettes = map[bool]rackPalette{
	false: {bg: "#f6f8fb", slot: "#e9ecef", slotBorder: "#adb5bd", frame: "#000000", unit: "#6c757d",
		hatchBg: "#f7f7f7", hatchLine: "#ffc0c0", hatchText: "#1a1a1a"},
	true: {bg: "#141414", slot: "#232323", slotBorder: "#303030", frame: "#6e6e6e", unit: "#adb5bd",
		hatchBg: "#f7f7f7", hatchLine: "#ffc0c0", hatchText: "#1a1a1a"},
}

var rackStatusColors = map[string]string{
	"online":  "#2ea043",
	"running": "#2ea043",
	"offline": "#cf222e",
	"stopped": "#cf222e",
	"paused":  "#bf8700",
}

func rackStatusColor(status string) string {
	if color, ok := rackStatusColors[status]; ok {
		return color
	}
	return "#6e7781"
}

// RackElevationSVG draws one face of a rack at NetBox's proportions: a 30px
// unit legend, a 220px wide rack, a 22px unit height and a 15px right margin.
func RackElevationSVG(rack Rack, placements []RackPlacement, assets map[int64]Asset, face string, options rackSVGOptions) string {
	const (
		unitWidth  = 220
		unitHeight = 22
		legend     = 30
		margin     = 15
		border     = 2
	)
	if face != "rear" {
		face = "front"
	}
	palette := rackPalettes[options.Dark]

	width := legend + border + unitWidth + margin + border
	height := unitHeight*rack.HeightU + border*2
	rackX := legend + border

	var body strings.Builder
	fmt.Fprintf(&body, `<defs><pattern id="rack-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">`+
		`<rect width="8" height="8" fill="%s"/><rect width="4" height="8" fill="%s"/></pattern></defs>`,
		palette.hatchBg, palette.hatchLine)
	fmt.Fprintf(&body, `<rect x="0" y="0" width="%d" height="%d" fill="%s"/>`, width, height, palette.bg)

	taken := make(map[int]bool)
	visible := make([]RackPlacement, 0, len(placements))
	for _, placement := range placements {
		if placement.RackID != rack.ID {
			continue
		}
		if placement.Depth != "full" && placement.Face != face {
			continue
		}
		visible = append(visible, placement)
		for offset := 0; offset < placement.Units; offset++ {
			taken[placement.StartU+offset] = true
		}
	}

	for index := 0; index < rack.HeightU; index++ {
		unit := rack.HeightU - index
		y := border + index*unitHeight
		slot := fmt.Sprintf(`<rect class="slot" x="%d" y="%d" width="%d" height="%d" fill="%s" stroke="%s" stroke-width="1"/>`,
			rackX, y, unitWidth, unitHeight, palette.slot, palette.slotBorder)
		if options.Interactive && !taken[unit] {
			body.WriteString(fmt.Sprintf(`<g class="slot-row" data-unit="%d">%s`, unit, slot))
			body.WriteString(fmt.Sprintf(`<text class="slot-add" x="%d" y="%d" font-size="12" fill="%s" text-anchor="middle" dominant-baseline="middle">＋ 添加设备</text></g>`,
				rackX+unitWidth/2, y+unitHeight/2, palette.unit))
		} else {
			body.WriteString(slot)
		}
		body.WriteString(fmt.Sprintf(`<text class="unit" x="%d" y="%d" font-size="14" fill="%s" text-anchor="middle" dominant-baseline="middle">%d</text>`,
			legend/2, y+unitHeight/2, palette.unit, unit))
	}

	for _, placement := range visible {
		asset := assets[placement.AssetID]
		label := asset.Name
		if label == "" {
			label = fmt.Sprintf("资产 #%d", placement.AssetID)
		}
		label = truncateRackLabel(label, unitWidth-10, 14)
		top := border + (rack.HeightU-(placement.StartU+placement.Units-1))*unitHeight
		blockHeight := placement.Units * unitHeight
		attrs := ""
		if options.Interactive {
			attrs = fmt.Sprintf(` data-asset="%d"`, placement.AssetID)
		}
		opposite := placement.Face != face
		fill := rackStatusColor(asset.Status)
		textFill := "#ffffff"
		class := "device-bar"
		if opposite {
			fill = "url(#rack-hatch)"
			textFill = palette.hatchText
			class = "device-bar opposite"
		}
		body.WriteString(fmt.Sprintf(`<g class="%s"%s><title>%s · U%d-%d</title>`, class, attrs, xmlText(label), placement.StartU, placement.StartU+placement.Units-1))
		body.WriteString(fmt.Sprintf(`<rect x="%d" y="%d" width="%d" height="%d" fill="%s"/>`, rackX, top, unitWidth, blockHeight, fill))
		body.WriteString(fmt.Sprintf(`<text class="device" x="%d" y="%d" font-size="14" fill="%s" text-anchor="middle" dominant-baseline="middle">%s</text></g>`,
			rackX+unitWidth/2, top+blockHeight/2, textFill, xmlText(label)))
	}

	body.WriteString(fmt.Sprintf(`<rect class="frame" x="%d" y="%d" width="%d" height="%d" fill="none" stroke="%s" stroke-width="2"/>`,
		rackX, border, unitWidth, unitHeight*rack.HeightU, palette.frame))

	return fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d" font-family="system-ui,-apple-system,Segoe UI,Roboto,Noto Sans SC,sans-serif">%s</svg>`,
		width, height, width, height, body.String())
}

// truncateRackLabel keeps a device name inside the rack width at the given
// font size, roughly 0.6em per rune.
func truncateRackLabel(value string, widthPx, fontSize int) string {
	limit := widthPx / (fontSize * 6 / 10)
	if limit < 4 {
		limit = 4
	}
	runes := []rune(value)
	if len(runes) <= limit {
		return value
	}
	return string(runes[:limit-1]) + "…"
}
