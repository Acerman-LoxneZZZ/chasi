import { describe, expect, it } from 'vitest'
import { normalizeEngraving, selectionCard } from './personalization'

describe('personal engraving', () => {
  it('accepts Cyrillic and Latin initials, normalizes case, and bounds the physical inscription', () => {
    expect(normalizeEngraving('а.к.')).toBe('А.К.')
    expect(normalizeEngraving('  A  B')).toBe('A B')
    expect(normalizeEngraving('Ａ.Ｂ.')).toBe('A.B.')
    expect(normalizeEngraving('1234567890')).toBe('12345678')
    expect(normalizeEngraving('А😀К\n<>')).toBe('АК')
  })
  it('includes the chosen finish and preview initials in the honest local selection card', () => {
    const card=selectionCard('graphite','а.к.')
    expect(card).toContain('Исполнение корпуса: Графит')
    expect(card).toContain('Гравировка (примерка): А.К.')
    expect(card).toContain('Не является оформленным заказом.')
    expect(selectionCard('steel','')).toContain('Гравировка (примерка): без гравировки')
  })
})
