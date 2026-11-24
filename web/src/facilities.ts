import type { Asset, Link } from './api'

export interface RegionFields {
  name: string
}

export interface Region extends RegionFields {
  id: number
  version: number
}

export interface RoomFields {
  name: string
  regionId: number
}

export interface Room extends RoomFields {
  id: number
  version: number
}

export interface RackFields {
  name: string
  zone: string
  heightU: number
}

export interface Rack extends RackFields {
  id: number
  roomId: number
  version: number
  createdAt: string | null
  updatedAt: string | null
}

export type RackFace = 'front' | 'rear'
export type PlacementDepth = 'full' | 'half'

export interface Placement {
  rackId: number
  assetId: number
  startU: number
  units: number
  face: RackFace
  depth: PlacementDepth
  version: number
}

export interface Facilities {
  regions: Region[]
  rooms: Room[]
  racks: Rack[]
  placements: Placement[]
}

export interface AssetLocation {
  placement: Placement
  rack: Rack
  room: Room
}

export const mountKinds = {
  host: '服务器',
  switch: '交换机',
  router: '路由器',
  firewall: '防火墙',
  load_balancer: '负载均衡',
} as const

export type MountKind = keyof typeof mountKinds

export function isMountKind(kind: Asset['kind']): kind is MountKind {
  return Object.hasOwn(mountKinds, kind)
}

export function uRange(placement: Pick<Placement, 'startU' | 'units'>) {
  const { startU, units } = placement
  return units === 1 ? 'U' + startU : 'U' + startU + '–U' + (startU + units - 1)
}

type PlacementShape = Pick<Placement, 'assetId' | 'startU' | 'units' | 'face' | 'depth'>

export function placementsConflict(left: PlacementShape, right: PlacementShape) {
  if (left.assetId === right.assetId) return false
  if (left.startU > right.startU + right.units - 1 || right.startU > left.startU + left.units - 1) return false
  if (left.depth === 'full' || right.depth === 'full') return true
  return left.face === right.face
}

export function placementFaceLabel(placement: Pick<Placement, 'face' | 'depth'>) {
  if (placement.depth === 'full') return '全深'
  return placement.face === 'front' ? '前半深' : '后半深'
}

export function occupiedUnits(placements: Placement[]) {
  const units = new Set<number>()
  for (const placement of placements) {
    for (let unit = placement.startU; unit < placement.startU + placement.units; unit++) units.add(unit)
  }
  return units
}

export function assetLocations(layout: Facilities, links: Link[]) {
  const result = new Map<number, AssetLocation>()
  const racks = new Map(layout.racks.map(rack => [rack.id, rack]))
  const rooms = new Map(layout.rooms.map(room => [room.id, room]))
  for (const placement of layout.placements) {
    const rack = racks.get(placement.rackId)
    const room = rack && rooms.get(rack.roomId)
    if (rack && room) result.set(placement.assetId, { placement, rack, room })
  }

  // VMs follow the location of the host that carries them.
  for (const link of links) {
    const parent = result.get(link.fromId)
    if (link.kind === 'hosts' && parent && !result.has(link.toId)) result.set(link.toId, parent)
  }
  return result
}

export function locationLabel(location: AssetLocation) {
  return [location.room.name, location.rack.name, uRange(location.placement)].join(' / ')
}

export function assetRoomId(
  asset: Asset,
  locations: Map<number, AssetLocation>,
  byId?: Map<number, Asset>,
  links?: Link[],
): number | null {
  const loc = locations.get(asset.id)
  if (loc) return loc.room.id
  const attrRoomId = Number(asset.roomId)
  if (Number.isInteger(attrRoomId) && attrRoomId > 0) return attrRoomId
  if (asset.kind === 'vm' && byId && links) {
    const hostLink = links.find(link => link.kind === 'hosts' && link.toId === asset.id)
    if (hostLink) {
      const host = byId.get(hostLink.fromId)
      const hostAttrRoomId = Number(host?.roomId)
      if (Number.isInteger(hostAttrRoomId) && hostAttrRoomId > 0) return hostAttrRoomId
    }
  }
  return null
}

export function matchesRoomFilter(roomId: number | null | undefined, filter: 'all' | 'unassigned' | number) {
  if (filter === 'all') return true
  if (filter === 'unassigned') return !roomId
  return roomId === filter
}

export function buildRoomCounts<T>(items: T[], getRoomId: (item: T) => number | null | undefined) {
  const byRoom = new Map<number, number>()
  let unassigned = 0
  for (const item of items) {
    const rid = getRoomId(item)
    if (rid) {
      byRoom.set(rid, (byRoom.get(rid) ?? 0) + 1)
    } else {
      unassigned++
    }
  }
  return { all: items.length, unassigned, byRoom }
}
