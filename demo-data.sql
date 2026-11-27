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
    EXISTS (SELECT 1 FROM regions) OR
    EXISTS (SELECT 1 FROM rooms) OR EXISTS (SELECT 1 FROM racks) OR
    EXISTS (SELECT 1 FROM rack_placements) OR EXISTS (SELECT 1 FROM vlans) OR
    EXISTS (SELECT 1 FROM subnets) OR EXISTS (SELECT 1 FROM ip_allocations) OR
    EXISTS (SELECT 1 FROM interfaces) OR EXISTS (SELECT 1 FROM asset_service_instances) OR
    EXISTS (SELECT 1 FROM changes)
    THEN 0 ELSE 1 END;

INSERT INTO assets (id, kind, name, platform, status, lifecycle, owner, environment, address, probe_enabled, probe_status, probe_checked_at, cpu, memory_mib, notes)
SELECT v.* FROM (
    SELECT 1::bigint, 'host'::text, 'demo-host-01'::text, 'pve'::text, 'online'::text, 'active'::text, '示例运维组'::text, '演示'::text, '10.0.1.1'::text, true::boolean, 'reachable'::text, now() - interval '3 minutes', 32::int, 131072::bigint, '虚构宿主机'::text
    UNION ALL SELECT 2, 'host', 'demo-host-02', 'kvm', 'online', 'active', '示例运维组', '演示', '192.168.123.123', true, 'reachable', now() - interval '5 minutes', 24, 98304, '虚构宿主机'
    UNION ALL SELECT 3, 'vm', 'demo-web-01', 'pve', 'running', 'active', '示例应用组', '演示', '198.51.100.21', true, 'reachable', now() - interval '2 minutes', 4, 8192, '虚构 Web 虚拟机'
    UNION ALL SELECT 4, 'vm', 'demo-db-01', 'pve', 'running', 'active', '示例应用组', '演示', '192.168.108.204', true, 'reachable', now() - interval '4 minutes', 8, 16384, '虚构数据库虚拟机'
    UNION ALL SELECT 5, 'vm', 'demo-worker-01', 'kvm', 'stopped', 'active', '示例应用组', '演示', '10.0.2.5', true, 'unreachable', now() - interval '6 minutes', 4, 8192, '虚构工作节点'
    UNION ALL SELECT 6, 'switch', 'demo-switch-01', '', 'online', 'active', '示例网络组', '演示', '192.0.2.2', true, 'reachable', now() - interval '2 minutes', 0, 0, '虚构核心交换机'
    UNION ALL SELECT 7, 'switch', 'demo-switch-02', '', 'offline', 'active', '示例网络组', '演示', '192.168.123.250', true, 'unreachable', now() - interval '5 minutes', 0, 0, '虚构接入交换机'
    UNION ALL SELECT 8, 'firewall', 'demo-fw-01', '', 'online', 'active', '示例网络组', '演示', '192.0.2.1', true, 'reachable', now() - interval '3 minutes', 0, 0, '虚构边界防火墙'
    UNION ALL SELECT 9, 'host', 'demo-host-03', 'pve', 'online', 'active', '示例运维组', '演示', '192.0.2.13', true, 'unreachable', now() - interval '7 minutes', 16, 65536, '虚构宿主机'
    UNION ALL SELECT 10, 'host', 'demo-host-04', 'kvm', 'online', 'active', '示例运维组', '演示', '192.168.123.108', false, 'unknown', NULL, 16, 65536, '虚构宿主机'
    UNION ALL SELECT 11, 'switch', 'demo-switch-03', '', 'online', 'active', '示例网络组', '演示', '10.0.1.3', true, 'reachable', now() - interval '4 minutes', 0, 0, '虚构汇聚交换机'
    UNION ALL SELECT 12, 'host', 'demo-host-05', 'pve', 'offline', 'active', '示例运维组', '演示', '10.0.1.9', true, 'unreachable', now() - interval '9 minutes', 8, 32768, '虚构宿主机'
    UNION ALL SELECT 13, 'switch', 'demo-switch-04', '', 'online', 'active', '示例网络组', '演示', '192.0.2.5', false, 'unknown', NULL, 0, 0, '虚构接入交换机'
    UNION ALL SELECT 14, 'host', 'demo-host-06', 'kvm', 'online', 'active', '示例运维组', '演示', '192.0.2.16', true, 'reachable', now() - interval '11 minutes', 12, 49152, '虚构宿主机'
    UNION ALL SELECT 15, 'host', 'demo-host-07', 'pve', 'online', 'active', '示例运维组', '演示', '192.168.123.215', false, 'unknown', NULL, 8, 32768, '虚构宿主机'
    UNION ALL SELECT 16, 'switch', 'demo-switch-05', '', 'online', 'active', '示例网络组', '演示', '192.168.123.251', true, 'reachable', now() - interval '7 minutes', 0, 0, '虚构接入交换机'
    UNION ALL SELECT 17, 'host', 'demo-sz-host-01', 'pve', 'online', 'active', '示例运维组', '演示', '203.0.113.11', true, 'reachable', now() - interval '4 minutes', 24, 98304, '虚构深圳宿主机'
    UNION ALL SELECT 18, 'host', 'demo-sz-host-02', 'kvm', 'online', 'active', '示例运维组', '演示', '10.0.1.2', true, 'reachable', now() - interval '6 minutes', 16, 65536, '虚构深圳宿主机'
    UNION ALL SELECT 19, 'vm', 'demo-sz-app-01', 'pve', 'running', 'active', '示例应用组', '演示', '203.0.113.21', false, 'unknown', NULL, 4, 8192, '虚构深圳应用虚拟机'
    UNION ALL SELECT 20, 'host', 'demo-gz-store-01', 'kvm', 'online', 'active', '示例运维组', '演示', '203.0.113.13', false, 'unknown', NULL, 16, 65536, '虚构广州存储节点'
    UNION ALL SELECT 21, 'vm', 'demo-gz-app-01', 'kvm', 'running', 'active', '示例应用组', '演示', '10.0.2.9', true, 'reachable', now() - interval '8 minutes', 4, 8192, '虚构广州应用虚拟机'
    UNION ALL SELECT 22, 'switch', 'demo-hz-switch-01', '', 'online', 'active', '示例网络组', '演示', '203.0.113.2', true, 'reachable', now() - interval '9 minutes', 0, 0, '虚构杭州接入交换机'
    UNION ALL SELECT 23, 'host', 'demo-hz-host-01', 'pve', 'online', 'active', '示例运维组', '演示', '192.168.108.123', true, 'reachable', now() - interval '8 minutes', 32, 131072, '虚构杭州宿主机'
    UNION ALL SELECT 24, 'vm', 'demo-hz-app-01', 'pve', 'running', 'active', '示例应用组', '演示', '192.168.108.156', true, 'reachable', now() - interval '10 minutes', 8, 16384, '虚构杭州应用虚拟机'
    UNION ALL SELECT 25, 'host', 'demo-cd-host-01', 'kvm', 'online', 'active', '示例运维组', '演示', '10.0.1.8', true, 'reachable', now() - interval '10 minutes', 12, 49152, '虚构成都宿主机'
    UNION ALL SELECT 26, 'switch', 'demo-cd-switch-01', '', 'online', 'active', '示例网络组', '演示', '10.0.1.4', true, 'reachable', now() - interval '11 minutes', 0, 0, '虚构成都汇聚交换机'
    UNION ALL SELECT 27, 'host', 'demo-test-host-03', 'pve', 'offline', 'active', '示例运维组', '演示', '203.0.113.16', true, 'unreachable', now() - interval '12 minutes', 8, 32768, '虚构测试宿主机'
    UNION ALL SELECT 28, 'vm', 'demo-test-app-01', 'kvm', 'stopped', 'active', '示例应用组', '演示', '203.0.113.24', false, 'unknown', NULL, 2, 4096, '虚构测试虚拟机'
    UNION ALL SELECT 29, 'router', 'demo-router-01', '', 'online', 'active', '示例网络组', '演示', '192.0.2.7', true, 'reachable', now() - interval '3 minutes', 0, 0, '虚构核心出口路由器'
    UNION ALL SELECT 30, 'firewall', 'demo-sz-fw-01', '', 'online', 'active', '示例网络组', '演示', '203.0.113.1', true, 'reachable', now() - interval '5 minutes', 0, 0, '虚构深圳边界防火墙'
    UNION ALL SELECT 31, 'load_balancer', 'demo-lb-01', '', 'online', 'active', '示例网络组', '演示', '198.51.100.2', true, 'reachable', now() - interval '6 minutes', 0, 0, '虚构北京硬件负载均衡'
    UNION ALL SELECT 32, 'load_balancer', 'demo-sh-lb-01', '', 'online', 'active', '示例网络组', '演示', '192.168.108.250', false, 'unknown', NULL, 0, 0, '虚构上海硬件负载均衡') AS v WHERE EXISTS (SELECT 1 FROM demo_empty_guard);

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
INSERT INTO subnets (id, name, cidr, gateway, vlan, notes, status, role, room_id)
SELECT v.* FROM (
    SELECT 1::bigint, '示例管理网'::text, '192.0.2.0/24'::text, '192.0.2.1'::text, '100'::text, '文档专用地址'::text, 'active'::text, '管理'::text, 1::bigint
    UNION ALL SELECT 2, '示例业务网', '198.51.100.0/24', '198.51.100.1', '200', '文档专用地址', 'active', '业务', 1
    UNION ALL SELECT 3, '示例测试网', '203.0.113.0/24', '203.0.113.1', '200', '文档专用地址', 'active', '测试', 4
    UNION ALL SELECT 4, '示例短址管理网', '10.0.1.0/24', '10.0.1.254', '100', '虚构私有演示网段', 'active', '管理', 1
    UNION ALL SELECT 5, '示例短址业务网', '10.0.2.0/24', '10.0.2.254', '200', '虚构私有演示网段', 'active', '业务', 1
    UNION ALL SELECT 6, '示例扩展管理网', '192.168.123.0/24', '192.168.123.1', '100', '虚构私有演示网段', 'active', '管理', 1
    UNION ALL SELECT 7, '示例扩展业务网', '192.168.108.0/24', '192.168.108.1', '200', '虚构私有演示网段', 'active', '业务', 1
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


INSERT INTO people (name, description)
SELECT
       (ARRAY['张', '李', '王', '赵', '刘', '陈', '杨', '黄', '周', '吴'])[1 + (i % 10)] || '示例' || lpad(i::text, 2, '0'),
       CASE WHEN i % 3 = 0 THEN '虚构负责人' ELSE '' END
FROM generate_series(1, 60) AS i
WHERE EXISTS (SELECT 1 FROM demo_empty_guard)
ON CONFLICT DO NOTHING;

INSERT INTO metadata_entries (id, kind, name, description, room_id)
SELECT 2000 + i, 'operator',
       (ARRAY['中国移动', '中国联通', '中国电信', '中国广电', '教育网', '科技网', '国际专线', '云专线'])[1 + ((i - 1) % 8)]
       || '-' || (ARRAY['北京', '上海', '测试', '深圳', '广州', '杭州', '成都', '骨干'])[1 + ((i - 1) / 4)],
       '虚构线路运营商（接入专线编号 DEMO-ISP-' || lpad(i::text, 3, '0') || '）',
       CASE WHEN i <= 28 THEN 1 + ((i - 1) % 7) ELSE NULL END
FROM generate_series(1, 32) AS i
WHERE EXISTS (SELECT 1 FROM demo_empty_guard)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 批量模拟测试数据：覆盖 7 个数据中心及「未上架 / 未关联机房 / 未分配」场景
-- 所有 IP 均使用 RFC 1918 私有演示网段 (10.x.x.x)，主机名均为虚构前缀。
-- ============================================================================

-- 1. 扩展机柜：每个数据中心新增 10 个 42U 机柜（共 70 个，ID 101..170）
INSERT INTO racks (id, room_id, name, zone, height_u)
SELECT 100 + i,
       1 + ((i - 1) / 10),
       (ARRAY['BJ', 'SH', 'TEST', 'SZ', 'GZ', 'HZ', 'CD'])[1 + ((i - 1) / 10)]
       || '-R' || lpad((((i - 1) % 10) + 1)::text, 2, '0'),
       CASE WHEN ((i - 1) % 10) < 5 THEN 'A 区' ELSE 'B 区' END,
       42
FROM generate_series(1, 70) AS i
WHERE EXISTS (SELECT 1 FROM demo_empty_guard);

-- 2. 扩展 VLAN：7 个数据中心各 4 个 VLAN + 7 个未分配全局 VLAN（共 35 个，ID 101..135）
INSERT INTO vlans (id, vid, name, status, description, room_id)
SELECT 100 + i,
       1000 + i * 10,
       CASE
           WHEN i <= 28 THEN
               (ARRAY['bj', 'sh', 'test', 'sz', 'gz', 'hz', 'cd'])[1 + ((i - 1) / 4)]
               || '-' || (ARRAY['mgmt', 'prod', 'storage', 'interconnect'])[1 + ((i - 1) % 4)]
               || '-' || (1000 + i * 10)::text
           ELSE 'global-backbone-' || (1000 + i * 10)::text
       END,
       CASE WHEN i % 11 = 0 THEN 'reserved' ELSE 'active' END,
       CASE
           WHEN i <= 28 THEN '虚构机房网络分片 VLAN #' || i::text
           ELSE '虚构全局跨机房骨干 VLAN #' || i::text
       END,
       CASE WHEN i <= 28 THEN 1 + ((i - 1) / 4) ELSE NULL END
FROM generate_series(1, 35) AS i
WHERE EXISTS (SELECT 1 FROM demo_empty_guard);

-- 3. 扩展网段：与上述 35 个 VLAN 一一对应（10.101.0.0/24 .. 10.135.0.0/24，ID 101..135）
INSERT INTO subnets (id, name, cidr, gateway, vlan, notes, status, role, room_id)
SELECT 100 + i,
       CASE
           WHEN i <= 28 THEN
               (ARRAY['北京', '上海', '测试', '深圳', '广州', '杭州', '成都'])[1 + ((i - 1) / 4)]
               || (ARRAY['管理网段', '业务网段', '存储网段', '互联网段'])[1 + ((i - 1) % 4)]
               || '-' || lpad(i::text, 2, '0')
           ELSE '全局公共网段-' || lpad((i - 28)::text, 2, '0')
       END,
       '10.' || (100 + i)::text || '.0.0/24',
       '10.' || (100 + i)::text || '.0.1',
       (1000 + i * 10)::text,
       '虚构演示网段，用于测试按数据中心筛选与地址统计',
       CASE WHEN i % 11 = 0 THEN 'reserved' ELSE 'active' END,
       (ARRAY['管理', '业务', '存储', '互联'])[1 + ((i - 1) % 4)],
       CASE WHEN i <= 28 THEN 1 + ((i - 1) / 4) ELSE NULL END
FROM generate_series(1, 35) AS i
WHERE EXISTS (SELECT 1 FROM demo_empty_guard);

-- 4. 扩展服务器（140 台，ID 1001..1140：前 126 台分布在 7 个数据中心机柜中，后 14 台为「未上架」）
INSERT INTO assets (id, kind, name, platform, status, lifecycle, owner, environment, address, probe_enabled, probe_status, probe_checked_at, cpu, memory_mib, group_id, notes)
SELECT 1000 + i,
       'host',
       CASE
           WHEN i <= 126 THEN
               'demo-' || (ARRAY['bj', 'sh', 'test', 'sz', 'gz', 'hz', 'cd'])[1 + ((i - 1) / 18)]
               || '-srv-' || lpad((((i - 1) % 18) + 1)::text, 2, '0')
           ELSE 'demo-spare-srv-' || lpad((i - 126)::text, 2, '0')
       END,
       CASE WHEN i % 2 = 0 THEN 'pve' ELSE 'kvm' END,
       CASE WHEN i % 9 = 0 THEN 'offline' ELSE 'online' END,
       CASE WHEN i % 25 = 0 THEN 'retired' ELSE 'active' END,
       (ARRAY['示例运维组', '示例基础架构组', '示例平台组', '示例存储组'])[1 + (i % 4)],
       (ARRAY['生产', '生产', '预发', '测试'])[1 + (i % 4)],
       CASE
           WHEN i = 1 THEN '10.0.1.5'
           WHEN i = 2 THEN '192.168.123.101'
           WHEN i = 3 THEN '192.0.2.21'
           WHEN i = 4 THEN '192.168.123.102'
           WHEN i = 5 THEN '10.0.1.6'
           WHEN i = 6 THEN '10.101.0.15'
           WHEN i = 7 THEN '192.168.123.103'
           WHEN i = 8 THEN '10.0.1.7'
           WHEN i = 9 THEN '192.168.123.104'
           WHEN i = 10 THEN '10.101.0.19'
           WHEN i = 11 THEN '192.0.2.29'
           WHEN i = 12 THEN '192.168.123.105'
           WHEN i = 13 THEN '10.0.1.10'
           WHEN i = 14 THEN '192.168.123.106'
           WHEN i = 15 THEN '10.101.0.24'
           WHEN i = 16 THEN '10.0.1.11'
           WHEN i = 17 THEN '192.168.123.107'
           WHEN i <= 126 THEN '10.' || (101 + ((i - 1) / 18) * 4)::text || '.0.' || (10 + ((i - 1) % 18))::text
           WHEN i % 3 = 1 THEN '10.0.1.' || (40 + (i - 126))::text
           WHEN i % 3 = 2 THEN '192.168.123.' || (130 + (i - 126))::text
           ELSE '10.130.0.' || (10 + (i - 126))::text
       END,
       (i % 4 <> 0),
       CASE
           WHEN i % 4 = 0 THEN 'unknown'
           WHEN i % 9 = 0 OR i % 5 = 0 THEN 'unreachable'
           ELSE 'reachable'
       END,
       CASE WHEN i % 4 = 0 THEN NULL ELSE now() - ((i % 30) || ' minutes')::interval END,
       (ARRAY[16, 32, 48, 64, 96, 128])[1 + (i % 6)],
       (ARRAY[65536, 131072, 196608, 262144, 524288])[1 + (i % 5)],
       1 + (i % 3),
       CASE WHEN i <= 126 THEN '虚构机架式服务器节点' ELSE '虚构待上架备机服务器' END
FROM generate_series(1, 140) AS i
WHERE EXISTS (SELECT 1 FROM demo_empty_guard);

-- 将前 126 台服务器（1001..1126）上架到机柜 101..170 中（每个数据中心前 9 个机柜各放 2 台：U1..U2 和 U5..U6）
INSERT INTO rack_placements (asset_id, rack_id, start_u, units, face, depth)
SELECT 1000 + i,
       100 + ((i - 1) / 18) * 10 + (((i - 1) % 18) / 2) + 1,
       CASE WHEN ((i - 1) % 2) = 0 THEN 1 ELSE 5 END,
       2,
       'front',
       'full'
FROM generate_series(1, 126) AS i
WHERE EXISTS (SELECT 1 FROM demo_empty_guard);

-- 5. 扩展虚拟机（280 台，ID 2001..2280：前 252 台关联到已上架宿主机 1001..1126，后 28 台未关联宿主机）
INSERT INTO assets (id, kind, name, platform, status, lifecycle, owner, environment, address, probe_enabled, probe_status, probe_checked_at, cpu, memory_mib, group_id, notes)
SELECT 2000 + i,
       'vm',
       CASE
           WHEN i <= 252 THEN
               'demo-' || (ARRAY['bj', 'sh', 'test', 'sz', 'gz', 'hz', 'cd'])[1 + ((i - 1) / 36)]
               || '-' || (ARRAY['web', 'api', 'db', 'cache', 'mq', 'worker', 'search', 'gw'])[1 + (i % 8)]
               || '-' || lpad((((i - 1) % 36) + 1)::text, 2, '0')
           ELSE 'demo-unassigned-vm-' || lpad((i - 252)::text, 2, '0')
       END,
       CASE WHEN ((i + 1) / 2) % 2 = 0 THEN 'pve' ELSE 'kvm' END,
       CASE
           WHEN i % 10 = 0 THEN 'stopped'
           WHEN i % 17 = 0 THEN 'paused'
           ELSE 'running'
       END,
       'active',
       (ARRAY['示例应用组', '示例数据组', '示例中间件组', '示例研发组'])[1 + (i % 4)],
       (ARRAY['生产', '生产', '预发', '测试'])[1 + (i % 4)],
       CASE
           WHEN i <= 36 AND i % 5 = 1 THEN '10.0.2.' || (ARRAY[1, 2, 3, 4, 6, 7, 8, 10])[1 + ((i - 1) / 5)]::text
           WHEN i <= 36 AND i % 5 = 2 THEN '192.168.108.' || (100 + i)::text
           WHEN i <= 36 AND i % 5 = 0 THEN '192.168.108.' || (160 + i)::text
           WHEN i <= 36 AND i % 5 = 4 THEN '198.51.100.' || (30 + i)::text
           WHEN i <= 252 THEN '10.' || (102 + ((i - 1) / 36) * 4)::text || '.0.' || (20 + ((i - 1) % 36))::text
           WHEN i % 3 = 1 THEN '10.0.2.' || (20 + (i - 252))::text
           WHEN i % 3 = 2 THEN '192.168.108.' || (205 + (i - 252))::text
           ELSE '10.131.0.' || (20 + (i - 252))::text
       END,
       (i % 3 <> 0),
       CASE
           WHEN i % 3 = 0 THEN 'unknown'
           WHEN i % 5 = 0 THEN 'unreachable'
           ELSE 'reachable'
       END,
       CASE WHEN i % 3 = 0 THEN NULL ELSE now() - ((i % 45) || ' minutes')::interval END,
       (ARRAY[2, 4, 8, 16, 32])[1 + (i % 5)],
       (ARRAY[4096, 8192, 16384, 32768, 65536])[1 + (i % 5)],
       1 + (i % 3),
       CASE WHEN i <= 252 THEN '虚构业务虚拟机实例' ELSE '虚构待分配宿主机的独立虚拟机' END
FROM generate_series(1, 280) AS i
WHERE EXISTS (SELECT 1 FROM demo_empty_guard);

-- 建立前 252 台虚拟机与宿主机 1001..1126 的承载关系（每台宿主机承载 2 台 VM）
INSERT INTO asset_links (from_id, to_id, kind)
SELECT 1000 + ((i - 1) / 2) + 1,
       2000 + i,
       'hosts'
FROM generate_series(1, 252) AS i
WHERE EXISTS (SELECT 1 FROM demo_empty_guard);

-- 6. 扩展网络设备（84 台，ID 3001..3084：前 70 台分布在 7 个数据中心机柜 101..170 的 U40，后 14 台为「未上架」）
INSERT INTO assets (id, kind, name, platform, status, lifecycle, owner, environment, address, probe_enabled, probe_status, probe_checked_at, cpu, memory_mib, group_id, notes)
SELECT 3000 + i,
       (ARRAY['switch', 'switch', 'switch', 'switch', 'router', 'router', 'firewall', 'firewall', 'load_balancer', 'load_balancer'])[1 + ((i - 1) % 10)],
       CASE
           WHEN i <= 70 THEN
               'demo-' || (ARRAY['bj', 'sh', 'test', 'sz', 'gz', 'hz', 'cd'])[1 + ((i - 1) / 10)]
               || '-' || (ARRAY['sw', 'sw', 'sw', 'sw', 'rt', 'rt', 'fw', 'fw', 'lb', 'lb'])[1 + ((i - 1) % 10)]
               || '-' || lpad((((i - 1) % 10) + 1)::text, 2, '0')
           ELSE 'demo-spare-net-' || lpad((i - 70)::text, 2, '0')
       END,
       '',
       CASE WHEN i % 12 = 0 THEN 'offline' ELSE 'online' END,
       'active',
       '示例网络组',
       (ARRAY['生产', '生产', '预发', '测试'])[1 + (i % 4)],
       CASE
           WHEN i = 1 THEN '10.0.1.33'
           WHEN i = 2 THEN '192.168.123.223'
           WHEN i = 4 THEN '192.168.123.224'
           WHEN i = 5 THEN '10.0.1.32'
           WHEN i = 7 THEN '10.0.1.31'
           WHEN i = 8 THEN '192.168.123.221'
           WHEN i = 9 THEN '192.0.2.41'
           WHEN i = 10 THEN '192.168.123.222'
           WHEN i <= 70 THEN '10.' || (101 + ((i - 1) / 10) * 4)::text || '.0.' || (200 + ((i - 1) % 10))::text
           ELSE '10.132.0.' || (200 + (i - 70))::text
       END,
       (i % 6 <> 0),
       CASE
           WHEN i % 6 = 0 THEN 'unknown'
           WHEN i % 9 = 0 OR i % 12 = 0 THEN 'unreachable'
           ELSE 'reachable'
       END,
       CASE WHEN i % 6 = 0 THEN NULL ELSE now() - ((i % 20) || ' minutes')::interval END,
       0,
       0,
       NULL,
       CASE WHEN i <= 70 THEN '虚构机柜顶置/核心网络设备' ELSE '虚构待上架库存网络设备' END
FROM generate_series(1, 84) AS i
WHERE EXISTS (SELECT 1 FROM demo_empty_guard);

-- 将前 70 台网络设备（3001..3070）上架到机柜 101..170 的 40U（1U 高度，与服务器 U 位完全不冲突）
INSERT INTO rack_placements (asset_id, rack_id, start_u, units, face, depth)
SELECT 3000 + i,
       100 + i,
       40,
       1,
       'front',
       'full'
FROM generate_series(1, 70) AS i
WHERE EXISTS (SELECT 1 FROM demo_empty_guard);



-- 8. 扩展手工 IP 分配记录（每个新增网段 101..135 分配 3 个 VIP/预留/业务地址，共 105 条）
INSERT INTO ip_allocations (subnet_id, ip, asset_id, label, notes, status, dns_name, role)
SELECT 100 + s,
       '10.' || (100 + s)::text || '.0.' || (240 + k)::text,
       CASE
           WHEN s <= 28 AND k = 1 THEN 2000 + ((s - 1) / 4) * 36 + ((s - 1) % 4) + 1
           WHEN s <= 28 AND k = 2 THEN 3000 + ((s - 1) / 4) * 10 + 9
           ELSE NULL
       END,
       CASE
           WHEN k = 1 THEN '业务集群 VIP'
           WHEN k = 2 THEN '负载均衡浮动地址'
           ELSE '网段预留地址'
       END,
       '虚构 IPAM 分配记录',
       CASE WHEN k = 3 THEN 'reserved' ELSE 'active' END,
       'vip-' || s::text || '-' || k::text || '.demo.internal',
       CASE WHEN k = 1 THEN 'vip' WHEN k = 2 THEN 'vrrp' ELSE '' END
FROM generate_series(1, 35) AS s
CROSS JOIN generate_series(1, 3) AS k
WHERE EXISTS (SELECT 1 FROM demo_empty_guard);

-- 9. 为示例资产添加各自的服务实例。
INSERT INTO asset_service_instances (asset_id, name)
SELECT 2000 + i, (ARRAY['nginx','mysql','postgresql','redis','kafka','prometheus'])[1 + ((i - 1) % 6)]
FROM generate_series(1, 252) AS i WHERE EXISTS (SELECT 1 FROM demo_empty_guard);
INSERT INTO asset_service_instances (asset_id, name)
SELECT 1000 + i, (ARRAY['prometheus','zabbix','etcd','consul'])[1 + ((i - 1) % 4)]
FROM generate_series(1, 126) AS i WHERE i % 2 = 0 AND EXISTS (SELECT 1 FROM demo_empty_guard);
INSERT INTO asset_service_instances (asset_id, name)
SELECT m.asset_id, m.service_name FROM (VALUES
 (3::bigint,'nginx'), (19,'nginx'), (4,'postgresql'), (3,'redis'), (10,'grafana'), (1,'etcd')
) AS m(asset_id, service_name) WHERE EXISTS (SELECT 1 FROM demo_empty_guard);

-- 10. 为所有服务器（153 台）填充虚构品牌、型号、虚拟化平台（PVE/KVM/ESXi）与硬盘配置，为所有虚拟机（287 台）填充平台与硬盘配置，并清空服务器与虚拟机负责人字段。
UPDATE assets
SET brand = CASE (id % 9)
        WHEN 0 THEN 'Dell'
        WHEN 1 THEN 'Dell'
        WHEN 2 THEN 'HPE'
        WHEN 3 THEN 'HPE'
        WHEN 4 THEN '华为'
        WHEN 5 THEN '浪潮'
        WHEN 6 THEN '新华三'
        WHEN 7 THEN '超聚变'
        ELSE 'Lenovo'
    END,
    model = CASE (id % 9)
        WHEN 0 THEN 'PowerEdge R750'
        WHEN 1 THEN 'PowerEdge R650'
        WHEN 2 THEN 'ProLiant DL380 Gen10'
        WHEN 3 THEN 'ProLiant DL360 Gen11'
        WHEN 4 THEN 'FusionServer 2288H V6'
        WHEN 5 THEN 'NF5280M6'
        WHEN 6 THEN 'UniServer R4900 G5'
        WHEN 7 THEN '2288H V6'
        ELSE 'ThinkSystem SR650 V2'
    END,
    platform = CASE (id % 3)
        WHEN 0 THEN 'pve'
        WHEN 1 THEN 'kvm'
        ELSE 'esxi'
    END,
    disks = CASE (id % 6)
        WHEN 0 THEN '[{"type":"nvme","sizeGiB":480,"count":2,"note":"系统盘"},{"type":"hdd","sizeGiB":4096,"count":4,"note":"数据盘"}]'
        WHEN 1 THEN '[{"type":"nvme","sizeGiB":960,"count":2,"note":"系统盘"},{"type":"ssd","sizeGiB":1920,"count":6,"note":"数据盘"}]'
        WHEN 2 THEN '[{"type":"ssd","sizeGiB":480,"count":2,"note":"系统盘"},{"type":"hdd","sizeGiB":8192,"count":8,"note":"存储池"}]'
        WHEN 3 THEN '[{"type":"nvme","sizeGiB":1920,"count":4,"note":"全闪存"}]'
        WHEN 4 THEN '[{"type":"ssd","sizeGiB":960,"count":2,"note":"系统盘"},{"type":"ssd","sizeGiB":3840,"count":4,"note":"数据盘"}]'
        ELSE '[{"type":"nvme","sizeGiB":480,"count":2,"note":"系统盘"},{"type":"nvme","sizeGiB":3840,"count":2,"note":"高速盘"}]'
    END,
    owner = '',
    person_id = NULL
WHERE kind = 'host' AND EXISTS (SELECT 1 FROM demo_empty_guard);

UPDATE assets v
SET platform = COALESCE(
        (SELECT h.platform
         FROM asset_links l
         JOIN assets h ON h.id = l.from_id
         WHERE l.to_id = v.id AND l.kind = 'hosts'
         LIMIT 1),
        CASE (v.id % 3)
            WHEN 0 THEN 'pve'
            WHEN 1 THEN 'kvm'
            ELSE 'esxi'
        END
    ),
    disks = CASE (v.id % 6)
        WHEN 0 THEN '[{"type":"ssd","sizeGiB":100,"count":1,"note":"系统盘"}]'
        WHEN 1 THEN '[{"type":"ssd","sizeGiB":100,"count":1,"note":"系统盘"},{"type":"ssd","sizeGiB":500,"count":1,"note":"数据盘"}]'
        WHEN 2 THEN '[{"type":"nvme","sizeGiB":100,"count":1,"note":"系统盘"},{"type":"nvme","sizeGiB":1024,"count":1,"note":"数据盘"}]'
        WHEN 3 THEN '[{"type":"ssd","sizeGiB":200,"count":1,"note":"系统盘"},{"type":"hdd","sizeGiB":2048,"count":1,"note":"归档盘"}]'
        WHEN 4 THEN '[{"type":"ssd","sizeGiB":80,"count":1,"note":"系统盘"},{"type":"ssd","sizeGiB":200,"count":1,"note":"数据盘"}]'
        ELSE '[{"type":"nvme","sizeGiB":120,"count":1,"note":"系统盘"},{"type":"nvme","sizeGiB":500,"count":1,"note":"数据盘"}]'
    END,
    owner = '',
    person_id = NULL
WHERE v.kind = 'vm' AND EXISTS (SELECT 1 FROM demo_empty_guard);

INSERT INTO people (name)
SELECT min(owner) FROM assets
WHERE kind NOT IN ('host', 'vm') AND length(owner) BETWEEN 1 AND 80 AND EXISTS (SELECT 1 FROM demo_empty_guard)
GROUP BY lower(owner)
ON CONFLICT DO NOTHING;

UPDATE assets a SET person_id=p.id, owner=''
FROM people p
WHERE a.kind NOT IN ('host', 'vm') AND lower(a.owner)=lower(p.name) AND EXISTS (SELECT 1 FROM demo_empty_guard);

INSERT INTO teams (name, description)
SELECT v.name, v.description FROM (VALUES
    ('示例平台运维组', '维护演示计算平台服务器和虚拟机'),
    ('示例基础架构组', '维护演示基础架构与物理服务器'),
    ('示例数据运维组', '维护演示存储与数据库物理服务器'),
    ('示例网络运维组', '维护演示网络设备')
) AS v(name, description)
WHERE EXISTS (SELECT 1 FROM demo_empty_guard);

UPDATE assets a SET team_id=t.id
FROM teams t
WHERE EXISTS (SELECT 1 FROM demo_empty_guard)
  AND t.name = CASE
      WHEN a.kind IN ('host', 'vm') THEN CASE (a.id % 3)
          WHEN 0 THEN '示例平台运维组'
          WHEN 1 THEN '示例基础架构组'
          ELSE '示例数据运维组'
      END
      ELSE '示例网络运维组'
  END;

INSERT INTO team_members (team_id, person_id)
SELECT DISTINCT team_id, person_id FROM assets
WHERE team_id IS NOT NULL AND person_id IS NOT NULL AND EXISTS (SELECT 1 FROM demo_empty_guard)
ON CONFLICT DO NOTHING;

-- 显式写入主键后推进序列，避免后续新增记录主键冲突。
SELECT setval(pg_get_serial_sequence('assets', 'id'), (SELECT max(id) FROM assets));
SELECT setval(pg_get_serial_sequence('regions', 'id'), (SELECT max(id) FROM regions));
SELECT setval(pg_get_serial_sequence('asset_groups', 'id'), (SELECT max(id) FROM asset_groups));
SELECT setval(pg_get_serial_sequence('metadata_entries', 'id'), (SELECT max(id) FROM metadata_entries));
SELECT setval(pg_get_serial_sequence('rooms', 'id'), (SELECT max(id) FROM rooms));
SELECT setval(pg_get_serial_sequence('racks', 'id'), (SELECT max(id) FROM racks));
SELECT setval(pg_get_serial_sequence('vlans', 'id'), (SELECT max(id) FROM vlans));
SELECT setval(pg_get_serial_sequence('subnets', 'id'), (SELECT max(id) FROM subnets));

COMMIT;
