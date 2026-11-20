package cmdb

import (
	"net/http"
)

func (s *Server) listGroups(w http.ResponseWriter, r *http.Request) {
	groups, err := ListGroups(r.Context(), s.db)
	if err != nil {
		s.databaseError(w, err)
		return
	}
	respond(w, http.StatusOK, groups)
}

func (s *Server) saveGroup(w http.ResponseWriter, r *http.Request) {
	var id int64
	if r.Method == http.MethodPut {
		var ok bool
		id, ok = pathID(w, r)
		if !ok {
			return
		}
	}
	var fields GroupFields
	if err := decode(w, r, &fields); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	group, err := SaveGroup(r.Context(), s.db, id, fields)
	if err != nil {
		s.databaseError(w, err)
		return
	}
	status := http.StatusOK
	if id == 0 {
		status = http.StatusCreated
	}
	respond(w, status, group)
}

func (s *Server) deleteGroup(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	if err := DeleteGroup(r.Context(), s.db, id); err != nil {
		s.databaseError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) listServices(w http.ResponseWriter, r *http.Request) {
	services, err := ListServices(r.Context(), s.db)
	if err != nil {
		s.databaseError(w, err)
		return
	}
	respond(w, http.StatusOK, services)
}

func (s *Server) saveService(w http.ResponseWriter, r *http.Request) {
	var id int64
	if r.Method == http.MethodPut {
		var ok bool
		id, ok = pathID(w, r)
		if !ok {
			return
		}
	}
	var fields ServiceFields
	if err := decode(w, r, &fields); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	service, err := SaveService(r.Context(), s.db, id, fields)
	if err != nil {
		s.databaseError(w, err)
		return
	}
	status := http.StatusOK
	if id == 0 {
		status = http.StatusCreated
	}
	respond(w, status, service)
}

func (s *Server) deleteService(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	if err := DeleteService(r.Context(), s.db, id); err != nil {
		s.databaseError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) listMetadata(w http.ResponseWriter, r *http.Request) {
	entries, err := ListMetadata(r.Context(), s.db, r.URL.Query().Get("kind"))
	if err != nil {
		s.databaseError(w, err)
		return
	}
	respond(w, http.StatusOK, entries)
}

func (s *Server) saveMetadata(w http.ResponseWriter, r *http.Request) {
	var id int64
	if r.Method == http.MethodPut {
		var ok bool
		id, ok = pathID(w, r)
		if !ok {
			return
		}
	}
	var fields MetadataFields
	if err := decode(w, r, &fields); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	entry, err := SaveMetadata(r.Context(), s.db, id, fields)
	if err != nil {
		s.databaseError(w, err)
		return
	}
	status := http.StatusOK
	if id == 0 {
		status = http.StatusCreated
	}
	respond(w, status, entry)
}

func (s *Server) deleteMetadata(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	if err := DeleteMetadata(r.Context(), s.db, id); err != nil {
		s.databaseError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) referenceCounts(w http.ResponseWriter, r *http.Request) {
	counts, err := ReferenceCounts(r.Context(), s.db)
	if err != nil {
		s.databaseError(w, err)
		return
	}
	respond(w, http.StatusOK, counts)
}
