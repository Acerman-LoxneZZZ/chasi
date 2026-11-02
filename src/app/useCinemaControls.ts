import { useEffect, useRef, useState, type RefObject } from 'react'

/** Receding film controls. Keyboard focus and an open panel always keep access. */
export function useCinemaControls(tools: RefObject<HTMLDetailsElement | null>) {
  const [visible, setVisible] = useState(false)
  const timer = useRef(0)
  useEffect(() => {
    let lastScroll = -Infinity
    let pointer: { x: number; y: number; id: number } | null = null
    const focused = () => document.activeElement?.matches(':focus-visible')
      && document.activeElement.closest('.site-header, .exhibit-dock, .skip-link')
    const hide = () => {
      if (!tools.current?.open && !focused()) setVisible(false)
    }
    const reveal = () => {
      setVisible(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(hide, 2800)
    }
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.buttons || performance.now() - lastScroll < 400) return
      if (event.clientY < 100 || event.clientY > innerHeight - 125) reveal()
    }
    const down = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('canvas.watch-canvas--story')) {
        pointer = { x: event.clientX, y: event.clientY, id: event.pointerId }
      }
    }
    const up = (event: PointerEvent) => {
      if (pointer?.id === event.pointerId && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) < 7) reveal()
      pointer = null
    }
    const cancel = () => { pointer = null }
    const scroll = () => { lastScroll = performance.now(); hide() }
    const focus = (event: FocusEvent) => {
      if (event.target instanceof Element && event.target.closest('.site-header, .exhibit-dock, .skip-link')) reveal()
    }
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerdown', down, { passive: true })
    window.addEventListener('pointerup', up, { passive: true })
    window.addEventListener('pointercancel', cancel, { passive: true })
    window.addEventListener('scroll', scroll, { passive: true })
    document.addEventListener('focusin', focus)
    return () => {
      window.clearTimeout(timer.current)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('scroll', scroll)
      document.removeEventListener('focusin', focus)
    }
  }, [tools])
  return visible
}
