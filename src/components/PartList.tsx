import type { WatchPart } from '../types'
import { Icon } from './Icon'

const mainNames = ['case_body', 'front_bezel', 'front_glass', 'dial_face', 'hand_hour', 'hand_minute', 'mainspring_barrel', 'gear_center', 'balance_assembly', 'movement_mainplate', 'movement_bridge_upper', 'back_cover', 'crown']

export function PartList({ parts, selected, onSelect, ready }: { parts: WatchPart[]; selected: string | null; onSelect: (id: string | null) => void; ready: boolean }) {
  const mainParts = mainNames.map(name => parts.find(part => part.nodeName === name)).filter((part): part is WatchPart => Boolean(part?.selectable))
  return <ul className="part-list" aria-label="Основные узлы часов">
    {mainParts.map(part => <li key={part.id}><button className={`part-chip ${selected === part.id ? 'part-chip--selected' : ''}`} aria-pressed={selected === part.id} disabled={!ready} onClick={() => onSelect(selected === part.id ? null : part.id)}>{part.title}<Icon name={selected === part.id ? 'close' : 'chevron'} size={15} /></button></li>)}
  </ul>
}
