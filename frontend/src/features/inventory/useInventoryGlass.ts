import { useEffect } from 'react'
import type { RefObject } from 'react'

/**
 * Inventory glass interaction (page-scoped).
 *
 * - Marks <html data-inv-glass> while the Inventory page is mounted so the
 *   page-scoped CSS (inventory-glass.css) can restyle the shared shell
 *   (sidebar / background) without editing AppShell.
 * - Delegated Pointer Events tracking: writes --mouse-x / --mouse-y (px,
 *   relative to the hovered component) and toggles [data-spot-on].
 * - Disabled on touch / non-hover pointers. Tilt honours prefers-reduced-motion.
 */

const HOVER_QUERY = '(hover: hover) and (pointer: fine)'
const REDUCED_QUERY = '(prefers-reduced-motion: reduce)'
const SIDEBAR_SELECTOR = 'aside[aria-label="Navigasi utama"]'
const MAX_TILT_DEG = 1

function createTracker(root: HTMLElement, selector: string, allowTilt: boolean, reduced: () => boolean) {
  let active: HTMLElement | null = null
  let frame = 0
  let px = 0
  let py = 0
  let cx = 0
  let cy = 0
  let snap = false

  const deactivate = (el: HTMLElement | null) => {
    if (!el) return
    el.removeAttribute('data-spot-on')
    el.style.removeProperty('--rx')
    el.style.removeProperty('--ry')
  }

  const step = () => {
    frame = 0
    if (!active) return
    const rect = active.getBoundingClientRect()
    const tx = px - rect.left
    const ty = py - rect.top
    if (snap) {
      cx = tx
      cy = ty
      snap = false
    } else {
      cx += (tx - cx) * 0.35
      cy += (ty - cy) * 0.35
    }
    active.style.setProperty('--mouse-x', `${cx.toFixed(1)}px`)
    active.style.setProperty('--mouse-y', `${cy.toFixed(1)}px`)
    if (allowTilt && active.dataset.spot === 'stat' && !reduced() && rect.width > 0 && rect.height > 0) {
      const nx = Math.min(1, Math.max(0, tx / rect.width))
      const ny = Math.min(1, Math.max(0, ty / rect.height))
      active.style.setProperty('--rx', `${((0.5 - ny) * 2 * MAX_TILT_DEG).toFixed(2)}deg`)
      active.style.setProperty('--ry', `${((nx - 0.5) * 2 * MAX_TILT_DEG).toFixed(2)}deg`)
    }
    if (Math.abs(tx - cx) > 0.4 || Math.abs(ty - cy) > 0.4) {
      frame = requestAnimationFrame(step)
    }
  }

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(step)
  }

  const onMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return
    px = event.clientX
    py = event.clientY
    const target = event.target instanceof Element ? event.target : null
    const el = (target?.closest(selector) as HTMLElement | null) ?? null
    const next = el && root.contains(el) ? el : null
    if (next !== active) {
      deactivate(active)
      active = next
      if (active) {
        snap = true
        active.setAttribute('data-spot-on', '')
      }
    }
    if (active) schedule()
  }

  const release = () => {
    deactivate(active)
    active = null
    if (frame) {
      cancelAnimationFrame(frame)
      frame = 0
    }
  }

  root.addEventListener('pointermove', onMove)
  root.addEventListener('pointerleave', release)
  root.addEventListener('pointercancel', release)

  return () => {
    root.removeEventListener('pointermove', onMove)
    root.removeEventListener('pointerleave', release)
    root.removeEventListener('pointercancel', release)
    release()
  }
}

export function useInventoryGlass(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const html = document.documentElement
    html.setAttribute('data-inv-glass', '')

    const root = rootRef.current
    const hasMM = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    if (!root || !hasMM) {
      return () => html.removeAttribute('data-inv-glass')
    }

    const hoverMq = window.matchMedia(HOVER_QUERY)
    const reducedMq = window.matchMedia(REDUCED_QUERY)
    const reduced = () => reducedMq.matches
    let teardown: Array<() => void> = []

    const attach = () => {
      detach()
      if (!hoverMq.matches) return
      teardown.push(createTracker(root, '[data-spot]', true, reduced))
      const sidebar = document.querySelector<HTMLElement>(SIDEBAR_SELECTOR)
      if (sidebar) teardown.push(createTracker(sidebar, 'nav a', false, reduced))
    }
    const detach = () => {
      teardown.forEach((fn) => fn())
      teardown = []
    }

    attach()
    const onChange = () => attach()
    hoverMq.addEventListener?.('change', onChange)
    window.addEventListener('blur', detach)
    window.addEventListener('focus', attach)

    return () => {
      hoverMq.removeEventListener?.('change', onChange)
      window.removeEventListener('blur', detach)
      window.removeEventListener('focus', attach)
      detach()
      html.removeAttribute('data-inv-glass')
    }
  }, [rootRef])
}
