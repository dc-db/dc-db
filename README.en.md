<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="web/public/brand/logo-dark.svg">
    <img src="web/public/brand/logo-light.svg" width="306" height="80" alt="DC-DB">
  </picture>
</h1>

[简体中文](README.md)

dc-db is a simple, easy-to-use configuration management database for IT assets, infrastructure configuration, and asset relationships. It targets small, single-node operations: around 3,000 virtual machines with a total footprint under 5,000 hosts, maintained by a small operations team. The design goal is simple, sufficient, and easy to maintain: a single PostgreSQL instance and no Redis or message queue. It tracks physical hosts, virtual machines, and switches, with a home dashboard, asset search, relationship views, CSV import and export, device interfaces and cabling, IPAM subnet, VLAN, and address management, access controls, change history, and data center/rack views.

dc-db uses Go, React 19 with TypeScript, shadcn/ui, TanStack Table, React Flow, ECharts, and PostgreSQL. One Go binary with the built `web/dist` assets plus one PostgreSQL instance is all it needs; `docker compose up -d` starts both.

The interface supports light and dark themes. It follows the system preference on first visit, can be switched from the login page or header, and remembers the choice in the browser.

See [Brand assets](docs/brand.md) for the SVG logo masters, GitHub PNG exports, and usage notes (in Chinese).

## Scope

- Around 3,000 virtual machines with a total footprint under 5,000 hosts on a single node.
- A small operations team with read-heavy usage.
- One PostgreSQL instance deployed with `docker compose up -d`.
- Manual maintenance and spreadsheet import as the primary workflow, with asset relationships, data center/rack views, and change history.

It is not designed for large multi-node clusters, multi-tenant deployments, or high-frequency concurrent editing.

## Quick start (Docker Compose)

You need Docker and Docker Compose v2. The repository ships `docker-compose.yaml`, which starts PostgreSQL and the application:

```bash
docker compose up -d
```

