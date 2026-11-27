import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, CSSProperties } from 'react'
import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable } from '@tanstack/react-table'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ChevronDown, CircleAlert, CircleCheck, Eye, EyeOff, LoaderCircle, X } from 'lucide-react'
import { Button as UiButton } from '@/components/ui/button'
import { Input as UiInput } from '@/components/ui/input'
import { Checkbox as UiCheckbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Popover as UiPopover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tabs as UiTabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ColumnHeaderMenu, type ColumnFilterConfig } from './TableColumnControls'
import { TableFooterBar } from './TableFooterBar'
import { RowIndexSelectCell, RowIndexSelectHeader } from './TableSelectionControls'
import './app-controls.css'

type Common = { children?: ReactNode; className?: string; style?: CSSProperties; [key: string]: any }
export function Button({ children, type, htmlType, size, icon, loading, danger, block, className, ...props }: Common) {
  const variant = danger ? 'destructive' : type === 'primary' ? 'default' : type === 'link' ? 'link' : type === 'text' ? 'ghost' : 'outline'
  return <UiButton {...props} type={htmlType ?? 'button'} disabled={props.disabled || loading} variant={variant} size={size === 'small' ? 'sm' : size === 'large' ? 'lg' : 'default'} className={`${block ? 'w-full' : ''} ${className ?? ''}`}>{loading ? <LoaderCircle className="animate-spin" /> : icon}{children}</UiButton>
}
export function Card({ children, title, extra, className, variant }: Common) { return <section className={`control-card${variant === 'borderless' ? ' control-card-borderless' : ''} ${className ?? ''}`}>{(title || extra) && <header className="control-card-header"><strong>{title}</strong>{extra}</header>}<div className="control-card-body">{children}</div></section> }
export function Space({ children, direction, wrap, size, className }: Common) { return <span className={`control-space ${direction === 'vertical' ? 'vertical' : ''} ${className ?? ''}`} style={{ gap: typeof size === 'number' ? size : 8, flexWrap: wrap ? 'wrap' : undefined }}>{children}</span> }
export function Alert({ type, message, className, closable, onClose, showIcon }: Common) { return <div role="alert" className={`control-alert ${type ?? ''} ${className ?? ''}`}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>{showIcon && (type === 'success' ? <CircleCheck size={16} aria-hidden /> : <CircleAlert size={16} aria-hidden />)}{message}</span>{closable && <button type="button" onClick={onClose} aria-label="关闭"><X size={16} /></button>}</div> }
export function Spin({ size }: Common) { return <LoaderCircle aria-label="加载中" className="animate-spin" size={size === 'large' ? 28 : 18} /> }
export function Empty({ description }: Common) { return <div className="control-empty">{description ?? '暂无数据'}</div> }
export function Tag({ children, color, className, style, ...props }: Common) { const c = color && !['default','blue','green','red','orange'].includes(color) ? color : undefined; return <span {...props} className={`control-tag ${color ?? ''} ${className ?? ''}`} style={{ ...style, ...(c ? { color: c, borderColor: c } : {}) }}>{children}</span> }
export function Tooltip({ children, title }: Common) { return <UiTooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent>{title}</TooltipContent></UiTooltip> }
export function ConfigProvider({ children }: Common) { return <TooltipProvider>{children}</TooltipProvider> }
export const theme = { darkAlgorithm: {}, defaultAlgorithm: {} }
const notify = (text: string) => { window.dispatchEvent(new CustomEvent('dc-notice', { detail: text })) }
function AppProvider({ children }: Common) { const [notice, setNotice] = useState(''); React.useEffect(() => { let timer: number; const handler = (e: Event) => { setNotice((e as CustomEvent).detail); window.clearTimeout(timer); timer = window.setTimeout(() => setNotice(''), 3500) }; window.addEventListener('dc-notice', handler); return () => { window.removeEventListener('dc-notice', handler); window.clearTimeout(timer) } }, []); return <>{children}{notice && <div role="status" className="control-notice">{notice}</div>}</> }
export const App = Object.assign(AppProvider, { useApp: () => ({ message: { success: notify, warning: notify } }) })

