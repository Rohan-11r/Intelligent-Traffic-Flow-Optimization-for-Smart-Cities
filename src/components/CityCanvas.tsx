import { useEffect, useRef } from 'react'
import { engine } from '../sim/engine'
import { levelOf } from '../sim/engine'
import { MARGIN, SPACING, WORLD, pad2 } from '../sim/network'
import { PHASE_ORDER } from '../sim/types'
import type { Dir, Level } from '../sim/types'

const LANE = 7
const ROAD_W = 20
const NODE_W = 30

const LEVEL_COLOR: Record<Level, string> = {
  LOW: '#22c55e',
  MEDIUM: '#eab308',
  HIGH: '#f97316',
  CRITICAL: '#ef4444',
}

export interface GridView {
  /** 1 = FIT (whole 6x6 network exactly fills the square viewport) */
  zoom: number
  /** world coordinate held at the centre of the viewport */
  cx: number
  cy: number
}

export const FIT_VIEW: GridView = { zoom: 1, cx: WORLD / 2, cy: WORLD / 2 }
export const MIN_ZOOM = 0.6
export const MAX_ZOOM = 4

export const clampView = (v: GridView): GridView => ({
  zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom)),
  cx: Math.min(WORLD * 1.1, Math.max(-WORLD * 0.1, v.cx)),
  cy: Math.min(WORLD * 1.1, Math.max(-WORLD * 0.1, v.cy)),
})

interface Props {
  selected: number | null
  onSelect: (id: number) => void
  showFixedGhost: boolean
  view: GridView
  onViewChange: (v: GridView) => void
}

