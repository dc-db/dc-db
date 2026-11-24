import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { serviceCatalog, serviceCategory } from '../serviceCatalog'
import { ServiceIcon } from './ServiceIcon'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'

export function ServicePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState('全部分类')
  const [query, setQuery] = useState('')
  const shown = serviceCatalog.filter(group => category === '全部分类' || group.category === category)
    .map(group => ({ ...group, names: group.names.filter(name => name.includes(query.trim().toLowerCase())) }))
    .filter(group => group.names.length > 0)
  return <div className="grid min-w-0 gap-1">
    <label className="service-picker-label" htmlFor={id}>服务名称</label>
    <div className="flex min-w-0 items-center gap-2">
      {value && <ServiceIcon name={value} category={serviceCategory(value)} />}
      <Input id={id} required maxLength={120} placeholder="输入名称或选择内置服务" value={value} onChange={event => onChange(event.target.value)} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild><Button type="button" variant="outline" aria-label="选择内置服务"><ChevronDown /></Button></PopoverTrigger>
        <PopoverContent align="start" className="w-80 max-w-[min(24rem,80vw)] space-y-3">
          <div className="font-medium">选择内置服务</div>
          <label className="grid gap-1 text-sm">服务分类
            <select className="control-select w-full" value={category} onChange={event => setCategory(event.target.value)}>
              <option>全部分类</option>{serviceCatalog.map(group => <option key={group.category}>{group.category}</option>)}
            </select>
          </label>
          <Input aria-label="搜索内置服务" placeholder="搜索服务名称" value={query} onChange={event => setQuery(event.target.value)} />
          <div className="max-h-64 overflow-y-auto">
            {shown.map(group => <div key={group.category} className="mb-2">
              <div className="px-2 py-1 text-sm text-muted-foreground">{group.category}</div>
              {group.names.map(name => <button key={name} type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring" onClick={() => { onChange(name); setOpen(false); setQuery('') }}><ServiceIcon name={name} category={group.category} /><span>{name}</span></button>)}
            </div>)}
            {!shown.length && <div className="px-2 py-3 text-sm text-muted-foreground">没有匹配的内置服务，可直接输入自定义名称</div>}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  </div>
}
