import { levelOf } from '../sim/engine'
import { pad2 } from '../sim/network'
import { LEVEL_HEX, Panel, Tag } from './ui'
import type { Snapshot } from '../sim/types'

function MiniGrid({
  values,
  title,
  subtitle,
  tone,
}: {
  values: number[]
  title: string
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

export function BeforeAfter({ snap }: { snap: Snapshot }) {
  const before = snap.nodes.map((n) => n.shadowQueueTotal)
  const after = snap.nodes.map((n) => n.totalQueue)
  const reduction =
    before.reduce((a, b) => a + b, 0) > 0
      ? (1 - after.reduce((a, b) => a + b, 0) / before.reduce((a, b) => a + b, 0)) * 100
      : 0

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
      <div className="grid gap-3 lg:grid-cols-2">
        <MiniGrid
          values={before}
          title="BEFORE — FIXED TIME"
          subtitle="higher congestion · longer queues · uneven traffic"
          tone="bad"
        />
        <MiniGrid
          values={after}
          title="AFTER — SMART AI"
          subtitle="lower congestion · shorter queues · smoother flow"
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
          → {snap.ai.gini.toFixed(2)} — load spread more evenly across the 36 nodes.
        </div>
      </div>
    </Panel>
  )
}
