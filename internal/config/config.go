package config

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"
)

// Account is a bootstrap account. An empty username and password disables an
// optional account; the administrator account always falls back to its built-in
// default when the file leaves it empty.
type Account struct {
	Username string `yaml:"username"`
	Password string `yaml:"password"`
}

// Database points at the PostgreSQL instance that stores the inventory.
type Database struct {
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	Name     string `yaml:"name"`
	User     string `yaml:"user"`
	Password string `yaml:"password"`
	SSLMode  string `yaml:"sslmode"`
}

// DSN renders the connection string. DC_DB_DSN overrides the file values so a
// container deployment can pass the password through the environment without
// writing it to config.yaml.
func (d Database) DSN() string {
	if dsn := strings.TrimSpace(os.Getenv("DC_DB_DSN")); dsn != "" {
		return dsn
	}
	sslmode := d.SSLMode
	if sslmode == "" {
		sslmode = "disable"
	}
	return fmt.Sprintf("postgres://%s:%s@%s:%d/%s?sslmode=%s",
		url.QueryEscape(d.User), url.QueryEscape(d.Password),
		d.Host, d.Port, url.PathEscape(d.Name), sslmode)
}

// String never shows the password, so the value is safe to log.
func (d Database) String() string {
	return fmt.Sprintf("postgres://%s@%s:%d/%s", d.User, d.Host, d.Port, d.Name)
}

type Config struct {
	Listen       string   `yaml:"listen"`
	Database     Database `yaml:"database"`
	WebDir       string   `yaml:"web_dir"`
	CookieSecure bool     `yaml:"cookie_secure"`
	Admin        Account  `yaml:"admin"`
	Operator     Account  `yaml:"operator"`
	Viewer       Account  `yaml:"viewer"`
}

// Default returns the values used when config.yaml is absent.
func Default() Config {
	return Config{
		Listen: "127.0.0.1:8080",
		Database: Database{
			Host:    "127.0.0.1",
			Port:    5432,
			Name:    "dc_db",
			User:    "dc_db",
			SSLMode: "disable",
		},
		WebDir: "web/dist",
		Admin:  Account{Username: "admin"},
	}
}

// Load reads an optional YAML configuration file. found is false when the file
// does not exist, in which case the built-in defaults are returned.
func Load(path string) (cfg Config, found bool, err error) {
	cfg = Default()
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return cfg, false, nil
	}
	if err != nil {
		return Config{}, false, err
	}
	decoder := yaml.NewDecoder(bytes.NewReader(data))
	decoder.KnownFields(true)
	if err := decoder.Decode(&cfg); err != nil && !errors.Is(err, io.EOF) {
		return Config{}, false, fmt.Errorf("解析 %s: %w", path, err)
	}
	if cfg.Listen == "" || cfg.WebDir == "" {
		return Config{}, false, errors.New("listen 和 web_dir 不能为空")
	}
	if cfg.Database.Host == "" || cfg.Database.Name == "" || cfg.Database.User == "" {
		return Config{}, false, errors.New("database.host、database.name 和 database.user 不能为空")
	}
	if cfg.Database.Port == 0 {
		cfg.Database.Port = 5432
	}
	if cfg.Database.Port < 1 || cfg.Database.Port > 65535 {
		return Config{}, false, errors.New("database.port 无效: " + strconv.Itoa(cfg.Database.Port))
	}
	return cfg, true, nil
}
