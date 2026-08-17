import type { Snapshot } from '../sim/types'

/**
 * PROBLEM -> AI SOLUTION -> RESULT.
 *
 * A five-second read that sits directly under the header, so an evaluator
 * understands what the dashboard below is proving before they look at it.
 * The headline copy is fixed; the small metric strip under each card is read
 * live out of the running simulation.
 */
export function SolutionStrip({ snap }: { snap: Snapshot }) {
  const h = snap.health
  const elevated = h.critical + h.high

  const beforeQ = snap.nodes.reduce((a, n) => a + n.shadowQueueTotal, 0)
  const afterQ = snap.nodes.reduce((a, n) => a + n.totalQueue, 0)
  const queueDrop = beforeQ > 0 ? (1 - afterQ / beforeQ) * 100 : 0
  const waitDrop =
    snap.fixed.avgWait > 0 ? (1 - snap.ai.avgWait / snap.fixed.avgWait) * 100 : 0

  const cards = [
    {
      step: '01',
      kicker: 'Problem',
      title: 'Uneven Traffic Distribution',
      body: 'Some intersections become overloaded while nearby network capacity remains unused.',
      metrics: [
        ['Elevated load', `${elevated} / 36 nodes`],
        ['Network imbalance', `${(h.gini * 100).toFixed(0)}%`],
      ],
      ring: 'border-signal-red/45 bg-signal-red/[0.07]',
      ink: 'text-signal-red',
      chip: 'border-signal-red/50 bg-signal-red/15 text-signal-red',
    },
    {
      step: '02',
      kicker: 'AI Solution',
      title: 'Adaptive Network Control',
      body: 'AI continuously monitors 36 intersections and adjusts signal timing, coordinates neighbouring signals and reroutes eligible vehicles.',
      metrics: [
        ['Live decisions', `${snap.decisions.length} active`],
        ['Vehicles rerouted', `${snap.reroutedTotal}`],
      ],
      ring: 'border-accent-cyan/45 bg-accent-cyan/[0.07]',
      ink: 'text-accent-cyan',
      chip: 'border-accent-cyan/50 bg-accent-cyan/15 text-accent-cyan',
    },
    {
      step: '03',
      kicker: 'Result',
      title: 'Balanced Traffic Flow',
      body: 'Lower queues · lower waiting time · higher throughput · better fairness.',
      metrics: [
        ['Network queue', `↓ ${Math.max(0, queueDrop).toFixed(0)}%`],
        ['Waiting time', `↓ ${Math.max(0, waitDrop).toFixed(0)}%`],
      ],
      ring: 'border-signal-green/45 bg-signal-green/[0.07]',
      ink: 'text-signal-green',
      chip: 'border-signal-green/50 bg-signal-green/15 text-signal-green',
    },
  ]

  return (
    <section
      id="how"
      className="anchor-offset rounded-lg border border-edge bg-base-850 px-3.5 py-2.5 shadow-panel"
    >
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="h-4 w-[3px] shrink-0 self-center rounded-full bg-accent-cyan" />
        <h2 className="text-sm font-black uppercase tracking-[0.18em] text-ink">
          How Our System Solves the Traffic Problem
        </h2>
        <p className="text-3xs font-bold uppercase tracking-[0.18em] text-ink-faint">
          problem → ai solution → result
        </p>
      </div>

      <div className="grid grid-cols-1 items-stretch gap-2 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
        {cards.map((c, i) => (
          <div key={c.step} className="contents">
            <div className={`flex flex-col rounded-lg border px-3 py-2 ${c.ring}`}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span
                  className={`grid h-5 w-5 shrink-0 place-content-center rounded border font-mono text-3xs font-black ${c.chip}`}
                >
                  {c.step}
                </span>
                <span
                  className={`font-mono text-3xs font-black uppercase tracking-[0.22em] ${c.ink}`}
                >
                  {c.kicker}
                </span>
                <span className="font-mono text-sm font-black uppercase leading-tight tracking-[0.06em] text-ink">
                  {c.title}
                </span>
              </div>

              <p className="mt-1 text-2xs leading-snug text-ink-dim">{c.body}</p>

              <div className="mt-auto flex flex-wrap gap-x-4 gap-y-0.5 pt-1.5">
                {c.metrics.map(([k, v]) => (
                  <span key={k} className="flex items-baseline gap-1.5">
                    <span className="text-3xs font-bold uppercase tracking-[0.12em] text-ink-faint">
                      {k}
                    </span>
                    <span className={`font-mono text-2xs font-black ${c.ink}`}>{v}</span>
                  </span>
                ))}
              </div>
            </div>

            {i < cards.length - 1 && (
              <div
                aria-hidden
                className="grid place-content-center font-mono text-lg font-black leading-none text-ink-faint"
              >
                <span className="hidden lg:inline">→</span>
                <span className="lg:hidden">↓</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
