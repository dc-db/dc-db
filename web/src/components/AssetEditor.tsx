import { useState } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Plus, Trash2 } from 'lucide-react'
import type { Asset, AssetFields, Group, Kind } from '../api'

interface Props {
  asset: Asset | null
  defaultKind: Kind
  busy: boolean
  error: string
  groups: Group[]
  onSave: (fields: AssetFields & { version: number }) => void
  onCancel: () => void
}

type AttributeType = 'string' | 'number' | 'boolean' | 'json'

interface AttributeRow {
  id: number
  key: string
  value: string
  type: AttributeType
}

const attributeTypeOptions = [
  { value: 'string', label: '文本' },
  { value: 'number', label: '数字' },
  { value: 'boolean', label: '布尔' },
  { value: 'json', label: 'JSON' },
]

function Choice({ value, options, onChange, disabled, className }: {
  value: string; options: { value: string; label: string }[]; onChange: (value: string) => void
  disabled?: boolean; className?: string
}) {
  return <Select value={value || '__empty__'} disabled={disabled} onValueChange={next => onChange(next === '__empty__' ? '' : next)}>
    <SelectTrigger className={className}><SelectValue /></SelectTrigger>
    <SelectContent>{options.map(option => <SelectItem key={option.value || '__empty__'} value={option.value || '__empty__'}>{option.label}</SelectItem>)}</SelectContent>
  </Select>
}

function attributesToRows(attributes: Record<string, unknown>): AttributeRow[] {
  return Object.entries(attributes).map(([key, value], index) => {
    if (typeof value === 'string') {
      return { id: index + 1, key, value, type: 'string' as const }
    }
    if (typeof value === 'number') {
      return { id: index + 1, key, value: String(value), type: 'number' as const }
    }
    if (typeof value === 'boolean') {
      return { id: index + 1, key, value: value ? 'true' : 'false', type: 'boolean' as const }
    }
    return { id: index + 1, key, value: JSON.stringify(value) ?? 'null', type: 'json' as const }
  })
}

function parseAttributeRows(rows: AttributeRow[]): Record<string, unknown> {
  const attributes: Record<string, unknown> = {}
  for (const row of rows) {
    const key = row.key.trim()
    if (!key) {
      if (!row.value.trim()) continue
      throw new Error('扩展属性存在空键名')
    }
    if (Object.prototype.hasOwnProperty.call(attributes, key)) {
      throw new Error(`扩展属性键名重复：${key}`)
    }
    switch (row.type) {
      case 'number': {
        const value = Number(row.value)
        if (!row.value.trim() || !Number.isFinite(value)) throw new Error(`扩展属性「${key}」须为有效数字`)
        attributes[key] = value
        break
      }
      case 'boolean':
        attributes[key] = row.value === 'true'
        break
      case 'json':
        try {
          attributes[key] = JSON.parse(row.value || 'null')
        } catch {
          throw new Error(`扩展属性「${key}」不是有效的 JSON`)
        }
        break
      default:
        attributes[key] = row.value
    }
  }
  return attributes
}

