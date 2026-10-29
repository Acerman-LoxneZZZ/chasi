import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { ProgressController } from '../animation/progressController'
import { Experience } from '../components/Experience'
import { ExplosionControls, stageTitle } from '../components/ExplosionControls'
import { Icon, WatchMark } from '../components/Icon'
import { PartInfo } from '../components/PartInfo'
import { PartList } from '../components/PartList'
import rawParts from '../data/watch-parts.json'
import type { SceneStatus, WatchPart } from '../types'

const parts = rawParts as WatchPart[]

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const changed = () => setReduced(query.matches)
    query.addEventListener('change', changed)
    return () => query.removeEventListener('change', changed)
  }, [])
  return reduced
}

const journey = [
  { title: 'Энергия', description: 'Заводная пружина запасает энергию и постепенно отдаёт её механизму.', nodeName: 'mainspring_barrel', kind: 'spring' },
  { title: 'Движение', description: 'Колёсная передача связывает пружину со стрелками и передаёт вращение.', nodeName: 'gear_center', kind: 'gear' },
  { title: 'Ритм', description: 'Спуск и баланс дозируют энергию, задавая равномерный ход.', nodeName: 'balance_assembly', kind: 'balance' },
  { title: 'Время', description: 'Стрелки превращают движение механизма в часы, минуты и секунды.', nodeName: 'dial_face', kind: 'dial' },
]

function MechanismIcon({ kind }: { kind: string }) {
  return <svg viewBox="0 0 64 64" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true">
    {kind === 'spring' ? <><circle cx="32" cy="32" r="22"/><path d="M32 12c-27 0-27 40 0 40s24-34 0-34-21 28 0 28 17-22 0-22-12 16 0 16 8-10 0-10v-5"/></> : kind === 'gear' ? <><circle cx="32" cy="32" r="17"/><circle cx="32" cy="32" r="5"/>{Array.from({ length: 12 }, (_, i) => <path key={i} d="M29 15v-5h6v5" transform={`rotate(${i * 30} 32 32)`}/>)}<path d="m32 15 0 12m0 10v12M15 32h12m10 0h12"/></> : kind === 'balance' ? <><circle cx="32" cy="32" r="22"/><circle cx="32" cy="32" r="17"/><circle cx="32" cy="32" r="4"/><path d="M32 10v18m0 8v18M10 32h18m8 0h18M19 21l-4-5m30 5 4-5M19 43l-4 5m30-5 4 5"/></> : <><circle cx="32" cy="32" r="22"/><path d="M32 14v4m0 28v4M14 32h4m28 0h4M32 32l-8-9m8 9 12-12"/><circle cx="32" cy="32" r="2"/></>}
  </svg>
}

