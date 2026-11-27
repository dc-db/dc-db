import type { EChartsOption } from 'echarts'

export interface NameCount {
  name: string
  value: number
  key?: string
}

export interface RoomAssetDist {
  roomId: number
  roomName: string
  hosts: number
  vms: number
  network: number
}

export interface UsageItem {
  id: number
  label: string
  used: number
  total: number
  percent: number
  detail: string
}

const LIGHT_PALETTE = ['#2563eb', '#0d9488', '#d97706', '#7c3aed', '#e11d48', '#0284c7']
const DARK_PALETTE = ['#3b82f6', '#14b8a6', '#f59e0b', '#a78bfa', '#fb7185', '#38bdf8']

export function chartPalette(dark: boolean): string[] {
  return dark ? [...DARK_PALETTE] : [...LIGHT_PALETTE]
}

export function statusChartColor(status: string, dark: boolean): string {
  switch (status) {
    case 'running': return dark ? '#34d399' : '#10b981'
    case 'online': return dark ? '#3b82f6' : '#2563eb'
    case 'paused': return dark ? '#fbbf24' : '#d97706'
    case 'offline': return dark ? '#f87171' : '#dc2626'
    case 'stopped': return dark ? '#fb7185' : '#e11d48'
    default: return '#737373'
  }
}

export function usageBarColor(percent: number, dark: boolean): string {
  if (percent >= 85) return dark ? '#ef4444' : '#dc2626'
  if (percent >= 70) return dark ? '#f59e0b' : '#d97706'
  return dark ? '#3b82f6' : '#2563eb'
}

export function formatComputeMemory(mib: number): string {
  if (!Number.isFinite(mib) || mib <= 0) return '0 GiB'
  if (mib >= 1024 * 1024) return `${(mib / (1024 * 1024)).toFixed(1)} TiB`
  return `${Math.round(mib / 1024)} GiB`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function themeColors(dark: boolean) {
  return {
    text: dark ? '#fafafa' : '#0a0a0a',
    muted: dark ? '#a3a3a3' : '#737373',
    border: dark ? '#262626' : '#e5e5e5',
    surface: dark ? '#141414' : '#ffffff',
    popover: dark ? '#171717' : '#ffffff',
    pointer: dark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(10, 10, 10, 0.04)',
  }
}

function tooltipBase(dark: boolean) {
  const c = themeColors(dark)
  return {
    confine: true,
    backgroundColor: c.popover,
    borderColor: c.border,
    borderWidth: 1,
    textStyle: { color: c.text, fontSize: 13 },
  }
}

function circleLegend(position: 'top' | 'bottom', dark: boolean) {
  const c = themeColors(dark)
  return {
    ...(position === 'top' ? { top: 0 } : { bottom: 0 }),
    left: 'center',
    icon: 'circle',
    itemWidth: 8,
    itemHeight: 8,
    itemGap: 14,
    textStyle: { color: c.muted, fontSize: 12 },
  }
}

function formatPieTooltip(params: unknown): string {
  const item = (Array.isArray(params) ? params[0] : params) as {
    marker?: string
    name?: string
    value?: number
    percent?: number
  } | undefined
  if (!item) return ''
  const name = escapeHtml(String(item.name ?? ''))
  const value = typeof item.value === 'number' ? item.value.toLocaleString() : escapeHtml(String(item.value ?? ''))
  const pct = typeof item.percent === 'number' ? ` (${item.percent}%)` : ''
  return `${item.marker ?? ''}${name}: <strong>${value}</strong>${pct}`
}

function buildDonutOption(
  titleText: string,
  subtext: string,
  data: Array<{ name: string; value: number; itemStyle?: { color: string } }>,
  dark: boolean,
  color?: string[],
): EChartsOption {
  const c = themeColors(dark)
  return {
    ...(color ? { color } : {}),
    title: {
      text: titleText,
      subtext,
      left: 'center',
      top: '34%',
      padding: [2, 0],
      itemGap: 4,
      textStyle: { color: c.text, fontSize: 22, fontWeight: 600 },
      subtextStyle: { color: c.muted, fontSize: 12 },
    },
    tooltip: { ...tooltipBase(dark), trigger: 'item', formatter: formatPieTooltip },
    legend: circleLegend('bottom', dark),
    series: [{
      type: 'pie',
      radius: ['52%', '74%'],
      center: ['50%', '43%'],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 4, borderColor: c.surface, borderWidth: 2 },
      label: { show: false },
      labelLine: { show: false },
      emphasis: { scale: true, scaleSize: 4 },
      data,
    }],
  }
}

export function buildAssetTypeOption(items: NameCount[], total: number, dark: boolean): EChartsOption {
  return buildDonutOption(
    total.toLocaleString(),
    '在册资产',
    items.map(item => ({ name: item.name, value: item.value })),
    dark,
    chartPalette(dark),
  )
}

