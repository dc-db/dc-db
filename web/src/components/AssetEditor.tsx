import { useEffect, useState } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Switch } from './ui/switch'
import { SearchableSelect } from './SearchableSelect'
import { Textarea } from './ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Plus, Trash2 } from 'lucide-react'
import type { Asset, AssetFields, DiskSpec, DiskType, Group, Kind, Person, ServiceEntry, ServiceInstance, Team } from '../api'
import { ALL_KINDS, NETWORK_KINDS, isNetworkKind, KIND_LABELS } from '../kinds'
import { ServicePicker } from './ServicePicker'
import { formatMemory, parseMemory } from '../lib/memory'
import { DISK_TYPE_OPTIONS, formatDiskTooltipLines } from '../lib/hardware'

type DiskUnit = 'GiB' | 'TiB'

interface DiskRow {
  key: string
  type: DiskType
  size: string
  unit: DiskUnit
  count: string
  note: string
}

let nextDiskKey = 1
function createDiskKey(): string {
  return `disk-${nextDiskKey++}`
}

function buildInitialDiskRows(asset: Asset | null): DiskRow[] {
  return (asset?.disks ?? []).map(disk => {
    const useTiB = disk.sizeGiB >= 1024 && disk.sizeGiB % 1024 === 0
    return {
      key: createDiskKey(),
      type: disk.type ?? '',
      size: disk.sizeGiB > 0 ? String(useTiB ? disk.sizeGiB / 1024 : disk.sizeGiB) : '',
      unit: useTiB ? 'TiB' : 'GiB',
      count: String(disk.count > 0 ? disk.count : 1),
      note: disk.note ?? '',
    }
  })
}

interface Props {
  asset: Asset | null
  defaultKind: Kind
  busy: boolean
  error: string
  groups: Group[]
  people: Person[]
  teams: Team[]
  services?: ServiceEntry[]
  rooms?: { id: number; name: string }[]
  defaultRoomId?: number
  mountedRoomId?: number
  createFromList?: boolean
  onSave: (fields: AssetFields & { version: number; services?: ServiceInstance[] }) => void
  onCancel: () => void
}

function buildInitialFields(asset: Asset | null, defaultKind: Kind): AssetFields {
  return {
    kind: asset?.kind ?? defaultKind,
    name: asset?.name ?? '',
    brand: asset?.brand ?? '',
    model: asset?.model ?? '',
    platform: asset?.platform ?? '',
    status: asset?.status ?? 'unknown',
    lifecycle: asset?.lifecycle ?? 'active',
    owner: asset?.owner ?? '',
    environment: asset?.environment ?? '',
    address: asset?.address ?? '',
    probeEnabled: asset?.probeEnabled ?? false,
    cpu: asset?.cpu ?? 0,
    memoryMiB: asset?.memoryMiB ?? 0,
    disks: asset?.disks ?? [],
    groupId: asset?.groupId ?? 0,
    teamId: asset?.teamId ?? 0,
    personId: asset?.personId ?? 0,
    notes: asset?.notes ?? '',
    roomId: asset?.roomId ?? 0,
  }
}

function Choice({ value, options, onChange, disabled, className, ariaLabel }: {
  value: string; options: { value: string; label: string }[]; onChange: (value: string) => void
  disabled?: boolean; className?: string; ariaLabel?: string
}) {
  return <Select value={value || '__empty__'} disabled={disabled} onValueChange={next => onChange(next === '__empty__' ? '' : next)}>
    <SelectTrigger className={className} aria-label={ariaLabel}><SelectValue /></SelectTrigger>
    <SelectContent>{options.map(option => <SelectItem key={option.value || '__empty__'} value={option.value || '__empty__'}>{option.label}</SelectItem>)}</SelectContent>
  </Select>
}

