import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Alert, App as UIApp, Button, Card, Checkbox, ConfigProvider, Descriptions,
  Dropdown, Empty, Form, Input, Layout, List, Menu, Modal, Popover, Select,
  Space, Spin, Table, Tabs, Tag, Tooltip, Upload, theme,
} from './components/AppControls'
import type { TableColumnsType } from './components/AppControls'
const zhCN = {}
import {
  Building2 as BuildingOutlined, BookOpen as BookOpenOutlined, Server as CloudServerOutlined,
  Trash2 as DeleteOutlined, Monitor as DesktopOutlined, Download as DownloadOutlined, Pencil as EditOutlined, Globe as GlobalOutlined, History as HistoryOutlined,
  House as HomeOutlined, ArrowLeft as ArrowLeftOutlined, Lock as LockOutlined, LogOut as LogoutOutlined, Moon as MoonOutlined, Plus as PlusOutlined, RefreshCw as ReloadOutlined,
  Settings as SettingOutlined, Star as StarFilled, Star as StarOutlined, Sun as SunOutlined, Users as TeamOutlined, Upload as UploadOutlined, User as UserOutlined,
  Network as NetworkOutlined, Split as SplitOutlined, LocateFixed as LocateFixedOutlined,
} from 'lucide-react'
import { api, apiCSV, APIError } from './api'
import { formatDateTime } from './lib/date'
import { downloadCSV } from './csv'
import type { Asset, AssetFields, Captcha, Change, Group, ImportPreview, Kind, Link, LinkKind, NetworkKind, Subnet, User, VLAN } from './api'
import { assetLocations, assetRoomId, buildRoomCounts, locationLabel, matchesRoomFilter } from './facilities'
import type { AssetLocation, Facilities } from './facilities'
import { isNetworkKind, KIND_LABELS, kindLabel, NETWORK_KINDS } from './kinds'
import type { Page } from './types'
import { AssetEditor } from './components/AssetEditor'
import { RoomTreeLayout, type RoomFilter } from './components/RoomTreeLayout'
import { AssetInterfaces } from './components/AssetInterfaces'
import { AssetRelationGraph } from './components/AssetRelationGraph'
import { ChangeList } from './components/ChangeList'
import { ChangePassword } from './components/ChangePassword'
import { Dashboard } from './components/Dashboard'
import { FacilityView } from './components/FacilityView'
import { GlobalSearch } from './components/GlobalSearch'
import { GroupManager } from './components/GroupManager'
import { GuidePage } from './components/GuidePage'
import { IPAddressView } from './components/IPAddressView'
import { IpamView } from './components/IpamView'
import { LoginBackdrop } from './components/LoginBackdrop'
import {
  AssetKindIcon, GroupClusterIcon, NetworkDeviceIcon, OperatorTowerIcon, OwnerBadgeIcon, ReferenceDataIcon,
} from './components/MetadataIcons'
import { MetadataManager } from './components/MetadataManager'
import { SubnetDetailView, VLANDetailView } from './components/NetworkDetailViews'
import { PageHeader } from './components/PageHeader'
import { ServiceIcon } from './components/ServiceIcon'
import { serviceCategory } from './serviceCatalog'
import { UserManager } from './components/UserManager'
import { ProbeSettings } from './components/ProbeSettings'
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
const defaultPageSize = 10
const defaultAssetColumns = ['name', 'capacity', 'address', 'platform', 'meta', 'services', 'notes']
const defaultHostColumns = ['name', 'capacity', 'address', 'services', 'notes']
const defaultNetworkDeviceColumns = ['name', 'kind', 'address', 'owner']
const assetColumnKeys = ['name', 'capacity', 'kind', 'address', 'platform', 'meta', 'services', 'group', 'owner', 'environment', 'notes', 'created', 'updated']


