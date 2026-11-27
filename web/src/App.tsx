import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  Alert, App as UIApp, Button, Card, ConfigProvider, Descriptions,
  Dropdown, Empty, Form, Input, Layout, List, Menu, Modal, Select,
  Space, Spin, Table, Tabs, Tag, Tooltip, Upload, theme,
} from './components/AppControls'
import type { TableColumnsType } from './components/AppControls'
import { Tooltip as UiTooltip, TooltipContent, TooltipTrigger } from './components/ui/tooltip'
const zhCN = {}
import {
  Building2 as BuildingOutlined, Server as CloudServerOutlined,
  Trash2 as DeleteOutlined, Monitor as DesktopOutlined, Download as DownloadOutlined, Pencil as EditOutlined, Globe as GlobalOutlined, History as HistoryOutlined,
  House as HomeOutlined, ArrowLeft as ArrowLeftOutlined, LogOut as LogoutOutlined, Plus as PlusOutlined, RefreshCw as ReloadOutlined,
  Settings as SettingOutlined, Star as StarFilled, Star as StarOutlined, Users as TeamOutlined, User as UserOutlined,
  Network as NetworkOutlined, Split as SplitOutlined, LocateFixed as LocateFixedOutlined, Layers3, Blocks,
} from 'lucide-react'
import { api, apiCSV, APIError } from './api'
import { formatDateTime } from './lib/date'
import {
  configFilterKey,
  formatConfigSummary,
  formatDiskGiB,
  formatDiskLine,
  formatDiskSummary,
  formatDiskTooltipLines,
  formatMemoryCompact,
  totalDiskGiB,
} from './lib/hardware'
import { downloadCSV } from './csv'
import type { Asset, AssetFields, Captcha, Change, Group, ImportPreview, Kind, Link, LinkKind, Person, ServiceEntry, Subnet, Team, User, VLAN } from './api'
import { assetLocations, assetRoomId, buildRoomCounts, locationLabel, matchesRoomFilter } from './facilities'
import type { AssetLocation, Facilities } from './facilities'
import { isNetworkKind, KIND_LABELS, kindLabel, NETWORK_KINDS } from './kinds'
import type { Page } from './types'
import { AssetEditor } from './components/AssetEditor'
import { RoomTreeLayout, type RoomFilter } from './components/RoomTreeLayout'
import { AssetInterfaces } from './components/AssetInterfaces'
import { AssetRelationGraph } from './components/AssetRelationGraph'
import { ChangeList } from './components/ChangeList'
import { Dashboard } from './components/Dashboard'
import { FacilityView } from './components/FacilityView'
import { GlobalSearch } from './components/GlobalSearch'
import { GroupManager } from './components/GroupManager'
import { IPAddressView } from './components/IPAddressView'
import { IpamView } from './components/IpamView'
import { LoginBackdrop } from './components/LoginBackdrop'
import {
  NetworkDeviceIcon, OperatorTowerIcon, OwnerBadgeIcon, ReferenceDataIcon,
} from './components/MetadataIcons'
import { MetadataManager } from './components/MetadataManager'
import { SubnetDetailView, VLANDetailView } from './components/NetworkDetailViews'
import { OrganizationManager } from './components/OrganizationManager'
import { PageHeader } from './components/PageHeader'
import { RowActionsMenu } from './components/RowActionsMenu'
import { readStoredThemeMode, THEME_STORAGE_KEY, ThemeToggle, type ThemeMode } from './components/ThemeToggle'
import {
  buildFacetedOptions,
  ClearFiltersButton,
  DataTableViewOptions,
  EMPTY_FILTER_VALUE,
  matchesMultiFilter,
} from './components/TableColumnControls'
import { BulkActionBar } from './components/TableSelectionControls'
import { ServiceIcon } from './components/ServiceIcon'
import { ServiceManager } from './components/ServiceManager'
import { serviceCategory } from './serviceCatalog'
import { UserManager } from './components/UserManager'
import { VLANView } from './components/VLANView'
import { Wordmark } from './components/Wordmark'

const { Header, Sider, Content } = Layout

type NavLeaf = { key: string; label: ReactNode; icon: ReactNode }
type NavGroup = { key: string; label: ReactNode; icon: ReactNode; children: NavLeaf[] }

const statuses: Record<string, { label: string; color: string }> = {
  online: { label: '在线', color: 'blue' },
  running: { label: '运行中', color: 'green' },
  stopped: { label: '已停止', color: 'default' },
  paused: { label: '已暂停', color: 'orange' },
  offline: { label: '离线', color: 'red' },
  unknown: { label: '未知', color: 'default' },
}
const relations: { kind: LinkKind; from: Kind; to: Kind[]; outgoing: string; incoming: string }[] = [
  { kind: 'hosts', from: 'host', to: ['vm'], outgoing: '承载虚拟机', incoming: '所在宿主机' },
]
const defaultAssetColumns = ['name', 'address', 'capacity', 'platform', 'meta', 'services', 'group', 'team', 'notes']
const defaultHostColumns = ['name', 'address', 'capacity', 'brand', 'model', 'services', 'group', 'team', 'notes']
const defaultNetworkDeviceColumns = ['name', 'kind', 'address', 'owner']
const assetColumnKeys = ['name', 'address', 'capacity', 'brand', 'model', 'platform', 'meta', 'kind', 'services', 'group', 'team', 'owner', 'environment', 'notes', 'created', 'updated']


const PLATFORM_CATALOG = [
  { value: 'pve', label: 'Proxmox VE' },
  { value: 'kvm', label: 'KVM' },
  { value: 'esxi', label: 'VMware ESXi' },
]
const NETWORK_KIND_CATALOG = NETWORK_KINDS.map(kind => ({ value: kind, label: KIND_LABELS[kind] }))
const PROBE_CATALOG = [
  { value: 'reachable', label: '可达' },
  { value: 'unreachable', label: '不可达' },
  { value: 'unprobed', label: '未探测' },
]

function platformLabel(asset: Pick<Asset, 'platform'>) {
  return asset.platform === 'pve' ? 'Proxmox VE' : asset.platform === 'kvm' ? 'KVM' : asset.platform === 'esxi' ? 'VMware ESXi' : '—'
}
function capacityFilterValue(asset: Pick<Asset, 'kind' | 'cpu' | 'memoryMiB' | 'disks'>): string {
  if (isNetworkKind(asset.kind)) return EMPTY_FILTER_VALUE
  return configFilterKey(asset.cpu || 0, asset.memoryMiB || 0, asset.disks ?? []) || EMPTY_FILTER_VALUE
}
function renderConfigCell(asset: Asset): ReactNode {
  if (isNetworkKind(asset.kind)) return <span className="text-muted-foreground">—</span>
  const disks = asset.disks ?? []
  const cpuText = asset.cpu > 0 ? `${asset.cpu}C` : ''
  const memText = formatMemoryCompact(asset.memoryMiB)
  const diskGiB = totalDiskGiB(disks)
  const diskText = diskGiB > 0 ? formatDiskGiB(diskGiB) : ''
  const segments: ReactNode[] = []
  if (cpuText) segments.push(<span key="cpu">{cpuText}</span>)
  if (memText) segments.push(<span key="mem">{memText}</span>)
  if (diskGiB > 0 && diskText) {
    const { lines, footer } = formatDiskTooltipLines(disks)
    segments.push(
      <UiTooltip key="disk">
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            className="underline decoration-dotted underline-offset-4 decoration-muted-foreground/50 hover:decoration-foreground cursor-default"
          >
            {diskText}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" align="start" className="max-w-xs space-y-1 py-1.5 text-left">
          <div className="space-y-0.5">
            {lines.map((line, index) => (
              <div key={index} className="tabular-nums leading-snug">{line}</div>
            ))}
          </div>
          {footer && (
            <div className="border-t border-background/20 pt-1 text-[11px] opacity-80 tabular-nums">
              {footer}
            </div>
          )}
        </TooltipContent>
      </UiTooltip>,
    )
  }
  if (!segments.length) return <span className="text-muted-foreground">—</span>
  return (
    <span className="inline-flex items-center tabular-nums whitespace-nowrap">
      {segments.map((segment, index) => (
        <Fragment key={index}>
          {index > 0 && <span aria-hidden="true" className="mx-1 text-muted-foreground/60">·</span>}
          {segment}
        </Fragment>
      ))}
    </span>
  )
}
function probeOf(asset: Asset): { label: string; color: string } {
  if (!asset.probeEnabled) return { label: '未开启', color: 'default' }
  if (asset.lifecycle === 'retired') return { label: '已停用', color: 'default' }
  switch (asset.probeStatus) {
    case 'reachable': return { label: '可达', color: 'green' }
    case 'unreachable': return { label: '不可达', color: 'red' }
    case 'error': return { label: '探测异常', color: 'orange' }
    default: return { label: '待探测', color: 'default' }
  }
}
function probeFilterValue(asset: Asset): string {
  if (!asset.probeEnabled || !asset.address || asset.lifecycle !== 'active') return 'unprobed'
  if (asset.probeStatus === 'reachable' || asset.probeStatus === 'unreachable') return asset.probeStatus
  return 'unprobed'
}
function assetFilterValues(
  asset: Asset,
  colKey: string,
  vmRelations: Map<number, string[]>,
  projectNames: Map<number, string>,
  teamNames: Map<number, string>,
): string | string[] | null | undefined {
  switch (colKey) {
    case 'brand': return asset.brand.trim()
    case 'model': return asset.model.trim()
    case 'kind': return asset.kind
    case 'platform': return asset.platform
    case 'meta': return vmRelations.get(asset.id) ?? []
    case 'address': return probeFilterValue(asset)
    case 'capacity': return capacityFilterValue(asset)
    case 'services': return (asset.services ?? []).map(service => service.name)
    case 'group': return asset.groupId && projectNames.has(asset.groupId) ? String(asset.groupId) : ''
    case 'team': return asset.teamId && teamNames.has(asset.teamId) ? String(asset.teamId) : ''
    case 'owner': return asset.owner
    case 'environment': return asset.environment
    default: return undefined
  }
}

function statusOf(asset: Asset) {
  if (asset.lifecycle === 'retired') return { label: '已退役', color: 'default' }
  return statuses[asset.status] ?? statuses.unknown
}
function messageText(error: unknown) {
  return error instanceof Error ? error.message : '操作失败'
}

const PAGE_KEYS: Page[] = ['home', 'host', 'vm', 'services', 'network_devices', 'facilities', 'subnets', 'vlans', 'ips', 'operators', 'changes', 'groups', 'teams', 'owners', 'users']

function readPageParam(): Page {
  const params = new URLSearchParams(window.location.search)
  const value = params.get('page')
  if (value === 'ipam') return 'subnets'
  if (value === 'switches') return 'network_devices'
  if (value === 'network') {
    const tab = params.get('tab')
    if (tab === 'ips' || tab === 'vlans' || tab === 'operators') return tab
    if (tab === 'devices') return 'network_devices'
    return 'subnets'
  }
  if (value === 'metadata') return 'groups'
  if (value === 'password') return 'users'
  return PAGE_KEYS.includes(value as Page) ? (value as Page) : 'home'
}

function readRoomParam(): number | null {
  const value = Number(new URLSearchParams(window.location.search).get('room'))
  return Number.isFinite(value) && value > 0 ? value : null
}

function readRackParam(): number | null {
  const value = Number(new URLSearchParams(window.location.search).get('rack'))
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

function readSystemDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return false
  }
}

