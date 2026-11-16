import { useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { Button } from './ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'

interface Option { value: string; label: string }
interface Props {
  value: string
  onChange: (value: string) => void
  options: Option[]
  label: string
  placeholder?: string
  disabled?: boolean
  allowClear?: boolean
}

/** Searchable, keyboard-operable single selection, with an optional empty value. */
export function SearchableSelect({ value, onChange, options, label, placeholder = '请选择', disabled = false, allowClear = true }: Props) {
  const [open, setOpen] = useState(false)
  const chosen = options.find(option => option.value === value)
  const displayValue = chosen?.label ?? (value || placeholder)
  function choose(next: string) { onChange(next); setOpen(false) }
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button type="button" variant="outline" disabled={disabled} aria-label={`${label}：${displayValue}`} className="w-full justify-between font-normal"><span className="truncate">{displayValue}</span><ChevronsUpDown className="opacity-50" /></Button></PopoverTrigger>
    <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-56 p-0">
      <Command><CommandInput aria-label={`搜索${label}`} placeholder={`搜索${label}`} /><CommandList><CommandEmpty>没有匹配的选项</CommandEmpty><CommandGroup>
        {allowClear && <CommandItem value="清除选择" onSelect={() => choose('')}>清除选择</CommandItem>}
        {options.map(option => <CommandItem key={option.value} value={`${option.label} ${option.value}`} onSelect={() => choose(option.value)}><Check className={`size-4 ${option.value === value ? 'opacity-100' : 'opacity-0'}`} />{option.label}</CommandItem>)}
      </CommandGroup></CommandList></Command>
    </PopoverContent>
  </Popover>
}
