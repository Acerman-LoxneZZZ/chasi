import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { MechanismSound } from '../audio/MechanismSound'

export function useMechanismSound() {
  const sound = useMemo(() => new MechanismSound(), [])
  const snapshot = useSyncExternalStore(sound.subscribe, sound.getSnapshot)
  useEffect(() => {
    const visible = new Map<Element, boolean>()
    const observer = new IntersectionObserver(records => {
      for (const record of records) visible.set(record.target, record.isIntersecting && record.intersectionRatio > 0)
      sound.setActive([...visible.values()].some(Boolean))
    }, { threshold: [0, .05], rootMargin: '-76px 0px 0px' })
    document.querySelectorAll('.story-stage, .detail-scene').forEach(element => observer.observe(element))
    document.addEventListener('visibilitychange', sound.visibilityChanged)
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', sound.visibilityChanged); sound.dispose() }
  }, [sound])
  return useMemo(() => ({ ...snapshot, toggle: sound.toggle }), [snapshot, sound])
}
