import type { ReactNode } from 'react'
import { pad2 } from '../sim/network'
import { LOOP_STAGES } from '../sim/engine'
import { Bar, LEVEL_HEX, Panel, Row, Stat, Tag } from './ui'
import { DIR_LABEL } from '../sim/types'
import type { AiDecision, Level, Snapshot } from '../sim/types'

/* ------------------------- TRAFFIC IMBALANCE ------------------------ */

export function NetworkHealth({ snap, onSelect }: { snap: Snapshot; onSelect: (id: number) => void }) {
  const h = snap.health
  /** "elevated" = at or above the HIGH-congestion threshold (HIGH + CRITICAL). */
  const elevated = h.critical + h.high
  const belowThreshold = h.intersections - elevated

  return (
    <Panel
      title="Traffic Imbalance / Network Health"
      accent="red"
      right={
        <Tag tone={h.imbalance > 0.5 ? 'bad' : h.imbalance > 0.28 ? 'warn' : 'ok'}>
          NETWORK IMBALANCE {(h.gini * 100).toFixed(0)}%
        </Tag>
      }
    >
      <p className="mb-2.5 rounded-md border border-edge-soft bg-base-750/60 px-2.5 py-1.5 text-2xs leading-relaxed text-ink-faint">
        <span className="font-black uppercase tracking-[0.14em] text-ink-dim">
          Network imbalance {(h.gini * 100).toFixed(0)}%
        </span>{' '}
        — degree of uneven traffic distribution across the 36 intersections. Lower = more evenly
        distributed traffic.
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Intersections" value={h.intersections} sub="signalized" />
        <Stat label="Total Vehicles" value={h.vehicles.toLocaleString()} sub="in network" />
        <Stat label="Critical Congestion" value={h.critical} tone={h.critical ? 'bad' : 'good'} sub="of 36 nodes" />
        <Stat label="High Congestion" value={h.high} tone={h.high ? 'warn' : 'good'} sub="of 36 nodes" />
        <Stat label="Average Wait" value={h.avgWait.toFixed(0)} unit="sec" tone={h.avgWait > 45 ? 'bad' : 'default'} sub="per vehicle" />
        <Stat
          label="Fairness / Gini"
          value={h.gini.toFixed(2)}
          tone={h.gini > 0.35 ? 'bad' : 'good'}
          sub="lower = more evenly distributed traffic"
        />
      </div>

      <div className="mt-3 flex items-center gap-2">
        {(
          [
            ['CRITICAL', h.critical],
            ['HIGH', h.high],
            ['MEDIUM', h.medium],
            ['LOW', h.low],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="flex-1">
            <div className="mb-0.5 flex justify-between text-3xs font-bold uppercase tracking-[0.1em]">
              <span style={{ color: LEVEL_HEX[k] }}>{k}</span>
              <span className="text-ink-faint">{v}</span>
            </div>
            <Bar value={v / 36} color={LEVEL_HEX[k]} />
          </div>
        ))}
      </div>

      <div className="mt-3 text-3xs font-bold uppercase tracking-[0.16em] text-ink-faint">
        Worst / Best distributed nodes — click to inspect
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[...h.worst, ...h.best].map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={() => onSelect(w.id)}
            className="rounded-md border px-2.5 py-1.5 text-left transition-colors hover:brightness-125"
            style={{ borderColor: `${LEVEL_HEX[w.level]}66`, background: `${LEVEL_HEX[w.level]}12` }}
          >
            <div className="font-mono text-2xs font-black text-ink">NODE {pad2(w.id)}</div>
            <div className="font-mono text-3xs font-bold" style={{ color: LEVEL_HEX[w.level] }}>
              {w.level}
            </div>
            <div className="font-mono text-2xs font-bold text-ink-dim">Queue {w.queue}</div>
          </button>
        ))}
      </div>

      <p className="mt-3 rounded-md border border-signal-red/30 bg-signal-red/5 px-2.5 py-2 text-2xs leading-relaxed text-ink-dim">
        <span className="font-bold uppercase tracking-[0.14em] text-signal-red">Problem: </span>
        Traffic is unevenly distributed —{' '}
        <span className="font-black text-ink">
          {elevated} of {h.intersections}
        </span>{' '}
        intersections currently carry elevated traffic load ({h.critical} critical congestion ·{' '}
        {h.high} high congestion);{' '}
        <span className="font-black text-ink">{belowThreshold}</span> remain below the
        high-congestion threshold ({h.medium} at medium pressure · {h.low} free flowing).
      </p>
    </Panel>
  )
}

