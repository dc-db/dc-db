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
