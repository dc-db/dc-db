import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

// 32 focused DC-DB terms: 15 core infrastructure/CMDB modules + 17 built-in services (pure text, no icons).
const TOKENS: readonly string[] = [
  'Server', 'Switch', 'PostgreSQL', 'Firewall', 'VLAN', 'Nginx', 'Rack', 'Router',
  'Redis', 'Data Center', 'IPAM', 'Proxmox VE', 'Load Balancer', 'Kafka', 'VM', 'Subnet',
  'Prometheus', 'KVM', 'MinIO', 'Carrier', 'Grafana', 'Topology', 'Docker', 'MySQL',
  'GitLab', 'Audit Log', 'etcd', 'Harbor', 'Vault', 'Kubernetes', 'Elasticsearch', 'RabbitMQ',
]

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

const COL_GAP = 18
const ROW_H = 24
const FONT = '400 12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
const BASE_COLOR = '#9a9ea6'
const ACCENT_COLOR = '#3b82f6'

// Cloudflare-Domains-inspired hover trail parameters
const HOVER_RADIUS = 128
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

// Deterministic per-row Fisher-Yates shuffle so adjacent rows never align into
// vertical columns at any viewport width.
function shuffledRowOrder(seedIndex: number): number[] {
  const order = Array.from({ length: TOKENS.length }, (_, i) => i)
  let seed = ((seedIndex + 1) * 2654435761) >>> 0
  for (let i = order.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const j = seed % (i + 1)
    const tmp = order[i]
    order[i] = order[j]
    order[j] = tmp
  }
  return order
}

/**
 * Pure typographic interactive backdrop inspired by Cloudflare Domains:
 * quiet monochrome infrastructure terms in centered wrapped rows that softly
 * illuminate in DC-DB blue within a trailing pointer region and fade away.
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
      ctx.globalAlpha = alpha
      ctx.fillStyle = color
      ctx.fillText(TOKENS[item.tokenIndex], item.x, item.cy + 0.5)
    }

    function renderFrame(now: number) {
      if (!ctx) return
      const dt = lastFrameTime ? Math.min(64, Math.max(1, now - lastFrameTime)) : 16
      lastFrameTime = now

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
      ctx.save()
      ctx.font = FONT
      ctx.textBaseline = 'middle'

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

        drawItem(item, BASE_COLOR, item.baseAlpha)
        if (item.level > 0.002) {
          drawItem(item, ACCENT_COLOR, 0.94 * item.level)
        }
      }

      ctx.restore()

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

      ctx.font = FONT
      const tokenWidths = TOKENS.map(label => Math.ceil(ctx.measureText(label).width))

      const nextItems: PlacedItem[] = []
      const rowCount = Math.ceil(height / ROW_H) + 1
      let seq = 0

      for (let row = 0; row < rowCount; row++) {
        const rowEntries: { tokenIndex: number; width: number; seqIndex: number }[] = []
        let rowWidth = 0
        let chunk = 0
        let order = shuffledRowOrder(row * 17)
        let pos = 0

        while (true) {
          if (pos >= order.length) {
            chunk++
            order = shuffledRowOrder(row * 17 + chunk * 97 + 13)
            pos = 0
          }
          const tokenIndex = order[pos++]
          const w = tokenWidths[tokenIndex]
          const nextWidth = rowEntries.length === 0 ? w : rowWidth + COL_GAP + w
          if (rowEntries.length > 0 && nextWidth > width - 16) break
          rowEntries.push({ tokenIndex, width: w, seqIndex: seq++ })
          rowWidth = nextWidth
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
