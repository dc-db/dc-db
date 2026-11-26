import { useState } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Switch } from './ui/switch'
import { SearchableSelect } from './SearchableSelect'
import { Textarea } from './ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Plus, Trash2 } from 'lucide-react'
import type { Asset, AssetFields, Group, Kind, ServiceInstance } from '../api'
import { ALL_KINDS, NETWORK_KINDS, isNetworkKind, KIND_LABELS } from '../kinds'
import { ServicePicker } from './ServicePicker'
import { formatMemory, parseMemory } from '../lib/memory'

interface Props {
  asset: Asset | null
  defaultKind: Kind
  busy: boolean
  error: string
  groups: Group[]
  owners: string[]
  rooms?: { id: number; name: string }[]
  defaultRoomId?: number
  mountedRoomId?: number
  createFromList?: boolean
  onSave: (fields: AssetFields & { version: number; services?: ServiceInstance[] }) => void
  onCancel: () => void
}

function Choice({ value, options, onChange, disabled, className }: {
  value: string; options: { value: string; label: string }[]; onChange: (value: string) => void
  disabled?: boolean; className?: string
}) {
  return <Select value={value || '__empty__'} disabled={disabled} onValueChange={next => onChange(next === '__empty__' ? '' : next)}>
    <SelectTrigger className={className}><SelectValue /></SelectTrigger>
    <SelectContent>{options.map(option => <SelectItem key={option.value || '__empty__'} value={option.value || '__empty__'}>{option.label}</SelectItem>)}</SelectContent>
  </Select>
}

