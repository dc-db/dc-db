import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react'
import {
  getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type RowSelectionState, type SortingState, type VisibilityState,
} from '@tanstack/react-table'
import { ExternalLink, Pencil, Plus } from 'lucide-react'
import { api, APIError, type Asset, type Group, type ServiceEntry } from '../api'
import { downloadCSV } from '../csv'
import { formatDateTime } from '../lib/date'
import { serviceCategory } from '../serviceCatalog'
import { DataTable } from './DataTable'
import { PageHeader } from './PageHeader'
import { RowActionsMenu } from './RowActionsMenu'
import { ServiceFormDialog } from './ServiceFormDialog'
import { ServiceIcon } from './ServiceIcon'
import {
  buildFacetedOptions, ClearFiltersButton, DataTableViewOptions, matchesMultiFilter,
} from './TableColumnControls'
import { BulkActionBar, createRowSelectionColumn } from './TableSelectionControls'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from './ui/alert-dialog'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './ui/sheet'

interface Props {
  editable: boolean
  assets: Asset[]
  groups: Group[]
  onOpenAsset: (id: number) => void
  onSessionError: (error: unknown) => void
  onChanged?: () => void
}

const SOURCE_CATALOG = [
  { value: 'builtin', label: '系统内置' },
  { value: 'custom', label: '自定义' },
]

const resolvedCategory = (s: ServiceEntry) => s.category?.trim() || serviceCategory(s.name) || ''
const sourceKey = (s: ServiceEntry) => (s.builtin ? 'builtin' : 'custom')
const sourceLabel = (s: ServiceEntry) => (s.builtin ? '系统内置' : '自定义')

