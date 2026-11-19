-- 虚构示例数据：只用于已按 schema.sql 初始化的空隔离开发库。
-- 不要在生产库或包含业务数据的数据库中运行。所有地址均为文档专用地址。
-- 执行前备份数据库并停止服务。若台账非空，保护检查会失败，不会写入示例。
-- 在 psql 中执行完整脚本；发生错误时回滚事务。账号和会话不受影响。
--
--   psql -v ON_ERROR_STOP=1 -d dc_db -f demo-data.sql

BEGIN;

-- 每条写入都依赖此保护行，即使客户端在检查失败后继续执行也不会导入。
CREATE TEMP TABLE demo_empty_guard (ok INTEGER NOT NULL CHECK (ok = 1)) ON COMMIT DROP;
INSERT INTO demo_empty_guard (ok)
SELECT CASE WHEN
    EXISTS (SELECT 1 FROM assets) OR EXISTS (SELECT 1 FROM asset_links) OR
    EXISTS (SELECT 1 FROM tags) OR EXISTS (SELECT 1 FROM asset_tags) OR
    EXISTS (SELECT 1 FROM rooms) OR EXISTS (SELECT 1 FROM racks) OR
    EXISTS (SELECT 1 FROM rack_placements) OR EXISTS (SELECT 1 FROM vlans) OR
    EXISTS (SELECT 1 FROM subnets) OR EXISTS (SELECT 1 FROM ip_allocations) OR
    EXISTS (SELECT 1 FROM changes)
    THEN 0 ELSE 1 END;

INSERT INTO assets (id, kind, name, platform, status, lifecycle, owner, environment, address, cpu, memory_mib, notes, attributes)
SELECT v.* FROM (
    SELECT 1::bigint, 'host'::text, 'demo-host-01'::text, 'pve'::text, 'online'::text, 'active'::text,
           '示例运维组'::text, '演示'::text, '192.0.2.11'::text, 32::int, 131072::bigint, '虚构宿主机'::text, '{}'::text
    UNION ALL SELECT 2, 'host', 'demo-host-02', 'kvm', 'online', 'active', '示例运维组', '演示', '192.0.2.12', 24, 98304, '虚构宿主机', '{}'
    UNION ALL SELECT 3, 'vm', 'demo-web-01', 'pve', 'running', 'active', '示例应用组', '演示', '198.51.100.21', 4, 8192, '虚构 Web 虚拟机', '{}'
    UNION ALL SELECT 4, 'vm', 'demo-db-01', 'pve', 'running', 'active', '示例应用组', '演示', '198.51.100.22', 8, 16384, '虚构数据库虚拟机', '{}'
    UNION ALL SELECT 5, 'vm', 'demo-worker-01', 'kvm', 'stopped', 'active', '示例应用组', '演示', '198.51.100.23', 4, 8192, '虚构工作节点', '{}'
    UNION ALL SELECT 6, 'switch', 'demo-switch-01', '', 'online', 'active', '示例网络组', '演示', '192.0.2.2', 0, 0, '虚构交换机', '{}'
) AS v WHERE EXISTS (SELECT 1 FROM demo_empty_guard);

INSERT INTO asset_links (from_id, to_id, kind)
SELECT v.* FROM (SELECT 1::bigint, 3::bigint, 'hosts'::text UNION ALL SELECT 1, 4, 'hosts' UNION ALL SELECT 2, 5, 'hosts') AS v
WHERE EXISTS (SELECT 1 FROM demo_empty_guard);

INSERT INTO tags (id, name, color, description)
SELECT v.* FROM (
    SELECT 1::bigint, '演示环境'::text, '#1677ff'::text, '虚构示例资产'::text
    UNION ALL SELECT 2, '计算', '#52c41a', '虚构计算资源'
    UNION ALL SELECT 3, '网络', '#fa8c16', '虚构网络设备'
) AS v WHERE EXISTS (SELECT 1 FROM demo_empty_guard);

