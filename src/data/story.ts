export const storyStages = [
  { title: 'Ход времени', subtitle: 'Прокрутите, чтобы заглянуть внутрь', nodes: [] },
  { title: 'Снаружи — защита', subtitle: 'Ободок и стекло берегут циферблат. Крышка закрывает механизм.', nodes: ['front_bezel', 'back_cover'] },
  { title: 'Время на циферблате', subtitle: 'Стрелки и эмалевый циферблат превращают вращение в показание.', nodes: ['dial_face', 'hand_minute'] },
  { title: 'От колеса к колесу', subtitle: 'Под мостами открывается передача — связь пружины со стрелками.', nodes: ['movement_bridge_upper', 'gear_center'] },
  { title: 'Энергия и ритм', subtitle: 'Пружина запасает энергию. Баланс помогает регулировать ход.', nodes: ['mainspring', 'balance_assembly'] },
  { title: 'Один слаженный механизм', subtitle: '47 узлов работают вместе. Прокрутите обратно, чтобы собрать часы.', nodes: ['mainspring_barrel', 'jewel_setting_3'] },
] as const

// Midpoints between the six key poses; no time-dependent label toggles.
export const storyStageIndex = (progress: number) => Math.min(5, Math.max(0, Math.floor((progress + 0.1) * 5 + 1e-7)))

export const shortFunctions: Record<string, string> = {
  front_bezel: 'Держит стекло и обрамляет эмаль.',
  front_glass: 'Прозрачная линза защищает стрелки.',
  back_cover: 'Закрывает механизм с обратной стороны.',
  dial_face: 'Превращает вращение стрелок в показание.',
  hand_minute: 'Показывает минуты над светлой эмалью.',
  hand_hour: 'Проходит полный круг за двенадцать часов.',
  movement_bridge_upper: 'Удерживает верхние опоры колёс.',
  gear_center: 'Связывает барабан со стрелочным механизмом.',
  balance_assembly: 'Помогает регулировать равномерный ход.',
  mainspring: 'Запасает энергию при заводе часов.',
  mainspring_barrel: 'Передаёт энергию пружины колёсной передаче.',
  jewel_setting_3: 'Рубин уменьшает трение в опоре оси.',
}