Open [http://127.0.0.1:8080](http://127.0.0.1:8080). The default initial sign-in is `admin` with password `admin`; change it in the configuration below before exposing the service. Login requires a graphical captcha, valid for five minutes and usable only once. The first start creates the schema; the inventory is empty, so add assets in the web interface or use CSV import.

The default database password is `dc_db` and is only meant for local trials. Override it through the environment:

```bash
POSTGRES_PASSWORD='a-longer-password' APP_PORT=80 docker compose up -d
```

The image build uses the official Go and npm registries; point it at a mirror when needed:

```bash
GOPROXY=https://proxy.golang.org,direct NPM_REGISTRY=https://registry.npmjs.org docker compose build
```

## Run locally (without containers)

Use Go 1.26 or later, Node.js 22 LTS (or another version supported by Vite 7), and a PostgreSQL 16+ instance. Create the database first:

```bash
sudo -u postgres psql -c "CREATE ROLE dc_db LOGIN PASSWORD 'dc_db'"
sudo -u postgres createdb -O dc_db dc_db
```

Then build and start:

```bash
npm --prefix web ci
npm --prefix web run build
go build -trimpath -o bin/dc-db ./cmd/dc-db
cp config.example.yaml config.yaml   # adjust the database block if needed
./bin/dc-db serve
```

On Windows PowerShell:

```powershell
npm --prefix web ci
npm --prefix web run build
go build -trimpath -o bin/dc-db.exe ./cmd/dc-db
Copy-Item config.example.yaml config.yaml
.\bin\dc-db.exe serve
```

The first start creates the schema automatically. Without configuration the program connects to the `dc_db` database on `127.0.0.1:5432` as user `dc_db`.

The service binds to `127.0.0.1:8080` by default. Before the first start of a network-accessible installation, copy `config.example.yaml` to `config.yaml` and set `admin.password` to a unique password of at least 12 bytes. Set `cookie_secure: true` when serving the application through an HTTPS reverse proxy. The database holds password hashes and all asset data, so restrict the connection string, backups, and asset exports, and enable disk encryption where appropriate. Accounts are created from the configuration on first start; existing accounts use their stored passwords.

### Reachability checks

For a server, VM, or network device with a single IP address, enable Ping checks in the asset editor. An administrator can set the interval under System Management → Reachability Settings (10–86400 seconds; default 300). Results indicate ICMP reachability, not whether a device or service is running; retired assets are skipped. The Docker image includes Ping and probes from the application container network through the host. When running directly on Linux, install iputils `ping` and allow the application user to send ICMP.

### Example data

The repository's `demo-data.sql` contains fictional assets and related records for an isolated development environment. It is not imported automatically. Run it against an empty inventory:

```bash
psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -U dc_db -d dc_db -f demo-data.sql
```

The script guards against a non-empty inventory and rolls back as a whole. Do not run it against a database containing real assets. The example data follows the current schema; use a newly created development database after schema changes.

## Configuration

Every setting has a default, so the program runs without a configuration file. To customize it, copy the example:

```bash
cp config.example.yaml config.yaml
```

`config.yaml` is ignored by Git so it can hold local passwords. Available fields:

```yaml
listen: 127.0.0.1:8080

database:
  host: 127.0.0.1
  port: 5432
  name: dc_db
  user: dc_db
  password: ""
  sslmode: disable

web_dir: web/dist
cookie_secure: false

admin:
  username: admin
  password: ""

operator:
  username: ""
  password: ""

viewer:
  username: ""
  password: ""
```

- Leaving `admin.password` empty uses the default password `admin`; change it to at least 12 bytes before exposing the service.
- `database` holds the PostgreSQL connection; container deployments override it with the `DC_DB_DSN` environment variable.
- Leaving both `operator` / `viewer` fields empty disables that account.
- Accounts are created only on first start; changing `config.yaml` later does not change an existing account's password.

## System management

The `系统管理` section contains:

- **Change history**: review changes to assets, relationships, and facilities, filtered by asset, actor, or action, and export the current result
- **User management**: administrator-only account management with administrator, operator, and viewer roles, plus password reset for other accounts
- **Change password**: update the password for the signed-in account

Roles are:

- **Administrator**: all features, including user management;
- **Operator**: manage assets, IPAM and data centers, but not accounts;
- **Viewer**: read-only; every write request is rejected by the server.

The last administrator cannot be deleted or demoted, and an administrator cannot delete or change their own role. Resetting a password invalidates that account's existing sessions.

The Physical machines view also includes switches and other non-VM assets, distinguished by the Type column.

Changing the password requires the current password and a new password of at least 12 characters. After a successful change, every session for the account is revoked and the user must sign in again.

## Deploy to a Linux server

The recommended path is the bundled `docker-compose.yaml`: clone the repository on the server and run `docker compose up -d`. The application and PostgreSQL start together and data lives in the `pgdata` volume. `config.docker.yaml` provides the container listener and database host, so no manual configuration file is required.

The application image bundles the Go binary and the built frontend. The development tag is `dc-db:dev`; pick your own tag for a release:

```bash
DC_DB_IMAGE=dc-db:v1.0.0 docker compose build
DC_DB_IMAGE=dc-db:v1.0.0 docker compose up -d
```

To change the port or password:

```bash
APP_PORT=80 POSTGRES_PASSWORD='a-longer-password' docker compose up -d
```

For production, put Nginx in front with HTTPS and set `cookie_secure: true` in `config.docker.yaml`.

Without Docker you can run the compiled binary, but you have to provide PostgreSQL, fill in the `database` block of `config.yaml`, and place `web/dist` where `web_dir` points (default `web/dist`). The binary itself is a static single file and does not contain the frontend assets; the server does not need Node.

## Asset management

Add individual assets with the `新增资产` button. For larger inventories, use CSV import: edit the file in Excel and save it as `CSV UTF-8` (comma-separated), click `下载模板` on the asset list to get the template, fill it in, then click `导入 CSV`. The file is validated and previewed first; row errors are listed for correction and can be downloaded as a CSV report, and data is written only after you confirm.

Template columns:

```text
资源名称,类型,角色,平台,状态,生命周期,地址 / IP,CPU,内存 MiB,负责人,环境,备注
```

- Type: `host`, `vm`, `switch`, or the Chinese labels 物理机, 虚拟机, 交换机.
- Role: a free-text purpose such as server, switch, router, firewall, or storage; empty means unset.
- Platform: `pve`, `kvm`, `Proxmox VE`, `KVM`, or empty.
- Status: `unknown`, `online`, `offline`, `running`, `stopped`, `paused`, or the Chinese labels 未知, 在线, 离线, 运行中, 已停止, 已暂停.
- Lifecycle: `active`, `retired`, 在册, 已退役; empty defaults to active.
- CPU and memory MiB must be non-negative integers.

Import rules:

- Up to 5,000 rows and 16 MiB per import;
- Validation and insert run in one batch; if any row fails, nothing is written;
- Import only creates new assets; it never overwrites an existing asset;
- Asset names must not duplicate an existing asset or another row in the same file;
- Successful imports appear in change history under the current account.

Exported CSV files use the same columns and can be used as a reference when preparing an import.

Asset details are organized into overview, relationships, interfaces, and change history tabs. The interfaces tab records each port (name, medium, speed, MAC, status) and lets you cable two ports together; both ends then show the peer device and port until the cable is removed. The relationships tab includes a draggable, zoomable topology; selecting a node opens that asset. Star assets from the list or detail view to keep them in the dashboard `My favorites` shortcut. The asset list supports status filters, saved filter presets, configurable columns, click-to-sort headers, and 10/20/50 page sizes. Select multiple assets to bulk-edit status, platform, lifecycle, owner, and environment. The global header search covers assets, IP addresses, data centers, racks, subnets, and VLANs, shows the last six searches when empty, and opens the selected asset, rack, subnet, or VLAN directly.

## IP address management

`IPAM` is organized into `Subnets & IPs`, `IP addresses`, and `VLANs`.

The VLAN inventory records a VLAN ID (1–4094), name, status, optional data center, and description. A subnet selects a registered VLAN from a drop-down; a VLAN ID cannot be changed and a VLAN cannot be deleted while a subnet still references it, so prefixes never point at missing VLANs.

A subnet stores its CIDR, gateway, status (container, active, reserved, or deprecated), purpose, and VLAN. The subnet tree can be searched by name, CIDR, VLAN, or purpose and filtered by status. Addresses found in asset `address` fields are counted automatically, and you can also allocate or release IPs and link them to assets.

The IP addresses view combines manual allocations, asset addresses, and gateway addresses, with filters for subnet, source, status, and keyword. Manual allocations support status (active, reserved, deprecated, DHCP, or SLAAC), DNS name, role (loopback, secondary, VIP, VRRP, HSRP, GLBP, or anycast), linked asset, purpose, and notes, and can be edited or released.

Free addresses in a subnet are shown in a paginated table with 10/20/50 rows per page and a page jump. Selecting `Allocate this address` fills the allocation form above, while the free and used counts remain visible for large prefixes.

- IPv4 `/8` through `/30`; partial overlaps are rejected, while a parent prefix may contain child prefixes;
- Asset addresses may contain multiple IPs separated by commas, semicolons, or spaces;
- Used addresses include the gateway, asset addresses, and manual allocations;
- The first 50 free addresses are listed, while the total free count is calculated from the subnet size;
- The gateway cannot be allocated again, and an address already present in an asset does not need a duplicate allocation;
- DNS names are validated as host names or fully qualified domain names;
- Subnet, VLAN, and IP allocation changes appear in change history with field-level differences.

## Data center layouts

Open the data center view (`数据中心`). You can group data centers under an optional region (city or area) first, or skip regions and create a data center directly. Then add racks with a label, a height, and an optional zone/row. Racks can be viewed as a table with total, used and free units plus utilisation, or as an elevation board.

Use the rack elevation to mount an existing asset or create and mount a physical host or switch in one step. Set the starting rack unit, height, mounting face (front/rear), and depth (full/half). dc-db validates overlaps per face and depth: a full-depth device occupies both faces, while a half-depth device occupies only its selected face. Drag a device to move it, or click an empty unit to prefill the mount position. Asset details link back to the data center and rack, and virtual machines follow their host relationship. Unmounting a device keeps its asset record.

The rack drawer switches between front and rear elevations, reports occupied units for each face, and can export the current view as SVG or PNG. Device lists and rack details show mounting face and depth. The rack table and the elevation board share the same placement data. Data center, rack, and placement changes appear in change history.

## Back up and restore

Use `pg_dump` for a consistent backup; the service can keep running:

```bash
docker compose exec -T db pg_dump -U dc_db -Fc dc_db > dc-db-$(date +%F).dump
```

To restore into an empty database:

```bash
docker compose exec -T db dropdb -U dc_db --if-exists dc_db
docker compose exec -T db createdb -U dc_db dc_db
docker compose exec -T db pg_restore -U dc_db -d dc_db < dc-db-2026-01-01.dump
```

The dump contains all asset data and password hashes, so keep it in a controlled location and enable disk or volume encryption (for example LUKS); PostgreSQL does not encrypt its data files by itself.

## Development

See the [interface design guidelines](docs/design-system.md) for theme, component, and interaction conventions (in Chinese).

After each code change passes the relevant checks, run `docker compose up -d --build` on the remote development server; data lives in the `pgdata` volume and survives container rebuilds. Check `http://<dev-host>/healthz` and the main flow affected by the change. Keep real connection details and credentials in controlled, Git-ignored local configuration.

Do not start local or localhost services by default. Only when the user explicitly requests local debugging, after the first frontend build, use `npm --prefix web run dev` to start the frontend development server, which proxies `/api` to the Go service on port 8080. Start the Go service with `go run ./cmd/dc-db` and stop both services when debugging is complete. Run `go test ./...` for Go package checks (it needs a reachable PostgreSQL, see below) and `npm --prefix web run check` for TypeScript type checking.

The schema lives in `internal/cmdb/schema.sql` and is applied when an empty database starts for the first time. This project is still in development: after changing the schema, run `docker compose down -v` to drop the data volume and start again; there are no migration files.

Tests connect to `postgres://dc_db:dc_db@127.0.0.1:5432/dc_db_test` by default and honour `DC_DB_TEST_DSN`; they are skipped when no PostgreSQL is reachable. Each test rebuilds the `public` schema first, so do not point it at a database with data.

## License

Licensed under the [Apache License 2.0](LICENSE).

Servers and virtual machines can each maintain service instances with built-in or custom names.
