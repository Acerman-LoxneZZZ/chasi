import { describe, expect, it, vi } from 'vitest'
import { PerspectiveCamera, Quaternion, Vector3 } from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CameraRig } from './CameraRig'

const setup = () => {
  const camera = new PerspectiveCamera(33, 1, .1, 100)
  const controls = { target: new Vector3(), addEventListener: vi.fn(), removeEventListener: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), update: vi.fn() } as unknown as OrbitControls
  const rig = new CameraRig(camera, controls)
  const points = []
  for (const x of [-1.42, 1.42]) for (const y of [-1.42, 2.32]) for (const z of [-.4, .45]) points.push(new Vector3(x, y, z))
  return { camera, controls, rig, points }
}

describe('scenario camera and measured framing', () => {
  it('keeps all bounds inside the viewport at required desktop and phone sizes', () => {
    const { camera, rig, points } = setup()
    for (const [width, height] of [[1440, 620], [1280, 430], [390, 350], [360, 330]]) {
      for (const p of [0, .2, .4, .6, .8, 1, .4, 0]) {
        rig.frame(p, width, height, points)
        for (const point of points) {
          const projected = point.clone().project(camera)
          expect(Math.abs(projected.x)).toBeLessThan(1)
          expect(Math.abs(projected.y)).toBeLessThan(1)
        }
        expect(camera.quaternion.length()).toBeCloseTo(1, 12)
      }
    }
  })
  it('returns to the same absolute camera pose after a reversed trajectory', () => {
    const { camera, rig, points } = setup()
    rig.frame(.37, 1440, 620, points)
    const position = camera.position.clone(), quaternion = camera.quaternion.clone()
    for (const p of [1, 0, .2, .6, .9, .37]) rig.frame(p, 1440, 620, points)
    expect(camera.position.distanceTo(position)).toBe(0)
    expect(camera.quaternion.toArray()).toEqual(quaternion.toArray())
  })
  it('preserves the camera on entering manual mode and blends back without changing progress', () => {
    const { camera, controls, rig, points } = setup()
    rig.frame(.6, 1440, 620, points)
    const position = camera.position.clone(), quaternion = camera.quaternion.clone()
    const canvas = { style: {} } as HTMLCanvasElement
    rig.setMode('manual', false, canvas)
    expect(camera.position.distanceTo(position)).toBe(0)
    expect(camera.quaternion.toArray()).toEqual(quaternion.toArray())
    expect(canvas.style.touchAction).toBe('none')
    camera.quaternion.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), .2))
    const manual = camera.quaternion.clone()
    rig.setMode('story', false, canvas)
    rig.frame(.6, 1440, 620, points)
    expect(camera.quaternion.toArray()).toEqual(manual.toArray())
    rig.tick(performance.now() + 400)
    expect(camera.quaternion.angleTo(quaternion)).toBeLessThan(1e-6)
    expect(canvas.style.touchAction).toBe('pan-y')
    expect(controls.enabled).toBe(false)
  })
  it('keeps a fixed viewing orientation under reduced motion', () => {
    const { camera, rig, points } = setup()
    rig.setMode('story', true, { style: {} } as HTMLCanvasElement)
    rig.frame(0, 390, 360, points)
    const quaternion = camera.quaternion.clone()
    rig.frame(1, 390, 360, points)
    expect(camera.quaternion.toArray()).toEqual(quaternion.toArray())
  })
})
