import { useId, useMemo, useState } from 'react'
import { Check, ChevronDown, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ServiceEntry } from '../api'
import { serviceCatalog, serviceCategory } from '../serviceCatalog'
import { ServiceIcon } from './ServiceIcon'
import { Button } from './ui/button'
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from './ui/command'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'

export interface ServicePickerProps {
  value: string
  onChange: (value: string) => void
  registeredServices?: ServiceEntry[]
  excludedNames?: string[]
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

const BUILTIN_ITEMS = serviceCatalog.flatMap(group =>
  group.names.map(name => ({ name, category: group.category })),
)

export function ServicePicker({
  value,
  onChange,
  registeredServices,
  excludedNames,
}: ServicePickerProps) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const currentNorm = normalizeName(value)
  const trimmedQuery = query.trim()
  const queryNorm = trimmedQuery.toLowerCase()

  const excludedSet = useMemo(() => {
    const set = new Set<string>()
    for (const raw of excludedNames ?? []) {
      const norm = normalizeName(raw)
      if (norm && norm !== currentNorm) set.add(norm)
    }
    return set
  }, [excludedNames, currentNorm])

  const sortedRegistered = useMemo(() => {
    if (!registeredServices?.length) return []
    return [...registeredServices].sort((a, b) =>
      a.name.localeCompare(b.name, 'zh-CN', { sensitivity: 'base' }),
    )
  }, [registeredServices])

  const registeredByNorm = useMemo(() => {
    const map = new Map<string, ServiceEntry>()
    for (const svc of sortedRegistered) {
      const norm = normalizeName(svc.name)
      if (norm && !map.has(norm)) map.set(norm, svc)
    }
    return map
  }, [sortedRegistered])

  const allKnownNormSet = useMemo(() => {
    const set = new Set<string>(registeredByNorm.keys())
    for (const item of BUILTIN_ITEMS) {
      set.add(normalizeName(item.name))
    }
    return set
  }, [registeredByNorm])

  const filteredRegistered = useMemo(() => {
    return sortedRegistered.filter(svc => {
      const norm = normalizeName(svc.name)
      if (excludedSet.has(norm)) return false
      if (!queryNorm) return true
      const cat = svc.category?.trim() || serviceCategory(svc.name) || ''
      const sourceText = svc.builtin ? '系统内置' : '自定义'
      return (
        norm.includes(queryNorm) ||
        cat.toLowerCase().includes(queryNorm) ||
        sourceText.includes(queryNorm) ||
        (svc.description ?? '').toLowerCase().includes(queryNorm)
      )
    })
  }, [sortedRegistered, excludedSet, queryNorm])

  const filteredBuiltin = useMemo(() => {
    return BUILTIN_ITEMS.filter(item => {
      const norm = normalizeName(item.name)
      if (registeredByNorm.has(norm)) return false
      if (excludedSet.has(norm)) return false
      if (!queryNorm) return true
      return norm.includes(queryNorm) || item.category.toLowerCase().includes(queryNorm)
    })
  }, [registeredByNorm, excludedSet, queryNorm])

  const isQueryExcluded = Boolean(queryNorm && excludedSet.has(queryNorm))
  const canCreateCustom = Boolean(
    trimmedQuery &&
      trimmedQuery.length <= 120 &&
      !isQueryExcluded &&
      !allKnownNormSet.has(queryNorm),
  )

  const selectedCategory = currentNorm
    ? registeredByNorm.get(currentNorm)?.category?.trim() || serviceCategory(value)
    : undefined

  const excludedCategory = isQueryExcluded
    ? registeredByNorm.get(queryNorm)?.category?.trim() || serviceCategory(trimmedQuery)
    : undefined

  function choose(next: string) {
    onChange(next)
    setOpen(false)
    setQuery('')
  }

  const hasMatches = filteredRegistered.length > 0 || filteredBuiltin.length > 0

