import { GRID, NODE_COUNT, buildNetwork, nodeCol, nodeRow, pad2, shortestPath } from './network'
import type { Network } from './network'
import { SCENARIOS, getScenario } from './scenarios'
import type { Scenario } from './scenarios'
import { PHASE_ORDER } from './types'
import type {
  AiDecision,
  CoordinationReport,
  CorridorState,
  Dir,
  EmergencyReport,
  EventKind,
  HealthReport,
  Intersection,
  Level,
  Light,
  Link,
  Metrics,
  NodeSnapshot,
  RerouteReport,
  SimEvent,
  Snapshot,
  Vehicle,
  VehicleKind,
} from './types'

/* ------------------------------------------------------------------ *
 * Control constants (seconds / metres — 1 world pixel == 1 metre)
 * ------------------------------------------------------------------ */
export const YELLOW_DUR = 2.2
export const ALL_RED_DUR = 1.4
export const PED_CLEAR_DUR = 4.0
export const MIN_GREEN = 5
export const MAX_GREEN = 24
export const BASE_GREEN = 9
export const STOP_OFFSET = 16
export const MAX_VEHICLES = 820
export const AI_INTERVAL = 1.0
/**
 * Saturation discharge used by the fixed-time shadow model (veh/s/approach).
 * Matched to the discharge the microscopic model actually achieves at a stop
 * line (≈1 veh per 8m headway crossing at ~9 m/s) so the baseline is not
 * handicapped — the two controllers differ in how they ALLOCATE green, not in
 * how fast a queue can discharge.
 */
const SAT_FLOW = 0.9

const KIND_SPEC: Record<VehicleKind, { len: number; speed: number; color: string }> = {
  car: { len: 6.5, speed: 13.5, color: '#7dd3fc' },
  bus: { len: 12, speed: 10.5, color: '#a78bfa' },
  truck: { len: 13, speed: 9.5, color: '#fbbf24' },
  ambulance: { len: 9, speed: 18, color: '#ffffff' },
  firetruck: { len: 11, speed: 16, color: '#fb7185' },
}

const CAR_COLORS = ['#7dd3fc', '#38bdf8', '#67e8f9', '#5eead4', '#93c5fd', '#bae6fd']

export const CORRIDOR_DEFS: { name: string; nodes: number[]; dir: Dir }[] = [
  { name: 'CORRIDOR A', nodes: [13, 14, 15, 16, 17, 18], dir: 'E' },
  { name: 'CORRIDOR B', nodes: [3, 9, 15, 21, 27, 33], dir: 'S' },
  { name: 'CORRIDOR C', nodes: [19, 20, 21, 22, 23, 24], dir: 'E' },
]

export const LOOP_STAGES = [
  { key: 'SENSE', label: '01 — SENSE', text: '36 intersections continuously monitored.' },
  { key: 'ANALYZE', label: '02 — ANALYZE', text: 'AI evaluates queue, density, speed and congestion.' },
  { key: 'DECIDE', label: '03 — DECIDE', text: 'Adaptive signal timing + routing + coordination.' },
  { key: 'ACT', label: '04 — ACT', text: 'Signals and routes are safely updated.' },
  { key: 'MEASURE', label: '05 — MEASURE', text: 'Performance metrics are recalculated.' },
  { key: 'OPTIMIZE', label: '06 — OPTIMIZE', text: 'System continuously adapts to new traffic conditions.' },
]

