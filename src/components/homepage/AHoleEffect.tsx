import { useEffect, useRef } from 'react'
import { createAHoleController } from './aholeController'
import './AHoleEffect.css'

export function AHoleEffect() {
  const hostRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const host = hostRef.current
    const root = rootRef.current
    const canvas = canvasRef.current
    if (!host || !root || !canvas) return

    const controller = createAHoleController(root, canvas, host)
    return () => controller.destroy()
  }, [])

  return (
    <div ref={hostRef} className="ahole-host">
      <div ref={rootRef} className="ahole">
        <canvas ref={canvasRef} className="ahole__canvas" />
        <div className="ahole__aura" aria-hidden />
        <div className="ahole__overlay" aria-hidden />
      </div>
    </div>
  )
}
