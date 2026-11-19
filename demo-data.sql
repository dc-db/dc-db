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
    EXISTS (SELECT 1 FROM regions) OR
    EXISTS (SELECT 1 FROM rooms) OR EXISTS (SELECT 1 FROM racks) OR
    EXISTS (SELECT 1 FROM rack_placements) OR EXISTS (SELECT 1 FROM vlans) OR
    EXISTS (SELECT 1 FROM subnets) OR EXISTS (SELECT 1 FROM ip_allocations) OR
    EXISTS (SELECT 1 FROM interfaces) OR EXISTS (SELECT 1 FROM changes)
    THEN 0 ELSE 1 END;

INSERT INTO assets (id, kind, name, role, platform, status, lifecycle, owner, environment, address, cpu, memory_mib, notes, attributes)
SELECT v.* FROM (
    SELECT 1::bigint, 'host'::text, 'demo-host-01'::text, '服务器'::text, 'pve'::text, 'online'::text, 'active'::text,
           '示例运维组'::text, '演示'::text, '192.0.2.11'::text, 32::int, 131072::bigint, '虚构宿主机'::text, '{}'::text
    UNION ALL SELECT 2, 'host', 'demo-host-02', '服务器', 'kvm', 'online', 'active', '示例运维组', '演示', '192.0.2.12', 24, 98304, '虚构宿主机', '{}'
    UNION ALL SELECT 3, 'vm', 'demo-web-01', 'Web 服务器', 'pve', 'running', 'active', '示例应用组', '演示', '198.51.100.21', 4, 8192, '虚构 Web 虚拟机', '{}'
    UNION ALL SELECT 4, 'vm', 'demo-db-01', '数据库', 'pve', 'running', 'active', '示例应用组', '演示', '198.51.100.22', 8, 16384, '虚构数据库虚拟机', '{}'
    UNION ALL SELECT 5, 'vm', 'demo-worker-01', '应用服务器', 'kvm', 'stopped', 'active', '示例应用组', '演示', '198.51.100.23', 4, 8192, '虚构工作节点', '{}'
    UNION ALL SELECT 6, 'switch', 'demo-switch-01', '交换机', '', 'online', 'active', '示例网络组', '演示', '192.0.2.2', 0, 0, '虚构核心交换机', '{}'
    UNION ALL SELECT 7, 'switch', 'demo-switch-02', '交换机', '', 'offline', 'active', '示例网络组', '演示', '192.0.2.3', 0, 0, '虚构接入交换机', '{}'
    UNION ALL SELECT 8, 'host', 'demo-fw-01', '防火墙', '', 'online', 'active', '示例网络组', '演示', '192.0.2.1', 0, 0, '虚构边界防火墙', '{}'
    UNION ALL SELECT 9, 'host', 'demo-host-03', '服务器', 'pve', 'online', 'active', '示例运维组', '演示', '192.0.2.13', 16, 65536, '虚构宿主机', '{}'
    UNION ALL SELECT 10, 'host', 'demo-host-04', '服务器', 'kvm', 'online', 'active', '示例运维组', '演示', '192.0.2.14', 16, 65536, '虚构宿主机', '{}'
    UNION ALL SELECT 11, 'switch', 'demo-switch-03', '交换机', '', 'online', 'active', '示例网络组', '演示', '192.0.2.4', 0, 0, '虚构汇聚交换机', '{}'
    UNION ALL SELECT 12, 'host', 'demo-host-05', '服务器', 'pve', 'offline', 'active', '示例运维组', '演示', '192.0.2.15', 8, 32768, '虚构宿主机', '{}'
    UNION ALL SELECT 13, 'switch', 'demo-switch-04', '交换机', '', 'online', 'active', '示例网络组', '演示', '192.0.2.5', 0, 0, '虚构接入交换机', '{}'
    UNION ALL SELECT 14, 'host', 'demo-host-06', '服务器', 'kvm', 'online', 'active', '示例运维组', '演示', '192.0.2.16', 12, 49152, '虚构宿主机', '{}'
    UNION ALL SELECT 15, 'host', 'demo-host-07', '服务器', 'pve', 'online', 'active', '示例运维组', '演示', '192.0.2.17', 8, 32768, '虚构宿主机', '{}'
    UNION ALL SELECT 16, 'switch', 'demo-switch-05', '交换机', '', 'online', 'active', '示例网络组', '演示', '192.0.2.6', 0, 0, '虚构接入交换机', '{}'
) AS v WHERE EXISTS (SELECT 1 FROM demo_empty_guard);

