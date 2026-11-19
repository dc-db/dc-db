import type { Asset } from './api'
import { uRange } from './facilities'
import type { Placement, Rack, RackFace } from './facilities'

/**
 * Rack elevation drawing, modelled on NetBox's server-side SVG renderer:
 *
 *   width  = legend(30) + border(2) + unit_width(220) + margin(15) + border(2)
 *   height = unit_height(22) * u_height + border(2) * 2
 *
 * Every rack unit is drawn as a slot rectangle, so the elevation gets the same
 * striped body as NetBox; devices are coloured bars laid over the slots.
 * Colours come from CSS variables that the SVG declares itself (so a downloaded
 * file still renders) and that the app overrides per theme when inline.
 */

const UNIT_WIDTH = 220
const UNIT_HEIGHT = 22
const LEGEND_WIDTH = 30
const MARGIN_WIDTH = 15
const BORDER = 2

type StatusStyle = { fill: string }

const STATUS: Record<string, StatusStyle> = {
  online: { fill: '#2ea043' },
  running: { fill: '#2ea043' },
  offline: { fill: '#cf222e' },
  stopped: { fill: '#cf222e' },
  paused: { fill: '#bf8700' },
  unknown: { fill: '#6e7781' },
}

function statusStyle(status?: string): StatusStyle {
  return STATUS[status ?? ''] ?? STATUS.unknown
}

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function fit(value: string, width: number, fontSize: number): string {
  const max = Math.max(4, Math.floor(width / (fontSize * 0.6)))
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

export interface RackSvg {
  svg: string
  width: number
  height: number
  filename: string
}

// Light defaults are written as attributes so a downloaded file renders on its
// own; the app overrides them per theme through the classes.
const LIGHT = {
  bg: '#f6f8fb',
  slot: '#e9ecef',
  slotBorder: '#adb5bd',
  frame: '#000000',
  unit: '#6c757d',
}

export function rackElevationSvg(
  rack: Rack,
  devices: Placement[],
  assets: Map<number, Asset>,
  face: RackFace,
  options: { interactive?: boolean } = {},
): RackSvg {
  const interactive = options.interactive === true
  const visible = devices.filter(device => device.depth === 'full' || device.face === face)
  const taken = new Set<number>()
  for (const device of visible) {
    for (let offset = 0; offset < device.units; offset++) taken.add(device.startU + offset)
  }
  const width = LEGEND_WIDTH + BORDER + UNIT_WIDTH + MARGIN_WIDTH + BORDER
  const height = UNIT_HEIGHT * rack.heightU + BORDER * 2
  const rackX = LEGEND_WIDTH + BORDER
  const body: string[] = []

  body.push('<defs><pattern id="rack-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="var(--hatch-bg, #f7f7f7)"/><rect width="4" height="8" fill="var(--hatch-line, #e9b3b3)"/></pattern></defs>')
  body.push(`<rect class="rack-bg" x="0" y="0" width="${width}" height="${height}" fill="${LIGHT.bg}"/>`)

  // One slot per U, top to bottom, plus the unit legend on the left.
  for (let index = 0; index < rack.heightU; index++) {
    const unit = rack.heightU - index
    const y = BORDER + index * UNIT_HEIGHT
    const slot =
      `<rect class="slot${interactive && !taken.has(unit) ? ' free' : ''}" x="${rackX}" y="${y}" ` +
      `width="${UNIT_WIDTH}" height="${UNIT_HEIGHT}" fill="${LIGHT.slot}" stroke="${LIGHT.slotBorder}" stroke-width="1"/>`
    if (interactive && !taken.has(unit)) {
      body.push(
        `<g class="slot-row" data-unit="${unit}">${slot}` +
        `<text class="slot-add" x="${rackX + UNIT_WIDTH / 2}" y="${y + UNIT_HEIGHT / 2}" font-size="12" ` +
        `fill="${LIGHT.unit}" text-anchor="middle" dominant-baseline="middle">＋ 添加设备</text></g>`,
      )
    } else {
      body.push(slot)
    }
    body.push(
      `<text class="unit" x="${LEGEND_WIDTH / 2}" y="${y + UNIT_HEIGHT / 2}" font-size="14" ` +
      `fill="${LIGHT.unit}" text-anchor="middle" dominant-baseline="middle">${unit}</text>`,
    )
  }

  // Devices sit on top of the slots.
  for (const device of visible) {
    const asset = assets.get(device.assetId)
    const label = asset?.name ?? `资产 #${device.assetId}`
    const style = statusStyle(asset?.status)
    const top = BORDER + (rack.heightU - (device.startU + device.units - 1)) * UNIT_HEIGHT
    const blockHeight = device.units * UNIT_HEIGHT
    body.push(
      `<g class="device-bar${device.face !== face ? ' opposite' : ''}"${interactive ? ` data-asset="${device.assetId}"` : ''}><title>${esc(`${label} · ${uRange(device)}`)}</title>` +
      `<rect x="${rackX}" y="${top}" width="${UNIT_WIDTH}" height="${blockHeight}" fill="${device.face !== face ? 'url(#rack-hatch)' : style.fill}"/>` +
      `<text class="device" x="${rackX + UNIT_WIDTH / 2}" y="${top + blockHeight / 2}" font-size="14" ` +
      `text-anchor="middle" dominant-baseline="middle" fill="${device.face !== face ? 'var(--hatch-text, #5c1a1a)' : '#ffffff'}">` +
      `${esc(fit(label, UNIT_WIDTH - 10, 14))}</text></g>`,
    )
  }

  // Frame last so its border sits above the slots.
  body.push(
    `<rect class="frame" x="${rackX}" y="${BORDER}" width="${UNIT_WIDTH}" height="${UNIT_HEIGHT * rack.heightU}" ` +
    `fill="none" stroke="${LIGHT.frame}" stroke-width="2"/>`,
  )

  const font = 'system-ui,-apple-system,Segoe UI,Roboto,Noto Sans SC,sans-serif'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${font}">${body.join('')}</svg>`
  return { svg, width, height, filename: `${rack.name}-${face === 'rear' ? '后视图' : '前视图'}` }
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadRackSvg(rack: RackSvg) {
  saveBlob(new Blob([rack.svg], { type: 'image/svg+xml;charset=utf-8' }), `${rack.filename}.svg`)
}

export async function downloadSvgTextPng(svg: string, filename: string, scale = 2) {
  const width = Number(/width="(\d+)"/.exec(svg)?.[1] ?? 0)
  const height = Number(/height="(\d+)"/.exec(svg)?.[1] ?? 0)
  if (!width || !height) throw new Error('机柜图尺寸读取失败')
  await rasterise(svg, width, height, filename, scale)
}

export async function downloadRackPng(rack: RackSvg, scale = 2) {
  await rasterise(rack.svg, rack.width, rack.height, rack.filename, scale)
}

async function rasterise(svg: string, width: number, height: number, filename: string, scale: number) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('机柜图渲染失败'))
      element.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = width * scale
    canvas.height = height * scale
    const context = canvas.getContext('2d')
    if (!context) throw new Error('当前浏览器不支持导出 PNG')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('当前浏览器不支持导出 PNG')
    saveBlob(blob, `${filename}.png`)
  } finally {
    URL.revokeObjectURL(url)
  }
}
