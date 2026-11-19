import type { Asset } from './api'
import { occupiedUnits, placementFaceLabel, uRange } from './facilities'
import type { Placement, Rack, RackFace } from './facilities'

/**
 * Build a standalone SVG of a rack elevation, close to what NetBox exports:
 * a U scale, coloured device blocks with their name and unit range, and a
 * legend. The output carries inline styles only, so it can be opened or
 * embedded anywhere.
 */

const UNIT = 22
const FRAME_X = 56
const FRAME_W = 420
const PAD_TOP = 68
const PAD_BOTTOM = 60
const RIGHT = 18

type KindStyle = { fill: string; stroke: string; text: string; label: string }

const KIND: Record<string, KindStyle> = {
  host: { fill: '#3b82f6', stroke: '#1d4ed8', text: '#ffffff', label: '物理机' },
  vm: { fill: '#8b5cf6', stroke: '#6d28d9', text: '#ffffff', label: '虚拟机' },
  switch: { fill: '#14b8a6', stroke: '#0f766e', text: '#ffffff', label: '交换机' },
}

function kindStyle(kind: string): KindStyle {
  return KIND[kind] ?? KIND.host
}

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, Math.max(1, max - 1))}…` : value
}

/** Rough character budget for a given pixel width at the given font size. */
function fit(value: string, width: number, fontSize: number): string {
  return clip(value, Math.max(4, Math.floor(width / (fontSize * 0.62))))
}

export interface RackSvg {
  svg: string
  width: number
  height: number
  filename: string
}

export function rackElevationSvg(
  rack: Rack,
  devices: Placement[],
  assets: Map<number, Asset>,
  face: RackFace,
  options: { minimal?: boolean } = {},
): RackSvg {
  const minimal = options.minimal === true
  const padTop = minimal ? 10 : PAD_TOP
  const padBottom = minimal ? 10 : PAD_BOTTOM
  const visible = devices.filter(device => device.depth === 'full' || device.face === face)
  const height = padTop + rack.heightU * UNIT + padBottom
  const frameX = minimal ? 30 : FRAME_X
  const frameW = minimal ? 210 : FRAME_W
  const width = frameX + frameW + (minimal ? 6 : RIGHT)
  const body: string[] = []

  body.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`)
  if (!minimal) {
    body.push(`<text x="${frameX}" y="30" font-size="17" font-weight="600" fill="#111827">${esc(rack.name)}</text>`)
    body.push(
      `<text x="${frameX}" y="48" font-size="11" fill="#6b7280">${face === 'rear' ? '后视图' : '前视图'}` +
      ` · ${rack.heightU}U · ${visible.length} 台设备 · 已占用 ${occupiedUnits(visible).size}U</text>`,
    )
  }

  // U scale and unit separators.
  const frameTop = padTop
  const frameHeight = rack.heightU * UNIT
  body.push(`<rect x="${frameX}" y="${frameTop}" width="${frameW}" height="${frameHeight}" fill="#f5f5f5" stroke="#d4d4d4"/>`)
  for (let index = 0; index < rack.heightU; index++) {
    const y = frameTop + index * UNIT
    body.push(`<line x1="${frameX}" y1="${y}" x2="${frameX + frameW}" y2="${y}" stroke="#e5e5e5"/>`)
    const unitNumber = rack.heightU - index
    body.push(
      `<text x="${frameX - 8}" y="${y + UNIT / 2 + 4}" font-size="9" fill="#9ca3af" text-anchor="end">U${unitNumber}</text>`,
    )
  }

  for (const device of visible) {
    const asset = assets.get(device.assetId)
    const style = kindStyle(asset?.kind ?? 'host')
    const top = frameTop + (rack.heightU - (device.startU + device.units - 1)) * UNIT
    const blockHeight = Math.max(UNIT - 3, device.units * UNIT - 3)
    const label = asset?.name ?? `资产 #${device.assetId}`
    const fontSize = blockHeight >= 34 ? 12 : 10
    const textY = top + blockHeight / 2 + fontSize / 3

    body.push(
      `<g><title>${esc(`${label} · ${uRange(device)} · ${placementFaceLabel(device)}`)}</title>` +
      `<rect x="${frameX + 4}" y="${top}" width="${frameW - 8}" height="${blockHeight}" rx="2"` +
      ` fill="${style.fill}" stroke="${style.stroke}"/>` +
      `<text x="${frameX + 12}" y="${textY}" font-size="${fontSize}" fill="${style.text}">` +
      `${esc(fit(label, frameW - 90, fontSize))}</text>` +
      `<text x="${frameX + frameW - 12}" y="${textY}" font-size="9" fill="${style.text}" text-anchor="end" opacity="0.9">` +
      `${esc(uRange(device))}</text></g>`,
    )
    if (asset?.status === 'offline' || asset?.status === 'stopped') {
      body.push(`<circle cx="${frameX + 12}" cy="${top + 8}" r="3" fill="#ffffff" opacity="0.75"/>`)
    }
  }

  if (minimal) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="-apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif">${body.join('')}</svg>`
    return { svg, width, height, filename: `${rack.name}-${face === 'rear' ? '后视图' : '前视图'}` }
  }

  // Legend.
  const legendY = height - 34
  let legendX = frameX
  for (const style of Object.values(KIND)) {
    body.push(`<rect x="${legendX}" y="${legendY}" width="12" height="12" rx="2" fill="${style.fill}" stroke="${style.stroke}"/>`)
    body.push(`<text x="${legendX + 18}" y="${legendY + 10}" font-size="11" fill="#6b7280">${style.label}</text>`)
    legendX += 84
  }
  body.push(`<text x="${width - RIGHT}" y="${legendY + 10}" font-size="10" fill="#9ca3af" text-anchor="end">dc-db</text>`)

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="-apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif">${body.join('')}</svg>`

  return {
    svg,
    width,
    height,
    filename: `${rack.name}-${face === 'rear' ? '后视图' : '前视图'}`,
  }
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

export async function downloadRackPng(rack: RackSvg, scale = 2) {
  const url = URL.createObjectURL(new Blob([rack.svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('机柜图渲染失败'))
      element.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = rack.width * scale
    canvas.height = rack.height * scale
    const context = canvas.getContext('2d')
    if (!context) throw new Error('当前浏览器不支持导出 PNG')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('当前浏览器不支持导出 PNG')
    saveBlob(blob, `${rack.filename}.png`)
  } finally {
    URL.revokeObjectURL(url)
  }
}
