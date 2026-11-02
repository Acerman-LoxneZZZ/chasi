import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

/** Receding film controls. Keyboard focus and an open panel always keep access. */
export function useCinemaControls(tools: RefObject<HTMLDetailsElement | null>) {
  const [visible, setVisible] = useState(false)
  const timer = useRef(0)
  const revealedUntil = useRef(0)
  const dismiss = useCallback(() => { revealedUntil.current = 0; setVisible(false) }, [])
  useEffect(() => {
    let lastWheel = -Infinity
    let atControls = false
    let pointer: { x: number; y: number; id: number } | null = null
    const focused = () => document.activeElement?.matches(':focus-visible')
      && document.activeElement.closest('.site-header, .exhibit-dock, .skip-link')
    const hide = () => {
      if (!atControls && !tools.current?.open && !focused()) setVisible(false)
    }
    const reveal = () => {
      revealedUntil.current = performance.now() + 2800
      setVisible(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(hide, 2800)
    }
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.buttons || performance.now() - lastWheel < 400) return
      const edge = event.clientY < 100 || event.clientY > innerHeight - 125
      if (edge) { atControls = true; reveal() }
      else if (atControls) {
        atControls = false
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(hide, 2800)
      }
    }
    const down = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('canvas.watch-canvas--story, .finale-pin')) {
        pointer = { x: event.clientX, y: event.clientY, id: event.pointerId }
      }
    }
    const up = (event: PointerEvent) => {
      if (pointer?.id === event.pointerId && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) < 7) reveal()
      pointer = null
    }
    const cancel = () => { pointer = null; dismiss() }
    const scroll = () => { if (performance.now() > revealedUntil.current) hide() }
    const wheel = () => { lastWheel = performance.now(); atControls = false; revealedUntil.current = 0; hide() }
    const focus = (event: FocusEvent) => {
      if (event.target instanceof Element && event.target.closest('.site-header, .exhibit-dock, .skip-link')) reveal()
    }
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerdown', down, { passive: true })
    window.addEventListener('pointerup', up, { passive: true })
    window.addEventListener('pointercancel', cancel, { passive: true })
    window.addEventListener('scroll', scroll, { passive: true })
    window.addEventListener('wheel', wheel, { passive: true })
    document.addEventListener('focusin', focus)
    return () => {
      window.clearTimeout(timer.current)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('scroll', scroll)
      window.removeEventListener('wheel', wheel)
      document.removeEventListener('focusin', focus)
    }
  }, [tools, dismiss])
  return { visible, dismiss }
}
