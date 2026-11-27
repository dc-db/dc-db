import { type FormEvent, type JSX, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Check, ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, APIError, type Asset, type Group, type ServiceEntry, type ServiceInput } from '../api'
import { SERVICE_CATEGORIES, serviceCatalog } from '../serviceCatalog'
import { OptionSelect } from './OptionSelect'
import { ServiceIcon } from './ServiceIcon'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
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
  const [description, setDescription] = useState('')
  const [selectedAssetIds, setSelectedAssetIds] = useState<number[]>([])
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([])
  const [builtinOpen, setBuiltinOpen] = useState(false)
  const [assetOpen, setAssetOpen] = useState(false)
  const [projectOpen, setProjectOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) {
      setBuiltinOpen(false)
      setAssetOpen(false)
      setProjectOpen(false)
      return
    }
    setError('')
    setSaving(false)
    setBuiltinOpen(false)
    setAssetOpen(false)
    setProjectOpen(false)
    if (editing) {
      setName(editing.name)
      setCategory(editing.category || '其他')
      setBuiltin(editing.builtin)
      setDescription(editing.description ?? '')
      setSelectedAssetIds(editing.assets.map(a => a.id))
      setSelectedProjectIds(editing.projects.map(p => p.id))
    } else {
      setMode('builtin')
      setName('')
      setCategory('业务应用')
      setBuiltin(true)
      setDescription('')
      setSelectedAssetIds([])
      setSelectedProjectIds([])
    }
  }, [open, editing])

  const existingSet = useMemo(
    () => new Set(existingNames.map(n => n.trim().toLowerCase())),
    [existingNames],
  )

  const nodeAssets = useMemo(
    () => assets.filter(asset => asset.kind === 'host' || asset.kind === 'vm'),
    [assets],
  )

  const selectedAssets = useMemo(() => {
    const byId = new Map(nodeAssets.map(asset => [asset.id, asset]))
    return selectedAssetIds.map(id => byId.get(id)).filter((asset): asset is Asset => Boolean(asset))
  }, [nodeAssets, selectedAssetIds])

  const selectedProjects = useMemo(() => {
    const byId = new Map(groups.map(group => [group.id, group]))
    return selectedProjectIds.map(id => byId.get(id)).filter((group): group is Group => Boolean(group))
  }, [groups, selectedProjectIds])

  function switchMode(next: 'builtin' | 'custom') {
    if (next === mode) return
    setMode(next)
    setBuiltinOpen(false)
    setError('')
    setName('')
    setBuiltin(next === 'builtin')
    setCategory('业务应用')
  }

  function selectBuiltin(svcName: string, svcCategory: string) {
    setName(svcName)
    setCategory(svcCategory)
    setBuiltin(true)
    setError('')
    setBuiltinOpen(false)
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

    const payload: ServiceInput = {
      name: trimmedName,
      category: category || '其他',
      builtin: editing ? builtin : mode === 'builtin',
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
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-11">
          <DialogTitle>{editing ? '编辑服务' : '新增服务'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
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
                    className={cn(
                      'rounded-sm px-3 py-1.5 font-medium transition-colors',
                      mode === value
                        ? 'bg-background text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {!editing && mode === 'builtin' ? (
              <div className="space-y-1.5">
                <label htmlFor="service-builtin" className="text-sm font-medium">内置服务</label>
                <Popover open={builtinOpen} onOpenChange={setBuiltinOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      id="service-builtin"
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={builtinOpen}
                      className="h-9 w-full justify-between px-3 font-normal"
                    >
                      {name ? (
                        <span className="flex min-w-0 items-center gap-2">
                          <ServiceIcon name={name} category={category} />
                          <span className="truncate font-medium text-foreground">{name}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">请选择系统内置服务…</span>
                      )}
                      <ChevronDown
                        className={cn(
                          'ml-2 size-4 shrink-0 text-muted-foreground transition-transform',
                          builtinOpen && 'rotate-180',
                        )}
                      />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
                    <Command>
                      <CommandInput placeholder="搜索内置服务名称或分类…" className="h-8 text-sm" />
                      <CommandList className="max-h-64 overflow-y-auto" onWheel={e => e.stopPropagation()}>
                        <CommandEmpty>未找到匹配的内置服务</CommandEmpty>
                        {serviceCatalog.map(group => (
                          <CommandGroup key={group.category} heading={group.category}>
                            {group.names.map(svcName => {
                              const exists = existingSet.has(svcName.toLowerCase())
                              const selected = name === svcName
                              return (
                                <CommandItem
                                  key={svcName}
                                  value={`${svcName} ${group.category}`}
                                  disabled={exists}
                                  onSelect={() => {
                                    if (exists) return
                                    selectBuiltin(svcName, group.category)
                                  }}
                                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                                >
                                  <ServiceIcon name={svcName} category={group.category} />
                                  <span className="min-w-0 truncate">{svcName}</span>
                                  {exists ? (
                                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">已添加</span>
                                  ) : (
                                    <Check
                                      className={cn(
                                        'ml-auto size-4 shrink-0 text-foreground',
                                        selected ? 'opacity-100' : 'opacity-0',
                                      )}
                                    />
                                  )}
                                </CommandItem>
                              )
                            })}
                          </CommandGroup>
                        ))}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            ) : (
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
            )}

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
              <label htmlFor="service-assets" className="text-sm font-medium">部署节点</label>
              <Popover open={assetOpen} onOpenChange={setAssetOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="service-assets"
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={assetOpen}
                    className="h-9 w-full justify-between px-3 font-normal"
                  >
                    <span className={cn('truncate', selectedAssetIds.length === 0 && 'text-muted-foreground')}>
                      {selectedAssetIds.length > 0 ? `已选择 ${selectedAssetIds.length} 台节点` : '选择部署主机或虚拟机…'}
                    </span>
                    <ChevronDown
                      className={cn(
                        'ml-2 size-4 shrink-0 text-muted-foreground transition-transform',
                        assetOpen && 'rotate-180',
                      )}
                    />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
                  <Command>
                    <CommandInput placeholder="搜索主机名或 IP…" className="h-8 text-sm" />
                    <CommandList className="max-h-56 overflow-y-auto" onWheel={e => e.stopPropagation()}>
                      <CommandEmpty>未找到匹配的部署节点</CommandEmpty>
                      <CommandGroup>
                        {nodeAssets.map(asset => {
                          const checked = selectedAssetIds.includes(asset.id)
                          const kindLabel = asset.kind === 'host' ? '服务器' : '虚拟机'
                          return (
                            <CommandItem
                              key={asset.id}
                              value={`${asset.name} ${asset.address ?? ''} ${kindLabel}`}
                              onSelect={() => setSelectedAssetIds(prev => toggleId(prev, asset.id))}
                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                            >
                              <span
                                className={cn(
                                  'flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors',
                                  checked
                                    ? 'border-foreground bg-foreground text-background'
                                    : 'border-input bg-background',
                                )}
                              >
                                {checked && <Check className="size-3 text-background" />}
                              </span>
                              <span className="min-w-0 flex-1 truncate">{asset.name}</span>
                              <Badge variant="outline" className="shrink-0 text-[11px]">
                                {kindLabel}
                              </Badge>
                              {asset.address && (
                                <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                                  {asset.address}
                                </span>
                              )}
                            </CommandItem>
                          )
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedAssets.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {selectedAssets.map(asset => (
                    <Badge key={asset.id} variant="secondary" className="gap-1 pr-1 font-normal">
                      <span className="max-w-[180px] truncate">{asset.name}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedAssetIds(prev => prev.filter(id => id !== asset.id))}
                        className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
                        aria-label={`移除 ${asset.name}`}
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="service-projects" className="text-sm font-medium">依赖项目</label>
              <Popover open={projectOpen} onOpenChange={setProjectOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="service-projects"
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={projectOpen}
                    className="h-9 w-full justify-between px-3 font-normal"
                  >
                    <span className={cn('truncate', selectedProjectIds.length === 0 && 'text-muted-foreground')}>
                      {selectedProjectIds.length > 0 ? `已选择 ${selectedProjectIds.length} 个项目` : '选择依赖项目…'}
                    </span>
                    <ChevronDown
                      className={cn(
                        'ml-2 size-4 shrink-0 text-muted-foreground transition-transform',
                        projectOpen && 'rotate-180',
                      )}
                    />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
                  <Command>
                    <CommandInput placeholder="搜索项目名称…" className="h-8 text-sm" />
                    <CommandList className="max-h-52 overflow-y-auto" onWheel={e => e.stopPropagation()}>
                      <CommandEmpty>未找到匹配的项目</CommandEmpty>
                      <CommandGroup>
                        {groups.map(group => {
                          const checked = selectedProjectIds.includes(group.id)
                          return (
                            <CommandItem
                              key={group.id}
                              value={group.name}
                              onSelect={() => setSelectedProjectIds(prev => toggleId(prev, group.id))}
                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                            >
                              <span
                                className={cn(
                                  'flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors',
                                  checked
                                    ? 'border-foreground bg-foreground text-background'
                                    : 'border-input bg-background',
                                )}
                              >
                                {checked && <Check className="size-3 text-background" />}
                              </span>
                              <span className="min-w-0 flex-1 truncate">{group.name}</span>
                            </CommandItem>
                          )
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedProjects.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {selectedProjects.map(group => (
                    <Badge key={group.id} variant="secondary" className="gap-1 pr-1 font-normal">
                      <span className="max-w-[180px] truncate">{group.name}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedProjectIds(prev => prev.filter(id => id !== group.id))}
                        className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
                        aria-label={`移除 ${group.name}`}
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
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
          </div>

          <DialogFooter className="m-0 shrink-0">
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
