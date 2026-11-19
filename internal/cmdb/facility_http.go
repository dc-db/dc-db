package cmdb

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"unicode/utf8"
)

func (s *Server) registerFacilities(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/facilities", s.requireUser(false, s.listFacilities))
	mux.HandleFunc("GET /api/racks/{id}/elevation.xlsx", s.requireUser(false, s.exportRackElevation))
	mux.HandleFunc("GET /api/racks/{id}/elevation.svg", s.requireUser(false, s.exportRackSVG))
	mux.HandleFunc("POST /api/regions", s.requireUser(true, s.saveRegion))
	mux.HandleFunc("PUT /api/regions/{id}", s.requireUser(true, s.saveRegion))
	mux.HandleFunc("DELETE /api/regions/{id}", s.requireUser(true, s.deleteFacility(DeleteRegion)))
	mux.HandleFunc("POST /api/rooms", s.requireUser(true, s.saveRoom))
	mux.HandleFunc("PUT /api/rooms/{id}", s.requireUser(true, s.saveRoom))
	mux.HandleFunc("DELETE /api/rooms/{id}", s.requireUser(true, s.deleteFacility(DeleteRoom)))
	mux.HandleFunc("POST /api/rooms/{id}/racks", s.requireUser(true, s.saveRack))
	mux.HandleFunc("PUT /api/racks/{id}", s.requireUser(true, s.saveRack))
	mux.HandleFunc("DELETE /api/racks/{id}", s.requireUser(true, s.deleteFacility(DeleteRack)))
	mux.HandleFunc("POST /api/placements", s.requireUser(true, s.savePlacement))
	mux.HandleFunc("PUT /api/assets/{id}/placement", s.requireUser(true, s.savePlacement))
	mux.HandleFunc("DELETE /api/assets/{id}/placement", s.requireUser(true, s.deleteFacility(DeletePlacement)))
}

func (s *Server) listFacilities(w http.ResponseWriter, r *http.Request) {
	items, err := ListFacilities(r.Context(), s.db)
	if err != nil {
		s.databaseError(w, err)
		return
	}
	respond(w, http.StatusOK, items)
}

func (s *Server) saveRegion(w http.ResponseWriter, r *http.Request) {
	var id int64
	if r.Method == http.MethodPut {
		var ok bool
		id, ok = pathID(w, r)
		if !ok {
			return
		}
	}
	var input struct {
		RegionFields
		Version int `json:"version"`
	}
	if err := decode(w, r, &input); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	region, err := SaveRegion(r.Context(), s.db, id, input.RegionFields, input.Version, currentUser(r).Username)
	s.respondFacility(w, r, region, err)
}

func (s *Server) saveRoom(w http.ResponseWriter, r *http.Request) {
	var id int64
	if r.Method == http.MethodPut {
		var ok bool
		id, ok = pathID(w, r)
		if !ok {
			return
		}
	}

	var input struct {
		RoomFields
		Version int `json:"version"`
	}
	if err := decode(w, r, &input); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" || utf8.RuneCountInString(input.Name) > 160 {
		fail(w, http.StatusBadRequest, "数据中心名称须为 1–160 个字符")
		return
	}
	room, err := SaveRoom(r.Context(), s.db, id, input.RoomFields, input.Version, currentUser(r).Username)
	s.respondFacility(w, r, room, err)
}

func (s *Server) saveRack(w http.ResponseWriter, r *http.Request) {
	target, ok := pathID(w, r)
	if !ok {
		return
	}
	var rackID, roomID int64
	if r.Method == http.MethodPost {
		roomID = target
	} else {
		rackID = target
	}

	var input struct {
		RackFields
		Version int `json:"version"`
	}
	if err := decode(w, r, &input); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" || utf8.RuneCountInString(input.Name) > 80 {
		fail(w, http.StatusBadRequest, "机柜名称须为 1–80 个字符")
		return
	}
	input.Zone = strings.TrimSpace(input.Zone)
	if utf8.RuneCountInString(input.Zone) > 40 {
		fail(w, http.StatusBadRequest, "机柜区域不能超过 40 个字符")
		return
	}
	if input.HeightU < 1 || input.HeightU > 80 {
		fail(w, http.StatusBadRequest, "机柜高度须为 1–80U")
		return
	}
	rack, err := SaveRack(r.Context(), s.db, rackID, roomID, input.RackFields, input.Version, currentUser(r).Username)
	s.respondFacility(w, r, rack, err)
}