const InputBase = React.forwardRef<HTMLInputElement, Common>(function InputBase({ prefix, allowClear, onPressEnter, size, className, value, onChange, ...props }, ref) { return <span className={`control-input ${className ?? ''}`}>{prefix}<UiInput {...props} className={size === 'large' ? 'h-10' : size === 'small' ? 'h-8' : undefined} ref={ref} value={value} onChange={onChange} onKeyDown={e => { props.onKeyDown?.(e); if (e.key === 'Enter') onPressEnter?.(e) }} />{allowClear && value && <button type="button" aria-label="清除" onClick={() => onChange?.({ target: { value: '' } })}><X size={14}/></button>}</span> })
function PasswordInput(props: Common) { const [visible, setVisible] = useState(false); return <span className="control-password"><InputBase {...props} type={visible ? 'text' : 'password'} /><button type="button" onClick={() => setVisible(v => !v)} aria-label={visible ? '隐藏密码' : '显示密码'} aria-pressed={visible}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button></span> }
export const Input = Object.assign(InputBase, { Password: PasswordInput })

type FormStore = { values: Record<string, any>; set: (name: string, value: any) => void; resetFields: () => void }
const FormContext = createContext<FormStore | null>(null)
function useForm(): [FormStore] { const [, render] = useState(0); const store = useRef<FormStore>(null); if (!store.current) store.current = { values: {}, set(name, value) { this.values[name] = value; render(n => n + 1) }, resetFields() { this.values = {}; render(n => n + 1) } }; return [store.current] }
function FormBase({ children, onFinish, form, layout, className }: Common) { const [own] = useForm(); const store = form ?? own; return <FormContext.Provider value={store}><form className={`control-form ${layout === 'inline' ? 'inline' : ''} ${className ?? ''}`} onSubmit={e => { e.preventDefault(); onFinish?.(store.values) }}>{children}</form></FormContext.Provider> }
function FormItem({ children, label, name, required, rules, extra }: Common) { const store = useContext(FormContext); const id = React.useId(); const element = children as React.ReactElement<any>; const message = rules?.find((r: any) => r.required && r.message)?.message; const child = React.isValidElement(children) && name && store ? React.cloneElement(element, { id, value: element.props.value ?? store.values[name] ?? (element.type === Select ? undefined : ''), onChange: (v: any) => { element.props.onChange?.(v); store.set(name, v?.target ? v.target.value : v) }, required: required || rules?.some((r: any) => r.required), onInvalid: (event: React.InvalidEvent<HTMLInputElement>) => { if (message) event.currentTarget.setCustomValidity(message); element.props.onInvalid?.(event) }, onInput: (event: React.FormEvent<HTMLInputElement>) => { event.currentTarget.setCustomValidity(''); element.props.onInput?.(event) } }) : children; return <div className="control-form-item">{label && <label id={name ? `${id}-label` : undefined} htmlFor={name ? id : undefined}>{label}{(required || rules?.some((r: any) => r.required)) && <span className="control-required" aria-hidden="true"> *</span>}</label>}{child}{extra && <small>{extra}</small>}</div> }
export const Form = Object.assign(FormBase, { Item: FormItem, useForm })