export default function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(readStoredThemeMode)
  const [systemDark, setSystemDark] = useState<boolean>(readSystemDark)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    setSystemDark(mediaQuery.matches)
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    mediaQuery.addEventListener('change', onChange)
    return () => mediaQuery.removeEventListener('change', onChange)
  }, [])

  const dark = themeMode === 'dark' || (themeMode === 'system' && systemDark)

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, themeMode)
    } catch {
      // Storage may be unavailable in private browsing.
    }
  }, [themeMode])

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0a0a0a' : '#ffffff')
  }, [dark])

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: dark ? '#e5e5e5' : '#171717',
          borderRadius: 8,
          colorBgContainer: dark ? '#141414' : '#ffffff',
          colorBgLayout: dark ? '#0a0a0a' : '#ffffff',
          colorBgElevated: dark ? '#171717' : '#ffffff',
        },
      }}
    >
      <UIApp>
        <Shell dark={dark} themeMode={themeMode} onThemeModeChange={setThemeMode} />
      </UIApp>
    </ConfigProvider>
  )
}

function Shell({ dark, themeMode, onThemeModeChange }: { dark: boolean; themeMode: ThemeMode; onThemeModeChange: (mode: ThemeMode) => void }) {
  const { message } = UIApp.useApp()
  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(true)
  const [busy, setBusy] = useState(false)
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginForm, setLoginForm] = useState({ username: '', password: '' })
  const [captcha, setCaptcha] = useState<Captcha | null>(null)
  const [captchaCode, setCaptchaCode] = useState('')
  const [captchaLoading, setCaptchaLoading] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState<Page>(readPageParam)
  const [facilityRoomId, setFacilityRoomId] = useState<number | null>(readRoomParam)
  const [facilityRackId, setFacilityRackId] = useState<number | null>(() => readPageParam() === 'facilities' ? readRackParam() : null)

  // Keep the current page and room in the URL so a refresh (or a shared link)
  // lands on the same screen instead of the dashboard.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (page === 'home') params.delete('page')
    else params.set('page', page)
    if (page === 'facilities' && facilityRoomId) params.set('room', String(facilityRoomId))
    else params.delete('room')
    if (page === 'facilities' && facilityRackId) params.set('rack', String(facilityRackId))
    else params.delete('rack')
    params.delete('tab')
    const query = params.toString()
    const next = query ? `${window.location.pathname}?${query}` : window.location.pathname
    if (next !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', next)
    }
  }, [page, facilityRoomId, facilityRackId])
  const [selectedSubnetId, setSelectedSubnetId] = useState<number | null>(null)
  const [selectedVLAN, setSelectedVLAN] = useState<VLAN | null>(null)
  const [ipFilterSubnetId, setIpFilterSubnetId] = useState<number | null>(null)

  const [assets, setAssets] = useState<Asset[]>([])
  const [registeredServices, setRegisteredServices] = useState<ServiceEntry[]>([])
  const [links, setLinks] = useState<Link[]>([])
  const [changes, setChanges] = useState<Change[]>([])
  const [facilities, setFacilities] = useState<Facilities>({ regions: [], rooms: [], racks: [], placements: [] })
  const [subnets, setSubnets] = useState<Subnet[]>([])

  const [keyword, setKeyword] = useState('')
  const [roomFilter, setRoomFilter] = useState<RoomFilter>('all')
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({})
  const [visibleColumns, setVisibleColumns] = useState<string[]>(defaultAssetColumns)
  const [importing, setImporting] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [assetImportOpen, setAssetImportOpen] = useState(false)
  const assetImportRef = useRef<HTMLInputElement>(null)
  const [assetImportFile, setAssetImportFile] = useState<File | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [pendingImport, setPendingImport] = useState<File | null>(null)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const createTriggerRef = useRef<HTMLElement | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [editor, setEditor] = useState(false)
  const [newKind, setNewKind] = useState<Kind>('host')
  const [saving, setSaving] = useState(false)
  const [drawerError, setDrawerError] = useState('')
  const [highlightId, setHighlightId] = useState<number | null>(null)
  const restoredAssetRef = useRef(false)
  const [assetTab, setAssetTab] = useState('overview')
  const [assetChanges, setAssetChanges] = useState<Change[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [bookmarks, setBookmarks] = useState<number[]>(() => {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem('dc-db-bookmarks') ?? '[]')
      return Array.isArray(parsed) ? parsed.filter((id): id is number => typeof id === 'number') : []
    } catch {
      return []
    }
  })
  const [rackBookmarks, setRackBookmarks] = useState<number[]>(() => {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem('dc-db-rack-bookmarks') ?? '[]')
      return Array.isArray(parsed) ? parsed.filter((id): id is number => typeof id === 'number') : []
    } catch {
      return []
    }
  })
  const [subnetBookmarks, setSubnetBookmarks] = useState<number[]>(() => {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem('dc-db-subnet-bookmarks') ?? '[]')
      return Array.isArray(parsed) ? parsed.filter((id): id is number => typeof id === 'number') : []
    } catch {
      return []
    }
  })
  const [showRelationForm, setShowRelationForm] = useState(false)
  const [relationChoice, setRelationChoice] = useState('')
  const [relationTarget, setRelationTarget] = useState(0)
  const [facilityFocus, setFacilityFocus] = useState<AssetLocation | null>(null)
  const [selectedAssetIds, setSelectedAssetIds] = useState<number[]>([])
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkError, setBulkError] = useState('')
  const [bulkForm] = Form.useForm()

  const systemChildren: NavLeaf[] = [
    { key: 'changes', label: '变更记录', icon: <HistoryOutlined /> },
    { key: 'users', label: user?.role === 'admin' ? '用户管理' : '我的账号', icon: <TeamOutlined /> },
  ]
  const navigation: (NavLeaf | NavGroup)[] = [
    { key: 'home', label: '首页', icon: <HomeOutlined /> },
    { key: 'facilities', label: '机柜', icon: <BuildingOutlined /> },
    { key: 'host', label: '服务器', icon: <CloudServerOutlined /> },
    { key: 'vm', label: '虚拟机', icon: <DesktopOutlined /> },
    { key: 'services', label: '服务', icon: <Blocks /> },
    {
      key: 'network_group', label: '网络', icon: <GlobalOutlined />,
      children: [
        { key: 'network_devices', label: '网络设备', icon: <NetworkDeviceIcon /> },
        { key: 'subnets', label: '网段', icon: <NetworkOutlined /> },
        { key: 'ips', label: 'IP 地址', icon: <LocateFixedOutlined /> },
        { key: 'vlans', label: 'VLAN', icon: <SplitOutlined /> },
        { key: 'operators', label: '运营商', icon: <OperatorTowerIcon /> },
      ],
    },
    {
      key: 'reference', label: '组织', icon: <ReferenceDataIcon />,
      children: [
        { key: 'groups', label: '项目', icon: <Layers3 strokeWidth={1.9} /> },
        { key: 'teams', label: '团队', icon: <TeamOutlined /> },
        { key: 'owners', label: '人员', icon: <OwnerBadgeIcon /> },
      ],
    },
    {
      key: 'system', label: '系统管理', icon: <SettingOutlined />,
      children: systemChildren,
    },
  ]
  const editable = user?.role !== 'viewer'
  const assetPage = page === 'host' || page === 'vm' || page === 'network_devices'

  const byId = useMemo(() => new Map(assets.map(asset => [asset.id, asset])), [assets])
  const locations = useMemo(() => assetLocations(facilities, links), [facilities, links])
  const selected = assets.find(asset => asset.id === selectedId) ?? null
  const selectedLocation = selected ? locations.get(selected.id) : undefined
  const related = links.filter(link => link.fromId === selectedId || link.toId === selectedId)
  const vmRelations = useMemo(() => {
    const data = new Map<number, string[]>()
    for (const link of links) {
      if (link.kind !== 'hosts') continue
      const names = data.get(link.toId) ?? []
      names.push(link.fromName)
      data.set(link.toId, names)
    }
    return data
  }, [links])

  const scoped = useMemo(() => {
    if (page === 'host') return assets.filter(asset => asset.kind === 'host')
    if (page === 'vm') return assets.filter(asset => asset.kind === 'vm')
    if (page === 'network_devices') return assets.filter(asset => isNetworkKind(asset.kind))
    return []
  }, [assets, page])
  const assetRoomCounts = useMemo(
    () => buildRoomCounts(scoped, asset => assetRoomId(asset, locations, byId, links)),
    [byId, links, locations, scoped],
  )
  useEffect(() => {
    if (assetPage && !busy && roomFilter === 'unassigned' && assetRoomCounts.unassigned === 0) {
      setRoomFilter('all')
    }
  }, [assetPage, assetRoomCounts.unassigned, busy, roomFilter])

  const projectNames = useMemo(() => new Map(groups.map(item => [item.id, item.name])), [groups])
  const teamNames = useMemo(() => new Map(teams.map(item => [item.id, item.name])), [teams])
  const projectCatalog = useMemo(
    () => groups
      .map(item => ({ value: String(item.id), label: item.name }))
      .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN', { numeric: true })),
    [groups],
  )
  const teamCatalog = useMemo(
    () => teams
      .map(item => ({ value: String(item.id), label: item.name }))
      .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN', { numeric: true })),
    [teams],
  )
  const capacityCatalog = useMemo(() => {
    const specs = new Map<string, { cpu: number; memoryMiB: number; diskGiB: number; label: string }>()
    for (const asset of scoped) {
      if (isNetworkKind(asset.kind)) continue
      const cpu = asset.cpu || 0
      const memoryMiB = asset.memoryMiB || 0
      const disks = asset.disks ?? []
      const key = configFilterKey(cpu, memoryMiB, disks)
      if (!key) continue
      if (!specs.has(key)) {
        specs.set(key, {
          cpu,
          memoryMiB,
          diskGiB: totalDiskGiB(disks),
          label: formatConfigSummary(cpu, memoryMiB, disks),
        })
      }
    }
    return Array.from(specs.entries())
      .sort(([, left], [, right]) => left.cpu - right.cpu || left.memoryMiB - right.memoryMiB || left.diskGiB - right.diskGiB)
      .map(([value, spec]) => ({ value, label: spec.label }))
  }, [scoped])
  const baseFiltered = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    return scoped.filter(asset => {
      if (!matchesRoomFilter(assetRoomId(asset, locations, byId, links), roomFilter)) return false
      const configTerms = isNetworkKind(asset.kind)
        ? []
        : [formatConfigSummary(asset.cpu || 0, asset.memoryMiB || 0, asset.disks ?? []), formatDiskSummary(asset.disks ?? [])]
      return !query || [asset.name, asset.brand, asset.model, asset.address, asset.owner, projectNames.get(asset.groupId), teamNames.get(asset.teamId ?? 0), asset.environment, ...configTerms, ...(vmRelations.get(asset.id) ?? [])]
        .some(value => value?.toLowerCase().includes(query))
    })
  }, [scoped, byId, links, locations, roomFilter, keyword, vmRelations, projectNames, teamNames])
  const activeColumnFilterEntries = useMemo(
    () => Object.entries(columnFilters).filter(([, values]) => values.length > 0),
    [columnFilters],
  )
  const activeFilterCount = useMemo(
    () => activeColumnFilterEntries.reduce((total, [, values]) => total + values.length, 0),
    [activeColumnFilterEntries],
  )
  const filtered = useMemo(() => {
    if (!activeColumnFilterEntries.length) return baseFiltered
    return baseFiltered.filter(asset =>
      activeColumnFilterEntries.every(([colKey, values]) =>
        matchesMultiFilter(values, assetFilterValues(asset, colKey, vmRelations, projectNames, teamNames)),
      ),
    )
  }, [baseFiltered, activeColumnFilterEntries, vmRelations, projectNames, teamNames])
  const assetColumnFilterOptions = useMemo(() => {
    const crossItems = (colKey: string) => {
      const others = activeColumnFilterEntries.filter(([key]) => key !== colKey)
      if (!others.length) return baseFiltered
      return baseFiltered.filter(asset =>
        others.every(([key, values]) =>
          matchesMultiFilter(values, assetFilterValues(asset, key, vmRelations, projectNames, teamNames)),
        ),
      )
    }
    return {
      brand: buildFacetedOptions({
        items: crossItems('brand'),
        getEntries: asset => asset.brand.trim(),
        includeEmpty: true,
        emptyLabel: '未填写',
        selectedValues: columnFilters.brand,
      }),
      model: buildFacetedOptions({
        items: crossItems('model'),
        getEntries: asset => asset.model.trim(),
        includeEmpty: true,
        emptyLabel: '未填写',
        selectedValues: columnFilters.model,
      }),
      kind: buildFacetedOptions({
        items: crossItems('kind'),
        getEntries: asset => ({ value: asset.kind, label: kindLabel(asset.kind) }),
        catalog: NETWORK_KIND_CATALOG,
        includeZeroCatalog: true,
        selectedValues: columnFilters.kind,
      }),
      platform: buildFacetedOptions({
        items: crossItems('platform'),
        getEntries: asset => asset.platform ? { value: asset.platform, label: platformLabel(asset) } : null,
        catalog: PLATFORM_CATALOG,
        includeZeroCatalog: true,
        includeEmpty: true,
        emptyLabel: '未设置',
        selectedValues: columnFilters.platform,
      }),
      meta: buildFacetedOptions({
        items: crossItems('meta'),
        getEntries: asset => vmRelations.get(asset.id) ?? [],
        includeEmpty: true,
        emptyLabel: '未关联',
        selectedValues: columnFilters.meta,
      }),
      address: buildFacetedOptions({
        items: crossItems('address'),
        getEntries: asset => probeFilterValue(asset),
        catalog: PROBE_CATALOG,
        includeZeroCatalog: true,
        selectedValues: columnFilters.address,
      }),
      capacity: buildFacetedOptions({
        items: crossItems('capacity'),
        getEntries: asset => {
          const value = capacityFilterValue(asset)
          return value === EMPTY_FILTER_VALUE
            ? EMPTY_FILTER_VALUE
            : { value, label: formatConfigSummary(asset.cpu || 0, asset.memoryMiB || 0, asset.disks ?? []) }
        },
        catalog: capacityCatalog,
        includeEmpty: true,
        emptyLabel: '未配置',
        selectedValues: columnFilters.capacity,
      }),
      services: buildFacetedOptions({
        items: crossItems('services'),
        getEntries: asset => (asset.services ?? []).map(service => service.name),
        includeEmpty: true,
        emptyLabel: '无服务',
        selectedValues: columnFilters.services,
      }),
      group: buildFacetedOptions({
        items: crossItems('group'),
        getEntries: asset => {
          if (!asset.groupId) return null
          const label = projectNames.get(asset.groupId)
          return label ? { value: String(asset.groupId), label } : null
        },
        catalog: projectCatalog,
        includeEmpty: true,
        emptyLabel: '未设置',
        selectedValues: columnFilters.group,
      }),
      team: buildFacetedOptions({
        items: crossItems('team'),
        getEntries: asset => {
          if (!asset.teamId) return null
          const label = teamNames.get(asset.teamId)
          return label ? { value: String(asset.teamId), label } : null
        },
        catalog: teamCatalog,
        includeEmpty: true,
        emptyLabel: '未设置',
        selectedValues: columnFilters.team,
      }),
      owner: buildFacetedOptions({
        items: crossItems('owner'),
        getEntries: asset => asset.owner,
        includeEmpty: true,
        emptyLabel: '未设置',
        selectedValues: columnFilters.owner,
      }),
      environment: buildFacetedOptions({
        items: crossItems('environment'),
        getEntries: asset => asset.environment,
        includeEmpty: true,
        emptyLabel: '未设置',
        selectedValues: columnFilters.environment,
      }),
    }
  }, [baseFiltered, activeColumnFilterEntries, columnFilters, vmRelations, projectNames, teamNames, projectCatalog, teamCatalog, capacityCatalog])

  function setColumnFilter(colKey: string, nextValues: string[]) {
    setColumnFilters(current => {
      if (nextValues.length === 0) {
        if (!(colKey in current)) return current
        const next = { ...current }
        delete next[colKey]
        return next
      }
      return { ...current, [colKey]: nextValues }
    })
  }

  function clearAllColumnFilters() {
    setColumnFilters({})
  }

  const relationOptions = useMemo(() => {
    if (!selected) return []
    return relations.flatMap(relation => {
      const items: { id: string; label: string; direction: 'out' | 'in'; relation: typeof relation }[] = []
      if (relation.from === selected.kind) items.push({ id: relation.kind + '-out', label: relation.outgoing, direction: 'out', relation })
      if (relation.to.includes(selected.kind)) items.push({ id: relation.kind + '-in', label: relation.incoming, direction: 'in', relation })
      return items
    })
  }, [selected])
  const chosenRelation = relationOptions.find(option => option.id === relationChoice)
  const targets = useMemo(() => {
    if (!chosenRelation) return []
    const active = assets.filter(asset => asset.lifecycle === 'active')
    return active.filter(asset => {
      if (asset.id === selectedId) return false
      if (chosenRelation.direction === 'in') return asset.kind === chosenRelation.relation.from
      return chosenRelation.relation.to.includes(asset.kind)
    })
  }, [assets, chosenRelation, selectedId])

  useEffect(() => {
    void (async () => {
      try {
        setUser(await api<User>('/me'))
        await loadAll()
      } catch (e) {
        if (!(e instanceof APIError && e.status === 401)) setError(messageText(e))
      } finally {
        setChecking(false)
      }
    })()
  }, [])

  useEffect(() => {
    const refreshFacilities = () => {
      void api<Facilities>('/facilities').then(setFacilities).catch(() => {})
    }
    window.addEventListener('dc-db-facilities-changed', refreshFacilities)
    return () => window.removeEventListener('dc-db-facilities-changed', refreshFacilities)
  }, [])

  useEffect(() => {
    setColumnFilters({})
  }, [page])

  useEffect(() => {
    try {
      localStorage.setItem('dc-db-bookmarks', JSON.stringify(bookmarks))
    } catch {
      // Bookmarks still work for this session when storage is unavailable.
    }
  }, [bookmarks])

  useEffect(() => {
    try {
      localStorage.setItem('dc-db-rack-bookmarks', JSON.stringify(rackBookmarks))
      localStorage.setItem('dc-db-subnet-bookmarks', JSON.stringify(subnetBookmarks))
    } catch {
      // Favorites still work for this session when storage is unavailable.
    }
  }, [rackBookmarks, subnetBookmarks])

  useEffect(() => {
    setSelectedAssetIds([])
  }, [page, keyword, roomFilter, columnFilters])

  useEffect(() => {
    const validIds = new Set(filtered.map(asset => asset.id))
    setSelectedAssetIds(current => {
      const next = current.filter(id => validIds.has(id))
      return next.length === current.length ? current : next
    })
  }, [filtered])

  useEffect(() => {
    if (!assetPage) return
    const fallback = page === 'host' ? defaultHostColumns : page === 'network_devices' ? defaultNetworkDeviceColumns : defaultAssetColumns
    try {
      const key = 'dc-db-columns:' + page + (page === 'host' ? ':v9' : page === 'vm' ? ':v7' : '')
      const raw = localStorage.getItem(key)
      const v8 = page === 'host' && !raw ? localStorage.getItem('dc-db-columns:host:v8') : null
      const v7 = page === 'host' && !raw && !v8 ? localStorage.getItem('dc-db-columns:host:v7') : null
      const v6 = (page === 'host' || page === 'vm') && !raw && !v8 && !v7 ? localStorage.getItem('dc-db-columns:' + page + ':v6') : null
      const v5 = (page === 'host' || page === 'vm') && !raw && !v8 && !v7 && !v6 ? localStorage.getItem('dc-db-columns:' + page + ':v5') : null
      const v4 = v8 || v7 || v6 || v5 || ((page === 'host' || page === 'vm') && !raw ? localStorage.getItem('dc-db-columns:' + page + ':v4') : null)
      const previous = v4 || ((page === 'host' || page === 'vm') && !raw ? localStorage.getItem('dc-db-columns:' + page + ':v3') || localStorage.getItem('dc-db-columns:' + page + ':v2') : null)
      const legacy = previous || ((page === 'host' || page === 'vm') && !raw ? localStorage.getItem('dc-db-columns:' + page) : null)
      const parsed: unknown = raw || legacy ? JSON.parse((raw || legacy)!) : null
      const valid = Array.isArray(parsed)
        ? parsed
            .filter((item): item is string => typeof item === 'string')
            .map(item => item === 'status' || item === 'probe' ? 'address' : item)
            .filter(item =>
              assetColumnKeys.includes(item)
              && (page === 'host'
                ? item !== 'meta' && item !== 'platform' && item !== 'owner' && item !== 'environment' && item !== 'kind' && (!!raw || !!v8 || !!v7 || !!v6 || !!v4 || (item !== 'created' && item !== 'updated'))
                : item !== 'brand' && item !== 'model' && (page !== 'vm' || (item !== 'kind' && item !== 'owner' && item !== 'environment' && (!!raw || !!v4 || (item !== 'created' && item !== 'updated'))))),
            )
        : []
      if (legacy && valid.length) {
        if (!previous) {
          if (page === 'vm') valid.push('platform')
        }
        if (!v4) valid.push('capacity', 'notes')
        if (!v8 && !v7 && !v6) valid.push('services')
        if (page === 'host') {
          if (!valid.includes('brand')) valid.push('brand')
          if (!valid.includes('model')) valid.push('model')
          if (!valid.includes('group')) valid.push('group')
          if (!valid.includes('team')) valid.push('team')
        }
        if (page === 'vm') {
          if (!valid.includes('group')) valid.push('group')
          if (!valid.includes('team')) valid.push('team')
        }
        localStorage.setItem(key, JSON.stringify(assetColumnKeys.filter(item => valid.includes(item))))
      }
      setVisibleColumns(valid.length ? assetColumnKeys.filter(item => valid.includes(item)) : fallback)
    } catch {
      setVisibleColumns(fallback)
    }
  }, [assetPage, page])

  useEffect(() => {
    if (!user || (page !== 'host' && page !== 'vm' && page !== 'network_devices')) return
    let active = true
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void api<{ id: number; version: number; status: Asset['probeStatus']; checkedAt: string | null }[]>('/probe-results').then(latest => {
        if (!active) return
        const byId = new Map(latest.map(item => [item.id, item]))
        setAssets(current => current.map(item => {
          const updated = byId.get(item.id)
          return updated && item.version === updated.version
            ? { ...item, probeStatus: updated.status, probeCheckedAt: updated.checkedAt } : item
        }))
      }).catch(() => {})
    }, 10000)
    return () => { active = false; window.clearInterval(timer) }
  }, [user, page])

  useEffect(() => {
    if (!chosenRelation && relationOptions.length) setRelationChoice(relationOptions[0].id)
  }, [relationOptions, chosenRelation])

  async function loadAll() {
    setBusy(true)
    setError('')
    try {
      const [nextAssets, nextLinks, nextChanges, nextFacilities, nextSubnets, nextGroups, nextPeople, nextTeams, nextServices] = await Promise.all([
        api<Asset[]>('/assets'), api<Link[]>('/links'), api<Change[]>('/changes'),
        api<Facilities>('/facilities'), api<Subnet[]>('/subnets'), api<Group[]>('/groups'),
        api<Person[]>('/people'), api<Team[]>('/teams'), api<ServiceEntry[]>('/services'),
      ])
      setAssets(nextAssets)
      setLinks(nextLinks)
      setChanges(nextChanges)
      setFacilities(nextFacilities)
      setSubnets(nextSubnets)
      setGroups(nextGroups)
      setPeople(nextPeople)
      setTeams(nextTeams)
      setRegisteredServices(nextServices)
    } catch (e) {
      handleError(e)
    } finally {
      setBusy(false)
    }
  }

  async function refreshAssetsAndServices() {
    try {
      const [nextAssets, nextServices] = await Promise.all([
        api<Asset[]>('/assets'),
        api<ServiceEntry[]>('/services'),
      ])
      setAssets(nextAssets)
      setRegisteredServices(nextServices)
    } catch (e) {
      handleError(e)
    }
  }

  // Restore a shared asset link (?asset=12) once the inventory is loaded.
  useEffect(() => {
    if (restoredAssetRef.current || !user || !assets.length) return
    restoredAssetRef.current = true
    const wanted = Number(new URLSearchParams(window.location.search).get('asset'))
    if (!wanted) return
    const asset = assets.find(item => item.id === wanted)
    if (!asset) {
      syncAssetParam(null)
      return
    }
    setPage(asset.kind === 'vm' ? 'vm' : isNetworkKind(asset.kind) ? 'network_devices' : 'host')
    void openAsset(asset.id)
    // openAsset is stable enough for a one-shot restore; it only depends on the id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, user])

  function handleError(e: unknown, inDrawer = false) {
    if (e instanceof APIError && e.status === 401 && user) {
      closeDrawer()
      setUser(null)
    }
    if (inDrawer && user) setDrawerError(messageText(e))
    else setError(messageText(e))
  }

  useEffect(() => {
    if (!checking && !user) {
      setCreateOpen(false)
      setImportPreview(null)
      setPendingImport(null)
      setBulkOpen(false)
      setSelectedAssetIds([])
      void loadCaptcha()
    }
  }, [checking, user])

  async function loadCaptcha() {
    setCaptchaLoading(true)
    try {
      setCaptcha(await api<Captcha>('/captcha?theme=dark'))
      setCaptchaCode('')
    } catch (e) {
      setError('验证码加载失败，请刷新重试')
      if (e instanceof APIError && e.status === 401) setUser(null)
    } finally {
      setCaptchaLoading(false)
    }
  }

  async function login() {
    if (!captcha) {
      setError('验证码尚未加载，请刷新验证码')
      return
    }
    setLoginBusy(true)
    setError('')
    try {
      setUser(await api<User>('/login', 'POST', {
        ...loginForm,
        captchaId: captcha.id,
        captchaCode,
      }))
      setLoginForm({ username: loginForm.username, password: '' })
      setCaptcha(null)
      setCaptchaCode('')
      await loadAll()
    } catch (e) {
      setError(messageText(e))
      setCaptchaCode('')
      await loadCaptcha()
    } finally {
      setLoginBusy(false)
    }
  }

  async function logout() {
    try {
      await api('/logout', 'POST')
      closeDrawer()
      setUser(null)
      setAssets([])
      setRegisteredServices([])
      setPeople([])
      setTeams([])
      setLinks([])
      setChanges([])
      setFacilities({ regions: [], rooms: [], racks: [], placements: [] })
      setSubnets([])
      goTo('home')
    } catch (e) {
      handleError(e)
    }
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    await api('/me/password', 'POST', { currentPassword, newPassword })
    void message.success('密码已修改，请使用新密码重新登录')
    closeDrawer()
    setUser(null)
    setAssets([])
    setRegisteredServices([])
    setPeople([])
    setTeams([])
    setLinks([])
    setChanges([])
    setFacilities({ regions: [], rooms: [], racks: [], placements: [] })
    setSubnets([])
    setPage('home')
  }

  function goTo(next: Page) {
    setCreateOpen(false)
    // Leaving the current page also leaves an open detail page behind.
    if (drawerOpen) {
      setDrawerOpen(false)
      setSelectedId(null)
      setEditor(false)
      setDrawerError('')
      syncAssetParam(null)
    }
    if (next === 'network') {
      setPage('subnets')
    } else if (next === 'metadata') {
      setPage('groups')
    } else {
      setPage(next)
    }
    if (next !== 'facilities') setFacilityRackId(null)
    if (next !== 'subnets') setSelectedSubnetId(null)
    if (next !== 'vlans') setSelectedVLAN(null)
    setKeyword('')
    setColumnFilters({})
    setFacilityFocus(null)
  }

  function openRoom(roomId: number) {
    closeDrawer()
    setFacilityFocus(null)
    setFacilityRoomId(roomId)
    setFacilityRackId(null)
    setPage('facilities')
  }

  function clearFilters() {
    setKeyword('')
    setColumnFilters({})
  }

  // Keeping the open asset in the URL makes a detail view shareable and lets a
  // refresh restore it.
  function syncAssetParam(id: number | null) {
    const params = new URLSearchParams(window.location.search)
    if (id === null) params.delete('asset')
    else params.set('asset', String(id))
    const query = params.toString()
    window.history.replaceState(null, '', query ? `${window.location.pathname}?${query}` : window.location.pathname)
  }

  function scrollContentViewTop() {
    requestAnimationFrame(() => document.querySelector('.app-content')?.scrollTo({ top: 0 }))
  }

  function closeDrawer(force = false) {
    if (saving && !force) return
    setDrawerOpen(false)
    scrollContentViewTop()
    setSelectedId(null)
    setEditor(false)
    setDrawerError('')
    setShowRelationForm(false)
    syncAssetParam(null)
  }

  async function openAsset(id: number, startInEditor = false) {
    setSelectedId(id)
    setAssetChanges([])
    setAssetTab('overview')
    setEditor(startInEditor)
    setDrawerError('')
    setShowRelationForm(false)
    setDrawerOpen(true)
    scrollContentViewTop()
    syncAssetParam(id)
    try {
      const changes = await api<Change[]>('/changes?assetId=' + id)
      setAssetChanges(changes)
    } catch (e) {
      handleError(e, true)
    }
  }

  function startNew(kind?: Kind) {
    createTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setSelectedId(null)
    const singleNetworkKind = columnFilters.kind?.length === 1 && isNetworkKind(columnFilters.kind[0])
      ? columnFilters.kind[0]
      : null
    setNewKind(kind ?? (page === 'vm' ? 'vm' : page === 'network_devices' ? (singleNetworkKind || 'switch') : 'host'))
    setDrawerError('')
    setCreateOpen(true)
  }

  function closeCreate(force = false) {
    if (saving && !force) return
    setCreateOpen(false)
    setDrawerError('')
    requestAnimationFrame(() => createTriggerRef.current?.focus())
  }

  async function saveAsset(fields: AssetFields & { version: number }) {
    setSaving(true)
    setDrawerError('')
    try {
      const id = selectedId
      const saved = await api<Asset>(id ? '/assets/' + id : '/assets', id ? 'PUT' : 'POST', fields)
      await loadAll()
      if (id) closeDrawer(true)
      else closeCreate(true)
      setHighlightId(saved.id)
      window.setTimeout(() => setHighlightId(current => (current === saved.id ? null : current)), 1800)
      void message.success(id ? '资产已更新' : '资产已添加')
    } catch (e) {
      handleError(e, true)
    } finally {
      setSaving(false)
    }
  }

  function openBulkEdit() {
    setBulkError('')
    bulkForm.resetFields()
    setBulkOpen(true)
  }

  function toggleBookmark(id: number) {
    setBookmarks(current => current.includes(id)
      ? current.filter(item => item !== id)
      : [...current, id])
  }

  function toggleRackBookmark(id: number) {
    setRackBookmarks(current => current.includes(id)
      ? current.filter(item => item !== id)
      : [...current, id])
  }

  function toggleSubnetBookmark(id: number) {
    setSubnetBookmarks(current => current.includes(id)
      ? current.filter(item => item !== id)
      : [...current, id])
  }

  function openRack(roomId: number, rackId: number) {
    setFacilityRoomId(roomId)
    setFacilityRackId(rackId)
    goTo('facilities')
  }

  function openSubnet(id: number) {
    setSelectedSubnetId(id)
    setSelectedVLAN(null)
    if (drawerOpen) closeDrawer()
    setPage('subnets')
  }

  async function saveBulkEdit(values: {
    platform?: string
    lifecycle?: string
    owner?: string
    environment?: string
    teamId?: number
    brand?: string
    model?: string
  }) {
    if (!selectedAssetIds.length) return
    setBulkSaving(true)
    setBulkError('')
    try {
      const fields: Record<string, string | number> = {}
      const stringKeys = page === 'host'
        ? (['platform', 'lifecycle', 'brand', 'model', 'environment'] as const)
        : page === 'vm'
          ? (['platform', 'lifecycle', 'environment'] as const)
          : (['platform', 'lifecycle', 'owner', 'environment'] as const)
      for (const key of stringKeys) {
        const value = values[key]?.trim()
        if (value) fields[key] = value
      }
      if ((page === 'host' || page === 'vm') && typeof values.teamId === 'number') {
        fields.teamId = values.teamId
      }
      if (!Object.keys(fields).length) {
        setBulkError('请至少选择一项要修改的字段')
        return
      }
      let updated = 0
      for (let i = 0; i < selectedAssetIds.length; i += 1000) {
        const result = await api<{ updated: number }>('/assets/bulk', 'POST', {
          ids: selectedAssetIds.slice(i, i + 1000), ...fields,
        })
        updated += result.updated
      }
      await loadAll()
      setSelectedAssetIds([])
      setBulkOpen(false)
      void message.success(`已更新 ${updated} 条资产`)
    } catch (e) {
      setBulkError(messageText(e))
    } finally {
      setBulkSaving(false)
    }
  }

  function updateVisibleColumns(keys: string[]) {
    const ordered = assetColumnKeys.filter(key => keys.includes(key))
    if (!ordered.length) return
    setVisibleColumns(ordered)
    try {
      localStorage.setItem('dc-db-columns:' + page + (page === 'host' ? ':v9' : page === 'vm' ? ':v7' : ''), JSON.stringify(ordered))
    } catch {
      // Keep the current in-memory column selection.
    }
  }

  function startRelation() {
    setShowRelationForm(true)
    setRelationChoice(relationOptions[0]?.id ?? '')
    setRelationTarget(0)
    setDrawerError('')
  }

  async function updateLink(removeId?: number) {
    const id = selectedId
    if (!id) return
    if (!removeId && (!chosenRelation || !relationTarget)) return
    setSaving(true)
    setDrawerError('')
    try {
      if (removeId) {
        await api('/links/' + removeId, 'DELETE')
      } else if (chosenRelation) {
        const [fromId, toId] = chosenRelation.direction === 'out' ? [id, relationTarget] : [relationTarget, id]
        await api('/links', 'POST', { kind: chosenRelation.relation.kind, fromId, toId })
      }
      await loadAll()
      await openAsset(id)
      void message.success(removeId ? '关系已解除' : '关系已添加')
    } catch (e) {
      handleError(e, true)
    } finally {
      setSaving(false)
    }
  }

  function showAssetLocation(location: AssetLocation) {
    closeDrawer()
    goTo('facilities')
    setFacilityFocus(location)
  }

  function downloadImportErrors() {
    if (!importPreview?.errors.length) return
    downloadCSV('dc-db-import-errors.csv', [
      ['行号', '错误说明'],
      ...importPreview.errors.map(error => [error.row, error.message]),
    ])
  }

  function exportAssetsCSV(items: Asset[], filename = 'dc-db-assets.csv') {
    if (page === 'host') {
      const rows: (string | number)[][] = [[
        '资源名称', '类型', '品牌', '型号', '平台', '状态', '生命周期', '地址 / IP', 'CPU', '内存 MiB', '硬盘总容量 GiB', '硬盘明细', '团队', '环境', '备注',
      ]]
      for (const asset of items) {
        const disks = asset.disks ?? []
        rows.push([
          asset.name, kindLabel(asset.kind), asset.brand ?? '', asset.model ?? '', platformLabel(asset), statusOf(asset).label,
          asset.lifecycle === 'retired' ? '已退役' : '在册', asset.address, asset.cpu, asset.memoryMiB,
          totalDiskGiB(disks) || '', formatDiskSummary(disks),
          teamNames.get(asset.teamId ?? 0) ?? '', asset.environment, asset.notes,
        ])
      }
      downloadCSV(filename, rows)
      return
    }
    if (page === 'vm') {
      const rows: (string | number)[][] = [[
        '资源名称', '类型', '平台', '状态', '生命周期', '地址 / IP', 'CPU', '内存 MiB', '硬盘总容量 GiB', '硬盘明细', '项目', '团队', '环境', '备注',
      ]]
      for (const asset of items) {
        const disks = asset.disks ?? []
        rows.push([
          asset.name, kindLabel(asset.kind), platformLabel(asset), statusOf(asset).label,
          asset.lifecycle === 'retired' ? '已退役' : '在册', asset.address, asset.cpu, asset.memoryMiB,
          totalDiskGiB(disks) || '', formatDiskSummary(disks),
          projectNames.get(asset.groupId) ?? '', teamNames.get(asset.teamId ?? 0) ?? '', asset.environment, asset.notes,
        ])
      }
      downloadCSV(filename, rows)
      return
    }
    const rows: (string | number)[][] = [[
      '资源名称', '类型', '平台', '状态', '生命周期', '地址 / IP', 'CPU', '内存 MiB', '负责人', '环境', '备注',
    ]]
    for (const asset of items) {
      rows.push([
        asset.name, kindLabel(asset.kind), platformLabel(asset), statusOf(asset).label,
        asset.lifecycle === 'retired' ? '已退役' : '在册', asset.address, asset.cpu, asset.memoryMiB,
        asset.owner, asset.environment, asset.notes,
      ])
    }
    downloadCSV(filename, rows)
  }

  function exportSelectedAssetsCSV() {
    const selectedSet = new Set(selectedAssetIds)
    const selectedAssets = filtered.filter(asset => selectedSet.has(asset.id))
    if (!selectedAssets.length) return
    exportAssetsCSV(selectedAssets, 'dc-db-assets.csv')
  }

  function downloadTemplate() {
    downloadCSV('dc-db-import-template.csv', [[
      '资源名称', '类型', '平台', '状态', '生命周期', '地址 / IP', 'CPU', '内存 MiB', '负责人', '环境', '备注',
    ]])
  }

  async function previewCSV(file: File) {
    if (file.size > 16 * 1024 * 1024) {
      setError('CSV 文件不能超过 16 MiB')
      return
    }
    setPreviewing(true)
    setError('')
    try {
      const preview = await apiCSV<ImportPreview>('/assets/import/preview', file)
      setImportPreview(preview)
      setPendingImport(file)
    } catch (e) {
      handleError(e)
    } finally {
      setPreviewing(false)
    }
  }

  async function importCSV(file: File) {
    if (file.size > 16 * 1024 * 1024) {
      setError('CSV 文件不能超过 16 MiB')
      return
    }
    setImporting(true)
    setError('')
    try {
      const result = await apiCSV<{ imported: number }>('/assets/import', file)
      await loadAll()
      setImportPreview(null)
      setPendingImport(null)
      void message.success(`已导入 ${result.imported} 条资产`)
    } catch (e) {
      handleError(e)
    } finally {
      setImporting(false)
    }
  }

  function hostName(asset: Asset) {
    return links.find(link => link.kind === 'hosts' && link.toId === asset.id)?.fromName ?? '—'
  }

  function relationLabel(link: Link) {
    const type = relations.find(item => item.kind === link.kind)
    return (link.fromId === selectedId ? type?.outgoing : type?.incoming) ?? link.kind
  }

  function relatedId(link: Link) {
    return link.fromId === selectedId ? link.toId : link.fromId
  }

  const teamName = (id?: number) => teamNames.get(id ?? 0) ?? '—'
  const groupName = (id: number) => projectNames.get(id) ?? '—'
  const metaTitle = page === 'vm' ? '宿主机' : '平台'
  const metaValue = (asset: Asset) => page === 'vm' ? hostName(asset) : platformLabel(asset)
  const assetNameLabel = page === 'host' ? '服务器名称' : page === 'vm' ? '虚拟机名称' : '资源名称'
  const teamColumnLabel = page === 'host' || page === 'vm' ? '团队' : '运维团队'
  const assetColumns: { key: string; label: string; column: TableColumnsType<Asset>[number] }[] = [
    {
      key: 'name', label: assetNameLabel,
      column: {
        title: assetNameLabel, key: 'name', width: 260,
        sorter: (left, right) => left.name.localeCompare(right.name, 'zh-CN'),
        render: (_, asset) => (
          page === 'host' || page === 'vm'
            ? <button type="button" className="asset-name-button" onClick={() => void openAsset(asset.id)}>{asset.name}</button>
            : <Button type="link" className="asset-link" onClick={() => void openAsset(asset.id)}><span>{asset.name}</span></Button>
        ),
      },
    },
    {
      key: 'brand', label: '品牌',
      column: {
        title: '品牌', key: 'brand', width: 110,
        filter: {
          options: assetColumnFilterOptions.brand,
          selectedValues: columnFilters.brand ?? [],
          onChange: next => setColumnFilter('brand', next),
          searchPlaceholder: '搜索品牌',
        },
        render: (_, asset) => asset.brand || '—',
      },
    },
    {
      key: 'model', label: '型号',
      column: {
        title: '型号', key: 'model', width: 195,
        filter: {
          options: assetColumnFilterOptions.model,
          selectedValues: columnFilters.model ?? [],
          onChange: next => setColumnFilter('model', next),
          searchPlaceholder: '搜索型号',
        },
        render: (_, asset) => asset.model || '—',
      },
    },
    {
      key: 'kind', label: '设备类型',
      column: {
        title: '设备类型', key: 'kind', width: 120,
        filter: {
          options: assetColumnFilterOptions.kind,
          selectedValues: columnFilters.kind ?? [],
          onChange: next => setColumnFilter('kind', next),
          searchPlaceholder: '搜索设备类型',
        },
        render: (_, asset) => (
          <span className="device-kind-cell">
            {kindLabel(asset.kind)}
          </span>
        ),
      },
    },
    {
      key: 'platform', label: '平台',
      column: {
        title: '平台', key: 'platform', width: 135,
        filter: {
          options: assetColumnFilterOptions.platform,
          selectedValues: columnFilters.platform ?? [],
          onChange: next => setColumnFilter('platform', next),
          searchPlaceholder: '搜索平台',
        },
        render: (_, asset) => platformLabel(asset),
      },
    },
    {
      key: 'meta', label: metaTitle,
      column: {
        title: metaTitle, key: 'meta', width: 170,
        filter: page === 'vm' ? {
          options: assetColumnFilterOptions.meta,
          selectedValues: columnFilters.meta ?? [],
          onChange: next => setColumnFilter('meta', next),
          searchPlaceholder: '搜索宿主机',
        } : undefined,
        render: (_, asset) => metaValue(asset),
      },
    },
    {
      key: 'address', label: 'IP',
      column: {
        title: 'IP', dataIndex: 'address', key: 'address', width: 180,
        filter: {
          options: assetColumnFilterOptions.address,
          selectedValues: columnFilters.address ?? [],
          onChange: next => setColumnFilter('address', next),
          searchPlaceholder: '搜索探测状态',
        },
        render: (_, asset) => {
          if (!asset.address) return <span className="mono text-muted-foreground">—</span>
          const dot: 'reachable' | 'unreachable' | 'unprobed' = asset.probeEnabled && asset.lifecycle === 'active'
            && (asset.probeStatus === 'reachable' || asset.probeStatus === 'unreachable')
            ? asset.probeStatus
            : 'unprobed'
          const message = dot === 'reachable'
            ? 'Ping 可达'
            : dot === 'unreachable'
              ? 'Ping 不可达，可能是网络或 ICMP 被阻止'
              : !asset.probeEnabled
                ? '未开启探测'
                : asset.lifecycle !== 'active'
                  ? '资产已退役，探测已暂停'
                  : asset.probeStatus === 'error'
                    ? 'Ping 探测异常'
                    : '等待首次 Ping 探测'
          return (
            <span className="asset-probe-address">
              <Tooltip title={message}>
                <span
                  className="asset-probe-dot-trigger"
                  role="img"
                  tabIndex={0}
                  aria-label={message}
                  onClick={e => e.stopPropagation()}
                >
                  <span aria-hidden="true" className={`asset-probe-dot ${dot}`} />
                </span>
              </Tooltip>
              <span className="mono">{asset.address}</span>
            </span>
          )
        },
      },
    },
    {
      key: 'services', label: '服务',
      column: {
        title: '服务', key: 'services', width: 200,
        filter: {
          options: assetColumnFilterOptions.services,
          selectedValues: columnFilters.services ?? [],
          onChange: next => setColumnFilter('services', next),
          searchPlaceholder: '搜索服务',
        },
        render: (_, asset) => {
          const bound = asset.services ?? []
          if (!bound.length) return '—'
          const service = bound[0]
          const remaining = bound.slice(1).map(item => item.name).join('、')
          return <div className="flex min-w-0 items-center gap-2">
            <button type="button" className="asset-service-chip min-w-0" onClick={() => void openAsset(asset.id)} aria-label={`${service.name}，查看${asset.name}详情`} title={service.name}>
              <ServiceIcon name={service.name} category={service.category || serviceCategory(service.name)} /><span className="truncate">{service.name}</span>
            </button>
            {remaining && <Tooltip title={remaining}><span className="shrink-0 text-muted-foreground" tabIndex={0} aria-label={`另外 ${bound.length - 1} 个服务：${remaining}`}>+{bound.length - 1}</span></Tooltip>}
          </div>
        },
      },
    },
    {
      key: 'team', label: teamColumnLabel,
      column: {
        title: teamColumnLabel, key: 'team', width: 120,
        filter: {
          options: assetColumnFilterOptions.team,
          selectedValues: columnFilters.team ?? [],
          onChange: next => setColumnFilter('team', next),
          searchPlaceholder: page === 'host' || page === 'vm' ? '搜索团队' : '搜索运维团队',
        },
        render: (_, asset) => teamName(asset.teamId),
      },
    },
    {
      key: 'owner', label: '负责人',
      column: {
        title: '负责人', dataIndex: 'owner', key: 'owner', width: 120,
        filter: {
          options: assetColumnFilterOptions.owner,
          selectedValues: columnFilters.owner ?? [],
          onChange: next => setColumnFilter('owner', next),
          searchPlaceholder: '搜索负责人',
        },
        render: value => value || '—',
      },
    },
    {
      key: 'group', label: '项目',
      column: {
        title: '项目', key: 'group', width: 120,
        filter: {
          options: assetColumnFilterOptions.group,
          selectedValues: columnFilters.group ?? [],
          onChange: next => setColumnFilter('group', next),
          searchPlaceholder: '搜索项目',
        },
        render: (_, asset) => groupName(asset.groupId),
      },
    },
    {
      key: 'environment', label: '环境',
      column: {
        title: '环境', dataIndex: 'environment', key: 'environment', width: 100,
        filter: {
          options: assetColumnFilterOptions.environment,
          selectedValues: columnFilters.environment ?? [],
          onChange: next => setColumnFilter('environment', next),
          searchPlaceholder: '搜索环境',
        },
        render: value => value || '—',
      },
    },
    {
      key: 'capacity', label: '配置',
      column: {
        title: '配置', key: 'capacity', width: 195,
        filter: {
          options: assetColumnFilterOptions.capacity,
          selectedValues: columnFilters.capacity ?? [],
          onChange: next => setColumnFilter('capacity', next),
          searchPlaceholder: '搜索配置',
        },
        render: (_, asset) => renderConfigCell(asset),
      },
    },
    {
      key: 'notes', label: '备注',
      column: { title: '备注', dataIndex: 'notes', key: 'notes', width: 200, render: value => value ? <span className="inline-block max-w-[260px] truncate align-bottom" title={String(value)}>{value}</span> : '—' },
    },
    {
      key: 'created', label: '创建时间',
      column: {
        title: '创建时间', dataIndex: 'createdAt', key: 'created', width: 165,
        sorter: (left, right) => (left.createdAt ? Date.parse(left.createdAt) : 0) - (right.createdAt ? Date.parse(right.createdAt) : 0),
        render: value => formatDateTime(value as string | null),
      },
    },
    {
      key: 'updated', label: '更新时间',
      column: {
        title: '更新时间', dataIndex: 'updatedAt', key: 'updated', width: 165,
        sorter: (left, right) => Date.parse(left.updatedAt) - Date.parse(right.updatedAt),
        render: value => value ? new Date(String(value)).toLocaleString('zh-CN', { hour12: false }) : '—',
      },
    },
  ]
  const availableAssetColumns = page === 'network_devices'
    ? assetColumns.filter(item => !['brand', 'model', 'meta', 'platform', 'capacity', 'services', 'notes', 'created'].includes(item.key))
        .sort((a, b) => ['name', 'kind', 'address', 'group', 'team', 'owner', 'environment', 'updated'].indexOf(a.key) - ['name', 'kind', 'address', 'group', 'team', 'owner', 'environment', 'updated'].indexOf(b.key))
    : assetColumns.filter(item =>
        item.key !== 'kind'
        && item.key !== 'owner'
        && item.key !== 'environment'
        && (page === 'host'
          ? item.key !== 'meta' && item.key !== 'platform'
          : item.key !== 'brand' && item.key !== 'model'),
      )
        .sort((a, b) => assetColumnKeys.indexOf(a.key) - assetColumnKeys.indexOf(b.key))
  const visibleAssetColumnKeys = availableAssetColumns
    .filter(item => visibleColumns.includes(item.key))
    .map(item => item.key)
  const canHideAssetColumn = visibleAssetColumnKeys.length > 1
  function toggleAssetColumn(columnId: string, nextVisible: boolean) {
    const next = nextVisible
      ? (visibleAssetColumnKeys.includes(columnId) ? visibleAssetColumnKeys : [...visibleAssetColumnKeys, columnId])
      : visibleAssetColumnKeys.filter(key => key !== columnId)
    if (next.length > 0) updateVisibleColumns(next)
  }
  function hideAssetColumn(columnId: string) {
    if (visibleAssetColumnKeys.length <= 1) return
    toggleAssetColumn(columnId, false)
  }
  const columns: TableColumnsType<Asset> = [
    ...availableAssetColumns
      .filter(item => visibleColumns.includes(item.key))
      .map(item => ({ ...item.column, hideable: canHideAssetColumn })),
    ...(editable ? [{
      title: <span className="sr-only">操作</span>,
      key: 'actions',
      width: 48,
      hideable: false,
      render: (_: unknown, asset: Asset) => (
        <div className="flex justify-end" onClick={event => event.stopPropagation()}>
          <RowActionsMenu
            ariaLabel={`更多操作：${asset.name}`}
            onEdit={() => void openAsset(asset.id, true)}
            extraItems={[
              {
                key: 'detail',
                label: '查看详情',
                onSelect: () => void openAsset(asset.id),
              },
              {
                key: 'bookmark',
                label: bookmarks.includes(asset.id) ? '取消收藏' : '收藏',
                onSelect: () => toggleBookmark(asset.id),
              },
            ]}
          />
        </div>
      ),
    }] : []),
  ]

  const descriptions = selected ? [
    ...(selected.kind === 'host' ? [
      { key: 'brand', label: '品牌', children: selected.brand || '—' },
      { key: 'model', label: '型号', children: selected.model || '—' },
    ] : []),
    ...(!isNetworkKind(selected.kind) ? [{ key: 'platform', label: '平台', children: platformLabel(selected) }] : []),
    { key: 'group', label: isNetworkKind(selected.kind) ? '所属项目' : '项目', children: groupName(selected.groupId) },
    { key: 'team', label: isNetworkKind(selected.kind) ? '运维团队' : '团队', children: teamName(selected.teamId) },
    ...(isNetworkKind(selected.kind) ? [{ key: 'owner', label: '负责人', children: selected.owner || '—' }] : []),
    { key: 'environment', label: '环境', children: selected.environment || '—' },
    { key: 'address', label: '管理地址 / IP', children: <span className="mono">{selected.address || '—'}</span> },
    ...(selected.kind === 'host' || selected.kind === 'vm' ? [
      {
        key: 'capacity', label: '配置',
        children: <span className="tabular-nums">{formatConfigSummary(selected.cpu || 0, selected.memoryMiB || 0, selected.disks ?? []) || '—'}</span>,
      },
      ...((selected.disks ?? []).length > 0 ? [{
        key: 'disks', label: '硬盘明细',
        children: (() => {
          const disks = selected.disks ?? []
          const total = totalDiskGiB(disks)
          const footer = formatDiskTooltipLines(disks).footer || (total > 0 ? `总容量 ${formatDiskGiB(total)}` : '')
          return (
            <div className="flex flex-col gap-1 tabular-nums">
              {disks.map((disk, index) => (
                <div key={index} className="leading-snug">{formatDiskLine(disk)}</div>
              ))}
              {footer && <div className="border-t border-border/60 pt-1 text-xs text-muted-foreground">{footer}</div>}
            </div>
          )
        })(),
      }] : []),
    ] : []),
    ...(selectedLocation ? [{
      key: 'location', label: '数据中心位置',
      children: (
        <div>
          <Button type="link" className="inline-link" onClick={() => showAssetLocation(selectedLocation)}>{locationLabel(selectedLocation)}</Button>
          {selectedLocation.placement.assetId !== selected.id && (
            <div className="muted">随 {byId.get(selectedLocation.placement.assetId)?.name} 定位</div>
          )}
        </div>
      ),
    }] : []),
    ...(selected.services?.length ? [{ key: 'services', label: '运行服务', children: <div className="flex flex-wrap gap-2">{selected.services.map((service, index) => <span key={index} className="asset-service-chip" title={service.name}><ServiceIcon name={service.name} category={service.category || serviceCategory(service.name)} />{service.name}</span>)}</div> }] : []),
    {
      key: 'updated', label: '最近更新',
      children: new Date(selected.updatedAt).toLocaleString('zh-CN', { hour12: false }),
    },
  ] : []

  if (checking) return <div className="app-loading"><Spin size="large" /></div>

  if (!user) {
    return (
      <main className="login-page" data-theme="dark">
        <LoginBackdrop>
          <section className="login-panel" aria-label="登录">
            <Card className="login-card" variant="borderless">
              <div className="login-brand-wrap">
                <div className="login-brand"><Wordmark /></div>
                <p className="login-brand-sub">Data Center Database</p>
              </div>
              {error && <Alert type="error" showIcon message={error} className="login-alert" />}
              <Form layout="vertical" onFinish={login}>
                <Form.Item label="账号" name="username" rules={[{ required: true, message: '请输入账号' }]}>
                  <Input
                    size="large" autoComplete="username" value={loginForm.username}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => setLoginForm(current => ({ ...current, username: event.target.value }))}
                  />
                </Form.Item>
                <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}>
                  <Input.Password
                    size="large" autoComplete="current-password" value={loginForm.password}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => setLoginForm(current => ({ ...current, password: event.target.value }))}
                  />
                </Form.Item>
                <Form.Item label="验证码" required>
                  <div className="captcha-row">
                    <Input
                      size="large" value={captchaCode} maxLength={8} autoComplete="off" placeholder="请输入右侧字符"
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) => setCaptchaCode(event.target.value)}
                    />
                    <button
                      type="button" className="captcha-image-button" title="点击刷新验证码"
                      aria-label="刷新验证码" onClick={() => void loadCaptcha()} disabled={captchaLoading}
                    >
                      {captcha ? <img src={captcha.image} alt="验证码" /> : <span className="captcha-placeholder">加载中</span>}
                    </button>
                    <Button
                      type="text" className="captcha-refresh-btn" icon={<ReloadOutlined />} aria-label="刷新验证码"
                      title="刷新验证码" loading={captchaLoading} onClick={() => void loadCaptcha()}
                    />
                  </div>
                </Form.Item>
                <Button
                  type="primary" htmlType="submit" block size="large" className="login-submit"
                  loading={loginBusy} disabled={captchaLoading || !captcha || !captchaCode.trim()}
                >登录</Button>
              </Form>
            </Card>
          </section>
        </LoginBackdrop>
      </main>
    )
  }

  const firstRun = !assets.length && !facilities.rooms.length && !facilities.racks.length && !subnets.length

  const emptyAssets = assets.length === 0 ? (
    <div className="empty-guide">
      <div className="empty-guide-mark" aria-hidden>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3.5" width="18" height="7" rx="1.5" />
          <rect x="3" y="13.5" width="18" height="7" rx="1.5" />
          <path d="M6.5 7h.01M6.5 17h.01" />
        </svg>
      </div>
      <h2>还没有录入任何资产</h2>
      <p>可以先加一台试试，或用 CSV 批量导入现有台账。</p>
      <Space wrap>
        {editable && <Button type="primary" icon={<PlusOutlined />} onClick={() => startNew()}>新增资产</Button>}
        <Button icon={<DownloadOutlined />} onClick={downloadTemplate}>下载模板</Button>
        {editable && (
          <Upload accept=".csv,text/csv" showUploadList={false}
            beforeUpload={(file: File) => { void previewCSV(file); return false }}>
            <Button icon={<DownloadOutlined />}>导入 CSV</Button>
          </Upload>
        )}
      </Space>
    </div>
  ) : (
    <div className="empty-guide compact">
      <h2>没有匹配的资源</h2>
      <p>试试清空筛选条件，或换个关键词。</p>
      <Button onClick={clearFilters}>清除筛选</Button>
    </div>
  )

  return (
    <Layout className="app-layout">
      <Sider className="app-sider" width={220}>
        <div className="brand">
          <span className="brand-word" onClick={() => goTo('home')}><Wordmark /></span>
        </div>
        <Menu
          className="app-menu" mode="inline" selectedKeys={[page]}
          defaultOpenKeys={['network_group', 'reference', 'system']}
          items={navigation.map(item => 'children' in item
            ? {
                key: item.key, icon: item.icon, label: item.label,
                children: item.children.map(child => ({ key: child.key, icon: child.icon, label: child.label })),
              }
            : { key: item.key, icon: item.icon, label: item.label })}
          onClick={({ key }: { key: string }) => {
            if (key !== 'system' && key !== 'network_group' && key !== 'reference') goTo(key as Page)
          }}
        />
      </Sider>

      <Layout className="app-main">
        <Header className="app-header">
          <div className="app-header-search">
            <GlobalSearch
              onAsset={id => void openAsset(id)}
              onRoom={id => {
                setFacilityRoomId(id)
                setFacilityRackId(null)
                goTo('facilities')
              }}
              onRack={(roomId, rackId) => {
                setFacilityRoomId(roomId)
                setFacilityRackId(rackId)
                goTo('facilities')
              }}
              onIpam={() => goTo('subnets')}
              onIPAddress={() => goTo('ips')}
              onVLAN={() => goTo('vlans')}
            />
          </div>
          <Space size={6} className="app-header-actions">
            <ThemeToggle mode={themeMode} onChange={onThemeModeChange} />
            <Dropdown
              menu={{
                items: [{ key: 'logout', icon: <LogoutOutlined />, label: '退出登录' }],
                onClick: ({ key }: { key: string }) => { if (key === 'logout') void logout() },
              }}
            >
              <Button type="text"><UserOutlined /> {user.username}</Button>
            </Dropdown>
          </Space>
        </Header>

        <Content className="app-content">
          {drawerOpen ? (<>
          <div className="asset-detail-page">
            <div className="detail-page-bar">
              <Button onClick={() => closeDrawer(true)}><ArrowLeftOutlined /> 返回</Button>
              <div className="asset-drawer-title">
                <span>{editor ? (selected ? '编辑资产' : '新增资产') : (selected ? selected.name : '资产详情')}</span>
                {!editor && selected && <Tag>{kindLabel(selected.kind)}</Tag>}
              </div>
            </div>
        {editor ? (
          <AssetEditor
            asset={selected} defaultKind={newKind} busy={saving} error={drawerError} groups={groups} people={people} teams={teams}
            services={registeredServices}
            rooms={facilities.rooms}
            defaultRoomId={typeof roomFilter === 'number' ? roomFilter : undefined}
            mountedRoomId={selectedLocation?.room.id}
            onSave={fields => void saveAsset(fields)}
            onCancel={() => { setEditor(false); if (!selectedId) closeDrawer() }}
          />
        ) : selected ? (
          <>
            <div className="asset-drawer-toolbar">
              <Space wrap>
                <Tag color={probeOf(selected).color}>{probeOf(selected).label}</Tag>
              </Space>
              <Space>
                <Button
                  icon={bookmarks.includes(selected.id) ? <StarFilled /> : <StarOutlined />}
                  onClick={() => toggleBookmark(selected.id)}
                >{bookmarks.includes(selected.id) ? '已收藏' : '收藏'}</Button>
                {editable && <Button type="primary" onClick={() => setEditor(true)}><EditOutlined /> 编辑</Button>}
              </Space>
            </div>
            {drawerError && <Alert type="error" showIcon message={drawerError} className="drawer-alert" />}
            <Tabs
              className="asset-drawer-tabs" activeKey={assetTab} onChange={setAssetTab}
              items={[
                {
                  key: 'overview', label: '概览',
                  children: (
                    <>
                      <Descriptions bordered size="small" column={1} items={descriptions} />
                      {selected.notes && <p className="detail-notes">{selected.notes}</p>}
                    </>
                  ),
                },
                {
                  key: 'relations', label: `资源关系 (${related.length})`,
                  children: (
                    <>
                      {related.length > 0 && (
                        <AssetRelationGraph
                          key={`${selected.id}:${related.map(link => link.id).join('-')}`}
                          asset={selected} links={related} assets={assets} dark={dark}
                          onOpenAsset={id => void openAsset(id)}
                        />
                      )}
                      {editable && relationOptions.length > 0 && <Button size="small" onClick={startRelation}><PlusOutlined /> 添加关系</Button>}
                      {showRelationForm && (
                        <Form layout="inline" className="relation-form" onFinish={() => void updateLink()}>
                          <Form.Item>
                            <Select
                              size="small" style={{ width: 150 }} value={relationChoice} placeholder="关系类型"
                              onChange={value => { setRelationChoice(value); setRelationTarget(0) }}
                              options={relationOptions.map(option => ({ value: option.id, label: option.label }))}
                            />
                          </Form.Item>
                          <Form.Item>
                            <Select
                              size="small" style={{ width: 170 }} value={relationTarget || undefined} placeholder="选择资源"
                              onChange={setRelationTarget}
                              options={targets.map(target => ({ value: target.id, label: target.name }))}
                            />
                          </Form.Item>
                          <Space>
                            <Button type="primary" htmlType="submit" size="small" disabled={saving || !relationTarget}>保存</Button>
                            <Button size="small" onClick={() => setShowRelationForm(false)}>取消</Button>
                          </Space>
                        </Form>
                      )}
                      {related.length === 0 ? <Empty description="暂无关联资源" /> : (
                        <List
                          size="small" dataSource={related}
                          renderItem={link => (
                            <List.Item
                              actions={editable ? [<Button key="remove" type="link" danger onClick={() => void updateLink(link.id)}>解除</Button>] : []}
                            >
                              <Space>
                                <Tag>{relationLabel(link)}</Tag>
                                <Button type="link" onClick={() => void openAsset(relatedId(link))}>{byId.get(relatedId(link))?.name}</Button>
                              </Space>
                            </List.Item>
                          )}
                        />
                      )}
                    </>
                  ),
                },
                {
                  key: 'interfaces', label: '接口',
                  children: <AssetInterfaces assetId={selected.id} assets={assets} editable={editable} />,
                },
                {
                  key: 'changes', label: '变更记录',
                  children: <ChangeList changes={assetChanges} hideAsset />,
                },
              ]}
            />
          </>
        ) : null}
          </div>
          </>) : (<>
          {error && <Alert type="error" showIcon closable message={error} className="page-alert" onClose={() => setError('')} />}

          {page === 'home' && (firstRun ? (
            <div className="first-run">
              <div className="first-run-card">
                <h2>还没有任何数据</h2>
                <p>从录入资产、创建数据中心或管理网络开始。</p>
                <div className="first-run-actions">
                  <Button size="large" icon={<PlusOutlined />} onClick={() => { setPage('host'); startNew('host') }}>先录资产</Button>
                  <Button size="large" icon={<BuildingOutlined />} onClick={() => goTo('facilities')}>先建机房</Button>
                  <Button size="large" icon={<GlobalOutlined />} onClick={() => goTo('subnets')}>先管网络</Button>
                </div>
              </div>
            </div>
          ) : (
            <Dashboard
              assets={assets} subnets={subnets} facilities={facilities} changes={changes}
              bookmarks={bookmarks} rackBookmarks={rackBookmarks} subnetBookmarks={subnetBookmarks}
              onGo={goTo} onOpenAsset={id => void openAsset(id)}
              onOpenRack={openRack} onOpenSubnet={openSubnet} dark={dark}
            />
          ))}

          {page === 'changes' && (
            <Card variant="borderless" title="变更记录"><ChangeList changes={changes} filterable onOpen={id => void openAsset(id)} /></Card>
          )}

          {page === 'services' && (
            <ServiceManager
              editable={editable}
              assets={assets}
              groups={groups}
              onOpenAsset={id => void openAsset(id)}
              onSessionError={e => handleError(e)}
              onChanged={() => { void refreshAssetsAndServices() }}
            />
          )}

          {page === 'groups' && (
            <GroupManager
              editable={editable}
              onSessionError={e => handleError(e)}
              onChanged={setGroups}
            />
          )}

          {(page === 'teams' || page === 'owners') && (
            <OrganizationManager
              key={page}
              kind={page === 'teams' ? 'teams' : 'people'}
              entries={page === 'teams' ? teams : people}
              people={people}
              teams={teams}
              editable={editable}
              canLinkAccount={user?.role === 'admin'}
              loading={busy}
              onRefresh={loadAll}
              onSessionError={handleError}
            />
          )}


          {page === 'users' && (
            <UserManager currentUser={user} onChangePassword={changePassword} onSessionError={handleError} />
          )}

          {page === 'facilities' && (
            <FacilityView
              roomId={facilityRoomId} onRoomChange={setFacilityRoomId}
              openRackId={facilityRackId} onRackChange={setFacilityRackId}
              layout={facilities} assets={assets} links={links} editable={editable}
              focus={facilityFocus} reload={loadAll}
              bookmarkedRacks={rackBookmarks} onToggleRackBookmark={toggleRackBookmark}
              onOpenAsset={id => void openAsset(id)}
              onSessionError={e => handleError(e)}
            />
          )}

          {page === 'subnets' && (() => {
            const activeSubnet = selectedSubnetId ? subnets.find(item => item.id === selectedSubnetId) ?? null : null
            if (activeSubnet) {
              return (
                <SubnetDetailView
                  subnet={activeSubnet}
                  assets={assets} links={links} facilities={facilities} dark={dark}
                  onBack={() => setSelectedSubnetId(null)}
                  onOpenAsset={id => void openAsset(id)} onOpenRoom={openRoom}
                  onOpenIPsForSubnet={id => { setSelectedSubnetId(null); setIpFilterSubnetId(id); goTo('ips') }}
                  onSessionError={e => handleError(e)}
                />
              )
            }
            return (
              <IpamView
                editable={editable}
                facilities={facilities}
                roomFilter={roomFilter} onRoomFilterChange={setRoomFilter}
                openSubnetId={null} onSubnetOpened={() => {}}
                onSelectSubnet={id => setSelectedSubnetId(id)}
                bookmarkedSubnets={subnetBookmarks} onToggleSubnetBookmark={toggleSubnetBookmark}
                onSessionError={e => handleError(e)}
                onChanged={() => void loadAll()}
              />
            )
          })()}

          {page === 'ips' && (
            <IPAddressView
              editable={editable}
              initialSubnetId={ipFilterSubnetId}
              onInitialSubnetConsumed={() => setIpFilterSubnetId(null)}
              assets={assets} links={links} facilities={facilities}
              roomFilter={roomFilter} onRoomFilterChange={setRoomFilter}
              subnets={subnets}
              onOpenAsset={id => void openAsset(id)} onOpenSubnet={openSubnet}
              onSessionError={e => handleError(e)} onChanged={() => void loadAll()}
            />
          )}

          {page === 'vlans' && (selectedVLAN ? (
            <VLANDetailView
              vlan={selectedVLAN} subnets={subnets}
              assets={assets} links={links} facilities={facilities} dark={dark}
              onBack={() => setSelectedVLAN(null)}
              onOpenSubnetDetail={subnet => { setSelectedVLAN(null); openSubnet(subnet.id) }}
              onOpenAsset={id => void openAsset(id)} onOpenRoom={openRoom}
            />
          ) : (
            <VLANView
              editable={editable} facilities={facilities}
              roomFilter={roomFilter} onRoomFilterChange={setRoomFilter}
              onSelectVLAN={vlan => setSelectedVLAN(vlan)}
              onSessionError={e => handleError(e)} onChanged={() => void loadAll()}
            />
          ))}

          {page === 'operators' && (
            <MetadataManager
              kind="operator" title="运营商" editable={editable}
              facilities={facilities}
              roomFilter={roomFilter} onRoomFilterChange={setRoomFilter}
              onSessionError={e => handleError(e)}
            />
          )}

          {assetPage && (() => {
            const pageLabel = page === 'vm' ? '虚拟机' : page === 'network_devices' ? '网络设备' : '服务器'
            return (
            <RoomTreeLayout
              facilities={facilities}
              value={roomFilter}
              onChange={setRoomFilter}
              editable={editable}
              showUnassigned={busy || assetRoomCounts.unassigned !== 0}
              counts={assetRoomCounts}
              onSessionError={e => handleError(e)}
            >
            <Card variant="borderless">
              <PageHeader
                title={pageLabel}
                filters={<Space wrap>
                  <Input
                    size="small" type="search" className="w-[200px]"
                    aria-label={`搜索${pageLabel}`}
                    placeholder={`搜索${pageLabel}`}
                    value={keyword} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setKeyword(event.target.value)}
                  />
                  <DataTableViewOptions
                    align="start"
                    columns={availableAssetColumns.map(item => ({
                      id: item.key,
                      label: item.label,
                      visible: visibleColumns.includes(item.key),
                    }))}
                    onToggle={toggleAssetColumn}
                  />
                  <ClearFiltersButton count={activeFilterCount} onReset={clearAllColumnFilters} />
                </Space>}
                actions={<Space wrap>
                  {editable && <Button size="small" onClick={() => { setAssetImportFile(null); setAssetImportOpen(true) }}><DownloadOutlined /> 导入</Button>}
                  {editable && <Button size="small" type="primary" onClick={() => startNew()}><PlusOutlined /> 新增{pageLabel}</Button>}
                </Space>}
              />
              <BulkActionBar
                count={selectedAssetIds.length}
                unit="条资产"
                onClear={() => setSelectedAssetIds([])}
                onExport={exportSelectedAssetsCSV}
                extraActions={editable ? (
                  <Button size="small" icon={<EditOutlined aria-hidden="true" />} onClick={openBulkEdit}>批量编辑</Button>
                ) : undefined}
              />
              <Table<Asset>
                rowKey="id" columns={columns} dataSource={filtered} loading={busy} size="middle"
                scroll={{ x: 'max-content' }} locale={{ emptyText: emptyAssets }}
                onHideColumn={hideAssetColumn}
                rowClassName={asset => (asset.id === highlightId ? 'row-highlight' : '')}
                onRowClick={(asset, event) => {
                  if ((event.target as HTMLElement).closest('button, a, input, label, [role="checkbox"], [role="menu"], [role="menuitem"]')) return
                  void openAsset(asset.id)
                }}
                sharedStyle={page === 'host' || page === 'vm'}
                rowSelection={{
                  selectedRowKeys: selectedAssetIds,
                  preserveSelectedRowKeys: true,
                  onChange: keys => setSelectedAssetIds(keys.map(Number)),
                  getRowLabel: asset => `选择资产 ${asset.name}`,
                }}
                frame="fixed"
                scrollToRowKey={highlightId}
                scrollResetKey={`${page}:${roomFilter}:${keyword}:${JSON.stringify(columnFilters)}`}
              />
            </Card>
            </RoomTreeLayout>
            )
          })()}
          </>)}
        </Content>
      </Layout>

      <Modal
        open={createOpen} title={isNetworkKind(newKind) ? '新增网络设备' : newKind === 'vm' ? '新增虚拟机' : '新增服务器'} width={620} footer={null} bodyClassName="asset-create-dialog-body"
        onCancel={() => closeCreate()}
      >
        {createOpen && <AssetEditor
          asset={null} defaultKind={newKind} createFromList busy={saving} error={drawerError} groups={groups} people={people} teams={teams}
          services={registeredServices}
          rooms={facilities.rooms} defaultRoomId={typeof roomFilter === 'number' ? roomFilter : undefined}
          onSave={fields => void saveAsset(fields)}
          onCancel={() => closeCreate()}
        />}
      </Modal>

      <Modal
        open={assetImportOpen} title="导入设备" width={460}
        onCancel={() => { if (!previewing) { setAssetImportOpen(false); setAssetImportFile(null) } }}
        footer={(
          <Space wrap>
            <Button icon={<DownloadOutlined />} onClick={downloadTemplate}>下载模板</Button>
            <Button disabled={previewing} onClick={() => { setAssetImportOpen(false); setAssetImportFile(null) }}>取消</Button>
            <Button
              type="primary" disabled={!assetImportFile} loading={previewing}
              onClick={() => {
                if (!assetImportFile) return
                setAssetImportOpen(false)
                void previewCSV(assetImportFile)
              }}
            >下一步</Button>
          </Space>
        )}
      >
        <div className="import-picker">
          <input
            ref={assetImportRef} type="file" accept=".csv,text/csv" hidden
            onChange={event => setAssetImportFile(event.target.files?.[0] ?? null)}
          />
          <Button variant="outline" onClick={() => assetImportRef.current?.click()}>
            {assetImportFile ? '重新选择' : '选择 CSV 文件'}
          </Button>
          {assetImportFile && <span className="import-picker-name" title={assetImportFile.name}>{assetImportFile.name}</span>}
        </div>
      </Modal>

      <Modal
        open={!!importPreview} title="CSV 导入预检" width={940}
        footer={(
          <Space wrap>
            {importPreview?.errors.length ? (
              <Button icon={<DownloadOutlined />} onClick={downloadImportErrors}>下载错误报告</Button>
            ) : null}
            <Button disabled={importing} onClick={() => { setImportPreview(null); setPendingImport(null) }}>取消</Button>
            <Button
              type="primary" loading={importing}
              disabled={!importPreview || importPreview.errors.length > 0 || importPreview.valid === 0}
              onClick={() => { if (pendingImport) void importCSV(pendingImport) }}
            >确认导入 {importPreview?.valid ?? 0} 条</Button>
          </Space>
        )}
        onCancel={() => { if (!importing) { setImportPreview(null); setPendingImport(null) } }}
        destroyOnHidden
      >
        {importPreview && (
          <>
            <Alert
              type={importPreview.errors.length ? 'error' : 'success'} showIcon className="bulk-alert"
              message={importPreview.errors.length
                ? `预检发现 ${importPreview.errors.length} 个问题：共 ${importPreview.rows} 行，可导入 ${importPreview.valid} 行。`
                : `预检通过：共 ${importPreview.rows} 行，可导入 ${importPreview.valid} 行。`}
            />
            <p className="muted">预检不会写入数据；确认后才在一个事务中导入。</p>
            {importPreview.errors.length > 0 && (
              <div className="import-errors">
                {importPreview.errors.slice(0, 20).map((error, index) => (
                  <div key={`${error.row}-${index}`} className="import-error-row">
                    <strong>第 {error.row} 行</strong>
                    <span>{error.message}</span>
                  </div>
                ))}
                {importPreview.errors.length > 20 && (
                  <div className="muted">还有 {importPreview.errors.length - 20} 个问题未显示。</div>
                )}
              </div>
            )}
            {importPreview.sample.length > 0 && (
              <div style={{ '--table-max-height': 'min(360px, 42vh)' } as CSSProperties}>
                <Table
                  rowKey="row" size="small" frame="compact" showFooter={false} dataSource={importPreview.sample}
                  scroll={{ x: 'max-content' }}
                  columns={[
                    { title: '行', dataIndex: 'row', width: 56 },
                    { title: '资源名称', dataIndex: 'name', width: 150 },
                    { title: '类型', dataIndex: 'kind', width: 96, render: value => kindLabel(String(value ?? '')) },
                    { title: '状态', dataIndex: 'status', width: 90, render: value => statuses[value]?.label ?? (value || '—') },
                    { title: '生命周期', dataIndex: 'lifecycle', width: 90, render: value => value === 'retired' ? '已退役' : '在册' },
                    { title: '负责人', dataIndex: 'owner', width: 110, render: value => value || '—' },
                    { title: '地址 / IP', dataIndex: 'address', width: 140, render: value => <span className="mono">{value || '—'}</span> },
                  ]}
                />
              </div>
            )}
            {importPreview.valid > importPreview.sample.length && (
              <p className="muted">样例仅显示前 {importPreview.sample.length} 行可导入数据。</p>
            )}
          </>
        )}
      </Modal>

      <Modal
        open={bulkOpen} title={`批量编辑 ${selectedAssetIds.length} 条资产`}
        footer={null} width={520} destroyOnHidden
        onCancel={() => { if (!bulkSaving) { setBulkOpen(false); setBulkError('') } }}
      >
        {bulkError && <Alert type="error" showIcon message={bulkError} className="bulk-alert" />}
        <Form form={bulkForm} layout="vertical" onFinish={(values: Parameters<typeof saveBulkEdit>[0]) => void saveBulkEdit(values)}>
          <Form.Item label="平台" name="platform" extra="留空表示不修改">
            <Select
              allowClear placeholder="不修改"
              options={[{ value: 'pve', label: 'Proxmox VE' }, { value: 'kvm', label: 'KVM' }, { value: 'esxi', label: 'VMware ESXi' }]}
            />
          </Form.Item>
          <Form.Item label="生命周期" name="lifecycle" extra="留空表示不修改">
            <Select
              allowClear placeholder="不修改"
              options={[{ value: 'active', label: '在册' }, { value: 'retired', label: '已退役' }]}
            />
          </Form.Item>
          {page === 'host' || page === 'vm' ? (
            <>
              <Form.Item label="团队" name="teamId" extra="留空表示不修改">
                <Select
                  allowClear placeholder="不修改"
                  options={[
                    { value: 0, label: '未分配（清空团队）' },
                    ...teams.map(team => ({ value: team.id, label: team.name })),
                  ]}
                />
              </Form.Item>
              {page === 'host' && (
                <>
                  <Form.Item label="品牌" name="brand" extra="留空表示不修改">
                    <Input maxLength={80} placeholder="例如：Dell、华为、浪潮" />
                  </Form.Item>
                  <Form.Item label="型号" name="model" extra="留空表示不修改">
                    <Input maxLength={120} placeholder="例如：PowerEdge R750" />
                  </Form.Item>
                </>
              )}
            </>
          ) : (
            <Form.Item label="负责人" name="owner" extra="留空表示不修改">
              <Input maxLength={512} placeholder="例如：平台组" />
            </Form.Item>
          )}
          <Form.Item label="环境" name="environment" extra="留空表示不修改">
            <Input maxLength={128} placeholder="例如：生产" />
          </Form.Item>
          <div className="bulk-modal-actions">
            <Space>
              <Button type="primary" htmlType="submit" loading={bulkSaving}>保存修改</Button>
              <Button disabled={bulkSaving} onClick={() => setBulkOpen(false)}>取消</Button>
            </Space>
          </div>
        </Form>
      </Modal>


</Layout>
  )
}

