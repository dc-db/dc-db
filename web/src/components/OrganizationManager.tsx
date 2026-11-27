import { useEffect, useMemo, useState } from 'react'
import { getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type ColumnDef, type RowSelectionState, type SortingState, type VisibilityState } from '@tanstack/react-table'
import { Plus, Trash2 } from 'lucide-react'
import { APIError, api, type DirectoryEntry, type Person, type Team, type User } from '../api'
import { downloadCSV } from '../csv'
import { DataTable } from './DataTable'
import { PageHeader } from './PageHeader'
import { RowActionsMenu } from './RowActionsMenu'
import { SearchableSelect } from './SearchableSelect'
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
import { Textarea } from './ui/textarea'

type Entry = Person | Team
type Draft = Pick<DirectoryEntry, 'name' | 'description'> & { username: string; memberIds: number[] }
const ACCOUNT_FILTER_CATALOG = [
  { value: 'linked', label: '已关联账号' },
  { value: 'unlinked', label: '未关联账号' },
]

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
  const [teamFilter, setTeamFilter] = useState<string[]>([])
  const [accountFilter, setAccountFilter] = useState<string[]>([])
  const [memberFilter, setMemberFilter] = useState<string[]>([])
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkError, setBulkError] = useState('')
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
    setRowSelection({})
    setTeamFilter([])
    setAccountFilter([])
    setMemberFilter([])
    setBulkDeleteOpen(false)
    setBulkError('')
  }, [kind])

  useEffect(() => {
    if (!canLinkAccount) {
      setAccountFilter([])
    }
  }, [canLinkAccount])

  useEffect(() => {
    setRowSelection(prev => {
      const valid = new Set(entries.map(entry => String(entry.id)))
      const kept = Object.entries(prev).filter(([id, checked]) => checked && valid.has(id))
      return kept.length === Object.keys(prev).length ? prev : Object.fromEntries(kept)
    })
  }, [entries])

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
  const effectiveAccountFilter = !teamPage && canLinkAccount ? accountFilter : []
  const keywordFiltered = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    if (!query) return entries
    return entries.filter(entry =>
      [entry.name, entry.description].some(value => (value ?? '').toLowerCase().includes(query)))
  }, [entries, keyword])
  const teamFilterOptions = useMemo(() => {
    if (teamPage) return []
    const scoped = keywordFiltered.filter(entry =>
      matchesMultiFilter(effectiveAccountFilter, (entry as Person).username?.trim() ? 'linked' : 'unlinked'))
    return buildFacetedOptions({
      items: scoped,
      getEntries: entry => teamNamesByPerson.get(entry.id) ?? [],
      includeEmpty: true,
      emptyLabel: '未加入团队',
      selectedValues: teamFilter,
    })
  }, [effectiveAccountFilter, keywordFiltered, teamFilter, teamNamesByPerson, teamPage])
  const accountFilterOptions = useMemo(() => {
    if (teamPage || !canLinkAccount) return []
    const scoped = keywordFiltered.filter(entry =>
      matchesMultiFilter(teamFilter, teamNamesByPerson.get(entry.id) ?? []))
    return buildFacetedOptions({
      items: scoped,
      getEntries: entry => ((entry as Person).username?.trim() ? 'linked' : 'unlinked'),
      catalog: ACCOUNT_FILTER_CATALOG,
      includeZeroCatalog: true,
      selectedValues: accountFilter,
    })
  }, [accountFilter, canLinkAccount, keywordFiltered, teamFilter, teamNamesByPerson, teamPage])
  const memberFilterOptions = useMemo(() => {
    if (!teamPage) return []
    return buildFacetedOptions({
      items: keywordFiltered,
      getEntries: entry =>
        (entry as Team).memberIds
          .map(id => peopleById.get(id)?.name)
          .filter((name): name is string => Boolean(name)),
      includeEmpty: true,
      emptyLabel: '无成员',
      selectedValues: memberFilter,
    })
  }, [keywordFiltered, memberFilter, peopleById, teamPage])
  const visible = useMemo(() => {
    if (teamPage) {
      if (memberFilter.length === 0) return keywordFiltered
      return keywordFiltered.filter(entry =>
        matchesMultiFilter(
          memberFilter,
          (entry as Team).memberIds
            .map(id => peopleById.get(id)?.name)
            .filter((name): name is string => Boolean(name)),
        ))
    }
    if (teamFilter.length === 0 && effectiveAccountFilter.length === 0) return keywordFiltered
    return keywordFiltered.filter(entry =>
      matchesMultiFilter(teamFilter, teamNamesByPerson.get(entry.id) ?? [])
      && matchesMultiFilter(effectiveAccountFilter, (entry as Person).username?.trim() ? 'linked' : 'unlinked'))
  }, [effectiveAccountFilter, keywordFiltered, memberFilter, peopleById, teamFilter, teamNamesByPerson, teamPage])
  const activeFilterCount = teamPage
    ? memberFilter.length
    : teamFilter.length + effectiveAccountFilter.length
  const hasActiveFilter = Boolean(keyword.trim()) || activeFilterCount > 0

  function resetColumnFilters() {
    setTeamFilter([])
    setAccountFilter([])
    setMemberFilter([])
  }
  const selectedItems = useMemo(
    () => entries.filter(entry => Boolean(rowSelection[String(entry.id)])),
    [entries, rowSelection],
  )
  const deletableSelected = useMemo(
    () => selectedItems.filter(entry => entry.assetCount === 0),
    [selectedItems],
  )
  const blockedSelectedCount = selectedItems.length - deletableSelected.length

  function exportSelectedOrgCSV() {
    if (selectedItems.length === 0) return
    if (teamPage) {
      downloadCSV('dc-db-teams.csv', [
        ['团队名称', '成员', '关联资产', '备注'],
        ...selectedItems.map(entry => {
          const team = entry as Team
          const members = team.memberIds.map(id => peopleById.get(id)?.name).filter(Boolean).join('、')
          return [team.name, members, team.assetCount, team.description ?? '']
        }),
      ])
      return
    }
    const headers = canLinkAccount
      ? ['姓名', '登录账号', '所属团队', '关联资产', '备注']
      : ['姓名', '所属团队', '关联资产', '备注']
    downloadCSV('dc-db-people.csv', [
      headers,
      ...selectedItems.map(entry => {
        const person = entry as Person
        const teamNames = teamNamesByPerson.get(person.id)?.join('、') ?? ''
        return canLinkAccount
          ? [person.name, person.username ?? '', teamNames, person.assetCount, person.description ?? '']
          : [person.name, teamNames, person.assetCount, person.description ?? '']
      }),
    ])
  }

  async function removeSelected() {
    if (bulkDeleting || busy || deletableSelected.length === 0) return
    const targets = [...deletableSelected]
    const targetKind = kind
    const targetUnit = targetKind === 'teams' ? '个团队' : '名人员'
    setBulkDeleting(true)
    setBulkError('')
    const deletedIds: string[] = []
    const failures: string[] = []
    let sessionExpired = false
    try {
      for (const entry of targets) {
        try {
          await api(`/${targetKind}/${entry.id}`, 'DELETE')
          deletedIds.push(String(entry.id))
        } catch (error) {
          if (error instanceof APIError && error.status === 401) {
            sessionExpired = true
            onSessionError(error)
            break
          }
          failures.push(`${entry.name}：${error instanceof Error ? error.message : '删除失败'}`)
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
        try {
          await onRefresh()
        } catch (error) {
          failures.push(`刷新列表失败：${errorMessage(error)}`)
        }
      }
      if (failures.length > 0) {
        setBulkError(
          deletedIds.length > 0
            ? `已删除 ${deletedIds.length} ${targetUnit}，${failures.length} 项处理失败：${failures.join('；')}`
            : `删除失败：${failures.join('；')}`,
        )
      }
    } finally {
      setBulkDeleting(false)
      setBulkDeleteOpen(false)
    }
  }

  const columns: ColumnDef<Entry>[] = [
    createRowSelectionColumn<Entry>({
      getRowLabel: row => `选择${title} ${row.name}`,
    }),
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
      enableSorting: false,
      meta: {
        filter: {
          options: memberFilterOptions,
          selectedValues: memberFilter,
          onChange: setMemberFilter,
          searchPlaceholder: '搜索成员…',
        },
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
      enableSorting: false,
      meta: {
        cellClassName: 'whitespace-nowrap',
        filter: {
          options: accountFilterOptions,
          selectedValues: accountFilter,
          onChange: setAccountFilter,
        },
      },
      cell: ({ row }) => {
        const username = (row.original as Person).username
        return username ? <span className="font-mono text-xs">{username}</span> : <span className="text-muted-foreground">—</span>
      },
    } satisfies ColumnDef<Entry>] : []),
    ...(!teamPage ? [{
      id: 'teams',
      header: '所属团队',
      accessorFn: (row: Entry) => teamNamesByPerson.get(row.id)?.join('、') ?? '',
      enableSorting: false,
      meta: {
        filter: {
          options: teamFilterOptions,
          selectedValues: teamFilter,
          onChange: setTeamFilter,
          searchPlaceholder: '搜索团队…',
        },
      },
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
      enableSorting: false,
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

  const usedAccounts = new Set(people.filter(person => person.id !== editing?.id).map(person => person.username))

  return <>
    <PageHeader
      title={title}
      filters={
        <>
          <Input type="search" aria-label={`搜索${title}`} placeholder={`搜索${title}名称或备注`} className="h-8 w-[240px]" value={keyword} onChange={event => setKeyword(event.target.value)} />
          <DataTableViewOptions table={table} align="start" />
          <ClearFiltersButton count={activeFilterCount} onReset={resetColumnFilters} />
        </>
      }
      actions={editable && <Button size="sm" onClick={() => { void openEditor(null) }}><Plus />新增{title}</Button>}
    />
    {bulkError && (
      <div role="alert" className="mb-4 flex justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
        <span>{bulkError}</span>
        <button type="button" aria-label="关闭" onClick={() => setBulkError('')}>×</button>
      </div>
    )}
    <DataTable table={table} loading={loading} emptyMessage={hasActiveFilter ? `未找到匹配的${title}` : `暂无${title}`} />
    <BulkActionBar
      count={selectedItems.length}
      unit={teamPage ? '个团队' : '名人员'}
      onClear={() => setRowSelection({})}
      onExport={exportSelectedOrgCSV}
      onDelete={editable ? () => { setBulkError(''); setBulkDeleteOpen(true) } : undefined}
      deleteDisabled={busy || deletableSelected.length === 0}
      deleting={bulkDeleting}
    />

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
    <AlertDialog open={bulkDeleteOpen} onOpenChange={next => { if (!bulkDeleting) setBulkDeleteOpen(next) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除选中的 {deletableSelected.length} {teamPage ? '个团队' : '名人员'}？</AlertDialogTitle>
          <AlertDialogDescription>
            此操作会移除这 {deletableSelected.length} {teamPage ? '个团队及其成员关系' : '名人员及其团队成员关系'}，无法撤销。
            {blockedSelectedCount > 0 && ` 另外已选中的 ${blockedSelectedCount} ${teamPage ? '个团队' : '名人员'}仍有关联资产，将自动跳过（请先调整关联资产的归属后再删除）。`}
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
