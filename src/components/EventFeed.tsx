import { Panel, Tag } from './ui'
import type { EventKind, Snapshot } from '../sim/types'

const KIND_TONE: Record<EventKind, 'ok' | 'warn' | 'bad' | 'info' | 'live' | 'idle'> = {
  AI: 'info',
  SIGNAL: 'ok',
  INCIDENT: 'bad',
  ROUTING: 'info',
  EMERGENCY: 'bad',
  SAFETY: 'bad',
  SCENARIO: 'live',
  FAULT: 'warn',
  TRANSIT: 'live',
  WAVE: 'ok',
  SPILLBACK: 'warn',
  PEDESTRIAN: 'info',
}

const clock = (t: number) =>
  `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`

export function EventFeed({ snap }: { snap: Snapshot }) {
  return (
    <Panel
      title="Live Event Feed — newest first"
      accent="cyan"
      right={<Tag tone="info">{snap.events.length} EVENTS</Tag>}
      scroll
      bodyClassName="max-h-[720px]"
    >
      <ul className="space-y-1">
        {snap.events.map((e) => (
          <li
            key={e.id}
            className="flex animate-slide-in items-start gap-2 border-b border-edge-soft/50 pb-1 last:border-0"
          >
            <span className="font-mono text-2xs tabular-nums text-ink-faint">{clock(e.t)}</span>
            <Tag tone={KIND_TONE[e.kind]}>{e.kind}</Tag>
            {e.node !== '—' && (
              <span className="font-mono text-2xs font-black text-ink-dim">{e.node}</span>
            )}
            <span className="flex-1 text-2xs leading-snug text-ink-dim">{e.text}</span>
          </li>
        ))}
        {!snap.events.length && <li className="text-2xs text-ink-faint">Awaiting events…</li>}
      </ul>
    </Panel>
  )
}