type Option = { value: any; label: ReactNode; title?: string; optionRender?: () => ReactNode }
type SelectProps = Common & { value?: any; onChange?: (value: any) => void; options?: Option[]; mode?: string; placeholder?: string; allowClear?: boolean; searchable?: boolean; size?: 'small' | 'default' }
export function Select({ value, onChange, options = [], mode, placeholder, allowClear, searchable = true, size, className, style, disabled, id }: SelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const multi = mode === 'multiple'
  const selected: any[] = multi ? value ?? [] : value === undefined || value === null ? [] : [value]
  const needle = query.trim().toLowerCase()
  const shown = searchable && needle
    ? options.filter(o => String(o.label).toLowerCase().includes(needle))
    : options
  const choose = (next: any) => {
    onChange?.(next)
    if (!multi) { setOpen(false); setQuery('') }
  }
  const picked = selected.map(v => options.find(o => o.value === v)?.label ?? v)
  const label = picked.length
    ? picked.map((item, index) => <React.Fragment key={index}>{index > 0 && '、'}{item}</React.Fragment>)
    : placeholder || '请选择'
  return (
    <UiPopover open={open} onOpenChange={v => { setOpen(v); if (!v) setQuery('') }}>
      <PopoverTrigger asChild>
        <button
          id={id} type="button" disabled={disabled}
          className={`control-select${size === 'small' ? ' is-sm' : ''}${className ? ` ${className}` : ''}`}
          style={style}
          aria-haspopup="listbox" aria-expanded={open} aria-labelledby={id ? `${id}-label ${id}-value` : undefined}
        >
          <span id={id ? `${id}-value` : undefined}>{label}</span>
          <ChevronDown className={`control-select-caret${open ? ' is-open' : ''}`} aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="control-select-menu" align="start">
        {searchable && (
          <UiInput
            aria-label="搜索选项" placeholder="搜索选项" value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                e.currentTarget.parentElement?.querySelector<HTMLButtonElement>('[role="option"]')?.focus()
              }
            }}
          />
        )}
        {allowClear && selected.length > 0 && (
          <button type="button" className="control-option" onClick={() => choose(multi ? [] : undefined)}>清除选择</button>
        )}
        <div
          className="control-options" role="listbox" aria-multiselectable={multi}
          onKeyDown={e => {
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
            e.preventDefault()
            const choices = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'))
            const current = choices.indexOf(document.activeElement as HTMLButtonElement)
            choices[(current + (e.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length]?.focus()
          }}
        >
          {shown.length ? shown.map(o => (
            <button
              type="button" role="option" aria-selected={selected.includes(o.value)} key={String(o.value)}
              className="control-option" title={o.title}
              onClick={() => choose(multi
                ? selected.includes(o.value) ? selected.filter(v => v !== o.value) : [...selected, o.value]
                : o.value)}
            >
              {multi && <span aria-hidden>{selected.includes(o.value) ? '☑' : '☐'}</span>}
              {o.optionRender ? o.optionRender() : o.label}
            </button>
          )) : <div className="control-empty">无匹配选项</div>}
        </div>
      </PopoverContent>
    </UiPopover>
  )
}

