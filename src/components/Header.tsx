import { Tag } from './ui'
import type { Snapshot } from '../sim/types'

const fmtClock = (t: number) => {
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** In-page navigation so the presenter can jump straight to any section. */
const NAV: [string, string][] = [
  ['how', 'HOW IT WORKS'],
  ['live', '01 LIVE'],
  ['analysis', '02 AI'],
  ['benchmark', '03 BENCHMARK'],
  ['before-after', '04 BEFORE/AFTER'],
  ['feed', '05 FEED'],
]

export function Header({ snap }: { snap: Snapshot }) {
  return (
    <header className="sticky top-0 z-30 border-b border-edge bg-base-850/95 backdrop-blur supports-[backdrop-filter]:bg-base-850/85">
      <div className="mx-auto flex w-full max-w-[2100px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="relative grid h-10 w-10 place-content-center rounded-md border border-accent-cyan/40 bg-accent-cyan/10">
            <div className="flex flex-col gap-[3px]">
              <span className="h-[6px] w-[6px] rounded-full bg-signal-red" />
              <span className="h-[6px] w-[6px] rounded-full bg-signal-amber" />
              <span className="h-[6px] w-[6px] rounded-full bg-signal-green animate-pulse-soft" />
            </div>
          </div>
          <div>
            <h1 className="text-base font-black uppercase tracking-[0.2em] text-ink">
              AI City Traffic Control Center
            </h1>
            <p className="text-3xs font-semibold uppercase tracking-[0.2em] text-ink-faint">
              City-Wide Real-Time Adaptive Traffic Management System · 36 Signalized Intersections
            </p>
          </div>
        </div>

        <nav className="hidden items-center gap-1 lg:flex">
          {NAV.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="rounded-md border border-edge-strong bg-base-800 px-2.5 py-1.5 font-mono text-3xs font-bold uppercase tracking-[0.12em] text-ink-faint transition-colors hover:border-accent-cyan/60 hover:text-accent-cyan"
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Tag tone={snap.running ? 'bad' : 'idle'}>
            <span
              className={`h-1.5 w-1.5 rounded-full ${snap.running ? 'bg-signal-red animate-pulse-soft' : 'bg-ink-faint'}`}
            />
            {snap.running ? 'LIVE' : 'PAUSED'}
          </Tag>
          <Tag tone={snap.aiMode ? 'ok' : 'bad'}>
            {snap.aiMode ? 'AUTO AI · ADAPTIVE ONLINE' : 'FIXED-TIME · AI DISABLED'}
          </Tag>
          <Tag tone={snap.safetyOk ? 'ok' : 'bad'}>
            SAFETY: {snap.safetyOk ? 'SAFE' : `FAULT ×${snap.faultCount}`}
          </Tag>
          <Tag tone="info">T {fmtClock(snap.t)}</Tag>
          <Tag tone="live">{snap.vehicleCount} VEH</Tag>
        </div>
      </div>
    </header>
  )
}
