import { finishes, type WatchFinish } from '../data/collection'
import { normalizeEngraving } from '../data/personalization'
import { DetailScene } from './DetailScene'
import { Icon } from './Icon'
import { retryWatchDetails } from '../scene/DetailSceneManager'

export function PersonalizationSection({ finish, engraving, onEngraving }: { finish: WatchFinish; engraving: string; onEngraving: (value: string) => void }) {
  return <section id="personalize" className="personalization-section paper-section" aria-labelledby="personalization-title">
    <div className="engraving-view">
      <DetailScene kind="engraving" label={`Задняя крышка часов KARpOV. ${engraving.trim() ? `Примерка гравировки: ${engraving.trim()}.` : 'Без персональной гравировки.'}`} poster={`${import.meta.env.BASE_URL}images/karpov-caseback-${finish}.webp`} />
      <div className="engraving-unavailable" role="status"><p>3D-примерка недоступна. Инициалы сохраняются в карточке.</p><button className="quiet-button" onClick={retryWatchDetails}>Повторить 3D-примерку</button></div>
    </div>
    <div className="engraving-copy">
      <h2 id="personalization-title">Знак,<br />который ваш.</h2>
      <p>Примерьте инициалы на задней крышке. Небольшая деталь, с которой часы становятся личными.</p>
      <div className="engraving-field"><div className="engraving-label"><label htmlFor="engraving-input">Ваши инициалы</label><output htmlFor="engraving-input" aria-live="off">{engraving.length} / 8</output></div>
        <input id="engraving-input" type="text" value={engraving} maxLength={8} placeholder="А.К." autoComplete="off" autoCapitalize="characters" spellCheck={false} aria-describedby="engraving-help" onChange={event => onEngraving(normalizeEngraving(event.target.value))} />
        <p id="engraving-help">До 8 символов: буквы, цифры, пробел или точка. Это визуальная примерка.</p>
      </div>
      <div className="engraving-actions"><button className="quiet-button" disabled={!engraving} onClick={() => onEngraving('')}>Убрать гравировку <Icon name="close" size={14} /></button><a className="editorial-link" href="#selection">К вашему исполнению <Icon name="arrow" size={17} /></a></div>
      <p className="engraving-finish">Крышка: {finishes.find(item => item.id === finish)!.title.toLowerCase()}. Инициалы войдут в сохранённую карточку.</p>
    </div>
  </section>
}
