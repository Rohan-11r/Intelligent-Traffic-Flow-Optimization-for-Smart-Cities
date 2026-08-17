import type { Dir, Intersection, Link } from './types'

export const GRID = 6
export const NODE_COUNT = GRID * GRID // exactly 36 intersections
export const SPACING = 150
export const MARGIN = 90
export const WORLD = MARGIN * 2 + SPACING * (GRID - 1) // 1050

export const nodeId = (row: number, col: number) => row * GRID + col + 1
export const nodeRow = (id: number) => Math.floor((id - 1) / GRID)
export const nodeCol = (id: number) => (id - 1) % GRID
export const pad2 = (id: number) => String(id).padStart(2, '0')

const OPPOSITE: Record<Dir, Dir> = { N: 'S', S: 'N', E: 'W', W: 'E' }
const DELTA: Record<Dir, [number, number]> = {
  N: [-1, 0],
  S: [1, 0],
  E: [0, 1],
  W: [0, -1],
}

export interface Network {
  nodes: Intersection[]
  links: Link[]
  byNode: Map<number, Intersection>
  adj: Map<number, { to: number; link: number }[]>
  edgeKey(a: number, b: number): string
  linkBetween(a: number, b: number): Link | undefined
}

function blankDirRecord(): Record<Dir, number> {
  return { N: 0, E: 0, S: 0, W: 0 }
}

export function buildNetwork(): Network {
  const nodes: Intersection[] = []
  const byNode = new Map<number, Intersection>()

  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const id = nodeId(r, c)
      const n: Intersection = {
        id,
        row: r,
        col: c,
        x: MARGIN + c * SPACING,
        y: MARGIN + r * SPACING,
        out: {},
        in: {},
        phaseIdx: (r + c) % 4,
        state: 'GREEN',
        timer: 0,
        greenDur: 9,
        baseGreen: 9,
        lights: { N: 'R', E: 'R', S: 'R', W: 'R' },
        fault: false,
        faultMsg: '',
        sensorOk: true,
        commOk: true,
        pedestrian: false,
        pedClearing: false,
        queue: blankDirRecord(),
        arrivals: blankDirRecord(),
        arrRate: blankDirRecord(),
        vehCount: 0,
        congestion: 0,
        avgSpeed: 0,
        decision: null,
        preempt: null,
        preemptTag: '',
        aiTimer: (r * GRID + c) * 0.05,
        extendedTotal: 0,
        spillback: false,
        coordinated: false,
        corridor: -1,
        cycleClock: 0,
        shadowQueue: blankDirRecord(),
        shadowPhase: 0,
        shadowTimer: 0,
        shadowDelay: 0,
        shadowServed: 0,
        aiDelay: 0,
        aiServed: 0,
      }
      nodes.push(n)
      byNode.set(id, n)
    }
  }

  const links: Link[] = []
  const adj = new Map<number, { to: number; link: number }[]>()
  for (const n of nodes) adj.set(n.id, [])

  const addLink = (from: Intersection, to: Intersection, heading: Dir) => {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const length = Math.hypot(dx, dy)
    const hx = dx / length
    const hy = dy / length
    const link: Link = {
      id: links.length,
      from: from.id,
      to: to.id,
      heading,
      approach: OPPOSITE[heading],
      ax: from.x,
      ay: from.y,
      bx: to.x,
      by: to.y,
      hx,
      hy,
      px: -hy,
      py: hx,
      length,
      capacity: Math.max(4, Math.floor(length / 9)),
      blocked: false,
      slow: 1,
      vehicles: [],
      queue: 0,
      flow: 0,
    }
    links.push(link)
    from.out[heading] = link.id
    to.in[link.approach] = link.id
    adj.get(from.id)!.push({ to: to.id, link: link.id })
  }

  for (const n of nodes) {
    for (const d of ['N', 'E', 'S', 'W'] as Dir[]) {
      const [dr, dc] = DELTA[d]
      const r = n.row + dr
      const c = n.col + dc
      if (r < 0 || r >= GRID || c < 0 || c >= GRID) continue
      const other = byNode.get(nodeId(r, c))!
      addLink(n, other, d)
    }
  }

  const edgeKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`)
  const linkIndex = new Map<number, Link>()
  for (const l of links) linkIndex.set(l.from * 100 + l.to, l)
  const linkBetween = (a: number, b: number) => linkIndex.get(a * 100 + b)

  return { nodes, links, byNode, adj, edgeKey, linkBetween }
}

/** Dijkstra over the directed grid; cost = length * (1 + congestion penalty). Blocked links are skipped. */
export function shortestPath(
  net: Network,
  start: number,
  goal: number,
  costOf: (link: Link) => number,
): number[] {
  if (start === goal) return [start]
  const dist = new Float64Array(NODE_COUNT + 1).fill(Infinity)
  const prev = new Int32Array(NODE_COUNT + 1).fill(-1)
  const done = new Uint8Array(NODE_COUNT + 1)
  dist[start] = 0

  for (let iter = 0; iter < NODE_COUNT; iter++) {
    let u = -1
    let best = Infinity
    for (let i = 1; i <= NODE_COUNT; i++) {
      if (!done[i] && dist[i] < best) {
        best = dist[i]
        u = i
      }
    }
    if (u === -1) break
    if (u === goal) break
    done[u] = 1
    for (const e of net.adj.get(u)!) {
      const link = net.links[e.link]
      if (link.blocked) continue
      const nd = dist[u] + costOf(link)
      if (nd < dist[e.to]) {
        dist[e.to] = nd
        prev[e.to] = u
      }
    }
  }

  if (!isFinite(dist[goal])) return []
  const path: number[] = []
  let cur = goal
  while (cur !== -1) {
    path.push(cur)
    if (cur === start) break
    cur = prev[cur]
  }
  return path.reverse()
}
