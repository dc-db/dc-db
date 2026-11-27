import type { DiskSpec, DiskType } from '../api'

export const DISK_TYPE_OPTIONS: { value: DiskType; label: string }[] = [
  { value: 'nvme', label: 'NVMe' },
  { value: 'ssd', label: 'SSD' },
  { value: 'hdd', label: 'HDD' },
  { value: '', label: '未指定' },
]

export const DISK_TYPE_LABELS: Record<DiskType, string> = {
  nvme: 'NVMe',
  ssd: 'SSD',
  hdd: 'HDD',
  '': '',
}

function round1(n: number): string {
  return Number(n.toFixed(1)).toString()
}

export function totalDiskGiB(disks?: DiskSpec[] | null): number {
  let total = 0
  for (const d of disks ?? []) {
    const size = Number.isFinite(d.sizeGiB) && d.sizeGiB > 0 ? d.sizeGiB : 0
    const count = Number.isFinite(d.count) && d.count > 0 ? d.count : 1
    total += size * count
  }
  return total
}

export function totalDiskCount(disks?: DiskSpec[] | null): number {
  let count = 0
  for (const d of disks ?? []) {
    if (!Number.isFinite(d.sizeGiB) || d.sizeGiB <= 0) continue
    count += Number.isFinite(d.count) && d.count > 0 ? d.count : 1
  }
  return count
}

export function formatMemoryCompact(mib: number): string {
  if (!Number.isFinite(mib) || mib <= 0) return ''
  if (mib >= 1048576) return `${round1(mib / 1048576)}T`
  if (mib >= 1024) return `${round1(mib / 1024)}G`
  return `${mib}M`
}

export function formatDiskGiB(gib: number): string {
  if (!Number.isFinite(gib) || gib <= 0) return ''
  if (gib >= 1024) return `${round1(gib / 1024)}T`
  return `${gib}G`
}

export function formatDiskLine(disk: DiskSpec): string {
  const size = formatDiskGiB(disk.sizeGiB)
  if (!size) return ''
  const label = DISK_TYPE_LABELS[disk.type] || ''
  const count = Number.isFinite(disk.count) && disk.count > 0 ? disk.count : 1
  const note = disk.note?.trim() ?? ''
  let text = label ? `${label} ${size}` : size
  if (count > 1) text += ` × ${count}`
  if (note) text += `（${note}）`
  return text
}

export function formatDiskCompactLine(disk: DiskSpec): string {
  const size = formatDiskGiB(disk.sizeGiB)
  if (!size) return ''
  const label = DISK_TYPE_LABELS[disk.type] || ''
  const count = Number.isFinite(disk.count) && disk.count > 0 ? disk.count : 1
  const note = disk.note?.trim() ?? ''
  let text = label ? `${label} ${size}` : size
  if (count > 1) text += `×${count}`
  if (note) text += `(${note})`
  return text
}

export function formatDiskSummary(disks?: DiskSpec[] | null): string {
  if (!disks?.length) return ''
  return disks.map(formatDiskCompactLine).filter(Boolean).join('; ')
}

export function formatDiskTooltipLines(disks?: DiskSpec[] | null): { lines: string[]; footer: string } {
  const valid = (disks ?? []).filter(d => Number.isFinite(d.sizeGiB) && d.sizeGiB > 0)
  if (valid.length === 0) return { lines: [], footer: '' }
  const count = totalDiskCount(valid)
  const total = totalDiskGiB(valid)
  return {
    lines: valid.map(formatDiskLine).filter(Boolean),
    footer: `共 ${count} 块 · 总计 ${formatDiskGiB(total)}`,
  }
}

export function formatConfigSummary(cpu: number, memoryMiB: number, disks?: DiskSpec[] | null): string {
  const parts = [
    cpu > 0 ? `${cpu}C` : '',
    formatMemoryCompact(memoryMiB),
    formatDiskGiB(totalDiskGiB(disks)),
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : '—'
}

export function configFilterKey(cpu: number, memoryMiB: number, disks?: DiskSpec[] | null): string {
  const diskGiB = totalDiskGiB(disks)
  const c = cpu > 0 ? cpu : 0
  const m = memoryMiB > 0 ? memoryMiB : 0
  if (c <= 0 && m <= 0 && diskGiB <= 0) return ''
  return `${c}:${m}:${diskGiB}`
}
