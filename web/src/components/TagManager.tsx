import { useEffect, useMemo, useState } from 'react'
import { flexRender, getCoreRowModel, getPaginationRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table'
import { Pencil, Plus, Tags, Trash2 } from 'lucide-react'
import { api, APIError } from '../api'
import type { Tag as TagItem, TagFields } from '../api'
import { Button } from './ui/button'
import { PageHeader } from './PageHeader'
import { TablePager } from './TablePager'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { Select } from './AppControls'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'

interface Props {
  editable: boolean
  hideTitle?: boolean
  onSessionError: (error: unknown) => void
  onChanged?: (tags: TagItem[]) => void
}

const colorPresets = [
  { value: '#1677ff', label: '蓝色' }, { value: '#52c41a', label: '绿色' },
  { value: '#faad14', label: '橙色' }, { value: '#f5222d', label: '红色' },
  { value: '#eb2f96', label: '粉色' }, { value: '#722ed1', label: '紫色' },
  { value: '#13c2c2', label: '青色' }, { value: '#8c8c8c', label: '灰色' },
]
const selectClass = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring'

function readableTextColor(color: string) {
  if (!/^#[\da-f]{6}$/i.test(color)) return '#000000'
  const channels = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16) / 255)
  const [r, g, b] = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.179 ? '#000000' : '#ffffff'
}