func (s *Server) savePlacement(w http.ResponseWriter, r *http.Request) {
	var assetID int64
	if r.Method == http.MethodPut {
		var ok bool
		assetID, ok = pathID(w, r)
		if !ok {
			return
		}
	}

	var input struct {
		PlacementFields
		Version  int     `json:"version"`
		NewAsset *Fields `json:"newAsset"`
	}
	if err := decode(w, r, &input); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if input.RackID < 1 || input.StartU < 1 || input.StartU > 80 || input.Units < 1 || input.Units > 80 {
		fail(w, http.StatusBadRequest, "请选择机柜并填写有效的起始 U 位和设备高度")
		return
	}
	if assetID == 0 {
		if input.NewAsset == nil {
			fail(w, http.StatusBadRequest, "请填写待新建的设备")
			return
		}
		if err := validateFields(input.NewAsset); err != nil {
			fail(w, http.StatusBadRequest, err.Error())
			return
		}
		if !mountable(input.NewAsset.Kind) || input.NewAsset.Lifecycle != "active" {
			fail(w, http.StatusBadRequest, "只能上架在册的物理机或交换机")
			return
		}
	} else if input.NewAsset != nil {
		fail(w, http.StatusBadRequest, "请从现有资产中选择设备")
		return
	}
	placement, err := SavePlacement(r.Context(), s.db, assetID, input.NewAsset, input.PlacementFields, input.Version, currentUser(r).Username)
	s.respondFacility(w, r, placement, err)
}

func (s *Server) respondFacility(w http.ResponseWriter, r *http.Request, body any, err error) {
	if err != nil {
		s.databaseError(w, err)
		return
	}
	status := http.StatusOK
	if r.Method == http.MethodPost {
		status = http.StatusCreated
	}
	respond(w, status, body)
}

func (s *Server) deleteFacility(remove func(context.Context, *sql.DB, int64, int, string) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathID(w, r)
		if !ok {
			return
		}
		version, err := strconv.Atoi(r.URL.Query().Get("version"))
		if err != nil || version < 1 {
			fail(w, http.StatusBadRequest, "记录版本无效，请刷新后重试")
			return
		}
		if err := remove(r.Context(), s.db, id, version, currentUser(r).Username); err != nil {
			s.databaseError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

type rackExportData struct {
	rack       Rack
	room       Room
	placements []RackPlacement
	assets     map[int64]Asset
}

// loadRackExport gathers the pieces both export endpoints need.
func (s *Server) loadRackExport(ctx context.Context, id int64) (rackExportData, bool, error) {
	facilities, err := ListFacilities(ctx, s.db)
	if err != nil {
		return rackExportData{}, false, err
	}
	var data rackExportData
	found := false
	for _, item := range facilities.Racks {
		if item.ID == id {
			data.rack = item
			found = true
			break
		}
	}
	if !found {
		return rackExportData{}, false, nil
	}
	for _, item := range facilities.Rooms {
		if item.ID == data.rack.RoomID {
			data.room = item
			break
		}
	}
	assets, err := ListAssets(ctx, s.db)
	if err != nil {
		return rackExportData{}, false, err
	}
	data.assets = make(map[int64]Asset, len(assets))
	for _, asset := range assets {
		data.assets[asset.ID] = asset
	}
	data.placements = facilities.Placements
	return data, true, nil
}

// exportRackSVG serves one face of a rack as a standalone SVG drawing.
func (s *Server) exportRackSVG(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	data, found, err := s.loadRackExport(r.Context(), id)
	if err != nil {
		s.databaseError(w, err)
		return
	}
	if !found {
		fail(w, http.StatusNotFound, "机柜不存在")
		return
	}
	face := strings.TrimSpace(r.URL.Query().Get("face"))
	if face != "rear" {
		face = "front"
	}
	theme := strings.TrimSpace(r.URL.Query().Get("theme"))
	drawing := RackElevationSVG(data.rack, data.placements, data.assets, face, rackSVGOptions{Dark: theme == "dark"})

	w.Header().Set("Content-Type", "image/svg+xml; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=\"rack-elevation.svg\"; filename*=UTF-8''"+url.PathEscape(fmt.Sprintf("%s-%s.svg", data.rack.Name, faceLabel(face))))
	_, _ = w.Write([]byte(drawing))
}

// exportRackElevation serves one face of a rack as an XLSX sheet whose rows and
// fills mirror the on-screen elevation.
func (s *Server) exportRackElevation(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	data, found, err := s.loadRackExport(r.Context(), id)
	if err != nil {
		s.databaseError(w, err)
		return
	}
	if !found {
		fail(w, http.StatusNotFound, "机柜不存在")
		return
	}
	face := strings.TrimSpace(r.URL.Query().Get("face"))
	if face != "rear" {
		face = "front"
	}

	file := RackElevationXLSX(data.rack, data.room, data.placements, data.assets, face)
	name := fmt.Sprintf("%s-%s.xlsx", data.rack.Name, faceLabel(face))
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", "attachment; filename=\"rack-elevation.xlsx\"; filename*=UTF-8''"+url.PathEscape(name))
	w.Header().Set("Content-Length", strconv.Itoa(len(file)))
	_, _ = w.Write(file)
}