/* ---------------------------- AI ANALYSIS --------------------------- */

const ACTION_TONE: Record<string, 'ok' | 'warn' | 'bad' | 'info' | 'live' | 'idle'> = {
  EXTEND: 'ok',
  SHORTEN: 'warn',
  HOLD: 'idle',
  PREEMPT: 'bad',
  FALLBACK: 'warn',
  GATE: 'bad',
  COORDINATE: 'live',
}

/* ------------- the headline decision, as a visual pipeline ------------- */

/** Turns the live AiDecision into one plain-language control action. */
function decisionHeadline(d: AiDecision | null): string {
  if (!d) return 'HOLD NOMINAL TIMING'
  const dir = DIR_LABEL[d.phase]
  const delta = `${d.deltaSec > 0 ? '+' : ''}${d.deltaSec}s`
  switch (d.action) {
    case 'EXTEND':
      return `EXTEND ${dir} GREEN ${delta}`
    case 'COORDINATE':
      return `COORDINATE ${dir} GREEN WAVE ${delta}`
    case 'SHORTEN':
      return `SHORTEN ${dir} GREEN ${delta}`
    case 'GATE':
      return `GATE INFLOW ON ${dir} APPROACH`
    case 'PREEMPT':
      return `EMERGENCY PREEMPTION → ${dir}`
    case 'FALLBACK':
      return `SAFE FALLBACK TIMING — ${dir}`
    default:
      return `HOLD ${dir} — TIMING ALREADY OPTIMAL`
  }
}

/** Everything the pipeline card shows, derived live from the running simulation. */
function decisionFocus(snap: Snapshot) {
  const peakId = snap.coordination?.node ?? snap.health.worst[0]?.id ?? null
  const node = peakId !== null ? snap.nodes[peakId - 1] : undefined
  if (!node) return null

  // prefer the most recent *acted* decision for this node; fall back to its current one
  const decision = snap.decisions.find((d) => d.nodeId === node.id) ?? node.decision ?? null

  // coordination chain: the peak plus the neighbours the AI is pulling into line
  const c = snap.coordination
  let chain: number[] = [node.id]
  if (c) {
    const hot = c.neighbors.filter((n) => n.level === 'HIGH' || n.level === 'CRITICAL').map((n) => n.id)
    const pool = hot.length
      ? hot
      : [...c.neighbors].sort((a, b) => b.queue - a.queue).slice(0, 2).map((n) => n.id)
    chain = [...new Set([...pool, node.id])].sort((a, b) => a - b)
  }

  const corridorActive = snap.corridors.some((x) => x.active && x.nodes.includes(node.id))
  const networkAction = node.spillback
    ? 'PROTECT'
    : corridorActive
      ? 'GREEN WAVE'
      : chain.length > 1
        ? 'COORDINATE'
        : 'LOCAL ADAPT'

  const drop = (fixed: number, ai: number, better: 'lower' | 'higher') => {
    if (!isFinite(fixed) || !isFinite(ai) || fixed <= 0) return null
    const change = ((ai - fixed) / fixed) * 100
    const good = better === 'lower' ? change < 0 : change > 0
    return good ? `${better === 'lower' ? '↓' : '↑'} ${Math.abs(change).toFixed(0)}%` : null
  }

  return {
    node,
    level: node.level as Level,
    decision,
    headline: decisionHeadline(decision),
    confidence: decision ? decision.confidence : null,
    chain,
    networkAction,
    corridorActive,
    results: [
      ['Reduce queue', drop(snap.fixed.maxQueue, snap.ai.maxQueue, 'lower')],
      ['Improve flow', drop(snap.fixed.throughput, snap.ai.throughput, 'higher')],
      ['Reduce unnecessary stops', drop(snap.fixed.avgWait, snap.ai.avgWait, 'lower')],
    ] as [string, string | null][],
  }
}