export function CityCanvas({ selected, onSelect, showFixedGhost, view, onViewChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const selRef = useRef(selected)
  const ghostRef = useRef(showFixedGhost)
  const viewRef = useRef(view)
  const onViewRef = useRef(onViewChange)
  selRef.current = selected
  ghostRef.current = showFixedGhost
  viewRef.current = view
  onViewRef.current = onViewChange

  useEffect(() => {
    const canvas = canvasRef.current!
    const wrap = wrapRef.current!
    const ctx = canvas.getContext('2d')!
    let raf = 0
    // viewport geometry, refreshed every frame from the live view state
    let dpr = 1
    let vw = 1
    let vh = 1
    let scale = 1
    let ox = 0
    let oy = 0

    /** device-pixel transform for the current zoom / centre */
    const project = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      vw = wrap.clientWidth
      vh = wrap.clientHeight
      const fit = Math.min(vw, vh) / WORLD
      const v = viewRef.current
      scale = fit * v.zoom * dpr
      ox = (vw / 2) * dpr - v.cx * scale
      oy = (vh / 2) * dpr - v.cy * scale
    }

    const resize = () => {
      const w = wrap.clientWidth
      const h = wrap.clientHeight
      const d = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.floor(w * d))
      canvas.height = Math.max(1, Math.floor(h * d))
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      project()
    }

    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    resize()

    /** screen px -> world coordinates */
    const toWorld = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect()
      return {
        wx: ((clientX - rect.left) * dpr - ox) / scale,
        wy: ((clientY - rect.top) * dpr - oy) / scale,
      }
    }

    const nodeAt = (clientX: number, clientY: number) => {
      const { wx, wy } = toWorld(clientX, clientY)
      let best: number | null = null
      let bd = 46
      for (const n of engine.net.nodes) {
        const d = Math.hypot(n.x - wx, n.y - wy)
        if (d < bd) {
          bd = d
          best = n.id
        }
      }
      return best
    }

    /* ------------------------- pan (drag) ------------------------- */
    let dragging = false
    let moved = 0
    let lastX = 0
    let lastY = 0

    const down = (e: PointerEvent) => {
      if (e.button !== 0) return
      dragging = true
      moved = 0
      lastX = e.clientX
      lastY = e.clientY
      canvas.setPointerCapture(e.pointerId)
    }

    const move = (e: PointerEvent) => {
      if (!dragging) return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      moved += Math.abs(dx) + Math.abs(dy)
      if (moved < 3) return
      const v = viewRef.current
      // panning only makes sense once zoomed past FIT — at FIT the grid stays centred
      if (v.zoom <= 1.02) return
      onViewRef.current(
        clampView({ ...v, cx: v.cx - (dx * dpr) / scale, cy: v.cy - (dy * dpr) / scale }),
      )
    }

    const up = (e: PointerEvent) => {
      if (!dragging) return
      dragging = false
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {
        /* capture may already be gone */
      }
      // a click, not a drag → select the nearest intersection
      if (moved < 4) {
        const id = nodeAt(e.clientX, e.clientY)
        if (id !== null) onSelect(id)
      }
    }

    /* ------------------------ wheel zoom --------------------------
     * Ctrl / Cmd / Shift + wheel zooms the grid. A PLAIN wheel is left
     * alone so the page keeps scrolling normally when the cursor happens
     * to be over the (large) map — otherwise the map would trap scroll.
     * ------------------------------------------------------------- */
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey && !e.shiftKey) return
      e.preventDefault()
      const v = viewRef.current
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor))
      if (next === v.zoom) return
      // keep the world point under the cursor pinned while zooming
      const { wx, wy } = toWorld(e.clientX, e.clientY)
      const rect = canvas.getBoundingClientRect()
      const fit = Math.min(vw, vh) / WORLD
      const s2 = fit * next * dpr
      const cx = wx + ((vw / 2) * dpr - (e.clientX - rect.left) * dpr) / s2
      const cy = wy + ((vh / 2) * dpr - (e.clientY - rect.top) * dpr) / s2
      onViewRef.current(clampView({ zoom: next, cx, cy }))
    }

    /** double click = zoom straight into that intersection */
    const dbl = (e: MouseEvent) => {
      const id = nodeAt(e.clientX, e.clientY)
      if (id === null) return
      const n = engine.net.byNode.get(id)!
      onSelect(id)
      onViewRef.current(
        clampView({ zoom: Math.max(2.4, viewRef.current.zoom), cx: n.x, cy: n.y }),
      )
    }

    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    canvas.addEventListener('wheel', wheel, { passive: false })
    canvas.addEventListener('dblclick', dbl)

    const draw = () => {
      const net = engine.net
      const t = engine.t
      project()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.fillStyle = '#05070c'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.setTransform(scale, 0, 0, scale, ox, oy)

      // --- backdrop blocks (city fabric) ---
      ctx.fillStyle = '#080c14'
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          ctx.fillRect(MARGIN + c * SPACING + 20, MARGIN + r * SPACING + 20, SPACING - 40, SPACING - 40)
        }
      }
      ctx.strokeStyle = 'rgba(34,211,238,0.05)'
      ctx.lineWidth = 1
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          ctx.strokeRect(MARGIN + c * SPACING + 20, MARGIN + r * SPACING + 20, SPACING - 40, SPACING - 40)
        }
      }

      // --- road beds (undirected, drawn once per pair) ---
      ctx.lineCap = 'round'
      for (const l of net.links) {
        if (l.from > l.to) continue
        ctx.strokeStyle = '#0f1622'
        ctx.lineWidth = ROAD_W + 5
        ctx.beginPath()
        ctx.moveTo(l.ax, l.ay)
        ctx.lineTo(l.bx, l.by)
        ctx.stroke()
        ctx.strokeStyle = '#161f2e'
        ctx.lineWidth = ROAD_W
        ctx.beginPath()
        ctx.moveTo(l.ax, l.ay)
        ctx.lineTo(l.bx, l.by)
        ctx.stroke()
      }

      // --- directional congestion tint per lane ---
      for (const l of net.links) {
        const occ = Math.min(1, l.vehicles.length / l.capacity)
        const q = Math.min(1, l.queue / 10)
        const heat = Math.max(occ, q)
        if (heat < 0.12 && !l.blocked && l.slow > 0.9) continue
        const px = l.px * LANE
        const py = l.py * LANE
        let color: string
        if (l.blocked) color = 'rgba(239,68,68,0.75)'
        else if (heat > 0.7) color = `rgba(239,68,68,${0.28 + heat * 0.5})`
        else if (heat > 0.45) color = `rgba(249,115,22,${0.25 + heat * 0.45})`
        else if (heat > 0.25) color = `rgba(234,179,8,${0.18 + heat * 0.35})`
        else color = `rgba(34,197,94,${0.12 + heat * 0.3})`
        ctx.strokeStyle = color
        ctx.lineWidth = ROAD_W / 2 - 1
        ctx.beginPath()
        ctx.moveTo(l.ax + px, l.ay + py)
        ctx.lineTo(l.bx + px, l.by + py)
        ctx.stroke()
        if (l.slow < 0.9 && !l.blocked) {
          ctx.setLineDash([6, 8])
          ctx.strokeStyle = 'rgba(251,191,36,0.55)'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(l.ax + px, l.ay + py)
          ctx.lineTo(l.bx + px, l.by + py)
          ctx.stroke()
          ctx.setLineDash([])
        }
      }

      // --- corridor / green wave highlight ---
      for (const c of engine.corridors) {
        if (!c.active) continue
        const pts = c.nodes.map((id) => net.byNode.get(id)!).filter(Boolean)
        if (pts.length < 2) continue
        ctx.strokeStyle = `rgba(34,197,94,${0.16 + 0.12 * Math.sin(t * 2)})`
        ctx.lineWidth = ROAD_W + 16
        ctx.beginPath()
        ctx.moveTo(pts[0].x, pts[0].y)
        for (const p of pts) ctx.lineTo(p.x, p.y)
        ctx.stroke()
        // travelling progression pulse
        const total = pts.length - 1
        const f = (t * 0.35) % 1
        const seg = Math.min(total - 1, Math.floor(f * total))
        const lf = f * total - seg
        const a = pts[seg]
        const b = pts[seg + 1]
        ctx.fillStyle = 'rgba(74,222,128,0.85)'
        ctx.beginPath()
        ctx.arc(a.x + (b.x - a.x) * lf, a.y + (b.y - a.y) * lf, 9, 0, Math.PI * 2)
        ctx.fill()
      }

      // --- reroute alternative path ---
      const rr = engine.reroute
      if (rr && t - rr.t < 14 && rr.alternative.length > 1) {
        const pts = rr.alternative.map((id) => net.byNode.get(id)!).filter(Boolean)
        ctx.setLineDash([14, 10])
        ctx.lineDashOffset = -t * 26
        ctx.strokeStyle = 'rgba(34,211,238,0.9)'
        ctx.lineWidth = 6
        ctx.beginPath()
        ctx.moveTo(pts[0].x, pts[0].y)
        for (const p of pts) ctx.lineTo(p.x, p.y)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.lineDashOffset = 0
      }

      // --- emergency corridors ---
      for (const em of engine.emergencies) {
        if (!em.spawned || em.endT) continue
        const pts = em.path.map((id) => net.byNode.get(id)!).filter(Boolean)
        if (pts.length < 2) continue
        const pulse = 0.45 + 0.35 * Math.sin(t * 6)
        ctx.strokeStyle =
          em.kind === 'ambulance' ? `rgba(255,255,255,${pulse})` : `rgba(251,113,133,${pulse})`
        ctx.lineWidth = 10
        ctx.beginPath()
        ctx.moveTo(pts[0].x, pts[0].y)
        for (const p of pts) ctx.lineTo(p.x, p.y)
        ctx.stroke()
      }

      // --- blocked segment markers ---
      for (const l of net.links) {
        if (!l.blocked || l.from > l.to) continue
        const mx = (l.ax + l.bx) / 2
        const my = (l.ay + l.by) / 2
        ctx.strokeStyle = '#ef4444'
        ctx.lineWidth = 5
        ctx.beginPath()
        ctx.moveTo(mx - 12, my - 12)
        ctx.lineTo(mx + 12, my + 12)
        ctx.moveTo(mx + 12, my - 12)
        ctx.lineTo(mx - 12, my + 12)
        ctx.stroke()
        ctx.fillStyle = 'rgba(239,68,68,0.18)'
        ctx.beginPath()
        ctx.arc(mx, my, 20, 0, Math.PI * 2)
        ctx.fill()
      }

      // --- vehicles ---
      for (const l of net.links) {
        const px = l.px * LANE
        const py = l.py * LANE
        for (const v of l.vehicles) {
          const cx = l.ax + l.hx * v.pos + px
          const cy = l.ay + l.hy * v.pos + py
          const w = v.len
          const h = 6
          ctx.save()
          ctx.translate(cx, cy)
          ctx.rotate(Math.atan2(l.hy, l.hx))
          if (v.emergency) {
            ctx.fillStyle = (Math.floor(t * 6) % 2 === 0 ? '#ffffff' : '#ef4444')
            ctx.fillRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6)
            ctx.fillStyle = v.color
            ctx.fillRect(-w / 2, -h / 2, w, h)
          } else {
            ctx.fillStyle = v.rerouted ? '#22d3ee' : v.color
            ctx.fillRect(-w / 2, -h / 2, w, h)
            if (v.speed < 0.5) {
              ctx.fillStyle = 'rgba(239,68,68,0.85)'
              ctx.fillRect(-w / 2, -h / 2, 2, h)
            }
          }
          ctx.restore()
        }
      }

      // --- intersections ---
      const sel = selRef.current
      const zoomed = viewRef.current.zoom >= 1.9
      for (const n of net.nodes) {
        const total = PHASE_ORDER.reduce((a, d) => a + n.queue[d], 0)
        const lv = levelOf(total)
        const col = LEVEL_COLOR[lv]

        // congestion halo
        if (lv !== 'LOW') {
          const rad = NODE_W / 2 + 8 + (lv === 'CRITICAL' ? 5 + 3 * Math.sin(t * 5) : 2)
          ctx.fillStyle =
            lv === 'CRITICAL'
              ? `rgba(239,68,68,${0.18 + 0.12 * Math.sin(t * 5)})`
              : lv === 'HIGH'
                ? 'rgba(249,115,22,0.16)'
                : 'rgba(234,179,8,0.12)'
          ctx.beginPath()
          ctx.arc(n.x, n.y, rad, 0, Math.PI * 2)
          ctx.fill()
        }

        // ghost of the fixed-time baseline queue (BEFORE overlay)
        if (ghostRef.current) {
          const sq = PHASE_ORDER.reduce((a, d) => a + n.shadowQueue[d], 0)
          if (sq > 6) {
            ctx.strokeStyle = 'rgba(239,68,68,0.5)'
            ctx.setLineDash([3, 4])
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.arc(n.x, n.y, NODE_W / 2 + 8 + Math.min(22, sq * 0.5), 0, Math.PI * 2)
            ctx.stroke()
            ctx.setLineDash([])
          }
        }

        // body
        ctx.fillStyle = n.fault ? '#3b0d0d' : '#0d1420'
        ctx.strokeStyle = n.fault ? '#ef4444' : n.coordinated ? '#22c55e' : '#28344a'
        ctx.lineWidth = n.coordinated || n.fault ? 2.5 : 1.4
        ctx.beginPath()
        ctx.roundRect(n.x - NODE_W / 2, n.y - NODE_W / 2, NODE_W, NODE_W, 5)
        ctx.fill()
        ctx.stroke()

        // signal heads on each approach
        const heads: [Dir, number, number][] = [
          ['N', 0, -NODE_W / 2 - 4],
          ['S', 0, NODE_W / 2 + 4],
          ['E', NODE_W / 2 + 4, 0],
          ['W', -NODE_W / 2 - 4, 0],
        ]
        for (const [d, dx, dy] of heads) {
          const li = n.lights[d]
          ctx.fillStyle = li === 'G' ? '#22c55e' : li === 'Y' ? '#f59e0b' : '#7f1d1d'
          ctx.beginPath()
          ctx.arc(n.x + dx, n.y + dy, li === 'R' ? 2.6 : 4, 0, Math.PI * 2)
          ctx.fill()
          if (li === 'G') {
            ctx.fillStyle = 'rgba(34,197,94,0.28)'
            ctx.beginPath()
            ctx.arc(n.x + dx, n.y + dy, 9, 0, Math.PI * 2)
            ctx.fill()
          }
        }

        // id
        ctx.fillStyle = lv === 'LOW' ? '#93a3bb' : col
        ctx.font = 'bold 13px ui-monospace, Consolas, monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(pad2(n.id), n.x, n.y - 3)

        // queue readout
        if (total > 0) {
          ctx.fillStyle = col
          ctx.font = 'bold 10px ui-monospace, Consolas, monospace'
          ctx.fillText(String(total), n.x, n.y + 9)
        }

        // zoomed-in detail: live phase + countdown, so a single node can be demoed close up
        if (zoomed) {
          ctx.fillStyle = 'rgba(5,7,12,0.85)'
          ctx.fillRect(n.x - 34, n.y - NODE_W / 2 - 20, 68, 14)
          ctx.strokeStyle = '#28344a'
          ctx.lineWidth = 1
          ctx.strokeRect(n.x - 34, n.y - NODE_W / 2 - 20, 68, 14)
          ctx.fillStyle =
            n.state === 'GREEN' ? '#22c55e' : n.state === 'YELLOW' ? '#f59e0b' : '#ef4444'
          ctx.font = 'bold 9px ui-monospace, Consolas, monospace'
          const stateLabel =
            n.state === 'GREEN' ? 'GRN' : n.state === 'YELLOW' ? 'YEL' : 'RED'
          ctx.fillText(
            `${PHASE_ORDER[n.phaseIdx]} ${stateLabel} ${Math.max(0, n.greenDur - n.timer).toFixed(0)}s`,
            n.x,
            n.y - NODE_W / 2 - 13,
          )
        }

        // status pips
        let pipx = n.x - 12
        const pip = (color: string) => {
          ctx.fillStyle = color
          ctx.fillRect(pipx, n.y + NODE_W / 2 + 6, 5, 3)
          pipx += 7
        }
        if (n.preempt) pip('#ffffff')
        if (n.spillback) pip('#f97316')
        if (!n.sensorOk) pip('#eab308')
        if (!n.commOk) pip('#a855f7')
        if (n.pedestrian) pip('#22d3ee')

        if (sel === n.id) {
          ctx.strokeStyle = '#22d3ee'
          ctx.lineWidth = 2.5
          ctx.beginPath()
          ctx.arc(n.x, n.y, NODE_W / 2 + 12, 0, Math.PI * 2)
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(n.x - NODE_W / 2 - 20, n.y)
          ctx.lineTo(n.x - NODE_W / 2 - 14, n.y)
          ctx.moveTo(n.x + NODE_W / 2 + 14, n.y)
          ctx.lineTo(n.x + NODE_W / 2 + 20, n.y)
          ctx.stroke()
        }
      }

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
      canvas.removeEventListener('wheel', wheel)
      canvas.removeEventListener('dblclick', dbl)
    }
  }, [onSelect])

  return (
    <div ref={wrapRef} className="relative h-full w-full touch-none">
      <canvas
        ref={canvasRef}
        className={`block h-full w-full ${view.zoom > 1.02 ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`}
      />
    </div>
  )
}
