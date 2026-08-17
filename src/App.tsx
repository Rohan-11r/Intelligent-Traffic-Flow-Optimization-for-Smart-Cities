import { useCallback, useState } from 'react'
import { engine, useSim } from './state/useSim'
import { Header } from './components/Header'
import { ScenarioSelector, SimulationControls } from './components/ScenarioPanel'
import { CityCanvas, FIT_VIEW, clampView } from './components/CityCanvas'
import type { GridView } from './components/CityCanvas'
import { GridToolbar } from './components/GridToolbar'
import { AiAnalysis, Coordination, EmergencyPanel, LoopPanel, NetworkHealth } from './components/Panels'
import { Inspector } from './components/Inspector'
import { Benchmark } from './components/Benchmark'
import { BeforeAfter } from './components/BeforeAfter'
import { EventFeed } from './components/EventFeed'
import { Tag } from './components/ui'
import { pad2 } from './sim/network'

/** Section heading used between the stacked rows so the page reads as a document. */
function SectionTitle({
  id,
  step,
  title,
  sub,
}: {
  id: string
  step: string
  title: string
  sub: string
}) {
  return (
    <div id={id} className="anchor-offset flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1 pt-2">
      <span className="font-mono text-sm font-black tracking-[0.2em] text-accent-cyan">{step}</span>
      <h2 className="text-base font-black uppercase tracking-[0.16em] text-ink">{title}</h2>
      <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-faint">{sub}</p>
    </div>
  )
}

