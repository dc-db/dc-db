import { type FormEvent, type JSX, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Search } from 'lucide-react'
import { api, APIError, type Asset, type Group, type ServiceEntry, type ServiceInput } from '../api'
import { SERVICE_CATEGORIES, serviceCatalog, serviceDefaultPort } from '../serviceCatalog'
import { OptionSelect } from './OptionSelect'
import { ServiceIcon } from './ServiceIcon'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Checkbox } from './ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'

export interface ServiceFormDialogProps {
  open: boolean
  editing: ServiceEntry | null
  existingNames: string[]
  assets: Asset[]
  groups: Group[]
  onOpenChange: (open: boolean) => void
  onSaved: (saved: ServiceEntry, isEdit: boolean) => void
}

const BUILTIN_ITEMS = serviceCatalog.flatMap(group =>
  group.names.map(name => ({ name, category: group.category, port: serviceDefaultPort(name) })),
)
const BUILTIN_CATEGORY_OPTIONS = [
  { value: '', label: '全部分类' },
  ...serviceCatalog.map(group => ({ value: group.category, label: group.category })),
]
const CATEGORY_OPTIONS = SERVICE_CATEGORIES.map(cat => ({ value: cat, label: cat }))

function toggleId(list: number[], id: number): number[] {
  return list.includes(id) ? list.filter(item => item !== id) : [...list, id]
}

