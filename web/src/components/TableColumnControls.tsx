import { useMemo, useState, type JSX, type ReactNode } from 'react'
import type { Table as TanStackTable } from '@tanstack/react-table'
import { Check, ChevronDown, ChevronUp, ChevronsUpDown, EyeOff, ListFilter, Search, Settings2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'

export type SortDirection = 'asc' | 'desc' | false

export const EMPTY_FILTER_VALUE = '__empty__'

export interface ColumnFilterOption {
  value: string
  label: string
  count?: number
}

export interface ColumnFilterConfig {
  options: ColumnFilterOption[]
  selectedValues: string[]
  onChange: (nextValues: string[]) => void
  searchPlaceholder?: string
  emptyLabel?: string
}

export interface ColumnHeaderMenuProps {
  title: ReactNode
  sortable?: boolean
  sortDirection?: SortDirection
  onSortChange?: (next: SortDirection) => void
  filter?: ColumnFilterConfig
  hideable?: boolean
  onHide?: () => void
  align?: 'start' | 'center' | 'end'
  className?: string
}

export interface ClearFiltersButtonProps {
  count: number
  onReset: () => void
  className?: string
}

export function ClearFiltersButton({
  count,
  onReset,
  className,
}: ClearFiltersButtonProps): JSX.Element | null {
  if (count <= 0) return null

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onReset}
      className={cn(
        'h-8 gap-1.5 px-2.5 text-sm font-normal text-muted-foreground hover:text-foreground',
        className,
      )}
    >
      <span className="inline-flex items-center gap-1">
        <span>重置筛选</span>
        <span className="tabular-nums">({count})</span>
      </span>
      <X className="size-3.5" aria-hidden="true" />
    </Button>
  )
}

export interface BuildFacetedOptionsConfig<T> {
  items: T[]
  /** Extract 0, 1, or many (e.g. teams/tags) option values & labels from a row. Return null/undefined/'' for empty. */
  getEntries: (
    item: T,
  ) =>
    | Array<{ value: string; label: string } | string>
    | { value: string; label: string }
    | string
    | null
    | undefined
  /** Optional fixed order/catalog of known options (ensures known enum options show in canonical order even when count=0 if includeZeroCatalog=true). */
  catalog?: Array<{ value: string; label: string }>
  includeEmpty?: boolean
  emptyLabel?: string
  includeZeroCatalog?: boolean
  selectedValues?: string[]
}