export function AssetEditor({ asset, defaultKind, busy, error, groups, onSave, onCancel }: Props) {
  const [fields, setFields] = useState<AssetFields>({
    kind: asset?.kind ?? defaultKind,
    name: asset?.name ?? '',
    platform: asset?.platform ?? '',
    status: asset?.status ?? 'unknown',
    lifecycle: asset?.lifecycle ?? 'active',
    owner: asset?.owner ?? '',
    environment: asset?.environment ?? '',
    address: asset?.address ?? '',
    cpu: asset?.cpu ?? 0,
    memoryMiB: asset?.memoryMiB ?? 0,
    groupId: asset?.groupId ?? 0,
    notes: asset?.notes ?? '',
    attributes: asset?.attributes ?? {},
  })
  const [attributeRows, setAttributeRows] = useState<AttributeRow[]>(() => attributesToRows(asset?.attributes ?? {}))
  const [nextAttributeId, setNextAttributeId] = useState(() => Object.keys(asset?.attributes ?? {}).length + 1)
  const [validation, setValidation] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  function update<K extends keyof AssetFields>(key: K, value: AssetFields[K]) {
    setFields(current => ({ ...current, [key]: value }))
    setErrors(current => {
      const field = String(key)
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  function updateAttribute(id: number, patch: Partial<AttributeRow>) {
    setAttributeRows(current => current.map(row => row.id === id ? { ...row, ...patch } : row))
  }

  function addAttribute() {
    setAttributeRows(current => [...current, { id: nextAttributeId, key: '', value: '', type: 'string' }])
    setNextAttributeId(current => current + 1)
  }

  function removeAttribute(id: number) {
    setAttributeRows(current => current.filter(row => row.id !== id))
  }

  function save() {
    const next: Record<string, string> = {}
    const name = fields.name.trim()
    if (!name) next.name = '请填写资源名称'
    else if (name.length > 160) next.name = '资源名称不能超过 160 个字符'
    if (!Number.isFinite(fields.cpu) || fields.cpu < 0) next.cpu = 'CPU 核数须为 0 或正整数'
    if (!Number.isFinite(fields.memoryMiB) || fields.memoryMiB < 0) next.memoryMiB = '内存须为 0 或正整数'
    let attributes: Record<string, unknown> = {}
    try {
      attributes = parseAttributeRows(attributeRows)
    } catch (e) {
      next.attributes = e instanceof Error ? e.message : '扩展属性格式不正确'
    }
    setErrors(next)
    if (Object.keys(next).length > 0) {
      setValidation('请修正表单中标红的字段')
      return
    }
    setValidation('')
    onSave({
      ...fields,
      name,
      attributes,
      cpu: Number(fields.cpu || 0),
      memoryMiB: Number(fields.memoryMiB || 0),
      groupId: Number(fields.groupId || 0),
      version: asset?.version ?? 0,
    })
  }

  return (
    <form onSubmit={event => { event.preventDefault(); save() }} className="grid grid-cols-2 gap-4">
      {(validation || error) && <p role="alert" className="col-span-2 text-destructive">{validation || error}</p>}
      <label className="grid gap-2">资源类型 *<Choice value={fields.kind} disabled={!!asset} onChange={value => update('kind', value as Kind)} options={[{ value: 'host', label: '物理机' }, { value: 'switch', label: '交换机' }, { value: 'vm', label: '虚拟机' }]} /></label>
      <label className={errors.name ? 'grid gap-2 field-invalid' : 'grid gap-2'}>资源名称 *<Input required value={fields.name} maxLength={160} aria-invalid={!!errors.name} onChange={event => update('name', event.target.value)} />{errors.name && <span className="field-error" role="alert">{errors.name}</span>}</label>

      <label className="grid gap-2">平台<Choice value={fields.platform} onChange={value => update('platform', value as AssetFields['platform'])} options={[{ value: '', label: '未指定' }, { value: 'pve', label: 'Proxmox VE' }, { value: 'kvm', label: 'KVM / libvirt' }]} /></label>
      <label className="grid gap-2">状态<Choice value={fields.status} onChange={value => update('status', value as AssetFields['status'])} options={[{ value: 'unknown', label: '未知' }, { value: 'online', label: '在线' }, { value: 'offline', label: '离线' }, { value: 'running', label: '运行中' }, { value: 'stopped', label: '已停止' }, { value: 'paused', label: '已暂停' }]} /></label>
      <label className="grid gap-2">负责人<Input value={fields.owner} maxLength={160} placeholder="姓名或团队" onChange={event => update('owner', event.target.value)} /></label>
      <label className="grid gap-2">环境<Input value={fields.environment} maxLength={40} placeholder="例如：生产" onChange={event => update('environment', event.target.value)} /></label>
      <label className="grid gap-2">所属群组<Choice value={fields.groupId ? String(fields.groupId) : ''} onChange={value => update('groupId', Number(value || 0))} options={[{ value: '', label: '未归属' }, ...groups.map(group => ({ value: String(group.id), label: group.name }))]} /></label>
      <label className="col-span-2 grid gap-2">管理地址 / IP<Input value={fields.address} maxLength={160} placeholder="例如：192.0.2.11" onChange={event => update('address', event.target.value)} /></label>
      <label className={errors.cpu ? 'grid gap-2 field-invalid' : 'grid gap-2'}>CPU 核数 / vCPU<Input type="number" min={0} max={65536} value={fields.cpu} aria-invalid={!!errors.cpu} onChange={event => update('cpu', Number(event.target.value))} />{errors.cpu && <span className="field-error" role="alert">{errors.cpu}</span>}</label>
      <label className={errors.memoryMiB ? 'grid gap-2 field-invalid' : 'grid gap-2'}>内存（MiB）<Input type="number" min={0} max={1073741824} value={fields.memoryMiB} aria-invalid={!!errors.memoryMiB} onChange={event => update('memoryMiB', Number(event.target.value))} />{errors.memoryMiB && <span className="field-error" role="alert">{errors.memoryMiB}</span>}</label>
      {asset && <label className="col-span-2 grid gap-2">生命周期<Choice value={fields.lifecycle} onChange={value => update('lifecycle', value as AssetFields['lifecycle'])} options={[{ value: 'active', label: '在册' }, { value: 'retired', label: '已退役' }]} /></label>}
      <label className="col-span-2 grid gap-2">备注<Textarea value={fields.notes} rows={3} maxLength={2500} onChange={event => update('notes', event.target.value)} /></label>
      <div className="col-span-2 grid gap-2">
        <div>扩展属性 <span className="muted">键值对；复杂的嵌套结构请选择 JSON 类型</span></div>
        <div className="attribute-editor">
          {attributeRows.map(row => <div key={row.id} className="attribute-row">
            <Input className="attribute-key" placeholder="键" maxLength={80} value={row.key} onChange={event => updateAttribute(row.id, { key: event.target.value })} />
            <Choice className="attribute-type" value={row.type} options={attributeTypeOptions} onChange={value => updateAttribute(row.id, { type: value as AttributeType, ...(value === 'boolean' ? { value: row.value === 'false' ? 'false' : 'true' } : {}) })} />
            {row.type === 'boolean' ? <Choice className="attribute-value" value={row.value === 'false' ? 'false' : 'true'} onChange={value => updateAttribute(row.id, { value })} options={[{ value: 'true', label: 'true' }, { value: 'false', label: 'false' }]} /> : row.type === 'json' ? <Textarea className="attribute-value mono" rows={1} spellCheck={false} value={row.value} onChange={event => updateAttribute(row.id, { value: event.target.value })} /> : <Input className="attribute-value" placeholder="值" inputMode={row.type === 'number' ? 'decimal' : undefined} value={row.value} onChange={event => updateAttribute(row.id, { value: event.target.value })} />}
            <Button type="button" variant="ghost" size="icon" aria-label="删除扩展属性" onClick={() => removeAttribute(row.id)}><Trash2 /></Button>
          </div>)}
          <Button type="button" variant="outline" onClick={addAttribute}><Plus />添加属性</Button>
        </div>
        {errors.attributes && <span className="field-error" role="alert">{errors.attributes}</span>}
      </div>
      <div className="col-span-2 flex justify-end gap-2"><Button type="button" variant="outline" onClick={onCancel}>取消</Button><Button type="submit" disabled={busy}>{busy ? '正在保存…' : '保存资产'}</Button></div>
    </form>
  )
}