export function AssetEditor({ asset, defaultKind, busy, error, groups, people, teams, services, rooms, defaultRoomId, mountedRoomId, createFromList = false, onSave, onCancel }: Props) {
  const [fields, setFields] = useState<AssetFields>(() => buildInitialFields(asset, defaultKind))
  const [serviceRows, setServiceRows] = useState<ServiceInstance[]>(() => (asset?.services ?? []).map(item => ({ ...item })))
  const [diskRows, setDiskRows] = useState<DiskRow[]>(() => buildInitialDiskRows(asset))
  const [memory, setMemory] = useState(() => formatMemory(asset?.memoryMiB ?? 0))
  const [roomId, setRoomId] = useState<number>(() =>
    mountedRoomId ?? (Number(asset?.roomId) || (asset ? 0 : (defaultRoomId ?? 0))),
  )
  const [validation, setValidation] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [invalidDisk, setInvalidDisk] = useState<{ key: string; field: 'size' | 'count' | 'note' } | null>(null)

  useEffect(() => {
    setFields(buildInitialFields(asset, defaultKind))
    setServiceRows((asset?.services ?? []).map(item => ({ ...item })))
    setDiskRows(buildInitialDiskRows(asset))
    setMemory(formatMemory(asset?.memoryMiB ?? 0))
    setRoomId(mountedRoomId ?? (Number(asset?.roomId) || (asset ? 0 : (defaultRoomId ?? 0))))
    setValidation('')
    setErrors({})
    setInvalidDisk(null)
  }, [asset?.id, asset?.version, defaultKind, defaultRoomId, mountedRoomId])

  function clearDiskError() {
    setInvalidDisk(null)
    setErrors(current => {
      if (!current.disks) return current
      const next = { ...current }
      delete next.disks
      return next
    })
  }

  function addDiskRow() {
    if (diskRows.length >= 32) return
    clearDiskError()
    setDiskRows(rows => [
      ...rows,
      { key: createDiskKey(), type: '', size: '', unit: 'GiB', count: '1', note: '' },
    ])
  }

  function updateDiskRow(key: string, patch: Partial<Omit<DiskRow, 'key'>>) {
    clearDiskError()
    setDiskRows(rows => rows.map(row => row.key === key ? { ...row, ...patch } : row))
  }

  function removeDiskRow(key: string) {
    clearDiskError()
    setDiskRows(rows => rows.filter(row => row.key !== key))
  }

  function update<K extends keyof AssetFields>(key: K, value: AssetFields[K]) {
    setFields(current => ({ ...current, [key]: value }))
    if (key === 'kind') {
      setDiskRows([])
      setInvalidDisk(null)
    }
    setErrors(current => {
      const field = String(key)
      if (!current[field] && !(key === 'kind' && current.disks)) return current
      const next = { ...current }
      delete next[field]
      if (key === 'kind') delete next.disks
      return next
    })
  }

  function save() {
    const next: Record<string, string> = {}
    const name = fields.name.trim()
    const brand = fields.brand.trim()
    const model = fields.model.trim()
    const host = fields.kind === 'host'
    const networkDevice = isNetworkKind(fields.kind)
    if (!name) next.name = '请填写资源名称'
    else if (name.length > 160) next.name = '资源名称不能超过 160 个字符'
    if (host && brand.length > 80) next.brand = '品牌不能超过 80 个字符'
    if (host && model.length > 120) next.model = '型号不能超过 120 个字符'
    if (!Number.isFinite(fields.cpu) || fields.cpu < 0) next.cpu = 'CPU 核数须为 0 或正整数'
    const memoryMiB = parseMemory(memory)
    if (!networkDevice && memoryMiB === null) next.memoryMiB = '请输入以 G 或 M 结尾的有效容量'

    const parsedDisks: DiskSpec[] = []
    let nextInvalidDisk: { key: string; field: 'size' | 'count' | 'note' } | null = null
    if (!networkDevice) {
      if (diskRows.length > 32) {
        next.disks = '最多可录入 32 条硬盘配置'
      } else {
        for (let i = 0; i < diskRows.length; i++) {
          const row = diskRows[i]
          const rowNum = i + 1
          const rawSize = row.size.trim()
          const sizeNum = rawSize === '' ? NaN : Number(rawSize)
          const sizeGiB = Math.round(sizeNum * (row.unit === 'TiB' ? 1024 : 1))
          if (!Number.isFinite(sizeGiB) || sizeGiB < 1 || sizeGiB > 1048576) {
            next.disks = `第 ${rowNum} 行硬盘容量需为 1 GiB 至 1024 TiB 之间的有效数值`
            nextInvalidDisk = { key: row.key, field: 'size' }
            break
          }
          const rawCount = row.count.trim()
          const countNum = rawCount === '' ? NaN : Number(rawCount)
          if (!Number.isInteger(countNum) || countNum < 1 || countNum > 256) {
            next.disks = `第 ${rowNum} 行硬盘数量需为 1 至 256 之间的整数`
            nextInvalidDisk = { key: row.key, field: 'count' }
            break
          }
          const note = row.note.trim()
          if (note.length > 40) {
            next.disks = `第 ${rowNum} 行硬盘备注不能超过 40 个字符`
            nextInvalidDisk = { key: row.key, field: 'note' }
            break
          }
          const spec: DiskSpec = { type: row.type, sizeGiB, count: countNum }
          if (note) spec.note = note
          parsedDisks.push(spec)
        }
      }
    }

    setErrors(next)
    setInvalidDisk(nextInvalidDisk)
    if (Object.keys(next).length > 0) {
      setValidation('请修正表单中标红的字段')
      return
    }
    setValidation('')
    const dedupedServices: ServiceInstance[] = []
    if (!networkDevice) {
      const seen = new Set<string>()
      for (const row of serviceRows) {
        const trimmed = row.name.trim()
        if (!trimmed) continue
        const key = trimmed.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        dedupedServices.push({ name: trimmed })
      }
    }
    onSave({
      ...fields,
      name,
      brand,
      model,
      platform: networkDevice ? '' : fields.platform,
      roomId: mountedRoomId ? (asset?.roomId ?? 0) : roomId,
      cpu: networkDevice ? 0 : Number(fields.cpu || 0),
      memoryMiB: networkDevice ? 0 : (memoryMiB ?? 0),
      disks: networkDevice ? [] : parsedDisks,
      groupId: Number(fields.groupId || 0),
      ...(!networkDevice ? { personId: 0, owner: '' } : {}),
      services: networkDevice ? undefined : dedupedServices,
      version: asset?.version ?? 0,
    })
  }

  const networkDevice = isNetworkKind(fields.kind)
  const isHost = fields.kind === 'host'
  const isComputeAsset = !networkDevice
  const teamLabel = isComputeAsset ? '团队' : '运维团队'
  const projectLabel = isComputeAsset ? '项目' : '所属项目'
  const previewDisks: DiskSpec[] = isComputeAsset
    ? diskRows.reduce<DiskSpec[]>((acc, row) => {
        const rawSize = row.size.trim()
        const sizeGiB = rawSize === '' ? NaN : Math.round(Number(rawSize) * (row.unit === 'TiB' ? 1024 : 1))
        const rawCount = row.count.trim()
        const countNum = rawCount === '' ? NaN : Number(rawCount)
        if (
          Number.isFinite(sizeGiB) && sizeGiB >= 1 && sizeGiB <= 1048576 &&
          Number.isInteger(countNum) && countNum >= 1 && countNum <= 256
        ) {
          acc.push({ type: row.type, sizeGiB, count: countNum })
        }
        return acc
      }, [])
    : []
  const diskSummaryFooter = formatDiskTooltipLines(previewDisks).footer

  return (
    <form onSubmit={event => { event.preventDefault(); save() }} className={`grid grid-cols-2 gap-4${createFromList ? ' asset-create-form' : ''}`}>
      {(validation || error) && <p role="alert" className="col-span-2 text-destructive">{validation || error}</p>}
      <label className={errors.name ? 'grid gap-2 asset-field-name field-invalid' : 'grid gap-2 asset-field-name'}><span>{createFromList ? (networkDevice ? '设备名称' : fields.kind === 'vm' ? '虚拟机名称' : '服务器名称') : '资源名称'} <span className="text-destructive" aria-hidden="true">*</span></span><Input required value={fields.name} maxLength={160} aria-invalid={!!errors.name} onChange={event => update('name', event.target.value)} />{errors.name && <span className="field-error" role="alert">{errors.name}</span>}</label>

      {(!createFromList || networkDevice) && <label className="grid gap-2 asset-field-kind"><span>{createFromList ? '设备类型' : '资源类型'} <span className="text-destructive" aria-hidden="true">*</span></span><Choice value={fields.kind} disabled={!!asset} onChange={value => update('kind', value as Kind)} options={(createFromList ? NETWORK_KINDS : ALL_KINDS).map(value => ({ value, label: KIND_LABELS[value] }))} /></label>}
      {isHost && <label className={errors.brand ? 'grid gap-2 asset-field-brand field-invalid' : 'grid gap-2 asset-field-brand'}><span>品牌</span><Input value={fields.brand} maxLength={80} placeholder="例如：Dell、华为、浪潮" aria-invalid={!!errors.brand} onChange={event => update('brand', event.target.value)} />{errors.brand && <span className="field-error" role="alert">{errors.brand}</span>}</label>}
      {isHost && <label className={errors.model ? 'grid gap-2 asset-field-model field-invalid' : 'grid gap-2 asset-field-model'}><span>型号</span><Input value={fields.model} maxLength={120} placeholder="例如：PowerEdge R750" aria-invalid={!!errors.model} onChange={event => update('model', event.target.value)} />{errors.model && <span className="field-error" role="alert">{errors.model}</span>}</label>}
      {!networkDevice && <label className="grid gap-2 asset-field-platform">平台<Choice value={fields.platform} onChange={value => update('platform', value as AssetFields['platform'])} options={[{ value: '', label: '未分配' }, { value: 'pve', label: 'Proxmox VE' }, { value: 'kvm', label: 'KVM' }, { value: 'esxi', label: 'VMware ESXi' }]} /></label>}
      <label className="grid gap-2 asset-field-environment">环境<Input value={fields.environment} maxLength={40} placeholder="例如：生产" onChange={event => update('environment', event.target.value)} /></label>
      {createFromList && <hr className="asset-create-divider" />}
      {!networkDevice && <div className="col-span-2 grid grid-cols-2 gap-3 asset-create-capacity">
        <label className={errors.cpu ? 'grid gap-2 field-invalid' : 'grid gap-2'}>CPU<Input type="number" min={0} max={65536} value={fields.cpu} aria-invalid={!!errors.cpu} onChange={event => update('cpu', Number(event.target.value))} />{errors.cpu && <span className="field-error" role="alert">{errors.cpu}</span>}</label>
        <label className={errors.memoryMiB ? 'grid gap-2 field-invalid' : 'grid gap-2'}>内存<Input value={memory} maxLength={24} placeholder="如 1G、512M" aria-invalid={!!errors.memoryMiB} onChange={event => { setMemory(event.target.value); setErrors(current => { const next = { ...current }; delete next.memoryMiB; return next }) }} />{errors.memoryMiB && <span className="field-error" role="alert">{errors.memoryMiB}</span>}</label>
      </div>}
      {!networkDevice && (
        <div className="col-span-2 flex flex-col gap-2 pt-1 asset-create-disks">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-baseline gap-2">
              <span>硬盘</span>
              <span className="truncate text-xs text-muted-foreground tabular-nums">
                {diskSummaryFooter || '可选，支持录入多块磁盘'}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={diskRows.length >= 32}
              onClick={addDiskRow}
            >
              <Plus />添加硬盘
            </Button>
          </div>
          {diskRows.length > 0 && (
            <div className="space-y-2">
              {diskRows.map((row, index) => {
                const invalidField = invalidDisk?.key === row.key ? invalidDisk.field : null
                return (
                  <div key={row.key} className="flex items-center gap-1.5">
                    <Choice
                      value={row.type}
                      ariaLabel={`第 ${index + 1} 行硬盘类型`}
                      className="w-[90px] shrink-0 px-2.5"
                      onChange={value => updateDiskRow(row.key, { type: value as DiskType })}
                      options={DISK_TYPE_OPTIONS}
                    />
                    <div className="flex w-[130px] shrink-0 items-center">
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={row.size}
                        placeholder="容量"
                        aria-label={`第 ${index + 1} 行硬盘容量`}
                        aria-invalid={invalidField === 'size'}
                        className="relative min-w-0 flex-1 rounded-r-none border-r-0 px-2 tabular-nums focus-visible:z-10"
                        onChange={event => updateDiskRow(row.key, { size: event.target.value })}
                      />
                      <div
                        role="group"
                        aria-label={`第 ${index + 1} 行容量单位`}
                        className="inline-flex h-9 shrink-0 overflow-hidden rounded-r-md border border-input bg-muted/40 dark:bg-input/20"
                      >
                        {(['GiB', 'TiB'] as const).map(unit => {
                          const active = row.unit === unit
                          return (
                            <button
                              key={unit}
                              type="button"
                              aria-pressed={active}
                              onClick={() => updateDiskRow(row.key, { unit })}
                              className={
                                active
                                  ? 'w-6 text-xs font-medium bg-primary text-primary-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                                  : 'w-6 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                              }
                            >
                              {unit === 'GiB' ? 'G' : 'T'}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <div className="flex w-[78px] shrink-0 items-center">
                      <span
                        className="inline-flex h-9 items-center rounded-l-md border border-r-0 border-input bg-muted/40 px-1.5 text-xs text-muted-foreground select-none dark:bg-input/20"
                        aria-hidden="true"
                      >
                        ×
                      </span>
                      <Input
                        type="number"
                        min="1"
                        max="256"
                        step="1"
                        value={row.count}
                        aria-label={`第 ${index + 1} 行硬盘数量`}
                        aria-invalid={invalidField === 'count'}
                        className="relative min-w-0 flex-1 rounded-l-none px-1.5 text-center tabular-nums focus-visible:z-10"
                        onChange={event => updateDiskRow(row.key, { count: event.target.value })}
                      />
                    </div>
                    <Input
                      value={row.note}
                      maxLength={40}
                      placeholder="系统盘 / 数据盘"
                      aria-label={`第 ${index + 1} 行硬盘备注`}
                      aria-invalid={invalidField === 'note'}
                      className="min-w-0 flex-1 px-2.5"
                      onChange={event => updateDiskRow(row.key, { note: event.target.value })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="删除此硬盘"
                      title="删除此硬盘"
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => removeDiskRow(row.key)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
          {errors.disks && <span className="field-error" role="alert">{errors.disks}</span>}
        </div>
      )}
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
      <label className="grid gap-2 asset-field-group">{projectLabel}<Choice value={fields.groupId ? String(fields.groupId) : ''} onChange={value => update('groupId', Number(value || 0))} options={[{ value: '', label: '未分配' }, ...groups.map(group => ({ value: String(group.id), label: group.name }))]} /></label>
      <div className="grid gap-2"><span>{teamLabel}</span><SearchableSelect label={teamLabel} placeholder="未分配" value={fields.teamId ? String(fields.teamId) : ''} onChange={value => update('teamId', Number(value))} options={teams.map(team => ({ value: String(team.id), label: team.name }))} indicator="down" triggerClassName="max-w-64" /></div>
      {networkDevice && <div className="grid gap-2 asset-field-owner"><span>负责人</span><SearchableSelect
        label="负责人" placeholder="未分配"
        value={fields.personId ? String(fields.personId) : fields.owner ? 'legacy' : ''}
        onChange={value => {
          if (value === 'legacy') return
          setFields(current => ({ ...current, personId: Number(value), owner: '' }))
        }}
        options={[
          ...(fields.owner && !fields.personId ? [{ value: 'legacy', label: fields.owner }] : []),
          ...people.map(person => ({ value: String(person.id), label: person.name })),
        ]}
        indicator="down" triggerClassName="max-w-64"
      /></div>}
      {!networkDevice && <div className="col-span-2 grid gap-3 asset-create-services">
        <div>运行服务</div>
        {serviceRows.map((service, index) => {
          const excludedNames = serviceRows
            .filter((_, i) => i !== index)
            .map(row => row.name.trim())
            .filter(Boolean)
          return <div key={index} className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <ServicePicker
                value={service.name}
                registeredServices={services}
                excludedNames={excludedNames}
                onChange={value => setServiceRows(rows => rows.map((row, i) => i === index ? { name: value } : row))}
              />
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label="删除服务" title="删除服务" onClick={() => setServiceRows(rows => rows.filter((_, i) => i !== index))}><Trash2 /></Button>
          </div>
        })}
        <Button type="button" variant="outline" onClick={() => setServiceRows(rows => [...rows, { name: '' }])}><Plus />添加服务</Button>
      </div>}
      {asset && <label className="col-span-2 grid gap-2 asset-field-lifecycle">生命周期<Choice value={fields.lifecycle} onChange={value => update('lifecycle', value as AssetFields['lifecycle'])} options={[{ value: 'active', label: '在册' }, { value: 'retired', label: '已退役' }]} /></label>}
      <label className="col-span-2 grid gap-2 asset-field-notes">备注<Textarea value={fields.notes} rows={createFromList ? 2 : 3} maxLength={2500} onChange={event => update('notes', event.target.value)} /></label>
      <div className="col-span-2 flex justify-end gap-2 asset-field-actions"><Button type="button" variant="outline" onClick={onCancel}>取消</Button><Button type="submit" disabled={busy}>{busy ? '正在保存…' : '保存资产'}</Button></div>
    </form>
  )
}
