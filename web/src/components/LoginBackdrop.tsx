import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { resolveServiceIcon } from '../serviceIcons'

interface FieldToken {
  label: string
  kind: 'service' | 'stroke'
  key: string
}

const TOKENS: readonly FieldToken[] = [
  { label: 'Server', kind: 'stroke', key: 'server' },
  { label: 'Switch', kind: 'stroke', key: 'switch' },
  { label: 'PostgreSQL', kind: 'service', key: 'postgresql' },
  { label: 'Firewall', kind: 'stroke', key: 'firewall' },
  { label: 'VLAN', kind: 'stroke', key: 'vlan' },
  { label: 'Nginx', kind: 'service', key: 'nginx' },
  { label: 'Rack', kind: 'stroke', key: 'rack' },
  { label: 'Router', kind: 'stroke', key: 'router' },
  { label: 'Redis', kind: 'service', key: 'redis' },
  { label: 'Data Center', kind: 'stroke', key: 'dc' },
  { label: 'IPAM', kind: 'stroke', key: 'ipam' },
  { label: 'Proxmox VE', kind: 'service', key: 'proxmox' },
  { label: 'Load Balancer', kind: 'stroke', key: 'lb' },
  { label: 'Kafka', kind: 'service', key: 'kafka' },
  { label: 'VM', kind: 'stroke', key: 'vm' },
  { label: 'Subnet', kind: 'stroke', key: 'subnet' },
  { label: 'Prometheus', kind: 'service', key: 'prometheus' },
  { label: 'KVM', kind: 'stroke', key: 'kvm' },
  { label: 'MinIO', kind: 'service', key: 'minio' },
  { label: 'Carrier', kind: 'stroke', key: 'carrier' },
  { label: 'Grafana', kind: 'service', key: 'grafana' },
  { label: 'Topology', kind: 'stroke', key: 'topology' },
  { label: 'Docker', kind: 'service', key: 'docker' },
  { label: 'MySQL', kind: 'service', key: 'mysql' },
  { label: 'GitLab', kind: 'service', key: 'gitlab' },
  { label: 'Audit Log', kind: 'stroke', key: 'audit' },
  { label: 'etcd', kind: 'service', key: 'etcd' },
  { label: 'Harbor', kind: 'service', key: 'harbor' },
  { label: 'Vault', kind: 'service', key: 'vault' },
  { label: 'Kubernetes', kind: 'service', key: 'kubernetes' },
  { label: 'Elasticsearch', kind: 'service', key: 'elasticsearch' },
  { label: 'RabbitMQ', kind: 'service', key: 'rabbitmq' },
]

