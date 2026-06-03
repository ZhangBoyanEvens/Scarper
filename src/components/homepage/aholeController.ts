import { applyEase } from '../../utils/easing'

/** 全局动画速率（0.5 = 慢一倍） */
const ANIM_SPEED = 0.5

/** 绿 / 青 / 白 色度区间内随机粒子色 */
function particleColor(): string {
  const palette = [
    [200, 255, 220],
    [180, 255, 255],
    [245, 255, 250],
  ] as const
  const [r, g, b] = palette[Math.floor(Math.random() * palette.length)]
  return `rgba(${r}, ${g}, ${b}, ${0.35 + Math.random() * 0.55})`
}

interface Disc {
  x: number
  y: number
  w: number
  h: number
  p: number
}

interface Particle {
  x: number
  sx: number
  dx: number
  y: number
  vy: number
  p: number
  r: number
  c: string
}

interface ClipState {
  disc: Disc
  i: number
  path: Path2D
}

interface ParticleArea {
  sw: number
  ew: number
  h: number
  sx: number
  ex: number
}

export interface AHoleController {
  destroy: () => void
}

function createLinesCanvas(
  width: number,
  height: number,
): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height)
  }
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  return c
}

interface SizeBox {
  width: number
  height: number
}

export function createAHoleController(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  observeTarget?: HTMLElement | null,
): AHoleController {
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return { destroy: () => {} }
  }

  let rafId = 0
  let discs: Disc[] = []
  let lines: Array<Array<{ x: number; y: number }>> = []
  let particles: Particle[] = []
  let linesCanvas: OffscreenCanvas | HTMLCanvasElement | null = null

  let rect: SizeBox = { width: 0, height: 0 }
  let render = { width: 1, height: 1, dpi: window.devicePixelRatio || 1 }

  let startDisc = { x: 0, y: 0, w: 0, h: 0 }
  let endDisc = { x: 0, y: 0, w: 0, h: 0 }
  let clip: ClipState = {
    disc: { x: 0, y: 0, w: 0, h: 0, p: 0 },
    i: 0,
    path: new Path2D(),
  }
  let particleArea: ParticleArea = {
    sw: 0,
    ew: 0,
    h: 0,
    sx: 0,
    ex: 0,
  }

  const tweenValue = (
    start: number,
    end: number,
    p: number,
    ease: false | 'inExpo' = false,
  ) => {
    const delta = end - start
    return start + delta * applyEase(p, ease)
  }

  const tweenDisc = (disc: Disc) => {
    disc.x = tweenValue(startDisc.x, endDisc.x, disc.p)
    disc.y = tweenValue(startDisc.y, endDisc.y, disc.p, 'inExpo')
    disc.w = tweenValue(startDisc.w, endDisc.w, disc.p)
    disc.h = tweenValue(startDisc.h, endDisc.h, disc.p)
    return disc
  }

  const measureTarget = () => observeTarget ?? root.parentElement ?? root

  const setSize = () => {
    const target = measureTarget()
    const box = target.getBoundingClientRect()
    const width =
      box.width || target.clientWidth || target.offsetWidth || root.clientWidth
    const height =
      box.height || target.clientHeight || target.offsetHeight || root.clientHeight
    rect = {
      width: Math.max(1, width),
      height: Math.max(1, height),
    }
    render = {
      width: rect.width,
      height: rect.height,
      dpi: window.devicePixelRatio || 1,
    }
    canvas.width = Math.floor(render.width * render.dpi)
    canvas.height = Math.floor(render.height * render.dpi)
  }

  const setDiscs = () => {
    const { width, height } = rect
    discs = []

    startDisc = {
      x: width * 0.5,
      y: height * 0.45,
      w: width * 0.75,
      h: height * 0.7,
    }

    endDisc = {
      x: width * 0.5,
      y: height * 0.95,
      w: 0,
      h: 0,
    }

    const totalDiscs = 100
    let prevBottom = height

    for (let i = 0; i < totalDiscs; i++) {
      const p = i / totalDiscs
      const disc = tweenDisc({ x: 0, y: 0, w: 0, h: 0, p })
      const bottom = disc.y + disc.h

      if (bottom <= prevBottom) {
        clip = {
          disc: { ...disc },
          i,
          path: clip.path,
        }
      }

      prevBottom = bottom
      discs.push(disc)
    }

    clip.path = new Path2D()
    clip.path.ellipse(
      clip.disc.x,
      clip.disc.y,
      clip.disc.w,
      clip.disc.h,
      0,
      0,
      Math.PI * 2,
    )
    clip.path.rect(
      clip.disc.x - clip.disc.w,
      0,
      clip.disc.w * 2,
      clip.disc.y,
    )
  }

  const setLines = () => {
    const { width, height } = rect
    lines = []

    const totalLines = 100
    const linesAngle = (Math.PI * 2) / totalLines

    for (let i = 0; i < totalLines; i++) {
      lines.push([])
    }

    discs.forEach((disc) => {
      for (let i = 0; i < totalLines; i++) {
        const angle = i * linesAngle
        lines[i].push({
          x: disc.x + Math.cos(angle) * disc.w,
          y: disc.y + Math.sin(angle) * disc.h,
        })
      }
    })

    linesCanvas = createLinesCanvas(width, height)
    const lctx = linesCanvas.getContext('2d')
    if (!lctx) return

    lines.forEach((line) => {
      lctx.save()

      let lineIsIn = false
      line.forEach((p1, j) => {
        if (j === 0) return

        const p0 = line[j - 1]

        if (
          !lineIsIn &&
          (lctx.isPointInPath(clip.path, p1.x, p1.y) ||
            lctx.isPointInStroke(clip.path, p1.x, p1.y))
        ) {
          lineIsIn = true
        } else if (lineIsIn) {
          lctx.clip(clip.path)
        }

        lctx.beginPath()
        lctx.moveTo(p0.x, p0.y)
        lctx.lineTo(p1.x, p1.y)
        lctx.strokeStyle = '#1e4d3f'
        lctx.lineWidth = 2
        lctx.stroke()
        lctx.closePath()
      })

      lctx.restore()
    })
  }

  const initParticle = (start = false): Particle => {
    const sx = particleArea.sx + particleArea.sw * Math.random()
    const ex = particleArea.ex + particleArea.ew * Math.random()
    const dx = ex - sx
    const y = start ? particleArea.h * Math.random() : particleArea.h

    return {
      x: sx,
      sx,
      dx,
      y,
      vy: (0.5 + Math.random()) * ANIM_SPEED,
      p: 0,
      r: 0.5 + Math.random() * 4,
      c: particleColor(),
    }
  }

  const setParticles = () => {
    const { height } = rect
    particles = []

    particleArea = {
      sw: clip.disc.w * 0.5,
      ew: clip.disc.w * 2,
      h: height * 0.85,
      sx: 0,
      ex: 0,
    }
    particleArea.sx = (rect.width - particleArea.sw) / 2
    particleArea.ex = (rect.width - particleArea.ew) / 2

    for (let i = 0; i < 100; i++) {
      particles.push(initParticle(true))
    }
  }

  const rebuild = () => {
    setSize()
    setDiscs()
    setLines()
    setParticles()
  }

  const drawDiscs = () => {
    ctx.strokeStyle = '#1e4d3f'
    ctx.lineWidth = 2

    ctx.beginPath()
    ctx.ellipse(
      startDisc.x,
      startDisc.y,
      startDisc.w,
      startDisc.h,
      0,
      0,
      Math.PI * 2,
    )
    ctx.stroke()
    ctx.closePath()

    discs.forEach((disc, i) => {
      if (i % 5 !== 0) return

      if (disc.w < clip.disc.w - 5) {
        ctx.save()
        ctx.clip(clip.path)
      }

      ctx.beginPath()
      ctx.ellipse(disc.x, disc.y, disc.w, disc.h, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.closePath()

      if (disc.w < clip.disc.w - 5) {
        ctx.restore()
      }
    })
  }

  const drawLines = () => {
    if (!linesCanvas) return
    ctx.drawImage(linesCanvas as CanvasImageSource, 0, 0)
  }

  const drawParticles = () => {
    ctx.save()
    ctx.clip(clip.path)

    particles.forEach((particle) => {
      ctx.fillStyle = particle.c
      ctx.beginPath()
      ctx.rect(particle.x, particle.y, particle.r, particle.r)
      ctx.closePath()
      ctx.fill()
    })

    ctx.restore()
  }

  const moveDiscs = () => {
    discs.forEach((disc) => {
      disc.p = (disc.p + 0.001 * ANIM_SPEED) % 1
      tweenDisc(disc)
    })
  }

  const moveParticles = () => {
    particles.forEach((particle) => {
      particle.p = 1 - particle.y / particleArea.h
      particle.x = particle.sx + particle.dx * particle.p
      particle.y -= particle.vy

      if (particle.y < 0) {
        particle.y = initParticle().y
      }
    })
  }

  const tick = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.scale(render.dpi, render.dpi)

    moveDiscs()
    moveParticles()
    drawDiscs()
    drawLines()
    drawParticles()

    ctx.restore()
    rafId = requestAnimationFrame(tick)
  }

  let resizeTimer = 0

  const onResize = () => {
    window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(() => {
      const target = measureTarget()
      const { width, height } = target.getBoundingClientRect()
      if (width < 2 || height < 2) return
      rebuild()
    }, 32)
  }

  rebuild()
  window.addEventListener('resize', onResize)

  const observed = measureTarget()
  const resizeObserver =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => onResize())
      : null
  resizeObserver?.observe(observed)

  rafId = requestAnimationFrame(tick)
  requestAnimationFrame(() => onResize())

  return {
    destroy: () => {
      cancelAnimationFrame(rafId)
      window.clearTimeout(resizeTimer)
      window.removeEventListener('resize', onResize)
      resizeObserver?.disconnect()
    },
  }
}