function PipeStep({
  step,
  label,
  accent,
  children,
}: {
  step: string
  label: string
  accent: string
  children: ReactNode
}) {
  return (
    <div
      className="rounded-md border px-3 py-2"
      style={{ borderColor: `${accent}55`, background: `${accent}0f` }}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-3xs font-black tracking-[0.14em] text-ink-faint">{step}</span>
        <span
          className="font-mono text-3xs font-black uppercase tracking-[0.22em]"
          style={{ color: accent }}
        >
          {label}
        </span>
      </div>
      <div className="mt-1">{children}</div>
    </div>
  )
}

function Arrow() {
  return (
    <div
      aria-hidden
      className="py-[1px] text-center font-mono text-xs font-black leading-none text-ink-faint"
    >
      ↓
    </div>
  )
}

export function AiAnalysis({ snap, onSelect }: { snap: Snapshot; onSelect: (id: number) => void }) {
  const h = snap.health
  const imbalanced = h.critical + h.high > 0
  const f = decisionFocus(snap)

  return (
    <Panel
      title="AI Traffic Analysis"
      accent="cyan"
      right={
        <Tag tone={snap.aiMode ? 'ok' : 'bad'}>{snap.aiMode ? 'ADAPTIVE ONLINE' : 'AI DISABLED'}</Tag>
      }
    >
      {/* ---------- THE decision, as a four-step action pipeline ---------- */}
      {f ? (
        <div className="rounded-lg border border-accent-cyan/35 bg-base-900/50 p-2">
          <PipeStep step="01" label="Detected" accent={LEVEL_HEX[f.level]}>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <button
                type="button"
                onClick={() => onSelect(f.node.id)}
                className="font-mono text-xl font-black leading-none tracking-tight text-ink underline-offset-4 transition-colors hover:text-accent-cyan hover:underline"
                title="Inspect this intersection"
              >
                NODE {pad2(f.node.id)}
              </button>
              <span className="flex items-baseline gap-1.5">
                <span className="text-3xs font-bold uppercase tracking-[0.14em] text-ink-faint">
                  Queue
                </span>
                <span className="font-mono text-base font-black leading-none text-ink">
                  {f.node.totalQueue}
                </span>
                <span className="text-3xs text-ink-faint">vehicles</span>
              </span>
              <span className="flex items-baseline gap-1.5">
                <span className="text-3xs font-bold uppercase tracking-[0.14em] text-ink-faint">
                  Pressure
                </span>
                <span
                  className="font-mono text-base font-black leading-none"
                  style={{ color: LEVEL_HEX[f.level] }}
                >
                  {f.level}
                </span>
              </span>
            </div>
          </PipeStep>

          <Arrow />

          <PipeStep step="02" label="AI Decision" accent="#22d3ee">
            <div className="font-mono text-base font-black uppercase leading-tight tracking-[0.04em] text-ink">
              {f.headline}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="flex items-baseline gap-1.5">
                <span className="text-3xs font-bold uppercase tracking-[0.14em] text-ink-faint">
                  Confidence
                </span>
                <span className="font-mono text-sm font-black text-accent-cyan">
                  {f.confidence !== null ? `${(f.confidence * 100).toFixed(0)}%` : '—'}
                </span>
              </span>
              {f.confidence !== null && (
                <span className="min-w-[90px] flex-1">
                  <Bar value={f.confidence} color="#22d3ee" />
                </span>
              )}
            </div>
          </PipeStep>

          <Arrow />

          <PipeStep step="03" label="Network Action" accent="#22c55e">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-base font-black uppercase tracking-[0.08em] text-signal-green">
                {f.networkAction}
              </span>
              <span className="font-mono text-sm font-black tracking-[0.14em] text-ink">
                {f.chain.map(pad2).join(' → ')}
              </span>
            </div>
            <div className="mt-0.5 text-3xs text-ink-faint">
              {f.chain.length > 1
                ? 'neighbouring signals re-phased together so the platoon is not stopped again'
                : 'neighbours hold spare capacity — local adaptation is enough'}
            </div>
          </PipeStep>

          <Arrow />

          <PipeStep step="04" label="Expected Result" accent="#8b5cf6">
            <ul className="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-3">
              {f.results.map(([label, value]) => (
                <li key={label} className="flex items-baseline justify-between gap-2">
                  <span className="text-2xs text-ink-dim">{label}</span>
                  <span className="font-mono text-2xs font-black text-signal-green">
                    {value ?? '—'}
                  </span>
                </li>
              ))}
            </ul>
          </PipeStep>
        </div>
      ) : (
        <div className="rounded-lg border border-signal-green/35 bg-signal-green/5 px-3 py-2.5">
          <div className="font-mono text-sm font-black tracking-[0.12em] text-signal-green">
            NETWORK BALANCED — NO PRESSURE PEAK
          </div>
          <p className="mt-0.5 text-2xs leading-relaxed text-ink-dim">
            All 36 intersections are running independent adaptive cycles; no coordinated intervention
            is required right now.
          </p>
        </div>
      )}

      {/* ---------------- supporting detail, deliberately secondary --------------- */}
      <div className="mt-3 border-t border-edge-soft pt-2.5">
        <div className="text-3xs font-bold uppercase tracking-[0.16em] text-ink-faint">
          AI Observation
        </div>
        <p className="mt-0.5 text-2xs leading-relaxed text-ink-dim">“{snap.observation}”</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Tag tone={imbalanced ? 'bad' : 'ok'}>
            {imbalanced ? 'NETWORK IMBALANCE DETECTED' : 'NETWORK BALANCED'}
          </Tag>
          {h.worst.slice(0, 3).map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => onSelect(w.id)}
              className="rounded-md border border-edge-strong bg-base-750 px-2 py-1 font-mono text-3xs font-bold transition-colors hover:border-accent-cyan/60"
              style={{ color: LEVEL_HEX[w.level] }}
            >
              Node {pad2(w.id)} · Q{w.queue}
            </button>
          ))}
          {h.best.slice(0, 1).map((w) => (
            <span
              key={w.id}
              className="rounded-md border border-edge-strong bg-base-750 px-2 py-1 font-mono text-3xs font-bold text-level-low"
            >
              Node {pad2(w.id)} · Q{w.queue}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-0.5">
        <div className="col-span-2 text-3xs font-bold uppercase tracking-[0.14em] text-ink-faint">
          Monitored signals
        </div>
        <Row k="Vehicles" v={snap.vehicleCount} />
        <Row k="Max queue" v={snap.ai.maxQueue} />
        <Row k="Avg speed" v={`${snap.ai.avgSpeed.toFixed(1)} km/h`} />
        <Row k="Avg wait" v={`${snap.ai.avgWait.toFixed(0)} s`} />
        <Row k="Downstream gating" v={snap.spillbackNodes.length} tone={snap.spillbackNodes.length ? 'text-signal-red' : 'text-ink'} />
        <Row k="Sensor faults" v={snap.sensorFailures.length} tone={snap.sensorFailures.length ? 'text-signal-amber' : 'text-ink'} />
        <Row k="Comms faults" v={snap.commFailures.length} tone={snap.commFailures.length ? 'text-accent-violet' : 'text-ink'} />
        <Row k="Emergency" v={snap.emergencyActive ? 'ACTIVE' : 'NONE'} tone={snap.emergencyActive ? 'text-signal-red' : 'text-ink'} />
      </div>

      <div className="mt-3 text-3xs font-bold uppercase tracking-[0.16em] text-ink-faint">
        AI actions in progress <span className="text-ink-faint/60">· continuous</span>
      </div>
      <ol className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        {[
          'Extend green at congested approaches',
          'Coordinate neighbouring intersections',
          'Reduce unnecessary stops',
          'Reroute eligible vehicles',
          'Maintain emergency / pedestrian priority',
          'Continuously recalculate',
        ].map((x, i) => (
          <li key={x} className="flex items-start gap-1.5 text-2xs text-ink-dim">
            <span className="mt-[1px] font-mono font-black text-accent-cyan">{i + 1}.</span>
            <span>{x}</span>
          </li>
        ))}
      </ol>

      <div className="mt-3 text-3xs font-bold uppercase tracking-[0.16em] text-ink-faint">
        Live decisions (network-wide objective)
      </div>
      <div className="mt-1.5 space-y-1.5">
        {snap.decisions.slice(0, 6).map((d, i) => (
          <button
            key={`${d.nodeId}-${d.t}-${i}`}
            type="button"
            onClick={() => onSelect(d.nodeId)}
            className="w-full rounded-md border border-edge-soft bg-base-750/70 px-2.5 py-1.5 text-left transition-colors hover:border-accent-cyan/50"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-2xs font-black text-ink">NODE {pad2(d.nodeId)}</span>
              <Tag tone={ACTION_TONE[d.action] ?? 'idle'}>{d.action}</Tag>
              {d.deltaSec !== 0 && (
                <span
                  className={`font-mono text-2xs font-black ${d.deltaSec > 0 ? 'text-signal-green' : 'text-signal-amber'}`}
                >
                  {d.deltaSec > 0 ? '+' : ''}
                  {d.deltaSec}s
                </span>
              )}
              <span className="ml-auto font-mono text-3xs text-ink-faint">
                conf {(d.confidence * 100).toFixed(0)}%
              </span>
            </div>
            <div className="text-2xs leading-snug text-ink-faint">{d.reason}</div>
          </button>
        ))}
        {!snap.decisions.length && (
          <p className="text-2xs text-ink-faint">Sensing… no adaptive intervention required yet.</p>
        )}
      </div>

      <div className="mt-3 rounded-md border border-accent-cyan/25 bg-accent-cyan/5 px-2.5 py-2">
        <div className="text-3xs font-bold uppercase tracking-[0.16em] text-accent-cyan">
          Network-wide objective
        </div>
        <p className="text-2xs leading-relaxed text-ink-dim">
          MINIMISE total waiting time + queue length + travel time + congestion imbalance across all 36
          nodes, SUBJECT TO signal safety, emergency priority, pedestrian safety and network throughput.
        </p>
      </div>
    </Panel>
  )
}

/* --------------------- COORDINATION + GREEN WAVE -------------------- */

export function Coordination({ snap, onSelect }: { snap: Snapshot; onSelect: (id: number) => void }) {
  const c = snap.coordination
  return (
    <Panel
      title="Neighbourhood Coordination / Green Wave"
      accent="green"
      right={
        <Tag tone={snap.corridors.some((x) => x.active) ? 'ok' : 'idle'}>
          {snap.corridors.filter((x) => x.active).length} ACTIVE
        </Tag>
      }
    >
      {c ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onSelect(c.node)}
              className="rounded-md border px-2.5 py-1.5 font-mono text-2xs font-black transition-colors hover:brightness-125"
              style={{ borderColor: `${LEVEL_HEX[c.level]}66`, background: `${LEVEL_HEX[c.level]}14`, color: LEVEL_HEX[c.level] }}
            >
              NODE {pad2(c.node)} · {c.level} · Q{c.queue}
            </button>
            <span className="text-3xs uppercase tracking-[0.14em] text-ink-faint">is the pressure peak</span>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {c.neighbors.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => onSelect(n.id)}
                className="rounded-md border px-1 py-1.5 text-center transition-colors hover:brightness-125"
                style={{ borderColor: `${LEVEL_HEX[n.level]}55`, background: `${LEVEL_HEX[n.level]}10` }}
              >
                <div className="font-mono text-2xs font-black text-ink">{pad2(n.id)}</div>
                <div className="font-mono text-3xs font-bold" style={{ color: LEVEL_HEX[n.level] }}>
                  {n.level}
                </div>
                <div className="font-mono text-2xs font-bold text-ink-dim">{n.queue}</div>
              </button>
            ))}
          </div>
          <div className="mt-2 rounded-md border border-signal-green/35 bg-signal-green/10 px-2.5 py-1.5 font-mono text-2xs font-black tracking-[0.1em] text-signal-green">
            AI ACTION: {c.action}
          </div>
        </>
      ) : (
        <p className="text-2xs text-ink-faint">
          No dominant pressure peak — intersections are running independent adaptive cycles.
        </p>
      )}

      <div className="mt-2.5 space-y-1.5">
        {snap.corridors.map((c2) => (
          <div
            key={c2.name}
            className={`rounded-md border px-2.5 py-1.5 ${
              c2.active ? 'border-signal-green/45 bg-signal-green/10' : 'border-edge-soft bg-base-750/60'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-2xs font-black text-ink">{c2.name}</span>
              <span className="font-mono text-2xs text-ink-faint">
                {c2.nodes.map(pad2).join(' → ')}
              </span>
              <Tag tone={c2.active ? 'ok' : 'idle'} className="ml-auto">
                {c2.active ? 'GREEN WAVE ACTIVE' : 'STANDBY'}
              </Tag>
            </div>
            {c2.active && (
              <div className="mt-1">
                <Bar value={c2.progression} color="#22c55e" />
                <div className="mt-0.5 font-mono text-3xs text-ink-faint">
                  progression alignment {(c2.progression * 100).toFixed(0)}%
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {snap.spillbackNodes.length > 0 && (
        <div className="mt-2 rounded border border-signal-red/45 bg-signal-red/10 px-2 py-1.5">
          <div className="font-mono text-2xs font-black tracking-[0.12em] text-signal-red">
            QUEUE SPILLBACK PROTECTION ACTIVE
          </div>
          <p className="text-3xs text-ink-dim">
            Downstream segments saturated at node(s){' '}
            {snap.spillbackNodes.slice(0, 8).map(pad2).join(', ')} — AI is preventing additional inflow
            instead of blindly extending green.
          </p>
        </div>
      )}

      {snap.reroute && (
        <div className="mt-2 rounded border border-accent-cyan/40 bg-accent-cyan/10 px-2 py-1.5">
          <div className="font-mono text-2xs font-black tracking-[0.12em] text-accent-cyan">
            DYNAMIC REROUTING
          </div>
          <div className="mt-0.5 font-mono text-3xs text-ink-dim">
            CONGESTED: {snap.reroute.congested.map(pad2).join(' → ')}
          </div>
          <div className="font-mono text-3xs text-signal-green">
            ALTERNATIVE: {snap.reroute.alternative.map(pad2).join(' → ')}
          </div>
          <div className="mt-0.5 font-mono text-2xs font-black text-ink">
            REROUTED VEHICLES: {snap.reroutedTotal}
          </div>
        </div>
      )}
    </Panel>
  )
}

/* ---------------------------- EMERGENCY ----------------------------- */

const EM_STAGES = [
  'EMERGENCY DETECTED',
  'PRIORITY ROUTE CALCULATED',
  'INTERSECTIONS PREPARED',
  'GREEN CORRIDOR ACTIVE',
  'UNIT PASSED',
  'NORMAL CONTROL RESTORED',
]

export function EmergencyPanel({ snap }: { snap: Snapshot }) {
  return (
    <Panel
      title="Emergency Priority"
      accent="red"
      right={
        <Tag tone={snap.emergencyActive ? 'bad' : 'idle'}>
          {snap.emergencyActive ? 'EMERGENCY CORRIDOR · PREEMPTION LIVE' : 'STANDBY'}
        </Tag>
      }
    >
      {snap.emergencies.length === 0 && (
        <p className="text-2xs leading-relaxed text-ink-faint">
          No emergency units dispatched. Use the 🚑 Ambulance operator button, or scenario 10 / 11, to
          arm a priority corridor.
        </p>
      )}
      <div className="space-y-2">
        {snap.emergencies.map((e) => {
          const stageIdx = e.done ? 5 : e.progress > 0 ? 3 : e.stage.startsWith('ARMED') ? 0 : 1
          return (
            <div
              key={e.tag}
              className={`rounded border px-2 py-1.5 ${
                e.done ? 'border-edge-soft bg-base-750/60' : 'border-signal-red/45 bg-signal-red/10'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">{e.kind === 'ambulance' ? '🚑' : '🚒'}</span>
                <span className="font-mono text-2xs font-black text-ink">{e.tag}</span>
                <Tag tone={e.done ? 'ok' : 'bad'} className="ml-auto">
                  {e.done ? 'CLEARED' : 'PRIORITY'}
                </Tag>
              </div>
              <div className="mt-1 font-mono text-2xs font-bold text-ink-dim">
                ROUTE {e.route.map(pad2).join(' → ')} · AT {pad2(e.atNode)} · ETA{' '}
                {e.done ? 0 : Math.round(e.eta)}s
              </div>
              <div className="mt-1.5"><Bar value={e.progress} color="#ef4444" /></div>
              <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5">
                {EM_STAGES.map((s, i) => (
                  <span
                    key={s}
                    className={`font-mono text-3xs font-bold tracking-[0.06em] ${
                      i <= stageIdx ? 'text-signal-red' : 'text-ink-faint/50'
                    }`}
                  >
                    {i > 0 && '→ '}
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-2.5 rounded-md border border-edge-soft bg-base-750/60 px-2.5 py-2 text-2xs leading-relaxed text-ink-faint">
        <span className="font-black uppercase tracking-[0.14em] text-signal-red">Safety: </span>
        preemption never bypasses the signal sequence — the controller still advances GREEN → YELLOW →
        ALL RED → NEXT GREEN clockwise until the priority approach is reached.
      </p>
    </Panel>
  )
}

/* ------------------------ SENSE → … → OPTIMIZE ---------------------- */

export function LoopPanel({ snap }: { snap: Snapshot }) {
  return (
    <Panel
      title="How Our Solution Works"
      accent="violet"
      right={
        <Tag tone="live">
          STAGE {String(snap.loopStage + 1).padStart(2, '0')} · {LOOP_STAGES[snap.loopStage]?.key}
        </Tag>
      }
    >
      {/* the closed loop, top to bottom — each step is highlighted as it runs */}
      <ol className="space-y-1.5">
        {LOOP_STAGES.map((s, i) => {
          const active = snap.loopStage === i && snap.running
          return (
            <li key={s.key}>
              <div
                className={`relative flex items-start gap-3 rounded-md border px-3 py-2.5 transition-colors ${
                  active
                    ? 'border-accent-violet/70 bg-accent-violet/15'
                    : 'border-edge-soft bg-base-750/60'
                }`}
              >
                <span
                  className={`grid h-9 w-9 shrink-0 place-content-center rounded-md border font-mono text-sm font-black ${
                    active
                      ? 'border-accent-violet bg-accent-violet/20 text-accent-violet'
                      : 'border-edge-strong bg-base-700 text-ink-faint'
                  }`}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0">
                  <div
                    className={`font-mono text-sm font-black tracking-[0.14em] ${
                      active ? 'text-accent-violet' : 'text-ink'
                    }`}
                  >
                    {s.key}
                  </div>
                  <p className="text-2xs leading-relaxed text-ink-dim">{s.text}</p>
                </div>
                {active && (
                  <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-accent-violet animate-pulse-soft" />
                )}
              </div>
              {i < LOOP_STAGES.length - 1 && (
                <div className="py-[2px] text-center font-mono text-2xs font-black leading-none text-ink-faint">
                  ↓
                </div>
              )}
            </li>
          )
        })}
      </ol>
      <p className="mt-3 rounded-md border border-accent-violet/30 bg-accent-violet/5 px-3 py-2 text-center font-mono text-2xs font-black tracking-[0.18em] text-ink-dim">
        SENSE → ANALYZE → DECIDE → ACT → MEASURE → OPTIMIZE
      </p>
    </Panel>
  )
}
