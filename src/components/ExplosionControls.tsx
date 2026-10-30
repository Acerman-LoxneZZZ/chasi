import type { CSSProperties } from 'react'
import type { ProgressController } from '../animation/progressController'
import { Icon } from './Icon'
import { collectionStopIndex, collectionStops } from '../data/collection'

interface ControlsProps {
  controller: ProgressController
  progress: number
  target: 0 | 1 | null
  ready: boolean
  labels: boolean
  reducedMotion: boolean
  onLabels: () => void
  onReset: () => void
}

export const stageTitle = (progress: number) => ['Знакомство с KARpOV', 'Корпус и отделка', 'Циферблат и стрелки', 'Открытый механизм', 'Все детали одного целого'][collectionStopIndex(progress)]

export function ExplosionControls({ controller, progress, target, ready, labels, reducedMotion, onLabels, onReset }: ControlsProps) {
  const percent = Math.round(progress * 100)
  return <section className="controls-panel" aria-label="Управление экспозицией">
    <div className="controls-main">
      <div className="range-heading"><label htmlFor="explosion-range">Разборка часов</label><output htmlFor="explosion-range" className="percentage" aria-live="off">{percent}<span>%</span></output></div>
      <div className="range-wrap" style={{ '--progress': `${progress * 100}%` } as CSSProperties}>
        <div className="range-track" aria-hidden="true"><span /></div>
        <input id="explosion-range" type="range" min="0" max="100" step="0.1" value={progress * 100} disabled={!ready} aria-valuetext={`${collectionStops[collectionStopIndex(progress)].name}. Положение истории: ${(progress * 100).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} процентов`} aria-describedby="range-help" onChange={event => controller.set(Number(event.target.value) / 100)} />
        <div className="range-ticks" aria-hidden="true"><i /><i /><i /><i /><i /></div>
      </div>
      <div className="range-endpoints"><span>Собраны</span><span>Разобраны</span></div>
      <p id="range-help" className="sr-only">Стрелки перемещают по истории на 0,1 процента. На остановках часы неподвижны. Home возвращает начало, End открывает все слои.</p>
    </div>
    <div className="controls-actions">
      <div className="primary-actions">
        <button className="button button--outline" data-pause-transition={target === 0 || undefined} disabled={!ready || (progress === 0 && target === null)} onClick={() => target === 0 ? controller.pause() : controller.animateTo(0, reducedMotion)}><Icon name={target === 0 ? 'pause' : 'collapse'} size={19} />{target === 0 ? 'Пауза' : 'Собрать'}</button>
        <button className="button button--brass" data-pause-transition={target === 1 || undefined} disabled={!ready || (progress === 1 && target === null)} onClick={() => target === 1 ? controller.pause() : controller.animateTo(1, reducedMotion)}><Icon name={target === 1 ? 'pause' : 'expand'} size={19} />{target === 1 ? 'Пауза' : 'Разобрать'}</button>
      </div>
      <div className="secondary-actions">
        <button className="text-action" disabled={!ready} onClick={onReset}><Icon name="reset" size={16} />Сбросить вид</button>
        <label className={`labels-toggle ${!ready ? 'is-disabled' : ''}`}><input type="checkbox" checked={labels} disabled={!ready} onChange={onLabels} /><span className="toggle-track" aria-hidden="true"><span /></span><span>Подписи деталей</span></label>
      </div>
    </div>
  </section>
}
