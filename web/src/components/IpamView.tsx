import { OptionSelect } from './OptionSelect'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Download, Plus, Star, Upload } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { PageHeader } from './PageHeader'
import { RowActionsMenu } from './RowActionsMenu'
import { ColumnHeaderMenu, DataTableViewOptions, type SortDirection, type ViewColumnOption } from './TableColumnControls'
import { BulkActionBar, RowIndexSelectCell, RowIndexSelectHeader } from './TableSelectionControls'
import { Input } from './ui/input'
import { UsageBar } from './UsageBar'
import { Textarea } from './ui/textarea'
import { SearchableSelect } from './SearchableSelect'
import { Select } from './AppControls'
import { api, apiCSV, APIError } from '../api'
import { downloadCSV } from '../csv'
import type { Subnet, SubnetFields, VLAN } from '../api'
import { buildRoomCounts, matchesRoomFilter } from '../facilities'
import type { Facilities } from '../facilities'
import { RoomTreeLayout, type RoomFilter } from './RoomTreeLayout'

interface Props {
  editable: boolean
  hideTitle?: boolean
  facilities: Facilities
  roomFilter: RoomFilter
  onRoomFilterChange: (next: RoomFilter) => void
  openSubnetId: number | null
  onSubnetOpened: () => void
  onSelectSubnet?: (subnetId: number) => void
  bookmarkedSubnets: number[]
  onToggleSubnetBookmark: (id: number) => void
  onSessionError: (error: unknown) => void
  onChanged: () => void
}

type SubnetDraft = SubnetFields & { id?: number; version?: number }

const subnetStatusMeta: Record<string, { label: string; color: string }> = {
  container: { label: '聚合', color: 'default' },
  active: { label: '启用', color: 'green' },
  reserved: { label: '预留', color: 'orange' },
  deprecated: { label: '停用', color: 'default' },
}
const roleLabels: Record<string, string> = {
  loopback: '环回', secondary: '辅助', vip: 'VIP', vrrp: 'VRRP',
  hsrp: 'HSRP', glbp: 'GLBP', anycast: 'Anycast',
}
function count(value: number) {
  return value.toLocaleString('zh-CN')
}

interface SubnetNode {
  subnet: Subnet
  children: SubnetNode[]
  depth: number
}

interface SubnetRow {
  subnet: Subnet
  depth: number
  children: number
}

function ipv4Number(address: string): number | null {
  const parts = address.trim().split('.')
  if (parts.length !== 4) return null
  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const octet = Number(part)
    if (octet > 255) return null
    value = value * 256 + octet
  }
  return value
}

function subnetRange(cidr: string): { start: number; end: number; prefix: number } | null {
  const [address, prefixText] = cidr.trim().split('/')
  if (!address || !prefixText) return null
  const prefix = Number(prefixText)
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null
  const ip = ipv4Number(address)
  if (ip === null) return null
  const size = 2 ** (32 - prefix)
  const start = Math.floor(ip / size) * size
  return { start, end: start + size - 1, prefix }
}