export function Modal({ children, open, title, onCancel, footer, width, bodyClassName }: Common) { return <Dialog open={open} onOpenChange={v => { if (!v) onCancel?.() }}><DialogContent style={{ maxWidth: width }} aria-describedby={undefined}><DialogHeader className="border-b border-border pb-3 pr-8"><DialogTitle>{title}</DialogTitle></DialogHeader><div className={`control-dialog-body ${bodyClassName ?? ''}`}>{children}</div>{footer !== null && footer !== undefined && footer !== false && <DialogFooter>{footer}</DialogFooter>}</DialogContent></Dialog> }
export function Drawer({ children, open, title, onClose, width, footer }: Common) { return <Sheet open={open} onOpenChange={v => { if (!v) onClose?.() }}><SheetContent style={{ width, maxWidth: '95vw' }} aria-describedby={undefined}><SheetHeader className="pr-10"><SheetTitle>{title}</SheetTitle></SheetHeader><div className="control-sheet-body flex-1 overflow-y-auto p-5">{children}</div>{footer !== null && footer !== undefined && footer !== false && <SheetFooter>{footer}</SheetFooter>}</SheetContent></Sheet> }
export function Popover({ children, content, open, onOpenChange }: Common) { return <UiPopover open={open} onOpenChange={onOpenChange}><PopoverTrigger asChild>{children}</PopoverTrigger><PopoverContent align="end">{content}</PopoverContent></UiPopover> }
export function Dropdown({ children, menu }: Common) { return <DropdownMenu><DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger><DropdownMenuContent align="end">{menu.items.map((item: any) => <DropdownMenuItem key={item.key} variant={item.danger ? 'destructive' : 'default'} onSelect={() => menu.onClick({ key: item.key })}>{item.icon}{item.label}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu> }
const CheckboxContext = createContext<any>(null)
function CheckboxBase({ children, value }: Common) { const group = useContext(CheckboxContext); return <label className="control-checkbox"><UiCheckbox checked={group?.value.includes(value)} onCheckedChange={checked => group?.onChange(checked ? [...group.value, value] : group.value.filter((v: any) => v !== value))} />{children}</label> }
export const Checkbox = Object.assign(CheckboxBase, { Group: ({ children, value, onChange }: Common) => <CheckboxContext.Provider value={{ value, onChange }}>{children}</CheckboxContext.Provider> })
function RadioGroup({ value, onChange, options }: Common) { const name = React.useId(); return <div role="radiogroup" className="control-radio">{options.map((o: Option) => <label key={o.value}><input type="radio" name={name} checked={value === o.value} onChange={() => onChange({ target: { value: o.value } })} />{o.label}</label>)}</div> }
export const Radio = { Group: RadioGroup }
export function Tabs({ items, activeKey, onChange, className, listVariant }: Common) { return <UiTabs value={activeKey} onValueChange={onChange} className={className}><TabsList variant={listVariant}>{items.map((item: any) => <TabsTrigger key={item.key} value={item.key}>{item.label}</TabsTrigger>)}</TabsList>{items.map((item: any) => <TabsContent key={item.key} value={item.key}>{item.children}</TabsContent>)}</UiTabs> }
export function Descriptions({ items }: Common) { return <dl className="control-descriptions">{items.map((item: any) => <React.Fragment key={item.key}><dt>{item.label}</dt><dd>{item.children}</dd></React.Fragment>)}</dl> }
function ListBase<T>({ dataSource, renderItem }: { dataSource: T[]; renderItem: (item: T) => ReactNode; [key: string]: any }) { return <div className="control-list">{dataSource.map(renderItem)}</div> }
export const List = Object.assign(ListBase, { Item: ({ children, actions }: Common) => <div className="control-list-item">{children}{actions}</div> })
export function Upload({ children, beforeUpload, accept }: Common) { const ref = useRef<HTMLInputElement>(null); return <span onClick={e => { if (e.target !== ref.current) ref.current?.click() }}><input ref={ref} type="file" accept={accept} hidden onChange={e => { const file = e.target.files?.[0]; if (file) beforeUpload(file); e.target.value = '' }} />{children}</span> }
function LayoutBase({ children, className }: Common) { return <div className={className}>{children}</div> }
export const Layout = Object.assign(LayoutBase, { Header: ({ children, className }: Common) => <header className={className}>{children}</header>, Sider: ({ children, className, width, collapsed }: Common) => <aside className={className} style={{ width: collapsed ? 0 : width, overflow: 'hidden', flexShrink: 0 }} aria-hidden={collapsed}>{children}</aside>, Content: ({ children, className }: Common) => <main className={className}>{children}</main> })
export function Menu({ items, selectedKeys, onClick, className }: Common) { return <nav className={`control-nav ${className ?? ''}`} aria-label="主导航">{items.map((item: any) => item.children ? <details key={item.key} open><summary>{item.icon}{item.label}<ChevronDown className="nav-chevron" aria-hidden="true" /></summary><div className="control-nav-children">{item.children.map((child: any) => <button key={child.key} type="button" className={selectedKeys.includes(child.key) ? 'selected' : ''} aria-current={selectedKeys.includes(child.key) ? 'page' : undefined} onClick={() => onClick({ key: child.key })}>{child.icon}{child.label}</button>)}</div></details> : <button key={item.key} type="button" className={selectedKeys.includes(item.key) ? 'selected' : ''} aria-current={selectedKeys.includes(item.key) ? 'page' : undefined} onClick={() => onClick({ key: item.key })}>{item.icon}{item.label}</button>)}</nav> }

export type TableColumn<T> = {
  title?: ReactNode
  key?: string
  dataIndex?: keyof T
  width?: number
  sorter?: (a: T, b: T) => number
  render?: (value: any, item: T) => ReactNode
  filter?: ColumnFilterConfig
  hideable?: boolean
  onHide?: () => void
}
export type TableColumnsType<T> = TableColumn<T>[]
type TableProps<T> = {
  sharedStyle?: boolean
  columns: TableColumnsType<T>
  dataSource: T[]
  rowKey: keyof T
  loading?: boolean
  frame?: 'fixed' | 'compact'
  showFooter?: boolean
  footerUnit?: string
  footerExtra?: ReactNode
  estimateRowHeight?: number
  scrollResetKey?: string | number
  scrollToRowKey?: string | number | null
  rowSelection?: {
    selectedRowKeys: (string | number)[]
    preserveSelectedRowKeys?: boolean
    onChange: (keys: (string | number)[]) => void
    isRowSelectable?: (record: T) => boolean
    selectAllLabel?: string
    getRowLabel?: (record: T, rowNumber: number) => string
  }
  rowNumberOffset?: number
  /** @deprecated Pagination controls have been replaced by virtual scrolling and TableFooterBar. */
  pagination?: false | { current?: number; pageSize?: number; total?: number; showSizeChanger?: boolean; pageSizeOptions?: string[]; showTotal?: (n: number) => ReactNode; onChange?: (page: number, size: number) => void }
  locale?: { emptyText?: ReactNode }
  onRowClick?: (record: T, event: React.MouseEvent<HTMLTableRowElement>) => void
  rowClassName?: (record: T) => string
  onHideColumn?: (key: string) => void
  [key: string]: any
}
export function Table<T>({
  columns,
  dataSource,
  rowKey,
  loading,
  frame = 'fixed',
  showFooter,
  footerUnit = '条',
  footerExtra,
  estimateRowHeight = 45,
  scrollResetKey,
  scrollToRowKey,
  rowSelection,
  rowNumberOffset,
  pagination,
  locale,
  onRowClick,
  rowClassName,
  sharedStyle,
  onHideColumn,
}: TableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastScrolledKeyRef = useRef<string | number | null | undefined>(undefined)

  const columnMap = new Map<string, TableColumn<T>>()
  const defs: ColumnDef<T, any>[] = columns.map((c, i) => {
    const id = c.key ?? String(c.dataIndex ?? i)
    columnMap.set(id, c)
    return {
      id,
      header: () => c.title,
      accessorFn: row => c.dataIndex ? row[c.dataIndex] : undefined,
      enableSorting: !!c.sorter,
      sortDescFirst: false,
      size: c.width,
      sortingFn: c.sorter ? (a, b) => c.sorter!(a.original, b.original) : undefined,
      cell: info => c.render ? c.render(info.getValue(), info.row.original) : info.getValue() as ReactNode,
    }
  })
  const columnKeySignature = columns.map(c => c.key ?? String(c.dataIndex)).join('|')
  useEffect(() => {
    setSorting(current => current.filter(item => defs.some(col => col.id === item.id)))
  }, [columnKeySignature])

  const table = useReactTable({
    data: dataSource,
    columns: defs,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })
  const sortedRows = table.getRowModel().rows

  const selected = rowSelection?.selectedRowKeys ?? []
  const selectedSet = useMemo(() => new Set<string | number>(selected), [selected])
  const allSelectableKeys = useMemo(() => {
    if (!rowSelection) return [] as (string | number)[]
    const keys: (string | number)[] = []
    for (const row of sortedRows) {
      if (!rowSelection.isRowSelectable || rowSelection.isRowSelectable(row.original)) {
        keys.push(row.original[rowKey] as string | number)
      }
    }
    return keys
  }, [rowSelection, sortedRows, rowKey])
  const allSelectableKeySet = useMemo(() => new Set<string | number>(allSelectableKeys), [allSelectableKeys])
  const selectedInViewCount = useMemo(() => {
    if (!rowSelection || allSelectableKeys.length === 0 || selectedSet.size === 0) return 0
    let count = 0
    for (const key of allSelectableKeys) {
      if (selectedSet.has(key)) count += 1
    }
    return count
  }, [rowSelection, allSelectableKeys, selectedSet])
  const allSelected = allSelectableKeys.length > 0 && selectedInViewCount === allSelectableKeys.length
  const someSelected = selectedInViewCount > 0 && !allSelected
  const headerChecked: boolean | 'indeterminate' = allSelected ? true : someSelected ? 'indeterminate' : false

  const rowVirtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateRowHeight,
    overscan: 12,
  })

  useEffect(() => {
    if (scrollToRowKey !== undefined && scrollToRowKey !== null) return
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [scrollResetKey, sortedRows.length])

  useEffect(() => {
    if (scrollToRowKey === undefined || scrollToRowKey === null) {
      lastScrolledKeyRef.current = undefined
      return
    }
    if (lastScrolledKeyRef.current === scrollToRowKey) return
    const targetIndex = sortedRows.findIndex(row => {
      const key = row.original[rowKey] as string | number
      return key === scrollToRowKey || String(key) === String(scrollToRowKey)
    })
    if (targetIndex >= 0) {
      lastScrolledKeyRef.current = scrollToRowKey
      rowVirtualizer.scrollToIndex(targetIndex, { align: 'center' })
    }
  }, [scrollToRowKey, sortedRows, rowKey, rowVirtualizer])

  const virtualItems = rowVirtualizer.getVirtualItems()
  const totalSize = rowVirtualizer.getTotalSize()
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0
  const paddingBottom =
    virtualItems.length > 0 ? Math.max(0, totalSize - virtualItems[virtualItems.length - 1].end) : 0
  const colSpan = table.getVisibleLeafColumns().length + (rowSelection ? 1 : 0)
  const visibleDataColumnCount = defs.filter(col => col.id !== 'select' && col.id !== 'actions').length
  const resolvedShowFooter = showFooter ?? (pagination === false ? false : true)

  const headContent = (header: any) => {
    const colId = header.column.id as string
    const isSystem = colId === 'select' || colId === 'actions'
    const colDef = columnMap.get(colId)
    const canSort = !isSystem && header.column.getCanSort()
    const sortDirection = header.column.getIsSorted()
    const filter = !isSystem ? colDef?.filter : undefined
    const canFilter = Boolean(filter)
    const hideHandler = colDef?.onHide ?? (onHideColumn ? () => onHideColumn(colId) : undefined)
    const canHide = !isSystem && colDef?.hideable !== false && Boolean(hideHandler) && visibleDataColumnCount > 1
    const title = flexRender(header.column.columnDef.header, header.getContext())
    if (!canSort && !canFilter && !canHide) return title
    return (
      <ColumnHeaderMenu
        title={title}
        sortable={canSort}
        sortDirection={sortDirection}
        onSortChange={next => {
          if (next === false) {
            setSorting(current => current.filter(item => item.id !== colId))
          } else {
            setSorting([{ id: colId, desc: next === 'desc' }])
          }
        }}
        filter={filter}
        hideable={canHide}
        onHide={hideHandler}
      />
    )
  }
  const headCell = (header: any) => {
    const canSort = header.column.id !== 'select' && header.column.id !== 'actions' && header.column.getCanSort()
    const sortDirection = header.column.getIsSorted()
    const width = columnMap.get(header.column.id)?.width
    return (
      <th
        key={header.id} style={width ? { width, minWidth: width } : undefined}
        aria-sort={canSort ? (sortDirection === 'asc' ? 'ascending' : sortDirection === 'desc' ? 'descending' : 'none') : undefined}
      >{headContent(header)}</th>
    )
  }

  return (
    <div
      className={`control-table-area table-frame ${frame === 'compact' ? 'table-frame-compact' : 'table-frame-fixed'}`}
      aria-busy={loading}
    >
      {loading && <div className="control-table-loading" role="status"><LoaderCircle className="animate-spin" size={18} />加载中</div>}
      <div
        ref={scrollRef}
        className={`table-frame-scroll control-table-wrap${sharedStyle ? ' shared-table-wrap' : ''}`}
        inert={loading || undefined}
      >
        <table
          className={`control-table${sharedStyle ? ' shared-table' : ''}`}
          aria-rowcount={sortedRows.length > 0 ? sortedRows.length + 1 : undefined}
        >
          <thead>
            {table.getHeaderGroups().map(group => (
              <tr key={group.id}>
                {rowSelection && (
                  <th className="col-select">
                    <RowIndexSelectHeader
                      checked={headerChecked}
                      disabled={allSelectableKeys.length === 0}
                      ariaLabel={rowSelection.selectAllLabel ?? '全选当前列表'}
                      onCheckedChange={checked => {
                        rowSelection.onChange(
                          checked
                            ? Array.from(new Set([...selected, ...allSelectableKeys]))
                            : selected.filter(k => !allSelectableKeySet.has(k)),
                        )
                      }}
                    />
                  </th>
                )}
                {group.headers.map(headCell)}
              </tr>
            ))}
          </thead>
          <tbody>
            {sortedRows.length > 0 ? (
              <>
                {paddingTop > 0 && (
                  <tr aria-hidden="true" className="table-virtual-spacer">
                    <td colSpan={colSpan} style={{ height: paddingTop }} />
                  </tr>
                )}
                {virtualItems.map(virtualItem => {
                  const row = sortedRows[virtualItem.index]
                  const recordKey = row.original[rowKey] as string | number
                  const isSelected = Boolean(rowSelection && selectedSet.has(recordKey))
                  const canSelect = !rowSelection?.isRowSelectable || rowSelection.isRowSelectable(row.original)
                  const rowNumber = (rowNumberOffset ?? 0) + virtualItem.index + 1
                  const extraRowClass = rowClassName?.(row.original)
                  const trClassName = ['group/row', extraRowClass].filter(Boolean).join(' ')
                  return (
                    <tr
                      key={String(recordKey)}
                      data-index={virtualItem.index}
                      data-last-row={virtualItem.index === sortedRows.length - 1 ? 'true' : undefined}
                      ref={rowVirtualizer.measureElement}
                      aria-rowindex={virtualItem.index + 2}
                      data-state={isSelected ? 'selected' : undefined}
                      className={trClassName}
                      onClick={onRowClick ? event => onRowClick(row.original, event) : undefined}
                      style={onRowClick ? { cursor: 'pointer' } : undefined}
                    >
                      {rowSelection && (
                        <td className="col-select group/select-cell">
                          <RowIndexSelectCell
                            rowNumber={rowNumber}
                            selected={isSelected}
                            disabled={!canSelect}
                            ariaLabel={rowSelection.getRowLabel?.(row.original, rowNumber)}
                            onToggle={checked => {
                              rowSelection.onChange(
                                checked
                                  ? Array.from(new Set([...selected, recordKey]))
                                  : selected.filter(k => k !== recordKey),
                              )
                            }}
                          />
                        </td>
                      )}
                      {row.getVisibleCells().map(cell => (
                        <td key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  )
                })}
                {paddingBottom > 0 && (
                  <tr aria-hidden="true" className="table-virtual-spacer">
                    <td colSpan={colSpan} style={{ height: paddingBottom }} />
                  </tr>
                )}
              </>
            ) : (
              <tr data-state-row="true" className="table-state-row">
                <td colSpan={colSpan} className="table-state-cell">
                  {locale?.emptyText ?? <Empty />}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {resolvedShowFooter && (
        <TableFooterBar
          total={sortedRows.length}
          selectedCount={rowSelection ? selected.length : 0}
          unit={footerUnit}
          extra={footerExtra}
        />
      )}
    </div>
  )
}
