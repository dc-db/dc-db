export type NetworkKind = 'switch' | 'router' | 'firewall' | 'load_balancer'
export type Kind = 'host' | 'vm' | NetworkKind
export type LinkKind = 'hosts'
export type InterfaceMedium = 'copper' | 'fiber' | 'virtual'
export type InterfaceStatus = 'up' | 'down' | 'disabled'

export interface InterfaceFields {
  name: string
  medium: InterfaceMedium
  speedMbps: number
  mac: string
  status: InterfaceStatus
  description: string
}

export interface NetworkInterface extends InterfaceFields {
  id: number
  assetId: number
  version: number
  updatedAt: string
  peerId?: number
  peerAssetId?: number
  peerAssetName?: string
  peerName?: string
}

export interface AssetFields {
  kind: Kind
  name: string
  brand: string
  model: string
  platform: '' | 'pve' | 'kvm' | 'esxi'
  status: string
  lifecycle: 'active' | 'retired'
  owner: string
  environment: string
  address: string
  probeEnabled: boolean
  cpu: number
  memoryMiB: number
  groupId: number
  teamId?: number
  personId?: number
  notes: string
  roomId: number
}

export interface ServiceInstance { name: string }

export interface ServiceRef {
  id: number
  name: string
  kind?: string
}

export interface ServiceEntry {
  id: number
  name: string
  category: string
  builtin: boolean
  description: string
  assets: ServiceRef[]
  assetCount: number
  projects: ServiceRef[]
  projectCount: number
  createdAt: string
  updatedAt: string
}

export interface ServiceInput {
  name: string
  category: string
  builtin: boolean
  description: string
  assetIds?: number[] | null
  projectIds?: number[] | null
}

export interface Asset extends AssetFields {
  services?: ServiceInstance[]
  probeStatus: 'unknown' | 'reachable' | 'unreachable' | 'error'
  probeCheckedAt: string | null
  id: number
  version: number
  createdAt: string | null
  updatedAt: string
}

export interface Link {
  id: number
  kind: LinkKind
  fromId: number
  fromName: string
  toId: number
  toName: string
}

export interface SubnetFields {
  name: string
  cidr: string
  gateway: string
  vlan: string
  notes: string
  status: string
  role: string
  roomId?: number
}

export interface Subnet extends SubnetFields {
  id: number
  version: number
  roomName?: string
  vlanName?: string
  vlanStatus?: string
  usable: number
  used: number
  free: number
}

export interface IPUsage {
  ip: string
  source: 'gateway' | 'asset' | 'allocated'
  state: string
  assetId?: number
  assetName?: string
  allocationId?: number
  label?: string
  dnsName?: string
  role?: string
  notes?: string
  version?: number
}

export interface AllocationFields {
  ip: string
  assetId?: number
  label: string
  notes: string
  status: string
  dnsName: string
  role: string
}

export interface Allocation extends AllocationFields {
  id: number
  subnetId: number
  subnetName?: string
  version: number
  assetName?: string
}

export interface VLANFields {
  vid: number
  name: string
  status: 'active' | 'reserved' | 'deprecated'
  description: string
  roomId?: number
}

export interface VLAN extends VLANFields {
  id: number
  version: number
  roomName?: string
  prefixCount: number
  createdAt: string
  updatedAt: string
}

export interface IPAddress {
  key: string
  ip: string
  source: 'gateway' | 'asset' | 'allocated'
  state: string
  dnsName?: string
  role?: string
  subnetId: number
  subnetName: string
  assetId?: number
  assetName?: string
  allocationId?: number
  label?: string
  notes?: string
  version?: number
}

export interface SubnetDetail extends Subnet {
  usedIps: IPUsage[]
  freeIps: string[]
}

export interface AvailableIPs {
  items: string[]
  total: number
  offset: number
  limit: number
}

export interface Change {
  id: number
  assetId: number
  assetName: string
  actor: string
  action: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  createdAt: string
}

export type SearchResultType = 'asset' | 'room' | 'rack' | 'subnet' | 'vlan' | 'ip'

export interface ImportPreviewRow {
  row: number
  name: string
  kind: string
  brand?: string
  model?: string
  platform: string
  status: string
  lifecycle: string
  address: string
  cpu: number
  memoryMiB: number
  owner: string
  environment: string
  notes: string
}

export interface ImportRowError {
  row: number
  message: string
}

export interface ImportPreview {
  rows: number
  valid: number
  errors: ImportRowError[]
  sample: ImportPreviewRow[]
}

export interface GroupFields {
  name: string
  description: string
}

export interface Group extends GroupFields {
  id: number
  assetCount: number
}

export interface DirectoryEntry {
  id: number
  name: string
  description: string
  assetCount: number
}

export interface Person extends DirectoryEntry {
  username?: string
}

export interface Team extends DirectoryEntry {
  memberIds: number[]
}

export interface MetadataFields {
  kind: string
  name: string
  description: string
  roomId?: number
}

export interface MetadataEntry extends MetadataFields {
  id: number
  roomName?: string
  assetCount?: number
}

export interface SearchResult {
  type: SearchResultType
  id: number
  label: string
  detail: string
  kind?: string
  status?: string
  address?: string
  assetId?: number
  roomId?: number
  rackId?: number
  subnetId?: number
  vlanId?: number
}

export type Role = 'admin' | 'operator' | 'viewer'

export interface User {
  username: string
  role: Role
}

export interface UserFields {
  username: string
  password?: string
  role: Role
}

export interface Captcha {
  id: string
  image: string
}

export class APIError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function errorMessage(res: Response): Promise<string> {
  const data = await res.json().catch(() => null)
  return data?.error ?? '请求失败，请稍后重试'
}

export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch('/api' + path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw new APIError(res.status, await errorMessage(res))
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export async function apiCSV<T>(path: string, file: File): Promise<T> {
  const res = await fetch('/api' + path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'text/csv; charset=utf-8' },
    body: file,
  })
  if (!res.ok) throw new APIError(res.status, await errorMessage(res))
  return res.json() as Promise<T>
}
