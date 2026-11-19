package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeConfig(t *testing.T, body string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(path, []byte(strings.TrimSpace(body)), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestLoadMissingUsesDefaults(t *testing.T) {
	t.Setenv("DC_DB_DSN", "")
	cfg, found, err := Load(filepath.Join(t.TempDir(), "config.yaml"))
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if found {
		t.Fatal("missing config reported as found")
	}
	want := Database{Host: "127.0.0.1", Port: 5432, Name: "dc_db", User: "dc_db", SSLMode: "disable"}
	if cfg.Listen != "127.0.0.1:8080" || cfg.Database != want || cfg.WebDir != "web/dist" {
		t.Fatalf("unexpected defaults: %+v", cfg)
	}
	if cfg.Admin.Username != "admin" || cfg.Admin.Password != "" {
		t.Fatalf("unexpected default admin: %+v", cfg.Admin)
	}
}

func TestLoadYAML(t *testing.T) {
	t.Setenv("DC_DB_DSN", "")
	path := writeConfig(t, `
listen: 127.0.0.1:9090
database:
  host: db.internal
  port: 6543
  name: inventory
  user: dc-db
  password: s3cret
  sslmode: require
web_dir: public
cookie_secure: true
admin:
  username: root
  password: strong-password
operator:
  username: ops
  password: operator-password
`)
	cfg, found, err := Load(path)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if !found {
		t.Fatal("config file not reported as found")
	}
	if cfg.Listen != "127.0.0.1:9090" || cfg.WebDir != "public" || !cfg.CookieSecure {
		t.Fatalf("unexpected config: %+v", cfg)
	}
	if cfg.Database.Host != "db.internal" || cfg.Database.Port != 6543 ||
		cfg.Database.Name != "inventory" || cfg.Database.User != "dc-db" ||
		cfg.Database.Password != "s3cret" || cfg.Database.SSLMode != "require" {
		t.Fatalf("unexpected database block: %+v", cfg.Database)
	}
	if cfg.Admin.Username != "root" || cfg.Admin.Password != "strong-password" {
		t.Fatalf("unexpected admin: %+v", cfg.Admin)
	}
	if cfg.Operator.Username != "ops" || cfg.Operator.Password != "operator-password" {
		t.Fatalf("unexpected operator: %+v", cfg.Operator)
	}
}

func TestDatabaseDSN(t *testing.T) {
	t.Setenv("DC_DB_DSN", "")
	db := Database{Host: "127.0.0.1", Port: 5432, Name: "dc_db", User: "dc_db", Password: "p@ss word", SSLMode: "disable"}
	want := "postgres://dc_db:p%40ss+word@127.0.0.1:5432/dc_db?sslmode=disable"
	if got := db.DSN(); got != want {
		t.Fatalf("dsn = %q, want %q", got, want)
	}
	if strings.Contains(db.String(), "p@ss") {
		t.Fatalf("string form leaks the password: %s", db.String())
	}
}

func TestDatabaseDSNEnvironmentOverride(t *testing.T) {
	t.Setenv("DC_DB_DSN", "postgres://override@db:5432/x?sslmode=disable")
	db := Database{Host: "127.0.0.1", Port: 5432, Name: "dc_db", User: "dc_db"}
	if got := db.DSN(); got != "postgres://override@db:5432/x?sslmode=disable" {
		t.Fatalf("environment override ignored: %s", got)
	}
}

func TestLoadPartialKeepsDefaults(t *testing.T) {
	t.Setenv("DC_DB_DSN", "")
	path := writeConfig(t, "listen: 127.0.0.1:9091\n")
	cfg, found, err := Load(path)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if !found {
		t.Fatal("config file not reported as found")
	}
	if cfg.Listen != "127.0.0.1:9091" || cfg.Database.Host != "127.0.0.1" || cfg.WebDir != "web/dist" {
		t.Fatalf("defaults were not preserved: %+v", cfg)
	}
	if cfg.Admin.Username != "admin" {
		t.Fatalf("default admin was not preserved: %+v", cfg.Admin)
	}
}

func TestLoadRejectsUnknownFields(t *testing.T) {
	path := writeConfig(t, "listen: 127.0.0.1:8080\nunknown: true\n")
	if _, _, err := Load(path); err == nil {
		t.Fatal("unknown field was accepted")
	}
}

func TestLoadRejectsEmptyRequiredValues(t *testing.T) {
	path := writeConfig(t, "listen: \"\"\n")
	if _, _, err := Load(path); err == nil {
		t.Fatal("empty listen was accepted")
	}
	path = writeConfig(t, "database:\n  host: \"\"\n  name: dc_db\n  user: dc_db\n")
	if _, _, err := Load(path); err == nil {
		t.Fatal("empty database host was accepted")
	}
}
