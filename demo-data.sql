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
    EXISTS (SELECT 1 FROM interfaces) OR EXISTS (SELECT 1 FROM asset_services) OR
    EXISTS (SELECT 1 FROM changes)
    THEN 0 ELSE 1 END;

INSERT INTO assets (id, kind, name, platform, status, lifecycle, owner, environment, address, cpu, memory_mib, notes, attributes)
SELECT v.* FROM (
    SELECT 1::bigint, 'host'::text, 'demo-host-01'::text, 'pve'::text, 'online'::text, 'active'::text, '示例运维组'::text, '演示'::text, '192.0.2.11'::text, 32::int, 131072::bigint, '虚构宿主机'::text, '{}'::text
    UNION ALL SELECT 2, 'host', 'demo-host-02', 'kvm', 'online', 'active', '示例运维组', '演示', '192.0.2.12', 24, 98304, '虚构宿主机', '{}'
    UNION ALL SELECT 3, 'vm', 'demo-web-01', 'pve', 'running', 'active', '示例应用组', '演示', '198.51.100.21', 4, 8192, '虚构 Web 虚拟机', '{}'
    UNION ALL SELECT 4, 'vm', 'demo-db-01', 'pve', 'running', 'active', '示例应用组', '演示', '198.51.100.22', 8, 16384, '虚构数据库虚拟机', '{}'
    UNION ALL SELECT 5, 'vm', 'demo-worker-01', 'kvm', 'stopped', 'active', '示例应用组', '演示', '198.51.100.23', 4, 8192, '虚构工作节点', '{}'
    UNION ALL SELECT 6, 'switch', 'demo-switch-01', '', 'online', 'active', '示例网络组', '演示', '192.0.2.2', 0, 0, '虚构核心交换机', '{}'
    UNION ALL SELECT 7, 'switch', 'demo-switch-02', '', 'offline', 'active', '示例网络组', '演示', '192.0.2.3', 0, 0, '虚构接入交换机', '{}'
    UNION ALL SELECT 8, 'firewall', 'demo-fw-01', '', 'online', 'active', '示例网络组', '演示', '192.0.2.1', 0, 0, '虚构边界防火墙', '{}'
    UNION ALL SELECT 9, 'host', 'demo-host-03', 'pve', 'online', 'active', '示例运维组', '演示', '192.0.2.13', 16, 65536, '虚构宿主机', '{}'
    UNION ALL SELECT 10, 'host', 'demo-host-04', 'kvm', 'online', 'active', '示例运维组', '演示', '192.0.2.14', 16, 65536, '虚构宿主机', '{}'
    UNION ALL SELECT 11, 'switch', 'demo-switch-03', '', 'online', 'active', '示例网络组', '演示', '192.0.2.4', 0, 0, '虚构汇聚交换机', '{}'
    UNION ALL SELECT 12, 'host', 'demo-host-05', 'pve', 'offline', 'active', '示例运维组', '演示', '192.0.2.15', 8, 32768, '虚构宿主机', '{}'
    UNION ALL SELECT 13, 'switch', 'demo-switch-04', '', 'online', 'active', '示例网络组', '演示', '192.0.2.5', 0, 0, '虚构接入交换机', '{}'
    UNION ALL SELECT 14, 'host', 'demo-host-06', 'kvm', 'online', 'active', '示例运维组', '演示', '192.0.2.16', 12, 49152, '虚构宿主机', '{}'
    UNION ALL SELECT 15, 'host', 'demo-host-07', 'pve', 'online', 'active', '示例运维组', '演示', '192.0.2.17', 8, 32768, '虚构宿主机', '{}'
    UNION ALL SELECT 16, 'switch', 'demo-switch-05', '', 'online', 'active', '示例网络组', '演示', '192.0.2.6', 0, 0, '虚构接入交换机', '{}'
    UNION ALL SELECT 17, 'host', 'demo-sz-host-01', 'pve', 'online', 'active', '示例运维组', '演示', '203.0.113.11', 24, 98304, '虚构深圳宿主机', '{}'
    UNION ALL SELECT 18, 'host', 'demo-sz-host-02', 'kvm', 'online', 'active', '示例运维组', '演示', '203.0.113.12', 16, 65536, '虚构深圳宿主机', '{}'
    UNION ALL SELECT 19, 'vm', 'demo-sz-app-01', 'pve', 'running', 'active', '示例应用组', '演示', '203.0.113.21', 4, 8192, '虚构深圳应用虚拟机', '{}'
    UNION ALL SELECT 20, 'host', 'demo-gz-store-01', 'kvm', 'online', 'active', '示例运维组', '演示', '203.0.113.13', 16, 65536, '虚构广州存储节点', '{}'
    UNION ALL SELECT 21, 'vm', 'demo-gz-app-01', 'kvm', 'running', 'active', '示例应用组', '演示', '203.0.113.22', 4, 8192, '虚构广州应用虚拟机', '{}'
    UNION ALL SELECT 22, 'switch', 'demo-hz-switch-01', '', 'online', 'active', '示例网络组', '演示', '203.0.113.2', 0, 0, '虚构杭州接入交换机', '{}'
    UNION ALL SELECT 23, 'host', 'demo-hz-host-01', 'pve', 'online', 'active', '示例运维组', '演示', '203.0.113.14', 32, 131072, '虚构杭州宿主机', '{}'
    UNION ALL SELECT 24, 'vm', 'demo-hz-app-01', 'pve', 'running', 'active', '示例应用组', '演示', '203.0.113.23', 8, 16384, '虚构杭州应用虚拟机', '{}'
    UNION ALL SELECT 25, 'host', 'demo-cd-host-01', 'kvm', 'online', 'active', '示例运维组', '演示', '203.0.113.15', 12, 49152, '虚构成都宿主机', '{}'
    UNION ALL SELECT 26, 'switch', 'demo-cd-switch-01', '', 'online', 'active', '示例网络组', '演示', '203.0.113.3', 0, 0, '虚构成都汇聚交换机', '{}'
    UNION ALL SELECT 27, 'host', 'demo-test-host-03', 'pve', 'offline', 'active', '示例运维组', '演示', '203.0.113.16', 8, 32768, '虚构测试宿主机', '{}'
    UNION ALL SELECT 28, 'vm', 'demo-test-app-01', 'kvm', 'stopped', 'active', '示例应用组', '演示', '203.0.113.24', 2, 4096, '虚构测试虚拟机', '{}'
    UNION ALL SELECT 29, 'router', 'demo-router-01', '', 'online', 'active', '示例网络组', '演示', '192.0.2.7', 0, 0, '虚构核心出口路由器', '{}'
    UNION ALL SELECT 30, 'firewall', 'demo-sz-fw-01', '', 'online', 'active', '示例网络组', '演示', '203.0.113.1', 0, 0, '虚构深圳边界防火墙', '{}'
    UNION ALL SELECT 31, 'load_balancer', 'demo-lb-01', '', 'online', 'active', '示例网络组', '演示', '198.51.100.2', 0, 0, '虚构北京硬件负载均衡', '{}'
    UNION ALL SELECT 32, 'load_balancer', 'demo-sh-lb-01', '', 'online', 'active', '示例网络组', '演示', '198.51.100.3', 0, 0, '虚构上海硬件负载均衡', '{}') AS v WHERE EXISTS (SELECT 1 FROM demo_empty_guard);