export function buildFacetedOptions<T>({
  items,
  getEntries,
  catalog,
  includeEmpty = false,
  emptyLabel = '未设置',
  includeZeroCatalog = false,
  selectedValues,
}: BuildFacetedOptionsConfig<T>): ColumnFilterOption[] {
  const counts = new Map<string, number>()
  const labels = new Map<string, string>()
  const catalogEntries: Array<{ value: string; label: string }> = []
  const catalogValues = new Set<string>()

  if (catalog) {
    for (const entry of catalog) {
      const value = entry.value.trim()
      if (!value || value === EMPTY_FILTER_VALUE || catalogValues.has(value)) continue
      catalogValues.add(value)
      const label = entry.label.trim() || value
      catalogEntries.push({ value, label })
      labels.set(value, label)
    }
  }

  let emptyCount = 0

  for (const item of items) {
    const raw = getEntries(item)
    const normalized: Array<{ value: string; label: string }> = []

    if (typeof raw === 'string') {
      const trimmed = raw.trim()
      if (trimmed) {
        normalized.push({ value: trimmed, label: trimmed })
      }
    } else if (Array.isArray(raw)) {
      for (const entry of raw) {
        if (typeof entry === 'string') {
          const trimmed = entry.trim()
          if (trimmed) normalized.push({ value: trimmed, label: trimmed })
          continue
        }
        if (!entry || typeof entry.value !== 'string') continue
        const value = entry.value.trim()
        if (!value) continue
        normalized.push({ value, label: entry.label.trim() || value })
      }
    } else if (raw && typeof raw.value === 'string') {
      const value = raw.value.trim()
      if (value) {
        normalized.push({ value, label: raw.label.trim() || value })
      }
    }

    const rowNonEmptyValues = new Set<string>()
    let rowHasExplicitEmpty = false

    for (const entry of normalized) {
      if (entry.value === EMPTY_FILTER_VALUE) {
        rowHasExplicitEmpty = true
        continue
      }
      if (rowNonEmptyValues.has(entry.value)) continue
      rowNonEmptyValues.add(entry.value)
      counts.set(entry.value, (counts.get(entry.value) ?? 0) + 1)
      if (!labels.has(entry.value)) {
        labels.set(entry.value, entry.label)
      }
    }

    if (rowNonEmptyValues.size === 0 || rowHasExplicitEmpty) {
      emptyCount += 1
    }
  }

  const selectedSet = new Set(selectedValues ?? [])
  const result: ColumnFilterOption[] = []

  for (const entry of catalogEntries) {
    const count = counts.get(entry.value) ?? 0
    if (count > 0 || includeZeroCatalog || selectedSet.has(entry.value)) {
      result.push({ value: entry.value, label: entry.label, count })
    }
  }

  const dynamicOptions: ColumnFilterOption[] = []
  for (const [value, count] of counts.entries()) {
    if (catalogValues.has(value)) continue
    dynamicOptions.push({
      value,
      label: labels.get(value) ?? value,
      count,
    })
  }
  for (const selectedValue of selectedSet) {
    if (
      selectedValue === EMPTY_FILTER_VALUE
      || catalogValues.has(selectedValue)
      || counts.has(selectedValue)
    ) {
      continue
    }
    dynamicOptions.push({
      value: selectedValue,
      label: labels.get(selectedValue) ?? selectedValue,
      count: 0,
    })
  }

  dynamicOptions.sort((a, b) => {
    const byLabel = a.label.localeCompare(b.label, 'zh-CN', { numeric: true })
    return byLabel !== 0 ? byLabel : a.value.localeCompare(b.value, 'zh-CN', { numeric: true })
  })

  result.push(...dynamicOptions)

  if ((includeEmpty && emptyCount > 0) || selectedSet.has(EMPTY_FILTER_VALUE)) {
    result.push({
      value: EMPTY_FILTER_VALUE,
      label: emptyLabel,
      count: emptyCount,
    })
  }

  return result
}

export function matchesMultiFilter(
  selectedValues: string[] | undefined,
  rowValues: string | string[] | null | undefined,
): boolean {
  if (!selectedValues || selectedValues.length === 0) return true

  let normalized: string[]
  if (rowValues == null) {
    normalized = []
  } else if (Array.isArray(rowValues)) {
    normalized = rowValues.map(value => value.trim()).filter(Boolean)
  } else {
    const trimmed = rowValues.trim()
    normalized = trimmed ? [trimmed] : []
  }

  if (normalized.length === 0) {
    return selectedValues.includes(EMPTY_FILTER_VALUE)
  }

  return normalized.some(value => selectedValues.includes(value))
}

