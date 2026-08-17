import type { ReactNode } from 'react'
import type { Level } from '../sim/types'

export const LEVEL_CLASS: Record<Level, string> = {
  LOW: 'text-level-low border-level-low/40 bg-level-low/10',
  MEDIUM: 'text-level-med border-level-med/40 bg-level-med/10',
  HIGH: 'text-level-high border-level-high/40 bg-level-high/10',
  CRITICAL: 'text-level-crit border-level-crit/50 bg-level-crit/10',
}

export const LEVEL_HEX: Record<Level, string> = {
  LOW: '#22c55e',
  MEDIUM: '#eab308',
  HIGH: '#f97316',
  CRITICAL: '#ef4444',
}

export function Panel({
  title,
  right,
  children,
  className = '',
  bodyClassName = '',
  accent = 'cyan',
  /** only set this when the panel really must scroll internally (e.g. the event feed) */
  scroll = false,
}: {
  title: string
  right?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  accent?: 'cyan' | 'green' | 'red' | 'violet' | 'amber'
  scroll?: boolean
}) {
  const bar = {
    cyan: 'bg-accent-cyan',
    green: 'bg-signal-green',
    red: 'bg-signal-red',
    violet: 'bg-accent-violet',
    amber: 'bg-signal-amber',
  }[accent]
  return (
    <section
      className={`flex min-h-0 flex-col rounded-lg border border-edge bg-base-800/80 shadow-panel ${className}`}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-edge-soft px-3.5 py-2.5">
        <span className={`h-4 w-[3px] rounded-full ${bar}`} />
        <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-ink-dim">{title}</h2>
        <div className="ml-auto flex flex-wrap items-center gap-2">{right}</div>
      </header>
      <div
        className={`min-h-0 flex-1 p-3.5 ${scroll ? 'overflow-auto' : ''} ${bodyClassName}`}
      >
        {children}
      </div>
    </section>
  )
}

export function Tag({
  children,
  tone = 'idle',
  className = '',
}: {
  children: ReactNode
  tone?: 'idle' | 'ok' | 'warn' | 'bad' | 'info' | 'live'
  className?: string
}) {
  const tones = {
    idle: 'border-edge-strong bg-base-700 text-ink-faint',
    ok: 'border-signal-green/40 bg-signal-green/10 text-signal-green',
    warn: 'border-signal-amber/40 bg-signal-amber/10 text-signal-amber',
    bad: 'border-signal-red/50 bg-signal-red/10 text-signal-red',
    info: 'border-accent-cyan/40 bg-accent-cyan/10 text-accent-cyan',
    live: 'border-accent-violet/40 bg-accent-violet/10 text-accent-violet',
  }
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-2 py-[3px] font-mono text-3xs font-bold uppercase tracking-[0.12em] ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

export function Stat({
  label,
  value,
  unit,
  tone = 'default',
  sub,
}: {
  label: string
  value: string | number
  unit?: string
  tone?: 'default' | 'good' | 'bad' | 'warn'
  sub?: string
}) {
  const color =
    tone === 'good'
      ? 'text-signal-green'
      : tone === 'bad'
        ? 'text-signal-red'
        : tone === 'warn'
          ? 'text-signal-amber'
          : 'text-ink'
  return (
    <div className="rounded-md border border-edge-soft bg-base-750/70 px-2.5 py-2">
      <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-ink-faint">{label}</div>
      <div className={`font-mono text-2xl font-black leading-none tracking-tight ${color}`}>
        {value}
        {unit && <span className="ml-1 text-2xs font-semibold text-ink-faint">{unit}</span>}
      </div>
      {sub && <div className="mt-1 text-3xs text-ink-faint">{sub}</div>}
    </div>
  )
}

export function Bar({ value, color = '#22d3ee' }: { value: number; color?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-base-700">
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{ width: `${Math.max(2, Math.min(100, value * 100))}%`, background: color }}
      />
    </div>
  )
}

export function Row({ k, v, tone }: { k: string; v: ReactNode; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-edge-soft/60 py-[5px] last:border-0">
      <span className="text-3xs uppercase tracking-[0.12em] text-ink-faint">{k}</span>
      <span className={`font-mono text-2xs font-bold ${tone ?? 'text-ink'}`}>{v}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Shared control button — used by the scenario panel and grid toolbar
 * ------------------------------------------------------------------ */

export type BtnTone = 'idle' | 'go' | 'stop' | 'warn' | 'info' | 'violet'

const BTN_TONES: Record<BtnTone, string> = {
  idle: 'border-edge-strong bg-base-700 text-ink-dim hover:bg-base-650 hover:text-ink',
  go: 'border-signal-green/50 bg-signal-green/15 text-signal-green hover:bg-signal-green/25',
  stop: 'border-signal-red/50 bg-signal-red/15 text-signal-red hover:bg-signal-red/25',
  warn: 'border-signal-amber/50 bg-signal-amber/15 text-signal-amber hover:bg-signal-amber/25',
  info: 'border-accent-cyan/50 bg-accent-cyan/15 text-accent-cyan hover:bg-accent-cyan/25',
  violet: 'border-accent-violet/50 bg-accent-violet/15 text-accent-violet hover:bg-accent-violet/25',
}

export function Btn({
  children,
  onClick,
  active,
  tone = 'idle',
  title,
  size = 'md',
  className = '',
}: {
  children: ReactNode
  onClick: () => void
  active?: boolean
  tone?: BtnTone
  title?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const pad =
    size === 'lg'
      ? 'px-3 py-2.5 text-2xs'
      : size === 'sm'
        ? 'px-2 py-1 text-3xs'
        : 'px-2.5 py-2 text-3xs'
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded-md border font-mono font-bold uppercase tracking-[0.12em] transition-colors ${pad} ${
        active ? 'ring-2 ring-accent-cyan/60 ' : ''
      }${BTN_TONES[tone]} ${className}`}
    >
      {children}
    </button>
  )
}
