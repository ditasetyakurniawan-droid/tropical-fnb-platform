import { useEffect, useRef, useState } from 'react'

interface Ember {
  x: number
  y: number
  z: number
  radius: number
  speedY: number
  speedX: number
  alpha: number
  pulse: number
  hue: number
}

interface BotanicalMote {
  x: number
  y: number
  z: number
  radius: number
  speedY: number
  speedX: number
  alpha: number
  pulse: number
}

interface Tropical3DCanvasProps {
  /**
   * 'hero': Full dramatic lighting for Login & Portal showcases
   * 'subtle': Sophisticated, high-readability atmospheric backdrop for ERP & POS AppShell
   */
  variant?: 'hero' | 'subtle'
}

/**
 * Tropical3DCanvas
 * Ultra-Smooth Photorealistic 3D Parallax & Live Particle Engine
 * Combines authentic Tropical Garden Resto foliage (Monstera, Palm, Rosemary)
 * with sizzling Tropical Steak House open-fire charcoal grill embers.
 *
 * Features enhanced multi-layer stereoscopic 3D parallax responding to mouse/cursor movement.
 */
export function Tropical3DCanvas({ variant = 'hero' }: Tropical3DCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)

  const isSubtle = variant === 'subtle'

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return // Safe fallback for jsdom and environments without 2D canvas

    let animationFrameId: number
    let width = (canvas.width = window.innerWidth)
    let height = (canvas.height = window.innerHeight)

    const handleResize = () => {
      if (!canvas) return
      width = canvas.width = window.innerWidth
      height = canvas.height = window.innerHeight
    }

    // Parallax mouse tracker with high-tactile smooth lerp easing
    const mouse = {
      x: width / 2,
      y: height / 2,
      targetX: width / 2,
      targetY: height / 2,
    }

    const handleMouseMove = (e: MouseEvent) => {
      mouse.targetX = e.clientX
      mouse.targetY = e.clientY
    }

    window.addEventListener('resize', handleResize, { passive: true })
    window.addEventListener('mousemove', handleMouseMove, { passive: true })

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // --- Embers rising from the central grill hearth ---
    const embers: Ember[] = []
    const emberCount = prefersReducedMotion ? 12 : isSubtle ? 28 : 55

    for (let i = 0; i < emberCount; i++) {
      embers.push({
        x: width * 0.5 + (Math.random() - 0.5) * (width * 0.32),
        y: height * 0.7 + Math.random() * (height * 0.35),
        z: Math.random() * 1.6 + 0.6,
        radius: Math.random() * 2.4 + 0.8,
        speedY: Math.random() * 1.3 + 0.45,
        speedX: (Math.random() - 0.5) * 0.7,
        alpha: Math.random() * 0.75 + 0.25,
        pulse: Math.random() * Math.PI * 2,
        hue: Math.random() > 0.4 ? Math.random() * 24 + 34 : Math.random() * 14 + 16,
      })
    }

    // --- Botanical floating luminous dew motes in the garden ---
    const motes: BotanicalMote[] = []
    const moteCount = prefersReducedMotion ? 8 : isSubtle ? 18 : 32

    for (let i = 0; i < moteCount; i++) {
      motes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        z: Math.random() * 1.4 + 0.5,
        radius: Math.random() * 1.6 + 0.6,
        speedY: (Math.random() - 0.5) * 0.35,
        speedX: (Math.random() - 0.5) * 0.35,
        alpha: Math.random() * 0.55 + 0.2,
        pulse: Math.random() * Math.PI * 2,
      })
    }

    let fireFlickerPhase = 0

    // --- Render Loop (60 FPS) ---
    const render = () => {
      // Enhanced tactile lerp mouse smoothing
      mouse.x += (mouse.targetX - mouse.x) * 0.06
      mouse.y += (mouse.targetY - mouse.y) * 0.06

      const mouseOffsetX = (mouse.x - width / 2) / (width / 2)
      const mouseOffsetY = (mouse.y - height / 2) / (height / 2)

      // Enhanced 3D Perspective Tilt & Pan ("Memanjakan Mata" dynamic range)
      if (containerRef.current && !prefersReducedMotion) {
        const tiltX = -mouseOffsetY * (isSubtle ? 5.5 : 8.5)
        const tiltY = mouseOffsetX * (isSubtle ? 7.5 : 11.5)
        const panX = mouseOffsetX * (isSubtle ? -20 : -32)
        const panY = mouseOffsetY * (isSubtle ? -14 : -22)
        containerRef.current.style.transform = `perspective(1200px) rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg) translate3d(${panX.toFixed(1)}px, ${panY.toFixed(1)}px, 0) scale(1.12)`
      }

      ctx.clearRect(0, 0, width, height)

      // Fire Hearth Ambient Breathing Glow
      fireFlickerPhase += 0.045
      const fireGlowIntensity =
        (isSubtle ? 0.08 : 0.16) +
        Math.sin(fireFlickerPhase) * 0.04 +
        Math.sin(fireFlickerPhase * 2.3) * 0.02

      const hearthGrad = ctx.createRadialGradient(
        width * 0.5 + mouseOffsetX * 15,
        height * 0.72 + mouseOffsetY * 12,
        20,
        width * 0.5,
        height * 0.72,
        width * (isSubtle ? 0.28 : 0.38),
      )
      hearthGrad.addColorStop(0, `rgba(245, 158, 11, ${fireGlowIntensity})`)
      hearthGrad.addColorStop(0.5, `rgba(234, 88, 12, ${fireGlowIntensity * 0.45})`)
      hearthGrad.addColorStop(1, 'transparent')
      ctx.fillStyle = hearthGrad
      ctx.fillRect(0, 0, width, height)

      // Rising Sizzling Charcoal Embers (Multi-layer 3D Parallax)
      embers.forEach((ember) => {
        ember.y -= ember.speedY * ember.z
        ember.x += (ember.speedX + Math.sin(ember.pulse) * 0.45) * ember.z
        ember.pulse += 0.05

        // Reset if moved above top or faded
        if (ember.y < height * 0.12) {
          ember.y = height * 0.75 + Math.random() * (height * 0.25)
          ember.x = width * 0.5 + (Math.random() - 0.5) * (width * 0.32)
        }

        const currentAlpha = Math.max(
          0.05,
          Math.min(
            1,
            ember.alpha * (ember.y / (height * 0.8)) +
              Math.sin(ember.pulse) * 0.25,
          ),
        )

        // Parallax shift for embers (closer embers shift more than distant ones)
        const renderX = ember.x + mouseOffsetX * 22 * ember.z
        const renderY = ember.y + mouseOffsetY * 16 * ember.z

        ctx.save()
        ctx.beginPath()
        const r = ember.radius * ember.z
        ctx.arc(renderX, renderY, r, 0, Math.PI * 2)

        const alphaMultiplier = isSubtle ? 0.7 : 1
        ctx.fillStyle = `hsla(${ember.hue}, 95%, 65%, ${currentAlpha * alphaMultiplier})`
        ctx.shadowColor = `hsla(${ember.hue}, 100%, 55%, ${currentAlpha * 0.85 * alphaMultiplier})`
        ctx.shadowBlur = (isSubtle ? 6 : 9) * ember.z
        ctx.fill()
        ctx.restore()
      })

      // Botanical Luminous Dew Motes (Multi-layer 3D Parallax)
      motes.forEach((mote) => {
        mote.x += mote.speedX
        mote.y += mote.speedY
        mote.pulse += 0.025

        if (mote.x < 0) mote.x = width
        if (mote.x > width) mote.x = 0
        if (mote.y < 0) mote.y = height
        if (mote.y > height) mote.y = 0

        const alpha = Math.max(
          0.06,
          Math.min(0.65, mote.alpha + Math.sin(mote.pulse) * 0.22),
        )

        const renderX = mote.x + mouseOffsetX * 30 * mote.z
        const renderY = mote.y + mouseOffsetY * 20 * mote.z

        ctx.save()
        ctx.beginPath()
        ctx.arc(renderX, renderY, mote.radius * mote.z, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(52, 211, 153, ${alpha * (isSubtle ? 0.6 : 0.9)})`
        ctx.shadowColor = 'rgba(16, 185, 129, 0.65)'
        ctx.shadowBlur = 6
        ctx.fill()
        ctx.restore()
      })

      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(animationFrameId)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('mousemove', handleMouseMove)
    }
  }, [isSubtle])

  return (
    <div
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[#020b08]"
      aria-hidden="true"
    >
      {/* 3D Parallax Photorealistic Backdrop */}
      <div
        ref={containerRef}
        className="absolute inset-[-6%] size-[112%] will-change-transform transition-opacity duration-1000"
        style={{
          opacity: imageLoaded ? (isSubtle ? 0.35 : 1) : 0.5,
          transform: 'perspective(1200px) scale(1.12)',
        }}
      >
        <img
          src="/tropical-steak-garden-bg.jpg"
          alt="Tropical Steak Garden Atmospheric 3D Background"
          onLoad={() => setImageLoaded(true)}
          className="size-full object-cover object-center filter brightness-[0.78] contrast-[1.12] saturate-[1.15]"
        />
      </div>

      {/* Atmospheric Vignette & Contrast Gradients */}
      {isSubtle ? (
        <>
          <div className="absolute inset-0 bg-gradient-to-r from-[#020b08]/96 via-[#020b08]/85 to-[#020b08]/96" />
          <div className="absolute inset-0 bg-[#020b08]/60 backdrop-blur-[3px]" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#020b08] via-transparent to-[#020b08]/90" />
        </>
      ) : (
        <>
          <div className="absolute inset-0 bg-gradient-to-r from-[#020b08]/94 via-[#020b08]/55 to-[#020b08]/92" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#020b08] via-transparent to-[#020b08]/85" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_75%,rgba(245,158,11,0.08)_0%,transparent_60%)]" />
        </>
      )}

      {/* Hardware-Accelerated 3D Embers & Sparks Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 size-full pointer-events-none" />
    </div>
  )
}
