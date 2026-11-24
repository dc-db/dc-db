package cmdb

import (
	"context"
	"database/sql"
)

// ReferenceCounts returns the number of entries per 基础数据 category in one
// round trip, so the page does not have to fetch every list to build its
// sidebar counts.
func ReferenceCounts(ctx context.Context, db *sql.DB) (map[string]int64, error) {
	counts := map[string]int64{"groups": 0}
	queries := map[string]string{
		"groups": "SELECT count(*) FROM asset_groups",
	}
	for key, query := range queries {
		var count int64
		if err := db.QueryRowContext(ctx, query).Scan(&count); err != nil {
			return nil, err
		}
		counts[key] = count
	}
	rows, err := db.QueryContext(ctx, "SELECT kind, count(*) FROM metadata_entries GROUP BY kind")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var kind string
		var count int64
		if err := rows.Scan(&kind, &count); err != nil {
			return nil, err
		}
		counts[kind] = count
	}
	return counts, rows.Err()
}
