import type { PartPose, WatchPart } from '../types'

export const clampProgress = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0

export const createPose = (): PartPose => ({ position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] })

/** Absolute, allocation-free pose evaluation. The same progress always gives the same pose. */
export function evaluatePartTransform(part: WatchPart, progress: number, out: PartPose = createPose()): PartPose {
  const p = clampProgress(progress)
  const u = part.end > part.start ? Math.max(0, Math.min(1, (p - part.start) / (part.end - part.start))) : 0
  const e = u * u * (3 - 2 * u)

  for (let i = 0; i < 3; i++) {
    out.position[i] = part.restPosition[i] + part.explodedOffset[i] * e
    out.scale[i] = part.restScale[i]
  }

  const a = part.restQuaternion
  const b = part.explodedQuaternion
  if (e === 0 || e === 1) {
    const q = e === 0 ? a : b
    for (let i = 0; i < 4; i++) out.quaternion[i] = q[i]
    return out
  }

  const rawDot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]
  const sign = rawDot < 0 ? -1 : 1
  const dot = Math.min(1, Math.abs(rawDot))
  let wa = 1 - e
  let wb = e
  if (dot < 0.9995) {
    const angle = Math.acos(dot)
    const sin = Math.sin(angle)
    wa = Math.sin((1 - e) * angle) / sin
    wb = Math.sin(e * angle) / sin
  }
  let length = 0
  for (let i = 0; i < 4; i++) {
    out.quaternion[i] = wa * a[i] + sign * wb * b[i]
    length += out.quaternion[i] ** 2
  }
  const inverseLength = 1 / Math.sqrt(length)
  for (let i = 0; i < 4; i++) out.quaternion[i] *= inverseLength
  return out
}

export function validateParts(parts: WatchPart[]) {
  if (parts.length < 24) throw new Error('В модели должно быть не менее 24 независимых деталей.')
  const names = new Set<string>()
  for (const part of parts) {
    if (names.has(part.nodeName)) throw new Error(`Повторяющееся имя детали: ${part.nodeName}`)
    names.add(part.nodeName)
    const numbers = [part.start, part.end, ...part.restPosition, ...part.explodedOffset, ...part.restQuaternion, ...part.explodedQuaternion, ...part.restScale, ...part.labelAnchor]
    if (!numbers.every(Number.isFinite)) throw new Error(`Некорректные координаты: ${part.nodeName}`)
    if (part.start < 0 || part.end > 1 || part.end < part.start) throw new Error(`Некорректный диапазон: ${part.nodeName}`)
    if (part.end === part.start && part.explodedOffset.some(n => n !== 0)) throw new Error(`Движущейся детали нужен диапазон: ${part.nodeName}`)
    if (part.restScale.some(n => n <= 0)) throw new Error(`Некорректный масштаб: ${part.nodeName}`)
    for (const quaternion of [part.restQuaternion, part.explodedQuaternion]) {
      if (Math.abs(Math.hypot(...quaternion) - 1) > 0.0001) throw new Error(`Quaternion не нормализован: ${part.nodeName}`)
    }
  }
}
