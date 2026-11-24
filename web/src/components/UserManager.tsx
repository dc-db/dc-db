import { OptionSelect } from './OptionSelect'
import { useEffect, useMemo, useState } from 'react'
import { getCoreRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from '@tanstack/react-table'
import { Eye, EyeOff, Pencil, Plus, RefreshCw, ShieldCheck, Trash2, UserCog, UserRound } from 'lucide-react'
import { api, APIError } from '../api'
import type { Role, User, UserFields } from '../api'
import { DataTable } from './DataTable'
import { PageHeader } from './PageHeader'
import { RowIconBox } from './ServiceIcon'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'

interface Props { currentUsername: string; onSessionError: (error: unknown) => void }
const roleMeta: Record<Role, { label: string; className: string; description: string }> = {
  admin: { label: '管理员', className: 'border-danger-border bg-danger-soft text-danger', description: '全部权限，可管理账号' },
  operator: { label: '运维', className: 'border-info-border bg-info-soft text-info', description: '可维护资产、IPAM 和数据中心' },
  viewer: { label: '只读', className: 'border-border bg-muted text-muted-foreground', description: '只能查看，不能修改数据' },
}
const roles: Role[] = ['admin', 'operator', 'viewer']
const initialFields: UserFields = { username: '', role: 'viewer', password: '' }

function roleIcon(role: Role) {
  if (role === 'admin') return <ShieldCheck className="size-3.5" />
  if (role === 'operator') return <UserCog className="size-3.5" />
  return <UserRound className="size-3.5" />
}

export function UserManager({ currentUsername, onSessionError }: Props) {
  const [users, setUsers] = useState<User[]>([])
  const [sorting, setSorting] = useState<SortingState>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [deleting, setDeleting] = useState<User | null>(null)
  const [modalError, setModalError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fields, setFields] = useState<UserFields>(initialFields)
  const adminCount = useMemo(() => users.filter(user => user.role === 'admin').length, [users])

  useEffect(() => { void load() }, [])
  function report(e: unknown, inModal = false) {
    if (e instanceof APIError && e.status === 401) { onSessionError(e); return }
    const message = e instanceof Error ? e.message : '操作失败'
    if (inModal) setModalError(message); else setError(message)
  }
  async function load() {
    setLoading(true); setError('')
    try { setUsers(await api<User[]>('/users')) } catch (e) { report(e) } finally { setLoading(false) }
  }
  function showForm(user: User | null) {
    setEditing(user); setModalError(''); setShowPassword(false)
    setFields(user ? { username: user.username, role: user.role, password: '' } : initialFields)
    setModalOpen(true)
  }
  async function save() {
    if (!/^[\p{L}\p{N}._@-]{1,80}$/u.test(fields.username)) { setModalError('账号须为 1–80 个字符，只能包含文字、数字、点、下划线、@ 或连字符'); return }
    if (!editing && !fields.password) { setModalError('请设置初始密码'); return }
    if (fields.password && fields.password.length < 12) { setModalError('密码至少 12 个字符'); return }
    setBusy(true); setModalError('')
    try {
      if (editing) await api<User>(`/users/${encodeURIComponent(editing.username)}`, 'PUT', { username: editing.username, role: fields.role, password: fields.password ?? '' })
      else await api<User>('/users', 'POST', fields)
      const wasEdit = !!editing
      setModalOpen(false); setEditing(null); await load(); setFeedback(wasEdit ? '账号已更新' : '账号已创建')
    } catch (e) { report(e, true) } finally { setBusy(false) }
  }
  async function remove(user: User) {
    setBusy(true); setError('')
    try { await api(`/users/${encodeURIComponent(user.username)}`, 'DELETE'); setDeleting(null); await load(); setFeedback('账号已删除') }
    catch (e) { setDeleting(null); report(e) } finally { setBusy(false) }
  }

  const columns: ColumnDef<User>[] = [
    {
      accessorKey: 'username',
      header: '账号',
      sortingFn: (a, b) => a.original.username.localeCompare(b.original.username, 'zh-CN'),
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => (
        <div className="table-name-cell">
          <RowIconBox>{roleIcon(row.original.role)}</RowIconBox>
          <span className="font-medium">{row.original.username}</span>
          {row.original.username === currentUsername && <Badge variant="secondary">当前账号</Badge>}
          {row.original.role === 'admin' && adminCount === 1 && <Badge variant="outline">最后一个管理员</Badge>}
        </div>
      ),
    },
    {
      accessorKey: 'role',
      header: '角色',
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => {
        const meta = roleMeta[row.original.role]
        return meta ? <Badge variant="outline" className={meta.className}>{meta.label}</Badge> : row.original.role
      },
    },
    {
      id: 'description',
      header: '权限说明',
      enableSorting: false,
      cell: ({ row }) => <span className="text-muted-foreground">{roleMeta[row.original.role]?.description ?? '—'}</span>,
    },
    {
      id: 'actions',
      enableSorting: false,
      meta: { headerClassName: 'text-right', cellClassName: 'whitespace-nowrap text-right' },
      header: () => <div className="text-right">操作</div>,
      cell: ({ row }) => {
        const user = row.original
        if (user.username === currentUsername) return <span className="text-xs text-muted-foreground">请使用「更改密码」维护当前账号</span>
        const lastAdmin = user.role === 'admin' && adminCount <= 1
        return (
          <div className="table-row-action flex justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={() => showForm(user)}><Pencil />编辑</Button>
            <Button variant="ghost" size="icon-sm" className="text-destructive" disabled={busy || lastAdmin} title={lastAdmin ? '不能删除最后一个管理员' : undefined} aria-label={`删除账号 ${user.username}`} onClick={() => setDeleting(user)}><Trash2 /></Button>
          </div>
        )
      },
    },
  ]

  const table = useReactTable({
    data: users,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return <>
    <PageHeader
      title="用户管理"
      filters={
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {roles.map(role => (
            <span key={role} className="inline-flex items-center gap-1.5">
              <Badge variant="outline" className={roleMeta[role].className}>{roleMeta[role].label}</Badge>
              <span>{roleMeta[role].description}</span>
            </span>
          ))}
        </div>
      }
      actions={<>
        <Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw />刷新</Button>
        <Button onClick={() => showForm(null)}><Plus />新增账号</Button>
      </>}
    />
    {error && <div role="alert" className="mb-4 flex justify-between rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}<button aria-label="关闭" onClick={() => setError('')}>×</button></div>}
    {feedback && <div role="status" className="mb-4 flex justify-between rounded-md border border-success-border bg-success-soft p-3 text-sm text-success">{feedback}<button aria-label="关闭" onClick={() => setFeedback('')}>×</button></div>}
    <DataTable table={table} loading={loading} showPager={false} emptyMessage="暂无账号" />
    <Dialog open={modalOpen} onOpenChange={next => { if (!busy) { setModalOpen(next); if (!next) setEditing(null) } }}><DialogContent><DialogHeader><DialogTitle>{editing ? `编辑账号 ${editing.username}` : '新增账号'}</DialogTitle></DialogHeader>
      {modalError && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{modalError}</div>}
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save() }}>
        <div className="space-y-2"><label htmlFor="user-name" className="text-sm font-medium">账号</label><Input id="user-name" required disabled={!!editing} maxLength={80} autoComplete="off" placeholder="例如：ops-viewer" value={fields.username} onChange={event => setFields({ ...fields, username: event.target.value })} /></div>
        <div className="space-y-2"><label htmlFor="user-role" className="text-sm font-medium">角色</label><OptionSelect id="user-role" className="w-full" value={fields.role} onChange={value => setFields({ ...fields, role: value as Role })} options={roles.map(role => ({ value: role, label: `${roleMeta[role].label} · ${roleMeta[role].description}` }))} /></div>
        <div className="space-y-2"><label htmlFor="user-password" className="text-sm font-medium">{editing ? '重置密码' : '初始密码'}</label><div className="relative"><Input id="user-password" className="pr-10" type={showPassword ? 'text' : 'password'} required={!editing} minLength={12} maxLength={512} autoComplete="new-password" placeholder={editing ? '留空表示不修改' : '至少 12 个字符'} value={fields.password ?? ''} onChange={event => setFields({ ...fields, password: event.target.value })} /><Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 size-9" aria-label={showPassword ? '隐藏密码' : '显示密码'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff /> : <Eye />}</Button></div><p className="text-xs text-muted-foreground">{editing ? '留空表示不修改密码；修改后该账号已有会话会失效。' : '至少 12 个字符。'}</p></div>
        <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setModalOpen(false)}>取消</Button><Button type="submit" disabled={busy}>{busy ? '保存中…' : '保存'}</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>
    <Dialog open={!!deleting} onOpenChange={next => { if (!next && !busy) setDeleting(null) }}><DialogContent><DialogHeader><DialogTitle>删除该账号？</DialogTitle><DialogDescription>删除后该账号的登录会话会立即失效。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>取消</Button><Button variant="destructive" disabled={busy} onClick={() => { if (deleting) void remove(deleting) }}>删除</Button></DialogFooter></DialogContent></Dialog>
  </>
}