INSERT INTO asset_links (from_id, to_id, kind)
SELECT v.* FROM (
    SELECT 1::bigint, 3::bigint, 'hosts'::text
    UNION ALL SELECT 1, 4, 'hosts'
    UNION ALL SELECT 2, 5, 'hosts'
    UNION ALL SELECT 17, 19, 'hosts'
    UNION ALL SELECT 20, 21, 'hosts'
    UNION ALL SELECT 23, 24, 'hosts'
    UNION ALL SELECT 27, 28, 'hosts'
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
    UNION ALL SELECT 17, 1 UNION ALL SELECT 18, 1 UNION ALL SELECT 19, 1 UNION ALL SELECT 20, 1
    UNION ALL SELECT 21, 1 UNION ALL SELECT 23, 1 UNION ALL SELECT 24, 1 UNION ALL SELECT 25, 1
    UNION ALL SELECT 22, 3 UNION ALL SELECT 26, 3
    UNION ALL SELECT 29, 3 UNION ALL SELECT 30, 3 UNION ALL SELECT 31, 3 UNION ALL SELECT 32, 3
    UNION ALL SELECT 29, 1 UNION ALL SELECT 30, 1 UNION ALL SELECT 31, 1 UNION ALL SELECT 32, 1
    UNION ALL SELECT 17, 2 UNION ALL SELECT 18, 2 UNION ALL SELECT 23, 2 UNION ALL SELECT 25, 2
) AS v WHERE EXISTS (SELECT 1 FROM demo_empty_guard);

