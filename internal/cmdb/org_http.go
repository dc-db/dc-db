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

func (s *Server) listPeople(w http.ResponseWriter, r *http.Request) {
	people, err := ListPeople(r.Context(), s.db, currentUser(r).Role == "admin")
	if err != nil {
		s.databaseError(w, err)
		return
	}
	respond(w, http.StatusOK, people)
}

func (s *Server) savePerson(w http.ResponseWriter, r *http.Request) {
	var fields PersonFields
	if err := decode(w, r, &fields); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if fields.Username != nil && currentUser(r).Role != "admin" {
		fail(w, http.StatusForbidden, "只有管理员可以关联登录账号")
		return
	}
	var id int64
	if r.Method == http.MethodPut {
		var ok bool
		id, ok = pathID(w, r)
		if !ok {
			return
		}
	}
	savedID, err := SavePerson(r.Context(), s.db, id, fields)
	if err != nil {
		s.databaseError(w, err)
		return
	}
	respondDirectorySave(w, id, savedID)
}

func (s *Server) listTeams(w http.ResponseWriter, r *http.Request) {
	teams, err := ListTeams(r.Context(), s.db)
	if err != nil {
		s.databaseError(w, err)
		return
	}
	respond(w, http.StatusOK, teams)
}

func (s *Server) saveTeam(w http.ResponseWriter, r *http.Request) {
	var fields TeamFields
	if err := decode(w, r, &fields); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	var id int64
	if r.Method == http.MethodPut {
		var ok bool
		id, ok = pathID(w, r)
		if !ok {
			return
		}
	}
	savedID, err := SaveTeam(r.Context(), s.db, id, fields)
	if err != nil {
		s.databaseError(w, err)
		return
	}
	respondDirectorySave(w, id, savedID)
}

func respondDirectorySave(w http.ResponseWriter, id, savedID int64) {
	status := http.StatusOK
	if id == 0 {
		status = http.StatusCreated
	}
	respond(w, status, map[string]int64{"id": savedID})
}

func (s *Server) deletePerson(w http.ResponseWriter, r *http.Request) {
	s.deleteOrganizationEntry(w, r, "DELETE FROM people WHERE id=$1")
}

func (s *Server) deleteTeam(w http.ResponseWriter, r *http.Request) {
	s.deleteOrganizationEntry(w, r, "DELETE FROM teams WHERE id=$1")
}

func (s *Server) deleteOrganizationEntry(w http.ResponseWriter, r *http.Request, query string) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	if err := deleteDirectoryEntry(r.Context(), s.db, query, id); err != nil {
		s.databaseError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