export function AssetEditor({ asset, defaultKind, busy, error, groups, owners, rooms, defaultRoomId, mountedRoomId, createFromList = false, onSave, onCancel }: Props) {
  const [fields, setFields] = useState<AssetFields>({
    kind: asset?.kind ?? defaultKind,
    name: asset?.name ?? '',
    platform: asset?.platform ?? '',
    status: asset?.status ?? 'unknown',
    lifecycle: asset?.lifecycle ?? 'active',
    owner: asset?.owner ?? '',
    environment: asset?.environment ?? '',
    address: asset?.address ?? '',
    probeEnabled: asset?.probeEnabled ?? false,
    cpu: asset?.cpu ?? 0,
    memoryMiB: asset?.memoryMiB ?? 0,
    groupId: asset?.groupId ?? 0,
    notes: asset?.notes ?? '',
    roomId: asset?.roomId ?? 0,
  })
  const [serviceRows, setServiceRows] = useState<ServiceInstance[]>(() => (asset?.services ?? []).map(item => ({ ...item })))
  const [memory, setMemory] = useState(() => formatMemory(asset?.memoryMiB ?? 0))
  const [roomId, setRoomId] = useState<number>(() =>
    mountedRoomId ?? (Number(asset?.roomId) || (asset ? 0 : (defaultRoomId ?? 0))),
  )
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

  function save() {
    const next: Record<string, string> = {}
    const name = fields.name.trim()
    if (!name) next.name = '请填写资源名称'
    else if (name.length > 160) next.name = '资源名称不能超过 160 个字符'
    if (!Number.isFinite(fields.cpu) || fields.cpu < 0) next.cpu = 'CPU 核数须为 0 或正整数'
    const memoryMiB = parseMemory(memory)
    if (!isNetworkKind(fields.kind) && memoryMiB === null) next.memoryMiB = '请输入以 G 或 M 结尾的有效容量'
    setErrors(next)
    if (Object.keys(next).length > 0) {
      setValidation('请修正表单中标红的字段')
      return
    }
    setValidation('')
    const networkDevice = isNetworkKind(fields.kind)
    onSave({
      ...fields,
      name,
      platform: networkDevice ? '' : fields.platform,
      roomId: mountedRoomId ? (asset?.roomId ?? 0) : roomId,
      cpu: networkDevice ? 0 : Number(fields.cpu || 0),
      memoryMiB: networkDevice ? 0 : (memoryMiB ?? 0),
      groupId: Number(fields.groupId || 0),
      services: networkDevice ? undefined : serviceRows,
      version: asset?.version ?? 0,
    })
  }

  const networkDevice = isNetworkKind(fields.kind)

  return (
    <form onSubmit={event => { event.preventDefault(); save() }} className={`grid grid-cols-2 gap-4${createFromList ? ' asset-create-form' : ''}`}>
      {(validation || error) && <p role="alert" className="col-span-2 text-destructive">{validation || error}</p>}
      <label className={errors.name ? 'grid gap-2 asset-field-name field-invalid' : 'grid gap-2 asset-field-name'}><span>{createFromList ? (networkDevice ? '设备名称' : fields.kind === 'vm' ? '虚拟机名称' : '服务器名称') : '资源名称'} <span className="text-destructive" aria-hidden="true">*</span></span><Input required value={fields.name} maxLength={160} aria-invalid={!!errors.name} onChange={event => update('name', event.target.value)} />{errors.name && <span className="field-error" role="alert">{errors.name}</span>}</label>

      {(!createFromList || networkDevice) && <label className="grid gap-2 asset-field-kind"><span>{createFromList ? '设备类型' : '资源类型'} <span className="text-destructive" aria-hidden="true">*</span></span><Choice value={fields.kind} disabled={!!asset} onChange={value => update('kind', value as Kind)} options={(createFromList ? NETWORK_KINDS : ALL_KINDS).map(value => ({ value, label: KIND_LABELS[value] }))} /></label>}
      {!networkDevice && <label className="grid gap-2 asset-field-platform">平台<Choice value={fields.platform} onChange={value => update('platform', value as AssetFields['platform'])} options={[{ value: '', label: '未分配' }, { value: 'pve', label: 'Proxmox VE' }, { value: 'kvm', label: 'KVM / libvirt' }]} /></label>}
      <label className="grid gap-2 asset-field-environment">环境<Input value={fields.environment} maxLength={40} placeholder="例如：生产" onChange={event => update('environment', event.target.value)} /></label>
      {createFromList && <hr className="asset-create-divider" />}
      {!networkDevice && <div className="col-span-2 grid grid-cols-2 gap-3 asset-create-capacity">
        <label className={errors.cpu ? 'grid gap-2 field-invalid' : 'grid gap-2'}>CPU<Input type="number" min={0} max={65536} value={fields.cpu} aria-invalid={!!errors.cpu} onChange={event => update('cpu', Number(event.target.value))} />{errors.cpu && <span className="field-error" role="alert">{errors.cpu}</span>}</label>
        <label className={errors.memoryMiB ? 'grid gap-2 field-invalid' : 'grid gap-2'}>内存<Input value={memory} maxLength={24} placeholder="如 1G、512M" aria-invalid={!!errors.memoryMiB} onChange={event => { setMemory(event.target.value); setErrors(current => { const next = { ...current }; delete next.memoryMiB; return next }) }} />{errors.memoryMiB && <span className="field-error" role="alert">{errors.memoryMiB}</span>}</label>
      </div>}
      <label className="col-span-2 grid gap-2 asset-create-address">管理地址 / IP<Input value={fields.address} maxLength={160} placeholder="例如：192.0.2.11" onChange={event => { const address = event.target.value; setFields(current => ({ ...current, address, probeEnabled: address.trim() ? current.probeEnabled : false })) }} /></label>
      <div className="col-span-2 flex items-center gap-3 asset-create-probe"><Switch id="asset-probe" checked={fields.probeEnabled} disabled={!fields.address.trim()} onCheckedChange={checked => update('probeEnabled', checked)} /><label htmlFor="asset-probe">开启 Ping 存活探测</label></div>
      {createFromList && <hr className="asset-create-divider" />}
      {rooms && (
        <label className="grid gap-2 asset-field-room">
          所属数据中心
          <Choice
            value={roomId ? String(roomId) : ''}
            disabled={!!mountedRoomId}
            onChange={value => setRoomId(Number(value || 0))}
            options={[{ value: '', label: '未分配' }, ...rooms.map(room => ({ value: String(room.id), label: room.name }))]}
          />
        </label>
      )}
      <label className="grid gap-2 asset-field-group">所属项目<Choice value={fields.groupId ? String(fields.groupId) : ''} onChange={value => update('groupId', Number(value || 0))} options={[{ value: '', label: '未分配' }, ...groups.map(group => ({ value: String(group.id), label: group.name }))]} /></label>
      <div className="grid gap-2 asset-field-owner"><span>负责人</span><SearchableSelect label="负责人" placeholder="选择或搜索负责人" value={fields.owner} onChange={value => update('owner', value)} options={owners.map(name => ({ value: name, label: name }))} allowCustom indicator="down" triggerClassName="max-w-64" /></div>
      {!networkDevice && <div className="col-span-2 grid gap-3 asset-create-services">
        <div>运行服务</div>
        {serviceRows.map((service, index) => <div key={index} className="flex items-end gap-2">
          <div className="min-w-0 flex-1"><ServicePicker value={service.name} onChange={value => setServiceRows(rows => rows.map((row, i) => i === index ? { name: value } : row))} /></div>
          <Button type="button" variant="ghost" size="icon" aria-label="删除服务" onClick={() => setServiceRows(rows => rows.filter((_, i) => i !== index))}><Trash2 /></Button>
        </div>)}
        <Button type="button" variant="outline" onClick={() => setServiceRows(rows => [...rows, { name: '' }])}><Plus />添加服务</Button>
      </div>}
      {asset && <label className="col-span-2 grid gap-2 asset-field-lifecycle">生命周期<Choice value={fields.lifecycle} onChange={value => update('lifecycle', value as AssetFields['lifecycle'])} options={[{ value: 'active', label: '在册' }, { value: 'retired', label: '已退役' }]} /></label>}
      <label className="col-span-2 grid gap-2 asset-field-notes">备注<Textarea value={fields.notes} rows={createFromList ? 2 : 3} maxLength={2500} onChange={event => update('notes', event.target.value)} /></label>
      <div className="col-span-2 flex justify-end gap-2 asset-field-actions"><Button type="button" variant="outline" onClick={onCancel}>取消</Button><Button type="submit" disabled={busy}>{busy ? '正在保存…' : '保存资产'}</Button></div>
    </form>
  )
}
