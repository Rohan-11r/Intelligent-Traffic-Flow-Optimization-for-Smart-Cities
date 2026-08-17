import { useEffect, useRef, useState } from 'react'
import { engine } from '../sim/engine'
import type { Snapshot } from '../sim/types'

/**
 * Drives the engine from a single requestAnimationFrame loop and republishes a
 * React-visible snapshot ~8x/second. The canvas reads engine state directly, so
 * high-frequency vehicle motion never touches React's render path.
 */
export function useSim(): Snapshot {
  const [snap, setSnap] = useState<Snapshot>(() => engine.snapshot())
  const acc = useRef(0)

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      engine.step(dt)
      acc.current += dt
      if (acc.current >= 0.12) {
        acc.current = 0
        setSnap(engine.snapshot())
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return snap
}

export { engine }
