<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="web/public/brand/logo-dark.svg">
    <img src="web/public/brand/logo-light.svg" width="306" height="80" alt="DC-DB">
  </picture>
</h1>

[English](README.en.md)

dc-db 是一款简单易用的配置管理数据库，用于集中管理 IT 资产、基础设施配置和资产关系。项目面向中小规模、单机部署的运维场景：约 3000 台虚拟机，整体规模控制在 5000 台主机以内，少量运维人员即可维护。设计取舍是简单、够用、好维护：只依赖一个 PostgreSQL，不引入 Redis、消息队列等额外中间件。当前支持物理机、虚拟机和交换机，提供首页汇总仪表盘、资源详情、搜索筛选、CSV 导入导出、设备接口与连线、IPAM 网段/VLAN/IP 地址管理、操作审计以及数据中心机柜视图。

项目采用 Go、React 19 + TypeScript、shadcn/ui、TanStack Table、React Flow、ECharts 和 PostgreSQL。一个静态编译的 Go 二进制、一份 `web/dist` 前端产物加一个 PostgreSQL 实例即可运行；用 `docker compose up -d` 一条命令起完整环境。

界面支持浅色和暗色主题：首次访问跟随系统设置，登录页和顶部栏可手动切换，选择会保存在浏览器本地。

Logo 的 SVG 母版、GitHub PNG 素材和使用方式见[品牌标识](docs/brand.md)。

## 适用场景

- 约 3000 台虚拟机，整体规模控制在 5000 台主机以内的单机环境；
- 少量运维人员日常维护，读多写少；
- 接受一个 PostgreSQL 实例，用 Docker Compose 一条命令部署；
- 以手工维护和表格导入为主，需要资产关系、数据中心机柜和变更留痕。

不适合多节点大规模集群、多租户或高频并发编辑的场景。

## 快速开始（Docker Compose）

需要 Docker 与 Docker Compose v2。仓库自带 `docker-compose.yaml`，会启动 PostgreSQL 和应用两个容器：

```bash
docker compose up -d
```