INSERT INTO asset_links (from_id, to_id, kind)
SELECT v.* FROM (
    SELECT 1::bigint, 3::bigint, 'hosts'::text
    UNION ALL SELECT 1, 4, 'hosts' UNION ALL SELECT 2, 5, 'hosts'
) AS v WHERE EXISTS (SELECT 1 FROM demo_empty_guard);

INSERT INTO tags (id, name, color, description)
SELECT v.* FROM (
    SELECT 1::bigint, '演示环境'::text, '#1677ff'::text, '虚构示例资产'::text
    UNION ALL SELECT 2, '计算', '#52c41a', '虚构计算资源'
    UNION ALL SELECT 3, '网络', '#fa8c16', '虚构网络设备'
) AS v WHERE EXISTS (SELECT 1 FROM demo_empty_guard);

INSERT INTO asset_groups (id, name, description)
SELECT v.* FROM (
    SELECT 1::bigint, '核心业务'::text, '交易与支付系统'::text
    UNION ALL SELECT 2, '数据平台', '报表与分析'
    UNION ALL SELECT 3, '研发测试', '测试与预发环境'
) AS v WHERE EXISTS (SELECT 1 FROM demo_empty_guard);

-- 网络设备不归属项目，其余按用途分组。
UPDATE assets SET group_id = CASE id
    WHEN 3 THEN 1 WHEN 4 THEN 1 WHEN 5 THEN 1
    WHEN 1 THEN 2 WHEN 2 THEN 2
    WHEN 9 THEN 3 WHEN 10 THEN 3 WHEN 12 THEN 3 WHEN 14 THEN 3 WHEN 15 THEN 3
    ELSE NULL END
WHERE EXISTS (SELECT 1 FROM demo_empty_guard);

INSERT INTO asset_tags (asset_id, tag_id)
SELECT v.* FROM (
    SELECT 1::bigint, 1::bigint UNION ALL SELECT 2, 1 UNION ALL SELECT 3, 1 UNION ALL SELECT 4, 1 UNION ALL SELECT 5, 1 UNION ALL SELECT 6, 1
    UNION ALL SELECT 1, 2 UNION ALL SELECT 2, 2 UNION ALL SELECT 3, 2 UNION ALL SELECT 4, 2 UNION ALL SELECT 5, 2 UNION ALL SELECT 6, 3
    UNION ALL SELECT 7, 3 UNION ALL SELECT 8, 3
) AS v WHERE EXISTS (SELECT 1 FROM demo_empty_guard);

INSERT INTO regions (id, name)
SELECT v.* FROM (
    SELECT 1::bigint, '华北'::text
    UNION ALL SELECT 2, '华东'
) AS v WHERE EXISTS (SELECT 1 FROM demo_empty_guard);