  return (
    <div className="grid min-w-0 gap-1">
      <label className="service-picker-label" htmlFor={id}>
        服务名称
      </label>
      <Popover
        open={open}
        onOpenChange={next => {
          setOpen(next)
          if (!next) setQuery('')
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={value ? `服务名称：${value}` : '选择或搜索服务'}
            className={cn(
              'h-9 w-full justify-between rounded-md px-3 text-sm font-normal',
              'border-border bg-background hover:bg-accent hover:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
              value ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {value ? (
              <span className="flex min-w-0 items-center gap-2">
                <ServiceIcon name={value} category={selectedCategory} />
                <span className="truncate text-foreground">{value}</span>
              </span>
            ) : (
              <span className="truncate">选择已有服务或输入自定义名称…</span>
            )}
            <ChevronDown
              className={cn(
                'ml-2 size-4 shrink-0 text-muted-foreground transition-transform duration-150',
                open && 'rotate-180',
              )}
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] min-w-72 p-0"
        >
          <Command shouldFilter={false} label="选择运行服务">
            <CommandInput
              aria-label="搜索服务或输入自定义名称"
              placeholder="搜索服务或输入自定义名称…"
              maxLength={120}
              value={query}
              onValueChange={setQuery}
              className="h-8 text-sm"
            />
            <CommandList
              className="max-h-64 overflow-y-auto"
              onWheel={event => event.stopPropagation()}
            >
              {isQueryExcluded && (
                <CommandGroup>
                  <CommandItem
                    disabled
                    value={`excluded:${queryNorm}`}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground"
                  >
                    <ServiceIcon name={trimmedQuery} category={excludedCategory} />
                    <span className="min-w-0 flex-1 truncate">{trimmedQuery}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      该服务已添加到当前资产
                    </span>
                  </CommandItem>
                </CommandGroup>
              )}

              {isQueryExcluded && hasMatches && <CommandSeparator />}

              {filteredRegistered.length > 0 && (
                <CommandGroup heading="已登记服务">
                  {filteredRegistered.map(svc => {
                    const cat = svc.category?.trim() || serviceCategory(svc.name) || ''
                    const selected = normalizeName(svc.name) === currentNorm
                    return (
                      <CommandItem
                        key={svc.id}
                        value={`registered:${svc.id}:${svc.name}`}
                        onSelect={() => choose(svc.name)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                      >
                        <ServiceIcon name={svc.name} category={cat || undefined} />
                        <span className="min-w-0 flex-1 truncate">{svc.name}</span>
                        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                          {cat && <span>{cat}</span>}
                          {!svc.builtin && (
                            <span className="rounded border border-border px-1 py-0 text-[10px] leading-4 text-muted-foreground">
                              自定义
                            </span>
                          )}
                          {selected && <Check className="size-3.5 text-foreground" aria-hidden="true" />}
                        </span>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              )}

              {filteredRegistered.length > 0 && filteredBuiltin.length > 0 && <CommandSeparator />}

              {filteredBuiltin.length > 0 && (
                <CommandGroup heading="内置服务目录">
                  {filteredBuiltin.map(item => {
                    const selected = normalizeName(item.name) === currentNorm
                    return (
                      <CommandItem
                        key={item.name}
                        value={`builtin:${item.name}`}
                        onSelect={() => choose(item.name)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                      >
                        <ServiceIcon name={item.name} category={item.category} />
                        <span className="min-w-0 flex-1 truncate">{item.name}</span>
                        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                          <span>{item.category}</span>
                          {selected && <Check className="size-3.5 text-foreground" aria-hidden="true" />}
                        </span>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              )}

              {hasMatches && canCreateCustom && <CommandSeparator />}

              {canCreateCustom && (
                <CommandGroup heading="自定义服务">
                  <CommandItem
                    value={`custom:${trimmedQuery}`}
                    onSelect={() => choose(trimmedQuery)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                  >
                    <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">
                      新增自定义服务「{trimmedQuery}」
                    </span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      保存后自动登记
                    </span>
                  </CommandItem>
                </CommandGroup>
              )}

              {!isQueryExcluded && !hasMatches && !canCreateCustom && (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  没有可选服务，可输入自定义名称添加
                </div>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
