import type { WatchPart } from '../types'
import { Icon } from './Icon'

export function PartInfo({ part, progress, onClose }: { part: WatchPart | null; progress: number; onClose: () => void }) {
  return <div className={`part-info ${part ? 'part-info--selected' : ''}`} aria-live="polite" aria-atomic="true">
    {part ? <>
      <div className="part-info-heading"><span className="part-info-dot" /><h3>{part.title}</h3><button className="icon-button" aria-label="Снять выделение детали" onClick={onClose}><Icon name="close" size={18} /></button></div>
      <p>{part.description}</p>
      <span className="part-material">{part.materialLabel}</span>
      {part.category === 'movement' && progress < 0.5 && <span className="part-note">Раскройте часы, чтобы увидеть этот узел.</span>}
    </> : <>
      <div className="part-info-heading"><Icon name="cursor" size={19} /><h3>У каждой детали — своя роль</h3></div>
      <p>Нажмите на деталь в модели или выберите узел ниже, чтобы узнать, как он работает.</p>
    </>}
  </div>
}
