import { pad2 } from '../sim/network'
import { ALL_RED_DUR, YELLOW_DUR } from '../sim/engine'
import { DIR_LABEL, PHASE_ORDER } from '../sim/types'
import type { Dir, NodeSnapshot, Snapshot } from '../sim/types'
import { Bar, LEVEL_HEX, Panel, Row, Tag } from './ui'

const CYCLE: { label: string; kind: 'G' | 'Y' | 'R'; dir?: Dir }[] = [
  { label: 'N GREEN', kind: 'G', dir: 'N' },
  { label: 'N YELLOW', kind: 'Y', dir: 'N' },
  { label: 'ALL RED', kind: 'R' },
  { label: 'E GREEN', kind: 'G', dir: 'E' },
  { label: 'E YELLOW', kind: 'Y', dir: 'E' },
  { label: 'ALL RED', kind: 'R' },
  { label: 'S GREEN', kind: 'G', dir: 'S' },
  { label: 'S YELLOW', kind: 'Y', dir: 'S' },
  { label: 'ALL RED', kind: 'R' },
  { label: 'W GREEN', kind: 'G', dir: 'W' },
  { label: 'W YELLOW', kind: 'Y', dir: 'W' },
  { label: 'ALL RED', kind: 'R' },
]

function stepIndex(n: NodeSnapshot): number {
  const base = n.phaseIdx * 3
  return n.state === 'GREEN' ? base : n.state === 'YELLOW' ? base + 1 : base + 2
}

