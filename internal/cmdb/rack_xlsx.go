package cmdb

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"fmt"
	"strings"
)

// rackSheet is a single rack elevation rendered as an XLSX worksheet: one row
// per rack unit, a coloured bar for every mounted device and a frozen header,
// so the printed or shared file reads like the on-screen elevation.

type sheetCell struct {
	ref   string
	style int
	text  string
}

type sheetMerge struct {
	ref string
}

var rackStatusFill = map[string]int{
	"online":  4,
	"running": 4,
	"offline": 5,
	"stopped": 5,
	"paused":  6,
}

func rackStatusStyle(status string) int {
	if style, ok := rackStatusFill[status]; ok {
		return style
	}
	return 7
}

func xmlText(value string) string {
	var buf bytes.Buffer
	if err := xml.EscapeText(&buf, []byte(value)); err != nil {
		return value
	}
	return buf.String()
}

func rackSheetName(value string) string {
	name := strings.Map(func(r rune) rune {
		switch r {
		case ':', '\\', '/', '?', '*', '[', ']':
			return '-'
		}
		return r
	}, value)
	if len([]rune(name)) > 28 {
		name = string([]rune(name)[:28])
	}
	if name == "" {
		name = "机柜立面"
	}
	return name
}

// RackElevationXLSX renders the given face of a rack as an XLSX workbook.
func RackElevationXLSX(rack Rack, room Room, placements []RackPlacement, assets map[int64]Asset, face string) []byte {
	if face != "rear" {
		face = "front"
	}
	visible := make([]RackPlacement, 0, len(placements))
	taken := make(map[int]bool)
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

	firstUnitRow := 3
	lastUnitRow := firstUnitRow + rack.HeightU - 1
	cells := make([]sheetCell, 0, rack.HeightU*2+2)
	merges := []string{"A1:B1"}

	cells = append(cells,
		sheetCell{ref: "A1", style: 8, text: fmt.Sprintf("%s · %s · %dU · %s", rack.Name, room.Name, rack.HeightU, faceLabel(face))},
		sheetCell{ref: "A2", style: 1, text: "U"},
		sheetCell{ref: "B2", style: 1, text: "设备"},
	)

	for index := 0; index < rack.HeightU; index++ {
		unit := rack.HeightU - index
		row := firstUnitRow + index
		cells = append(cells, sheetCell{ref: fmt.Sprintf("A%d", row), style: 2, text: fmt.Sprintf("%d", unit)})
		if !taken[unit] {
			cells = append(cells, sheetCell{ref: fmt.Sprintf("B%d", row), style: 3})
		}
	}

	for _, placement := range visible {
		asset := assets[placement.AssetID]
		top := firstUnitRow + (rack.HeightU - (placement.StartU + placement.Units - 1))
		bottom := top + placement.Units - 1
		style := rackStatusStyle(asset.Status)
		if placement.Face != face {
			style = 9
		}
		label := asset.Name
		if label == "" {
			label = fmt.Sprintf("资产 #%d", placement.AssetID)
		}
		for row := top; row <= bottom; row++ {
			cells = append(cells, sheetCell{ref: fmt.Sprintf("B%d", row), style: style, text: ""})
		}
		cells = append(cells, sheetCell{ref: fmt.Sprintf("B%d", top), style: style, text: label})
		if bottom > top {
			merges = append(merges, fmt.Sprintf("B%d:B%d", top, bottom))
		}
	}

	sheetXML := buildSheetXML(cells, merges, firstUnitRow, lastUnitRow)

	var out bytes.Buffer
	archive := zip.NewWriter(&out)
	write := func(name, content string) {
		writer, err := archive.Create(name)
		if err != nil {
			return
		}
		_, _ = writer.Write([]byte(content))
	}

	write("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`)
	write("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`)
	write("xl/workbook.xml", fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="%s" sheetId="1" r:id="rId1"/></sheets>
</workbook>`, xmlText(rackSheetName(rack.Name))))
	write("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`)
	write("xl/styles.xml", rackStylesXML)
	write("xl/worksheets/sheet1.xml", sheetXML)
	_ = archive.Close()

	return out.Bytes()
}

func faceLabel(face string) string {
	if face == "rear" {
		return "后视图"
	}
	return "前视图"
}

func buildSheetXML(cells []sheetCell, merges []string, firstRow, lastRow int) string {
	var buf strings.Builder
	buf.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView tabSelected="1" workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="18"/>
<cols><col min="1" max="1" width="6" customWidth="1"/><col min="2" max="2" width="36" customWidth="1"/></cols>
<sheetData>`)

	rows := make(map[int][]sheetCell)
	order := make([]int, 0, 64)
	for _, cell := range cells {
		row := cellRow(cell.ref)
		if _, seen := rows[row]; !seen {
			order = append(order, row)
		}
		rows[row] = append(rows[row], cell)
	}
	for _, row := range order {
		buf.WriteString(fmt.Sprintf(`<row r="%d">`, row))
		for _, cell := range rows[row] {
			if cell.text == "" {
				buf.WriteString(fmt.Sprintf(`<c r="%s" s="%d"/>`, cell.ref, cell.style))
				continue
			}
			buf.WriteString(fmt.Sprintf(`<c r="%s" s="%d" t="inlineStr"><is><t>%s</t></is></c>`, cell.ref, cell.style, xmlText(cell.text)))
		}
		buf.WriteString(`</row>`)
	}
	buf.WriteString(`</sheetData>`)
	if len(merges) > 0 {
		buf.WriteString(fmt.Sprintf(`<mergeCells count="%d">`, len(merges)))
		for _, ref := range merges {
			buf.WriteString(fmt.Sprintf(`<mergeCell ref="%s"/>`, ref))
		}
		buf.WriteString(`</mergeCells>`)
	}
	buf.WriteString(fmt.Sprintf(`<dimension ref="A1:B%d"/>`, lastRow))
	buf.WriteString(`</worksheet>`)
	return buf.String()
}

func cellRow(ref string) int {
	row := 0
	for _, r := range ref {
		if r < '0' || r > '9' {
			continue
		}
		row = row*10 + int(r-'0')
	}
	return row
}

const rackStylesXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="4">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
</fonts>
<fills count="10">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE7E6E6"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF7F7F7"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF2EA043"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFCF222E"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFBF8700"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF6E7781"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="lightUp"><fgColor rgb="FFFFC0C0"/><bgColor rgb="FFF7F7F7"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="10">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="5" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="6" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="7" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="8" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
<xf numFmtId="0" fontId="1" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="9" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`