function platformLabel(asset: Pick<Asset, 'platform'>) {
  return asset.platform === 'pve' ? 'Proxmox VE' : asset.platform === 'kvm' ? 'KVM' : '—'
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

function statusOf(asset: Asset) {
  if (asset.lifecycle === 'retired') return { label: '已退役', color: 'default' }
  return statuses[asset.status] ?? statuses.unknown
}
function messageText(error: unknown) {
  return error instanceof Error ? error.message : '操作失败'
}

const PAGE_KEYS: Page[] = ['home', 'host', 'vm', 'network_devices', 'facilities', 'subnets', 'vlans', 'ips', 'operators', 'changes', 'password', 'groups', 'owners', 'users', 'probe_settings', 'guide']

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

function initialDark() {
  try {
    const saved = localStorage.getItem('dc-db-theme')
    if (saved === 'dark') return true
    if (saved === 'light') return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return false
  }
}

function ThemeToggle({ dark, onToggleTheme, className }: { dark: boolean; onToggleTheme: () => void; className?: string }) {
  return (
    <Tooltip title={dark ? '切换到浅色模式' : '切换到暗色模式'}>
      <Button
        type="text" className={className} onClick={onToggleTheme}
        aria-label={dark ? '切换到浅色模式' : '切换到暗色模式'}
      >
        {dark ? <SunOutlined /> : <MoonOutlined />}
      </Button>
    </Tooltip>
  )
}

export default function App() {
  const [dark, setDark] = useState(initialDark)

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    try {
      localStorage.setItem('dc-db-theme', dark ? 'dark' : 'light')
    } catch {
      // Storage may be unavailable in private browsing.
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#111215' : '#f6f6f4')
  }, [dark])

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: dark ? '#eceef2' : '#1c1c1a',
          borderRadius: 8,
          colorBgContainer: dark ? '#181a1f' : '#ffffff',
          colorBgLayout: dark ? '#111215' : '#f6f6f4',
          colorBgElevated: dark ? '#1f2229' : '#ffffff',
        },
      }}
    >
      <UIApp>
        <Shell dark={dark} onToggleTheme={() => setDark(value => !value)} />
      </UIApp>
    </ConfigProvider>
  )
}