export function Inspector({ snap, selected }: { snap: Snapshot; selected: number | null }) {
  const n = selected ? snap.nodes.find((x) => x.id === selected) : undefined
  if (!n) {
    return (
      <Panel title="Intersection Inspector" accent="cyan">
        <p className="text-2xs leading-relaxed text-ink-faint">
          Click any of the 36 intersections on the city map to inspect its live phase, queues, sensors
          and AI decision. Double-click a node to zoom straight into it.
        </p>
      </Panel>
    )
  }

  const dur = n.state === 'GREEN' ? n.greenDur : n.state === 'YELLOW' ? YELLOW_DUR : ALL_RED_DUR
  const active = stepIndex(n)
  const delta = n.greenDur - n.baseGreen

  return (
    <Panel
      title={`Intersection Inspector — Node ${pad2(n.id)}`}
      accent="cyan"
      right={
        <>
          <Tag tone={n.fault ? 'bad' : 'ok'}>{n.fault ? 'SAFETY FAULT' : 'SAFE'}</Tag>
          <Tag tone={n.level === 'LOW' ? 'ok' : n.level === 'CRITICAL' ? 'bad' : 'warn'}>{n.level}</Tag>
        </>
      }
    >
      {/* the headline: which phase is live and how long is left */}
      <div
        className={`mb-2.5 flex items-center gap-3 rounded-md border px-3 py-2.5 ${
          n.state === 'GREEN'
            ? 'border-signal-green/50 bg-signal-green/10'
            : n.state === 'YELLOW'
              ? 'border-signal-amber/50 bg-signal-amber/10'
              : 'border-signal-red/50 bg-signal-red/10'
        }`}
      >
        <span
          className={`grid h-11 w-11 shrink-0 place-content-center rounded-md font-mono text-lg font-black ${
            n.state === 'GREEN'
              ? 'bg-signal-green/20 text-signal-green'
              : n.state === 'YELLOW'
                ? 'bg-signal-amber/20 text-signal-amber'
                : 'bg-signal-red/20 text-signal-red'
          }`}
        >
          {pad2(n.id)}
        </span>
        <div className="min-w-0">
          <div className="font-mono text-sm font-black leading-tight text-ink">
            {DIR_LABEL[n.phase]} {n.state.replace('_', ' ')}
          </div>
          <div className="font-mono text-2xs font-bold text-ink-dim">
            {Math.max(0, dur - n.timer).toFixed(1)}s left · next {DIR_LABEL[n.nextPhase]}
          </div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-3xs uppercase tracking-[0.14em] text-ink-faint">Queue</div>
          <div
            className={`font-mono text-2xl font-black leading-none ${
              n.totalQueue > 17 ? 'text-signal-red' : 'text-ink'
            }`}
          >
            {n.totalQueue}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        <Row
          k="Current phase"
          v={`${DIR_LABEL[n.phase]} ${n.state.replace('_', ' ')}`}
          tone={n.state === 'GREEN' ? 'text-signal-green' : n.state === 'YELLOW' ? 'text-signal-amber' : 'text-signal-red'}
        />
        <Row k="Next phase" v={DIR_LABEL[n.nextPhase]} />
        <Row k="Phase timer" v={`${n.timer.toFixed(1)} / ${dur.toFixed(1)} s`} />
        <Row k="Vehicle count" v={n.vehCount} />
        <Row k="Queue length" v={n.totalQueue} tone={n.totalQueue > 17 ? 'text-signal-red' : 'text-ink'} />
        <Row k="Average speed" v={`${n.avgSpeed.toFixed(1)} km/h`} />
        <Row k="Congestion" v={`${(n.congestion * 100).toFixed(0)}%`} />
        <Row k="Green extended" v={`${n.extendedTotal}s total`} />
        <Row k="Sensor status" v={n.sensorOk ? 'ONLINE' : 'FAULT'} tone={n.sensorOk ? 'text-signal-green' : 'text-signal-amber'} />
        <Row k="Comms status" v={n.commOk ? 'LINKED' : 'ISOLATED'} tone={n.commOk ? 'text-signal-green' : 'text-accent-violet'} />
      </div>

      <div className="mt-2">
        <Bar value={Math.min(1, n.timer / dur)} color={n.state === 'GREEN' ? '#22c55e' : n.state === 'YELLOW' ? '#f59e0b' : '#ef4444'} />
      </div>

      <div className="mt-2.5 grid grid-cols-4 gap-1.5">
        {PHASE_ORDER.map((d) => {
          const isGreen = n.phase === d && n.state === 'GREEN'
          const isYellow = n.phase === d && n.state === 'YELLOW'
          return (
            <div
              key={d}
              className={`rounded-md border px-1 py-1.5 text-center ${
                isGreen
                  ? 'border-signal-green/60 bg-signal-green/15'
                  : isYellow
                    ? 'border-signal-amber/60 bg-signal-amber/15'
                    : 'border-edge-soft bg-base-750/60'
              }`}
            >
              <div className="text-3xs font-black tracking-[0.1em] text-ink-dim">{DIR_LABEL[d]}</div>
              <div
                className={`font-mono text-xl font-black leading-tight ${
                  isGreen ? 'text-signal-green' : isYellow ? 'text-signal-amber' : 'text-signal-red'
                }`}
              >
                {n.queue[d]}
              </div>
              <div className="text-3xs text-ink-faint">
                {isGreen ? `${n.greenDur}s GRN` : isYellow ? 'YEL' : 'RED'}
              </div>
            </div>
          )
        })}
      </div>

      {/* before / after adaptive timing for this node */}
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <div className="rounded border border-edge-soft bg-base-750/60 px-2 py-1">
          <div className="text-3xs uppercase tracking-[0.12em] text-ink-faint">Before AI</div>
          <div className="font-mono text-sm font-black text-ink-dim">{n.baseGreen}s</div>
          <div className="text-3xs text-ink-faint">all approaches</div>
        </div>
        <div className="rounded border border-accent-cyan/40 bg-accent-cyan/10 px-2 py-1">
          <div className="text-3xs uppercase tracking-[0.12em] text-accent-cyan">AI decision</div>
          <div className="font-mono text-sm font-black text-accent-cyan">
            {delta > 0 ? '+' : ''}
            {delta}s
          </div>
          <div className="text-3xs text-ink-faint">{n.decision?.action ?? 'HOLD'}</div>
        </div>
        <div className="rounded border border-signal-green/40 bg-signal-green/10 px-2 py-1">
          <div className="text-3xs uppercase tracking-[0.12em] text-signal-green">After AI</div>
          <div className="font-mono text-sm font-black text-signal-green">{n.greenDur}s</div>
          <div className="text-3xs text-ink-faint">{DIR_LABEL[n.phase]}</div>
        </div>
      </div>

      {n.decision && (
        <p className="mt-1.5 rounded border border-edge-soft bg-base-750/60 px-2 py-1 text-3xs leading-relaxed text-ink-dim">
          <span className="font-bold uppercase tracking-[0.12em] text-accent-cyan">Reason: </span>
          {n.decision.reason}
        </p>
      )}

      {(n.spillback || n.preempt || n.pedestrian || !n.sensorOk || !n.commOk) && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {n.preempt && <Tag tone="bad">EMERGENCY PREEMPT → {n.preempt}</Tag>}
          {n.spillback && <Tag tone="warn">SPILLBACK GATING</Tag>}
          {n.pedestrian && <Tag tone="info">PEDESTRIAN PHASE</Tag>}
          {!n.sensorOk && <Tag tone="warn">SENSOR FALLBACK</Tag>}
          {!n.commOk && <Tag tone="live">LOCAL SAFE MODE</Tag>}
          {n.coordinated && <Tag tone="ok">GREEN WAVE MEMBER</Tag>}
        </div>
      )}

      {n.fault && (
        <div className="mt-1.5 rounded border border-signal-red/60 bg-signal-red/15 px-2 py-1 font-mono text-2xs font-black tracking-[0.12em] text-signal-red animate-blink-alarm">
          SIGNAL SAFETY FAULT — {n.faultMsg} — FORCED ALL RED
        </div>
      )}

      <div className="mt-2 text-3xs font-bold uppercase tracking-[0.14em] text-ink-faint">
        Stateflow cycle (enforced)
      </div>
      <div className="mt-1 grid grid-cols-3 gap-1">
        {CYCLE.map((c, i) => {
          const on = i === active && !n.fault
          const color =
            c.kind === 'G' ? '#22c55e' : c.kind === 'Y' ? '#f59e0b' : '#ef4444'
          return (
            <div
              key={`${c.label}-${i}`}
              className="rounded border px-1 py-[3px] text-center font-mono text-3xs font-bold tracking-[0.06em]"
              style={{
                borderColor: on ? color : '#1d2637',
                background: on ? `${color}22` : 'rgba(16,22,35,0.6)',
                color: on ? color : '#66738b',
              }}
            >
              {c.label}
            </div>
          )
        })}
      </div>
      <p className="mt-1 text-3xs text-ink-faint">
        Transitions are clockwise only (N → E → S → W → N) and always pass through YELLOW and ALL RED.
        Any violation forces ALL RED and raises SIGNAL SAFETY FAULT.
      </p>

      <div className="mt-2 rounded border border-signal-red/25 bg-signal-red/5 px-2 py-1">
        <div className="text-3xs uppercase tracking-[0.12em] text-ink-faint">
          Fixed-time baseline at this node
        </div>
        <div className="font-mono text-2xs font-bold" style={{ color: LEVEL_HEX.CRITICAL }}>
          modelled queue {n.shadowQueueTotal} vs live AI queue {n.totalQueue}
        </div>
      </div>
    </Panel>
  )
}
