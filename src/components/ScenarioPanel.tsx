import { SCENARIOS } from '../sim/scenarios'
import { QUICK_SCENARIOS, storyOf } from '../sim/story'
import { engine } from '../state/useSim'
import { Btn, Panel, Tag } from './ui'
import type { Snapshot } from '../sim/types'

const SPEEDS = [1, 2, 4, 8]

/* --------------------------- scenario selector -------------------------- */

export function ScenarioSelector({
  snap,
  onScenario,
}: {
  snap: Snapshot
  onScenario: (id: string) => void
}) {
  const story = storyOf(snap.scenarioId)

  return (
    <Panel
      title="Scenario"
      accent="violet"
      right={<Tag tone="live">{snap.scenarioNum} / 17</Tag>}
    >
      {/* ---- the dropdown: all 17 scenarios, always one click away ---- */}
      <label
        htmlFor="scenario-select"
        className="mb-1.5 block text-3xs font-bold uppercase tracking-[0.18em] text-ink-faint"
      >
        Select scenario
      </label>
      <select
        id="scenario-select"
        value={snap.scenarioId}
        onChange={(e) => onScenario(e.target.value)}
        className="w-full cursor-pointer rounded-md border border-accent-violet/50 bg-base-750 px-3 py-3 font-mono text-sm font-black uppercase tracking-[0.08em] text-ink outline-none transition-colors hover:border-accent-violet focus:border-accent-violet focus:ring-2 focus:ring-accent-violet/40"
      >
        {SCENARIOS.map((s) => (
          <option key={s.id} value={s.id}>
            {s.num}  {s.name.toUpperCase()}
          </option>
        ))}
      </select>

      {/* ---- quick-access chips for the demo-critical scenarios ---- */}
      <div className="mt-3 text-3xs font-bold uppercase tracking-[0.18em] text-ink-faint">
        Quick access
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {QUICK_SCENARIOS.map((q) => {
          const active = q.id === snap.scenarioId
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => onScenario(q.id)}
              className={`rounded-full border px-3 py-1.5 font-mono text-3xs font-black uppercase tracking-[0.12em] transition-colors ${
                active
                  ? 'border-accent-cyan bg-accent-cyan/20 text-accent-cyan ring-2 ring-accent-cyan/40'
                  : 'border-edge-strong bg-base-700 text-ink-dim hover:border-accent-cyan/60 hover:text-ink'
              }`}
            >
              {q.label}
            </button>
          )
        })}
      </div>

      {/* ---- what is loaded right now ---- */}
      <div className="mt-3 rounded-md border border-accent-violet/40 bg-accent-violet/10 px-3 py-2.5">
        <div className="text-3xs font-bold uppercase tracking-[0.18em] text-accent-violet">
          Scenario
        </div>
        <div className="font-mono text-base font-black leading-tight tracking-[0.04em] text-ink">
          {snap.scenarioNum} {snap.scenarioName.toUpperCase()}
        </div>

        <div className="mt-2 text-3xs font-bold uppercase tracking-[0.18em] text-ink-faint">
          Description
        </div>
        <p className="text-2xs leading-relaxed text-ink-dim">{snap.scenarioBlurb}</p>

        <div className="mt-2 flex items-center gap-2">
          <span className="text-3xs font-bold uppercase tracking-[0.18em] text-ink-faint">
            Status
          </span>
          <Tag tone={snap.running ? 'ok' : 'warn'}>{snap.running ? 'RUNNING' : 'READY / PAUSED'}</Tag>
        </div>
      </div>

      {/* ---- problem / response / result narrative ---- */}
      <div className="mt-2.5 space-y-1.5">
        {(
          [
            ['Problem', story.problem, 'border-signal-red/35 bg-signal-red/5', 'text-signal-red'],
            ['AI Response', story.response, 'border-accent-cyan/35 bg-accent-cyan/5', 'text-accent-cyan'],
            ['Result', story.result, 'border-signal-green/35 bg-signal-green/5', 'text-signal-green'],
          ] as const
        ).map(([k, v, box, ink]) => (
          <div key={k} className={`rounded-md border px-2.5 py-2 ${box}`}>
            <div className={`text-3xs font-black uppercase tracking-[0.18em] ${ink}`}>{k}</div>
            <p className="mt-0.5 text-2xs leading-relaxed text-ink-dim">{v}</p>
          </div>
        ))}
      </div>

      {snap.incidentText.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {snap.incidentText.map((x) => (
            <Tag key={x} tone="bad">
              {x}
            </Tag>
          ))}
        </div>
      )}
    </Panel>
  )
}

/* -------------------------- simulation controls ------------------------- */

