import { useState } from 'react'
import { Check, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { Button } from './ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { cn } from '../lib/utils'

interface Option { value: string; label: string }
interface Props {
  value: string
  onChange: (value: string) => void
  options: Option[]
  label: string
  placeholder?: string
  disabled?: boolean
  allowClear?: boolean
  triggerClassName?: string
  triggerVariant?: 'outline' | 'ghost'
  indicator?: 'down' | 'both'
  allowCustom?: boolean
}

/** Searchable, keyboard-operable single selection, with an optional empty value. */
export function SearchableSelect({ value, onChange, options, label, placeholder = '请选择', disabled = false, allowClear = true, triggerClassName, triggerVariant = 'outline', indicator = 'both', allowCustom = false }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const chosen = options.find(option => option.value === value)
  const hasValue = Boolean(chosen || value)
  const displayValue = chosen?.label ?? (value || placeholder)
  function choose(next: string) { onChange(next); setOpen(false); setQuery('') }
  return <Popover open={open} onOpenChange={next => { setOpen(next); if (!next) setQuery('') }}>
    <PopoverTrigger asChild>
      <Button
        type="button"
        variant={triggerVariant}
        disabled={disabled}
        aria-label={`${label}：${displayValue}`}
        className={cn(
          'w-full justify-between rounded-md text-sm font-normal',
          triggerVariant === 'outline' &&
            'border-border bg-background hover:bg-accent hover:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
          hasValue ? 'text-foreground' : 'text-muted-foreground',
          triggerClassName
        )}
      >
        <span className="truncate">{displayValue}</span>
        {indicator === 'down' ? (
          <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-150', open && 'rotate-180')} />
        ) : (
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground opacity-60" />
        )}
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-56 p-0">
      <Command label={`搜索${label}`}><CommandInput aria-label={`搜索${label}`} placeholder={`搜索${label}`} maxLength={allowCustom ? 160 : undefined} value={query} onValueChange={setQuery} /><CommandList><CommandEmpty>没有匹配的选项</CommandEmpty><CommandGroup>
        {allowCustom && query.trim() && !options.some(option => option.label.toLowerCase() === query.trim().toLowerCase()) && <CommandItem value={query.trim()} onSelect={() => choose(query.trim())}>使用「{query.trim()}」</CommandItem>}
        {allowClear && <CommandItem value="清除选择" onSelect={() => choose('')}>清除选择</CommandItem>}
        {options.map(option => <CommandItem key={option.value} value={`${option.label} ${option.value}`} onSelect={() => choose(option.value)}><Check className={`size-4 ${option.value === value ? 'opacity-100' : 'opacity-0'}`} />{option.label}</CommandItem>)}
      </CommandGroup></CommandList></Command>
    </PopoverContent>
  </Popover>
}
