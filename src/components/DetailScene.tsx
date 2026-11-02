import { memo, useEffect, useRef } from 'react'
import { registerDetailScene, type DetailSceneKind } from '../scene/DetailSceneManager'

export interface DetailSceneProps {
  kind: DetailSceneKind
  label: string
  poster: string
  className?: string
  onProgress?: (progress: number) => void
}

/** Progressive WebGL enhancement: the illustration stays visible until paint. */
export const DetailScene = memo(function DetailScene({ kind, label, poster, className = '', onProgress }: DetailSceneProps) {
  const host = useRef<HTMLDivElement>(null)
  const surface = useRef<HTMLDivElement>(null)
  const progressCallback = useRef(onProgress)
  progressCallback.current = onProgress
  useEffect(() => {
    if (!host.current || !surface.current) return
    try { return registerDetailScene(host.current, surface.current, kind, value => progressCallback.current?.(value)) }
    catch {
      // A missing browser enhancement API must leave the section's art intact.
      host.current.dataset.sceneStatus = 'error'
      host.current.dataset.status = 'error'
    }
  }, [kind])

  return <div ref={host} className={`detail-scene ${className}`} role="img" aria-label={label}
    data-scene-kind={kind} data-scene-status="poster" data-status="poster"
    style={{ position: 'relative', width: '100%', height: '100%', isolation: 'isolate' }}>
    <img className="detail-scene-poster" src={poster} alt="" aria-hidden="true" loading="lazy"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
    <div ref={surface} className="detail-scene-surface" aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
  </div>
})
