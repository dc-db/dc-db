import { useEffect, useMemo, useState } from 'react'
import { getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState, type VisibilityState } from '@tanstack/react-table'
import { Plus, Trash2 } from 'lucide-react'
import { APIError, api, type DirectoryEntry, type Person, type Team, type User } from '../api'
import { DataTable } from './DataTable'
import { PageHeader } from './PageHeader'
import { RowActionsMenu } from './RowActionsMenu'
import { SearchableSelect } from './SearchableSelect'
import { DataTableViewOptions } from './TableColumnControls'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'

type Entry = Person | Team
type Draft = Pick<DirectoryEntry, 'name' | 'description'> & { username: string; memberIds: number[] }

interface Props {
  kind: 'people' | 'teams'
  entries: Entry[]
  people: Person[]
  teams: Team[]
  editable: boolean
  canLinkAccount: boolean
  loading: boolean
  onRefresh: () => Promise<void>
  onSessionError: (error: unknown) => void
}

export function OrganizationManager({ kind, entries, people, teams, editable, canLinkAccount, loading, onRefresh, onSessionError }: Props) {
  const teamPage = kind === 'teams'
  const title = teamPage ? '团队' : '人员'
  const [keyword, setKeyword] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [draft, setDraft] = useState<Draft | null>(null)
  const [editing, setEditing] = useState<Entry | null>(null)
  const [deleting, setDeleting] = useState<Entry | null>(null)
  const [accounts, setAccounts] = useState<User[]>([])
  const [accountError, setAccountError] = useState('')
  const [accountLoading, setAccountLoading] = useState(false)
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  const peopleById = useMemo(() => new Map(people.map(person => [person.id, person])), [people])

  useEffect(() => {
    setColumnVisibility({})
    setSorting([])
  }, [kind])

  function errorMessage(error: unknown) {
    if (error instanceof APIError && error.status === 401) onSessionError(error)
    return error instanceof Error ? error.message : '操作失败'
  }

  async function openEditor(entry: Entry | null) {
    setEditing(entry)
    setFailure('')
    setAccountError('')
    setDraft({
      name: entry?.name ?? '',
      description: entry?.description ?? '',
      username: entry && 'username' in entry ? entry.username ?? '' : '',
      memberIds: entry && 'memberIds' in entry ? entry.memberIds : [],
    })
    if (!teamPage && canLinkAccount) {
      setAccounts([])
      setAccountLoading(true)
      try {
        setAccounts(await api<User[]>('/users'))
      } catch (error) {
        setAccountError(errorMessage(error))
      } finally {
        setAccountLoading(false)
      }
    }
  }

  async function save(form: Draft) {
    if (busy) return
    setBusy(true)
    setFailure('')
    const fields = { name: form.name, description: form.description }
    try {
      const body = teamPage
        ? { ...fields, memberIds: form.memberIds }
        : { ...fields, username: canLinkAccount && !accountLoading && !accountError ? form.username : undefined }
      await api(editing ? `/${kind}/${editing.id}` : `/${kind}`, editing ? 'PUT' : 'POST', body)
      setDraft(null)
      await onRefresh()
    } catch (error) {
      setFailure(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function remove(entry: Entry) {
    if (busy) return
    setBusy(true)
    setFailure('')
    try {
      await api(`/${kind}/${entry.id}`, 'DELETE')
      setDeleting(null)
      await onRefresh()
    } catch (error) {
      setFailure(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const visible = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    return entries.filter(entry =>
      [entry.name, entry.description].some(value => value.toLowerCase().includes(query)))
  }, [entries, keyword])
  const teamNamesByPerson = useMemo(() => {
    const namesByPerson = new Map<number, string[]>()
    for (const team of teams) {
      for (const id of team.memberIds) {
        const names = namesByPerson.get(id) ?? []
        names.push(team.name)
        namesByPerson.set(id, names)
      }
    }
    return namesByPerson
  }, [teams])
  const columns: ColumnDef<Entry>[] = [
    {
      accessorKey: 'name',
      header: '名称',
      sortingFn: (a, b) => a.original.name.localeCompare(b.original.name, 'zh-CN'),
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    ...(teamPage ? [{
      id: 'members',
      header: '成员',
      accessorFn: (row: Entry) => (row as Team).memberIds.length,
      sortingFn: (a, b) => {
        const left = a.original as Team
        const right = b.original as Team
        if (left.memberIds.length !== right.memberIds.length) {
          return left.memberIds.length - right.memberIds.length
        }
        const leftNames = left.memberIds.map(id => peopleById.get(id)?.name).filter(Boolean).join('、')
        const rightNames = right.memberIds.map(id => peopleById.get(id)?.name).filter(Boolean).join('、')
        return leftNames.localeCompare(rightNames, 'zh-CN')
      },
      cell: ({ row }) => {
        const team = row.original as Team
        const names = team.memberIds.map(id => peopleById.get(id)?.name).filter(Boolean).join('、')
        return names || <span className="text-muted-foreground">—</span>
      },
    } satisfies ColumnDef<Entry>] : canLinkAccount ? [{
      id: 'account',
      header: '登录账号',
      accessorFn: (row: Entry) => (row as Person).username ?? '',
      sortingFn: (a, b) => ((a.original as Person).username ?? '').localeCompare((b.original as Person).username ?? '', 'zh-CN'),
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => {
        const username = (row.original as Person).username
        return username ? <span className="font-mono text-xs">{username}</span> : <span className="text-muted-foreground">—</span>
      },
    } satisfies ColumnDef<Entry>] : []),
    ...(!teamPage ? [{
      id: 'teams',
      header: '所属团队',
      accessorFn: (row: Entry) => teamNamesByPerson.get(row.id)?.join('、') ?? '',
      sortingFn: (a, b) => (teamNamesByPerson.get(a.original.id)?.join('、') ?? '').localeCompare(teamNamesByPerson.get(b.original.id)?.join('、') ?? '', 'zh-CN'),
      cell: ({ row }) => {
        const names = teamNamesByPerson.get(row.original.id)?.join('、')
        return names || <span className="text-muted-foreground">—</span>
      },
    } satisfies ColumnDef<Entry>] : []),
    {
      accessorKey: 'assetCount',
      header: '关联资产',
      meta: { cellClassName: 'whitespace-nowrap' },
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
      cell: ({ row }: { row: { original: Entry } }) => (
        <div className="flex justify-end">
          <RowActionsMenu
            ariaLabel={`${title} ${row.original.name} 操作`}
            onEdit={() => { void openEditor(row.original) }}
            onDelete={() => { setFailure(''); setDeleting(row.original) }}
            deleteDisabled={busy}
          />
        </div>
      ),
    }] : []),
  ]
  const table = useReactTable({
    data: visible,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    initialState: { pagination: { pageIndex: 0, pageSize: 20 } },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  const usedAccounts = new Set(people.filter(person => person.id !== editing?.id).map(person => person.username))

  return <>
    <PageHeader
      title={title}
      filters={<Input type="search" aria-label={`搜索${title}`} placeholder={`搜索${title}名称或备注`} className="h-8 w-[240px]" value={keyword} onChange={event => setKeyword(event.target.value)} />}
      actions={
        <>
          <DataTableViewOptions table={table} />
          {editable && <Button size="sm" onClick={() => { void openEditor(null) }}><Plus />新增{title}</Button>}
        </>
      }
    />
    <DataTable table={table} loading={loading} emptyMessage={keyword ? `未找到匹配的${title}` : `暂无${title}`} />

    <Dialog open={draft !== null} onOpenChange={open => { if (!open && !busy) setDraft(null) }}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader><DialogTitle>{editing ? '编辑' : '新增'}{title}</DialogTitle></DialogHeader>
        {failure && <p role="alert" className="text-sm text-destructive">{failure}</p>}
        {draft && (
          <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save(draft) }}>
            <div className="space-y-2">
              <label htmlFor="organization-name" className="text-sm font-medium">{title}名称 <span className="text-destructive" aria-hidden="true">*</span></label>
              <Input id="organization-name" required maxLength={80} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} />
            </div>
            {teamPage && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">团队成员</legend>
                {draft.memberIds.length > 0 && (
                  <ul className="max-h-36 space-y-1 overflow-y-auto">
                    {draft.memberIds.map(id => {
                      const name = peopleById.get(id)?.name ?? '已移除的人员'
                      return <li key={id} className="flex items-center justify-between gap-2 rounded-md bg-muted px-2 text-sm">
                        <span>{name}</span>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={`移除 ${name}`} title={`移除 ${name}`} onClick={() => setDraft({ ...draft, memberIds: draft.memberIds.filter(member => member !== id) })}>
                          <Trash2 />
                        </Button>
                      </li>
                    })}
                  </ul>
                )}
                <SearchableSelect label="团队成员" placeholder="添加成员" value="" allowClear={false}
                  options={people.filter(person => !draft.memberIds.includes(person.id)).map(person => ({ value: String(person.id), label: person.name }))}
                  onChange={id => setDraft({ ...draft, memberIds: [...draft.memberIds, Number(id)] })}
                />
                {people.length === 0 && <p className="text-sm text-muted-foreground">先在「人员」中新建成员。</p>}
              </fieldset>
            )}
            {!teamPage && canLinkAccount && (
              <div className="space-y-2">
                <span className="text-sm font-medium">登录账号</span>
                <SearchableSelect label="登录账号" placeholder={accountLoading ? '正在加载账号…' : '选择登录账号'} disabled={accountLoading || !!accountError}
                  value={draft.username} options={accounts.filter(account => !usedAccounts.has(account.username)).map(account => ({ value: account.username, label: account.username }))}
                  onChange={username => setDraft({ ...draft, username })}
                />
                {accountError && <p role="alert" className="text-sm text-destructive">{accountError}</p>}
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor="organization-notes" className="text-sm font-medium">备注</label>
              <Textarea id="organization-notes" maxLength={200} rows={2} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} />
            </div>
            <DialogFooter>
              {editing && <Button type="button" variant="destructive" className="mr-auto" disabled={busy}
                onClick={() => { setDraft(null); setFailure(''); setDeleting(editing) }}><Trash2 />删除</Button>}
              <Button type="button" variant="outline" disabled={busy} onClick={() => setDraft(null)}>取消</Button>
              <Button type="submit" disabled={busy}>{busy ? '保存中…' : '保存'}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
    <Dialog open={deleting !== null} onOpenChange={open => { if (!open && !busy) setDeleting(null) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>删除「{deleting?.name}」？</DialogTitle>
          <DialogDescription>
            {deleting && deleting.assetCount > 0
              ? '请先调整关联资产的归属，再删除此记录。'
              : `此操作会移除${teamPage ? '团队及其成员关系' : '人员及其团队成员关系'}。`}
          </DialogDescription>
        </DialogHeader>
        {failure && <p role="alert" className="text-sm text-destructive">{failure}</p>}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>取消</Button>
          <Button variant="destructive" disabled={busy || !!deleting?.assetCount} onClick={() => { if (deleting) void remove(deleting) }}>删除</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}
