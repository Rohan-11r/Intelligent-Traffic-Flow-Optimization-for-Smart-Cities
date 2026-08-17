export interface EmergencySpawn {
  kind: 'ambulance' | 'firetruck'
  tag: string
  route: number[]
  delay: number
}

export interface Scenario {
  id: string
  num: string
  name: string
  blurb: string
  /** vehicles spawned per second across the whole network */
  demand: number
  /** 'edge' = origins on the boundary; 'center' = origins in the core */
  originBias: 'edge' | 'center' | 'uniform'
  destBias: 'edge' | 'center' | 'uniform'
  /** extra demand focused around these nodes */
  hotspots: number[]
  hotspotWeight: number
  /** edges (a-b node pairs) fully blocked */
  blocked: [number, number][]
  /** edges with reduced capacity */
  slowed: [number, number][]
  slowFactor: number
  sensorFailures: number[]
  commFailures: number[]
  pedestrianNodes: number[]
  busShare: number
  truckShare: number
  transitPriority: boolean
  emergencies: EmergencySpawn[]
  incidentText: string[]
}

const base: Omit<Scenario, 'id' | 'num' | 'name' | 'blurb'> = {
  demand: 2.3,
  originBias: 'edge',
  destBias: 'uniform',
  hotspots: [],
  hotspotWeight: 0,
  blocked: [],
  slowed: [],
  slowFactor: 0.45,
  sensorFailures: [],
  commFailures: [],
  pedestrianNodes: [],
  busShare: 0.06,
  truckShare: 0.08,
  transitPriority: false,
  emergencies: [],
  incidentText: [],
}

const s = (
  num: string,
  id: string,
  name: string,
  blurb: string,
  over: Partial<Scenario>,
): Scenario => ({ ...base, id, num, name, blurb, ...over })

