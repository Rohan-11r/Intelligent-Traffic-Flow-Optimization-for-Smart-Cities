import { describe, expect, it } from 'vitest'
import { TrafficEngine } from './engine'
import { NODE_COUNT } from './network'
import { PHASE_ORDER } from './types'
import type { Dir } from './types'

/** run `seconds` of simulated time at a fixed 20ms step */
function run(e: TrafficEngine, seconds: number, onTick?: () => void) {
  const dt = 0.02
  for (let i = 0; i < seconds / dt; i++) {
    e.step(dt)
    onTick?.()
  }
}

describe('network', () => {
  it('has exactly 36 signalized intersections in a 6x6 grid', () => {
    const e = new TrafficEngine()
    expect(e.net.nodes.length).toBe(36)
    expect(NODE_COUNT).toBe(36)
    expect(e.net.nodes[0].id).toBe(1)
    expect(e.net.nodes[35].id).toBe(36)
    // 2*(6*5)*2 directed links = 120
    expect(e.net.links.length).toBe(120)
  })
})

describe('signal safety', () => {
  it('never shows two greens and only advances clockwise through Y + all-red', () => {
    const e = new TrafficEngine()
    const prev = new Map<number, { phase: number; state: string }>()
    for (const n of e.net.nodes) prev.set(n.id, { phase: n.phaseIdx, state: n.state })

    let transitions = 0
    run(e, 200, () => {
      for (const n of e.net.nodes) {
        const greens = (['N', 'E', 'S', 'W'] as Dir[]).filter((d) => n.lights[d] === 'G')
        expect(greens.length).toBeLessThanOrEqual(1)
        if (n.state === 'GREEN' && !n.fault) expect(greens.length).toBe(1)
        if (n.state !== 'GREEN') expect(greens.length).toBe(0)

        const p = prev.get(n.id)!
        if (n.phaseIdx !== p.phase && !n.fault) {
          transitions++
          // clockwise N -> E -> S -> W -> N only, always out of ALL_RED
          expect(n.phaseIdx).toBe((p.phase + 1) % 4)
          expect(p.state).toBe('ALL_RED')
        }
        prev.set(n.id, { phase: n.phaseIdx, state: n.state })
      }
    })
    expect(transitions).toBeGreaterThan(100)
    expect(e.safetyFaults).toBe(0)
  })

  it('detects an injected conflicting green and forces ALL RED', () => {
    const e = new TrafficEngine()
    run(e, 5)
    e.injectSafetyFault(15)
    run(e, 0.1)
    const n = e.net.byNode.get(15)!
    expect(e.safetyFaults).toBeGreaterThan(0)
    expect(n.state).toBe('ALL_RED')
    expect(Object.values(n.lights).every((l) => l === 'R')).toBe(true)
    // and it recovers back into the legal cycle
    run(e, 12)
    expect(e.net.byNode.get(15)!.fault).toBe(false)
  })
})

describe('traffic', () => {
  it('moves vehicles and completes trips', () => {
    const e = new TrafficEngine()
    run(e, 120)
    expect(e.vehicles.length).toBeGreaterThan(50)
    expect(e.completed).toBeGreaterThan(10)
    const moving = e.vehicles.filter((v) => v.speed > 1).length
    expect(moving).toBeGreaterThan(10)
  })

  it('produces uneven congestion under morning rush', () => {
    const e = new TrafficEngine()
    e.applyScenario('morning', true)
    run(e, 180)
    const totals = e.net.nodes.map((n) => PHASE_ORDER.reduce((a, d) => a + n.queue[d], 0))
    expect(Math.max(...totals)).toBeGreaterThan(Math.min(...totals) + 5)
    expect(e.health.gini).toBeGreaterThan(0.1)
  })
})

