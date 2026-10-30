import { memo, useLayoutEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { finishes, type WatchFinish } from '../data/collection'
import { Icon } from './Icon'

const asset = (name: string) => `${import.meta.env.BASE_URL}images/${name}`

function MovementDrawing() {
  return <svg className="movement-drawing" viewBox="0 0 600 600" fill="none" aria-hidden="true">
    <circle cx="300" cy="300" r="269" stroke="currentColor" strokeWidth=".6" />
    <circle cx="300" cy="300" r="250" stroke="currentColor" strokeWidth=".35" strokeDasharray="1 10" />
    {[{ x: 255, y: 290, r: 116, cls: 'drawing-wheel' }, { x: 410, y: 225, r: 76, cls: 'drawing-pinion' }, { x: 380, y: 405, r: 88, cls: 'drawing-wheel' }].map(({ x, y, r, cls }) => <g key={x} transform={`translate(${x} ${y})`}>
      <g className={cls}>
        <circle r={r} stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 5" />
        <circle r={r - 13} stroke="currentColor" strokeWidth=".7" />
        <circle r="14" stroke="currentColor" />
        {Array.from({ length: 6 }, (_, index) => <path key={index} d={`M21 0H${r - 20}`} stroke="currentColor" strokeWidth="5" transform={`rotate(${index * 60})`} />)}
      </g>
      <circle r="5" fill="currentColor" />
    </g>)}
    <path d="M300 24v36M300 540v36M24 300h36M540 300h36" stroke="currentColor" />
  </svg>
}

export const CollectionPage = memo(function CollectionPage({ finish, onFinish, onView3D }: { finish: WatchFinish; onFinish: (finish: WatchFinish) => void; onView3D: (progress: number) => void }) {
  const root = useRef<HTMLDivElement>(null)
  const [saved, setSaved] = useState(false)
  const selected = finishes.find(item => item.id === finish)!
  useLayoutEffect(() => {
    gsap.registerPlugin(ScrollTrigger)
    const media = gsap.matchMedia()
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const context = gsap.context(() => {
        gsap.fromTo('.collection-portrait img', { yPercent: 7, rotate: -4 }, { yPercent: -5, rotate: 3, ease: 'none', scrollTrigger: { trigger: '.collection-intro', start: 'top bottom', end: 'bottom top', scrub: true } })
        gsap.fromTo('.movement-portrait img', { yPercent: 8 }, { yPercent: -7, ease: 'none', scrollTrigger: { trigger: '.mechanism-section', start: 'top bottom', end: 'bottom top', scrub: true } })
        gsap.to('.drawing-wheel', { rotation: 100, transformOrigin: '0px 0px', ease: 'none', scrollTrigger: { trigger: '.mechanism-section', start: 'top bottom', end: 'bottom top', scrub: true } })
        gsap.to('.drawing-pinion', { rotation: -150, transformOrigin: '0px 0px', ease: 'none', scrollTrigger: { trigger: '.mechanism-section', start: 'top bottom', end: 'bottom top', scrub: true } })
        gsap.fromTo('.material-rule', { scaleX: .1 }, { scaleX: 1, transformOrigin: 'left center', ease: 'none', scrollTrigger: { trigger: '.materials-section', start: 'top 85%', end: 'center center', scrub: true } })
      }, root)
      return () => context.revert()
    })
    return () => media.revert()
  }, [])

  const saveSelection = () => {
    const body = `KARpOV — Карманные часы №01\n\nИсполнение корпуса: ${selected.title}\nЦиферблат: светлая эмаль, римские цифры\nСтрелки: синёная сталь\nИндикация: часы, минуты, малая секунда\nЗавод: ручной\nМеханизм: пружина, колёсная передача, баланс\n\nВыбранная конфигурация. Не является оформленным заказом.\n`
    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url; link.download = `KARpOV-No01-${finish}.txt`; link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setSaved(true)
  }

  return <div ref={root} className="collection-page">
    <section id="design" className="collection-intro paper-section" aria-labelledby="design-title">
      <div className="section-topline"><span>Коллекция №01</span><span>Механические карманные часы</span></div>
      <div className="editorial-grid">
        <div className="editorial-copy"><p className="small-label">Характер KARpOV</p><h2 id="design-title">Не спешить.<br />Замечать.</h2><p className="editorial-lead">Некоторые вещи созданы, чтобы к ним возвращаться.</p><p>Вес в ладони. Прикосновение к головке. Тихая геометрия стрелок. Карманные часы превращают обычный взгляд на время в маленький личный ритуал.</p><a className="editorial-link" href="#selection">Найти своё исполнение <Icon name="arrow" size={19} /></a></div>
        <figure className="collection-portrait"><span className="portrait-ring" aria-hidden="true" /><img src={asset('karpov-product.webp')} width="1400" height="1600" alt="Карманные часы KARpOV с латунным корпусом и светлым циферблатом" loading="lazy" /><figcaption>№01 <span>Латунь / светлая эмаль</span></figcaption></figure>
      </div>
    </section>

    <section id="materials" className="materials-section paper-section" aria-labelledby="materials-title">
      <div className="material-rule" /><div className="materials-heading"><span className="small-label">Встреча материалов</span><h2 id="materials-title">Красота —<br />в различиях.</h2></div>
      <div className="materials-layout"><figure className="material-closeup"><img src={asset('karpov-detail.webp')} width="1200" height="1200" alt="Крупный план циферблата KARpOV: эмаль, римские цифры и синёные стрелки" loading="lazy" /></figure><div className="material-notes">
        <article><span>01</span><div><h3>Светлая эмаль</h3><p>Спокойная поверхность циферблата и тонкие метки оставляют время читаемым с первого взгляда.</p></div></article>
        <article><span>02</span><div><h3>Синёная сталь</h3><p>Глубокий синий оттенок стрелок меняется вместе со светом. Открытая форма делает их визуально лёгкими.</p></div></article>
        <article><span>03</span><div><h3>Обработанный металл</h3><p>Сатинированные плоскости встречаются с полированными кромками. Объём проявляется в отражении.</p></div></article>
      </div></div>
    </section>

    <section id="mechanism" className="mechanism-section" aria-labelledby="mechanism-title">
      <div className="mechanism-heading"><p className="small-label">Скрытая сторона времени</p><h2 id="mechanism-title">У каждого движения<br />есть причина.</h2></div>
      <div className="mechanism-layout"><div className="movement-portrait"><MovementDrawing /><img src={asset('karpov-movement.webp')} width="1400" height="1200" alt="Открытый механизм KARpOV: латунные колёса, пружина, мосты и рубиновые опоры" loading="lazy" /></div><div className="mechanism-copy"><p className="editorial-lead">Энергия становится ритмом.</p><p>Ручной завод передаёт энергию пружине. Затем — колёсам, спуску и балансу. Цепочка простых связей складывается в сложное движение.</p><dl className="mechanism-facts"><div><dt>Источник энергии</dt><dd>Заводная пружина</dd></div><div><dt>Передача</dt><dd>Зубчатые колёса</dd></div><div><dt>Ритм</dt><dd>Баланс и спуск</dd></div></dl><button className="editorial-link" onClick={() => onView3D(.78)}>Рассмотреть в 3D <Icon name="arrow" size={19} /></button></div></div>
    </section>

    <section id="selection" className="selection-section paper-section" aria-labelledby="selection-title">
      <div className="section-topline"><span>Ваши KARpOV</span><span>Коллекция №01</span></div>
      <div className="selection-layout"><div className="selection-portrait">{finishes.map(item => <img key={item.id} className={finish === item.id ? 'is-selected' : ''} src={asset(item.image)} width="1400" height="1600" alt={finish === item.id ? `KARpOV №01 — корпус ${item.title.toLowerCase()}` : ''} aria-hidden={finish !== item.id} loading="lazy" />)}</div><div className="selection-copy"><p className="small-label">Личный выбор</p><h2 id="selection-title">Один предмет.<br />Ваш характер.</h2><p>Выберите отделку корпуса. Светлая эмаль и синёные стрелки сохраняют почерк коллекции.</p><fieldset className="finish-options"><legend>Исполнение корпуса</legend>{finishes.map(item => <label key={item.id} className={finish === item.id ? 'finish-option is-selected' : 'finish-option'}><input type="radio" name="finish" value={item.id} checked={finish === item.id} onChange={() => { onFinish(item.id); setSaved(false) }} /><span className="finish-swatch" style={{ backgroundColor: item.color }} /><span>{item.title}</span><Icon name="check" size={15} /></label>)}</fieldset><p className="finish-caption" aria-live="polite">{selected.caption}</p><div className="selection-actions"><button className="commerce-button" onClick={saveSelection}>Сохранить выбор <Icon name="arrow" size={18} /></button><button className="quiet-button" onClick={() => onView3D(.04)}>Посмотреть в 3D</button></div><p className="selection-note" role="status">{saved ? 'Карточка выбранного исполнения скачана.' : 'Сохраните карточку исполнения, чтобы вернуться к своему выбору.'}</p></div></div>
    </section>

    <section id="specifications" className="specifications-section paper-section" aria-labelledby="specifications-title"><div><p className="small-label">Карманные часы №01</p><h2 id="specifications-title">Ближе<br />к деталям.</h2></div><dl className="specification-list"><div><dt>Формат</dt><dd>Карманные часы</dd></div><div><dt>Завод</dt><dd>Ручной</dd></div><div><dt>Циферблат</dt><dd>Светлая эмаль, римские цифры</dd></div><div><dt>Стрелки</dt><dd>Синёная сталь</dd></div><div><dt>Индикация</dt><dd>Часы, минуты, малая секунда</dd></div><div><dt>Отделка корпуса</dt><dd>{selected.title}</dd></div></dl></section>
    <footer className="commerce-footer"><div className="footer-top"><p>Для времени,<br />которое принадлежит вам.</p><a href="#top">Вернуться к началу <Icon name="arrow" size={18} /></a></div><p className="footer-wordmark" aria-label="KARpOV">KARpOV</p><div className="footer-bottom"><span>Карманная коллекция №01</span><span>Форма. Механика. Характер.</span></div></footer>
  </div>
})
