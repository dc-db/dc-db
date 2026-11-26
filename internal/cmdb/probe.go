package cmdb

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"net/netip"
	"os/exec"
	"sync"
	"time"
)

const (
	probeConcurrency     = 32
	probeIntervalSeconds = 60
)

type probeTarget struct {
	id      int64
	version int
	address string
}

type ProbeResult struct {
	ID        int64      `json:"id"`
	Version   int        `json:"version"`
	Status    string     `json:"status"`
	CheckedAt *time.Time `json:"checkedAt"`
}

func ListProbeResults(ctx context.Context, db *sql.DB) ([]ProbeResult, error) {
	rows, err := db.QueryContext(ctx, "SELECT id,version,probe_status,probe_checked_at FROM assets ORDER BY id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	results := make([]ProbeResult, 0)
	for rows.Next() {
		var result ProbeResult
		if err := rows.Scan(&result.ID, &result.Version, &result.Status, &result.CheckedAt); err != nil {
			return nil, err
		}
		results = append(results, result)
	}
	return results, rows.Err()
}

// RunProbeWorker performs bounded, periodic ICMP checks from the application host.
func RunProbeWorker(ctx context.Context, db *sql.DB) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		if err := runProbeRound(ctx, db, pingAddress); err != nil && ctx.Err() == nil {
			slog.Error("存活探测任务失败", "error", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func runProbeRound(ctx context.Context, db *sql.DB, probe func(context.Context, string) string) error {
	rows, err := db.QueryContext(ctx, `SELECT id,address,version FROM assets
        WHERE probe_enabled AND lifecycle='active'
          AND (probe_checked_at IS NULL OR probe_checked_at <= now() - make_interval(secs => $1))
        ORDER BY probe_checked_at NULLS FIRST, id LIMIT 5000`, probeIntervalSeconds)
	if err != nil {
		return err
	}
	targets := make([]probeTarget, 0)
	for rows.Next() {
		var target probeTarget
		if err := rows.Scan(&target.id, &target.address, &target.version); err != nil {
			rows.Close()
			return err
		}
		targets = append(targets, target)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()
	jobs := make(chan probeTarget)
	var wg sync.WaitGroup
	for range probeConcurrency {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for target := range jobs {
				status := probe(ctx, target.address)
				if ctx.Err() != nil {
					return
				}
				// Do not apply a stale result if the address or probe setting changed.
				if _, err := db.ExecContext(ctx, `UPDATE assets SET probe_status=$1,probe_checked_at=now()
                    WHERE id=$2 AND address=$3 AND version=$4 AND probe_enabled AND lifecycle='active'`, status, target.id, target.address, target.version); err != nil && ctx.Err() == nil {
					slog.Error("保存存活探测结果失败", "error", err)
				}
			}
		}()
	}
	for _, target := range targets {
		select {
		case jobs <- target:
		case <-ctx.Done():
			close(jobs)
			wg.Wait()
			return ctx.Err()
		}
	}
	close(jobs)
	wg.Wait()
	return nil
}

func pingAddress(ctx context.Context, address string) string {
	ip, err := netip.ParseAddr(address)
	if err != nil || ip.Zone() != "" {
		return "error"
	}
	probeCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()
	err = exec.CommandContext(probeCtx, "ping", "-n", "-c", "1", "-W", "2", ip.String()).Run()
	if err == nil {
		return "reachable"
	}
	var exit *exec.ExitError
	if errors.As(err, &exit) && exit.ExitCode() == 1 {
		return "unreachable"
	}
	return "error"
}