describe('AI control', () => {
  it('actually changes green durations away from the fixed baseline', () => {
    const e = new TrafficEngine()
    e.applyScenario('spike', true)
    run(e, 150)
    const changed = e.net.nodes.filter((n) => n.greenDur !== n.baseGreen)
    expect(changed.length).toBeGreaterThan(3)
    expect(e.decisions.length).toBeGreaterThan(0)
  })

  it('holds fixed timing when the AI is disabled', () => {
    const e = new TrafficEngine()
    e.applyScenario('spike', true)
    e.setAiMode(false)
    run(e, 90)
    expect(e.net.nodes.every((n) => n.greenDur === n.baseGreen)).toBe(true)
  })

  it('falls back at a node with a failed sensor and keeps comms-lost nodes local', () => {
    const e = new TrafficEngine()
    e.applyScenario('stress', true)
    run(e, 60)
    const sensorNode = e.net.nodes.find((n) => !n.sensorOk)!
    expect(sensorNode.decision?.action).toBe('FALLBACK')
    const commNode = e.net.nodes.find((n) => !n.commOk)!
    expect(commNode.greenDur).toBe(commNode.baseGreen)
  })
})

describe('incidents and rerouting', () => {
  it('blocks a road segment and reroutes vehicles around it', () => {
    const e = new TrafficEngine()
    run(e, 40)
    const before = e.reroutedTotal
    e.triggerIncident(15, 16)
    const l = e.net.linkBetween(15, 16)!
    const r = e.net.linkBetween(16, 15)!
    expect(l.blocked).toBe(true)
    expect(r.blocked).toBe(true)
    run(e, 60)
    expect(e.reroutedTotal).toBeGreaterThan(before)
    // no vehicle plans a hop across the closed segment
    const crossing = e.vehicles.filter((v) => {
      for (let k = v.idx; k < v.route.length - 1; k++) {
        const a = v.route[k]
        const b = v.route[k + 1]
        if ((a === 15 && b === 16) || (a === 16 && b === 15)) return true
      }
      return false
    })
    expect(crossing.length).toBe(0)
  })
})

describe('emergency priority', () => {
  it('preempts intersections along 17 -> 23 -> 29 and clears the corridor', () => {
    const e = new TrafficEngine()
    e.applyScenario('ambulance', true)
    let sawPreempt = false
    run(e, 120, () => {
      if (e.net.nodes.some((n) => n.preempt !== null)) sawPreempt = true
    })
    expect(sawPreempt).toBe(true)
    const em = e.emergencies[0]
    expect(em.spawned).toBe(true)
    expect(em.path[0]).toBe(17)
    expect(em.path).toContain(23)
    expect(em.path[em.path.length - 1]).toBe(29)
    expect(e.safetyFaults).toBe(0)
  })
})

describe('benchmark', () => {
  it('reports Smart AI better than the fixed-time baseline on every scenario', () => {
    const ids = ['normal', 'morning', 'evening', 'spike', 'accident', 'stress']
    for (const id of ids) {
      const e = new TrafficEngine()
      e.applyScenario(id, true)
      run(e, 150)
      expect(e.fixed.avgWait, id).toBeGreaterThan(e.ai.avgWait)
      expect(e.fixed.maxQueue, id).toBeGreaterThanOrEqual(e.ai.maxQueue)
      expect(e.fixed.throughput, id).toBeLessThanOrEqual(e.ai.throughput)
      expect(e.fixed.avgSpeed, id).toBeLessThanOrEqual(e.ai.avgSpeed)
      expect(e.fixed.gini, id).toBeGreaterThanOrEqual(e.ai.gini)
      expect(e.ai.avgSpeed, id).toBeGreaterThan(0)
    }
  })
})

describe('all 17 scenarios', () => {
  it('each loads, runs and visibly changes the simulation', () => {
    const e = new TrafficEngine()
    const seen = new Set<string>()
    for (const s of SCENARIO_IDS) {
      e.applyScenario(s, true)
      run(e, 45)
      seen.add(s)
      expect(e.vehicles.length, s).toBeGreaterThan(0)
      expect(e.safetyFaults, s).toBe(0)
      const snap = e.snapshot()
      expect(snap.nodes.length, s).toBe(36)
      expect(snap.scenarioId, s).toBe(s)
    }
    expect(seen.size).toBe(17)
  })
})

const SCENARIO_IDS = [
  'normal',
  'morning',
  'evening',
  'spike',
  'single-congestion',
  'multi-congestion',
  'spillback',
  'accident',
  'closure',
  'ambulance',
  'multi-emergency',
  'transit',
  'pedestrian',
  'rerouting',
  'sensor-fail',
  'comm-fail',
  'stress',
]
