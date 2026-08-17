import { levelOf } from '../sim/engine'
import { pad2 } from '../sim/network'
import { LEVEL_HEX, Panel, Tag } from './ui'
import type { Snapshot } from '../sim/types'

function MiniGrid({
  values,
  title,
  verdict,
  subtitle,
  tone,
}: {
  values: number[]
  title: string
  /** the one-glance takeaway: uneven/long vs balanced/shorter */
  verdict: string
  subtitle: string
  tone: 'bad' | 'ok'
}) {
  const crit = values.filter((v) => levelOf(v) === 'CRITICAL').length
  const high = values.filter((v) => levelOf(v) === 'HIGH').length
  const total = values.reduce((a, b) => a + b, 0)
  return (
    <div
      className={`rounded-lg border px-3 py-3 ${
        tone === 'bad' ? 'border-signal-red/40 bg-signal-red/5' : 'border-signal-green/40 bg-signal-green/5'
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className={`font-mono text-sm font-black tracking-[0.14em] ${
            tone === 'bad' ? 'text-signal-red' : 'text-signal-green'
          }`}
        >
          {title}
        </span>
        <Tag tone={tone === 'bad' ? 'bad' : 'ok'} className="ml-auto">
          {crit} CRIT · {high} HIGH
        </Tag>
        <div
          className={`w-full font-mono text-2xs font-black uppercase tracking-[0.18em] ${
            tone === 'bad' ? 'text-signal-red' : 'text-signal-green'
          }`}
        >
          {verdict}
        </div>
      </div>
      <div className="mx-auto grid max-w-[420px] grid-cols-6 gap-1">
        {values.map((v, i) => {
          const lv = levelOf(v)
          return (
            <div
              key={i}
              title={`Node ${pad2(i + 1)} — queue ${Math.round(v)}`}
              className="relative aspect-square rounded"
              style={{
                background: `${LEVEL_HEX[lv]}${lv === 'LOW' ? '22' : lv === 'MEDIUM' ? '55' : lv === 'HIGH' ? '99' : 'ee'}`,
                boxShadow: lv === 'CRITICAL' ? `0 0 10px ${LEVEL_HEX[lv]}88` : 'none',
              }}
            >
              <span className="absolute inset-x-0 top-[3px] text-center font-mono text-[8px] font-black text-white/45">
                {pad2(i + 1)}
              </span>
              <span
                className={`absolute inset-0 grid place-content-center pt-2 font-mono text-xs font-black ${
                  lv === 'LOW' ? 'text-ink-dim' : 'text-black/70'
                }`}
              >
                {Math.round(v) || ''}
              </span>
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-2xs uppercase tracking-[0.12em] text-ink-faint">{subtitle}</span>
        <span className="font-mono text-sm font-black text-ink">{Math.round(total)} veh queued</span>
      </div>
    </div>
  )
}

/** One side of the big BEFORE → AFTER headline. */
function QueueHeadline({
  kicker,
  value,
  tone,
}: {
  kicker: string
  value: number
  tone: 'bad' | 'ok'
}) {
  const bad = tone === 'bad'
  return (
    <div
      className={`rounded-lg border px-3 py-2.5 text-center ${
        bad ? 'border-signal-red/50 bg-signal-red/10' : 'border-signal-green/50 bg-signal-green/10'
      }`}
    >
      <div
        className={`font-mono text-2xs font-black uppercase tracking-[0.2em] ${
          bad ? 'text-signal-red' : 'text-signal-green'
        }`}
      >
        {kicker}
      </div>
      <div className="mt-1 text-3xs font-bold uppercase tracking-[0.16em] text-ink-faint">
        Network Queue
      </div>
      <div
        className={`font-mono text-4xl font-black leading-none tracking-tight ${
          bad ? 'text-signal-red' : 'text-signal-green'
        }`}
      >
        {Math.round(value)}
      </div>
      <div className="mt-0.5 text-3xs uppercase tracking-[0.14em] text-ink-faint">vehicles</div>
    </div>
  )
}

export function BeforeAfter({ snap }: { snap: Snapshot }) {
  const before = snap.nodes.map((n) => n.shadowQueueTotal)
  const after = snap.nodes.map((n) => n.totalQueue)
  const beforeTotal = before.reduce((a, b) => a + b, 0)
  const afterTotal = after.reduce((a, b) => a + b, 0)
  const reduction = beforeTotal > 0 ? (1 - afterTotal / beforeTotal) * 100 : 0

  return (
    <Panel
      title="Before vs After — Same City, Same Demand"
      accent="amber"
      right={
        <Tag tone={reduction > 0 ? 'ok' : 'warn'}>
          NETWORK QUEUE {reduction >= 0 ? '↓' : '↑'} {Math.abs(reduction).toFixed(1)}%
        </Tag>
      }
    >
      {/* ---- the headline result: BEFORE → AFTER → REDUCTION, readable at a glance ---- */}
      <div className="mb-3 grid grid-cols-1 items-center gap-2 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1.1fr)]">
        <QueueHeadline kicker="Before — Fixed Time" value={beforeTotal} tone="bad" />

        <div
          aria-hidden
          className="grid place-content-center font-mono text-xl font-black leading-none text-ink-faint"
        >
          <span className="hidden lg:inline">→</span>
          <span className="lg:hidden">↓</span>
        </div>

        <QueueHeadline kicker="After — Smart AI" value={afterTotal} tone="ok" />

        <div
          aria-hidden
          className="grid place-content-center font-mono text-xl font-black leading-none text-ink-faint"
        >
          <span className="hidden lg:inline">→</span>
          <span className="lg:hidden">↓</span>
        </div>

        <div className="rounded-lg border border-signal-green/60 bg-signal-green/15 px-3 py-2.5 text-center">
          <div className="font-mono text-2xs font-black uppercase tracking-[0.2em] text-signal-green">
            Result
          </div>
          <div className="font-mono text-4xl font-black leading-none tracking-tight text-signal-green">
            {reduction >= 0 ? '↓' : '↑'} {Math.abs(reduction).toFixed(1)}%
          </div>
          <div className="mt-0.5 text-3xs font-bold uppercase tracking-[0.16em] text-ink-faint">
            network queue {reduction >= 0 ? 'reduction' : 'increase'}
          </div>
          <div className="mt-1.5 border-t border-signal-green/25 pt-1.5">
            <div className="text-3xs font-bold uppercase tracking-[0.16em] text-ink-faint">
              Fairness / Gini
            </div>
            <div className="font-mono text-base font-black leading-tight text-ink">
              {snap.fixed.gini.toFixed(2)}{' '}
              <span className="text-ink-faint">→</span>{' '}
              <span className="text-signal-green">{snap.ai.gini.toFixed(2)}</span>
            </div>
            <div className="text-3xs text-ink-faint">lower = more evenly distributed traffic</div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <MiniGrid
          values={before}
          title="BEFORE — FIXED TIME"
          verdict="Uneven · Long Queues"
          subtitle="load piles onto a few nodes · no coordination · no rerouting"
          tone="bad"
        />
        <MiniGrid
          values={after}
          title="AFTER — SMART AI"
          verdict="Balanced · Shorter Queues"
          subtitle="green time follows demand · corridors coordinated · traffic spread evenly"
          tone="ok"
        />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 text-2xs leading-relaxed text-ink-faint sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <span className="font-bold text-signal-red">Fixed-time:</span> equal green everywhere, no
          coordination, no rerouting — demand piles onto the core.
        </div>
        <div>
          <span className="font-bold text-signal-green">Smart AI:</span> green time follows queue
          pressure and corridors run as green waves.
        </div>
        <div>
          <span className="font-bold text-accent-cyan">Rerouting:</span> {snap.reroutedTotal} vehicles
          moved onto spare capacity instead of joining the jam.
        </div>
        <div>
          <span className="font-bold text-accent-violet">Fairness:</span> Gini {snap.fixed.gini.toFixed(2)}{' '}
          → {snap.ai.gini.toFixed(2)} — lower = more evenly distributed traffic across the 36 nodes.
        </div>
      </div>
    </Panel>
  )
}