export function ServiceManager({ editable, assets, groups, onOpenAsset, onSessionError, onChanged }: Props) {
  const [services, setServices] = useState<ServiceEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [keyword, setKeyword] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string[]>([])
  const [builtinFilter, setBuiltinFilter] = useState<string[]>([])
  const [projectFilter, setProjectFilter] = useState<string[]>([])
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ServiceEntry | null>(null)
  const [viewing, setViewing] = useState<ServiceEntry | null>(null)
  const [deleting, setDeleting] = useState<ServiceEntry | null>(null)
  const [deletingOne, setDeletingOne] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  const report = useCallback((value: unknown) => {
    if (value instanceof APIError && value.status === 401) { onSessionError(value); return }
    setError(value instanceof Error ? value.message : '操作失败')
  }, [onSessionError])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const next = await api<ServiceEntry[]>('/services')
      setServices(next)
      setViewing(prev => (prev ? next.find(item => item.id === prev.id) ?? null : null))
    } catch (value) { report(value) } finally { setLoading(false) }
  }, [report])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const valid = new Set(services.map(item => String(item.id)))
    setRowSelection(prev => {
      const kept = Object.entries(prev).filter(([id, checked]) => checked && valid.has(id))
      return kept.length === Object.keys(prev).length ? prev : Object.fromEntries(kept)
    })
  }, [services])

  const keywordMatched = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    if (!q) return services
    return services.filter(s => [
      s.name, resolvedCategory(s), s.description,
      ...s.assets.map(a => a.name), ...s.projects.map(p => p.name),
    ].some(v => v.toLowerCase().includes(q)))
  }, [services, keyword])

  const categoryOptions = useMemo(() => buildFacetedOptions({
    items: keywordMatched.filter(s =>
      matchesMultiFilter(builtinFilter, sourceKey(s)) && matchesMultiFilter(projectFilter, s.projects.map(p => p.name)),
    ),
    getEntries: s => resolvedCategory(s) || null,
    includeEmpty: true,
    emptyLabel: '未分类',
    selectedValues: categoryFilter,
  }), [keywordMatched, builtinFilter, projectFilter, categoryFilter])

  const builtinOptions = useMemo(() => buildFacetedOptions({
    items: keywordMatched.filter(s =>
      matchesMultiFilter(categoryFilter, resolvedCategory(s)) && matchesMultiFilter(projectFilter, s.projects.map(p => p.name)),
    ),
    getEntries: sourceKey,
    catalog: SOURCE_CATALOG,
    includeZeroCatalog: true,
    selectedValues: builtinFilter,
  }), [keywordMatched, categoryFilter, projectFilter, builtinFilter])

  const projectOptions = useMemo(() => buildFacetedOptions({
    items: keywordMatched.filter(s =>
      matchesMultiFilter(categoryFilter, resolvedCategory(s)) && matchesMultiFilter(builtinFilter, sourceKey(s)),
    ),
    getEntries: s => s.projects.map(p => p.name),
    includeEmpty: true,
    emptyLabel: '未关联',
    selectedValues: projectFilter,
  }), [keywordMatched, categoryFilter, builtinFilter, projectFilter])

  const visible = useMemo(() => keywordMatched.filter(s =>
    matchesMultiFilter(categoryFilter, resolvedCategory(s))
    && matchesMultiFilter(builtinFilter, sourceKey(s))
    && matchesMultiFilter(projectFilter, s.projects.map(p => p.name)),
  ), [keywordMatched, categoryFilter, builtinFilter, projectFilter])

  const activeFilterCount = categoryFilter.length + builtinFilter.length + projectFilter.length
  const clearFilters = () => { setCategoryFilter([]); setBuiltinFilter([]); setProjectFilter([]) }

  const existingNames = useMemo(
    () => services.filter(s => !editing || s.id !== editing.id).map(s => s.name.trim().toLowerCase()),
    [services, editing],
  )

  const openForm = useCallback((service: ServiceEntry | null) => {
    setEditing(service)
    setFeedback('')
    setFormOpen(true)
  }, [])

  const columns = useMemo<ColumnDef<ServiceEntry>[]>(() => [
    createRowSelectionColumn<ServiceEntry>({
      selectAllLabel: '全选当前页服务',
      getRowLabel: row => `选择服务 ${row.name}`,
    }),
    {
      accessorKey: 'name',
      header: '服务名称',
      sortingFn: (a, b) => a.original.name.localeCompare(b.original.name, 'zh-CN', { numeric: true }),
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-2">
          <ServiceIcon name={row.original.name} category={resolvedCategory(row.original) || undefined} />
          <span className="font-medium">{row.original.name}</span>
        </span>
      ),
    },
    {
      id: 'category',
      accessorFn: row => resolvedCategory(row),
      header: '分类',
      enableSorting: false,
      meta: {
        cellClassName: 'whitespace-nowrap',
        filter: { options: categoryOptions, selectedValues: categoryFilter, onChange: setCategoryFilter, searchPlaceholder: '搜索分类…' },
      },
      cell: ({ row }) => resolvedCategory(row.original) || <span className="text-muted-foreground">—</span>,
    },
    {
      id: 'builtin',
      accessorFn: sourceKey,
      header: '来源',
      enableSorting: false,
      meta: {
        cellClassName: 'whitespace-nowrap',
        filter: { options: builtinOptions, selectedValues: builtinFilter, onChange: setBuiltinFilter, searchPlaceholder: '搜索来源…' },
      },
      cell: ({ row }) => <Badge variant="outline">{sourceLabel(row.original)}</Badge>,
    },
    {
      accessorKey: 'assetCount',
      header: '部署节点',
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => {
        const { assetCount, assets: nodes } = row.original
        if (!assetCount) return <span className="text-muted-foreground">—</span>
        const preview = nodes.slice(0, 2).map(a => a.name).join('、')
        return (
          <span className="inline-flex items-center gap-1.5">
            <Badge variant="secondary" className="tabular-nums">{assetCount}</Badge>
            {preview && <span className="max-w-[180px] truncate text-xs text-muted-foreground">{preview}{nodes.length > 2 ? ` +${nodes.length - 2}` : ''}</span>}
          </span>
        )
      },
    },
    {
      id: 'projects',
      accessorFn: row => row.projects.map(p => p.name).join(', '),
      header: '依赖项目',
      enableSorting: false,
      meta: {
        filter: { options: projectOptions, selectedValues: projectFilter, onChange: setProjectFilter, searchPlaceholder: '搜索项目…' },
      },
      cell: ({ row }) => {
        const list = row.original.projects
        if (!list.length) return <span className="text-muted-foreground">—</span>
        return (
          <div className="flex flex-wrap items-center gap-1">
            {list.slice(0, 2).map(p => <Badge key={p.id} variant="outline">{p.name}</Badge>)}
            {list.length > 2 && <Badge variant="outline" className="tabular-nums">+{list.length - 2}</Badge>}
          </div>
        )
      },
    },
    {
      accessorKey: 'description',
      header: '备注',
      enableSorting: false,
      cell: ({ row }) => row.original.description
        ? <span className="block max-w-[220px] truncate text-muted-foreground" title={row.original.description}>{row.original.description}</span>
        : <span className="text-muted-foreground">—</span>,
    },
    {
      id: 'updatedAt',
      accessorFn: row => (row.updatedAt ? new Date(row.updatedAt).getTime() : undefined),
      header: '最近更新',
      sortUndefined: 'last',
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => <span className="text-xs text-muted-foreground tabular-nums">{formatDateTime(row.original.updatedAt)}</span>,
    },
    ...(editable ? [{
      id: 'actions',
      enableSorting: false,
      enableHiding: false,
      size: 48,
      meta: { headerClassName: 'w-10 text-right', cellClassName: 'w-10 whitespace-nowrap text-right' },
      header: () => <span className="sr-only">操作</span>,
      cell: ({ row }: { row: { original: ServiceEntry } }) => (
        <div className="flex justify-end">
          <RowActionsMenu
            ariaLabel={`服务 ${row.original.name} 操作`}
            onEdit={() => openForm(row.original)}
            onDelete={() => setDeleting(row.original)}
          />
        </div>
      ),
    }] : []),
  ], [editable, categoryOptions, categoryFilter, builtinOptions, builtinFilter, projectOptions, projectFilter, openForm])

  const table = useReactTable({
    data: visible,
    columns,
    state: { sorting, columnVisibility, rowSelection },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    getRowId: row => String(row.id),
    initialState: { pagination: { pageIndex: 0, pageSize: 20 } },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  const selectedServices = useMemo(
    () => services.filter(item => Boolean(rowSelection[String(item.id)])),
    [services, rowSelection],
  )

  function exportSelectedCSV() {
    if (!selectedServices.length) return
    downloadCSV('已选服务.csv', [
      ['服务名称', '分类', '来源', '部署节点数', '部署节点', '依赖项目', '备注', '最近更新'],
      ...selectedServices.map(s => [
        s.name, resolvedCategory(s), sourceLabel(s), s.assetCount,
        s.assets.map(a => a.name).join('、'), s.projects.map(p => p.name).join('、'),
        s.description ?? '', formatDateTime(s.updatedAt),
      ]),
    ])
  }

  async function removeOne(service: ServiceEntry) {
    setDeletingOne(true); setError(''); setFeedback('')
    try {
      await api(`/services/${service.id}`, 'DELETE')
      setDeleting(null)
      if (viewing?.id === service.id) setViewing(null)
      await load()
      setFeedback(`服务「${service.name}」已删除`)
      onChanged?.()
    } catch (value) { report(value) } finally { setDeletingOne(false) }
  }

  async function removeSelected() {
    if (bulkDeleting || deletingOne || !selectedServices.length) return
    const targets = [...selectedServices]
    setBulkDeleting(true); setError(''); setFeedback('')
    const deletedIds: string[] = []
    const failures: string[] = []
    let sessionExpired = false
    try {
      for (const s of targets) {
        try {
          await api(`/services/${s.id}`, 'DELETE')
          deletedIds.push(String(s.id))
        } catch (value) {
          if (value instanceof APIError && value.status === 401) { sessionExpired = true; onSessionError(value); break }
          failures.push(`${s.name}：${value instanceof Error ? value.message : '删除失败'}`)
        }
      }
      if (deletedIds.length) {
        setRowSelection(prev => {
          const next = { ...prev }
          for (const id of deletedIds) delete next[id]
          return next
        })
      }
      if (sessionExpired) return
      if (deletedIds.length) { await load(); onChanged?.() }
      if (failures.length) {
        setError(deletedIds.length
          ? `已删除 ${deletedIds.length} 个服务，${failures.length} 个删除失败：${failures.join('；')}`
          : `删除失败：${failures.join('；')}`)
      } else if (deletedIds.length) {
        setFeedback(`已删除 ${deletedIds.length} 个服务`)
      }
    } finally { setBulkDeleting(false); setBulkDeleteOpen(false) }
  }

  function handleRowClick(service: ServiceEntry, event: MouseEvent<HTMLTableRowElement>) {
    if ((event.target as HTMLElement).closest('button, a, [role="checkbox"], [role="menuitem"], [data-slot="dropdown-menu-content"]')) return
    setViewing(service)
  }

  return <>
    <PageHeader
      title="服务"
      filters={
        <>
          <Input
            className="h-8 w-[240px]"
            placeholder="搜索服务名称、分类、节点或项目"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
          />
          <DataTableViewOptions table={table} align="start" />
          <ClearFiltersButton count={activeFilterCount} onReset={clearFilters} />
        </>
      }
      actions={editable && <Button size="sm" onClick={() => openForm(null)}><Plus />新增服务</Button>}
    />
    {error && <div role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
    {feedback && <div role="status" className="mb-4 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-foreground">{feedback}</div>}
    <DataTable
      table={table}
      loading={loading}
      onRowClick={handleRowClick}
      emptyMessage={keyword || activeFilterCount > 0 ? '没有匹配的服务' : '还没有登记服务，点击右上角「新增服务」选择系统内置服务或自定义添加'}
    />
    <BulkActionBar
      count={selectedServices.length}
      unit="个服务"
      onClear={() => setRowSelection({})}
      onExport={exportSelectedCSV}
      onDelete={editable ? () => setBulkDeleteOpen(true) : undefined}
      deleting={bulkDeleting}
    />
    <ServiceFormDialog
      open={formOpen}
      editing={editing}
      existingNames={existingNames}
      assets={assets}
      groups={groups}
      onOpenChange={setFormOpen}
      onSaved={(saved, isEdit) => {
        void load()
        onChanged?.()
        setFeedback(isEdit ? `服务「${saved.name}」已更新` : `服务「${saved.name}」已添加`)
      }}
    />
    <Sheet open={!!viewing} onOpenChange={next => { if (!next) setViewing(null) }}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        {viewing && <>
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 pr-8">
              <ServiceIcon name={viewing.name} category={resolvedCategory(viewing) || undefined} />
              <span className="truncate">{viewing.name}</span>
            </SheetTitle>
            <SheetDescription className="flex flex-wrap items-center gap-2 pt-1">
              <span>{resolvedCategory(viewing) || '未分类'}</span>
              <Badge variant="outline">{sourceLabel(viewing)}</Badge>
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-5 px-5 py-4 text-sm">
            {editable && (
              <div>
                <Button size="sm" variant="outline" onClick={() => { const target = viewing; setViewing(null); openForm(target) }}>
                  <Pencil className="size-3.5" />编辑
                </Button>
              </div>
            )}
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">备注</div>
              <div className="text-foreground">{viewing.description || <span className="text-muted-foreground">—</span>}</div>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">部署节点 ({viewing.assetCount})</div>
              {viewing.assets.length ? (
                <div className="flex flex-col gap-1.5">
                  {viewing.assets.map(asset => (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => { setViewing(null); onOpenAsset(asset.id) }}
                      className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-left transition-colors hover:bg-accent"
                    >
                      <span className="font-medium">{asset.name}</span>
                      <ExternalLink className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              ) : <div className="text-muted-foreground">暂无部署节点</div>}
            </div>
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">依赖项目 ({viewing.projectCount})</div>
              {viewing.projects.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {viewing.projects.map(project => <Badge key={project.id} variant="outline">{project.name}</Badge>)}
                </div>
              ) : <div className="text-muted-foreground">暂无依赖项目</div>}
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">最近更新：{formatDateTime(viewing.updatedAt)}</div>
          </div>
        </>}
      </SheetContent>
    </Sheet>
    <AlertDialog open={!!deleting} onOpenChange={next => { if (!next && !deletingOne) setDeleting(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除服务「{deleting?.name}」？</AlertDialogTitle>
          <AlertDialogDescription>
            该服务当前关联 {deleting?.assetCount ?? 0} 个部署节点、{deleting?.projectCount ?? 0} 个依赖项目。删除后资产和项目本身会保留，仅解除服务登记与关联。此操作无法撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deletingOne}>取消</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={deletingOne} onClick={e => { e.preventDefault(); if (deleting) void removeOne(deleting) }}>
            {deletingOne ? '删除中…' : '删除'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={bulkDeleteOpen} onOpenChange={next => { if (!bulkDeleting) setBulkDeleteOpen(next) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除选中的 {selectedServices.length} 个服务？</AlertDialogTitle>
          <AlertDialogDescription>资产和项目本身会保留，仅解除服务登记与关联。此操作无法撤销。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={bulkDeleting}>取消</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={bulkDeleting || deletingOne || !selectedServices.length} onClick={e => { e.preventDefault(); void removeSelected() }}>
            {bulkDeleting ? '删除中…' : '删除'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
}
