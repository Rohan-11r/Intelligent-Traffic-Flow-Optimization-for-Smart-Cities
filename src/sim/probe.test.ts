import { it } from 'vitest'
import { TrafficEngine } from './engine'
import { PHASE_ORDER } from './types'

it('probe', () => {
  for (const id of ['normal', 'morning', 'accident', 'ambulance', 'stress']) {
    const e = new TrafficEngine()
    e.applyScenario(id, true)
    for (let i = 0; i < 240 / 0.02; i++) e.step(0.02)
    const s = e.snapshot()
    const q = e.net.nodes.map((n) => PHASE_ORDER.reduce((a, d) => a + n.queue[d], 0))
    // eslint-disable-next-line no-console
    console.log(
      `\n=== ${id} === veh=${s.vehicleCount} done=${s.completed} crit=${s.health.critical} high=${s.health.high} med=${s.health.medium} low=${s.health.low}` +
        `\n  wait  fixed=${s.fixed.avgWait.toFixed(0)} ai=${s.ai.avgWait.toFixed(0)}` +
        `\n  travel fixed=${s.fixed.avgTravel.toFixed(0)} ai=${s.ai.avgTravel.toFixed(0)}` +
        `\n  maxQ  fixed=${s.fixed.maxQueue} ai=${s.ai.maxQueue}` +
        `\n  speed fixed=${s.fixed.avgSpeed.toFixed(1)} ai=${s.ai.avgSpeed.toFixed(1)}` +
        `\n  thru  fixed=${s.fixed.throughput} ai=${s.ai.throughput}` +
        `\n  emETA fixed=${s.fixed.emergencyResponse.toFixed(0)} ai=${s.ai.emergencyResponse.toFixed(0)}` +
        `\n  gini  fixed=${s.fixed.gini.toFixed(2)} ai=${s.ai.gini.toFixed(2)} rerouted=${s.reroutedTotal}` +
        `\n  queues max=${Math.max(...q)} min=${Math.min(...q)} corridors=${s.corridors.filter((c) => c.active).map((c) => c.name).join('|')}` +
        `\n  events=${s.events.slice(0, 3).map((x) => x.kind + ':' + x.text).join(' // ')}`,
    )
  }
})
