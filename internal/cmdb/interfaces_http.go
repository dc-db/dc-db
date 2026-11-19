package cmdb

import (
	"net/http"
	"strconv"
)

func (s *Server) registerInterfaces(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/assets/{id}/interfaces", s.requireUser(false, s.listInterfaces))
	mux.HandleFunc("POST /api/assets/{id}/interfaces", s.requireUser(true, s.createInterface))
	mux.HandleFunc("PUT /api/assets/{id}/interfaces/{iid}", s.requireUser(true, s.updateInterface))
	mux.HandleFunc("DELETE /api/assets/{id}/interfaces/{iid}", s.requireUser(true, s.deleteInterface))
	mux.HandleFunc("POST /api/interfaces/{id}/connect", s.requireUser(true, s.connectInterface))
	mux.HandleFunc("POST /api/interfaces/{id}/disconnect", s.requireUser(true, s.disconnectInterface))
}

func pathValueID(w http.ResponseWriter, r *http.Request, name string) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue(name), 10, 64)
	if err != nil || id < 1 {
		fail(w, http.StatusBadRequest, "资源编号无效")
		return 0, false
	}
	return id, true
}

func (s *Server) listInterfaces(w http.ResponseWriter, r *http.Request) {
	assetID, ok := pathID(w, r)
	if !ok {
		return
	}
	items, err := ListInterfaces(r.Context(), s.db, assetID)
	if err != nil {
		s.databaseError(w, err)
		return
	}
	respond(w, http.StatusOK, items)
}

type interfaceInput struct {
	InterfaceFields
	Version int `json:"version"`
}

func (s *Server) createInterface(w http.ResponseWriter, r *http.Request) {
	assetID, ok := pathID(w, r)
	if !ok {
		return
	}
	var input interfaceInput
	if err := decode(w, r, &input); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	item, err := SaveInterface(r.Context(), s.db, assetID, 0, input.InterfaceFields, 0, currentUser(r).Username)
	if err != nil {
		s.databaseError(w, err)
		return
	}
	respond(w, http.StatusCreated, item)
}

func (s *Server) updateInterface(w http.ResponseWriter, r *http.Request) {
	assetID, ok := pathID(w, r)
	if !ok {
		return
	}
	id, ok := pathValueID(w, r, "iid")
	if !ok {
		return
	}
	var input interfaceInput
	if err := decode(w, r, &input); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	item, err := SaveInterface(r.Context(), s.db, assetID, id, input.InterfaceFields, input.Version, currentUser(r).Username)
	if err != nil {
		s.databaseError(w, err)
		return
	}
	respond(w, http.StatusOK, item)
}

func (s *Server) deleteInterface(w http.ResponseWriter, r *http.Request) {
	assetID, ok := pathID(w, r)
	if !ok {
		return
	}
	id, ok := pathValueID(w, r, "iid")
	if !ok {
		return
	}
	if err := DeleteInterface(r.Context(), s.db, assetID, id, currentUser(r).Username); err != nil {
		s.databaseError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) connectInterface(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var input struct {
		PeerID int64 `json:"peerId"`
	}
	if err := decode(w, r, &input); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if input.PeerID < 1 {
		fail(w, http.StatusBadRequest, "请选择对端接口")
		return
	}
	if err := ConnectInterface(r.Context(), s.db, id, input.PeerID, currentUser(r).Username); err != nil {
		s.databaseError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) disconnectInterface(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	if err := DisconnectInterface(r.Context(), s.db, id, currentUser(r).Username); err != nil {
		s.databaseError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