// Clean 24x24 single-color stroke paths for infrastructure & network icons.
const STROKE_PATHS: Record<string, string> = {
  server: 'M3 4.5h18v6H3z M3 13.5h18v6H3z M6.5 7.5h.01 M6.5 16.5h.01 M13 7.5h4.5 M13 16.5h4.5',
  switch: 'M2.5 7h19v10h-19z M6.5 10.5v3 M9.8 10.5v3 M13.1 10.5v3 M16.4 10.5v3',
  firewall: 'M12 3L4.5 6.2v5.4c0 4.5 3.1 8.3 7.5 9.4 4.4-1.1 7.5-4.9 7.5-9.4V6.2L12 3z M8.5 10.5h7 M8.5 14h7 M12 10.5v3.5',
  router: 'M3 13.5h18v6.5H3z M7.5 13.5V9 M16.5 13.5V7 M5.2 7.2a3.2 3.2 0 0 1 4.6 0 M13.8 5.2a4 4 0 0 1 5.4 0 M11 16.75h6',
  lb: 'M5 12h10 M11 12c1.4 0 2-5.5 6-5.5 M11 12c1.4 0 2 5.5 6 5.5 M3 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M17 6.5a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0 M17 12a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0 M17 17.5a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0',
  dc: 'M3 4h11v16H3z M14 9h7v11h-7 M6.5 8h4 M6.5 11.5h4 M6.5 15h2',
  rack: 'M5 3h14v18H5z M5 9h14 M5 15h14 M8.5 6h.01 M8.5 12h.01 M8.5 18h.01 M12 6h3.5 M12 12h3.5 M12 18h3.5',
  vm: 'M3 4.5h18v12H3z M8 20h8 M12 16.5V20 M8.5 9.2l2.3 2-2.3 2 M12.8 13.2h2.8',
  kvm: 'M4 7.5L12 3l8 4.5v9L12 21l-8-4.5v-9z M4 7.5L12 12l8-4.5 M12 12v9',
  vlan: 'M16 4h4v4 M4 20l6.5-6.5 M20 4l-6.5 6.5 M4 4l16 16 M16 20h4v-4',
  subnet: 'M8.5 3.5h7V8h-7z M2.5 16h6.5v4.5H2.5z M15 16h6.5v4.5H15z M12 8v4 M5.75 16v-4h12.5v4',
  ipam: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M3 12h18 M12 3a13 13 0 0 1 0 18 M12 3a13 13 0 0 0 0 18',
  carrier: 'M12 9a1.2 1.2 0 1 0 0 .01 M8.8 12.1a4.4 4.4 0 0 1 0-6.2 M15.2 5.9a4.4 4.4 0 0 1 0 6.2 M6.1 14.8a8.2 8.2 0 0 1 0-11.6 M17.9 3.2a8.2 8.2 0 0 1 0 11.6 M9 20.5L12 11.5l3 9 M10.1 17.5h3.8',
  topology: 'M11 3.1a2 2 0 0 1 2 0l6.2 3.6a2 2 0 0 1 1 1.73v7.14a2 2 0 0 1-1 1.73L13 20.9a2 2 0 0 1-2 0l-6.2-3.6a2 2 0 0 1-1-1.73V8.43a2 2 0 0 1 1-1.73L11 3.1z M9.25 12a2.75 2.75 0 1 0 5.5 0a2.75 2.75 0 1 0-5.5 0',
  audit: 'M3 12a9 9 0 1 0 3-6.7L3 8 M3 3v5h5 M12 7v5l3 2',
}

interface PlacedItem {
  tokenIndex: number
  x: number
  y: number
  cx: number
  cy: number
  width: number
  baseAlpha: number
  level: number
}

interface TrailPoint {
  x: number
  y: number
  born: number
}

const ICON_SIZE = 13
const ICON_GAP = 6
const COL_GAP = 24
const ROW_H = 30
const FONT = '400 12.5px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
const BASE_COLOR = '#9a9ea6'
const ACCENT_COLOR = '#3b82f6'

// Exact Cloudflare Domains hover trail parameters
const HOVER_RADIUS = 132
const TRAIL_LIFETIME = 1333.33
const TRAIL_MAX = 60
const TRAIL_MIN_MOVE = 6
const TRAIL_STEP = 12
const ATTACK_TAU = 50
const DECAY_TAU = 90

function deterministicAlpha(index: number): number {
  const hash = (((index * 1103515245 + 12345) >>> 0) % 1000) / 1000
  return 0.08 + hash * 0.08
}

/**
 * Minimalist Cloudflare-Domains-inspired interactive field:
 * borderless monochrome icon + label rows at whisper-quiet opacity,
 * illuminating smoothly in DC-DB blue within a trailing pointer region
 * and gently fading away after the cursor leaves.
 */