function buildSubnetTree(subnets: Subnet[]): SubnetNode[] {
  const entries = subnets.map(subnet => ({ subnet, range: subnetRange(subnet.cidr) }))
  entries.sort((left, right) => {
    if (left.range && right.range) {
      return left.range.prefix - right.range.prefix || left.range.start - right.range.start || left.subnet.name.localeCompare(right.subnet.name, 'zh-CN')
    }
    if (left.range) return -1
    if (right.range) return 1
    return left.subnet.name.localeCompare(right.subnet.name, 'zh-CN')
  })

  const nodes = new Map<number, SubnetNode>()
  for (const entry of entries) nodes.set(entry.subnet.id, { subnet: entry.subnet, children: [], depth: 0 })
  const roots: SubnetNode[] = []

  for (const entry of entries) {
    const node = nodes.get(entry.subnet.id)!
    let parent: SubnetNode | undefined
    if (entry.range) {
      for (const candidateEntry of entries) {
        if (candidateEntry.subnet.id === entry.subnet.id || !candidateEntry.range) continue
        if (candidateEntry.range.prefix >= entry.range.prefix) continue
        if (candidateEntry.range.start > entry.range.start || candidateEntry.range.end < entry.range.end) continue
        const candidate = nodes.get(candidateEntry.subnet.id)!
        if (!parent || candidateEntry.range.prefix > (subnetRange(parent.subnet.cidr)?.prefix ?? -1)) parent = candidate
      }
    }
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  function fillDepth(node: SubnetNode, depth: number) {
    node.depth = depth
    for (const child of node.children) fillDepth(child, depth + 1)
  }
  for (const root of roots) fillDepth(root, 0)
  return roots
}

function flattenSubnetTree(nodes: SubnetNode[], collapsed: Set<number>): SubnetRow[] {
  const rows: SubnetRow[] = []
  function visit(node: SubnetNode) {
    rows.push({ subnet: node.subnet, depth: node.depth, children: node.children.length })
    if (!collapsed.has(node.subnet.id)) for (const child of node.children) visit(child)
  }
  for (const node of nodes) visit(node)
  return rows
}

type SubnetColumnKey = 'name' | 'cidr' | 'vlan' | 'gateway' | 'usable' | 'used' | 'free' | 'utilization'
type SubnetSortKey = SubnetColumnKey

const SUBNET_COLUMNS: { key: SubnetColumnKey; label: string }[] = [
  { key: 'name', label: '网段名称' },
  { key: 'cidr', label: 'CIDR' },
  { key: 'vlan', label: 'VLAN' },
  { key: 'gateway', label: '网关' },
  { key: 'usable', label: '地址数' },
  { key: 'used', label: '已用' },
  { key: 'free', label: '空闲' },
  { key: 'utilization', label: '利用率' },
]
const ALL_SUBNET_COLUMN_KEYS: SubnetColumnKey[] = SUBNET_COLUMNS.map(col => col.key)

function compareOptionalIPv4(left: string, right: string, dir: 1 | -1): number {
  const l = left.trim()
  const r = right.trim()
  if (!l && !r) return 0
  if (!l) return 1
  if (!r) return -1
  const ln = ipv4Number(l)
  const rn = ipv4Number(r)
  if (ln !== null && rn !== null) return (ln - rn) * dir
  if (ln !== null) return -1 * dir
  if (rn !== null) return 1 * dir
  return l.localeCompare(r, undefined, { numeric: true }) * dir
}

function compareSubnets(left: Subnet, right: Subnet, key: SubnetSortKey, direction: 'asc' | 'desc'): number {
  const dir: 1 | -1 = direction === 'asc' ? 1 : -1
  let result = 0
  switch (key) {
    case 'name':
      result = left.name.localeCompare(right.name, 'zh-CN', { numeric: true }) * dir
      break
    case 'cidr': {
      const lr = subnetRange(left.cidr)
      const rr = subnetRange(right.cidr)
      if (lr && rr) {
        result = (lr.start - rr.start || lr.prefix - rr.prefix) * dir
      } else if (lr || rr) {
        result = (lr ? -1 : 1) * dir
      } else {
        result = left.cidr.localeCompare(right.cidr, undefined, { numeric: true }) * dir
      }
      break
    }
    case 'vlan': {
      const lv = left.vlan.trim()
      const rv = right.vlan.trim()
      if (!lv && !rv) return 0
      if (!lv) return 1
      if (!rv) return -1
      const ln = Number(lv)
      const rn = Number(rv)
      if (Number.isFinite(ln) && Number.isFinite(rn)) {
        result = (ln - rn) * dir
      } else {
        result = lv.localeCompare(rv, 'zh-CN', { numeric: true }) * dir
      }
      if (result === 0) {
        result = (left.vlanName ?? '').localeCompare(right.vlanName ?? '', 'zh-CN', { numeric: true }) * dir
      }
      break
    }
    case 'gateway':
      result = compareOptionalIPv4(left.gateway, right.gateway, dir)
      break
    case 'usable':
      result = (left.usable - right.usable) * dir
      break
    case 'used':
      result = (left.used - right.used) * dir
      break
    case 'free':
      result = (left.free - right.free) * dir
      break
    case 'utilization': {
      const leftRatio = left.usable > 0 ? left.used / left.usable : 0
      const rightRatio = right.usable > 0 ? right.used / right.usable : 0
      result = (leftRatio - rightRatio || left.used - right.used) * dir
      break
    }
  }
  return result || left.id - right.id
}

export function IpamView({ editable, hideTitle, facilities, roomFilter, onRoomFilterChange, openSubnetId, onSubnetOpened, onSelectSubnet, bookmarkedSubnets, onToggleSubnetBookmark, onSessionError, onChanged }: Props) {
  const [subnets, setSubnets] = useState<Subnet[]>([])
  const [vlans, setVLANs] = useState<VLAN[]>([])
  const [draft, setDraft] = useState<SubnetDraft | null>(null)
  const [draftError, setDraftError] = useState('')
  const draftTriggerRef = useRef<HTMLButtonElement>(null)
  const [deleting, setDeleting] = useState<Subnet | null>(null)
  const [selectedSubnetIds, setSelectedSubnetIds] = useState<number[]>([])
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [subnetSearch, setSubnetSearch] = useState('')
  const [subnetStatus, setSubnetStatus] = useState<string | undefined>()
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [sort, setSort] = useState<{ key: SubnetSortKey; direction: 'asc' | 'desc' } | null>(null)
  const [visibleColumns, setVisibleColumns] = useState<SubnetColumnKey[]>(ALL_SUBNET_COLUMN_KEYS)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importBusy, setImportBusy] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState('')

  const visibleColumnSet = useMemo(() => new Set(visibleColumns), [visibleColumns])
  const activeColumns = useMemo(
    () => SUBNET_COLUMNS.filter(col => visibleColumnSet.has(col.key)),
    [visibleColumnSet],
  )
  const viewColumns = useMemo<ViewColumnOption[]>(
    () => SUBNET_COLUMNS.map(col => ({
      id: col.key,
      label: col.label,
      visible: visibleColumnSet.has(col.key),
    })),
    [visibleColumnSet],
  )

  function toggleColumnVisibility(columnId: string, nextVisible: boolean) {
    const key = columnId as SubnetColumnKey
    setVisibleColumns(current => {
      if (nextVisible) {
        if (current.includes(key)) return current
        return ALL_SUBNET_COLUMN_KEYS.filter(id => id === key || current.includes(id))
      }
      if (current.length <= 1) return current
      return current.filter(id => id !== key)
    })
  }

  const roomCounts = useMemo(() => buildRoomCounts(subnets, subnet => subnet.roomId || null), [subnets])
  const scopedSubnets = useMemo(
    () => subnets.filter(subnet => matchesRoomFilter(subnet.roomId || null, roomFilter)),
    [roomFilter, subnets],
  )
  const subnetTree = useMemo(() => buildSubnetTree(scopedSubnets), [scopedSubnets])
  const subnetRows = useMemo(() => flattenSubnetTree(subnetTree, collapsed), [subnetTree, collapsed])
  const visibleSubnetRows = useMemo(() => {
    const query = subnetSearch.trim().toLowerCase()
    const matchesFilters = (subnet: Subnet) =>
      (!subnetStatus || subnet.status === subnetStatus)
      && (!query || [subnet.name, subnet.cidr, subnet.gateway, subnet.vlan,
        subnet.vlanName, subnet.role].some(value => value?.toLowerCase().includes(query)))

    if (sort) {
      return scopedSubnets
        .filter(matchesFilters)
        .slice()
        .sort((left, right) => compareSubnets(left, right, sort.key, sort.direction))
        .map(subnet => ({ subnet, depth: 0, children: 0 }))
    }

    return subnetRows
      .filter(row => matchesFilters(row.subnet))
      .map(row => query || subnetStatus ? ({ ...row, depth: 0, children: 0 }) : row)
  }, [scopedSubnets, sort, subnetRows, subnetSearch, subnetStatus])
  const selectedSubnetIdSet = useMemo(() => new Set(selectedSubnetIds), [selectedSubnetIds])
  const selectedSubnets = useMemo(
    () => subnets.filter(subnet => selectedSubnetIdSet.has(subnet.id)),
    [selectedSubnetIdSet, subnets],
  )
  const visibleSubnetIds = useMemo(
    () => visibleSubnetRows.map(row => row.subnet.id),
    [visibleSubnetRows],
  )
  const allVisibleSelected = visibleSubnetIds.length > 0 && visibleSubnetIds.every(id => selectedSubnetIdSet.has(id))
  const someVisibleSelected = visibleSubnetIds.some(id => selectedSubnetIdSet.has(id))
  const headerChecked: boolean | 'indeterminate' = allVisibleSelected ? true : someVisibleSelected ? 'indeterminate' : false

  useEffect(() => {
    const validIds = new Set(subnets.map(subnet => subnet.id))
    setSelectedSubnetIds(prev => {
      const next = prev.filter(id => validIds.has(id))
      return next.length === prev.length ? prev : next
    })
  }, [subnets])
  const vlanOptions = useMemo(() => {
    const options = vlans.map(vlan => ({
      value: String(vlan.vid),
      label: `VLAN ${vlan.vid} · ${vlan.name}${vlan.status !== 'active' ? `（${subnetStatusMeta[vlan.status]?.label ?? vlan.status}）` : ''}`,
    }))
    if (draft?.vlan && !vlans.some(vlan => String(vlan.vid) === draft.vlan)) {
      options.push({ value: draft.vlan, label: `VLAN ${draft.vlan}（未登记）` })
    }
    return options
  }, [draft?.vlan, vlans])

  useEffect(() => { void load() }, [])

  useEffect(() => {
    if (openSubnetId == null) return
    void load().then(() => onSubnetOpened())
  }, [openSubnetId])

  function report(e: unknown) {
    if (e instanceof APIError && e.status === 401) {
      onSessionError(e)
      return
    }
    setError(e instanceof Error ? e.message : '操作失败')
  }


  async function load() {
    setLoading(true)
    setError('')
    try {
      const [nextSubnets, nextVLANs] = await Promise.all([
        api<Subnet[]>('/subnets'), api<VLAN[]>('/vlans'),
      ])
      setSubnets(nextSubnets)
      setVLANs(nextVLANs)
    } catch (e) {
      report(e)
    } finally {
      setLoading(false)
    }
  }

  function toggleSubnet(id: number) {
    setCollapsed(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function addSubnet(trigger: HTMLButtonElement) {
    draftTriggerRef.current = trigger
    setDraftError('')
    setDraft({
      name: '', cidr: '', gateway: '', vlan: '', notes: '', status: 'active', role: '',
      roomId: typeof roomFilter === 'number' ? roomFilter : undefined,
    })
    setFeedback('')
  }

  function editSubnet(subnet: Subnet, trigger?: HTMLButtonElement | null) {
    draftTriggerRef.current = trigger ?? null
    setDraftError('')
    setDraft({
      id: subnet.id, version: subnet.version, name: subnet.name, cidr: subnet.cidr,
      gateway: subnet.gateway, vlan: subnet.vlan, notes: subnet.notes,
      status: subnet.status, role: subnet.role, roomId: subnet.roomId || undefined,
    })
  }

  async function saveSubnet() {
    if (!draft || busy) return
    const wasEdit = !!draft.id
    setBusy(true)
    setDraftError('')
    try {
      const body = {
        name: draft.name, cidr: draft.cidr, gateway: draft.gateway, vlan: draft.vlan,
        notes: draft.notes, status: draft.status, role: draft.role, roomId: draft.roomId ?? 0,
        version: draft.version ?? 0,
      }
      if (draft.id) await api<Subnet>(`/subnets/${draft.id}`, 'PUT', body)
      else await api<Subnet>('/subnets', 'POST', body)
      setDraft(null)
      await load()
      setFeedback(wasEdit ? '网段已更新' : '网段已创建')
      onChanged()
    } catch (e) {
      if (e instanceof APIError && e.status === 401) onSessionError(e)
      else setDraftError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  async function deleteSubnet(subnet: Subnet) {
    setBusy(true)
    setError('')
    try {
      await api(`/subnets/${subnet.id}?version=${subnet.version}`, 'DELETE')
      setDeleting(null)
      await load()
      setFeedback('网段已删除')
      onChanged()
    } catch (e) {
      setDeleting(null)
      report(e)
    } finally {
      setBusy(false)
    }
  }

  async function bulkDeleteSubnets() {
    if (bulkDeleting || !selectedSubnets.length) return
    const targets = [...selectedSubnets]
    setBulkDeleting(true)
    setError('')
    setFeedback('')
    const succeededIds: number[] = []
    const failed: { subnet: Subnet; message: string }[] = []
    try {
      for (const subnet of targets) {
        try {
          await api(`/subnets/${subnet.id}?version=${subnet.version}`, 'DELETE')
          succeededIds.push(subnet.id)
        } catch (e) {
          if (e instanceof APIError && e.status === 401) {
            setBulkDeleteOpen(false)
            onSessionError(e)
            return
          }
          failed.push({ subnet, message: e instanceof Error ? e.message : '删除失败' })
        }
      }
      setBulkDeleteOpen(false)
      if (succeededIds.length > 0) {
        const succeededSet = new Set(succeededIds)
        setSelectedSubnetIds(prev => prev.filter(id => !succeededSet.has(id)))
        await load()
        onChanged()
      }
      if (succeededIds.length > 0 && failed.length === 0) {
        setFeedback(`已删除 ${succeededIds.length} 个网段`)
      } else if (succeededIds.length > 0) {
        setFeedback(`已删除 ${succeededIds.length} 个网段`)
        const detail = failed.slice(0, 3).map(item => `${item.subnet.name}（${item.subnet.cidr}）：${item.message}`).join('；')
        setError(`${failed.length} 个网段删除失败：${detail}${failed.length > 3 ? ` 等 ${failed.length} 项` : ''}`)
      } else if (failed.length > 0) {
        const detail = failed.slice(0, 3).map(item => `${item.subnet.name}（${item.subnet.cidr}）：${item.message}`).join('；')
        setError(`删除失败：${detail}${failed.length > 3 ? ` 等 ${failed.length} 项` : ''}`)
      }
    } finally {
      setBulkDeleting(false)
    }
  }


  function downloadSubnetTemplate() {
    downloadCSV('dc-db-subnet-template.csv', [
      ['网段名称', 'CIDR', '网关', 'VLAN', '状态', '用途', '备注'],
      ['办公网', '192.0.2.0/24', '192.0.2.1', '100', '启用', '办公', '示例行，可删除'],
    ])
  }

  async function importSubnets() {
    if (!importFile) { setImportError('请选择 CSV 文件'); return }
    setImportBusy(true)
    setImportError('')
    try {
      const result = await apiCSV<{ imported: number }>('/subnets/import', importFile)
      setImportOpen(false)
      setImportFile(null)
      await load()
      setFeedback(`已导入 ${result.imported} 个网段`)
      onChanged()
    } catch (e) {
      if (e instanceof APIError && e.status === 401) { onSessionError(e); return }
      setImportError(e instanceof Error ? e.message : '导入失败')
    } finally {
      setImportBusy(false)
    }
  }

  const labelClass = 'space-y-2 text-sm font-medium'
  function formatSubnetsCSVRows(items: Subnet[]) {
    return [
      ['网段名称', 'CIDR', '网关', 'VLAN', '状态', '用途', '可用地址', '已用', '空闲', '备注'],
      ...items.map(subnet => [
        subnet.name, subnet.cidr, subnet.gateway, subnet.vlan,
        subnetStatusMeta[subnet.status]?.label ?? subnet.status,
        roleLabels[subnet.role ?? ''] ?? (subnet.role || ''), subnet.usable, subnet.used, subnet.free, subnet.notes,
      ]),
    ]
  }
  function exportSubnets() {
    downloadCSV('dc-db-subnets.csv', formatSubnetsCSVRows(subnetRows.map(row => row.subnet)))
  }
  function exportSelectedSubnetsCSV() {
    if (!selectedSubnets.length) return
    downloadCSV('dc-db-subnets-selected.csv', formatSubnetsCSVRows(selectedSubnets))
  }

  return (
    <RoomTreeLayout
      facilities={facilities}
      value={roomFilter}
      onChange={onRoomFilterChange}
      editable={editable}
      counts={roomCounts}
      onSessionError={onSessionError}
    >
    <PageHeader
      title={hideTitle ? undefined : '网段'}
      filters={<>
        <Input className="h-8 w-[240px]" placeholder="搜索名称、CIDR、VLAN、用途" value={subnetSearch} onChange={event => setSubnetSearch(event.target.value)} />
        <Select
          size="small" style={{ width: 140 }} allowClear searchable={false} placeholder="全部状态" value={subnetStatus}
          onChange={(value: string | undefined) => setSubnetStatus(value ?? undefined)}
          options={Object.entries(subnetStatusMeta).map(([value, meta]) => ({ value, label: meta.label }))}
        />
      </>}
      actions={<>
        <DataTableViewOptions columns={viewColumns} onToggle={toggleColumnVisibility} />
        {editable && <Button size="sm" variant="outline" onClick={() => { setImportFile(null); setImportError(''); setImportOpen(true) }}><Download />导入</Button>}
        <Button size="sm" variant="outline" disabled={!subnetRows.length} onClick={exportSubnets}><Upload />导出</Button>
        {editable && <Button size="sm" onClick={event => addSubnet(event.currentTarget)}><Plus />新增网段</Button>}
      </>}
    />
    {error && <div role="alert" className="mb-4 flex justify-between rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}<button aria-label="关闭" onClick={() => setError('')}>×</button></div>}
    {feedback && <div role="status" className="mb-4 flex justify-between rounded-md border border-success-border bg-success-soft p-3 text-sm text-success">{feedback}<button aria-label="关闭" onClick={() => setFeedback('')}>×</button></div>}
    {!subnets.length ? <div className="py-12 text-center text-muted-foreground">{loading ? '正在加载 IPAM 数据…' : '暂无网段，新增一个网段开始管理 IP 地址'}</div> : <>

      <div className="shared-table-wrap">
        <table className="shared-table ipam-subnet-table">
          <thead>
            <tr>
              <th className="col-select">
                <RowIndexSelectHeader
                  checked={headerChecked}
                  disabled={visibleSubnetIds.length === 0}
                  ariaLabel="全选当前网段"
                  onCheckedChange={checked => {
                    setSelectedSubnetIds(prev => checked
                      ? Array.from(new Set([...prev, ...visibleSubnetIds]))
                      : prev.filter(id => !visibleSubnetIds.includes(id)))
                  }}
                />
              </th>
              {activeColumns.map(col => {
                const sortDir: SortDirection = sort?.key === col.key ? sort.direction : false
                return (
                  <th
                    key={col.key}
                    aria-sort={sortDir === 'asc' ? 'ascending' : sortDir === 'desc' ? 'descending' : 'none'}
                  >
                    <ColumnHeaderMenu
                      title={col.label}
                      sortable
                      sortDirection={sortDir}
                      onSortChange={next => setSort(next === false ? null : { key: col.key, direction: next })}
                      hideable={visibleColumns.length > 1}
                      onHide={() => toggleColumnVisibility(col.key, false)}
                    />
                  </th>
                )
              })}
              <th className="w-10"><span className="sr-only">操作</span></th>
            </tr>
          </thead>
          <tbody>
            {visibleSubnetRows.length ? visibleSubnetRows.map(({ subnet: item, depth, children }, index) => {
              const total = item.usable
              const usedPct = total > 0 ? Math.min(100, Math.round(item.used / total * 100)) : 0
              const bookmarked = bookmarkedSubnets.includes(item.id)
              const isSelected = selectedSubnetIdSet.has(item.id)
              return (
                <tr
                  key={item.id}
                  className="group/row"
                  data-state={isSelected ? 'selected' : undefined}
                  onClick={onSelectSubnet ? event => {
                    if ((event.target as HTMLElement).closest('button, a, [role="checkbox"], [role="menuitem"], [data-slot="dropdown-menu-content"]')) return
                    onSelectSubnet(item.id)
                  } : undefined}
                >
                  <td className="col-select" onClick={event => event.stopPropagation()}>
                    <RowIndexSelectCell
                      rowNumber={index + 1}
                      selected={isSelected}
                      ariaLabel={`选择网段 ${item.cidr}`}
                      onToggle={checked => {
                        setSelectedSubnetIds(prev => checked
                          ? (prev.includes(item.id) ? prev : [...prev, item.id])
                          : prev.filter(id => id !== item.id))
                      }}
                    />
                  </td>
                  {activeColumns.map(col => {
                    switch (col.key) {
                      case 'name':
                        return (
                          <td key="name" style={{ paddingLeft: 12 + depth * 16 }}>
                            <span className="ipam-subnet-name">
                              {children > 0
                                ? <Button type="button" variant="ghost" size="icon" className="size-6 shrink-0" aria-label={`${collapsed.has(item.id) ? '展开' : '收起'} ${item.name} 的子网`} aria-expanded={!collapsed.has(item.id)} onClick={event => { event.stopPropagation(); toggleSubnet(item.id) }}>{collapsed.has(item.id) ? <ChevronRight /> : <ChevronDown />}</Button>
                                : <span className="w-6 shrink-0" />}
                              <span className="font-medium">{item.name}</span>
                              {bookmarked && <Star className="size-3.5 shrink-0 fill-current text-warning" aria-label="已收藏" />}
                              {children > 0 && <Badge variant="secondary">{children}</Badge>}
                            </span>
                          </td>
                        )
                      case 'cidr':
                        return <td key="cidr"><span className="font-mono text-xs tabular-nums">{item.cidr}</span></td>
                      case 'vlan':
                        return <td key="vlan">{item.vlan ? (item.vlanName ? `${item.vlan} ${item.vlanName}` : item.vlan) : <span className="text-muted-foreground">—</span>}</td>
                      case 'gateway':
                        return <td key="gateway">{item.gateway ? <span className="font-mono text-xs tabular-nums">{item.gateway}</span> : <span className="text-muted-foreground">—</span>}</td>
                      case 'usable':
                        return <td key="usable" className="tabular-nums">{count(item.usable)}</td>
                      case 'used':
                        return <td key="used" className="tabular-nums">{count(item.used)}</td>
                      case 'free':
                        return <td key="free" className="tabular-nums">{count(item.free)}</td>
                      case 'utilization':
                        return <td key="utilization"><UsageBar value={usedPct} label={`${item.name} 地址使用率`} /></td>
                    }
                  })}
                  <td className="w-10" onClick={event => event.stopPropagation()}>
                    <div className="flex justify-end">
                      <RowActionsMenu
                        ariaLabel={`网段 ${item.name} 更多操作`}
                        onEdit={editable ? () => editSubnet(item) : undefined}
                        extraItems={[
                          {
                            key: 'bookmark',
                            label: bookmarked ? '取消收藏' : '收藏',
                            onSelect: () => onToggleSubnetBookmark(item.id),
                          },
                        ]}
                        onDelete={editable ? () => setDeleting(item) : undefined}
                      />
                    </div>
                  </td>
                </tr>
              )
            }) : <tr><td colSpan={visibleColumns.length + 2} className="facility-table-empty">没有匹配的网段</td></tr>}
          </tbody>
        </table>
      </div>
    </>}
    <Dialog open={draft !== null} onOpenChange={open => { if (!open && !busy) setDraft(null) }}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[600px]"
        aria-describedby={undefined}
        showCloseButton={!busy}
        onCloseAutoFocus={event => {
          if (draftTriggerRef.current?.isConnected) {
            event.preventDefault()
            draftTriggerRef.current.focus()
          }
        }}
      >
        <DialogHeader><DialogTitle>{draft?.id ? '编辑网段' : '新增网段'}</DialogTitle></DialogHeader>
        {draftError && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{draftError}</div>}
        {draft && (
          <form className="space-y-4" onSubmit={event => { event.preventDefault(); void saveSubnet() }}>
            <div className="grid grid-cols-2 gap-3">
              <label className={labelClass}>网段名称<Input required value={draft.name} maxLength={160} placeholder="例如：办公网" onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
              <label className={labelClass}>CIDR<Input required value={draft.cidr} maxLength={64} placeholder="例如：192.0.2.0/24" onChange={event => setDraft({ ...draft, cidr: event.target.value })} /></label>
              <label className={labelClass}>状态<OptionSelect className="w-full" label="状态" value={draft.status} onChange={value => setDraft({ ...draft, status: value })} options={Object.entries(subnetStatusMeta).map(([value, meta]) => ({ value, label: meta.label }))} /></label>
              <label className={labelClass}>用途 / 角色<Input value={draft.role} maxLength={80} placeholder="例如：办公、服务器、互联" onChange={event => setDraft({ ...draft, role: event.target.value })} /></label>
              <div className={labelClass}><span>VLAN</span><SearchableSelect label="VLAN" placeholder="可选" value={draft.vlan} onChange={value => setDraft({ ...draft, vlan: value })} options={vlanOptions} />{!vlans.length && <span className="text-xs font-normal text-muted-foreground">请先在「VLAN」页面登记 VLAN</span>}</div>
              <label className={labelClass}>网关<Input value={draft.gateway} maxLength={64} placeholder="例如：192.0.2.1" onChange={event => setDraft({ ...draft, gateway: event.target.value })} /></label>
              <label className={`${labelClass} col-span-2`}>所属数据中心<OptionSelect className="w-full" label="所属数据中心" value={String(draft.roomId ?? '')} onChange={value => setDraft({ ...draft, roomId: value ? Number(value) : undefined })} options={[{ value: '', label: '未分配' }, ...facilities.rooms.map(room => ({ value: String(room.id), label: room.name }))]} /></label>
              <label className={`${labelClass} col-span-2`}>备注<Textarea rows={2} maxLength={2000} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} /></label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={() => setDraft(null)}>取消</Button>
              <Button type="submit" disabled={busy}>{busy ? '保存中…' : '保存网段'}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  <Dialog open={importOpen} onOpenChange={next => { if (!importBusy) setImportOpen(next) }}><DialogContent>
      <DialogHeader><DialogTitle>导入网段</DialogTitle><DialogDescription>CSV 表头：网段名称、CIDR、网关、VLAN、状态、用途、备注。</DialogDescription></DialogHeader>
      {importError && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{importError}</div>}
      <div className="space-y-3">
        <div className="import-picker">
          <input
            ref={importRef} type="file" accept=".csv,text/csv" hidden aria-label="选择 CSV 文件"
            onChange={event => { setImportFile(event.target.files?.[0] ?? null); setImportError('') }}
          />
          <Button variant="outline" onClick={() => importRef.current?.click()}>{importFile ? '重新选择' : '选择 CSV 文件'}</Button>
          {importFile && <span className="import-picker-name" title={importFile.name}>{importFile.name}</span>}
        </div>
        <p className="text-sm text-muted-foreground">单次最多 500 行，UTF-8 编码</p>
        <Button type="button" variant="link" className="h-auto p-0" onClick={downloadSubnetTemplate}><Download />下载 CSV 模板</Button>
      </div>
      <DialogFooter><Button variant="outline" disabled={importBusy} onClick={() => setImportOpen(false)}>取消</Button><Button disabled={importBusy || !importFile} onClick={() => void importSubnets()}>{importBusy ? '正在导入…' : '导入'}</Button></DialogFooter>
    </DialogContent></Dialog>
    <AlertDialog open={!!deleting} onOpenChange={open => { if (!open && !busy) setDeleting(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确定删除该网段？</AlertDialogTitle>
          <AlertDialogDescription>
            确认删除网段 {deleting?.name}{deleting?.cidr ? `（${deleting.cidr}）` : ''}？此操作无法撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={event => {
              event.preventDefault()
              if (deleting) void deleteSubnet(deleting)
            }}
          >
            {busy ? '删除中…' : '删除'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <BulkActionBar
      count={selectedSubnets.length}
      unit="个网段"
      onClear={() => setSelectedSubnetIds([])}
      onExport={exportSelectedSubnetsCSV}
      onDelete={editable ? () => setBulkDeleteOpen(true) : undefined}
      deleting={bulkDeleting}
    />
    <AlertDialog open={bulkDeleteOpen} onOpenChange={open => { if (!open && !bulkDeleting) setBulkDeleteOpen(false) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确定删除所选 {selectedSubnets.length} 个网段？</AlertDialogTitle>
          <AlertDialogDescription>
            确认删除所选的 {selectedSubnets.length} 个网段？此操作无法撤销；仍存在已分配 IP 或无法删除的网段将被跳过并显示原因。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={bulkDeleting}>取消</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={bulkDeleting}
            onClick={event => {
              event.preventDefault()
              void bulkDeleteSubnets()
            }}
          >
            {bulkDeleting ? '删除中…' : '删除'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </RoomTreeLayout>
  )
}
