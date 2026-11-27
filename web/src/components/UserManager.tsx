import { OptionSelect } from './OptionSelect'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { getCoreRowModel, getSortedRowModel, useReactTable, type ColumnDef, type RowSelectionState, type SortingState, type VisibilityState } from '@tanstack/react-table'
import { Eye, EyeOff, Plus, RefreshCw } from 'lucide-react'
import { api, APIError } from '../api'
import type { Role, User, UserFields } from '../api'
import { downloadCSV } from '../csv'
import { DataTable } from './DataTable'
import { PageHeader } from './PageHeader'
import { RowActionsMenu } from './RowActionsMenu'
import { buildFacetedOptions, ClearFiltersButton, DataTableViewOptions, matchesMultiFilter } from './TableColumnControls'
import { BulkActionBar, createRowSelectionColumn } from './TableSelectionControls'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from './ui/alert-dialog'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'

interface Props {
  currentUser: User
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>
  onSessionError: (error: unknown) => void
}
const roleMeta: Record<Role, { label: string; className: string; description: string }> = {
  admin: { label: '管理员', className: 'border-primary bg-primary text-primary-foreground', description: '全部权限，可管理账号' },
  operator: { label: '运维', className: 'border-border bg-secondary text-secondary-foreground', description: '可维护资产、IPAM 和数据中心' },
  viewer: { label: '只读', className: 'border-border bg-transparent text-muted-foreground', description: '只能查看，不能修改数据' },
}
const roles: Role[] = ['admin', 'operator', 'viewer']
const roleCatalog = roles.map(role => ({ value: role, label: roleMeta[role].label }))
const initialFields: UserFields = { username: '', role: 'viewer', password: '' }

