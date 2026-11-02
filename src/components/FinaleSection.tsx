import { useCallback, useState } from 'react'
import { evaluateFinale } from '../animation/finaleTimeline'
import type { WatchFinish } from '../data/collection'
import { DetailScene } from './DetailScene'
import { Icon } from './Icon'
import { SoundToggle, type SoundControl } from './SoundToggle'

export function FinaleSection({ finish, reducedMotion, onReplay, sound }: { finish: WatchFinish; reducedMotion: boolean; onReplay: () => void; sound: SoundControl }) {
  const [progress, setProgress] = useState(0)
  const changed = useCallback((value: number) => setProgress(value), [])
  const signature = evaluateFinale(progress, reducedMotion).signature
  return <section id="finale" className={`watch-finale ${reducedMotion ? 'watch-finale--reduced' : ''}`} aria-label="Часы снова становятся целым">
    <div className="finale-pin">
      <div className="finale-stage"><DetailScene kind="assembly" label="Живая финальная сборка карманных часов KARpOV" poster={`${import.meta.env.BASE_URL}images/karpov-finale-${finish}.webp`} onProgress={changed} /></div>
      <div className="finale-copy" style={{ opacity: signature }} aria-hidden={signature === 0} inert={signature === 0}>
        <p className="finale-wordmark">KARpOV</p><p className="finale-line">Для времени, которое принадлежит вам.</p>
        <div className="finale-actions"><button className="finale-replay" onClick={onReplay}>Повторить историю <Icon name="reset" size={17} /></button><SoundToggle sound={sound} /></div>
      </div>
    </div>
  </section>
}
