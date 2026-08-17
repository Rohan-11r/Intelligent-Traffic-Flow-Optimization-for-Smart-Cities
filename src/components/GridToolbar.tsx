import { engine } from '../state/useSim'
import { pad2 } from '../sim/network'
import { FIT_VIEW, MAX_ZOOM, MIN_ZOOM, clampView } from './CityCanvas'
import type { GridView } from './CityCanvas'

/**
 * Zoom / focus controls for the 6x6 city visualization.
 * These affect ONLY the canvas — never the browser zoom or the page layout.
 */
export function GridToolbar({
  view,
  setView,
  selected,
}: {
  view: GridView
  setView: (v: GridView) => void
  selected: number | null
}) {
  const pctLabel = `${Math.round(view.zoom * 100)}%`
  /** 100% is defined as FIT: the whole 6x6 city, all 36 intersections, nothing cropped. */
  const atFit = Math.abs(view.zoom - 1) < 0.02
  const zoomAtCentre = (factor: number) =>
    setView(clampView({ ...view, zoom: view.zoom * factor }))

  const focusSelected = () => {
    if (selected === null) return
    const n = engine.net.byNode.get(selected)
    if (!n) return
    setView(clampView({ zoom: Math.max(2.4, view.zoom), cx: n.x, cy: n.y }))
  }

  const btn =
    'grid h-8 place-content-center rounded-md border border-edge-strong bg-base-700 px-2.5 font-mono text-3xs font-black uppercase tracking-[0.1em] text-ink-dim transition-colors hover:border-accent-cyan/60 hover:bg-base-650 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 font-mono text-3xs font-bold uppercase tracking-[0.16em] text-ink-faint">
        Grid Zoom
      </span>

      <button
        type="button"
        className={btn}
        onClick={() => zoomAtCentre(1 / 1.25)}
        disabled={view.zoom <= MIN_ZOOM + 0.001}
        title="Zoom out"
        aria-label="Zoom out"
      >
        −
      </button>

      <span
        className="grid h-8 w-16 place-content-center rounded-md border border-accent-cyan/40 bg-accent-cyan/10 font-mono text-2xs font-black tabular-nums text-accent-cyan"
        title="100% = FIT — the entire 6×6 city, all 36 intersections"
      >
        {pctLabel}
      </span>

      <button
        type="button"
        className={btn}
        onClick={() => zoomAtCentre(1.25)}
        disabled={view.zoom >= MAX_ZOOM - 0.001}
        title="Zoom in"
        aria-label="Zoom in"
      >
        +
      </button>

      <button
        type="button"
        className={`${btn} ${atFit ? 'border-accent-cyan/60 text-accent-cyan' : ''}`}
        onClick={() => setView(FIT_VIEW)}
        title="Fit — show the entire 6×6 city (all 36 intersections)"
      >
        Fit
      </button>

      <button type="button" className={btn} onClick={() => setView(FIT_VIEW)} title="Reset zoom and pan">
        Reset
      </button>

      <button
        type="button"
        className={btn}
        onClick={focusSelected}
        disabled={selected === null}
        title="Zoom into the selected intersection"
      >
        Focus {selected !== null ? pad2(selected) : '—'}
      </button>

      <span className="font-mono text-3xs font-bold uppercase tracking-[0.1em] text-ink-faint">
        {atFit ? '100% = full city view' : 'detail inspection'}
      </span>

      <span className="hidden font-mono text-3xs text-ink-faint 2xl:inline">
        · ctrl+wheel = zoom · drag = pan · double-click a node = focus
      </span>
    </div>
  )
}