INSERT INTO regions (id, name)
SELECT v.* FROM (
    SELECT 1::bigint, '华北'::text
    UNION ALL SELECT 2, '华东'
    UNION ALL SELECT 3, '华南'
    UNION ALL SELECT 4, '西南'
) AS v WHERE EXISTS (SELECT 1 FROM demo_empty_guard);

INSERT INTO rooms (id, name, region_id)
SELECT v.* FROM (
    SELECT 1::bigint, '北京亦庄数据中心'::text, 1::bigint
    UNION ALL SELECT 2, '上海数据中心', 2
    UNION ALL SELECT 3, '测试机房', NULL
    UNION ALL SELECT 4, '深圳数据中心', 3
    UNION ALL SELECT 5, '广州数据中心', 3
    UNION ALL SELECT 6, '杭州数据中心', 2
    UNION ALL SELECT 7, '成都数据中心', 4
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
    UNION ALL SELECT 12, 4, 'SZ-A01', 'A 区', 42
    UNION ALL SELECT 13, 4, 'SZ-A02', 'A 区', 42
    UNION ALL SELECT 14, 4, 'SZ-B01', 'B 区', 24
    UNION ALL SELECT 15, 5, 'GZ-A01', 'A 区', 42
    UNION ALL SELECT 16, 5, 'GZ-A02', 'A 区', 42
    UNION ALL SELECT 17, 6, 'HZ-C01', 'C 区', 42
    UNION ALL SELECT 18, 6, 'HZ-C02', 'C 区', 42
    UNION ALL SELECT 19, 6, 'HZ-C03', 'C 区', 24
    UNION ALL SELECT 20, 7, 'CD-D01', 'D 区', 42
    UNION ALL SELECT 21, 7, 'CD-D02', 'D 区', 42
    UNION ALL SELECT 22, 3, 'TEST-T03', 'T 区', 42
    UNION ALL SELECT 23, 3, 'TEST-T04', 'T 区', 24
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
    UNION ALL SELECT 17, 12, 10, 2, 'front', 'full'
    UNION ALL SELECT 18, 12, 16, 2, 'front', 'full'
    UNION ALL SELECT 19, 13, 6, 1, 'front', 'full'
    UNION ALL SELECT 20, 15, 20, 2, 'front', 'full'
    UNION ALL SELECT 21, 16, 8, 1, 'front', 'full'
    UNION ALL SELECT 22, 17, 40, 1, 'front', 'full'
    UNION ALL SELECT 23, 17, 20, 2, 'front', 'full'
    UNION ALL SELECT 24, 18, 10, 1, 'front', 'full'
    UNION ALL SELECT 25, 20, 12, 2, 'front', 'full'
    UNION ALL SELECT 26, 20, 38, 1, 'front', 'full'
    UNION ALL SELECT 27, 22, 10, 2, 'front', 'full'
    UNION ALL SELECT 28, 22, 16, 1, 'front', 'full'
    UNION ALL SELECT 29, 2, 41, 1, 'front', 'full'
    UNION ALL SELECT 30, 12, 40, 1, 'front', 'full'
    UNION ALL SELECT 31, 2, 36, 1, 'front', 'full'
    UNION ALL SELECT 32, 7, 40, 1, 'front', 'full'
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

-- 参考数据：几百条，方便看分类列表和分页效果。
INSERT INTO asset_groups (id, name, description)
SELECT 1000 + i, '演示项目-' || lpad(i::text, 2, '0'),
       CASE WHEN i % 3 = 0 THEN '虚构项目，用于演示分组' ELSE '' END
FROM generate_series(1, 37) AS i
WHERE EXISTS (SELECT 1 FROM demo_empty_guard)
ON CONFLICT DO NOTHING;

INSERT INTO tags (id, name, color, description)
SELECT 1000 + i, '演示标签-' || lpad(i::text, 2, '0'),
       (ARRAY['#1677ff', '#52c41a', '#faad14', '#f5222d', '#eb2f96', '#722ed1', '#13c2c2', '#8c8c8c'])[1 + (i % 8)],
       CASE WHEN i % 4 = 0 THEN '虚构标签' ELSE '' END
FROM generate_series(1, 77) AS i
WHERE EXISTS (SELECT 1 FROM demo_empty_guard)
ON CONFLICT DO NOTHING;

INSERT INTO services (id, name, category, default_port, description, builtin)
SELECT 1000 + i, '内部系统-' || lpad(i::text, 3, '0'),
       (ARRAY['内部系统', '研发工具', '监控', '存储', '消息队列'])[1 + (i % 5)],
       8000 + i,
       '虚构内部服务',
       false
FROM generate_series(1, 122) AS i
WHERE EXISTS (SELECT 1 FROM demo_empty_guard)
ON CONFLICT DO NOTHING;

INSERT INTO metadata_entries (id, kind, name, description)
SELECT 1000 + i, 'owner',
       (ARRAY['张', '李', '王', '赵', '刘', '陈', '杨', '黄', '周', '吴'])[1 + (i % 10)] || '示例' || lpad(i::text, 2, '0'),
       CASE WHEN i % 3 = 0 THEN '虚构负责人' ELSE '' END
FROM generate_series(1, 60) AS i
WHERE EXISTS (SELECT 1 FROM demo_empty_guard)
ON CONFLICT DO NOTHING;

INSERT INTO metadata_entries (id, kind, name, description)
SELECT 2000 + i, 'operator',
       (ARRAY['中国移动', '中国联通', '中国电信', '中国广电', '教育网', '科技网', '国际专线', '云专线'])[i],
       '虚构线路运营商'
FROM generate_series(1, 8) AS i
WHERE EXISTS (SELECT 1 FROM demo_empty_guard)
ON CONFLICT DO NOTHING;

-- 为演示服务关联虚拟机与服务器，方便在服务拓扑中查看「服务 → 虚拟机 → 服务器 → 数据中心」链路。
INSERT INTO asset_services (asset_id, service_id)
SELECT m.asset_id, s.id
FROM (VALUES
    (3::bigint, 'nginx'::text), (19, 'nginx'), (24, 'nginx'), (9, 'nginx'),
    (4, 'postgresql'), (21, 'postgresql'),
    (3, 'redis'), (5, 'redis'), (19, 'redis'),
    (5, 'kafka'), (28, 'kafka'),
    (10, 'prometheus'), (24, 'prometheus'),
    (10, 'grafana'),
    (20, 'minio'), (25, 'minio'),
    (14, 'gitlab'),
    (15, 'harbor'),
    (18, 'elasticsearch'), (21, 'elasticsearch'),
    (1, 'etcd'), (2, 'etcd'), (17, 'etcd'),
    (14, 'vault')
) AS m(asset_id, service_name)
JOIN services s ON lower(s.name) = lower(m.service_name)
WHERE EXISTS (SELECT 1 FROM demo_empty_guard)
ON CONFLICT DO NOTHING;

-- 显式写入主键后推进序列，避免后续新增记录主键冲突。
SELECT setval(pg_get_serial_sequence('assets', 'id'), (SELECT max(id) FROM assets));
SELECT setval(pg_get_serial_sequence('regions', 'id'), (SELECT max(id) FROM regions));
SELECT setval(pg_get_serial_sequence('tags', 'id'), (SELECT max(id) FROM tags));
SELECT setval(pg_get_serial_sequence('asset_groups', 'id'), (SELECT max(id) FROM asset_groups));
SELECT setval(pg_get_serial_sequence('services', 'id'), (SELECT max(id) FROM services));
SELECT setval(pg_get_serial_sequence('metadata_entries', 'id'), (SELECT max(id) FROM metadata_entries));
SELECT setval(pg_get_serial_sequence('rooms', 'id'), (SELECT max(id) FROM rooms));
SELECT setval(pg_get_serial_sequence('racks', 'id'), (SELECT max(id) FROM racks));
SELECT setval(pg_get_serial_sequence('vlans', 'id'), (SELECT max(id) FROM vlans));
SELECT setval(pg_get_serial_sequence('subnets', 'id'), (SELECT max(id) FROM subnets));

COMMIT;
