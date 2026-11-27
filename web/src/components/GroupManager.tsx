import { useEffect, useMemo, useState } from 'react'
import {
  getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type RowSelectionState, type SortingState, type VisibilityState,
} from '@tanstack/react-table'
import { Plus, Trash2 } from 'lucide-react'
import { api, APIError } from '../api'
import type { Group, GroupFields } from '../api'
import { downloadCSV } from '../csv'
import { DataTable } from './DataTable'
import { PageHeader } from './PageHeader'
import { RowActionsMenu } from './RowActionsMenu'
import { DataTableViewOptions } from './TableColumnControls'
import { BulkActionBar, createRowSelectionColumn } from './TableSelectionControls'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from './ui/alert-dialog'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'

interface Props {
  editable: boolean
  hideTitle?: boolean
  onSessionError: (error: unknown) => void
  onChanged?: (groups: Group[]) => void
}

export function GroupManager({ editable, hideTitle, onSessionError, onChanged }: Props) {
  const [groups, setGroups] = useState<Group[]>([])
  const [keyword, setKeyword] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Group | null>(null)
  const [deleting, setDeleting] = useState<Group | null>(null)
  const [saving, setSaving] = useState(false)
  const [modalError, setModalError] = useState('')
  const [fields, setFields] = useState<GroupFields>({ name: '', description: '' })

  useEffect(() => { void load() }, [])

  useEffect(() => {
    setRowSelection(prev => {
      const valid = new Set(groups.map(item => String(item.id)))
      const kept = Object.entries(prev).filter(([id, checked]) => checked && valid.has(id))
      return kept.length === Object.keys(prev).length ? prev : Object.fromEntries(kept)
    })
  }, [groups])

  const selectedGroups = useMemo(
    () => groups.filter(item => Boolean(rowSelection[String(item.id)])),
    [groups, rowSelection],
  )

  function report(value: unknown) {
    if (value instanceof APIError && value.status === 401) { onSessionError(value); return }
    setError(value instanceof Error ? value.message : '操作失败')
  }

  async function load() {
    setLoading(true)
    setError('')
    try {
      const next = await api<Group[]>('/groups')
      setGroups(next)
      onChanged?.(next)
    } catch (value) { report(value) } finally { setLoading(false) }
  }

  function showForm(group: Group | null) {
    setEditing(group)
    setFields({ name: group?.name ?? '', description: group?.description ?? '' })
    setModalError('')
    setOpen(true)
  }

  async function save() {
    if (!fields.name.trim()) { setModalError('请填写项目名称'); return }
    setSaving(true)
    setModalError('')
    try {
      if (editing) await api<Group>(`/groups/${editing.id}`, 'PUT', fields)
      else await api<Group>('/groups', 'POST', fields)
      setOpen(false)
      await load()
    } catch (value) {
      if (value instanceof APIError && value.status === 401) { onSessionError(value); return }
      setModalError(value instanceof Error ? value.message : '保存失败')
    } finally { setSaving(false) }
  }

  async function remove(group: Group) {
    setSaving(true)
    try {
      await api(`/groups/${group.id}`, 'DELETE')
      setDeleting(null)
      await load()
    } catch (value) {
      if (value instanceof APIError && value.status === 401) { onSessionError(value); return }
      setError(value instanceof Error ? value.message : '删除失败')
    } finally { setSaving(false) }
  }

  function exportSelectedGroupsCSV() {
    if (selectedGroups.length === 0) return
    downloadCSV('dc-db-groups.csv', [
      ['项目名称', '关联资产', '备注'],
      ...selectedGroups.map(group => [group.name, group.assetCount, group.description ?? '']),
    ])
  }

  async function removeSelected() {
    if (bulkDeleting || saving || selectedGroups.length === 0) return
    const targets = [...selectedGroups]
    setBulkDeleting(true)
    setError('')
    const deletedIds: string[] = []
    const failures: string[] = []
    let sessionExpired = false
    try {
      for (const group of targets) {
        try {
          await api(`/groups/${group.id}`, 'DELETE')
          deletedIds.push(String(group.id))
        } catch (value) {
          if (value instanceof APIError && value.status === 401) {
            sessionExpired = true
            onSessionError(value)
            break
          }
          failures.push(`${group.name}：${value instanceof Error ? value.message : '删除失败'}`)
        }
      }
      if (deletedIds.length > 0) {
        setRowSelection(prev => {
          const next = { ...prev }
          for (const id of deletedIds) delete next[id]
          return next
        })
      }
      if (sessionExpired) return
      if (deletedIds.length > 0) {
        await load()
      }
      if (failures.length > 0) {
        setError(
          deletedIds.length > 0
            ? `已删除 ${deletedIds.length} 个项目，${failures.length} 个删除失败：${failures.join('；')}`
            : `删除失败：${failures.join('；')}`,
        )
      }
    } finally {
      setBulkDeleting(false)
      setBulkDeleteOpen(false)
    }
  }

  const columns = useMemo<ColumnDef<Group>[]>(() => [
    createRowSelectionColumn<Group>({
      getRowLabel: row => `选择项目 ${row.name}`,
    }),
    {
      accessorKey: 'name',
      header: '名称',
      sortingFn: (a, b) => a.original.name.localeCompare(b.original.name, 'zh-CN'),
      meta: { headerClassName: 'w-[28%]', cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: 'assetCount',
      header: '关联资产',
      meta: { headerClassName: 'w-[16%]', cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => (
        <Badge variant={row.original.assetCount ? 'secondary' : 'outline'} className="tabular-nums">
          {row.original.assetCount}
        </Badge>
      ),
    },
    {
      accessorKey: 'description',
      header: '备注',
      sortingFn: (a, b) => (a.original.description ?? '').localeCompare(b.original.description ?? '', 'zh-CN'),
      cell: ({ row }) => row.original.description
        ? <span className="text-muted-foreground">{row.original.description}</span>
        : <span className="text-muted-foreground">—</span>,
    },
    ...(editable ? [{
      id: 'actions',
      enableSorting: false,
      enableHiding: false,
      size: 48,
      meta: { headerClassName: 'w-10 text-right', cellClassName: 'w-10 whitespace-nowrap text-right' },
      header: () => <span className="sr-only">操作</span>,
      cell: ({ row }: { row: { original: Group } }) => (
        <div className="flex justify-end">
          <RowActionsMenu
            ariaLabel={`项目 ${row.original.name} 操作`}
            onEdit={() => showForm(row.original)}
            onDelete={() => setDeleting(row.original)}
          />
        </div>
      ),
    }] : []),
  ], [editable])

  const visible = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    return query ? groups.filter(item => [item.name, item.description].some(value => value.toLowerCase().includes(query))) : groups
  }, [groups, keyword])

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

  return <>
    <PageHeader
      title={hideTitle ? undefined : '项目'}
      filters={
        <>
          <Input className="h-8 w-[240px]" placeholder="搜索项目名称或备注" value={keyword} onChange={event => setKeyword(event.target.value)} />
          <DataTableViewOptions table={table} align="start" />
        </>
      }
      actions={editable && <Button size="sm" onClick={() => showForm(null)}><Plus />新增项目</Button>}
    />
    {error && <div role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
    <DataTable
      table={table}
      loading={loading}
      emptyMessage={keyword ? '没有匹配的项目' : '暂无项目'}
    />
    <BulkActionBar
      count={selectedGroups.length}
      unit="个项目"
      onClear={() => setRowSelection({})}
      onExport={exportSelectedGroupsCSV}
      onDelete={editable ? () => setBulkDeleteOpen(true) : undefined}
      deleting={bulkDeleting}
    />
    <Dialog open={open} onOpenChange={next => { if (!saving) setOpen(next) }}><DialogContent>
      <DialogHeader><DialogTitle>{editing ? '编辑项目' : '新增项目'}</DialogTitle></DialogHeader>
      {modalError && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{modalError}</div>}
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save() }}>
        <div className="space-y-2"><label htmlFor="group-name" className="text-sm font-medium">项目名称</label><Input id="group-name" required maxLength={80} placeholder="例如：订单平台、办公系统" value={fields.name} onChange={event => setFields({ ...fields, name: event.target.value })} /></div>
        <div className="space-y-2"><label htmlFor="group-description" className="text-sm font-medium">备注</label><Textarea id="group-description" maxLength={200} rows={3} placeholder="可选，备注这个项目包含什么" value={fields.description} onChange={event => setFields({ ...fields, description: event.target.value })} /></div>
        <DialogFooter>
          {editing && <Button type="button" variant="destructive" className="mr-auto" disabled={saving} onClick={() => { setOpen(false); setDeleting(editing) }}><Trash2 />删除</Button>}
          <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>取消</Button>
          <Button type="submit" disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
        </DialogFooter>
      </form>
    </DialogContent></Dialog>
    <Dialog open={!!deleting} onOpenChange={next => { if (!next && !saving) setDeleting(null) }}><DialogContent>
      <DialogHeader><DialogTitle>删除项目「{deleting?.name}」？</DialogTitle><DialogDescription>项目内资产会保留，只是不再归属这个项目。</DialogDescription></DialogHeader>
      <DialogFooter><Button variant="outline" disabled={saving} onClick={() => setDeleting(null)}>取消</Button><Button variant="destructive" disabled={saving} onClick={() => { if (deleting) void remove(deleting) }}>删除</Button></DialogFooter>
    </DialogContent></Dialog>
    <AlertDialog open={bulkDeleteOpen} onOpenChange={next => { if (!bulkDeleting) setBulkDeleteOpen(next) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除选中的 {selectedGroups.length} 个项目？</AlertDialogTitle>
          <AlertDialogDescription>项目内资产会保留，只是不再归属这些项目。此操作无法撤销。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={bulkDeleting}>取消</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={bulkDeleting || saving || selectedGroups.length === 0}
            onClick={event => {
              event.preventDefault()
              void removeSelected()
            }}
          >
            {bulkDeleting ? '删除中…' : '删除'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
}