export function SimulationControls({
  snap,
  ghost,
  setGhost,
}: {
  snap: Snapshot
  ghost: boolean
  setGhost: (v: boolean) => void
}) {
  return (
    <Panel
      title="Simulation Control"
      accent="green"
      right={<Tag tone={snap.running ? 'ok' : 'warn'}>{snap.running ? 'RUNNING' : 'PAUSED'}</Tag>}
    >
      <div className="grid grid-cols-2 gap-2">
        <Btn size="lg" tone="go" onClick={() => engine.setRunning(true)} active={snap.running}>
          ▶ Run
        </Btn>
        <Btn size="lg" tone="warn" onClick={() => engine.setRunning(false)} active={!snap.running}>
          ❚❚ Pause
        </Btn>
        <Btn size="lg" tone="stop" onClick={() => engine.reset()}>
          ⟲ Reset
        </Btn>
        <Btn
          size="lg"
          tone="info"
          onClick={() => engine.setSpeed(SPEEDS[(SPEEDS.indexOf(snap.speed) + 1) % SPEEDS.length])}
          title="Cycle simulation speed"
        >
          ⏩ Fast Fwd {snap.speed}×
        </Btn>
      </div>

      {/* ---- control mode: the headline comparison of the whole project ---- */}
      <div className="mt-3 text-3xs font-bold uppercase tracking-[0.18em] text-ink-faint">
        Control mode
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => engine.setAiMode(true)}
          className={`rounded-md border px-3 py-2.5 text-left transition-colors ${
            snap.aiMode
              ? 'border-signal-green bg-signal-green/20 ring-2 ring-signal-green/40'
              : 'border-edge-strong bg-base-750 hover:border-signal-green/50'
          }`}
        >
          <div
            className={`font-mono text-2xs font-black tracking-[0.12em] ${
              snap.aiMode ? 'text-signal-green' : 'text-ink-faint'
            }`}
          >
            AUTO AI
          </div>
          <div className="text-3xs text-ink-faint">adaptive</div>
        </button>
        <button
          type="button"
          onClick={() => engine.setAiMode(false)}
          className={`rounded-md border px-3 py-2.5 text-left transition-colors ${
            !snap.aiMode
              ? 'border-signal-red bg-signal-red/20 ring-2 ring-signal-red/40'
              : 'border-edge-strong bg-base-750 hover:border-signal-red/50'
          }`}
        >
          <div
            className={`font-mono text-2xs font-black tracking-[0.12em] ${
              !snap.aiMode ? 'text-signal-red' : 'text-ink-faint'
            }`}
          >
            FIXED-TIME
          </div>
          <div className="text-3xs text-ink-faint">baseline</div>
        </button>
      </div>

      <div
        className={`mt-2 rounded-md border px-3 py-2 ${
          snap.aiMode
            ? 'border-signal-green/50 bg-signal-green/10'
            : 'border-signal-red/50 bg-signal-red/10'
        }`}
      >
        <div
          className={`font-mono text-2xs font-black tracking-[0.16em] ${
            snap.aiMode ? 'text-signal-green' : 'text-signal-red'
          }`}
        >
          {snap.aiMode ? '● AI ADAPTIVE ONLINE' : '● AI DISABLED'}
        </div>
        <p className="mt-0.5 text-3xs leading-relaxed text-ink-faint">
          {snap.aiMode
            ? 'Green time, coordination and routing are recomputed every second from live queues.'
            : 'Every approach receives an identical fixed green regardless of demand.'}
        </p>
      </div>

      {/* ---- one-click demo actions ---- */}
      <div className="mt-3 border-t border-edge-soft pt-2.5">
        <div className="mb-1.5 text-3xs font-bold uppercase tracking-[0.18em] text-ink-faint">
          Operator actions
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Btn tone="stop" onClick={() => engine.triggerIncident(15, 16)} title="Block road 15-16">
            ⚠ Accident 15–16
          </Btn>
          <Btn tone="idle" onClick={() => engine.clearIncidents()}>
            ✓ Clear Closure
          </Btn>
          <Btn tone="info" onClick={() => engine.dispatchEmergency('ambulance')}>
            🚑 Ambulance
          </Btn>
          <Btn tone="warn" onClick={() => engine.dispatchEmergency('firetruck')}>
            🚒 Fire Truck
          </Btn>
          <Btn
            tone="idle"
            onClick={() => engine.injectSafetyFault()}
            title="Inject a conflicting green to prove the safety validator"
          >
            ⚡ Safety Test
          </Btn>
          <Btn tone={ghost ? 'stop' : 'idle'} onClick={() => setGhost(!ghost)} active={ghost}>
            👁 Baseline Ghost
          </Btn>
        </div>
      </div>
    </Panel>
  )
}