export function TagManager({ editable, hideTitle, onSessionError, onChanged }: Props) {
  const [tags, setTags] = useState<TagItem[]>([])
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<TagItem | null>(null)
  const [deleting, setDeleting] = useState<TagItem | null>(null)
  const [saving, setSaving] = useState(false)
  const [modalError, setModalError] = useState('')
  const [fields, setFields] = useState<TagFields>({ name: '', color: '#1677ff', description: '' })

  useEffect(() => { void load() }, [])

  function report(value: unknown) {
    if (value instanceof APIError && value.status === 401) { onSessionError(value); return }
    setError(value instanceof Error ? value.message : '操作失败')
  }

  async function load() {
    setLoading(true)
    setError('')
    try {
      const next = await api<TagItem[]>('/tags')
      setTags(next)
      onChanged?.(next)
    } catch (value) { report(value) } finally { setLoading(false) }
  }

  function showForm(tag: TagItem | null) {
    setEditing(tag)
    setModalError('')
    setFields(tag ? { name: tag.name, color: tag.color, description: tag.description } : { name: '', color: '#1677ff', description: '' })
    setOpen(true)
  }

  async function save() {
    if (!fields.name.trim()) { setModalError('请输入标签名称'); return }
    setSaving(true)
    setModalError('')
    try {
      if (editing) await api(`/tags/${editing.id}`, 'PUT', fields)
      else await api('/tags', 'POST', fields)
      setOpen(false)
      await load()
    } catch (value) {
      if (value instanceof APIError && value.status === 401) onSessionError(value)
      else setModalError(value instanceof Error ? value.message : '保存失败')
    } finally { setSaving(false) }
  }

  async function remove(tag: TagItem) {
    setSaving(true)
    try { await api(`/tags/${tag.id}`, 'DELETE'); setDeleting(null); await load() }
    catch (value) { setDeleting(null); report(value) }
    finally { setSaving(false) }
  }

  const columns: ColumnDef<TagItem>[] = [
    { accessorKey: 'name', header: '标签', cell: ({ row }) => <span className="inline-flex rounded-md px-2 py-1 text-xs font-medium" style={{ backgroundColor: row.original.color, color: readableTextColor(row.original.color) }}>{row.original.name}</span> },
    { accessorKey: 'assetCount', header: '关联资产', cell: ({ row }) => row.original.assetCount || '0' },
    { accessorKey: 'description', header: '备注', cell: ({ row }) => row.original.description || '—' },
    ...(editable ? [{ id: 'actions', header: () => <div className="text-right">操作</div>, cell: ({ row }: { row: { original: TagItem } }) => <div className="flex gap-1"><Button variant="ghost" size="sm" onClick={() => showForm(row.original)}><Pencil />编辑</Button><Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleting(row.original)}><Trash2 />删除</Button></div> }] : []),
  ]
  const visible = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    return query ? tags.filter(item => [item.name, item.description].some(value => value.toLowerCase().includes(query))) : tags
  }, [tags, keyword])
  const table = useReactTable({ data: visible, columns, initialState: { pagination: { pageIndex: 0, pageSize: 20 } }, getCoreRowModel: getCoreRowModel(), getPaginationRowModel: getPaginationRowModel() })

  return <>
    <PageHeader
      title={hideTitle ? undefined : '标签'}
      filters={<Input className="max-w-sm" placeholder="搜索标签名称或备注" value={keyword} onChange={event => setKeyword(event.target.value)} />}
      actions={editable && <Button onClick={() => showForm(null)}><Plus />新增标签</Button>}
    />
    {error && <div role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      <Table><TableHeader>{table.getHeaderGroups().map(group => <TableRow key={group.id}>{group.headers.map(header => <TableHead key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</TableHead>)}</TableRow>)}</TableHeader>
        <TableBody>{loading ? <TableRow><TableCell colSpan={columns.length}>加载中...</TableCell></TableRow> : table.getRowModel().rows.length ? table.getRowModel().rows.map(row => <TableRow key={row.id}>{row.getVisibleCells().map(cell => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>) : <TableRow><TableCell colSpan={columns.length} className="py-8 text-center text-muted-foreground">还没有标签，创建一个用于分组和筛选资产</TableCell></TableRow>}</TableBody>
    </Table>
      <TablePager table={table} />
    <Dialog open={open} onOpenChange={next => { if (!saving) setOpen(next) }}><DialogContent><DialogHeader><DialogTitle>{editing ? '编辑标签' : '新增标签'}</DialogTitle></DialogHeader>
      {modalError && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{modalError}</div>}
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save() }}>
        <div className="space-y-2"><label htmlFor="tag-name" className="text-sm font-medium">标签名称</label><Input id="tag-name" required maxLength={80} placeholder="例如：生产、核心业务、待迁移" value={fields.name} onChange={event => setFields({ ...fields, name: event.target.value })} /></div>
        <div className="space-y-2"><label htmlFor="tag-color" className="text-sm font-medium">颜色</label><Select
          id="tag-color" searchable={false} value={fields.color} style={{ width: '100%' }}
          onChange={(value: string) => setFields({ ...fields, color: value })}
          options={[
            ...(!colorPresets.some(item => item.value === fields.color)
              ? [{ value: fields.color, label: <span className="tag-color-option"><i style={{ background: fields.color }} />自定义颜色 {fields.color}</span> }]
              : []),
            ...colorPresets.map(item => ({ value: item.value, label: <span className="tag-color-option"><i style={{ background: item.value }} />{item.label}</span> })),
          ]}
        /></div>
        <div className="space-y-2"><label htmlFor="tag-description" className="text-sm font-medium">备注</label><Textarea id="tag-description" maxLength={200} rows={3} placeholder="可选，备注这个标签的用途" value={fields.description} onChange={event => setFields({ ...fields, description: event.target.value })} /></div>
        <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>取消</Button><Button type="submit" disabled={saving}>{saving ? '保存中...' : '保存'}</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>
    <Dialog open={!!deleting} onOpenChange={next => { if (!next && !saving) setDeleting(null) }}><DialogContent><DialogHeader><DialogTitle>删除标签「{deleting?.name}」？</DialogTitle><DialogDescription>关联资产上的该标签会一并移除，资产本身保留。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={saving} onClick={() => setDeleting(null)}>取消</Button><Button variant="destructive" disabled={saving} onClick={() => { if (deleting) void remove(deleting) }}>删除</Button></DialogFooter></DialogContent></Dialog>
  </>
}
