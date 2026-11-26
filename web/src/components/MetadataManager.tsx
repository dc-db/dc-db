import { OptionSelect } from './OptionSelect'
import { useEffect, useMemo, useState } from 'react'
import {
  getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type SortingState,
} from '@tanstack/react-table'
import { Plus, Trash2 } from 'lucide-react'
import { api, APIError } from '../api'
import type { MetadataEntry, MetadataFields } from '../api'
import { buildRoomCounts, matchesRoomFilter } from '../facilities'
import type { Facilities } from '../facilities'
import { DataTable } from './DataTable'
import { PageHeader } from './PageHeader'
import { RowActionsMenu } from './RowActionsMenu'
import { RoomTreeLayout, type RoomFilter } from './RoomTreeLayout'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'


interface Props {
  kind: string
  title: string
  hideTitle?: boolean
  editable: boolean
  facilities?: Facilities
  roomFilter?: RoomFilter
  onRoomFilterChange?: (next: RoomFilter) => void
  onSessionError: (error: unknown) => void
  onChanged?: () => void
}

// Generic dictionary category (负责人, 运营商, …): name plus an optional note.
export function MetadataManager({ kind, title, hideTitle, editable, facilities, roomFilter, onRoomFilterChange, onSessionError, onChanged }: Props) {
  const [entries, setEntries] = useState<MetadataEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<MetadataEntry | null>(null)
  const [deleting, setDeleting] = useState<MetadataEntry | null>(null)
  const [saving, setSaving] = useState(false)
  const [modalError, setModalError] = useState('')
  const [fields, setFields] = useState<{ name: string; description: string; roomId?: number }>({ name: '', description: '' })
  const withRoomTree = !!(facilities && roomFilter !== undefined && onRoomFilterChange)

  useEffect(() => {
    setKeyword('')
    setSorting([])
    void load()
  }, [kind])

  function report(value: unknown) {
    if (value instanceof APIError && value.status === 401) { onSessionError(value); return }
    setError(value instanceof Error ? value.message : '操作失败')
  }

  async function load() {
    setLoading(true)
    setError('')
    try { setEntries(await api<MetadataEntry[]>(`/metadata?kind=${kind}`)) }
    catch (value) { report(value) } finally { setLoading(false) }
  }

  const roomCounts = useMemo(
    () => (withRoomTree ? buildRoomCounts(entries, item => item.roomId || null) : undefined),
    [entries, withRoomTree],
  )

  const visible = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    return entries.filter(item => {
      if (withRoomTree && roomFilter !== undefined && !matchesRoomFilter(item.roomId || null, roomFilter)) return false
      return !query || [item.name, item.description, item.roomName].some(value => value?.toLowerCase().includes(query))
    })
  }, [entries, keyword, roomFilter, withRoomTree])

  function showForm(entry: MetadataEntry | null) {
    setEditing(entry)
    setFields({
      name: entry?.name ?? '',
      description: entry?.description ?? '',
      roomId: entry ? (entry.roomId || undefined) : (withRoomTree && typeof roomFilter === 'number' ? roomFilter : undefined),
    })
    setModalError('')
    setOpen(true)
  }

  async function save() {
    if (!fields.name.trim()) { setModalError('请填写名称'); return }
    setSaving(true)
    setModalError('')
    const body: MetadataFields = {
      kind,
      name: fields.name,
      description: fields.description,
      roomId: withRoomTree ? (fields.roomId ?? 0) : 0,
    }
    try {
      if (editing) await api<MetadataEntry>(`/metadata/${editing.id}`, 'PUT', body)
      else await api<MetadataEntry>('/metadata', 'POST', body)
      setOpen(false)
      await load()
      onChanged?.()
    } catch (value) {
      if (value instanceof APIError && value.status === 401) { onSessionError(value); return }
      setModalError(value instanceof Error ? value.message : '保存失败')
    } finally { setSaving(false) }
  }

  async function remove(entry: MetadataEntry) {
    setSaving(true)
    try {
      await api(`/metadata/${entry.id}`, 'DELETE')
      setDeleting(null)
      await load()
      onChanged?.()
    } catch (value) {
      if (value instanceof APIError && value.status === 401) { onSessionError(value); return }
      setError(value instanceof Error ? value.message : '删除失败')
    } finally { setSaving(false) }
  }

  const columns = useMemo<ColumnDef<MetadataEntry>[]>(() => [
    {
      accessorKey: 'name',
      header: '名称',
      sortingFn: (a, b) => a.original.name.localeCompare(b.original.name, 'zh-CN'),
      meta: { headerClassName: 'w-[28%]', cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    ...(withRoomTree ? [{
      accessorKey: 'roomName',
      header: '所属数据中心',
      enableSorting: false,
      meta: { headerClassName: 'w-[18%]', cellClassName: 'whitespace-nowrap' },
      cell: ({ row }: { row: { original: MetadataEntry } }) => row.original.roomName || <span className="text-muted-foreground">—</span>,
    }] : []),
    {
      accessorKey: 'assetCount',
      header: '关联资产',
      meta: { headerClassName: 'w-[16%]', cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => {
        const count = row.original.assetCount ?? 0
        return <Badge variant={count ? 'secondary' : 'outline'} className="tabular-nums">{count}</Badge>
      },
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
      size: 48,
      meta: { headerClassName: 'w-10 text-right', cellClassName: 'w-10 whitespace-nowrap text-right' },
      header: () => <span className="sr-only">操作</span>,
      cell: ({ row }: { row: { original: MetadataEntry } }) => (
        <div className="flex justify-end">
          <RowActionsMenu
            ariaLabel={`${title} ${row.original.name} 操作`}
            onEdit={() => showForm(row.original)}
            onDelete={() => setDeleting(row.original)}
          />
        </div>
      ),
    }] : []),
  ], [editable, kind, title, withRoomTree])

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

  const content = (
    <>
      <PageHeader
        title={hideTitle ? undefined : title}
        filters={<Input className="h-8 w-[240px]" placeholder={`搜索${title}名称或备注`} value={keyword} onChange={event => setKeyword(event.target.value)} />}
        actions={editable && <Button size="sm" onClick={() => showForm(null)}><Plus />新增{title}</Button>}
      />
      {error && <div role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      <DataTable
        table={table}
        loading={loading}
        emptyMessage={keyword || (withRoomTree && roomFilter !== 'all') ? `没有匹配的${title}` : `还没有${title}，新增一个开始归类`}
      />
      <Dialog open={open} onOpenChange={next => { if (!saving) setOpen(next) }}><DialogContent>
        <DialogHeader><DialogTitle>{editing ? `编辑${title}` : `新增${title}`}</DialogTitle></DialogHeader>
        {modalError && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{modalError}</div>}
        <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save() }}>
          <div className="space-y-2"><label htmlFor="metadata-name" className="text-sm font-medium">名称</label><Input id="metadata-name" required maxLength={80} value={fields.name} onChange={event => setFields({ ...fields, name: event.target.value })} /></div>
          {withRoomTree && facilities && (
            <div className="space-y-2">
              <label htmlFor="metadata-room" className="text-sm font-medium">所属数据中心</label>
              <OptionSelect id="metadata-room" className="w-full" value={String(fields.roomId ?? '')} onChange={value => setFields({ ...fields, roomId: value ? Number(value) : undefined })} options={[{ value: '', label: '可选' }, ...facilities.rooms.map(room => ({ value: String(room.id), label: room.name }))]} />
            </div>
          )}
          <div className="space-y-2"><label htmlFor="metadata-description" className="text-sm font-medium">备注</label><Textarea id="metadata-description" maxLength={200} rows={3} placeholder="可选" value={fields.description} onChange={event => setFields({ ...fields, description: event.target.value })} /></div>
          <DialogFooter>
            {editing && <Button type="button" variant="destructive" className="mr-auto" disabled={saving} onClick={() => { setOpen(false); setDeleting(editing) }}><Trash2 />删除</Button>}
            <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>取消</Button>
            <Button type="submit" disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
          </DialogFooter>
        </form>
      </DialogContent></Dialog>
      <Dialog open={!!deleting} onOpenChange={next => { if (!next && !saving) setDeleting(null) }}><DialogContent>
        <DialogHeader><DialogTitle>删除「{deleting?.name}」？</DialogTitle><DialogDescription>只从参考数据里移除，不影响资产。</DialogDescription></DialogHeader>
        <DialogFooter><Button variant="outline" disabled={saving} onClick={() => setDeleting(null)}>取消</Button><Button variant="destructive" disabled={saving} onClick={() => { if (deleting) void remove(deleting) }}>删除</Button></DialogFooter>
      </DialogContent></Dialog>
    </>
  )

  if (withRoomTree && facilities && roomFilter !== undefined && onRoomFilterChange) {
    return (
      <RoomTreeLayout
        facilities={facilities}
        value={roomFilter}
        onChange={onRoomFilterChange}
        editable={editable}
        counts={roomCounts}
        onSessionError={onSessionError}
      >
        {content}
      </RoomTreeLayout>
    )
  }

  return content
}
