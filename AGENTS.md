# dc-db 仓库约定

## 企业数据保密（适用于所有改动）

- 严禁将真实企业数据写入仓库文件或提交记录。包括主机名、内外网 IP、MAC 地址、设备序列号、资产清单、网络拓扑、账号密码、数据库连接串、API Token 和私钥。
- 源码、文档、配置示例和测试使用虚构数据或占位符。提交前检查暂存内容。对外分享日志、截图、Issue 或 PR 前，替换其中的敏感值并复核。
- 真实数据留在受控的存储中。确需在本机配置的凭据放在 Git 忽略的 `config.yaml` 中；数据库备份和资产导出同样留在受控环境。

## 项目概览

dc-db 用于集中管理企业 IT 资产、配置和资产关系，面向约 3000 台虚拟机、5000 台主机以内的单机场景。技术栈为 Go 1.26+、React 19 + TypeScript、shadcn/ui、TanStack Table、ECharts 和 PostgreSQL。开发和部署步骤见 [README.md](README.md)。

## 代码位置与改动范围

- `cmd/dc-db/` 提供 `dc-db serve` 入口。`internal/config/` 读取 YAML 配置，`internal/cmdb/` 维护资产、IPAM、权限、审计、CSV 导入和数据库。登录使用服务端一次性图形验证码，验证码 5 分钟有效。自动采集功能已移除，现阶段以手工维护和 CSV 导入为主。
- `web/src/` 是管理界面，`web/src/api.ts` 定义前端使用的接口类型。修改请求、响应或状态值时，检查 Go 接口和 React 调用方是否一致。
- 优先复用现有模块，按当前任务做可独立验证的改动。部署或配置方式有变化时，同步中英文 README 和对应的示例配置。

## 数据库与资产维护

- `internal/cmdb/schema.sql` 是唯一的建表脚本，首次连接空库时执行一次。项目仍在开发阶段，改表直接修改该文件；执行 `docker compose down -v` 清空数据卷后重启即可重建，不维护迁移文件。
- 数据库是 PostgreSQL，连接信息在 `config.yaml` 的 `database` 段（host/port/name/user/password/sslmode），容器部署时由环境变量 `DC_DB_DSN` 覆盖。程序是唯一写入方，事务内完成跨表校验；备份用 `pg_dump`，恢复用 `pg_restore`。
- 新库从空台账开始。手工演示数据保存在 Git 忽略的 `demo-data/` 中，按需导入隔离的开发库。
- 资产以手工维护和 CSV 导入为主。导入一次最多 5000 行、16 MiB，整批事务写入；任一行校验失败、名称重复或与已有资产重名时都不写入任何数据。导入只新增，不覆盖已有资产。

## 界面与语言

- 界面设计和组件复用遵循 [docs/design-system.md](docs/design-system.md)；新增或修改界面时按该规范检查交互、主题和可访问性。
- 当前以简体中文维护主 README 和管理界面，英文说明见 `README.en.md`。提交消息优先用英文。
- 管理界面不需要适配移动端。
- 管理界面支持浅色和暗色主题：首次访问跟随系统设置，登录页和顶部栏可切换，选择保存在浏览器 `localStorage` 的 `dc-db-theme`。新增界面和图表时必须同时检查两种主题。
- 修改界面时逐步集中可复用的文案。登录、保存、取消等通用文案可先配英文，功能范围和术语稳定后再补齐中英文翻译。
- 状态值、资源类型和审计动作使用稳定标识，由界面显示对应语言。资产名称、负责人和备注等资产数据按录入内容展示。

## 本地配置与验证

- 构建产物和本地数据留在本地，不提交。`config.example.yaml` 使用占位值，`config.yaml` 被 Git 忽略；配置以文件为主，仅容器部署用 `DC_DB_DSN` 覆盖数据库连接。
- Go 改动先运行 `gofmt`，再运行 `go test ./...`。前端依赖使用 `npm --prefix web ci` 安装，前端改动运行 `npm --prefix web run check`，涉及打包时运行 `npm --prefix web run build`。
- 涉及数据库或部署时，用独立的 PostgreSQL 测试库验证（`DC_DB_TEST_DSN`，默认 `dc_db_test`）。修改 `schema.sql` 后检查空库重建，确认已有资产可读；开发阶段不维护旧库升级。CSV 导入验证使用临时的虚构 CSV，覆盖成功、重复名称和错误行。

## 开发环境交付

- 每次代码改动完成并通过相关检查后，交付前用 `docker compose up -d --build` 在远程开发主机上重建并启动应用与 PostgreSQL；不再组装 `install.sh` + `dist/` 发布包。
- 更新沿用远程环境的 `pgdata` 数据卷和 `config.docker.yaml`，不用本地数据覆盖；数据库连接信息只走环境变量或受控配置。
- 部署后使用已配置的远程访问地址检查 `/healthz`，验证本次改动的入口或主要流程，并在交付时说明远程开发环境验证结果。
- 默认不再启动本机或 localhost Web 服务；仅在用户明确要求本地调试时临时启用，调试结束后停止。
- 部署目标从本机 Git 忽略的 `.tools/deploy/config.yaml` 读取（`ssh_target`、`base_url`），沿用已有的 SSH 免密配置。目标地址、SSH 连接信息和凭据只保存在受控的本机配置中；仓库文档和示例只使用占位符。