INSERT INTO asset_tags (asset_id, tag_id)
SELECT v.* FROM (
    SELECT 1::bigint, 1::bigint UNION ALL SELECT 2, 1 UNION ALL SELECT 3, 1 UNION ALL SELECT 4, 1 UNION ALL SELECT 5, 1 UNION ALL SELECT 6, 1
    UNION ALL SELECT 1, 2 UNION ALL SELECT 2, 2 UNION ALL SELECT 3, 2 UNION ALL SELECT 4, 2 UNION ALL SELECT 5, 2 UNION ALL SELECT 6, 3
) AS v WHERE EXISTS (SELECT 1 FROM demo_empty_guard);

INSERT INTO rooms (id, name, grid_columns, grid_rows)
SELECT 1, '示例数据中心', 6, 4 WHERE EXISTS (SELECT 1 FROM demo_empty_guard);
INSERT INTO racks (id, room_id, name, height_u, grid_col, grid_row, rotation)
SELECT v.* FROM (
    SELECT 1::bigint, 1::bigint, 'DEMO-A01'::text, 42::int, 1::int, 1::int, 0::int
    UNION ALL SELECT 2, 1, 'DEMO-A02', 42, 2, 1, 0
) AS v WHERE EXISTS (SELECT 1 FROM demo_empty_guard);
INSERT INTO rack_placements (asset_id, rack_id, start_u, units, face, depth)
SELECT v.* FROM (
    SELECT 1::bigint, 1::bigint, 1::int, 2::int, 'front'::text, 'full'::text
    UNION ALL SELECT 2, 1, 4, 2, 'front', 'full'
    UNION ALL SELECT 6, 2, 40, 1, 'front', 'full'
) AS v WHERE EXISTS (SELECT 1 FROM demo_empty_guard);

INSERT INTO vlans (id, vid, name, status, description, room_id)
SELECT v.* FROM (
    SELECT 1::bigint, 100::int, 'demo-management'::text, 'active'::text, '虚构管理网络'::text, 1::bigint
    UNION ALL SELECT 2, 200, 'demo-workload', 'active', '虚构业务网络', 1
) AS v WHERE EXISTS (SELECT 1 FROM demo_empty_guard);
INSERT INTO subnets (id, name, cidr, gateway, vlan, notes, status, role)
SELECT v.* FROM (
    SELECT 1::bigint, '示例管理网'::text, '192.0.2.0/24'::text, '192.0.2.1'::text, '100'::text, '文档专用地址'::text, 'active'::text, '管理'::text
    UNION ALL SELECT 2, '示例业务网', '198.51.100.0/24', '198.51.100.1', '200', '文档专用地址', 'active', '业务'
) AS v WHERE EXISTS (SELECT 1 FROM demo_empty_guard);
INSERT INTO ip_allocations (subnet_id, ip, asset_id, label, notes, status, dns_name, role)
SELECT v.* FROM (
    SELECT 1::bigint, '192.0.2.50'::text, NULL::bigint, '预留地址'::text, '虚构管理网络预留地址'::text, 'reserved'::text, ''::text, ''::text
    UNION ALL SELECT 2, '198.51.100.50', NULL, '示例虚拟 IP', '虚构服务地址', 'active', 'demo-service.example', 'vip'
    UNION ALL SELECT 2, '198.51.100.51', 3, '示例辅助地址', '', 'active', 'demo-web-extra.example', 'secondary'
) AS v WHERE EXISTS (SELECT 1 FROM demo_empty_guard);

-- 显式写入主键后推进序列，避免后续新增记录主键冲突。
SELECT setval(pg_get_serial_sequence('assets', 'id'), (SELECT max(id) FROM assets));
SELECT setval(pg_get_serial_sequence('tags', 'id'), (SELECT max(id) FROM tags));
SELECT setval(pg_get_serial_sequence('rooms', 'id'), (SELECT max(id) FROM rooms));
SELECT setval(pg_get_serial_sequence('racks', 'id'), (SELECT max(id) FROM racks));
SELECT setval(pg_get_serial_sequence('vlans', 'id'), (SELECT max(id) FROM vlans));
SELECT setval(pg_get_serial_sequence('subnets', 'id'), (SELECT max(id) FROM subnets));

COMMIT;