INSERT INTO rooms (id, name, region_id)
SELECT v.* FROM (
    SELECT 1::bigint, '北京亦庄数据中心'::text, 1::bigint
    UNION ALL SELECT 2, '上海数据中心', 2
    UNION ALL SELECT 3, '测试机房', NULL
) AS v WHERE EXISTS (SELECT 1 FROM demo_empty_guard);
INSERT INTO racks (id, room_id, name, zone, height_u)
SELECT v.* FROM (
    SELECT 1::bigint, 1::bigint, 'DEMO-A01'::text, 'A 区'::text, 42::int
    UNION ALL SELECT 2, 1, 'DEMO-A02', 'A 区', 42
    UNION ALL SELECT 3, 1, 'DEMO-A03', 'A 区', 42
    UNION ALL SELECT 4, 1, 'DEMO-A04', 'A 区', 42
    UNION ALL SELECT 5, 1, 'DEMO-B01', 'B 区', 24
    UNION ALL SELECT 6, 1, 'DEMO-B02', 'B 区', 42
    UNION ALL SELECT 7, 2, 'SH-S01', 'S 区', 42
    UNION ALL SELECT 8, 2, 'SH-S02', 'S 区', 42
    UNION ALL SELECT 9, 2, 'SH-S03', 'S 区', 24
    UNION ALL SELECT 10, 3, 'TEST-T01', 'T 区', 42
    UNION ALL SELECT 11, 3, 'TEST-T02', 'T 区', 42
) AS v WHERE EXISTS (SELECT 1 FROM demo_empty_guard);
INSERT INTO rack_placements (asset_id, rack_id, start_u, units, face, depth)
SELECT v.* FROM (
    SELECT 1::bigint, 1::bigint, 1::int, 2::int, 'front'::text, 'full'::text
    UNION ALL SELECT 2, 1, 4, 2, 'front', 'full'
    UNION ALL SELECT 6, 2, 40, 1, 'front', 'full'
    UNION ALL SELECT 7, 2, 38, 1, 'front', 'full'
    UNION ALL SELECT 9, 3, 10, 2, 'front', 'full'
    UNION ALL SELECT 10, 3, 14, 1, 'front', 'full'
    UNION ALL SELECT 11, 4, 20, 1, 'front', 'full'
    UNION ALL SELECT 12, 4, 24, 2, 'front', 'full'
    UNION ALL SELECT 8, 5, 1, 1, 'front', 'full'
    UNION ALL SELECT 13, 6, 30, 1, 'front', 'full'
    UNION ALL SELECT 14, 7, 5, 2, 'front', 'full'
    UNION ALL SELECT 15, 8, 8, 1, 'front', 'full'
    UNION ALL SELECT 16, 9, 3, 1, 'front', 'full'
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

-- 接口与连线：两台主机分别上联到两台交换机。
INSERT INTO interfaces (asset_id, name, medium, speed_mbps, mac, status, description)
SELECT v.* FROM (
    SELECT 1::bigint, 'eth0'::text, 'fiber'::text, 10000::int, 'aa:bb:cc:00:01:01'::text, 'up'::text, '上联核心交换机'::text
    UNION ALL SELECT 1, 'eth1', 'copper', 1000, 'aa:bb:cc:00:01:02', 'down', '备用管理口'
    UNION ALL SELECT 2, 'eth0', 'fiber', 10000, 'aa:bb:cc:00:02:01', 'up', '上联接入交换机'
    UNION ALL SELECT 6, 'Gi0/1', 'fiber', 10000, '', 'up', '连接 demo-host-01'
    UNION ALL SELECT 6, 'Gi0/2', 'copper', 1000, '', 'up', '连接 demo-host-02'
    UNION ALL SELECT 6, 'Gi0/3', 'copper', 1000, '', 'down', '预留'
    UNION ALL SELECT 7, 'Gi0/1', 'fiber', 10000, '', 'up', '上联核心交换机'
    UNION ALL SELECT 7, 'Gi0/2', 'copper', 1000, '', 'up', '连接 demo-host-02'
) AS v WHERE EXISTS (SELECT 1 FROM demo_empty_guard);

-- 双向写入对端，保证连接关系对称。
UPDATE interfaces a SET peer_id = b.id
FROM interfaces b
WHERE a.asset_id = 1 AND a.name = 'eth0' AND b.asset_id = 7 AND b.name = 'Gi0/2'
  AND EXISTS (SELECT 1 FROM demo_empty_guard);
UPDATE interfaces a SET peer_id = b.id
FROM interfaces b
WHERE a.asset_id = 7 AND a.name = 'Gi0/2' AND b.asset_id = 1 AND b.name = 'eth0'
  AND EXISTS (SELECT 1 FROM demo_empty_guard);
UPDATE interfaces a SET peer_id = b.id
FROM interfaces b
WHERE a.asset_id = 2 AND a.name = 'eth0' AND b.asset_id = 7 AND b.name = 'Gi0/1'
  AND EXISTS (SELECT 1 FROM demo_empty_guard);
UPDATE interfaces a SET peer_id = b.id
FROM interfaces b
WHERE a.asset_id = 7 AND a.name = 'Gi0/1' AND b.asset_id = 2 AND b.name = 'eth0'
  AND EXISTS (SELECT 1 FROM demo_empty_guard);

-- 显式写入主键后推进序列，避免后续新增记录主键冲突。
SELECT setval(pg_get_serial_sequence('assets', 'id'), (SELECT max(id) FROM assets));
SELECT setval(pg_get_serial_sequence('regions', 'id'), (SELECT max(id) FROM regions));
SELECT setval(pg_get_serial_sequence('tags', 'id'), (SELECT max(id) FROM tags));
SELECT setval(pg_get_serial_sequence('asset_groups', 'id'), (SELECT max(id) FROM asset_groups));
SELECT setval(pg_get_serial_sequence('rooms', 'id'), (SELECT max(id) FROM rooms));
SELECT setval(pg_get_serial_sequence('racks', 'id'), (SELECT max(id) FROM racks));
SELECT setval(pg_get_serial_sequence('vlans', 'id'), (SELECT max(id) FROM vlans));
SELECT setval(pg_get_serial_sequence('subnets', 'id'), (SELECT max(id) FROM subnets));

COMMIT;