export const SCENARIOS: Scenario[] = [
  s('01', 'normal', 'Normal Traffic', 'Balanced city-wide demand, adaptive control nominal.', {
    demand: 2.3,
  }),
  s('02', 'morning', 'Morning Rush Hour', 'Heavy inbound flow from suburbs toward the core.', {
    demand: 3.7,
    originBias: 'edge',
    destBias: 'center',
    hotspots: [15, 16, 21, 22],
    hotspotWeight: 2.2,
    busShare: 0.1,
  }),
  s('03', 'evening', 'Evening Rush Hour', 'Demand reverses: core empties toward the boundary.', {
    demand: 3.7,
    originBias: 'center',
    destBias: 'edge',
    hotspots: [14, 15, 20, 21],
    hotspotWeight: 2.0,
    busShare: 0.1,
  }),
  s('04', 'spike', 'Sudden Traffic Spike', 'Unplanned surge around nodes 14-16.', {
    demand: 4.1,
    originBias: 'uniform',
    destBias: 'center',
    hotspots: [14, 15, 16],
    hotspotWeight: 4.5,
  }),
  s('05', 'single-congestion', 'Single Road Congestion', 'Capacity drop on the 20-21 link.', {
    demand: 2.9,
    slowed: [[20, 21]],
    slowFactor: 0.28,
    hotspots: [20, 21],
    hotspotWeight: 2.5,
    incidentText: ['LINK 20-21 CAPACITY REDUCED 72%'],
  }),
  s('06', 'multi-congestion', 'Multiple Intersection Congestion', 'Core corridor saturation across 5 links.', {
    demand: 3.5,
    destBias: 'center',
    slowed: [
      [14, 15],
      [15, 16],
      [20, 21],
      [21, 22],
      [9, 15],
    ],
    slowFactor: 0.35,
    hotspots: [14, 15, 16, 20, 21, 22],
    hotspotWeight: 2.6,
    incidentText: ['5 CORE LINKS DEGRADED'],
  }),
  s('07', 'spillback', 'Queue Spillback', 'Downstream blocking propagates queues upstream.', {
    demand: 3.9,
    destBias: 'center',
    slowed: [
      [21, 22],
      [22, 23],
      [16, 22],
    ],
    slowFactor: 0.18,
    hotspots: [21, 22, 23, 16],
    hotspotWeight: 3.4,
    incidentText: ['SPILLBACK RISK: NODE 22 APPROACHES'],
  }),
  s('08', 'accident', 'Accident', 'Collision blocks road 15-16 in both directions.', {
    demand: 3.0,
    blocked: [[15, 16]],
    hotspots: [15, 16, 14, 22],
    hotspotWeight: 2.2,
    incidentText: ['INCIDENT DETECTED', 'ROAD 15-16 BLOCKED'],
    emergencies: [{ kind: 'ambulance', tag: 'emergency_amb_01', route: [17, 23, 29], delay: 12 }],
  }),
  s('09', 'closure', 'Road Closure', 'Arterial column 03-09-15-21-27-33 closed for works.', {
    demand: 3.0,
    blocked: [
      [3, 9],
      [9, 15],
      [15, 21],
      [21, 27],
      [27, 33],
    ],
    incidentText: ['ARTERIAL CLOSURE 03-09-15-21-27-33', 'NETWORK REROUTING ACTIVE'],
  }),
  s('10', 'ambulance', 'Ambulance Priority', 'Green corridor for emergency_amb_01 on 17 -> 23 -> 29.', {
    demand: 2.6,
    emergencies: [{ kind: 'ambulance', tag: 'emergency_amb_01', route: [17, 23, 29], delay: 4 }],
    incidentText: ['AMBULANCE PRIORITY ARMED'],
  }),
  s('11', 'multi-emergency', 'Multiple Emergency Vehicles', 'Ambulance + fire truck, conflicting corridors.', {
    demand: 2.8,
    emergencies: [
      { kind: 'ambulance', tag: 'emergency_amb_01', route: [17, 23, 29], delay: 4 },
      { kind: 'firetruck', tag: 'emergency_fire_01', route: [31, 32, 26, 20, 14], delay: 14 },
    ],
    incidentText: ['2 EMERGENCY UNITS ACTIVE'],
  }),
  s('12', 'transit', 'Public Transport Priority', 'Bus fleet gets weighted green extensions.', {
    demand: 2.6,
    busShare: 0.34,
    transitPriority: true,
    incidentText: ['TRANSIT SIGNAL PRIORITY ENABLED'],
  }),
  s('13', 'pedestrian', 'Heavy Pedestrian Crossing', 'Extended all-red pedestrian phases in the core.', {
    demand: 2.5,
    pedestrianNodes: [14, 15, 16, 20, 21, 22],
    incidentText: ['PEDESTRIAN PHASE INSERTED AT 6 NODES'],
  }),
  s('14', 'rerouting', 'Dynamic Driver Rerouting', 'Live re-planning around two failed links.', {
    demand: 3.2,
    blocked: [
      [15, 16],
      [21, 22],
    ],
    destBias: 'center',
    incidentText: ['REROUTING ACTIVE', 'LINKS 15-16 / 21-22 UNAVAILABLE'],
  }),
  s('15', 'sensor-fail', 'Sensor Failure', 'Node 22 loses detection, falls back to fixed timing.', {
    demand: 2.6,
    sensorFailures: [22],
    incidentText: ['NODE 22 SENSOR FAULT', 'FALLBACK TIMING ENGAGED'],
  }),
  s('16', 'comm-fail', 'Communication Failure', 'Nodes 8 and 27 isolated: local safe mode.', {
    demand: 2.6,
    commFailures: [8, 27],
    incidentText: ['NODES 08 / 27 OFFLINE', 'LOCAL SAFE MODE'],
  }),
  s('17', 'stress', 'Full Stress Test', 'Rush hour + accident + emergencies + faults + rerouting.', {
    demand: 4.4,
    originBias: 'edge',
    destBias: 'center',
    hotspots: [14, 15, 16, 20, 21, 22],
    hotspotWeight: 3.2,
    blocked: [[15, 16]],
    slowed: [
      [20, 21],
      [22, 23],
    ],
    slowFactor: 0.3,
    sensorFailures: [22],
    commFailures: [8],
    pedestrianNodes: [21],
    busShare: 0.14,
    truckShare: 0.12,
    transitPriority: true,
    emergencies: [
      { kind: 'ambulance', tag: 'emergency_amb_01', route: [17, 23, 29], delay: 8 },
      { kind: 'firetruck', tag: 'emergency_fire_01', route: [31, 32, 26, 20, 14], delay: 22 },
    ],
    incidentText: ['FULL STRESS TEST ENGAGED', 'ROAD 15-16 BLOCKED', 'NODE 22 SENSOR FAULT'],
  }),
]

export const getScenario = (id: string): Scenario =>
  SCENARIOS.find((x) => x.id === id) ?? SCENARIOS[0]