export function LoginBackdrop({ children }: { children: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const finePointer = window.matchMedia?.('(any-hover: hover) and (any-pointer: fine)').matches ?? true

    // Compile all Path2D icons once
    const compiledPaths = TOKENS.map(token => {
      if (token.kind === 'service') {
        const brand = resolveServiceIcon(token.key)
        return { mode: 'fill' as const, path: new Path2D(brand?.path ?? '') }
      }
      return { mode: 'stroke' as const, path: new Path2D(STROKE_PATHS[token.key] ?? STROKE_PATHS.server) }
    })

    let width = 1
    let height = 1
    let dpr = Math.min(window.devicePixelRatio || 1, 2)
    let items: PlacedItem[] = []
    let trail: TrailPoint[] = []
    let lastStampX = -9999
    let lastStampY = -9999
    let rafId = 0
    let lastFrameTime = 0

    function drawItem(item: PlacedItem, color: string, alpha: number) {
      if (!ctx || alpha <= 0.002) return
      const token = TOKENS[item.tokenIndex]
      const compiled = compiledPaths[item.tokenIndex]
      const iconY = item.y + (ROW_H - ICON_SIZE) * 0.5

      ctx.save()
      ctx.globalAlpha = alpha
      ctx.translate(item.x, iconY)
      ctx.scale(ICON_SIZE / 24, ICON_SIZE / 24)
      if (compiled.mode === 'fill') {
        ctx.fillStyle = color
        ctx.fill(compiled.path)
      } else {
        ctx.strokeStyle = color
        ctx.lineWidth = 1.85
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.stroke(compiled.path)
      }
      ctx.restore()

      ctx.save()
      ctx.globalAlpha = alpha
      ctx.font = FONT
      ctx.fillStyle = color
      ctx.textBaseline = 'middle'
      ctx.fillText(token.label, item.x + ICON_SIZE + ICON_GAP, item.cy + 0.5)
      ctx.restore()
    }

    function renderFrame(now: number) {
      if (!ctx) return
      const dt = lastFrameTime ? Math.min(64, Math.max(1, now - lastFrameTime)) : 16
      lastFrameTime = now

      // Expire old trail points
      let writeIdx = 0
      for (let i = 0; i < trail.length; i++) {
        if (now - trail[i].born < TRAIL_LIFETIME) {
          trail[writeIdx++] = trail[i]
        }
      }
      trail.length = writeIdx

      const attackFactor = 1 - Math.exp(-dt / ATTACK_TAU)
      const decayFactor = 1 - Math.exp(-dt / DECAY_TAU)
      let anyActive = trail.length > 0

      ctx.clearRect(0, 0, width, height)

      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        let target = 0

        if (trail.length > 0) {
          for (let j = 0; j < trail.length; j++) {
            const pt = trail[j]
            const dx = item.cx - pt.x
            const dy = item.cy - pt.y
            if (Math.abs(dx) > HOVER_RADIUS + item.width * 0.5 || Math.abs(dy) > HOVER_RADIUS) continue
            const dist = Math.hypot(dx, dy)
            if (dist >= HOVER_RADIUS) continue
            const d = dist / HOVER_RADIUS
            const q = (now - pt.born) / TRAIL_LIFETIME
            if (q >= 1) continue
            const intensity = Math.pow(1 - d, 1 + 5 * q) * (1 - q * q)
            if (intensity > target) target = intensity
          }
        }

        const factor = target > item.level ? attackFactor : decayFactor
        item.level += (target - item.level) * factor
        if (item.level <= 0.001) {
          item.level = 0
        } else {
          anyActive = true
        }

        // Resting dim monochrome item
        drawItem(item, BASE_COLOR, item.baseAlpha)
        // Blue accent illumination layered cleanly on top (zero shadowBlur)
        if (item.level > 0.002) {
          drawItem(item, ACCENT_COLOR, 0.94 * item.level)
        }
      }

      if (anyActive) {
        rafId = window.requestAnimationFrame(renderFrame)
      } else {
        rafId = 0
        lastFrameTime = 0
      }
    }

    function ensureAnimating() {
      if (!rafId) {
        lastFrameTime = performance.now()
        rafId = window.requestAnimationFrame(renderFrame)
      }
    }

    function rebuildLayout() {
      if (!canvas || !ctx) return
      const rect = canvas.getBoundingClientRect()
      width = Math.max(1, Math.round(rect.width))
      height = Math.max(1, Math.round(rect.height))
      dpr = Math.min(window.devicePixelRatio || 1, 2)

      canvas.width = Math.max(1, Math.floor(width * dpr))
      canvas.height = Math.max(1, Math.floor(height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Measure each token width once
      ctx.font = FONT
      const tokenWidths = TOKENS.map(token =>
        Math.ceil(ICON_SIZE + ICON_GAP + ctx.measureText(token.label).width),
      )

      const nextItems: PlacedItem[] = []
      const rowCount = Math.ceil(height / ROW_H) + 1
      let seq = 0

      for (let row = 0; row < rowCount; row++) {
        // Build one wrapped, horizontally centered row
        const rowEntries: { tokenIndex: number; width: number; seqIndex: number }[] = []
        let rowWidth = 0
        // Stagger starting token slightly per row so columns never form rigid vertical lines
        let cursor = (seq + row * 3) % TOKENS.length

        while (true) {
          const w = tokenWidths[cursor]
          const nextWidth = rowEntries.length === 0 ? w : rowWidth + COL_GAP + w
          if (rowEntries.length > 0 && nextWidth > width - 16) break
          rowEntries.push({ tokenIndex: cursor, width: w, seqIndex: seq++ })
          rowWidth = nextWidth
          cursor = (cursor + 1) % TOKENS.length
        }

        let x = Math.max(8, Math.floor((width - rowWidth) / 2))
        const y = row * ROW_H
        for (const entry of rowEntries) {
          nextItems.push({
            tokenIndex: entry.tokenIndex,
            x,
            y,
            cx: x + entry.width * 0.5,
            cy: y + ROW_H * 0.5,
            width: entry.width,
            baseAlpha: deterministicAlpha(entry.seqIndex),
            level: 0,
          })
          x += entry.width + COL_GAP
        }
      }

      items = nextItems
      trail = []
      renderFrame(performance.now())
    }

    rebuildLayout()

    function onPointerMove(event: PointerEvent) {
      if (reducedMotion || !finePointer || event.pointerType !== 'mouse' || !canvas) return
      const target = event.target as HTMLElement | null
      if (target?.closest('.login-card')) return

      const rect = canvas.getBoundingClientRect()
      const px = event.clientX - rect.left
      const py = event.clientY - rect.top
      const now = performance.now()

      const dist = lastStampX < -9000 ? TRAIL_MIN_MOVE + 1 : Math.hypot(px - lastStampX, py - lastStampY)
      if (dist < TRAIL_MIN_MOVE) return

      if (lastStampX < -9000 || dist <= TRAIL_STEP) {
        trail.push({ x: px, y: py, born: now })
      } else {
        const steps = Math.min(18, Math.ceil(dist / TRAIL_STEP))
        for (let s = 1; s <= steps; s++) {
          const t = s / steps
          trail.push({
            x: lastStampX + (px - lastStampX) * t,
            y: lastStampY + (py - lastStampY) * t,
            born: now,
          })
        }
      }
      if (trail.length > TRAIL_MAX) {
        trail = trail.slice(trail.length - TRAIL_MAX)
      }
      lastStampX = px
      lastStampY = py
      ensureAnimating()
    }

    function onPointerLeave() {
      lastStampX = -9999
      lastStampY = -9999
    }

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(rebuildLayout) : null
    ro?.observe(canvas)
    window.addEventListener('resize', rebuildLayout)
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerleave', onPointerLeave, { passive: true })

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId)
      ro?.disconnect()
      window.removeEventListener('resize', rebuildLayout)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerleave', onPointerLeave)
    }
  }, [])

  return (
    <div className="login-stage">
      <div className="login-field" aria-hidden="true">
        <div className="login-field-inner">
          <canvas ref={canvasRef} className="login-field-canvas" />
        </div>
      </div>
      <div className="login-scrim" aria-hidden="true" />
      {children}
    </div>
  )
}
