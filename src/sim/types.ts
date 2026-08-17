export type Dir = 'N' | 'E' | 'S' | 'W'

/** The ONLY legal phase order. Clockwise: NORTH -> EAST -> SOUTH -> WEST -> NORTH */
export const PHASE_ORDER: Dir[] = ['N', 'E', 'S', 'W']

export const DIR_LABEL: Record<Dir, string> = {
  N: 'NORTH',
  E: 'EAST',
  S: 'SOUTH',
  W: 'WEST',
}

export type SignalState = 'GREEN' | 'YELLOW' | 'ALL_RED'
export type Light = 'R' | 'Y' | 'G'

export type VehicleKind = 'car' | 'bus' | 'truck' | 'ambulance' | 'firetruck'

export type Level = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface AiDecision {
  nodeId: number
  phase: Dir
  action: 'EXTEND' | 'SHORTEN' | 'HOLD' | 'PREEMPT' | 'FALLBACK' | 'GATE' | 'COORDINATE'
  deltaSec: number
  queue: number
  reason: string
  confidence: number
  t: number
}

export type EventKind =
  | 'AI'
  | 'SIGNAL'
  | 'INCIDENT'
  | 'ROUTING'
  | 'EMERGENCY'
  | 'SAFETY'
  | 'SCENARIO'
  | 'FAULT'
  | 'TRANSIT'
  | 'WAVE'
  | 'SPILLBACK'
  | 'PEDESTRIAN'

export interface SimEvent {
  id: number
  kind: EventKind
  node: string
  text: string
  t: number
}

export interface Vehicle {
  id: number
  kind: VehicleKind
  route: number[]
  idx: number
  linkId: number
  pos: number
  speed: number
  maxSpeed: number
  len: number
  wait: number
  spawnT: number
  rerouted: boolean
  laneOff: number
  color: string
  emergency: boolean
  tag: string
}

export interface Link {
  id: number
  from: number
  to: number
  heading: Dir
  /** side of `to` on which vehicles wait (the signal approach it belongs to) */
  approach: Dir
  ax: number
  ay: number
  bx: number
  by: number
  hx: number
  hy: number
  px: number
  py: number
  length: number
  capacity: number
  blocked: boolean
  slow: number
  vehicles: Vehicle[]
  queue: number
  flow: number
}

export interface Intersection {
  id: number
  row: number
  col: number
  x: number
  y: number
  out: Partial<Record<Dir, number>>
  in: Partial<Record<Dir, number>>
  phaseIdx: number
  state: SignalState
  timer: number
  greenDur: number
  baseGreen: number
  lights: Record<Dir, Light>
  fault: boolean
  faultMsg: string
  sensorOk: boolean
  commOk: boolean
  pedestrian: boolean
  pedClearing: boolean
  queue: Record<Dir, number>
  arrivals: Record<Dir, number>
  /** smoothed arrival rate per approach (veh/s), used by the fixed-time baseline */
  arrRate: Record<Dir, number>
  vehCount: number
  congestion: number
  avgSpeed: number
  decision: AiDecision | null
  preempt: Dir | null
  preemptTag: string
  aiTimer: number
  extendedTotal: number
  spillback: boolean
  coordinated: boolean
  corridor: number
  cycleClock: number
  /** fixed-time shadow model (the "BEFORE" baseline) */
  shadowQueue: Record<Dir, number>
  shadowPhase: number
  shadowTimer: number
  shadowDelay: number
  shadowServed: number
  /** live-control counterparts, so delay-per-vehicle is defined identically in both models */
  aiDelay: number
  aiServed: number
}

export interface Metrics {
  avgWait: number
  avgTravel: number
  maxQueue: number
  avgSpeed: number
  throughput: number
  emergencyResponse: number
  rerouted: number
  gini: number
}

export interface NodeSnapshot {
  id: number
  phase: Dir
  phaseIdx: number
  state: SignalState
  timer: number
  greenDur: number
  nextPhase: Dir
  queue: Record<Dir, number>
  totalQueue: number
  vehCount: number
  congestion: number
  level: Level
  avgSpeed: number
  fault: boolean
  faultMsg: string
  sensorOk: boolean
  commOk: boolean
  decision: AiDecision | null
  preempt: Dir | null
  spillback: boolean
  coordinated: boolean
  corridor: number
  extendedTotal: number
  pedestrian: boolean
  baseGreen: number
  shadowQueueTotal: number
}

export interface HealthReport {
  intersections: number
  vehicles: number
  critical: number
  high: number
  medium: number
  low: number
  avgWait: number
  gini: number
  imbalance: number
  worst: { id: number; queue: number; level: Level }[]
  best: { id: number; queue: number; level: Level }[]
}

export interface CoordinationReport {
  node: number
  queue: number
  level: Level
  neighbors: { id: number; queue: number; level: Level }[]
  action: string
  corridor: string
  active: boolean
}

export interface RerouteReport {
  congested: number[]
  alternative: number[]
  count: number
  t: number
}

export interface EmergencyReport {
  tag: string
  kind: VehicleKind
  route: number[]
  stage: string
  progress: number
  atNode: number
  eta: number
  done: boolean
}

export interface CorridorState {
  name: string
  nodes: number[]
  active: boolean
  progression: number
  dir: Dir
}

export interface Snapshot {
  t: number
  running: boolean
  speed: number
  aiMode: boolean
  scenarioId: string
  scenarioName: string
  scenarioNum: string
  scenarioBlurb: string
  nodes: NodeSnapshot[]
  vehicleCount: number
  emergencyActive: boolean
  emergencies: EmergencyReport[]
  blockedEdges: string[]
  safetyOk: boolean
  faultCount: number
  safetyFaults: number
  events: SimEvent[]
  decisions: AiDecision[]
  ai: Metrics
  fixed: Metrics
  corridors: CorridorState[]
  reroutedTotal: number
  completed: number
  health: HealthReport
  coordination: CoordinationReport | null
  spillbackNodes: number[]
  reroute: RerouteReport | null
  observation: string
  loopStage: number
  sensorFailures: number[]
  commFailures: number[]
  pedNodes: number[]
  incidentText: string[]
}
