/**
 * Presentation narrative for each of the 17 scenarios.
 *
 * Pure UI copy — no simulation state lives here. It exists so the operator can
 * read PROBLEM → AI RESPONSE → RESULT straight off the screen while presenting,
 * instead of having to narrate it from memory.
 */
export interface ScenarioStory {
  problem: string
  response: string
  result: string
}

export const STORY: Record<string, ScenarioStory> = {
  normal: {
    problem: 'Balanced city-wide demand — no dominant pressure point.',
    response: 'Independent adaptive cycles; green time tracks live queue per approach.',
    result: 'Low waiting time and an even load across all 36 intersections.',
  },
  morning: {
    problem: 'Central traffic demand increased — heavy inbound flow from the boundary into nodes 15 / 16 / 21 / 22.',
    response: 'Adaptive green extension on loaded approaches + corridor coordination across neighbouring nodes.',
    result: 'Queue reduction at the core, higher throughput, green waves along the inbound corridors.',
  },
  evening: {
    problem: 'Demand reverses — the core empties outward and boundary approaches saturate.',
    response: 'Outbound approaches get extended green; corridors re-phase in the opposite direction.',
    result: 'Outbound corridors clear faster; the core drains without upstream spillback.',
  },
  spike: {
    problem: 'Unplanned surge concentrates on nodes 14–16 within seconds.',
    response: 'AI detects the arrival-rate jump and reallocates green in favour of the surging approaches.',
    result: 'Peak queue absorbed instead of propagating across the network.',
  },
  'single-congestion': {
    problem: 'Link 20–21 loses 72% of its capacity — a single road bottlenecks.',
    response: 'Upstream gating plus rerouting of eligible vehicles onto parallel arterials.',
    result: 'The bottleneck stops growing; surrounding nodes absorb the diverted flow.',
  },
  'multi-congestion': {
    problem: 'Five core links degrade at once — corridor-wide saturation.',
    response: 'Network-wide objective re-solves: coordinate the least-saturated corridor, gate the worst.',
    result: 'Load spreads outward instead of collapsing onto the centre.',
  },
  spillback: {
    problem: 'Downstream segments at node 22 are full — queues start blocking upstream intersections.',
    response: 'Spillback protection: AI refuses to extend green into a full receiving link.',
    result: 'Gridlock prevented; queues stay contained rather than locking the whole core.',
  },
  accident: {
    problem: 'Collision blocks road 15–16 in both directions.',
    response: 'Incident detected → network impact analysis → alternative route found → vehicles rerouted.',
    result: 'Traffic redirected around the closure; adjacent nodes re-timed for the new flow pattern.',
  },
  closure: {
    problem: 'Arterial column 03-09-15-21-27-33 is closed for works — a full north-south corridor is gone.',
    response: 'All routes crossing the closed arterial are re-planned onto parallel columns.',
    result: 'The network keeps flowing on the remaining corridors instead of dead-ending.',
  },
  ambulance: {
    problem: 'Emergency unit dispatched on route 17 → 23 → 29.',
    response: 'Priority route calculated → intersections prepared → green corridor active, safety sequence preserved.',
    result: 'Emergency ETA cut sharply versus fixed-time; normal control restored after the unit passes.',
  },
  'multi-emergency': {
    problem: 'Two emergency units with conflicting corridors are active at the same time.',
    response: 'Corridors are de-conflicted by priority and arrival order; no intersection is double-preempted.',
    result: 'Both units get protected passage without creating a signal safety violation.',
  },
  transit: {
    problem: 'A large bus fleet shares the network with general traffic.',
    response: 'Transit signal priority: buses carry extra weight in the green-time objective.',
    result: 'Bus delay falls while general traffic delay stays within tolerance.',
  },
  pedestrian: {
    problem: 'Heavy pedestrian crossing demand at six core intersections.',
    response: 'Protected pedestrian phases are inserted with full clearance before the next green.',
    result: 'Pedestrian safety guaranteed; vehicle timing rebalanced around the inserted phases.',
  },
  rerouting: {
    problem: 'Links 15–16 and 21–22 become unavailable mid-run.',
    response: 'Live re-planning: every affected vehicle receives a new shortest congestion-aware path.',
    result: 'Rerouted vehicles use spare capacity instead of joining the jam.',
  },
  'sensor-fail': {
    problem: 'Node 22 loses detection — the AI is flying blind at that intersection.',
    response: 'Graceful degradation: node 22 falls back to safe fixed timing, neighbours compensate.',
    result: 'No safety violation, no network collapse — degradation is local, not global.',
  },
  'comm-fail': {
    problem: 'Nodes 08 and 27 are isolated from the control centre.',
    response: 'Local safe mode: isolated nodes run autonomously; coordination excludes them.',
    result: 'The rest of the network stays coordinated while the isolated nodes stay safe.',
  },
  stress: {
    problem: 'Everything at once — rush hour + accident + emergencies + sensor / comms faults + rerouting.',
    response: 'Full stack engaged: adaptive timing, coordination, spillback gating, preemption and rerouting.',
    result: 'The network degrades gracefully and still beats fixed-time control on every metric.',
  },
}

export const storyOf = (id: string): ScenarioStory =>
  STORY[id] ?? {
    problem: 'Scenario loaded.',
    response: 'Adaptive control active.',
    result: 'Metrics updating.',
  }

/** Scenarios worth a one-click chip during a live demo. */
export const QUICK_SCENARIOS: { id: string; label: string }[] = [
  { id: 'morning', label: 'Morning Rush' },
  { id: 'accident', label: 'Accident' },
  { id: 'ambulance', label: 'Ambulance' },
  { id: 'rerouting', label: 'Rerouting' },
  { id: 'stress', label: 'Full Stress' },
]