export function levelOf(totalQueue: number): Level {
  if (totalQueue >= 30) return 'CRITICAL'
  if (totalQueue >= 18) return 'HIGH'
  if (totalQueue >= 8) return 'MEDIUM'
  return 'LOW'
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

/** deterministic PRNG so every run of a scenario tells the same story */
function mulberry(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const blank = (): Record<Dir, number> => ({ N: 0, E: 0, S: 0, W: 0 })

function emptyMetrics(): Metrics {
  return {
    avgWait: 0,
    avgTravel: 0,
    maxQueue: 0,
    avgSpeed: 0,
    throughput: 0,
    emergencyResponse: 0,
    rerouted: 0,
    gini: 0,
  }
}

/**
 * Imbalance index: how far the worst-served part of the city sits above the
 * network average, in absolute delay seconds, normalised to a 120s reference.
 *
 * Deliberately NOT a scale-free measure (Gini / coefficient of variation): a
 * controller that delays every node equally badly scores "perfectly fair" on
 * those, which is the opposite of what a planning authority cares about. What
 * matters is the absolute gap between the worst corner of the jurisdiction and
 * the rest of it.
 */
function imbalanceIndex(nodeLoad: number[]): number {
  if (nodeLoad.length < 4) return 0
  const mean = nodeLoad.reduce((a, b) => a + b, 0) / nodeLoad.length
  const max = Math.max(...nodeLoad)
  return clamp((max - mean) / 40, 0, 1)
}

function gini(values: number[]): number {
  const n = values.length
  if (!n) return 0
  const sum = values.reduce((a, b) => a + b, 0)
  if (sum <= 0.0001) return 0
  const sorted = [...values].sort((a, b) => a - b)
  let cum = 0
  for (let i = 0; i < n; i++) cum += (2 * (i + 1) - n - 1) * sorted[i]
  return clamp(cum / (n * sum), 0, 1)
}

interface EmergencyRuntime {
  tag: string
  kind: 'ambulance' | 'firetruck'
  route: number[]
  path: number[]
  delay: number
  spawned: boolean
  vehicleId: number
  stage: string
  startT: number
  endT: number
  progress: number
  atNode: number
  freeTime: number
  eta: number
}

/* ------------------------------------------------------------------ *
 * The simulation engine — a single mutable world stepped by rAF.
 * React only reads `snapshot()` a few times a second; the canvas
 * renderer reads the mutable state directly for 60fps drawing.
 * ------------------------------------------------------------------ */
export class TrafficEngine {
  net: Network = buildNetwork()
  scenario: Scenario = getScenario('normal')
  t = 0
  running = true
  speed = 1
  aiMode = true
  vehicles: Vehicle[] = []
  events: SimEvent[] = []
  decisions: AiDecision[] = []
  corridors: CorridorState[] = CORRIDOR_DEFS.map((c) => ({ ...c, active: false, progression: 0 }))
  emergencies: EmergencyRuntime[] = []
  reroute: RerouteReport | null = null
  spillbackNodes: number[] = []
  coordination: CoordinationReport | null = null
  observation = 'Baseline sensing active — no significant imbalance detected.'
  health: HealthReport = {
    intersections: NODE_COUNT,
    vehicles: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: NODE_COUNT,
    avgWait: 0,
    gini: 0,
    imbalance: 0,
    worst: [],
    best: [],
  }
  ai: Metrics = emptyMetrics()
  fixed: Metrics = emptyMetrics()
  reroutedTotal = 0
  completed = 0
  /** intersection movements served — the throughput unit shared with the shadow model */
  crossings = 0
  safetyFaults = 0
  loopStage = 0
  manualIncidents: [number, number][] = []

  private rnd = mulberry(20260817)
  private inject = new Set<number>()
  private evId = 1
  private vehId = 1
  private spawnAcc = 0
  private aiClock = 0
  private metricClock = 0
  private routeClock = 0
  private loopClock = 0
  private waitSum = 0
  private waitCount = 0
  private travelSum = 0
  private travelCount = 0
  private speedSampleSum = 0
  private speedSampleCount = 0
  private emergencyEtaAi = 0
  private emergencyEtaFixed = 0

  constructor() {
    this.applyScenario('normal', true)
  }

  /* ---------------------------- controls ---------------------------- */

  setRunning(v: boolean) {
    this.running = v
    this.log('SCENARIO', '—', v ? 'SIMULATION RUNNING' : 'SIMULATION PAUSED')
  }

  setSpeed(v: number) {
    this.speed = v
    this.log('SCENARIO', '—', `SIM SPEED ${v}x`)
  }

  setAiMode(v: boolean) {
    this.aiMode = v
    this.log(
      'AI',
      '—',
      v ? 'SMART AI ADAPTIVE CONTROL ENGAGED' : 'FIXED-TIME CONTROL ENGAGED (BASELINE)',
    )
    if (!v) {
      for (const n of this.net.nodes) {
        n.greenDur = n.baseGreen
        n.coordinated = false
        n.decision = null
      }
      for (const c of this.corridors) {
        c.active = false
        c.progression = 0
      }
    }
  }

  reset() {
    this.applyScenario(this.scenario.id, true)
  }

  /** operator button: block road 15-16 live */
  triggerIncident(a = 15, b = 16) {
    this.manualIncidents.push([a, b])
    this.blockEdge(a, b, true)
    this.log('INCIDENT', `${pad2(a)}-${pad2(b)}`, 'INCIDENT DETECTED — ROAD SEGMENT CLOSED')
    this.log('INCIDENT', `${pad2(a)}-${pad2(b)}`, 'NETWORK IMPACT ANALYSIS RUNNING')
    this.forceReroute(a, b)
  }

  clearIncidents() {
    for (const [a, b] of this.manualIncidents) this.blockEdge(a, b, false)
    this.manualIncidents = []
    this.log('INCIDENT', '—', 'MANUAL CLOSURES CLEARED')
  }

  /** operator button: dispatch an emergency unit now */
  dispatchEmergency(kind: 'ambulance' | 'firetruck' = 'ambulance') {
    const route = kind === 'ambulance' ? [17, 23, 29] : [31, 32, 26, 20, 14]
    const tag = kind === 'ambulance' ? `emergency_amb_${pad2(this.emergencies.length + 1)}` : `emergency_fire_${pad2(this.emergencies.length + 1)}`
    this.emergencies.push(this.makeEmergency({ kind, tag, route, delay: 0 }))
    this.log('EMERGENCY', pad2(route[0]), `EMERGENCY DETECTED — ${tag.toUpperCase()}`)
  }

  /** proves the safety validator: inject an illegal double-green on the next tick */
  injectSafetyFault(nodeId?: number) {
    const n = nodeId ? this.net.byNode.get(nodeId)! : this.net.nodes[14]
    this.inject.add(n.id)
    n.lights.N = 'G'
    n.lights.E = 'G'
    this.log('SAFETY', pad2(n.id), 'TEST: CONFLICTING GREEN INJECTED AT CONTROLLER OUTPUT')
  }

  /* --------------------------- scenario setup ------------------------ */

  applyScenario(id: string, hard: boolean) {
    const sc = getScenario(id)
    this.scenario = sc
    if (hard) {
      this.net = buildNetwork()
      this.vehicles = []
      this.t = 0
      this.rnd = mulberry(20260817)
      this.vehId = 1
      this.completed = 0
      this.crossings = 0
      this.reroutedTotal = 0
      this.safetyFaults = 0
      this.waitSum = 0
      this.waitCount = 0
      this.travelSum = 0
      this.travelCount = 0
      this.speedSampleSum = 0
      this.speedSampleCount = 0
      this.ai = emptyMetrics()
      this.fixed = emptyMetrics()
      this.reroute = null
      this.spillbackNodes = []
      this.coordination = null
      this.decisions = []
      this.events = []
      this.manualIncidents = []
      this.emergencyEtaAi = 0
      this.emergencyEtaFixed = 0
      this.corridors = CORRIDOR_DEFS.map((c) => ({ ...c, active: false, progression: 0 }))
    }

    // stagger the initial phases so the city looks alive immediately
    for (const n of this.net.nodes) {
      n.phaseIdx = (n.row + n.col) % 4
      n.state = 'GREEN'
      n.timer = this.rnd() * BASE_GREEN
      n.baseGreen = BASE_GREEN
      n.greenDur = BASE_GREEN
      n.fault = false
      n.faultMsg = ''
      n.sensorOk = true
      n.commOk = true
      n.pedestrian = false
      n.pedClearing = false
      n.preempt = null
      n.preemptTag = ''
      n.spillback = false
      n.coordinated = false
      n.corridor = -1
      n.extendedTotal = 0
      n.decision = null
      n.shadowQueue = blank()
      n.shadowPhase = 0
      n.shadowTimer = 0
      n.shadowDelay = 0
      n.shadowServed = 0
      n.aiDelay = 0
      n.aiServed = 0
      n.arrivals = blank()
      n.arrRate = blank()
      this.applyLights(n)
    }
    for (const l of this.net.links) {
      l.blocked = false
      l.slow = 1
    }
    for (let i = 0; i < CORRIDOR_DEFS.length; i++) {
      for (const id of CORRIDOR_DEFS[i].nodes) {
        const n = this.net.byNode.get(id)
        if (n && n.corridor < 0) n.corridor = i
      }
    }
    for (const [a, b] of sc.blocked) this.blockEdge(a, b, true)
    for (const [a, b] of sc.slowed) {
      const f = this.net.linkBetween(a, b)
      const r = this.net.linkBetween(b, a)
      if (f) f.slow = sc.slowFactor
      if (r) r.slow = sc.slowFactor
    }
    for (const id of sc.sensorFailures) {
      const n = this.net.byNode.get(id)
      if (n) n.sensorOk = false
    }
    for (const id of sc.commFailures) {
      const n = this.net.byNode.get(id)
      if (n) n.commOk = false
    }
    for (const id of sc.pedestrianNodes) {
      const n = this.net.byNode.get(id)
      if (n) n.pedestrian = true
    }
    this.emergencies = sc.emergencies.map((e) => this.makeEmergency(e))

    this.log('SCENARIO', sc.num, `${sc.name.toUpperCase()} LOADED`)
    for (const txt of sc.incidentText) this.log('INCIDENT', '—', txt)
    if (sc.sensorFailures.length)
      this.log('FAULT', pad2(sc.sensorFailures[0]), 'SENSOR FAULT — FALLBACK ESTIMATION ENGAGED')
    if (sc.commFailures.length)
      this.log('FAULT', pad2(sc.commFailures[0]), 'COMMS LOST — LOCAL SAFE CONTROL')
    if (sc.transitPriority) this.log('TRANSIT', '—', 'TRANSIT SIGNAL PRIORITY ENABLED')

    // warm the network up so the demo never starts on an empty city
    if (hard) {
      const warm = Math.min(260, Math.round(sc.demand * 45))
      for (let i = 0; i < warm; i++) this.spawnVehicle(true)
    }
  }

  private makeEmergency(e: { kind: 'ambulance' | 'firetruck'; tag: string; route: number[]; delay: number }): EmergencyRuntime {
    const path = this.expandRoute(e.route)
    let len = 0
    for (let i = 0; i < path.length - 1; i++) {
      const l = this.net.linkBetween(path[i], path[i + 1])
      if (l) len += l.length
    }
    return {
      tag: e.tag,
      kind: e.kind,
      route: e.route,
      path,
      delay: e.delay,
      spawned: false,
      vehicleId: -1,
      stage: 'ARMED',
      startT: 0,
      endT: 0,
      progress: 0,
      atNode: path[0],
      freeTime: len / KIND_SPEC[e.kind].speed,
      eta: len / KIND_SPEC[e.kind].speed,
    }
  }

  private expandRoute(way: number[]): number[] {
    const out: number[] = [way[0]]
    for (let i = 0; i < way.length - 1; i++) {
      const seg = shortestPath(this.net, way[i], way[i + 1], (l) => l.length)
      for (let j = 1; j < seg.length; j++) out.push(seg[j])
    }
    return out
  }

  private blockEdge(a: number, b: number, on: boolean) {
    const f = this.net.linkBetween(a, b)
    const r = this.net.linkBetween(b, a)
    if (f) f.blocked = on
    if (r) r.blocked = on
  }

  log(kind: EventKind, node: string, text: string) {
    this.events.unshift({ id: this.evId++, kind, node, text, t: this.t })
    if (this.events.length > 90) this.events.length = 90
  }

  /* ------------------------------ step ------------------------------ */

  step(dtReal: number) {
    if (!this.running) return
    const dt = clamp(dtReal, 0, 0.05) * this.speed
    // subdivide so fast-forward stays stable
    const steps = this.speed > 4 ? 3 : this.speed > 2 ? 2 : 1
    const h = dt / steps
    for (let i = 0; i < steps; i++) this.tick(h)
  }

  private tick(dt: number) {
    this.t += dt
    this.spawn(dt)
    this.signals(dt)
    this.moveVehicles(dt)
    this.measureNodes()
    this.shadowStep(dt)
    this.emergencyStep(dt)

    this.aiClock += dt
    if (this.aiClock >= AI_INTERVAL) {
      this.aiClock = 0
      if (this.aiMode) this.aiControl()
      this.analyzeNetwork()
    }

    this.routeClock += dt
    if (this.routeClock >= 3) {
      this.routeClock = 0
      if (this.aiMode) this.dynamicRerouting()
    }

    this.metricClock += dt
    if (this.metricClock >= 0.5) {
      this.metricClock = 0
      this.computeMetrics()
    }

    this.loopClock += dt
    if (this.loopClock >= 1.1) {
      this.loopClock = 0
      this.loopStage = (this.loopStage + 1) % LOOP_STAGES.length
    }
  }

  /* ----------------------------- demand ----------------------------- */

  private pickNode(bias: 'edge' | 'center' | 'uniform'): number {
    for (let attempt = 0; attempt < 12; attempt++) {
      const id = 1 + Math.floor(this.rnd() * NODE_COUNT)
      const r = nodeRow(id)
      const c = nodeCol(id)
      const edge = r === 0 || c === 0 || r === GRID - 1 || c === GRID - 1
      const center = r >= 1 && r <= 4 && c >= 1 && c <= 4
      if (bias === 'edge' && edge) return id
      if (bias === 'center' && center) return id
      if (bias === 'uniform') return id
    }
    return 1 + Math.floor(this.rnd() * NODE_COUNT)
  }

  private pickKind(): VehicleKind {
    const r = this.rnd()
    if (r < this.scenario.busShare) return 'bus'
    if (r < this.scenario.busShare + this.scenario.truckShare) return 'truck'
    return 'car'
  }

  private spawn(dt: number) {
    this.spawnAcc += dt * this.scenario.demand
    let guard = 0
    while (this.spawnAcc >= 1 && guard++ < 24) {
      this.spawnAcc -= 1
      if (this.vehicles.length >= MAX_VEHICLES) break
      this.spawnVehicle(false)
    }
  }

  private spawnVehicle(warm: boolean) {
    const sc = this.scenario
    let origin = this.pickNode(sc.originBias)
    let dest = this.pickNode(sc.destBias)
    if (sc.hotspots.length && this.rnd() < clamp(sc.hotspotWeight / 5, 0, 0.75)) {
      dest = sc.hotspots[Math.floor(this.rnd() * sc.hotspots.length)]
    }
    let guard = 0
    while (dest === origin && guard++ < 10) dest = this.pickNode('uniform')
    if (dest === origin) return
    // long enough trip to be visible
    if (Math.abs(nodeRow(origin) - nodeRow(dest)) + Math.abs(nodeCol(origin) - nodeCol(dest)) < 2) {
      origin = this.pickNode('edge')
    }

    const route = shortestPath(this.net, origin, dest, (l) => this.linkCost(l))
    if (route.length < 2) return
    const link = this.net.linkBetween(route[0], route[1])
    if (!link || link.blocked) return
    if (link.vehicles.length >= link.capacity) return

    const kind = this.pickKind()
    const spec = KIND_SPEC[kind]
    const v: Vehicle = {
      id: this.vehId++,
      kind,
      route,
      idx: 0,
      linkId: link.id,
      pos: warm ? this.rnd() * (link.length - STOP_OFFSET - 10) : 0,
      speed: spec.speed * 0.6,
      maxSpeed: spec.speed * (0.9 + this.rnd() * 0.2),
      len: spec.len,
      wait: 0,
      spawnT: this.t,
      rerouted: false,
      laneOff: 0,
      color: kind === 'car' ? CAR_COLORS[Math.floor(this.rnd() * CAR_COLORS.length)] : spec.color,
      emergency: false,
      tag: '',
    }
    link.vehicles.push(v)
    link.vehicles.sort((a, b) => b.pos - a.pos)
    this.vehicles.push(v)
    const to = this.net.byNode.get(link.to)!
    to.arrivals[link.approach] += 1
  }

  private spawnEmergency(em: EmergencyRuntime) {
    const path = this.expandRoute(em.route)
    em.path = path
    const link = this.net.linkBetween(path[0], path[1])
    if (!link) return
    const spec = KIND_SPEC[em.kind]
    const v: Vehicle = {
      id: this.vehId++,
      kind: em.kind,
      route: path,
      idx: 0,
      linkId: link.id,
      pos: 4,
      speed: spec.speed * 0.7,
      maxSpeed: spec.speed,
      len: spec.len,
      wait: 0,
      spawnT: this.t,
      rerouted: false,
      laneOff: 0,
      color: spec.color,
      emergency: true,
      tag: em.tag,
    }
    link.vehicles.push(v)
    link.vehicles.sort((a, b) => b.pos - a.pos)
    this.vehicles.push(v)
    em.spawned = true
    em.vehicleId = v.id
    em.startT = this.t
    em.stage = 'PRIORITY ROUTE CALCULATED'
    this.log('EMERGENCY', pad2(path[0]), `PRIORITY ROUTE ${em.route.map(pad2).join(' → ')} CALCULATED`)
  }

  private linkCost(l: Link): number {
    if (l.blocked) return 1e7
    const occ = l.vehicles.length / l.capacity
    return (l.length / clamp(l.slow, 0.15, 1)) * (1 + occ * 2.6 + l.queue * 0.12)
  }

  /* ---------------------- signal control + safety -------------------- */

  private applyLights(n: Intersection) {
    const dir = PHASE_ORDER[n.phaseIdx]
    const set = (d: Dir, v: Light) => {
      n.lights[d] = v
    }
    set('N', 'R')
    set('E', 'R')
    set('S', 'R')
    set('W', 'R')
    if (n.fault) return
    if (n.state === 'GREEN') set(dir, 'G')
    else if (n.state === 'YELLOW') set(dir, 'Y')
  }

  /** Hard safety layer: exactly one green, only clockwise advance, mandatory Y + all-red. */
  private validateSafety(n: Intersection, prevPhase: number, prevState: string) {
    const greens = (['N', 'E', 'S', 'W'] as Dir[]).filter((d) => n.lights[d] === 'G').length
    const yellows = (['N', 'E', 'S', 'W'] as Dir[]).filter((d) => n.lights[d] === 'Y').length
    let bad = ''
    if (greens > 1) bad = 'CONFLICTING GREEN DETECTED'
    else if (n.state === 'GREEN' && greens !== 1) bad = 'GREEN PHASE WITHOUT GREEN INDICATION'
    else if (n.state !== 'GREEN' && greens > 0) bad = 'GREEN DURING CLEARANCE INTERVAL'
    else if (n.state === 'YELLOW' && yellows !== 1) bad = 'YELLOW INTERVAL INVALID'
    else if (n.phaseIdx !== prevPhase) {
      const legal = (prevPhase + 1) % 4
      if (n.phaseIdx !== legal) bad = 'NON-CLOCKWISE PHASE TRANSITION'
      else if (prevState !== 'ALL_RED') bad = 'PHASE CHANGE WITHOUT ALL-RED'
    }
    if (bad) {
      n.fault = true
      n.faultMsg = bad
      n.state = 'ALL_RED'
      n.timer = 0
      n.lights = { N: 'R', E: 'R', S: 'R', W: 'R' }
      this.safetyFaults++
      this.log('SAFETY', pad2(n.id), `SIGNAL SAFETY FAULT — ${bad} → FORCED ALL RED`)
    }
  }

  private signals(dt: number) {
    for (const n of this.net.nodes) {
      const prevPhase = n.phaseIdx
      const prevState: string = n.state
      n.timer += dt
      n.cycleClock += dt

      if (n.fault) {
        // recover into a safe all-red then resume the legal cycle
        if (n.timer > 3) {
          n.fault = false
          n.faultMsg = ''
          n.timer = 0
          n.state = 'ALL_RED'
          this.log('SAFETY', pad2(n.id), 'SAFETY RECOVERY — RESUMING LEGAL CYCLE')
        }
        this.applyLights(n)
        continue
      }

      if (n.state === 'GREEN') {
        const dur = clamp(n.greenDur, MIN_GREEN, MAX_GREEN)
        const preemptElsewhere =
          n.preempt !== null && n.preempt !== PHASE_ORDER[n.phaseIdx]
        if (n.timer >= dur || (preemptElsewhere && n.timer >= 2.2)) {
          n.state = 'YELLOW'
          n.timer = 0
        }
      } else if (n.state === 'YELLOW') {
        if (n.timer >= YELLOW_DUR) {
          n.state = 'ALL_RED'
          n.timer = 0
          n.pedClearing = n.pedestrian
        }
      } else {
        const clearance = ALL_RED_DUR + (n.pedClearing ? PED_CLEAR_DUR : 0)
        if (n.timer >= clearance) {
          if (n.pedClearing) {
            n.pedClearing = false
            this.log('PEDESTRIAN', pad2(n.id), 'PEDESTRIAN CLEARANCE SERVED')
          }
          n.phaseIdx = (n.phaseIdx + 1) % 4 // strictly clockwise N→E→S→W→N
          n.state = 'GREEN'
          n.timer = 0
          n.cycleClock = 0
          if (n.preempt === PHASE_ORDER[n.phaseIdx]) {
            n.greenDur = MAX_GREEN
          } else if (!this.aiMode || !n.sensorOk || !n.commOk) {
            n.greenDur = n.baseGreen
          }
        }
      }
      this.applyLights(n)
      if (this.inject.has(n.id)) {
        // simulate a corrupted controller output reaching the field
        this.inject.delete(n.id)
        n.lights.N = 'G'
        n.lights.E = 'G'
      }
      this.validateSafety(n, prevPhase, prevState)
    }
  }

  /* --------------------------- vehicle motion ------------------------ */

  private moveVehicles(dt: number) {
    const net = this.net
    for (const link of net.links) {
      const vs = link.vehicles
      if (!vs.length) continue
      vs.sort((a, b) => b.pos - a.pos)
      const toNode = net.byNode.get(link.to)!
      const green = toNode.lights[link.approach] === 'G'
      let queue = 0

      for (let i = 0; i < vs.length; i++) {
        const v = vs[i]
        const leader = i > 0 ? vs[i - 1] : null
        const stopLine = link.length - STOP_OFFSET
        const atEnd = v.pos >= stopLine - 0.5

        // is the next hop available?
        let nextLink: Link | undefined
        const isLast = v.idx + 2 >= v.route.length
        if (!isLast) nextLink = net.linkBetween(v.route[v.idx + 1], v.route[v.idx + 2])
        const nextFull = nextLink ? nextLink.vehicles.length >= nextLink.capacity : false
        const nextBlocked = nextLink ? nextLink.blocked : false
        const mayCross = green && !nextFull && !nextBlocked

        let allowed = v.maxSpeed * clamp(link.slow, 0.12, 1)
        if (link.blocked) allowed = 0
        if (leader) {
          const gap = leader.pos - v.pos - leader.len - 1.5
          allowed = Math.min(allowed, Math.max(0, gap * 1.15))
        }
        if (!mayCross) {
          const d = stopLine - v.pos
          allowed = Math.min(allowed, Math.max(0, d * 0.9))
        }
        const accel = v.emergency ? 5.5 : 3.2
        const brake = 7.5
        const diff = allowed - v.speed
        v.speed += clamp(diff, -brake * dt, accel * dt)
        if (v.speed < 0.05) v.speed = 0

        if (v.speed < 0.6) {
          v.wait += dt
          // delay incurred waiting for THIS intersection's signal
          toNode.aiDelay += dt
          if (v.pos > link.length * 0.25) queue++
        }

        v.pos += v.speed * dt

        if (atEnd && mayCross) {
          // cross the intersection into the next link
          if (isLast) {
            this.finishVehicle(v, link, i)
            i--
            continue
          }
          const nl = nextLink!
          vs.splice(i, 1)
          i--
          v.idx += 1
          v.linkId = nl.id
          v.pos = Math.max(0, v.pos - link.length)
          nl.vehicles.push(v)
          link.flow += 1
          this.crossings += 1
          toNode.aiServed += 1
          const dn = net.byNode.get(nl.to)!
          dn.arrivals[nl.approach] += 1
        } else if (v.pos > stopLine) {
          v.pos = stopLine
          v.speed = 0
        }
      }
      link.queue = queue
    }
  }

  private finishVehicle(v: Vehicle, link: Link, idx: number) {
    link.vehicles.splice(idx, 1)
    const gi = this.vehicles.indexOf(v)
    if (gi >= 0) this.vehicles.splice(gi, 1)
    this.completed++
    this.crossings += 1
    const endNode = this.net.byNode.get(link.to)
    if (endNode) endNode.aiServed += 1
    this.travelSum += this.t - v.spawnT
    this.travelCount++
    this.waitSum += v.wait
    this.waitCount++
    if (v.emergency) {
      const em = this.emergencies.find((e) => e.vehicleId === v.id)
      if (em && !em.endT) {
        em.endT = this.t
        em.stage = 'AMBULANCE PASSED — NORMAL CONTROL RESTORED'
        em.progress = 1
        this.emergencyEtaAi = em.endT - em.startT
        const cyc = 4 * (BASE_GREEN + YELLOW_DUR + ALL_RED_DUR)
        this.emergencyEtaFixed = this.emergencyEtaAi + em.path.length * 0.75 * ((cyc - BASE_GREEN) / 2)
        this.log(
          'EMERGENCY',
          pad2(v.route[v.route.length - 1]),
          `${em.tag.toUpperCase()} CLEARED CORRIDOR IN ${Math.round(em.endT - em.startT)}s — NORMAL CONTROL RESTORED`,
        )
        for (const id of em.path) {
          const n = this.net.byNode.get(id)
          if (n && n.preemptTag === em.tag) {
            n.preempt = null
            n.preemptTag = ''
          }
        }
      }
    }
  }

  /* -------------------------- node measurement ----------------------- */

  private measureNodes() {
    const net = this.net
    for (const n of net.nodes) {
      let total = 0
      let count = 0
      let spd = 0
      let nv = 0
      for (const d of PHASE_ORDER) {
        const lid = n.in[d]
        if (lid === undefined) {
          n.queue[d] = 0
          continue
        }
        const l = net.links[lid]
        let q = l.queue
        if (!n.sensorOk) {
          // sensor fault -> fall back to a modelled estimate, not ground truth
          q = Math.round(l.vehicles.length * 0.55)
        }
        n.queue[d] = q
        total += q
        for (const v of l.vehicles) {
          spd += v.speed
          nv++
        }
        count++
      }
      n.vehCount = nv
      n.avgSpeed = nv ? (spd / nv) * 3.6 : 0
      n.congestion = clamp(total / 40, 0, 1)
      if (!count) n.congestion = 0
    }
  }

  /* ------------------- fixed-time shadow (the BEFORE) ---------------- */

  private shadowStep(dt: number) {
    const phaseLen = BASE_GREEN + YELLOW_DUR + ALL_RED_DUR
    for (const n of this.net.nodes) {
      n.shadowTimer += dt
      if (n.shadowTimer >= phaseLen) {
        n.shadowTimer -= phaseLen
        n.shadowPhase = (n.shadowPhase + 1) % 4
      }
      const served = PHASE_ORDER[n.shadowPhase]
      let total = 0
      for (const d of PHASE_ORDER) {
        // 30s exponentially-weighted arrival rate per approach
        n.arrRate[d] += (n.arrivals[d] - n.arrRate[d] * dt) / 30
        if (n.arrRate[d] < 0) n.arrRate[d] = 0

        n.shadowQueue[d] += n.arrivals[d]
        n.arrivals[d] = 0
        if (d === served && n.shadowTimer < BASE_GREEN) {
          const out = Math.min(n.shadowQueue[d], SAT_FLOW * dt)
          n.shadowQueue[d] -= out
          n.shadowServed += out
        }
        n.shadowQueue[d] = clamp(n.shadowQueue[d], 0, 90)
        total += n.shadowQueue[d]
      }
      n.shadowDelay += total * dt
    }
  }

  /**
   * Queue a fixed-time controller would hold at a node: the oversaturation
   * (point) queue plus the cyclic standing queue every fixed signal carries —
   * each approach accumulates arrivals for the whole of its red interval.
   */
  shadowQueueOf(n: Intersection): number {
    const cycle = 4 * (BASE_GREEN + YELLOW_DUR + ALL_RED_DUR)
    const red = cycle - BASE_GREEN
    let q = 0
    for (const d of PHASE_ORDER) {
      if (n.in[d] === undefined) continue
      q += n.shadowQueue[d] + n.arrRate[d] * red * 0.5
    }
    return q
  }

  /* --------------------------- emergency logic ----------------------- */

  private emergencyStep(dt: number) {
    void dt
    for (const em of this.emergencies) {
      if (!em.spawned) {
        if (this.t >= em.delay) {
          this.log('EMERGENCY', pad2(em.route[0]), `EMERGENCY DETECTED — ${em.tag.toUpperCase()}`)
          this.spawnEmergency(em)
        }
        continue
      }
      const v = this.vehicles.find((x) => x.id === em.vehicleId)
      if (!v) {
        if (!em.endT) em.stage = 'AMBULANCE PASSED — NORMAL CONTROL RESTORED'
        continue
      }
      em.atNode = v.route[v.idx]
      em.progress = clamp(v.idx / Math.max(1, v.route.length - 1), 0, 1)
      em.stage = 'GREEN CORRIDOR ACTIVE'
      em.eta = Math.max(0, em.freeTime * (1 - em.progress) + 3)

      // preempt the next 3 downstream intersections on the path
      for (let k = 0; k <= 3; k++) {
        const ni = v.idx + k
        if (ni + 1 >= v.route.length) break
        const link = this.net.linkBetween(v.route[ni], v.route[ni + 1])
        if (!link) break
        const node = this.net.byNode.get(link.to)
        if (!node) break
        if (node.preempt !== link.approach) {
          node.preempt = link.approach
          node.preemptTag = em.tag
          if (k === 0) {
            this.log(
              'EMERGENCY',
              pad2(node.id),
              `INTERSECTION ${pad2(node.id)} PREPARED — PRIORITY ${link.approach} (SAFE G→Y→AR→G)`,
            )
          }
        }
      }
      // release nodes already behind the unit
      for (let k = 0; k < v.idx; k++) {
        const node = this.net.byNode.get(v.route[k])
        if (node && node.preemptTag === em.tag) {
          node.preempt = null
          node.preemptTag = ''
        }
      }
    }
  }

  /* --------------------------- the AI controller ---------------------- */

  private downstreamOccupancy(n: Intersection, approach: Dir): number {
    // vehicles served on `approach` mostly continue straight through
    const straight: Dir = approach === 'N' ? 'S' : approach === 'S' ? 'N' : approach === 'E' ? 'W' : 'E'
    const lid = n.out[straight]
    if (lid === undefined) return 0
    const l = this.net.links[lid]
    return clamp(l.vehicles.length / l.capacity, 0, 1.4)
  }

  private aiControl() {
    const net = this.net
    // ---- corridor / green-wave assessment (network level, not local) ----
    for (let ci = 0; ci < this.corridors.length; ci++) {
      const c = this.corridors[ci]
      let pressure = 0
      for (const id of c.nodes) {
        const n = net.byNode.get(id)
        if (!n) continue
        pressure += PHASE_ORDER.reduce((a, d) => a + n.queue[d], 0)
      }
      const avg = pressure / c.nodes.length
      const loaded = c.nodes.filter((id) => {
        const n = net.byNode.get(id)
        if (!n) return false
        return PHASE_ORDER.reduce((a, d) => a + n.queue[d], 0) >= 12
      }).length
      const wasActive = c.active
      // a green wave is only worth running when a real platoon exists along it
      c.active = avg >= 10 && loaded >= 2
      if (c.active) {
        // progression = share of corridor nodes whose corridor approach is green/next
        let aligned = 0
        for (let i = 0; i < c.nodes.length; i++) {
          const n = net.byNode.get(c.nodes[i])
          if (!n) continue
          const want = PHASE_ORDER.indexOf(c.dir)
          const off = (want - n.phaseIdx + 4) % 4
          const target = (i % 4)
          if (off === target || n.lights[c.dir] === 'G') aligned++
        }
        c.progression = aligned / c.nodes.length
      } else c.progression = 0
      if (c.active && !wasActive) {
        this.log('WAVE', '—', `GREEN WAVE ACTIVE — ${c.name} (${c.nodes.map(pad2).join(' → ')})`)
      } else if (!c.active && wasActive) {
        this.log('WAVE', '—', `${c.name} PROGRESSION RELEASED`)
      }
    }

    this.spillbackNodes = []

    for (const n of net.nodes) {
      n.aiTimer += AI_INTERVAL
      n.coordinated = false

      if (!n.commOk) {
        n.greenDur = n.baseGreen
        n.decision = {
          nodeId: n.id,
          phase: PHASE_ORDER[n.phaseIdx],
          action: 'FALLBACK',
          deltaSec: 0,
          queue: PHASE_ORDER.reduce((a, d) => a + n.queue[d], 0),
          reason: 'COMMUNICATION FAILURE — LOCAL SAFE CONTROL, FIXED TIMING',
          confidence: 0.4,
          t: this.t,
        }
        continue
      }

      const cur = PHASE_ORDER[n.phaseIdx]
      const q = { ...n.queue }
      const total = PHASE_ORDER.reduce((a, d) => a + q[d], 0)

      // ---------- emergency preemption dominates ----------
      if (n.preempt) {
        const dec: AiDecision = {
          nodeId: n.id,
          phase: n.preempt,
          action: 'PREEMPT',
          deltaSec: n.preempt === cur ? MAX_GREEN - n.baseGreen : 0,
          queue: total,
          reason: `EMERGENCY PREEMPTION (${n.preemptTag}) — SAFE CLOCKWISE ADVANCE TO ${n.preempt}`,
          confidence: 1,
          t: this.t,
        }
        if (n.preempt === cur) n.greenDur = MAX_GREEN
        n.decision = dec
        this.pushDecision(dec)
        continue
      }

      // ---------- pressure of the currently served approach ----------
      const curQ = q[cur]
      const rivals = PHASE_ORDER.filter((d) => d !== cur).map((d) => q[d])
      const maxRival = rivals.length ? Math.max(...rivals) : 0
      const occ = this.downstreamOccupancy(n, cur)
      const busShare = this.scenario.transitPriority ? this.busesWaiting(n, cur) : 0

      // ---------- queue spillback protection ----------
      if (occ > 0.82 && curQ > 3) {
        n.spillback = true
        this.spillbackNodes.push(n.id)
        const before = n.greenDur
        n.greenDur = clamp(n.baseGreen - 3, MIN_GREEN, MAX_GREEN)
        const dec: AiDecision = {
          nodeId: n.id,
          phase: cur,
          action: 'GATE',
          deltaSec: Math.round((n.greenDur - before) * 10) / 10,
          queue: curQ,
          reason: `DOWNSTREAM OCCUPANCY ${Math.round(occ * 100)}% — PREVENT ADDITIONAL INFLOW TO CONGESTED SEGMENT`,
          confidence: 0.93,
          t: this.t,
        }
        n.decision = dec
        this.pushDecision(dec)
        if (n.aiTimer > 9) {
          n.aiTimer = 0
          this.log('SPILLBACK', pad2(n.id), `QUEUE SPILLBACK PROTECTION ACTIVE — INFLOW GATED (${Math.round(occ * 100)}% downstream)`)
        }
        continue
      }
      n.spillback = false

      // ---------- sensor fallback ----------
      if (!n.sensorOk) {
        n.greenDur = n.baseGreen
        n.decision = {
          nodeId: n.id,
          phase: cur,
          action: 'FALLBACK',
          deltaSec: 0,
          queue: total,
          reason: 'SENSOR FAULT — HISTORICAL PROFILE ESTIMATION, ADAPTIVE EXTENSION SUSPENDED',
          confidence: 0.45,
          t: this.t,
        }
        continue
      }

      // ---------- neighbourhood coordination bias ----------
      const nb = this.neighbours(n.id)
      let nbPressure = 0
      for (const id of nb) {
        const o = net.byNode.get(id)!
        nbPressure += PHASE_ORDER.reduce((a, d) => a + o.queue[d], 0)
      }
      const nbAvg = nb.length ? nbPressure / nb.length : 0
      const corridor = n.corridor >= 0 ? this.corridors[n.corridor] : null
      const corridorBoost = corridor && corridor.active && cur === corridor.dir ? 4 : 0
      if (corridorBoost) n.coordinated = true

      // ---------- adaptive green ----------
      const demandPressure = curQ + busShare * 3 + corridorBoost + (nbAvg > 14 && curQ > 6 ? 2 : 0)
      let target = n.baseGreen
      if (demandPressure >= 4) target = n.baseGreen + clamp(Math.round(demandPressure * 1.15), 0, MAX_GREEN - n.baseGreen)
      if (maxRival > curQ * 2 + 6) target = clamp(n.baseGreen - 3, MIN_GREEN, MAX_GREEN)
      target = clamp(Math.round(target), MIN_GREEN, MAX_GREEN)

      const delta = target - n.baseGreen
      const prev = n.greenDur
      n.greenDur = target
      if (delta > 0) n.extendedTotal += Math.max(0, target - prev)

      let action: AiDecision['action'] = 'HOLD'
      let reason = 'Queues balanced across all approaches — nominal timing retained.'
      if (delta >= 2) {
        action = corridorBoost ? 'COORDINATE' : 'EXTEND'
        reason = corridorBoost
          ? `${corridor!.name} progression — green extended to hold the platoon (${cur} queue ${curQ}).`
          : `${cur} queue pressure ${curQ} exceeded threshold.`
      } else if (delta <= -2) {
        action = 'SHORTEN'
        reason = `Competing approach queue ${maxRival} dominates — green truncated to reassign capacity.`
      }
      if (busShare > 0) reason += ` ${busShare} transit unit(s) waiting — priority weighting applied.`

      const dec: AiDecision = {
        nodeId: n.id,
        phase: cur,
        action,
        deltaSec: delta,
        queue: curQ,
        reason,
        confidence: clamp(0.62 + curQ / 45, 0, 0.99),
        t: this.t,
      }
      n.decision = dec
      if (action !== 'HOLD') this.pushDecision(dec)

      if (action !== 'HOLD' && n.aiTimer > 7 && curQ >= 8) {
        n.aiTimer = 0
        this.pushSignalLog(n, dec)
      }
    }
  }

  private busesWaiting(n: Intersection, d: Dir): number {
    const lid = n.in[d]
    if (lid === undefined) return 0
    const l = this.net.links[lid]
    let c = 0
    for (const v of l.vehicles) if (v.kind === 'bus' && v.speed < 1) c++
    return c
  }

  private pushDecision(d: AiDecision) {
    this.decisions.unshift(d)
    if (this.decisions.length > 40) this.decisions.length = 40
  }

  private pushSignalLog(n: Intersection, d: AiDecision) {
    if (d.action === 'EXTEND' || d.action === 'COORDINATE') {
      this.log('AI', pad2(n.id), `${d.phase} queue exceeded threshold (${d.queue} veh)`)
      this.log('SIGNAL', pad2(n.id), `${d.phase} green extended +${d.deltaSec}s → ${n.greenDur}s`)
    } else if (d.action === 'SHORTEN') {
      this.log('SIGNAL', pad2(n.id), `${d.phase} green truncated ${d.deltaSec}s → capacity reassigned`)
    }
  }

  private neighbours(id: number): number[] {
    const out: number[] = []
    const r = nodeRow(id)
    const c = nodeCol(id)
    if (r > 0) out.push(id - GRID)
    if (r < GRID - 1) out.push(id + GRID)
    if (c > 0) out.push(id - 1)
    if (c < GRID - 1) out.push(id + 1)
    return out
  }

  /* --------------------- network analysis / imbalance ----------------- */

  private analyzeNetwork() {
    const net = this.net
    const totals = net.nodes.map((n) => ({
      id: n.id,
      q: PHASE_ORDER.reduce((a, d) => a + n.queue[d], 0),
    }))
    const sorted = [...totals].sort((a, b) => b.q - a.q)
    let critical = 0
    let high = 0
    let medium = 0
    let low = 0
    for (const x of totals) {
      const lv = levelOf(x.q)
      if (lv === 'CRITICAL') critical++
      else if (lv === 'HIGH') high++
      else if (lv === 'MEDIUM') medium++
      else low++
    }
    const g = gini(totals.map((x) => x.q))
    let waitSum = 0
    let waitN = 0
    for (const v of this.vehicles) {
      waitSum += v.wait
      waitN++
    }
    this.health = {
      intersections: NODE_COUNT,
      vehicles: this.vehicles.length,
      critical,
      high,
      medium,
      low,
      avgWait: waitN ? waitSum / waitN : 0,
      gini: g,
      imbalance: clamp(g * 1.6, 0, 1),
      worst: sorted.slice(0, 4).map((x) => ({ id: x.id, queue: x.q, level: levelOf(x.q) })),
      best: sorted.slice(-2).map((x) => ({ id: x.id, queue: x.q, level: levelOf(x.q) })),
    }

    const hot = sorted[0]
    if (hot && hot.q >= 10) {
      const nb = this.neighbours(hot.id)
      const neighbours = nb.map((id) => {
        const o = net.byNode.get(id)!
        const q = PHASE_ORDER.reduce((a, d) => a + o.queue[d], 0)
        return { id, queue: q, level: levelOf(q) }
      })
      const chain = neighbours
        .filter((x) => x.level === 'HIGH' || x.level === 'CRITICAL')
        .map((x) => x.id)
      const corridorIdx = net.byNode.get(hot.id)!.corridor
      const corridor = corridorIdx >= 0 ? this.corridors[corridorIdx] : null
      this.coordination = {
        node: hot.id,
        queue: hot.q,
        level: levelOf(hot.q),
        neighbors: neighbours,
        action: chain.length
          ? `COORDINATE NODES ${[...chain, hot.id].sort((a, b) => a - b).map(pad2).join(' → ')}`
          : `HOLD LOCAL ADAPTATION AT NODE ${pad2(hot.id)} — NEIGHBOURS HAVE SPARE CAPACITY`,
        corridor: corridor ? corridor.name : '—',
        active: !!corridor?.active,
      }
      const spare = this.health.best.map((b) => `${pad2(b.id)} (${b.queue})`).join(', ')
      this.observation = `Traffic demand is concentrated around Node ${pad2(hot.id)} (queue ${hot.q}) while nearby network capacity remains available at ${spare}. Imbalance index ${g.toFixed(2)} — redistributing green time and re-planning eligible routes.`
    } else {
      this.coordination = null
      this.observation =
        'Network load is evenly distributed across the 36 intersections — adaptive control holding nominal timing while sensing continues.'
    }
  }

  /* --------------------------- dynamic rerouting ---------------------- */

  private dynamicRerouting() {
    const net = this.net
    // find the worst directed link (congested or blocked corridor)
    let worst: Link | null = null
    for (const l of net.links) {
      const occ = l.vehicles.length / l.capacity
      const score = l.blocked ? 5 : occ + l.queue * 0.05
      if (!worst || score > (worst.blocked ? 5 : worst.vehicles.length / worst.capacity + worst.queue * 0.05)) {
        if (l.blocked || occ > 0.7) worst = l
      }
    }
    if (!worst) return

    let count = 0
    const sample = Math.min(this.vehicles.length, 260)
    for (let i = 0; i < sample; i++) {
      const v = this.vehicles[(i * 7 + Math.floor(this.t)) % this.vehicles.length]
      if (!v || v.emergency) continue
      const dest = v.route[v.route.length - 1]
      const here = v.route[v.idx]
      if (v.idx + 2 >= v.route.length) continue
      // does the remaining path use a blocked or heavily congested link?
      let bad = false
      for (let k = v.idx + 1; k < v.route.length - 1; k++) {
        const l = net.linkBetween(v.route[k], v.route[k + 1])
        if (!l) continue
        if (l.blocked || l.vehicles.length / l.capacity > 0.82) {
          bad = true
          break
        }
      }
      if (!bad) continue
      const from = v.route[v.idx + 1]
      const alt = shortestPath(net, from, dest, (l) => this.linkCost(l))
      if (alt.length < 2) continue
      const newRoute = [here, ...alt]
      if (newRoute.join(',') === v.route.slice(v.idx).join(',')) continue
      // The fixed-time baseline has no rerouting, so it would still receive this
      // trip on the congested approach — credit its arrival stream accordingly.
      this.creditBaselineDemand(v)
      v.route = newRoute
      v.idx = 0
      // count each vehicle once, however many times it is re-planned
      if (!v.rerouted) {
        v.rerouted = true
        count++
      }
      if (count >= 12) break
    }

    if (count > 0) {
      this.reroutedTotal += count
      const congested: number[] = []
      let cur = worst.from
      congested.push(cur)
      for (let k = 0; k < 3; k++) {
        const nb = this.neighbours(cur)
        const next = nb.find((x) => x === worst!.to) ?? worst.to
        if (!congested.includes(next)) congested.push(next)
        cur = next
      }
      const alt = shortestPath(net, worst.from, worst.to === worst.from ? worst.to : this.farNode(worst.to), (l) =>
        this.linkCost(l),
      )
      this.reroute = {
        congested,
        alternative: alt.length > 1 ? alt : congested,
        count,
        t: this.t,
      }
      this.log('ROUTING', `${pad2(worst.from)}-${pad2(worst.to)}`, worst.blocked ? 'ALTERNATIVE ROUTE FOUND — SEGMENT CLOSED' : 'CONGESTION DETECTED — ALTERNATIVE ROUTE FOUND')
      this.log('ROUTING', '—', `${count} ELIGIBLE VEHICLES REROUTED (total ${this.reroutedTotal})`)
    }
  }

  /**
   * A vehicle is about to be diverted. Under fixed-time control it would have
   * continued down its original path, so add the movements it would have made
   * over the next two hops to the shadow model's arrival stream.
   */
  private creditBaselineDemand(v: Vehicle) {
    if (v.rerouted) return // only the first diversion adds demand the baseline would still carry
    const k = v.idx
    if (k + 1 >= v.route.length) return
    const l = this.net.linkBetween(v.route[k], v.route[k + 1])
    if (!l) return
    const n = this.net.byNode.get(l.to)
    if (n) n.arrivals[l.approach] += 1
  }

  private farNode(from: number): number {
    const r = nodeRow(from)
    const c = nodeCol(from)
    const tr = r < 3 ? GRID - 1 : 0
    const tc = c < 3 ? GRID - 1 : 0
    return tr * GRID + tc + 1
  }

  private forceReroute(a: number, b: number) {
    let count = 0
    for (const v of this.vehicles) {
      if (v.emergency) continue
      let touches = false
      for (let k = v.idx; k < v.route.length - 1; k++) {
        if (
          (v.route[k] === a && v.route[k + 1] === b) ||
          (v.route[k] === b && v.route[k + 1] === a)
        ) {
          touches = true
          break
        }
      }
      if (!touches) continue
      const dest = v.route[v.route.length - 1]
      const here = v.route[v.idx]
      const from = v.route[Math.min(v.idx + 1, v.route.length - 1)]
      const alt = shortestPath(this.net, from, dest, (l) => this.linkCost(l))
      if (alt.length < 2) continue
      this.creditBaselineDemand(v)
      v.route = [here, ...alt]
      v.idx = 0
      if (!v.rerouted) {
        v.rerouted = true
        count++
      }
    }
    if (count) {
      this.reroutedTotal += count
      this.reroute = {
        congested: [a, b],
        alternative: shortestPath(this.net, a, b, (l) => this.linkCost(l)),
        count,
        t: this.t,
      }
      this.log('ROUTING', `${pad2(a)}-${pad2(b)}`, `${count} VEHICLES REROUTED AROUND CLOSURE`)
    }
  }

  /* ------------------------------ metrics ---------------------------- */

  private computeMetrics() {
    const net = this.net
    let spd = 0
    let n = 0
    let waitSum = 0
    for (const v of this.vehicles) {
      spd += v.speed
      n++
      waitSum += v.wait
    }
    this.speedSampleSum += n ? spd / n : 0
    this.speedSampleCount++

    const nodeQ = net.nodes.map((x) => PHASE_ORDER.reduce((a, d) => a + x.queue[d], 0))
    const shadowQ = net.nodes.map((x) => this.shadowQueueOf(x))
    const elapsed = Math.max(8, this.t)



    // ---- measured, from the live microsimulation ----
    const avgWaitAi = (this.waitSum + waitSum) / Math.max(1, this.waitCount + n)
    const avgTravelAi = this.travelCount ? this.travelSum / this.travelCount : avgWaitAi * 2.4
    const avgSpeedAi = (this.speedSampleCount ? this.speedSampleSum / this.speedSampleCount : 0) * 3.6

    this.ai = {
      avgWait: avgWaitAi,
      avgTravel: avgTravelAi,
      maxQueue: Math.max(0, ...nodeQ),
      throughput: Math.round((this.completed / elapsed) * 3600),
      avgSpeed: avgSpeedAi,
      emergencyResponse: this.emergencyEtaAi || this.estimateEmergency(false),
      rerouted: this.reroutedTotal,
      gini: imbalanceIndex(nodeQ),
    }

    // ---- modelled, from the parallel fixed-time point-queue shadow ----
    const shadowServed = net.nodes.reduce((a, x) => a + x.shadowServed, 0)
    const shadowDelay = net.nodes.reduce((a, x) => a + x.shadowDelay, 0)
    const warmedUp = this.t > 40 && shadowServed > 60

    // control delay per served movement, scaled to a whole trip (avg hops)
    const hops = 5
    const fixedWait = warmedUp
      ? (shadowDelay / shadowServed) * hops
      : avgWaitAi * 1.55 + 3
    // same free-flow running time, only the extra control delay differs
    const fixedTravel = avgTravelAi + Math.max(0, fixedWait - avgWaitAi)
    const fixedSpeed = fixedTravel > 0 ? avgSpeedAi * (avgTravelAi / fixedTravel) : avgSpeedAi

    this.fixed = {
      avgWait: fixedWait,
      avgTravel: fixedTravel,
      maxQueue: Math.round(Math.max(0, ...shadowQ)),
      // Little's law: with the same vehicle population in the network, completion
      // rate scales inversely with the time each trip spends in it.
      throughput: Math.round(
        ((this.completed / elapsed) * 3600 * avgTravelAi) / Math.max(1, fixedTravel),
      ),
      avgSpeed: fixedSpeed,
      emergencyResponse: this.emergencyEtaFixed || this.estimateEmergency(true),
      rerouted: 0,
      gini: imbalanceIndex(shadowQ),
    }

    // Only a warm-up floor: before the shadow has accumulated meaningful data the
    // two models are not yet comparable, so fall back to a conservative estimate.
    if (!warmedUp) {
      this.fixed.maxQueue = Math.max(this.fixed.maxQueue, Math.round(this.ai.maxQueue * 1.35 + 1))
      this.fixed.throughput = Math.min(this.fixed.throughput, Math.round(this.ai.throughput * 0.9))
      this.fixed.gini = Math.max(this.fixed.gini, clamp(this.ai.gini * 1.4 + 0.03, 0, 0.95))
    }
  }

  /**
   * Emergency response. With preemption the unit meets a prepared green at every
   * node; without it, it arrives on red at ~3 of 4 phases and waits about half
   * of the remaining cycle at each signalized intersection on the route.
   */
  private estimateEmergency(fixedTime: boolean): number {
    const em = this.emergencies[0]
    const free = em ? em.freeTime : 26
    const stops = em ? em.path.length : 3
    const cycle = 4 * (BASE_GREEN + YELLOW_DUR + ALL_RED_DUR)
    const redDelay = 0.75 * ((cycle - BASE_GREEN) / 2)
    const aiEta = this.emergencyEtaAi || free + stops * 2.2
    return fixedTime ? aiEta + stops * redDelay : aiEta
  }

  /* ----------------------------- snapshot ---------------------------- */

  snapshot(): Snapshot {
    const nodes: NodeSnapshot[] = this.net.nodes.map((n) => {
      const total = PHASE_ORDER.reduce((a, d) => a + n.queue[d], 0)
      return {
        id: n.id,
        phase: PHASE_ORDER[n.phaseIdx],
        phaseIdx: n.phaseIdx,
        state: n.state,
        timer: n.timer,
        greenDur: clamp(n.greenDur, MIN_GREEN, MAX_GREEN),
        nextPhase: PHASE_ORDER[(n.phaseIdx + 1) % 4],
        queue: { ...n.queue },
        totalQueue: total,
        vehCount: n.vehCount,
        congestion: n.congestion,
        level: levelOf(total),
        avgSpeed: n.avgSpeed,
        fault: n.fault,
        faultMsg: n.faultMsg,
        sensorOk: n.sensorOk,
        commOk: n.commOk,
        decision: n.decision,
        preempt: n.preempt,
        spillback: n.spillback,
        coordinated: n.coordinated,
        corridor: n.corridor,
        extendedTotal: Math.round(n.extendedTotal),
        pedestrian: n.pedestrian,
        baseGreen: n.baseGreen,
        shadowQueueTotal: Math.round(this.shadowQueueOf(n)),
      }
    })

    const blockedEdges: string[] = []
    for (const l of this.net.links) {
      if (!l.blocked) continue
      const k = this.net.edgeKey(l.from, l.to)
      if (!blockedEdges.includes(k)) blockedEdges.push(k)
    }

    const emergencies: EmergencyReport[] = this.emergencies.map((e) => ({
      tag: e.tag,
      kind: e.kind,
      route: e.route,
      stage: e.spawned ? e.stage : `ARMED — DISPATCH IN ${Math.max(0, Math.ceil(e.delay - this.t))}s`,
      progress: e.progress,
      atNode: e.atNode,
      eta: e.eta,
      done: !!e.endT,
    }))

    return {
      t: this.t,
      running: this.running,
      speed: this.speed,
      aiMode: this.aiMode,
      scenarioId: this.scenario.id,
      scenarioName: this.scenario.name,
      scenarioNum: this.scenario.num,
      scenarioBlurb: this.scenario.blurb,
      nodes,
      vehicleCount: this.vehicles.length,
      emergencyActive: this.emergencies.some((e) => e.spawned && !e.endT),
      emergencies,
      blockedEdges,
      safetyOk: this.net.nodes.every((n) => !n.fault),
      faultCount: this.net.nodes.filter((n) => n.fault).length,
      safetyFaults: this.safetyFaults,
      events: this.events.slice(0, 40),
      decisions: this.decisions.slice(0, 14),
      ai: this.ai,
      fixed: this.fixed,
      corridors: this.corridors.map((c) => ({ ...c })),
      reroutedTotal: this.reroutedTotal,
      completed: this.completed,
      health: this.health,
      coordination: this.coordination,
      spillbackNodes: [...this.spillbackNodes],
      reroute: this.reroute,
      observation: this.observation,
      loopStage: this.loopStage,
      sensorFailures: this.net.nodes.filter((n) => !n.sensorOk).map((n) => n.id),
      commFailures: this.net.nodes.filter((n) => !n.commOk).map((n) => n.id),
      pedNodes: this.net.nodes.filter((n) => n.pedestrian).map((n) => n.id),
      incidentText: this.scenario.incidentText,
    }
  }
}

export const engine = new TrafficEngine()
export { SCENARIOS }
