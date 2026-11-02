import { finishes, type WatchFinish } from './collection'

export function normalizeEngraving(value: string) {
  return value.normalize('NFKC').toLocaleUpperCase('ru-RU').replace(/[^A-ZА-ЯЁ0-9 .·-]/g, '').replace(/ {2,}/g, ' ').trimStart().slice(0, 8)
}

export function selectionCard(finish: WatchFinish, engraving: string) {
  const title = finishes.find(item => item.id === finish)!.title
  const initials = normalizeEngraving(engraving).trim()
  return `KARpOV — Карманные часы №01\n\nИсполнение корпуса: ${title}\nЦиферблат: светлая эмаль, римские цифры\nСтрелки: синёная сталь\nИндикация: часы, минуты, малая секунда\nЗавод: ручной\nМеханизм: пружина, колёсная передача, баланс\nГравировка (примерка): ${initials || 'без гравировки'}\n\nВыбранная конфигурация. Не является оформленным заказом.\n`
}