export function UserManager({ currentUser, onChangePassword, onSessionError }: Props) {
  const canManageUsers = currentUser.role === 'admin'
  const currentUsername = currentUser.username
  const [users, setUsers] = useState<User[]>([])
  const [roleFilter, setRoleFilter] = useState<string[]>([])
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [resetting, setResetting] = useState<User | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetError, setResetError] = useState('')
  const [showResetPasswordField, setShowResetPasswordField] = useState(false)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [deleting, setDeleting] = useState<User | null>(null)
  const [modalError, setModalError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fields, setFields] = useState<UserFields>(initialFields)
  const adminCount = useMemo(() => users.filter(user => user.role === 'admin').length, [users])
  const baseTableData = useMemo(() => (canManageUsers ? users : [currentUser]), [canManageUsers, users, currentUser])
  const effectiveRoleFilter = canManageUsers ? roleFilter : []
  const roleFilterOptions = useMemo(() => {
    if (!canManageUsers) return []
    return buildFacetedOptions({
      items: baseTableData,
      getEntries: user => user.role,
      catalog: roleCatalog,
      includeZeroCatalog: true,
      selectedValues: roleFilter,
    })
  }, [baseTableData, canManageUsers, roleFilter])
  const tableData = useMemo(() => {
    if (effectiveRoleFilter.length === 0) return baseTableData
    return baseTableData.filter(user => matchesMultiFilter(effectiveRoleFilter, user.role))
  }, [baseTableData, effectiveRoleFilter])

  useEffect(() => { if (canManageUsers) void load(); else setRoleFilter([]) }, [canManageUsers])
  useEffect(() => {
    setRowSelection(prev => {
      const valid = new Set(tableData.map(user => user.username))
      const kept = Object.entries(prev).filter(([username, checked]) => checked && valid.has(username))
      return kept.length === Object.keys(prev).length ? prev : Object.fromEntries(kept)
    })
  }, [tableData])

  const selectedUsers = useMemo(
    () => tableData.filter(user => Boolean(rowSelection[user.username])),
    [tableData, rowSelection],
  )
  const { deletableSelected, selfSelected, skippedLastAdmin } = useMemo(() => {
    if (!canManageUsers) {
      return { deletableSelected: [] as User[], selfSelected: false, skippedLastAdmin: null as User | null }
    }
    const selfPicked = selectedUsers.some(user => user.username === currentUsername)
    const candidates = selectedUsers.filter(user => user.username !== currentUsername)
    const candidateNames = new Set(candidates.map(user => user.username))
    const remainingAdmins = users.filter(user => user.role === 'admin' && !candidateNames.has(user.username)).length
    if (remainingAdmins >= 1) {
      return { deletableSelected: candidates, selfSelected: selfPicked, skippedLastAdmin: null as User | null }
    }
    const candidateAdmins = candidates.filter(user => user.role === 'admin')
    if (candidateAdmins.length === 0) {
      return { deletableSelected: candidates, selfSelected: selfPicked, skippedLastAdmin: null as User | null }
    }
    const protectedAdmin = candidateAdmins[0]
    return {
      deletableSelected: candidates.filter(user => user.username !== protectedAdmin.username),
      selfSelected: selfPicked,
      skippedLastAdmin: protectedAdmin,
    }
  }, [canManageUsers, currentUsername, selectedUsers, users])
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
  function showResetPassword(user: User) {
    setResetting(user)
    setResetPassword('')
    setResetError('')
    setShowResetPasswordField(false)
  }
  function openChangePassword() {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setPasswordError('')
    setChangePasswordOpen(true)
  }
  function handleChangePasswordOpenChange(next: boolean) {
    if (passwordBusy) return
    setChangePasswordOpen(next)
    if (!next) {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordError('')
    }
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
  async function saveResetPassword() {
    if (!resetting) return
    if (!resetPassword) { setResetError('请填写新密码'); return }
    if (resetPassword.length < 12) { setResetError('密码至少 12 个字符'); return }
    setBusy(true); setResetError('')
    try {
      await api<User>(`/users/${encodeURIComponent(resetting.username)}`, 'PUT', {
        username: resetting.username,
        role: resetting.role,
        password: resetPassword,
      })
      const targetName = resetting.username
      setResetting(null)
      setResetPassword('')
      await load()
      setFeedback(`账号 ${targetName} 的密码已重置`)
    } catch (e) {
      if (e instanceof APIError && e.status === 401) { onSessionError(e); return }
      setResetError(e instanceof Error ? e.message : '操作失败')
    } finally { setBusy(false) }
  }
  async function submitChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (passwordBusy) return
    if (newPassword.length < 12 || newPassword.length > 512) {
      setPasswordError('新密码长度须为 12–512 个字符')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('两次输入的新密码不一致')
      return
    }
    setPasswordBusy(true)
    setPasswordError('')
    try {
      await onChangePassword(currentPassword, newPassword)
    } catch (e) {
      setPasswordError(e instanceof Error ? e.message : '密码修改失败')
      setPasswordBusy(false)
    }
  }
  async function remove(user: User) {
    setBusy(true); setError('')
    try { await api(`/users/${encodeURIComponent(user.username)}`, 'DELETE'); setDeleting(null); await load(); setFeedback('账号已删除') }
    catch (e) { setDeleting(null); report(e) } finally { setBusy(false) }
  }

  function exportSelectedUsersCSV() {
    if (selectedUsers.length === 0) return
    downloadCSV('dc-db-users.csv', [
      ['账号', '角色', '权限说明'],
      ...selectedUsers.map(user => [
        user.username,
        roleMeta[user.role]?.label ?? user.role,
        roleMeta[user.role]?.description ?? '',
      ]),
    ])
  }

  async function removeSelected() {
    if (!canManageUsers || bulkDeleting || busy || deletableSelected.length === 0) return
    const targets = [...deletableSelected]
    setBulkDeleting(true)
    setError('')
    setFeedback('')
    const deletedUsernames: string[] = []
    const failures: string[] = []
    let sessionExpired = false
    try {
      for (const user of targets) {
        try {
          await api(`/users/${encodeURIComponent(user.username)}`, 'DELETE')
          deletedUsernames.push(user.username)
        } catch (e) {
          if (e instanceof APIError && e.status === 401) {
            sessionExpired = true
            onSessionError(e)
            break
          }
          failures.push(`${user.username}：${e instanceof Error ? e.message : '删除失败'}`)
        }
      }
      if (deletedUsernames.length > 0) {
        setRowSelection(prev => {
          const next = { ...prev }
          for (const username of deletedUsernames) delete next[username]
          return next
        })
      }
      if (sessionExpired) return
      if (deletedUsernames.length > 0) {
        await load()
      }
      if (failures.length > 0) {
        setError(
          deletedUsernames.length > 0
            ? `已删除 ${deletedUsernames.length} 个账号，${failures.length} 个删除失败：${failures.join('；')}`
            : `删除失败：${failures.join('；')}`,
        )
      } else if (deletedUsernames.length > 0) {
        setFeedback(`已删除 ${deletedUsernames.length} 个账号`)
      }
    } finally {
      setBulkDeleting(false)
      setBulkDeleteOpen(false)
    }
  }

  const columns: ColumnDef<User>[] = [
    createRowSelectionColumn<User>({
      getRowLabel: row => `选择账号 ${row.username}`,
    }),
    {
      accessorKey: 'username',
      header: '账号',
      sortingFn: (a, b) => a.original.username.localeCompare(b.original.username, 'zh-CN'),
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => (
        <div className="table-name-cell">
          <span className="font-medium">{row.original.username}</span>
          {row.original.username === currentUsername && <Badge variant="secondary">当前账号</Badge>}
          {row.original.role === 'admin' && adminCount === 1 && <Badge variant="outline">最后一个管理员</Badge>}
        </div>
      ),
    },
    {
      accessorKey: 'role',
      header: '角色',
      enableSorting: false,
      meta: {
        cellClassName: 'whitespace-nowrap',
        ...(canManageUsers
          ? {
              filter: {
                options: roleFilterOptions,
                selectedValues: roleFilter,
                onChange: setRoleFilter,
              },
            }
          : {}),
      },
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
      enableHiding: false,
      size: 48,
      meta: { headerClassName: 'w-10 text-right', cellClassName: 'w-10 whitespace-nowrap text-right' },
      header: () => <span className="sr-only">操作</span>,
      cell: ({ row }) => {
        const user = row.original
        if (user.username === currentUsername) {
          return (
            <div className="flex justify-end">
              <RowActionsMenu
                ariaLabel={`账号 ${user.username} 操作`}
                extraItems={[
                  {
                    key: 'change-password',
                    label: '更改密码',
                    onSelect: openChangePassword,
                  },
                ]}
              />
            </div>
          )
        }
        const lastAdmin = user.role === 'admin' && adminCount <= 1
        return (
          <div className="flex justify-end">
            <RowActionsMenu
              ariaLabel={`账号 ${user.username} 操作`}
              onEdit={() => showForm(user)}
              extraItems={[
                {
                  key: 'reset-password',
                  label: '重置密码',
                  onSelect: () => showResetPassword(user),
                  disabled: busy,
                },
              ]}
              onDelete={() => setDeleting(user)}
              deleteDisabled={busy || lastAdmin}
            />
          </div>
        )
      },
    },
  ]

  const table = useReactTable({
    data: tableData,
    columns,
    state: { sorting, columnVisibility, rowSelection },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    getRowId: row => row.username,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return <>
    <PageHeader
      title={canManageUsers ? '用户管理' : '我的账号'}
      filters={
        <>
          {canManageUsers && (
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {roles.map(role => (
                <span key={role} className="inline-flex items-center gap-1.5">
                  <Badge variant="outline" className={roleMeta[role].className}>{roleMeta[role].label}</Badge>
                  <span>{roleMeta[role].description}</span>
                </span>
              ))}
            </div>
          )}
          <DataTableViewOptions table={table} align="start" />
          {canManageUsers && <ClearFiltersButton count={roleFilter.length} onReset={() => setRoleFilter([])} />}
        </>
      }
      actions={canManageUsers && (
        <>
          <Button size="sm" variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw />刷新</Button>
          <Button size="sm" onClick={() => showForm(null)}><Plus />新增账号</Button>
        </>
      )}
    />
    {error && <div role="alert" className="mb-4 flex justify-between rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}<button aria-label="关闭" onClick={() => setError('')}>×</button></div>}
    {feedback && <div role="status" className="mb-4 flex justify-between rounded-md border border-success-border bg-success-soft p-3 text-sm text-success">{feedback}<button aria-label="关闭" onClick={() => setFeedback('')}>×</button></div>}
    <DataTable table={table} loading={loading} showPager={false} emptyMessage={effectiveRoleFilter.length > 0 ? '没有匹配的账号' : '暂无账号'} />
    <BulkActionBar
      count={selectedUsers.length}
      unit="个账号"
      onClear={() => setRowSelection({})}
      onExport={exportSelectedUsersCSV}
      onDelete={canManageUsers && deletableSelected.length > 0 ? () => setBulkDeleteOpen(true) : undefined}
      deleting={bulkDeleting}
    />
    <Dialog open={modalOpen} onOpenChange={next => { if (!busy) { setModalOpen(next); if (!next) setEditing(null) } }}><DialogContent><DialogHeader><DialogTitle>{editing ? `编辑账号 ${editing.username}` : '新增账号'}</DialogTitle></DialogHeader>
      {modalError && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{modalError}</div>}
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save() }}>
        <div className="space-y-2"><label htmlFor="user-name" className="text-sm font-medium">账号</label><Input id="user-name" required disabled={!!editing} maxLength={80} autoComplete="off" placeholder="例如：ops-viewer" value={fields.username} onChange={event => setFields({ ...fields, username: event.target.value })} /></div>
        <div className="space-y-2"><label htmlFor="user-role" className="text-sm font-medium">角色</label><OptionSelect id="user-role" className="w-full" value={fields.role} onChange={value => setFields({ ...fields, role: value as Role })} options={roles.map(role => ({ value: role, label: `${roleMeta[role].label} · ${roleMeta[role].description}` }))} /></div>
        <div className="space-y-2"><label htmlFor="user-password" className="text-sm font-medium">{editing ? '重置密码' : '初始密码'}</label><div className="relative"><Input id="user-password" className="pr-10" type={showPassword ? 'text' : 'password'} required={!editing} minLength={12} maxLength={512} autoComplete="new-password" placeholder={editing ? '留空表示不修改' : '至少 12 个字符'} value={fields.password ?? ''} onChange={event => setFields({ ...fields, password: event.target.value })} /><Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 size-9" aria-label={showPassword ? '隐藏密码' : '显示密码'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff /> : <Eye />}</Button></div><p className="text-xs text-muted-foreground">{editing ? '留空表示不修改密码；修改后该账号已有会话会失效。' : '至少 12 个字符。'}</p></div>
        <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setModalOpen(false)}>取消</Button><Button type="submit" disabled={busy}>{busy ? '保存中…' : '保存'}</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>
    <Dialog open={!!resetting} onOpenChange={next => { if (!next && !busy) { setResetting(null); setResetPassword(''); setResetError('') } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>重置密码 · {resetting?.username}</DialogTitle>
          <DialogDescription>修改后该账号已有会话会失效。</DialogDescription>
        </DialogHeader>
        {resetError && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{resetError}</div>}
        <form className="space-y-4" onSubmit={event => { event.preventDefault(); void saveResetPassword() }}>
          <div className="space-y-2">
            <label htmlFor="user-reset-password" className="text-sm font-medium">新密码</label>
            <div className="relative">
              <Input
                id="user-reset-password"
                className="pr-10"
                type={showResetPasswordField ? 'text' : 'password'}
                required
                minLength={12}
                maxLength={512}
                autoComplete="new-password"
                placeholder="至少 12 个字符"
                value={resetPassword}
                onChange={event => setResetPassword(event.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 size-9"
                aria-label={showResetPasswordField ? '隐藏密码' : '显示密码'}
                aria-pressed={showResetPasswordField}
                onClick={() => setShowResetPasswordField(!showResetPasswordField)}
              >
                {showResetPasswordField ? <EyeOff /> : <Eye />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">至少 12 个字符。</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => { setResetting(null); setResetPassword(''); setResetError('') }}>取消</Button>
            <Button type="submit" disabled={busy}>{busy ? '保存中…' : '保存'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog open={changePasswordOpen} onOpenChange={handleChangePasswordOpenChange}>
      <DialogContent showCloseButton={!passwordBusy}>
        <DialogHeader>
          <DialogTitle>更改密码</DialogTitle>
          <DialogDescription>更改成功后，当前账号的所有登录会话都会失效，请使用新密码重新登录。</DialogDescription>
        </DialogHeader>
        {passwordError && <p role="alert" className="text-sm text-destructive">{passwordError}</p>}
        <form className="grid gap-4" onSubmit={event => void submitChangePassword(event)}>
          <label className="grid gap-2 text-sm font-medium">当前密码
            <Input type="password" autoComplete="current-password" maxLength={512} required disabled={passwordBusy} value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} />
          </label>
          <label className="grid gap-2 text-sm font-medium">新密码
            <Input type="password" autoComplete="new-password" placeholder="至少 12 个字符" maxLength={512} required disabled={passwordBusy} value={newPassword} onChange={event => setNewPassword(event.target.value)} />
          </label>
          <label className="grid gap-2 text-sm font-medium">确认新密码
            <Input type="password" autoComplete="new-password" maxLength={512} required disabled={passwordBusy} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} />
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={passwordBusy} onClick={() => handleChangePasswordOpenChange(false)}>取消</Button>
            <Button type="submit" disabled={passwordBusy}>{passwordBusy ? '更改中…' : '保存新密码'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog open={!!deleting} onOpenChange={next => { if (!next && !busy) setDeleting(null) }}><DialogContent><DialogHeader><DialogTitle>删除该账号？</DialogTitle><DialogDescription>删除后该账号的登录会话会立即失效。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>取消</Button><Button variant="destructive" disabled={busy} onClick={() => { if (deleting) void remove(deleting) }}>删除</Button></DialogFooter></DialogContent></Dialog>
    <AlertDialog open={bulkDeleteOpen} onOpenChange={next => { if (!bulkDeleting) setBulkDeleteOpen(next) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除选中的 {deletableSelected.length} 个账号？</AlertDialogTitle>
          <AlertDialogDescription>
            删除后这 {deletableSelected.length} 个账号的登录会话会立即失效，此操作无法撤销。
            {selfSelected && ` 当前登录账号（${currentUsername}）不能删除，将自动跳过。`}
            {skippedLastAdmin && ` 管理员账号（${skippedLastAdmin.username}）为最后保留的管理员，将自动跳过以保证至少保留 1 名管理员。`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={bulkDeleting}>取消</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={bulkDeleting || busy || deletableSelected.length === 0}
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
