import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { ProgressController } from '../animation/progressController'
import { ScrollCoordinator } from '../animation/scrollCoordinator'
import { collectionStops, collectionStopIndex, finishes, type WatchFinish } from '../data/collection'
import { CollectionPage } from '../components/CollectionPage'
import { evaluateStoryPose, storyCaptionOpacity } from '../animation/storyTimeline'
import { useCinemaControls } from './useCinemaControls'
import { Experience } from '../components/Experience'
import { ExplosionControls, stageTitle } from '../components/ExplosionControls'
import { Icon } from '../components/Icon'
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
  const cinemaControls = useCinemaControls(tools)
  const detailDialog = useRef<HTMLDialogElement>(null)
  const [status, setStatus] = useState<SceneStatus>('loading')
  const [labels, setLabels] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [resetKey, setResetKey] = useState(0)
  const [storyVisible, setStoryVisible] = useState(true)
  const ready = status === 'ready'
  const immersive = ready && storyVisible && mode === 'story' && !reducedMotion
  const captionOpacity = immersive ? storyCaptionOpacity(progress) : 1
  const currentPart = parts.find(part => part.id === selected) ?? null
  const chapter = collectionStopIndex(progress)
  const stage = collectionStops[chapter]
  const [finish, setFinish] = useState<WatchFinish>(() => {
    try { const stored = localStorage.getItem('karpov:finish'); if (finishes.some(item => item.id === stored)) return stored as WatchFinish } catch { /* Storage is optional. */ }
    return 'brass'
  })
  const displayedPart = currentPart && currentPart.category === 'case' && finish !== 'brass'
    ? { ...currentPart, materialLabel: `Отделка корпуса: ${finishes.find(item => item.id === finish)!.title}` }
    : currentPart
  useEffect(() => { try { localStorage.setItem('karpov:finish', finish) } catch { /* Selection remains usable. */ } }, [finish])
  const viewIn3D = useCallback((value: number) => {
    const focusStop = () => {
      const index = collectionStops.findIndex(stop => Math.abs(stop.at - value) < .001)
      document.querySelectorAll<HTMLButtonElement>('.station-nav button')[index]?.focus({ preventScroll: true })
    }
    if (ready && !reducedMotion) {
      if (coordinator.getSnapshot().mode === 'manual') {
        coordinator.resume()
        requestAnimationFrame(() => { coordinator.navigateTo(value); focusStop() })
      } else { coordinator.navigateTo(value); focusStop() }
      return
    }
    controller.set(value)
    requestAnimationFrame(() => {
      const section = storySection.current
      if (section) window.scrollTo({ top: Number(section.dataset.storyStart), behavior: 'instant' })
      focusStop()
    })
  }, [controller, coordinator, ready, reducedMotion])

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
  const playStory = () => {
    if (target !== null) { controller.pause(); return }
    const play = () => {
      if (progress > .995) controller.set(0)
      controller.animateTo(1, reducedMotion)
    }
    if (mode === 'manual' && !reducedMotion) {
      coordinator.resume()
      requestAnimationFrame(play)
    } else play()
  }

  useEffect(() => () => controller.dispose(), [controller])
  useLayoutEffect(() => {
    coordinator.connect(storySection.current!, storyPin.current!)
    return () => coordinator.dispose()
  }, [coordinator])
  useEffect(() => { if (reducedMotion) coordinator.reduceMotion() }, [reducedMotion, coordinator])
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setStoryVisible(entry.isIntersecting), { rootMargin: '-90px 0px 0px 0px' })
    if (storyPin.current) observer.observe(storyPin.current)
    return () => observer.disconnect()
  }, [])
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

  return <div className="karpov-site" data-immersive={immersive} data-cinema-ui={cinemaControls ? 'visible' : 'hidden'}>
    <a className="skip-link" href="#explosion-range" onClick={event => { event.preventDefault(); revealControls() }}>К управлению часами</a>
    <header className={`site-header ${storyVisible ? '' : 'site-header--editorial'}`}>
      <a className="brand karpov-wordmark" href="#top" aria-label="KARpOV — начало коллекции">KARpOV</a>
      <div className="desktop-menu"><a href="#design">Коллекция</a><a href="#materials">Материалы</a><a href="#mechanism">Механика</a></div>
      <nav aria-label="Управление просмотром">
        <button className="header-button details-button" aria-label="Детали часов" disabled={!ready} onClick={openDetails}><Icon name="layers" size={17} /><span>Детали</span></button>
        <button className="header-button mode-button" disabled={!ready} onClick={changeMode}><span className="mode-dot" aria-hidden="true" /><span>{mode === 'story' ? 'Рассмотреть' : 'Продолжить историю'}</span></button>
        <a className="header-selection" href="#selection">Выбрать часы <Icon name="arrow" size={15} /></a>
      </nav>
    </header>

    <main id="top">
      <section ref={storySection} id="explore" className={`watch-story ${compact ? 'watch-story--compact' : ''}`} data-mode={mode} aria-labelledby="hero-title">
        <div ref={storyPin} className="story-pin">
          <h1 id="hero-title" className="sr-only">KARpOV. Карманные часы №01</h1>
          <div className="story-heading sr-only"><p id="scene-instructions">{mode === 'story' ? 'Прокручивайте страницу: часы поворачиваются и останавливаются для знакомства с деталями.' : 'Перетаскивайте часы для вращения. Ползунок меняет ход истории.'}</p></div>
          <div className="station-copy" data-station={chapter} data-caption-visible={captionOpacity > 0} aria-hidden={captionOpacity === 0} inert={captionOpacity === 0} style={{ opacity: captionOpacity, transform: `translateY(${(1 - captionOpacity) * 10}px)` }}><div className="station-copy-inner">
            <h2>{stage.title[0]}<br />{stage.title[1]}</h2>
            <p className="station-description">{stage.text}</p>
            <div className="station-fact"><strong>{chapter === 1 ? finishes.find(item => item.id === finish)!.title : stage.fact}</strong><span>{stage.detail}</span></div>
            <p className="station-note">{stage.note}</p>
            {chapter === 0 && <a className="station-link" href="#selection">Выбрать исполнение <Icon name="arrow" size={18} /></a>}
            {chapter === 4 && <a className="station-link" href="#design">Продолжить знакомство <Icon name="arrow" size={18} /></a>}
          </div></div>
          <div className="story-stage">
            <Experience parts={parts} controller={controller} mode={mode} reducedMotion={reducedMotion} labels={labels} selected={selected} resetKey={resetKey} finish={finish} onSelect={choosePart} onStatus={setStatus} />
          </div>
          <div className="exhibit-dock">
            <div className="dock-left">
              <button className="film-button" disabled={!ready} data-pause-transition={target !== null || undefined} onClick={event => { playStory(); if (event.detail) event.currentTarget.blur() }} aria-label={target !== null ? 'Пауза просмотра' : progress > .995 ? 'Смотреть историю снова' : 'Смотреть историю'}><Icon name={target !== null ? 'pause' : 'play'} size={17} /><span>{target !== null ? 'Пауза' : progress > .995 ? 'Смотреть снова' : 'Смотреть историю'}</span></button>
              <details ref={tools} className="exhibit-tools">
                <summary><Icon name="layers" size={17} /><span>Управление</span><span className="tools-plus" aria-hidden="true">+</span></summary>
                <div className="controls-popover" data-lenis-prevent>
                  <div className="popover-heading"><span>{mode === 'story' ? 'История' : 'Свободный просмотр'}</span><button className="icon-button" aria-label="Закрыть управление" onClick={closeControls}><Icon name="close" size={16} /></button></div>
                  <button className="popover-mode quiet-button" onClick={changeMode}>{mode === 'story' ? 'Свободный просмотр' : 'Продолжить историю'}</button>
                  <ExplosionControls controller={controller} progress={progress} target={target} ready={ready} labels={labels} reducedMotion={reducedMotion} onLabels={() => setLabels(value => !value)} onReset={() => setResetKey(value => value + 1)} />
                  <p className="controls-state">{ready ? stageTitle(progress) : status === 'loading' ? 'Подготавливаем модель' : 'Управление 3D недоступно'}</p>
                </div>
              </details>
              <span className="scroll-cue" aria-hidden="true"><span className="scroll-stroke" />{mode === 'manual' ? 'Свободное вращение' : progress > .98 ? 'Прокрутите обратно' : 'Прокрутите, чтобы заглянуть внутрь'}</span>
            </div>
            <nav className="station-nav" aria-label="Остановки знакомства с часами">{collectionStops.map((stop, index) => <button key={stop.name} aria-current={index === chapter ? 'step' : undefined} aria-label={`Остановка ${index + 1}: ${stop.name}`} disabled={!ready} onClick={event => { viewIn3D(stop.at); if (event.detail) event.currentTarget.blur() }}><span className="station-dot" /><span>{stop.name}</span></button>)}</nav>
            <div className="exhibit-progress" aria-hidden="true"><span className="chapter-count">{String(chapter + 1).padStart(2, '0')}<span> / 05</span></span><output aria-live="off">{Math.round(progress * 100)}<span>%</span></output></div>
          </div>
          <div className="story-hairline" aria-hidden="true"><span style={{ width: `${progress * 100}%` }} /></div>
          <div className="sr-only" role="status" aria-live="polite">{ready ? stageTitle(progress) : status === 'loading' ? 'Модель загружается' : 'Модель недоступна'}</div>
        </div>
      </section>
      <CollectionPage finish={finish} onFinish={setFinish} onView3D={viewIn3D} />
    </main>

    <dialog ref={detailDialog} className="detail-dialog" data-lenis-prevent aria-labelledby="parts-title" onClick={event => { if (event.target === detailDialog.current) detailDialog.current.close() }}>
      <div className="drawer-content">
        <div className="drawer-heading"><div><span className="section-kicker">47 частей одного целого</span><h2 id="parts-title">Устройство часов</h2></div><button className="icon-button" aria-label="Закрыть детали" onClick={() => detailDialog.current?.close()}><Icon name="close" size={20} /></button></div>
        <div className="drawer-info"><PartInfo part={displayedPart} progress={evaluateStoryPose(progress)} onClose={() => setSelected(null)} /></div>
        <PartList parts={parts} selected={selected} ready={ready} onSelect={choosePart} />
      </div>
    </dialog>
  </div>
}