export default function App() {
  const snap = useSim()
  const [selected, setSelected] = useState<number | null>(15)
  const [ghost, setGhost] = useState(false)
  const [view, setViewRaw] = useState<GridView>(FIT_VIEW)

  const setView = useCallback((v: GridView) => setViewRaw(clampView(v)), [])
  const onSelect = useCallback((id: number) => setSelected(id), [])
  const onScenario = useCallback((id: string) => engine.applyScenario(id, true), [])

  const legend: [string, string][] = [
    ['#22c55e', 'FREE FLOW'],
    ['#eab308', 'MEDIUM'],
    ['#f97316', 'HIGH'],
    ['#ef4444', 'CRITICAL / BLOCKED'],
    ['#22d3ee', 'REROUTED VEHICLE'],
    ['#ffffff', 'EMERGENCY CORRIDOR'],
  ]

  return (
    <div className="min-h-screen w-full overflow-x-clip bg-base-900 text-ink">
      <Header snap={snap} />

      <main className="mx-auto flex w-full max-w-[2100px] flex-col gap-4 px-3 pb-6 pt-3 xl:px-5">
        {/* ================= ROW 1 — controls · live city · inspector ================ */}
        <SectionTitle
          id="live"
          step="01"
          title="Live Simulation"
          sub="scenario control · 6 × 6 city network · intersection inspector"
        />

        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[320px_minmax(0,1fr)_380px] 2xl:grid-cols-[352px_minmax(0,1fr)_420px]">
          {/* LEFT — scenario + simulation controls */}
          <div className="flex flex-col gap-4">
            <ScenarioSelector snap={snap} onScenario={onScenario} />
            <SimulationControls snap={snap} ghost={ghost} setGhost={setGhost} />
          </div>

          {/* CENTER — the hero: 36 intersections, always fully visible */}
          <section className="flex flex-col rounded-lg border border-edge bg-base-850 shadow-panel">
            <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-edge-soft px-3.5 py-2.5">
              <span className="h-4 w-[3px] rounded-full bg-accent-cyan" />
              <h3 className="text-xs font-black uppercase tracking-[0.16em] text-ink">
                Live City Network — 6 × 6 · 36 Signalized Intersections
              </h3>
              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                <Tag tone="live">
                  {snap.scenarioNum} {snap.scenarioName}
                </Tag>
                {snap.blockedEdges.length > 0 && (
                  <Tag tone="bad">ROAD {snap.blockedEdges[0].replace('-', '–')} BLOCKED</Tag>
                )}
                {snap.corridors.some((c) => c.active) && <Tag tone="ok">GREEN WAVE ACTIVE</Tag>}
                {snap.spillbackNodes.length > 0 && <Tag tone="warn">SPILLBACK PROTECTION</Tag>}
                {snap.emergencyActive && <Tag tone="bad">EMERGENCY CORRIDOR</Tag>}
                {!snap.safetyOk && <Tag tone="bad">SIGNAL SAFETY FAULT</Tag>}
              </div>
            </header>

            {/* zoom toolbar — internal grid zoom, never browser zoom */}
            <div className="shrink-0 border-b border-edge-soft bg-base-800/70 px-3.5 py-2">
              <GridToolbar view={view} setView={setView} selected={selected} />
            </div>

            {/* square, responsive viewport → all 36 nodes fit, nothing is cropped */}
            <div className="p-3">
              <div className="relative mx-auto aspect-square w-full max-w-[900px] overflow-hidden rounded-md border border-edge-soft bg-base-900">
                <CityCanvas
                  selected={selected}
                  onSelect={onSelect}
                  showFixedGhost={ghost}
                  view={view}
                  onViewChange={setView}
                />

                <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-edge bg-base-900/85 px-2.5 py-2">
                  <div className="font-mono text-3xs font-black tracking-[0.14em] text-ink-faint">
                    NETWORK STATE
                  </div>
                  <div className="font-mono text-2xs font-bold text-ink">
                    {snap.vehicleCount} veh · {snap.health.critical} critical · {snap.health.high} high
                  </div>
                  <div className="font-mono text-2xs text-ink-dim">
                    avg wait {snap.ai.avgWait.toFixed(0)}s · imbalance {(snap.ai.gini * 100).toFixed(0)}%
                  </div>
                  {selected && (
                    <div className="mt-0.5 font-mono text-2xs font-black text-accent-cyan">
                      ▸ INSPECTING NODE {pad2(selected)}
                    </div>
                  )}
                </div>

                {view.zoom > 1.02 && (
                  <div className="pointer-events-none absolute right-3 top-3 rounded-md border border-accent-cyan/40 bg-base-900/85 px-2.5 py-1.5">
                    <div className="font-mono text-2xs font-black text-accent-cyan">
                      ZOOM {Math.round(view.zoom * 100)}%
                    </div>
                    <div className="font-mono text-3xs text-ink-faint">drag to pan · Fit to reset</div>
                  </div>
                )}

                <div className="pointer-events-none absolute bottom-2 left-3 right-3 flex flex-wrap gap-x-3 gap-y-1 rounded-md border border-edge bg-base-900/85 px-2.5 py-1.5">
                  {legend.map(([c, l]) => (
                    <span key={l} className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />
                      <span className="font-mono text-3xs font-bold tracking-[0.08em] text-ink-faint">
                        {l}
                      </span>
                    </span>
                  ))}
                </div>

                {!snap.running && (
                  <div className="pointer-events-none absolute inset-0 grid place-content-center">
                    <span className="rounded-md border border-signal-amber/50 bg-base-900/80 px-5 py-2.5 font-mono text-base font-black tracking-[0.3em] text-signal-amber">
                      PAUSED
                    </span>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* RIGHT — intersection inspector */}
          <div className="flex flex-col gap-4">
            <Inspector snap={snap} selected={selected} />
            <Coordination snap={snap} onSelect={onSelect} />
          </div>
        </div>

        {/* ================= ROW 2 — network health · AI · emergency ================= */}
        <SectionTitle
          id="analysis"
          step="02"
          title="Network Health & AI Decisions"
          sub="what the AI sees · what it decides · emergency priority"
        />

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,0.9fr)]">
          <NetworkHealth snap={snap} onSelect={onSelect} />
          <AiAnalysis snap={snap} onSelect={onSelect} />
          <div className="lg:col-span-2 2xl:col-span-1">
            <EmergencyPanel snap={snap} />
          </div>
        </div>

        {/* ===================== ROW 3 — benchmark ===================== */}
        <SectionTitle
          id="benchmark"
          step="03"
          title="Fixed-Time vs Smart AI"
          sub="same city · same demand · measured live"
        />
        <Benchmark snap={snap} />

        {/* ===================== ROW 4 — before vs after ===================== */}
        <SectionTitle
          id="before-after"
          step="04"
          title="Before vs After"
          sub="queue distribution across all 36 intersections"
        />
        <BeforeAfter snap={snap} />

        {/* ================= ROW 5 — event feed + how it works ================= */}
        <SectionTitle
          id="feed"
          step="05"
          title="Live Event Feed & How Our Solution Works"
          sub="every decision the system makes, in order"
        />

        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <EventFeed snap={snap} />
          <LoopPanel snap={snap} />
        </div>
      </main>

      <footer className="border-t border-edge bg-base-900 px-4 py-3">
        <p className="text-center font-mono text-3xs font-bold uppercase tracking-[0.2em] text-ink-faint">
          Smart AI Adaptive Control — continuous sensing + adaptive signal control + network
          coordination + dynamic routing · SUMO / Simulink / TraCI hooks reserved for future integration
        </p>
      </footer>
    </div>
  )
}