export function buildRoomDistOption(rooms: RoomAssetDist[], dark: boolean): EChartsOption {
  const c = themeColors(dark)
  const palette = chartPalette(dark)
  const ordered = rooms.slice(0, 6).reverse()
  const rightRadius = (active: boolean) => (active ? [0, 3, 3, 0] : [0, 0, 0, 0])

  return {
    tooltip: { ...tooltipBase(dark), trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: c.pointer } } },
    legend: circleLegend('top', dark),
    grid: { left: 8, right: 16, top: 34, bottom: 8, containLabel: true },
    xAxis: {
      type: 'value', minInterval: 1,
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: c.muted, fontSize: 12 },
      splitLine: { lineStyle: { color: c.border, type: 'dashed' } },
    },
    yAxis: {
      type: 'category', data: ordered.map(room => room.roomName),
      axisTick: { show: false }, axisLine: { lineStyle: { color: c.border } },
      axisLabel: { color: c.muted, fontSize: 12, width: 120, overflow: 'truncate' },
    },
    series: [
      {
        name: '服务器', type: 'bar', stack: 'total', barMaxWidth: 20, itemStyle: { color: palette[1] },
        data: ordered.map(r => ({ value: r.hosts, itemStyle: { borderRadius: rightRadius(r.hosts > 0 && r.vms === 0 && r.network === 0) } })),
      },
      {
        name: '虚拟机', type: 'bar', stack: 'total', barMaxWidth: 20, itemStyle: { color: palette[0] },
        data: ordered.map(r => ({ value: r.vms, itemStyle: { borderRadius: rightRadius(r.vms > 0 && r.network === 0) } })),
      },
      {
        name: '网络设备', type: 'bar', stack: 'total', barMaxWidth: 20, itemStyle: { color: palette[2] },
        data: ordered.map(r => ({ value: r.network, itemStyle: { borderRadius: rightRadius(r.network > 0) } })),
      },
    ],
  }
}

export function buildVmStatusOption(items: NameCount[], running: number, total: number, dark: boolean): EChartsOption {
  return buildDonutOption(
    running.toLocaleString(),
    `运行中 / ${total}`,
    items.map(item => ({
      name: item.name,
      value: item.value,
      itemStyle: { color: statusChartColor(item.key ?? item.name, dark) },
    })),
    dark,
  )
}

export function buildPlatformOption(items: NameCount[], dark: boolean): EChartsOption {
  const c = themeColors(dark)
  const palette = chartPalette(dark)
  return {
    tooltip: { ...tooltipBase(dark), trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: c.pointer } } },
    grid: { left: 8, right: 12, top: 28, bottom: 8, containLabel: true },
    xAxis: {
      type: 'category', data: items.map(item => item.name),
      axisTick: { show: false }, axisLine: { lineStyle: { color: c.border } },
      axisLabel: { color: c.muted, fontSize: 12, width: 100, overflow: 'truncate' },
    },
    yAxis: {
      type: 'value', minInterval: 1,
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: c.muted, fontSize: 12 },
      splitLine: { lineStyle: { color: c.border, type: 'dashed' } },
    },
    series: [{
      type: 'bar', barMaxWidth: 44,
      label: { show: true, position: 'top', color: c.text, fontSize: 12, fontWeight: 500 },
      data: items.map((item, i) => ({
        value: item.value,
        itemStyle: { color: palette[i % palette.length], borderRadius: [6, 6, 0, 0] },
      })),
    }],
  }
}

export function buildUsageBarOption(items: UsageItem[], dark: boolean): EChartsOption {
  const c = themeColors(dark)
  const ordered = [...items].reverse()
  return {
    tooltip: {
      ...tooltipBase(dark),
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: c.pointer } },
      formatter: (params: unknown) => {
        const first = (Array.isArray(params) ? params[0] : params) as { dataIndex?: number } | undefined
        const item = typeof first?.dataIndex === 'number' ? ordered[first.dataIndex] : undefined
        if (!item) return ''
        const dot = usageBarColor(item.percent, dark)
        return [
          `<div style="font-weight:600;margin-bottom:4px">${escapeHtml(item.label)}</div>`,
          `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px">`,
          `<span style="display:inline-flex;align-items:center;gap:6px;color:${c.muted}">`,
          `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dot}"></span>`,
          `${escapeHtml(item.detail)}</span>`,
          `<strong style="font-variant-numeric:tabular-nums">${item.percent}%</strong>`,
          `</div>`,
        ].join('')
      },
    },
    grid: { left: 8, right: 44, top: 8, bottom: 8, containLabel: true },
    xAxis: {
      type: 'value', max: 100,
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { formatter: '{value}%', color: c.muted, fontSize: 12 },
      splitLine: { lineStyle: { color: c.border, type: 'dashed' } },
    },
    yAxis: {
      type: 'category', data: ordered.map(item => item.label),
      axisTick: { show: false }, axisLine: { lineStyle: { color: c.border } },
      axisLabel: { color: c.muted, fontSize: 12, width: 160, overflow: 'truncate' },
    },
    series: [{
      type: 'bar', barMaxWidth: 20,
      label: { show: true, position: 'right', formatter: '{c}%', color: c.text, fontSize: 12, fontWeight: 500 },
      data: ordered.map(item => ({
        value: item.percent,
        itemStyle: { color: usageBarColor(item.percent, dark), borderRadius: [0, 4, 4, 0] },
      })),
    }],
  }
}