export function ServiceFormDialog({
  open, editing, existingNames, assets, groups, onOpenChange, onSaved,
}: ServiceFormDialogProps): JSX.Element {
  const [mode, setMode] = useState<'builtin' | 'custom'>('builtin')
  const [name, setName] = useState('')
  const [category, setCategory] = useState<string>('业务应用')
  const [builtin, setBuiltin] = useState(true)
  const [port, setPort] = useState('')
  const [description, setDescription] = useState('')
  const [selectedAssetIds, setSelectedAssetIds] = useState<number[]>([])
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([])
  const [builtinCategory, setBuiltinCategory] = useState('')
  const [builtinQuery, setBuiltinQuery] = useState('')
  const [assetQuery, setAssetQuery] = useState('')
  const [projectQuery, setProjectQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setSaving(false)
    setBuiltinCategory('')
    setBuiltinQuery('')
    setAssetQuery('')
    setProjectQuery('')
    if (editing) {
      setName(editing.name)
      setCategory(editing.category || '其他')
      setBuiltin(editing.builtin)
      setPort(editing.port ? String(editing.port) : '')
      setDescription(editing.description ?? '')
      setSelectedAssetIds(editing.assets.map(a => a.id))
      setSelectedProjectIds(editing.projects.map(p => p.id))
    } else {
      setMode('builtin')
      setName('')
      setCategory('业务应用')
      setBuiltin(true)
      setPort('')
      setDescription('')
      setSelectedAssetIds([])
      setSelectedProjectIds([])
    }
  }, [open, editing])

  const existingSet = useMemo(
    () => new Set(existingNames.map(n => n.trim().toLowerCase())),
    [existingNames],
  )

  const filteredBuiltins = useMemo(() => {
    const q = builtinQuery.trim().toLowerCase()
    return BUILTIN_ITEMS.filter(item => {
      if (builtinCategory && item.category !== builtinCategory) return false
      return !q || item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q)
    })
  }, [builtinCategory, builtinQuery])

  const nodeAssets = useMemo(() => {
    const q = assetQuery.trim().toLowerCase()
    return assets.filter(asset => {
      if (asset.kind !== 'host' && asset.kind !== 'vm') return false
      return !q || asset.name.toLowerCase().includes(q) || asset.address.toLowerCase().includes(q)
    })
  }, [assets, assetQuery])

  const filteredGroups = useMemo(() => {
    const q = projectQuery.trim().toLowerCase()
    return q ? groups.filter(g => g.name.toLowerCase().includes(q)) : groups
  }, [groups, projectQuery])

  function switchMode(next: 'builtin' | 'custom') {
    if (next === mode) return
    setMode(next)
    setError('')
    setName('')
    setPort('')
    setBuiltin(next === 'builtin')
    setCategory(next === 'builtin' ? '' : '业务应用')
  }

  function selectBuiltin(item: (typeof BUILTIN_ITEMS)[number]) {
    setName(item.name)
    setCategory(item.category)
    setPort(item.port ? String(item.port) : '')
    setBuiltin(true)
    setError('')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError(!editing && mode === 'builtin' ? '请选择一个内置服务' : '请填写服务名称')
      return
    }
    if (existingSet.has(trimmedName.toLowerCase())) {
      setError(`服务「${trimmedName}」已存在`)
      return
    }
    let parsedPort: number | null = null
    if (port.trim() !== '') {
      const num = Number(port)
      if (!Number.isInteger(num) || num < 1 || num > 65535) {
        setError('默认端口须为 1–65535 的整数')
        return
      }
      parsedPort = num
    }

    const payload: ServiceInput = {
      name: trimmedName,
      category: category || '其他',
      builtin: editing ? builtin : mode === 'builtin',
      port: parsedPort,
      description: description.trim(),
      assetIds: selectedAssetIds,
      projectIds: selectedProjectIds,
    }

    setSaving(true)
    setError('')
    try {
      const saved = await api<ServiceEntry>(
        editing ? `/services/${editing.id}` : '/services',
        editing ? 'PUT' : 'POST',
        payload,
      )
      onSaved(saved, Boolean(editing))
    } catch (err) {
      setError(err instanceof APIError ? err.message : '保存失败，请稍后重试')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? '编辑服务' : '新增服务'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!editing && (
            <div className="grid grid-cols-2 rounded-md border border-border bg-muted/50 p-0.5 text-sm">
              {([['builtin', '选择内置服务'], ['custom', '自定义服务']] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => switchMode(value)}
                  className={`rounded-sm px-3 py-1.5 font-medium transition-colors ${
                    mode === value
                      ? 'bg-background text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {!editing && mode === 'builtin' ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <OptionSelect
                  value={builtinCategory}
                  onChange={setBuiltinCategory}
                  options={BUILTIN_CATEGORY_OPTIONS}
                  label="服务分类"
                  className="w-36 shrink-0"
                />
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={builtinQuery}
                    onChange={e => setBuiltinQuery(e.target.value)}
                    placeholder="搜索内置服务…"
                    className="pl-8"
                  />
                </div>
              </div>
              <div className="grid max-h-44 grid-cols-2 gap-1.5 overflow-y-auto rounded-md border border-border p-1.5">
                {filteredBuiltins.map(item => {
                  const exists = existingSet.has(item.name.toLowerCase())
                  const selected = name === item.name
                  return (
                    <button
                      key={item.name}
                      type="button"
                      disabled={exists}
                      onClick={() => selectBuiltin(item)}
                      className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors ${
                        exists
                          ? 'cursor-not-allowed border-transparent bg-muted/40 text-muted-foreground opacity-60'
                          : selected
                            ? 'border-foreground bg-accent text-foreground'
                            : 'border-transparent hover:bg-accent/60'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <ServiceIcon name={item.name} category={item.category} />
                        <span className="truncate font-medium">{item.name}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {exists ? '已添加' : item.port ? `:${item.port}` : ''}
                      </span>
                    </button>
                  )
                })}
                {filteredBuiltins.length === 0 && (
                  <p className="col-span-2 py-4 text-center text-xs text-muted-foreground">无匹配的内置服务</p>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="service-name" className="text-sm font-medium">服务名称</label>
                <div className="flex items-center gap-2">
                  {editing && <ServiceIcon name={name} category={category} />}
                  <Input
                    id="service-name"
                    required
                    maxLength={120}
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="例如 order-api"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="service-category" className="text-sm font-medium">分类</label>
                  <OptionSelect
                    id="service-category"
                    value={category}
                    onChange={setCategory}
                    options={CATEGORY_OPTIONS}
                    className="w-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="service-port" className="text-sm font-medium">默认端口</label>
                  <Input
                    id="service-port"
                    type="number"
                    min={1}
                    max={65535}
                    value={port}
                    onChange={e => setPort(e.target.value)}
                    placeholder="可选，如 8080"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">部署节点 ({selectedAssetIds.length})</span>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={assetQuery}
                onChange={e => setAssetQuery(e.target.value)}
                placeholder="搜索服务器或虚拟机名称、IP…"
                className="h-8 pl-8 text-sm"
              />
            </div>
            <div className="max-h-36 space-y-0.5 overflow-y-auto rounded-md border border-border p-1.5">
              {nodeAssets.map(asset => {
                const checked = selectedAssetIds.includes(asset.id)
                return (
                  <label
                    key={asset.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent/60"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => setSelectedAssetIds(prev => toggleId(prev, asset.id))}
                    />
                    <span className="min-w-0 flex-1 truncate">{asset.name}</span>
                    <Badge variant="outline" className="shrink-0 text-[11px]">
                      {asset.kind === 'host' ? '服务器' : '虚拟机'}
                    </Badge>
                    {asset.address && (
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">{asset.address}</span>
                    )}
                  </label>
                )
              })}
              {nodeAssets.length === 0 && (
                <p className="py-3 text-center text-xs text-muted-foreground">暂无可选部署节点</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-sm font-medium">依赖项目 ({selectedProjectIds.length})</span>
            {groups.length > 6 && (
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={projectQuery}
                  onChange={e => setProjectQuery(e.target.value)}
                  placeholder="搜索项目名称…"
                  className="h-8 pl-8 text-sm"
                />
              </div>
            )}
            <div className="max-h-32 space-y-0.5 overflow-y-auto rounded-md border border-border p-1.5">
              {filteredGroups.map(group => {
                const checked = selectedProjectIds.includes(group.id)
                return (
                  <label
                    key={group.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent/60"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => setSelectedProjectIds(prev => toggleId(prev, group.id))}
                    />
                    <span className="min-w-0 flex-1 truncate">{group.name}</span>
                  </label>
                )
              })}
              {filteredGroups.length === 0 && (
                <p className="py-3 text-center text-xs text-muted-foreground">暂无可选项目</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="service-description" className="text-sm font-medium">备注</label>
            <Textarea
              id="service-description"
              maxLength={300}
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="可选，填写用途或说明"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              取消
            </Button>
            <Button type="submit" disabled={saving || (!editing && mode === 'builtin' && !name.trim())}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