export function ColumnHeaderMenu({
  title,
  sortable = false,
  sortDirection = false,
  onSortChange,
  filter,
  hideable = false,
  onHide,
  align = 'start',
  className,
}: ColumnHeaderMenuProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const canSort = Boolean(sortable)
  const canFilter = Boolean(filter)
  const canHide = Boolean(hideable && onHide)

  const selectedSet = useMemo(
    () => new Set(filter?.selectedValues ?? []),
    [filter?.selectedValues],
  )
  const activeFilterCount = selectedSet.size

  const resolvedOptions = useMemo(() => {
    if (!filter) return []
    const existingValues = new Set(filter.options.map(option => option.value))
    const missingSelected = Array.from(selectedSet).filter(value => !existingValues.has(value))
    if (!missingSelected.length) return filter.options

    const hasCounts = filter.options.some(option => option.count !== undefined)
    const extraNonEmpty: ColumnFilterOption[] = []
    let extraEmpty: ColumnFilterOption | null = null

    for (const value of missingSelected) {
      const fallback: ColumnFilterOption = {
        value,
        label: value === EMPTY_FILTER_VALUE ? '未设置' : value,
        ...(hasCounts ? { count: 0 } : {}),
      }
      if (value === EMPTY_FILTER_VALUE) {
        extraEmpty = fallback
      } else {
        extraNonEmpty.push(fallback)
      }
    }

    const next = [...filter.options]
    const emptyIdx = next.findIndex(option => option.value === EMPTY_FILTER_VALUE)
    if (emptyIdx >= 0) {
      next.splice(emptyIdx, 0, ...extraNonEmpty)
    } else {
      next.push(...extraNonEmpty)
      if (extraEmpty) next.push(extraEmpty)
    }
    return next
  }, [filter, selectedSet])

  const showSearch = resolvedOptions.length > 6
  const needle = query.trim().toLowerCase()
  const visibleOptions = useMemo(() => {
    if (!showSearch || !needle) return resolvedOptions
    return resolvedOptions.filter(option => option.label.toLowerCase().includes(needle))
  }, [needle, resolvedOptions, showSearch])

  if (!canSort && !canFilter && !canHide) {
    return <span className={className}>{title}</span>
  }

  if (!filter) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={e => e.stopPropagation()}
            className={cn(
              '-ml-1.5 inline-flex h-8 max-w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:bg-accent',
              className,
            )}
          >
            <span className="truncate">{title}</span>
            {canSort && (
              sortDirection === 'asc'
                ? <ChevronUp className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                : sortDirection === 'desc'
                  ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  : <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-32" onClick={e => e.stopPropagation()}>
          {canSort && (
            <>
              <DropdownMenuItem
                role="menuitemcheckbox"
                aria-checked={sortDirection === 'asc'}
                onSelect={() => onSortChange?.(sortDirection === 'asc' ? false : 'asc')}
                className="flex items-center gap-2 px-2 py-1.5 text-sm"
              >
                <ChevronUp className="size-4 text-muted-foreground" aria-hidden="true" />
                <span>升序</span>
                <Check
                  className={cn(
                    'ml-auto size-4 shrink-0 text-foreground',
                    sortDirection === 'asc' ? 'opacity-100' : 'opacity-0',
                  )}
                  aria-hidden="true"
                />
              </DropdownMenuItem>
              <DropdownMenuItem
                role="menuitemcheckbox"
                aria-checked={sortDirection === 'desc'}
                onSelect={() => onSortChange?.(sortDirection === 'desc' ? false : 'desc')}
                className="flex items-center gap-2 px-2 py-1.5 text-sm"
              >
                <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
                <span>降序</span>
                <Check
                  className={cn(
                    'ml-auto size-4 shrink-0 text-foreground',
                    sortDirection === 'desc' ? 'opacity-100' : 'opacity-0',
                  )}
                  aria-hidden="true"
                />
              </DropdownMenuItem>
            </>
          )}
          {canHide && (
            <DropdownMenuItem
              onSelect={() => onHide?.()}
              className="flex items-center gap-2 px-2 py-1.5 text-sm"
            >
              <EyeOff className="size-4 text-muted-foreground" aria-hidden="true" />
              <span>隐藏</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      setQuery('')
    }
  }

  const toggleFilterValue = (value: string) => {
    if (selectedSet.has(value)) {
      filter.onChange(filter.selectedValues.filter(v => v !== value))
    } else {
      filter.onChange([...filter.selectedValues, value])
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-filtered={activeFilterCount > 0 ? 'true' : undefined}
          onClick={e => e.stopPropagation()}
          className={cn(
            '-ml-1.5 inline-flex h-8 max-w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:bg-accent',
            activeFilterCount > 0
              ? 'bg-accent/70 text-foreground hover:bg-accent'
              : 'text-foreground hover:bg-accent',
            className,
          )}
        >
          <span className="truncate">{title}</span>
          {activeFilterCount > 0 && (
            <span
              className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-sm bg-primary px-1 text-[11px] font-medium leading-none text-primary-foreground tabular-nums"
              aria-label={`已选 ${activeFilterCount} 项筛选`}
            >
              {activeFilterCount}
            </span>
          )}
          {canSort ? (
            sortDirection === 'asc'
              ? <ChevronUp className="size-4 shrink-0 text-foreground" aria-hidden="true" />
              : sortDirection === 'desc'
                ? <ChevronDown className="size-4 shrink-0 text-foreground" aria-hidden="true" />
                : (
                  <ChevronsUpDown
                    className={cn(
                      'size-4 shrink-0',
                      activeFilterCount > 0 ? 'text-foreground' : 'text-muted-foreground',
                    )}
                    aria-hidden="true"
                  />
                )
          ) : (
            <ListFilter
              className={cn(
                'size-3.5 shrink-0',
                activeFilterCount > 0 ? 'text-foreground' : 'text-muted-foreground',
              )}
              aria-hidden="true"
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-56 p-1" onClick={e => e.stopPropagation()}>
        {canSort && (
          <>
            <button
              type="button"
              aria-pressed={sortDirection === 'asc'}
              onClick={() => {
                onSortChange?.(sortDirection === 'asc' ? false : 'asc')
                handleOpenChange(false)
              }}
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-popover-foreground transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
            >
              <ChevronUp className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>升序</span>
              <Check
                className={cn(
                  'ml-auto size-4 shrink-0 text-foreground',
                  sortDirection === 'asc' ? 'opacity-100' : 'opacity-0',
                )}
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              aria-pressed={sortDirection === 'desc'}
              onClick={() => {
                onSortChange?.(sortDirection === 'desc' ? false : 'desc')
                handleOpenChange(false)
              }}
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-popover-foreground transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
            >
              <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>降序</span>
              <Check
                className={cn(
                  'ml-auto size-4 shrink-0 text-foreground',
                  sortDirection === 'desc' ? 'opacity-100' : 'opacity-0',
                )}
                aria-hidden="true"
              />
            </button>
            <div className="-mx-1 my-1 h-px bg-border" />
          </>
        )}

        <div>
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs font-medium text-muted-foreground">筛选</span>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={() => filter.onChange([])}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
              >
                清除
              </button>
            )}
          </div>

          {showSearch && (
            <div className="relative px-1 pb-1.5">
              <Search
                className="pointer-events-none absolute top-2 left-3 size-3.5 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="text"
                aria-label={filter.searchPlaceholder ?? '搜索选项'}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={filter.searchPlaceholder ?? '搜索选项'}
                className="h-7 w-full rounded-md border border-input bg-background pr-2 pl-7 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring"
              />
            </div>
          )}

          <div className="max-h-52 space-y-0.5 overflow-y-auto" role="listbox" aria-multiselectable="true">
            {visibleOptions.length > 0 ? (
              visibleOptions.map(option => {
                const selected = selectedSet.has(option.value)
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => toggleFilterValue(option.value)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-popover-foreground transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  >
                    <span
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors',
                        selected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-muted-foreground/40 bg-transparent',
                      )}
                      aria-hidden="true"
                    >
                      <Check className={cn('size-3', selected ? 'opacity-100' : 'opacity-0')} />
                    </span>
                    <span className="min-w-0 flex-1 truncate" title={option.label}>
                      {option.label}
                    </span>
                    {option.count !== undefined && (
                      <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                        {option.count}
                      </span>
                    )}
                  </button>
                )
              })
            ) : (
              <div className="py-3 text-center text-xs text-muted-foreground">
                {filter.emptyLabel ?? '无匹配选项'}
              </div>
            )}
          </div>
        </div>

        {canHide && (
          <>
            <div className="-mx-1 my-1 h-px bg-border" />
            <button
              type="button"
              onClick={() => {
                onHide?.()
                handleOpenChange(false)
              }}
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-popover-foreground transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
            >
              <EyeOff className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>隐藏</span>
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

export interface ViewColumnOption {
  id: string
  label: string
  visible: boolean
  disabled?: boolean
}

export interface DataTableViewOptionsBaseProps {
  label?: string
  align?: 'start' | 'center' | 'end'
  className?: string
}

export interface ManualDataTableViewOptionsProps extends DataTableViewOptionsBaseProps {
  columns: ViewColumnOption[]
  onToggle: (columnId: string, nextVisible: boolean) => void
  table?: never
  labels?: never
}

export interface TanStackDataTableViewOptionsProps<TData> extends DataTableViewOptionsBaseProps {
  table: TanStackTable<TData>
  labels?: Record<string, string>
  columns?: never
  onToggle?: never
}

export type DataTableViewOptionsProps<TData = unknown> =
  | ManualDataTableViewOptionsProps
  | TanStackDataTableViewOptionsProps<TData>

function isSystemColumn(id: string): boolean {
  return id === 'select' || id === 'actions'
}

export function getTanStackViewColumns<TData>(
  table: TanStackTable<TData>,
  labels?: Record<string, string>,
): ViewColumnOption[] {
  return table
    .getAllLeafColumns()
    .filter(column => !isSystemColumn(column.id) && column.getCanHide())
    .map(column => {
      const metaLabel = (column.columnDef.meta as { label?: string } | undefined)?.label
      const headerLabel = typeof column.columnDef.header === 'string' ? column.columnDef.header : undefined
      return {
        id: column.id,
        label: labels?.[column.id] ?? metaLabel ?? headerLabel ?? column.id,
        visible: column.getIsVisible(),
      }
    })
}

export function DataTableViewOptions<TData = unknown>(props: DataTableViewOptionsProps<TData>) {
  const { label, align = 'end', className } = props
  const resolvedColumns = 'table' in props && props.table
    ? getTanStackViewColumns(props.table, props.labels)
    : props.columns
  const handleToggle = 'table' in props && props.table
    ? (columnId: string, nextVisible: boolean) => {
        props.table.getColumn(columnId)?.toggleVisibility(nextVisible)
      }
    : props.onToggle

  if (!resolvedColumns.length) return null

  const lockedVisibleCount = 'table' in props && props.table
    ? props.table
        .getVisibleLeafColumns()
        .filter(column => !isSystemColumn(column.id) && !column.getCanHide())
        .length
    : 0
  const totalVisibleCount = resolvedColumns.filter(col => col.visible).length + lockedVisibleCount

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="切换显示列"
          className={cn('h-8 gap-1.5 rounded-lg px-2.5 text-sm font-medium', className)}
        >
          <Settings2 className="size-4 text-muted-foreground" aria-hidden="true" />
          <span>{label ?? '视图'}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-44 p-0">
        <Command className="p-0.5">
          <CommandInput aria-label="搜索列" placeholder="搜索列" className="h-8 text-sm" />
          <CommandList className="max-h-72">
            <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">未找到匹配的列</CommandEmpty>
            <CommandGroup className="p-1">
              {resolvedColumns.map(col => {
                const isLastVisible = col.visible && totalVisibleCount <= 1
                const isDisabled = Boolean(col.disabled) || isLastVisible
                return (
                  <CommandItem
                    key={col.id}
                    value={col.label}
                    disabled={isDisabled}
                    onSelect={() => {
                      if (!isDisabled) handleToggle(col.id, !col.visible)
                    }}
                    className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm"
                  >
                    <span className="truncate">{col.label}</span>
                    <Check
                      className={cn(
                        'ml-auto size-4 shrink-0 text-foreground',
                        col.visible ? 'opacity-100' : 'opacity-0',
                      )}
                      aria-hidden="true"
                    />
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
