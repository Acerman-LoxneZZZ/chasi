import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { ProgressController } from '../animation/progressController'
import { ScrollCoordinator } from '../animation/scrollCoordinator'
import { storyStageIndex, storyStages } from '../data/story'
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

export function App() {
  const reducedMotion = useReducedMotion()
  const controller = useMemo(() => new ProgressController(), [])
  const coordinator = useMemo(() => new ScrollCoordinator(controller, window.matchMedia('(prefers-reduced-motion: reduce)').matches), [controller])
  const { progress, target } = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const { mode, compact } = useSyncExternalStore(coordinator.subscribe, coordinator.getSnapshot)
  const storySection = useRef<HTMLElement>(null)
  const storyPin = useRef<HTMLDivElement>(null)
  const tools = useRef<HTMLDetailsElement>(null)
  const detailDialog = useRef<HTMLDialogElement>(null)
  const [status, setStatus] = useState<SceneStatus>('loading')
  const [labels, setLabels] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [resetKey, setResetKey] = useState(0)
  const ready = status === 'ready'
  const currentPart = parts.find(part => part.id === selected) ?? null
  const chapter = storyStageIndex(progress)
  const stage = storyStages[chapter]

  const openDetails = useCallback(() => {
    coordinator.inspect()
    if (tools.current) tools.current.open = false
    if (detailDialog.current && !detailDialog.current.open) detailDialog.current.showModal()
  }, [coordinator])
  const choosePart = useCallback((id: string | null) => {
    setSelected(id)
    if (id) openDetails()
  }, [openDetails])
  const revealControls = () => {
    if (tools.current) tools.current.open = true
    requestAnimationFrame(() => document.getElementById('explosion-range')?.focus({ preventScroll: true }))
  }
  const closeControls = () => {
    if (tools.current) {
      tools.current.open = false
      tools.current.querySelector('summary')?.focus({ preventScroll: true })
    }
  }
  const changeMode = () => {
    if (tools.current) tools.current.open = false
    if (mode === 'story') coordinator.inspect()
    else coordinator.resume()
  }

  useEffect(() => () => controller.dispose(), [controller])
  useLayoutEffect(() => {
    coordinator.connect(storySection.current!, storyPin.current!)
    return () => coordinator.dispose()
  }, [coordinator])
  useEffect(() => { if (reducedMotion) coordinator.reduceMotion() }, [reducedMotion, coordinator])
  useEffect(() => {
    if (status === 'error' || status === 'unsupported') coordinator.reduceMotion()
    if (status === 'error' || status === 'unsupported' || status === 'context-lost') detailDialog.current?.close()
  }, [status, coordinator])
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (tools.current?.open && event.target instanceof Node && !tools.current.contains(event.target)) tools.current.open = false
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && tools.current?.open) {
        tools.current.open = false
        tools.current.querySelector('summary')?.focus({ preventScroll: true })
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [])

  return <>
    <a className="skip-link" href="#explosion-range" onClick={event => { event.preventDefault(); revealControls() }}>К управлению часами</a>
    <header className="site-header">
      <a className="brand" href="#top" aria-label="Ход времени — начало истории"><WatchMark /><span>Ход времени</span></a>
      <nav aria-label="Управление просмотром">
        <button className="header-button details-button" aria-label="Детали часов" disabled={!ready} onClick={openDetails}><Icon name="layers" size={17} /><span>Детали</span></button>
        <button className="header-button mode-button" disabled={!ready} onClick={changeMode}><span className="mode-dot" aria-hidden="true" /><span>{mode === 'story' ? 'Рассмотреть' : 'Продолжить историю'}</span></button>
      </nav>
    </header>

    <main id="top">
      <section ref={storySection} id="explore" className={`watch-story ${compact ? 'watch-story--compact' : ''}`} data-mode={mode} aria-labelledby="hero-title">
        <div ref={storyPin} className="story-pin">
          <div className="story-heading sr-only">
            <h1 id="hero-title">{stage.title}</h1>
            <p id="scene-instructions">{mode === 'story' ? 'Прокручивайте страницу: часы поворачиваются и раскрывают механизм. ' + stage.subtitle : 'Перетаскивайте часы для вращения. Откройте управление, чтобы изменить степень разборки.'}</p>
          </div>
          <div className="story-stage">
            <Experience parts={parts} controller={controller} mode={mode} reducedMotion={reducedMotion} labels={labels} selected={selected} resetKey={resetKey} onSelect={choosePart} onStatus={setStatus} />
          </div>
          <div className="exhibit-dock">
            <div className="dock-left">
              <details ref={tools} className="exhibit-tools">
                <summary><Icon name="layers" size={17} /><span>Управление</span><span className="tools-plus" aria-hidden="true">+</span></summary>
                <div className="controls-popover">
                  <div className="popover-heading"><span>{mode === 'story' ? 'История' : 'Свободный просмотр'}</span><button className="icon-button" aria-label="Закрыть управление" onClick={closeControls}><Icon name="close" size={16} /></button></div>
                  <ExplosionControls controller={controller} progress={progress} target={target} ready={ready} labels={labels} reducedMotion={reducedMotion} onLabels={() => setLabels(value => !value)} onReset={() => setResetKey(value => value + 1)} />
                  <p className="controls-state">{ready ? stageTitle(progress) : status === 'loading' ? 'Подготавливаем модель' : 'Управление 3D недоступно'}</p>
                </div>
              </details>
              <span className="scroll-cue" aria-hidden="true"><span className="scroll-stroke" />{mode === 'manual' ? 'Свободное вращение' : progress > .98 ? 'Прокрутите обратно' : 'Прокрутите, чтобы заглянуть внутрь'}</span>
            </div>
            <div className="exhibit-progress" aria-hidden="true"><span className="chapter-count">{String(chapter + 1).padStart(2, '0')}<span> / 06</span></span><output aria-live="off">{Math.round(progress * 100)}<span>%</span></output></div>
          </div>
          <div className="story-hairline" aria-hidden="true"><span style={{ width: `${progress * 100}%` }} /></div>
          <div className="sr-only" role="status" aria-live="polite">{ready ? stageTitle(progress) : status === 'loading' ? 'Модель загружается' : 'Модель недоступна'}</div>
        </div>
      </section>
    </main>

    <dialog ref={detailDialog} className="detail-dialog" aria-labelledby="parts-title" onClick={event => { if (event.target === detailDialog.current) detailDialog.current.close() }}>
      <div className="drawer-content">
        <div className="drawer-heading"><div><span className="section-kicker">47 частей одного целого</span><h2 id="parts-title">Устройство часов</h2></div><button className="icon-button" aria-label="Закрыть детали" onClick={() => detailDialog.current?.close()}><Icon name="close" size={20} /></button></div>
        <div className="drawer-info"><PartInfo part={currentPart} progress={progress} onClose={() => setSelected(null)} /></div>
        <PartList parts={parts} selected={selected} ready={ready} onSelect={choosePart} />
      </div>
    </dialog>
  </>
}