export function App() {
  const controller = useMemo(() => new ProgressController(), [])
  const { progress, target } = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const [status, setStatus] = useState<SceneStatus>('loading')
  const [labels, setLabels] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [resetKey, setResetKey] = useState(0)
  const reducedMotion = useReducedMotion()
  const ready = status === 'ready'
  const currentPart = parts.find(part => part.id === selected) ?? null
  const choosePart = useCallback((id: string | null) => setSelected(id), [])

  useEffect(() => () => controller.dispose(), [controller])
  useEffect(() => {
    if (reducedMotion) controller.pause()
  }, [reducedMotion, controller])

  const selectFromJourney = (nodeName: string) => {
    const part = parts.find(part => part.nodeName === nodeName)
    if (!part || !ready) return
    setSelected(part.id)
    document.getElementById('explore')?.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' })
  }

  return <>
    <a className="skip-link" href="#explosion-range">К управлению разборкой</a>
    <header className="site-header page-width">
      <a className="brand" href="#top" aria-label="Ход времени — начало страницы"><WatchMark /><span>Ход времени</span></a>
      <span className="header-caption">Интерактивная экспозиция</span>
      <nav aria-label="Основная навигация"><a href="#anatomy">Устройство</a><a href="#about">О проекте <Icon name="arrow" size={16} /></a></nav>
    </header>

    <main id="top">
      <section id="explore" className="hero page-width" aria-labelledby="hero-title">
        <div className="hero-copy">
          <div className="object-type"><span />Карманные механические часы</div>
          <h1 id="hero-title">Время<br />раскрывается.</h1>
          <p className="hero-description">Разберите часы одним движением.<br className="desktop-break" /> Узнайте, что заставляет время идти.</p>
          <a className="discover-link" href="#explosion-range">Заглянуть внутрь <span><Icon name="arrow" size={18} /></span></a>
          <div className="hero-instructions" id="scene-instructions"><span className="instruction-icon"><Icon name="rotate" size={23} /></span><p>Перетаскивайте часы, чтобы повернуть.<br />Двигайте ползунок, чтобы разобрать.</p></div>
          {currentPart && <aside className="hero-selected-part" aria-hidden="true"><h3>{currentPart.title}</h3><p>{currentPart.description}</p><span>{currentPart.materialLabel}</span></aside>}
        </div>
        <div className="hero-stage">
          <div className="scene-meta"><span>Предмет исследования</span><span>Механические часы</span></div>
          <Experience parts={parts} controller={controller} labels={labels} selected={selected} resetKey={resetKey} onSelect={choosePart} onStatus={setStatus} />
          <div className="stage-footnote"><span className="stage-counter">{String(parts.length).padStart(2, '0')} <span>деталей</span></span><span>Один слаженный механизм</span></div>
        </div>
        <div className="hero-controls">
          <ExplosionControls controller={controller} progress={progress} target={target} ready={ready} labels={labels} reducedMotion={reducedMotion} onLabels={() => setLabels(value => !value)} onReset={() => setResetKey(value => value + 1)} />
          <div className="controls-footer"><span className={`scene-status ${target !== null ? 'scene-status--active' : ''}`}><span />{ready ? stageTitle(progress) : status === 'loading' ? 'Подготавливаем модель' : 'Управление 3D недоступно'}</span><span>Остановитесь в любом положении</span></div>
          <div className="sr-only" role="status" aria-live="polite">{ready ? stageTitle(progress) : status === 'loading' ? 'Модель загружается' : 'Модель недоступна'}</div>
        </div>
      </section>

      <section className="anatomy-section page-width" id="anatomy" aria-labelledby="anatomy-title">
        <div className="anatomy-heading"><div><span className="section-kicker">Исследуйте детали</span><h2 id="anatomy-title">Маленький мир внутри.</h2></div><p>От внешнего контура до тончайшей пружины —<br className="desktop-break" /> у каждого узла есть своё назначение.</p></div>
        <div className="anatomy-layout"><PartList parts={parts} selected={selected} ready={ready} onSelect={choosePart} /><div className="anatomy-part-description"><PartInfo part={currentPart} progress={progress} onClose={() => setSelected(null)} /></div></div>
      </section>

      <section className="inside-section page-width" aria-labelledby="inside-title">
        <div className="inside-heading"><span className="section-kicker">От пружины к стрелкам</span><h2 id="inside-title">Что скрыто внутри</h2><p>Четыре шага, которые превращают запас энергии в движение времени.</p></div>
        <ol className="energy-journey">{journey.map((step, index) => <li key={step.title} className="journey-step"><div className="journey-symbol"><MechanismIcon kind={step.kind} />{index < journey.length - 1 && <span className="journey-connector" aria-hidden="true"><Icon name="arrow" size={20} /></span>}</div><div className="journey-title"><span>0{index + 1}</span><h3>{step.title}</h3></div><p>{step.description}</p><button className="journey-link" disabled={!ready} onClick={() => selectFromJourney(step.nodeName)}>Найти в модели<Icon name="arrow" size={16} /></button></li>)}</ol>
      </section>

      <section className="about-section page-width" id="about" aria-labelledby="about-title"><WatchMark className="about-mark" /><div><h2 id="about-title">Время — в деталях.</h2><p>«Ход времени» — цифровая экспозиция о красоте простой механики. Авторская демонстрационная модель помогает понять устройство часов и не служит инструкцией по ремонту конкретного механизма.</p></div><a className="back-to-model" href="#explore">Вернуться к часам <Icon name="arrow" size={19} /></a></section>
    </main>

    <footer className="site-footer page-width"><span>Ход времени</span><span>Создано, чтобы рассматривать.</span><a href="#top">Наверх <span aria-hidden="true">↑</span></a></footer>
  </>
}
