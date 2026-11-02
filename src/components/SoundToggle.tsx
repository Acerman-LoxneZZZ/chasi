import type { SoundStatus } from '../audio/MechanismSound'
import { Icon } from './Icon'

export type SoundControl = { enabled: boolean; status: SoundStatus; toggle: () => Promise<void> }
export function SoundToggle({ sound }: { sound: SoundControl }) {
  return <button className="header-button sound-toggle" aria-pressed={sound.enabled} data-sound-status={sound.status}
    aria-label={sound.enabled ? 'Выключить звук механизма' : 'Включить звук механизма'} onClick={() => { void sound.toggle() }}>
    <Icon name={sound.enabled ? 'sound' : 'sound-off'} size={18} /><span>Звук</span>
  </button>
}
