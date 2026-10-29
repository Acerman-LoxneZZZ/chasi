import { memo, useEffect, useRef, useState } from 'react'
import type { ProgressController } from '../animation/progressController'
import { WatchScene } from '../scene/WatchScene'
import type { SceneStatus, WatchPart } from '../types'
import { Icon } from './Icon'

interface ExperienceProps {
  parts: WatchPart[]
  controller: ProgressController
  labels: boolean
  selected: string | null
  resetKey: number
  onSelect: (id: string | null) => void
  onStatus: (status: SceneStatus) => void
}

export const Experience = memo(function Experience(props: ExperienceProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const labelRoot = useRef<HTMLDivElement>(null)
  const engine = useRef<WatchScene | null>(null)
  const callbacks = useRef(props)
  callbacks.current = props
  const [generation, setGeneration] = useState(0)
  const [status, setStatus] = useState<SceneStatus>('loading')
  const [loadingPercent, setLoadingPercent] = useState<number | null>(null)
  const [detail, setDetail] = useState('')

  useEffect(() => {
    let active = true
    let contextLost = false
    let scene: WatchScene | null = null
    const report = (value: SceneStatus) => {
      if (!active) return
      setStatus(value)
      callbacks.current.onStatus(value)
    }
    setLoadingPercent(null)
    report('loading')
    try {
      scene = new WatchScene(canvas.current!, labelRoot.current!, props.parts, props.controller, {
        select: id => callbacks.current.onSelect(id),
        loading: value => { if (active) setLoadingPercent(value) },
        lost: () => { contextLost = true; report('context-lost') },
        restored: () => { if (active) setGeneration(value => value + 1) },
      })
      engine.current = scene
      scene.load().then(() => {
        if (!active || contextLost) return
        scene!.setLabels(callbacks.current.labels)
        scene!.select(callbacks.current.selected)
        report('ready')
      }).catch((error: unknown) => {
        if (!active || contextLost) return
        setDetail(error instanceof Error && error.name === 'AbortError' ? 'Загрузка заняла слишком много времени.' : 'Проверьте соединение и попробуйте ещё раз.')
        props.controller.pause()
        report('error')
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      const unsupported = /webgl|context/i.test(message)
      setDetail(unsupported ? 'Для интерактивной разборки нужен браузер с поддержкой WebGL 2.' : 'Не удалось подготовить 3D-сцену. Попробуйте загрузить её ещё раз.')
      report(unsupported ? 'unsupported' : 'error')
    }
    return () => { active = false; scene?.dispose(); engine.current = null }
  }, [generation, props.parts, props.controller])

  useEffect(() => { engine.current?.setLabels(props.labels) }, [props.labels])
  useEffect(() => { engine.current?.select(props.selected) }, [props.selected])
  useEffect(() => { engine.current?.resetCamera() }, [props.resetKey])

  const failed = status === 'error' || status === 'unsupported' || status === 'context-lost'
  return <div className={`experience ${failed ? 'experience--fallback' : ''}`} data-status={status} aria-busy={status === 'loading'}>
    <div className="stage-orbit stage-orbit--outer" aria-hidden="true" />
    <div className="stage-orbit stage-orbit--inner" aria-hidden="true" />
    <div className="canvas-wrap">
      <canvas key={generation} ref={canvas} className="watch-canvas" role="img" aria-label="Объёмная модель карманных часов. Двигайте ползунок ниже, чтобы отделить корпус, циферблат и узлы механизма. Перетаскивайте модель для вращения." aria-describedby="scene-instructions" />
      <div ref={labelRoot} className="scene-labels" aria-hidden="true" />
    </div>
    {status === 'loading' && <div className="loading-state" role="status">
      <div className="loading-dial" aria-hidden="true"><span /></div>
      <p>Готовим экспозицию<span className="loading-percent">{loadingPercent === null ? '…' : ` ${loadingPercent}%`}</span></p>
      <span>Загружаем модель часов</span>
    </div>}
    {failed && <div className="fallback-state">
      <img className="watch-fallback" src={`${import.meta.env.BASE_URL}images/watch-fallback.webp`} alt="Карманные часы с латунным корпусом, светлым циферблатом и синёными стрелками" />
      <div className="scene-message" role="alert">
        <p>{status === 'context-lost' ? 'Отображение 3D приостановлено' : status === 'unsupported' ? 'Просмотр без 3D' : 'Модель не загрузилась'}</p>
        <span>{status === 'context-lost' ? 'Графический контекст потерян. Восстановите сцену, чтобы продолжить исследование.' : detail}</span>
        <button className="button button--outline" onClick={() => setGeneration(value => value + 1)}><Icon name="reset" size={17} />{status === 'context-lost' ? 'Восстановить сцену' : 'Повторить загрузку'}</button>
      </div>
    </div>}
    <div className="stage-caption" aria-hidden="true"><span className="status-dot" />{status === 'ready' ? 'Вращайте. Приближайте. Исследуйте.' : failed ? 'Карманные механические часы' : 'Каждая деталь на своём месте'}</div>
  </div>
})
