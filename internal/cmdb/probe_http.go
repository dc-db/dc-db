package cmdb

import "net/http"

func (s *Server) listProbeResults(w http.ResponseWriter, r *http.Request) {
	results, err := ListProbeResults(r.Context(), s.db)
	if err != nil {
		s.databaseError(w, err)
		return
	}
	respond(w, http.StatusOK, results)
}

func (s *Server) getProbeSettings(w http.ResponseWriter, r *http.Request) {
	settings, err := GetProbeSettings(r.Context(), s.db)
	if err != nil {
		s.databaseError(w, err)
		return
	}
	respond(w, http.StatusOK, settings)
}

func (s *Server) updateProbeSettings(w http.ResponseWriter, r *http.Request) {
	var input ProbeSettings
	if err := decode(w, r, &input); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if input.IntervalSeconds < 10 || input.IntervalSeconds > 86400 {
		fail(w, http.StatusBadRequest, "探测间隔须为 10–86400 秒")
		return
	}
	if err := SetProbeSettings(r.Context(), s.db, input.IntervalSeconds, currentUser(r).Username); err != nil {
		s.databaseError(w, err)
		return
	}
	respond(w, http.StatusOK, input)
}
