import { useEffect, useMemo, useState } from 'react'
import {
  getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type SortingState,
} from '@tanstack/react-table'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { api, APIError } from '../api'
import type { Service, ServiceFields } from '../api'
import { Select } from './AppControls'
import { DataTable } from './DataTable'
import { PageHeader } from './PageHeader'
import { ServiceIcon } from './ServiceIcon'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'

interface Props {
  editable: boolean
  hideTitle?: boolean
  onSessionError: (error: unknown) => void
  onChanged?: () => void
}

const emptyService: ServiceFields = { name: '', category: '', defaultPort: 0, description: '' }

export function ServiceManager({ editable, hideTitle, onSessionError, onChanged }: Props) {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [category, setCategory] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Service | null>(null)
  const [deleting, setDeleting] = useState<Service | null>(null)
  const [saving, setSaving] = useState(false)
  const [modalError, setModalError] = useState('')
  const [fields, setFields] = useState<ServiceFields>(emptyService)

  useEffect(() => { void load() }, [])

  function report(value: unknown) {
    if (value instanceof APIError && value.status === 401) { onSessionError(value); return }
    setError(value instanceof Error ? value.message : '操作失败')
  }

  async function load() {
    setLoading(true)
    setError('')
    try { setServices(await api<Service[]>('/services')) }
    catch (value) { report(value) } finally { setLoading(false) }
  }

  const categories = useMemo(() => [...new Set(services.map(item => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN')), [services])
  const visible = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    return services.filter(item =>
      (!category || item.category === category) &&
      (!query || [item.name, item.category, item.description].some(value => value.toLowerCase().includes(query))))
  }, [services, keyword, category])

  function showForm(service: Service | null) {
    setEditing(service)
    setFields(service
      ? { name: service.name, category: service.category, defaultPort: service.defaultPort, description: service.description }
      : emptyService)
    setModalError('')
    setOpen(true)
  }

  async function save() {
    if (!fields.name.trim()) { setModalError('请填写服务名称'); return }
    setSaving(true)
    setModalError('')
    try {
      if (editing) await api<Service>(`/services/${editing.id}`, 'PUT', fields)
      else await api<Service>('/services', 'POST', fields)
      setOpen(false)
      await load()
      onChanged?.()
    } catch (value) {
      if (value instanceof APIError && value.status === 401) { onSessionError(value); return }
      setModalError(value instanceof Error ? value.message : '保存失败')
    } finally { setSaving(false) }
  }

  async function remove(service: Service) {
    setSaving(true)
    try {
      await api(`/services/${service.id}`, 'DELETE')
      setDeleting(null)
      await load()
      onChanged?.()
    } catch (value) {
      if (value instanceof APIError && value.status === 401) { onSessionError(value); return }
      setError(value instanceof Error ? value.message : '删除失败')
    } finally { setSaving(false) }
  }

  const columns = useMemo<ColumnDef<Service>[]>(() => [
    {
      accessorKey: 'name',
      header: '名称',
      sortingFn: (a, b) => a.original.name.localeCompare(b.original.name, 'zh-CN'),
      meta: { headerClassName: 'w-[28%]', cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => (
        <div className="table-name-cell">
          <ServiceIcon name={row.original.name} category={row.original.category} />
          <span className="font-medium">{row.original.name}</span>
        </div>
      ),
    },
    {
      accessorKey: 'category',
      header: '分类',
      sortingFn: (a, b) => a.original.category.localeCompare(b.original.category, 'zh-CN'),
      meta: { headerClassName: 'w-[16%]', cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => row.original.category
        ? <Badge variant="secondary">{row.original.category}</Badge>
        : <span className="text-muted-foreground">—</span>,
    },
    {
      accessorKey: 'description',
      header: '备注',
      enableSorting: false,
      cell: ({ row }) => row.original.description
        ? <span className="text-muted-foreground">{row.original.description}</span>
        : <span className="text-muted-foreground">—</span>,
    },
    ...(editable ? [{
      id: 'actions',
      enableSorting: false,
      meta: { headerClassName: 'w-[88px] text-right', cellClassName: 'w-[88px] whitespace-nowrap text-right' },
      header: () => <div className="text-right">操作</div>,
      cell: ({ row }: { row: { original: Service } }) => (
        <div className="table-row-action flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => showForm(row.original)}><Pencil />编辑</Button>
        </div>
      ),
    }] : []),
  ], [editable])

  const table = useReactTable({
    data: visible,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    initialState: { pagination: { pageIndex: 0, pageSize: 20 } },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  return <>
    <PageHeader
      title={hideTitle ? undefined : '服务'}
      filters={<>
        <Input className="max-w-sm" placeholder="搜索服务名称、分类或备注" value={keyword} onChange={event => setKeyword(event.target.value)} />
        <Select
          style={{ width: 140 }} allowClear searchable={false} placeholder="全部分类"
          value={category || undefined}
          onChange={(value: string | undefined) => setCategory(value ?? '')}
          options={categories.map(item => ({ value: item, label: item }))}
        />
      </>}
      actions={editable && <Button onClick={() => showForm(null)}><Plus />新增服务</Button>}
    />
    {error && <div role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
    <DataTable
      table={table}
      loading={loading}
      emptyMessage={keyword || category ? '没有匹配的服务' : '还没有服务，新增一个开始维护'}
      pagerExtra={
        <span>
          内置开源图标基于 <a href="/licenses/simple-icons.txt" target="_blank" rel="noreferrer">Simple Icons (CC0 1.0)</a>
        </span>
      }
    />
    <Dialog open={open} onOpenChange={next => { if (!saving) setOpen(next) }}><DialogContent>
      <DialogHeader><DialogTitle>{editing ? '编辑服务' : '新增服务'}</DialogTitle></DialogHeader>
      {modalError && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{modalError}</div>}
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save() }}>
        <div className="space-y-2">
          <label htmlFor="service-name" className="text-sm font-medium">服务名称</label>
          <div className="flex items-center gap-2.5">
            <ServiceIcon name={fields.name} category={fields.category} />
            <Input id="service-name" required maxLength={120} placeholder="例如：nginx、postgresql、redis" value={fields.name} onChange={event => setFields({ ...fields, name: event.target.value })} />
          </div>
        </div>
        <div className="space-y-2"><label htmlFor="service-category" className="text-sm font-medium">分类</label><Input id="service-category" maxLength={40} placeholder="例如：Web 服务、数据库、缓存" value={fields.category} onChange={event => setFields({ ...fields, category: event.target.value })} /></div>
        <div className="space-y-2"><label htmlFor="service-description" className="text-sm font-medium">备注</label><Textarea id="service-description" maxLength={200} rows={3} placeholder="可选，一句话说明服务用途" value={fields.description} onChange={event => setFields({ ...fields, description: event.target.value })} /></div>
        <DialogFooter>
          {editing && <Button type="button" variant="destructive" className="mr-auto" disabled={saving} onClick={() => { setOpen(false); setDeleting(editing) }}><Trash2 />删除</Button>}
          <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>取消</Button>
          <Button type="submit" disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
        </DialogFooter>
      </form>
    </DialogContent></Dialog>
    <Dialog open={!!deleting} onOpenChange={next => { if (!next && !saving) setDeleting(null) }}><DialogContent>
      <DialogHeader><DialogTitle>删除服务「{deleting?.name}」？</DialogTitle><DialogDescription>只从服务目录里移除，不影响资产。</DialogDescription></DialogHeader>
      <DialogFooter><Button variant="outline" disabled={saving} onClick={() => setDeleting(null)}>取消</Button><Button variant="destructive" disabled={saving} onClick={() => { if (deleting) void remove(deleting) }}>删除</Button></DialogFooter>
    </DialogContent></Dialog>
  </>
}
