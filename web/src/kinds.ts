import type { Kind, NetworkKind } from './api'

export const NETWORK_KINDS: readonly NetworkKind[] = ['switch', 'router', 'firewall', 'load_balancer']

export const ALL_KINDS: readonly Kind[] = ['host', 'vm', ...NETWORK_KINDS]

export const KIND_LABELS: Record<Kind, string> = {
  host: '服务器',
  vm: '虚拟机',
  switch: '交换机',
  router: '路由器',
  firewall: '防火墙',
  load_balancer: '负载均衡',
}

export const KIND_SHORT_LABELS: Record<Kind, string> = {
  host: '服务器',
  vm: '虚拟机',
  switch: '交换机',
  router: '路由',
  firewall: '防火墙',
  load_balancer: 'LB',
}

export function isNetworkKind(kind: string): kind is NetworkKind {
  return kind === 'switch' || kind === 'router' || kind === 'firewall' || kind === 'load_balancer'
}

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind as Kind] ?? kind
}