function Shell({ dark, onToggleTheme }: { dark: boolean; onToggleTheme: () => void }) {
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
  const [links, setLinks] = useState<Link[]>([])
  const [changes, setChanges] = useState<Change[]>([])
  const [facilities, setFacilities] = useState<Facilities>({ regions: [], rooms: [], racks: [], placements: [] })
  const [subnets, setSubnets] = useState<Subnet[]>([])

  const [keyword, setKeyword] = useState('')
  const [roomFilter, setRoomFilter] = useState<RoomFilter>('all')
  const [networkKindFilter, setNetworkKindFilter] = useState<'' | NetworkKind>('')
  const [platformFilter, setPlatformFilter] = useState<string | undefined>()
  const [visibleColumns, setVisibleColumns] = useState<string[]>(defaultAssetColumns)
  const [pagination, setPagination] = useState(1)
  const [pageSize, setPageSize] = useState(() => {
    const stored = Number(localStorage.getItem('dc-db-page-size'))
    return [10, 20, 50].includes(stored) ? stored : defaultPageSize
  })
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
  const [owners, setOwners] = useState<string[]>([])
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
    { key: 'password', label: '更改密码', icon: <LockOutlined /> },
    { key: 'guide', label: '使用指南', icon: <BookOpenOutlined /> },
  ]
  if (user?.role === 'admin') {
    systemChildren.splice(1, 0, { key: 'users', label: '用户管理', icon: <TeamOutlined /> }, { key: 'probe_settings', label: '存活探测设置', icon: <SettingOutlined /> })
  }
  const navigation: (NavLeaf | NavGroup)[] = [
    { key: 'home', label: '首页', icon: <HomeOutlined /> },
    { key: 'facilities', label: '机柜', icon: <BuildingOutlined /> },
    { key: 'host', label: '服务器', icon: <CloudServerOutlined /> },
    { key: 'vm', label: '虚拟机', icon: <DesktopOutlined /> },
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
      key: 'reference', label: '基础数据', icon: <ReferenceDataIcon />,
      children: [
        { key: 'groups', label: '群组', icon: <GroupClusterIcon /> },
        { key: 'owners', label: '负责人', icon: <OwnerBadgeIcon /> },
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
  const filtered = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    return scoped.filter(asset => {
      if (!matchesRoomFilter(assetRoomId(asset, locations, byId, links), roomFilter)) return false
      if (page === 'network_devices' && networkKindFilter && asset.kind !== networkKindFilter) return false
      if (page === 'vm' && platformFilter && asset.platform !== platformFilter) return false
      return !query || [asset.name, asset.address, asset.owner, asset.environment, ...(vmRelations.get(asset.id) ?? [])]
        .some(value => value?.toLowerCase().includes(query))
    })
  }, [scoped, byId, links, locations, roomFilter, page, networkKindFilter, platformFilter, keyword, vmRelations])

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
    setPagination(1)
  }, [keyword, roomFilter, networkKindFilter, platformFilter, page])

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
    try {
      localStorage.setItem('dc-db-page-size', String(pageSize))
    } catch {
      // Page size still applies for this session when storage is unavailable.
    }
  }, [pageSize])

  useEffect(() => {
    setSelectedAssetIds([])
  }, [page, keyword, roomFilter, networkKindFilter, platformFilter])

  useEffect(() => {
    if (!assetPage) return
    const fallback = page === 'host' ? defaultHostColumns : page === 'network_devices' ? defaultNetworkDeviceColumns : defaultAssetColumns
    try {
      const key = 'dc-db-columns:' + page + (page === 'host' || page === 'vm' ? ':v6' : '')
      const raw = localStorage.getItem(key)
      const v5 = (page === 'host' || page === 'vm') && !raw ? localStorage.getItem('dc-db-columns:' + page + ':v5') : null
      const v4 = v5 || ((page === 'host' || page === 'vm') && !raw ? localStorage.getItem('dc-db-columns:' + page + ':v4') : null)
      const previous = v4 || ((page === 'host' || page === 'vm') && !raw ? localStorage.getItem('dc-db-columns:' + page + ':v3') || localStorage.getItem('dc-db-columns:' + page + ':v2') : null)
      const legacy = previous || ((page === 'host' || page === 'vm') && !raw ? localStorage.getItem('dc-db-columns:' + page) : null)
      const parsed: unknown = raw || legacy ? JSON.parse((raw || legacy)!) : null
      const valid = Array.isArray(parsed)
        ? parsed.filter((key): key is string => typeof key === 'string').map(key => key === 'status' || key === 'probe' ? 'address' : key).filter(key => assetColumnKeys.includes(key) && (page !== 'host' || key !== 'meta') && ((page !== 'host' && page !== 'vm') || (key !== 'environment' && (!!raw || !!v5 || key !== 'owner') && (!!raw || !!v4 || (key !== 'created' && key !== 'updated')))))
        : []
      if (legacy && valid.length) {
        if (!previous) {
          if (page === 'vm') valid.push('platform')
        }
        if (!v4) valid.push('capacity', 'notes')
        valid.push('services')
        localStorage.setItem(key, JSON.stringify(assetColumnKeys.filter(item => valid.includes(item))))
      }
      setVisibleColumns(valid.length ? assetColumnKeys.filter(key => valid.includes(key)) : fallback)
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
      const [nextAssets, nextLinks, nextChanges, nextFacilities, nextSubnets, nextGroups, nextOwners] = await Promise.all([
        api<Asset[]>('/assets'), api<Link[]>('/links'), api<Change[]>('/changes'),
        api<Facilities>('/facilities'), api<Subnet[]>('/subnets'), api<Group[]>('/groups'),
        api<{ name: string }[]>('/metadata?kind=owner'),
      ])
      setAssets(nextAssets)
      setLinks(nextLinks)
      setChanges(nextChanges)
      setFacilities(nextFacilities)
      setSubnets(nextSubnets)
      setGroups(nextGroups)
      setOwners(nextOwners.map(item => item.name))
    } catch (e) {
      handleError(e)
    } finally {
      setBusy(false)
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
    setNetworkKindFilter('')
    setPlatformFilter(undefined)
    setPagination(1)
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
    setNetworkKindFilter('')
    setPlatformFilter(undefined)
    setPagination(1)
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

  async function openAsset(id: number) {
    setSelectedId(id)
    setAssetChanges([])
    setAssetTab('overview')
    setEditor(false)
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
    setNewKind(kind ?? (page === 'vm' ? 'vm' : page === 'network_devices' ? (networkKindFilter || 'switch') : 'host'))
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

  async function saveBulkEdit(values: { platform?: string; lifecycle?: string; owner?: string; environment?: string }) {
    setBulkSaving(true)
    setBulkError('')
    try {
      const fields: Record<string, string> = {}
      for (const key of ['platform', 'lifecycle', 'owner', 'environment'] as const) {
        const value = values[key]?.trim()
        if (value) fields[key] = value
      }
      if (!Object.keys(fields).length) {
        setBulkError('请至少选择一项要修改的字段')
        return
      }
      const result = await api<{ updated: number }>('/assets/bulk', 'POST', {
        ids: selectedAssetIds, ...fields,
      })
      await loadAll()
      setSelectedAssetIds([])
      setBulkOpen(false)
      void message.success(`已更新 ${result.updated} 条资产`)
    } catch (e) {
      setBulkError(messageText(e))
    } finally {
      setBulkSaving(false)
    }
  }

  function updateVisibleColumns(keys: string[]) {
    if (!keys.length) return
    const ordered = assetColumnKeys.filter(key => keys.includes(key))
    setVisibleColumns(ordered)
    try {
      localStorage.setItem('dc-db-columns:' + page + (page === 'host' || page === 'vm' ? ':v6' : ''), JSON.stringify(ordered))
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

  function exportCSV() {
    const rows: (string | number)[][] = [[
      '资源名称', '类型', '平台', '状态', '生命周期', '地址 / IP', 'CPU', '内存 MiB', '负责人', '环境', '备注', '扩展属性',
    ]]
    for (const asset of filtered) {
      rows.push([
        asset.name, kindLabel(asset.kind), platformLabel(asset), statusOf(asset).label,
        asset.lifecycle === 'retired' ? '已退役' : '在册', asset.address, asset.cpu, asset.memoryMiB,
        asset.owner, asset.environment, asset.notes, JSON.stringify(asset.attributes),
      ])
    }
    downloadCSV('dc-db-assets.csv', rows)
  }

  function downloadTemplate() {
    downloadCSV('dc-db-import-template.csv', [[
      '资源名称', '类型', '平台', '状态', '生命周期', '地址 / IP', 'CPU', '内存 MiB', '负责人', '环境', '备注', '扩展属性',
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

  const groupName = (id: number) => groups.find(item => item.id === id)?.name ?? '—'
  const metaTitle = page === 'vm' ? '宿主机' : '平台'
  const metaValue = (asset: Asset) => page === 'vm' ? hostName(asset) : platformLabel(asset)
  const assetNameLabel = page === 'host' ? '服务器名称' : page === 'vm' ? '虚拟机名称' : '资源名称'
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
      key: 'kind', label: '设备类型',
      column: {
        title: '设备类型', key: 'kind', width: 120,
        sorter: (left, right) => kindLabel(left.kind).localeCompare(kindLabel(right.kind), 'zh-CN'),
        render: (_, asset) => (
          <span className="device-kind-cell">
            <AssetKindIcon kind={asset.kind} />
            {kindLabel(asset.kind)}
          </span>
        ),
      },
    },
    {
      key: 'platform', label: '平台',
      column: { title: '平台', key: 'platform', width: 130, sorter: (left, right) => platformLabel(left).localeCompare(platformLabel(right), 'zh-CN'), render: (_, asset) => platformLabel(asset) },
    },
    {
      key: 'meta', label: metaTitle,
      column: { title: metaTitle, key: 'meta', width: 130, sorter: (left, right) => metaValue(left).localeCompare(metaValue(right), 'zh-CN'), render: (_, asset) => metaValue(asset) },
    },
    {
      key: 'address', label: 'IP / 状态',
      column: {
        title: 'IP / 状态', dataIndex: 'address', key: 'address', width: 170,
        sorter: (left, right) => left.address.localeCompare(right.address, 'zh-CN', { numeric: true }),
        render: (_, asset) => {
          const address = asset.address || '—'
          if (!asset.probeEnabled || !asset.address) return <span className="mono">{address}</span>
          const status = probeOf(asset).label
          const message = status === '可达' ? 'Ping 可达' : status === '不可达' ? 'Ping 不可达，可能是网络或 ICMP 被阻止' : status === '探测异常' ? 'Ping 探测异常' : status === '已停用' ? '资产已退役，探测已暂停' : '等待首次 Ping 探测'
          const dot = asset.lifecycle === 'active' && (asset.probeStatus === 'reachable' || asset.probeStatus === 'unreachable') ? asset.probeStatus : null
          return <Tooltip title={message}><span className="asset-probe-address" role="img" tabIndex={0} aria-label={`${address}，${message}`}><span className="mono">{address}</span>{dot && <span aria-hidden="true" className={`asset-probe-dot ${dot}`} />}</span></Tooltip>
        },
      },
    },
    {
      key: 'services', label: '服务',
      column: {
        title: '服务', key: 'services', width: 200,
        render: (_, asset) => {
          const bound = asset.services ?? []
          if (!bound.length) return '—'
          const service = bound[0]
          const remaining = bound.slice(1).map(item => item.name + (item.port ? `:${item.port}` : '')).join('、')
          return <div className="flex min-w-0 items-center gap-2">
            <button type="button" className="asset-service-chip min-w-0" onClick={() => void openAsset(asset.id)} aria-label={`${service.name}，查看${asset.name}详情`} title={service.name}>
              <ServiceIcon name={service.name} category={serviceCategory(service.name)} /><span className="truncate">{service.name}{service.port ? `:${service.port}` : ''}</span>
            </button>
            {remaining && <Tooltip title={remaining}><span className="shrink-0 text-muted-foreground" tabIndex={0} aria-label={`另外 ${bound.length - 1} 个服务：${remaining}`}>+{bound.length - 1}</span></Tooltip>}
          </div>
        },
      },
    },
    {
      key: 'owner', label: '负责人',
      column: { title: '负责人', dataIndex: 'owner', key: 'owner', width: 120, sorter: (left, right) => left.owner.localeCompare(right.owner, 'zh-CN'), render: value => value || '—' },
    },
    {
      key: 'group', label: '群组',
      column: {
        title: '群组', key: 'group', width: 120,
        sorter: (left, right) => groupName(left.groupId).localeCompare(groupName(right.groupId), 'zh-CN'),
        render: (_, asset) => groupName(asset.groupId),
      },
    },
    {
      key: 'environment', label: '环境',
      column: { title: '环境', dataIndex: 'environment', key: 'environment', width: 100, sorter: (left, right) => left.environment.localeCompare(right.environment, 'zh-CN'), render: value => value || '—' },
    },
    {
      key: 'capacity', label: 'CPU / 内存',
      column: {
        title: 'CPU / 内存', key: 'capacity', width: 140,
        sorter: (left, right) => left.cpu - right.cpu || left.memoryMiB - right.memoryMiB,
        render: (_, asset) => isNetworkKind(asset.kind) ? '—' : `${asset.cpu || 0} 核 / ${asset.memoryMiB ? (asset.memoryMiB / 1024).toFixed(0) + ' GiB' : '—'}`,
      },
    },
    {
      key: 'notes', label: '备注',
      column: { title: '备注', dataIndex: 'notes', key: 'notes', width: 200, render: value => value ? <span className="whitespace-pre-wrap break-words">{value}</span> : '—' },
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
    ? assetColumns.filter(item => !['meta', 'platform', 'capacity', 'services', 'notes', 'created'].includes(item.key))
        .sort((a, b) => ['name', 'kind', 'address', 'group', 'owner', 'environment', 'updated'].indexOf(a.key) - ['name', 'kind', 'address', 'group', 'owner', 'environment', 'updated'].indexOf(b.key))
    : assetColumns.filter(item => item.key !== 'kind' && item.key !== 'environment' && (page !== 'host' || (item.key !== 'meta' && item.key !== 'platform')))
        .sort((a, b) => assetColumnKeys.indexOf(a.key) - assetColumnKeys.indexOf(b.key))
  const columns = availableAssetColumns.filter(item => visibleColumns.includes(item.key)).map(item => item.column)

  const descriptions = selected ? [
    ...(!isNetworkKind(selected.kind) ? [{ key: 'platform', label: '平台', children: platformLabel(selected) }] : []),
    { key: 'owner', label: '负责人', children: selected.owner || '—' },
    { key: 'environment', label: '环境', children: selected.environment || '—' },
    { key: 'address', label: '管理地址 / IP', children: <span className="mono">{selected.address || '—'}</span> },
    ...(selected.kind === 'host' || selected.kind === 'vm' ? [{
      key: 'capacity', label: 'CPU / 内存',
      children: `${selected.cpu || '—'} 核 · ${selected.memoryMiB ? selected.memoryMiB / 1024 + ' GiB' : '—'}`,
    }] : []),
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
    ...(selected.services?.length ? [{ key: 'services', label: '运行服务', children: <div className="flex flex-wrap gap-2">{selected.services.map((service, index) => <span key={index} className="asset-service-chip" title={[service.version && `版本：${service.version}`, service.notes].filter(Boolean).join(" · ") || service.name}><ServiceIcon name={service.name} category={serviceCategory(service.name)} />{service.name}{service.port ? `:${service.port}` : ''}{service.version ? ` · ${service.version}` : ''}</span>)}</div> }] : []),
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
            <Button icon={<UploadOutlined />}>导入 CSV</Button>
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
      <Sider className="app-sider" width={200}>
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
            <ThemeToggle dark={dark} onToggleTheme={onToggleTheme} />
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
            asset={selected} defaultKind={newKind} busy={saving} error={drawerError} groups={groups} owners={owners}
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
                              style={{ width: 150 }} value={relationChoice} placeholder="关系类型"
                              onChange={value => { setRelationChoice(value); setRelationTarget(0) }}
                              options={relationOptions.map(option => ({ value: option.id, label: option.label }))}
                            />
                          </Form.Item>
                          <Form.Item>
                            <Select
                              style={{ width: 170 }} value={relationTarget || undefined} placeholder="选择资源"
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
                  key: 'attributes', label: `扩展信息 (${Object.keys(selected.attributes).length})`,
                  children: Object.keys(selected.attributes).length > 0 ? (
                    <Descriptions
                      bordered size="small" column={1}
                      items={Object.entries(selected.attributes).map(([key, value]) => ({
                        key, label: key, children: typeof value === 'object' ? JSON.stringify(value) : String(value),
                      }))}
                    />
                  ) : <Empty description="暂无扩展信息" />,
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

          {page === 'guide' && (
            <GuidePage
              onGo={goTo}
              onStartAsset={() => { setPage('host'); startNew('host') }}
            />
          )}

          {page === 'home' && (firstRun ? (
            <div className="first-run">
              <div className="first-run-card">
                <h2>还没有任何数据</h2>
                <p>第一次使用？先花两分钟看一遍使用指南，了解三条上手路径。</p>
                <div className="first-run-actions">
                  <Button type="primary" size="large" icon={<BookOpenOutlined />} onClick={() => goTo('guide')}>查看使用指南</Button>
                  <Button size="large" icon={<PlusOutlined />} onClick={() => { setPage('host'); startNew('host') }}>先录资产</Button>
                  <Button size="large" icon={<BuildingOutlined />} onClick={() => goTo('facilities')}>先建机房</Button>
                  <Button size="large" icon={<GlobalOutlined />} onClick={() => goTo('subnets')}>先管网络</Button>
                </div>
                <p className="first-run-hint">「使用指南」里有截图级的操作顺序和常见问题。</p>
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

          {page === 'groups' && (
            <GroupManager
              editable={editable}
              onSessionError={e => handleError(e)}
              onChanged={setGroups}
            />
          )}

          {page === 'owners' && (
            <MetadataManager
              kind="owner" title="负责人" editable={editable}
              onSessionError={e => handleError(e)}
              onChanged={() => { void api<{ name: string }[]>('/metadata?kind=owner').then(list => setOwners(list.map(i => i.name))).catch(() => {}) }}
            />
          )}

          {page === 'probe_settings' && user?.role === 'admin' && <ProbeSettings onSessionError={e => handleError(e)} />}

          {page === 'users' && user?.role === 'admin' && (
            <UserManager currentUsername={user.username} onSessionError={e => handleError(e)} />
          )}

          {page === 'password' && <ChangePassword onSubmit={changePassword} />}

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
            const defaultCols = page === 'host' ? defaultHostColumns : page === 'network_devices' ? defaultNetworkDeviceColumns : defaultAssetColumns
            return (
            <RoomTreeLayout
              facilities={facilities}
              value={roomFilter}
              onChange={setRoomFilter}
              editable={editable}
              unassignedLabel={page === 'vm' ? '未关联机房' : '未上架'}
              counts={assetRoomCounts}
              onSessionError={e => handleError(e)}
            >
            <Card variant="borderless">
              <PageHeader
                title={pageLabel}
                filters={<Space wrap>
                  <Input
                    type="search" className="w-[200px]"
                    aria-label={`搜索${pageLabel}`}
                    placeholder={`搜索${pageLabel}…`}
                    value={keyword} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setKeyword(event.target.value)}
                  />
                  {page === 'network_devices' ? (
                    <Select
                      style={{ width: 135 }} allowClear searchable={false} placeholder="全部类型"
                      value={networkKindFilter || undefined}
                      onChange={(value: NetworkKind | undefined) => setNetworkKindFilter(value ?? '')}
                      options={NETWORK_KINDS.map(kind => ({ value: kind, label: KIND_LABELS[kind] }))}
                    />
                  ) : page === 'vm' ? (
                    <Select
                      style={{ width: 145 }} allowClear searchable={false} placeholder="全部平台" value={platformFilter}
                      onChange={setPlatformFilter}
                      options={[{ value: 'pve', label: 'Proxmox VE' }, { value: 'kvm', label: 'KVM' }]}
                    />
                  ) : null}

                  <Popover
                    trigger="click" placement="bottomRight"
                    content={(
                      <div className="column-options">
                        <Checkbox.Group
                          value={visibleColumns}
                          onChange={(values: string[]) => updateVisibleColumns(values.map(String))}
                        >
                          <Space direction="vertical">
                            {availableAssetColumns.map(item => <Checkbox key={item.key} value={item.key}>{item.label}</Checkbox>)}
                          </Space>
                        </Checkbox.Group>
                        <Button type="link" size="small" onClick={() => updateVisibleColumns(defaultCols)}>恢复默认</Button>
                      </div>
                    )}
                  >
                    <Button size="small" icon={<SettingOutlined />}>列</Button>
                  </Popover>
                </Space>}
                actions={<Space wrap>
                  {editable && <Button onClick={() => { setAssetImportFile(null); setAssetImportOpen(true) }}><DownloadOutlined /> 导入</Button>}
                  <Button disabled={!filtered.length} onClick={exportCSV}><UploadOutlined /> 导出</Button>
                  {editable && <Button type="primary" onClick={() => startNew()}><PlusOutlined /> 新增{pageLabel}</Button>}
                </Space>}
              />
              {editable && page === 'network_devices' && selectedAssetIds.length > 0 && (
                <div className="bulk-bar">
                  <span>已选择 <strong>{selectedAssetIds.length}</strong> 条资产</span>
                  <Space>
                    <Button size="small" type="primary" onClick={openBulkEdit}>批量编辑</Button>
                    <Button size="small" onClick={() => setSelectedAssetIds([])}>取消选择</Button>
                  </Space>
                </div>
              )}
              <Table<Asset>
                rowKey="id" columns={columns} dataSource={filtered} loading={busy} size="middle"
                scroll={{ x: 'max-content' }} locale={{ emptyText: emptyAssets }}
                sortDirections={['ascend', 'descend']}
                showSorterTooltip={{ title: '点击排序' }}
                rowClassName={asset => (asset.id === highlightId ? 'row-highlight' : '')}
                onRowClick={(asset, event) => {
                  if ((event.target as HTMLElement).closest('button, a, input, label, [role="checkbox"]')) return
                  void openAsset(asset.id)
                }}
                sharedStyle={page === 'host' || page === 'vm'}
                rowSelection={editable && page === 'network_devices' ? {
                  selectedRowKeys: selectedAssetIds,
                  preserveSelectedRowKeys: true,
                  onChange: keys => setSelectedAssetIds(keys.map(Number)),
                } : undefined}
                pagination={{
                  current: pagination, pageSize, total: filtered.length, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'],
                  showTotal: total => `共 ${total} 条`,
                  onChange: (page, size) => {
                    if (size !== pageSize) {
                      setPageSize(size)
                      setPagination(1)
                    } else {
                      setPagination(page)
                    }
                  },
                }}
              />
            </Card>
            </RoomTreeLayout>
            )
          })()}
          </>)}
        </Content>
      </Layout>

      <Modal
        open={createOpen} title={isNetworkKind(newKind) ? '新增网络设备' : newKind === 'vm' ? '新增虚拟机' : '新增服务器'} width={760} footer={null}
        onCancel={() => closeCreate()}
      >
        {createOpen && <AssetEditor
          asset={null} defaultKind={newKind} createFromList busy={saving} error={drawerError} groups={groups} owners={owners}
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
              <Table
                rowKey="row" size="small" pagination={false} dataSource={importPreview.sample}
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
              options={[{ value: 'pve', label: 'Proxmox VE' }, { value: 'kvm', label: 'KVM / libvirt' }]}
            />
          </Form.Item>
          <Form.Item label="生命周期" name="lifecycle" extra="留空表示不修改">
            <Select
              allowClear placeholder="不修改"
              options={[{ value: 'active', label: '在册' }, { value: 'retired', label: '已退役' }]}
            />
          </Form.Item>
          <Form.Item label="负责人" name="owner" extra="留空表示不修改">
            <Input maxLength={512} placeholder="例如：平台组" />
          </Form.Item>
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

