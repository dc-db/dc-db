package cmdb

import (
	"context"
	"database/sql"
	_ "embed"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	_ "github.com/jackc/pgx/v5/stdlib"
)

//go:embed schema.sql
var schemaSQL string

// Open connects to the PostgreSQL database described by dsn. schema.sql is the
// only schema source: there are no migrations while the project is in
// development, so an existing database is expected to match this file.
func Open(dsn string) (*sql.DB, error) {
	if strings.TrimSpace(dsn) == "" {
		return nil, errors.New("数据库连接串为空")
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(16)
	db.SetMaxIdleConns(8)
	db.SetConnMaxLifetime(time.Hour)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("连接数据库: %w", err)
	}
	return db, nil
}

// Initialize creates the schema on an empty database. It is a no-op once the
// assets table exists, which keeps restarts cheap and makes the call safe in
// tests.
func Initialize(ctx context.Context, db *sql.DB) error {
	var initialized bool
	if err := db.QueryRowContext(ctx,
		"SELECT to_regclass('public.assets') IS NOT NULL").Scan(&initialized); err != nil {
		return err
	}
	if initialized {
		return nil
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, schemaSQL); err != nil {
		return fmt.Errorf("初始化表结构: %w", err)
	}
	return tx.Commit()
}

// placeholders renders "$start,$start+1,..." for n arguments, used by queries
// that build an IN list at runtime.
func placeholders(start, n int) string {
	if n <= 0 {
		return ""
	}
	var b strings.Builder
	for i := 0; i < n; i++ {
		if i > 0 {
			b.WriteByte(',')
		}
		fmt.Fprintf(&b, "$%d", start+i)
	}
	return b.String()
}

// isUniqueViolation reports whether err is a unique constraint violation.
func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

// isForeignKeyViolation reports whether err is a foreign key violation.
func isForeignKeyViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23503"
}
