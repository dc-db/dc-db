/** Built-in suggestions; custom service names remain local to their asset. */
export const serviceCatalog = [
  { category: 'Web 服务', names: ['nginx', 'caddy', 'apache-httpd'] },
  { category: '数据库', names: ['mysql', 'postgresql', 'mongodb', 'clickhouse'] },
  { category: '缓存', names: ['redis', 'memcached'] },
  { category: '消息队列', names: ['kafka', 'rabbitmq', 'nats'] },
  { category: '搜索', names: ['elasticsearch'] },
  { category: '监控', names: ['prometheus', 'grafana', 'loki', 'zabbix'] },
  { category: '存储', names: ['minio', 'ceph'] },
  { category: '研发工具', names: ['gitlab', 'gitea', 'jenkins', 'harbor', 'registry'] },
  { category: '基础设施', names: ['etcd', 'zookeeper', 'consul', 'vault'] },
] as const

export const SERVICE_CATEGORIES: readonly string[] = [
  ...serviceCatalog.map(group => group.category),
  '业务应用',
  '其他',
]

export const serviceDefaultPorts: Record<string, number> = {
  nginx: 80,
  caddy: 443,
  'apache-httpd': 80,
  mysql: 3306,
  postgresql: 5432,
  mongodb: 27017,
  clickhouse: 8123,
  redis: 6379,
  memcached: 11211,
  kafka: 9092,
  rabbitmq: 5672,
  nats: 4222,
  elasticsearch: 9200,
  prometheus: 9090,
  grafana: 3000,
  loki: 3100,
  zabbix: 10051,
  minio: 9000,
  gitlab: 80,
  gitea: 3000,
  jenkins: 8080,
  harbor: 443,
  registry: 5000,
  etcd: 2379,
  zookeeper: 2181,
  consul: 8500,
  vault: 8200,
}

export function serviceCategory(name: string): string | undefined {
  const normalized = name.trim().toLowerCase()
  return serviceCatalog.find(group => group.names.some(item => item === normalized))?.category
}

export function serviceDefaultPort(name: string): number | undefined {
  const normalized = name.trim().toLowerCase()
  return serviceDefaultPorts[normalized]
}

export function isBuiltinService(name: string): boolean {
  const normalized = name.trim().toLowerCase()
  return serviceCatalog.some(group => group.names.some(item => item === normalized))
}