访问 [http://127.0.0.1:8080](http://127.0.0.1:8080)。默认初始账号为 `admin`，密码为 `admin`；对内网开放前请按下面的配置修改密码。登录时需要填写图形验证码，验证码 5 分钟内有效且只能使用一次。首次启动会自动建表，台账为空，可在页面新增资产，或按下面的方式批量导入。

数据库口令默认是 `dc_db`，仅适合本机试用；可通过环境变量覆盖：

```bash
POSTGRES_PASSWORD='更复杂的口令' APP_PORT=80 docker compose up -d
```

镜像构建默认走官方 Go/npm 源；国内环境可以指定镜像加速：

```bash
GOPROXY=https://goproxy.cn,direct NPM_REGISTRY=https://registry.npmmirror.com docker compose build
```

## 本地运行（不用容器）

需要 Go 1.26+、Node.js 22 LTS（或满足 Vite 7 要求的版本）和一个 PostgreSQL 16+ 实例。首次运行先建库：

```bash
sudo -u postgres psql -c "CREATE ROLE dc_db LOGIN PASSWORD 'dc_db'"
sudo -u postgres createdb -O dc_db dc_db
```

然后构建并启动：

```bash
npm --prefix web ci
npm --prefix web run build
go build -trimpath -o bin/dc-db ./cmd/dc-db
cp config.example.yaml config.yaml   # 按需改 database 连接信息
./bin/dc-db serve
```

Windows PowerShell 对应：

```powershell
npm --prefix web ci
npm --prefix web run build
go build -trimpath -o bin/dc-db.exe ./cmd/dc-db
Copy-Item config.example.yaml config.yaml
.\bin\dc-db.exe serve
```

首次启动会自动建表。数据库连接不配置时默认连 `127.0.0.1:5432` 上的 `dc_db` 库，用户 `dc_db`。

服务默认只监听 `127.0.0.1:8080`。对内网开放前，复制 `config.example.yaml` 为 `config.yaml`，在 `admin.password` 设置至少 12 字节的专用密码；通过 HTTPS 反向代理访问时，把 `cookie_secure` 设为 `true`。数据库里保存了账号口令散列和全部资产数据，请限制数据库连接串、备份文件和资产导出文件的访问权限，并按需为 PostgreSQL 启用磁盘加密。管理员、运维、只读账号在首次启动时按配置创建，已有账号使用数据库中保存的密码。

### 示例数据

仓库中的 `demo-data.sql` 包含虚构的资产及其关联数据，供隔离的开发环境体验使用，不会自动导入。在空台账的开发库中执行：

```bash
psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -U dc_db -d dc_db -f demo-data.sql
```

脚本带空库保护，台账非空时会整体回滚。导入后刷新页面即可；不要在包含实际资产的数据库中运行此脚本。示例数据随当前表结构维护，表结构变化后应使用新建的开发库。

## 配置

所有配置都有默认值，不创建配置文件也能运行。需要修改时复制模板：

```bash
cp config.example.yaml config.yaml
```

`config.yaml` 已被 Git 忽略，可以放本机密码，不要提交。可用字段：

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

- `admin.password` 留空时使用默认密码 `admin`；对内网开放前改为至少 12 字节。
- `database` 是 PostgreSQL 连接信息；容器部署可用环境变量 `DC_DB_DSN` 整体覆盖。
- `operator` / `viewer` 两项都留空表示不创建该账号。
- 账号只在首次启动时创建，之后修改 `config.yaml` 不会改变已有账号的密码。

## 系统管理

左侧「系统管理」包含：

- **变更记录**：查看资产、关系和设施的历史修改，支持按资产、操作人和动作筛选，并可导出当前结果；标签变更会显示新增和移除的标签
- **用户管理**：仅管理员可见，可创建、编辑和删除账号，分配管理员、运维或只读角色，并可重置其他账号的密码
- **更改密码**：修改当前登录账号的密码

账号角色分为：

- **管理员**：全部功能，包括用户管理；
- **运维**：可维护资产、IPAM、标签和数据中心，不能管理账号；
- **只读**：只能查看，所有写操作都会被服务端拒绝。

系统不允许删除或降级最后一个管理员，也不允许管理员删除或修改自己的角色；重置密码会使目标账号的已有登录会话失效。

「物理机」列表同时展示物理服务器、交换机等非虚拟机资产，通过「类型」列区分；标签管理中的关联资产数量仅作统计展示。

修改密码需要填写当前密码，新密码至少 12 个字符。修改成功后，当前账号的所有登录会话都会失效，需要使用新密码重新登录。

## 部署到 Linux 服务器

推荐用仓库自带的 `docker-compose.yaml`：把代码拉到服务器后执行 `docker compose up -d`，应用与 PostgreSQL 一起起来，数据保存在 `pgdata` 卷中。`config.docker.yaml` 提供容器内使用的监听地址和数据库主机名，不需要手工创建配置。

应用镜像把 Go 二进制和构建好的前端打进同一个镜像，开发环境默认标签是 `dc-db:dev`；发布时可以指定自己的标签：

```bash
DC_DB_IMAGE=dc-db:v1.0.0 docker compose build
DC_DB_IMAGE=dc-db:v1.0.0 docker compose up -d
```

需要换端口或口令时：

```bash
APP_PORT=80 POSTGRES_PASSWORD='更复杂的口令' docker compose up -d
```

生产环境建议在前面加一层 Nginx 反向代理并启用 HTTPS，同时把 `config.docker.yaml` 里的 `cookie_secure` 改为 `true`。

不使用 Docker 时，可以直接运行编译好的二进制，但需要自行准备 PostgreSQL 并写好 `config.yaml` 的 `database` 段，同时把 `web/dist` 放在 `web_dir` 指向的位置（默认 `web/dist`）。二进制本身是静态链接的单文件，不含前端资源；服务器上不需要 Node。

## 资产维护

零散资产可以直接在页面点击「新增资产」手工维护。资产较多时使用 CSV 批量导入：在 Excel 中编辑后另存为「CSV UTF-8」（逗号分隔），在资源列表点击「下载模板」，填写后点击「导入 CSV」。选择文件后先显示预检结果和前几行样例；错误行会逐条汇总，并可下载 CSV 错误报告，修正后确认才会写入。

模板列如下：

```text
资源名称,类型,角色,平台,状态,生命周期,地址 / IP,CPU,内存 MiB,负责人,环境,备注,扩展属性,标签
```

- 类型：物理机、虚拟机、交换机；也接受 `host`、`vm`、`switch`。
- 角色：服务器、交换机、路由器、防火墙、存储等用途说明，可自定义，留空表示未指定。
- 平台：Proxmox VE、KVM 或留空；也接受 `pve`、`kvm`。
- 状态：未知、在线、离线、运行中、已停止、已暂停；也接受对应英文代码。
- 生命周期：在册、已退役；留空默认在册。
- 扩展属性：JSON 对象，例如 `{"位置":"A01"}`；留空为 `{}`。
- 标签：多个标签用分号或逗号分隔，例如 生产; 核心；标签须先在「标签管理」中创建，不存在的标签会导致整批导入失败。
- CPU 和内存 MiB 填非负整数。

导入规则：

- 单次最多 5000 行、16 MiB；
- 整批校验和写入，任何一行失败都不会写入部分数据；
- 导入只新增，不修改已有资产；
- 标签按名称匹配，不会自动创建标签；
- 资源名称不能与已有资产或本次文件中的其他行重复，避免重复导入；
- 导入成功后会在变更记录中留下记录，操作人为当前登录账号。

导出的 CSV 使用同一套列名，可以作为批量导入的填写参考。

资产详情按「概览 / 资源关系 / 接口 / 扩展信息 / 变更记录」分页展示，资源关系页签提供可拖动、缩放的交互式关系拓扑，点击拓扑节点可打开对应资产。接口页签记录设备的网口（名称、介质、速率、MAC、状态），可以把两个接口连成一条链路，连接后两端都会显示对端设备与端口，断开后恢复为未连接。扩展属性采用键值编辑器，支持文本、数字、布尔和 JSON 值。资产可以关联多个彩色标签：在「系统管理 → 标签管理」维护标签，在资产详情右上角「标签」中勾选；标签会显示在资产列表，可用于标签筛选；多选时可选择「同时满足」或「任一匹配」，保存筛选条件时会记录标签数组和匹配模式。顶部全局搜索支持按标签名称或说明查找标签。勾选多条资产后可以批量添加、移除或替换标签。资产列表和详情支持星标收藏，首页「我的收藏」提供快捷入口，并展示标签使用分布。资产列表支持按状态筛选、保存常用筛选条件、自定义显示列、点击表头排序和 10/20/50 条分页。勾选多条资产后可以批量修改运行状态、平台、生命周期、负责人和环境。页面顶部提供全局搜索，可搜索资产、IP、数据中心、机柜、网段和 VLAN；空搜索时显示最近 6 条搜索记录，搜索结果可直接打开对应的资产、机柜、网段或 VLAN。

## IP 地址管理

「IPAM」分为「网段与 IP」「IP 地址」「VLAN」三个入口，统一维护二层和三层地址资源。

VLAN 管理登记 VLAN ID（1–4094）、名称、状态、所属数据中心和描述。网段通过 VLAN 下拉选择关联已登记 VLAN；修改 VLAN ID 或删除 VLAN 前需先解除网段引用，避免网段指向不存在的 VLAN。

网段填写 CIDR、网关、状态（聚合、启用、预留、停用）、用途和 VLAN。网段树支持按名称、CIDR、VLAN 或用途搜索，并可按状态筛选。系统会自动统计资产「地址 / IP」中落在该网段的地址，也可以在网段下手工分配、关联资产和释放 IP。

IP 地址页面汇总手工分配、资产地址和网关地址，可按网段、来源、状态和关键字筛选。手工分配的地址可以维护状态（启用、预留、停用、DHCP、SLAAC）、DNS 名称、角色（环回、辅助、VIP、VRRP、HSRP、GLBP、Anycast）、关联资产、用途和备注，并支持编辑与释放。

网段详情中的空闲 IP 使用分页表格展示，可按 10/20/50 条切换和跳页，点击「分配此地址」会把地址填入上方分配表单。空闲数量与已用数量分别统计，适合较大网段逐页查找。

- 支持 IPv4 `/8` 到 `/30`，网段之间不允许部分重叠；允许父网段包含子网段，用于前缀聚合；
- 资产地址支持逗号、分号或空格分隔的多个 IP；
- 已用 IP 包括网关、资产地址和手工分配；
- 空闲 IP 显示前 50 个，总空闲数按网段容量计算；
- 网关地址不能再次分配；资产地址已使用的 IP 不需要重复分配；
- DNS 名称会校验主机名或完整域名格式；
- 网段、VLAN 和 IP 分配变更会记录在「变更记录」，并显示字段级差异。

## 数据中心

在「数据中心」可以按城市或片区新建区域，把数据中心归类；区域是可选的，不建区域也能直接创建数据中心。选中数据中心后添加机柜编号、区域/排、高度、网格坐标和朝向。区域只用于标注机柜所在的排或片区，便于在列表、机柜卡片和导出中区分。机柜可以切换卡片或表格查看，表格里能看到 U 位总数、已用、空闲和占用率；机柜的网格位置在编辑表单里设置。3D 总览支持旋转、缩放、选择机柜和打开设备详情。

在机柜视图中选择「上架设备」，关联已有资产，或新建物理机或交换机后同时上架。填写起始 U 位、占用 U 数、安装面（前/后）和深度（全深/半深），系统会按安装面和深度检查重叠及越界；也可以直接拖动设备调整 U 位，或点击空 U 位预填上架位置。全深设备同时占用前后两面，半深设备只占用所选安装面。资产详情可反向定位到数据中心和机柜。虚拟机沿宿主机关系定位，下架设备会保留资产记录。

机柜详情支持前视图/后视图切换，并分别统计前后视占用 U 位，可把当前视图导出为 SVG 或 PNG；设备列表和机柜详情会显示安装面与深度。机柜布局以网格单元表示。U 位、资产位置和布局由同一份数据驱动，数据中心、机柜和设备位置的修改记录在「变更记录」。

机柜正视图参考 NetBox / Rackula 的立面布局，设备和交换机的面板使用 SVG 绘制。

## 数据备份

用 PostgreSQL 自带的 `pg_dump` 做一致性备份，不需要停服务：

```bash
docker compose exec -T db pg_dump -U dc_db -Fc dc_db > dc-db-$(date +%F).dump
```

恢复到一个空库：

```bash
docker compose exec -T db dropdb -U dc_db --if-exists dc_db
docker compose exec -T db createdb -U dc_db dc_db
docker compose exec -T db pg_restore -U dc_db -d dc_db < dc-db-2026-01-01.dump
```

备份文件包含全部资产数据和口令散列，请放在受控位置；磁盘或卷层建议启用加密（如 LUKS），PostgreSQL 本身不加密数据文件。

## 开发

界面设计、主题和组件复用约定见[界面设计规范](docs/design-system.md)。

每次代码改动通过相关检查后，用 `docker compose up -d --build` 更新远程开发主机上的容器；数据保存在 `pgdata` 卷中，重建容器不会丢失。更新后检查 `http://<dev-host>/healthz` 及本次改动的主要流程。真实连接信息和凭据只保存在受控且被 Git 忽略的本机配置中。

默认不启动本机或 localhost 服务。仅在用户明确要求本地调试时，首次构建前端后可用 `npm --prefix web run dev` 启动前端开发服务，它会把 `/api` 请求代理到本机 8080 的 Go 服务；Go 服务可用 `go run ./cmd/dc-db` 启动，调试结束后停止。`go test ./...` 检查 Go 包（需要可连接的 PostgreSQL，见下方说明），`npm --prefix web run check` 执行 TypeScript 类型检查。

表结构在 `internal/cmdb/schema.sql`，首次启动时自动执行。项目仍在开发阶段，修改表结构后执行 `docker compose down -v` 清空数据卷再启动即可重建，不需要迁移文件。

测试默认连接 `postgres://dc_db:dc_db@127.0.0.1:5432/dc_db_test`，可用 `DC_DB_TEST_DSN` 指定其他测试库；连不上时测试会跳过。每个测试开始前会重建 `public` schema，因此不要指向有数据的库。

## 许可证

使用 [Apache License 2.0](LICENSE)。
