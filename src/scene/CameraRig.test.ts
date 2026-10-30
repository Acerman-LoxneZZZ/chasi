import { describe, expect, it, vi } from 'vitest'
import { PerspectiveCamera, Quaternion, Vector3 } from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CameraRig, evaluateMacroWeight, evaluateStoryCameraAngles } from './CameraRig'

const setup = () => {
  const camera = new PerspectiveCamera(33, 1, .1, 100)
  const controls = { target: new Vector3(), addEventListener: vi.fn(), removeEventListener: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), update: vi.fn() } as unknown as OrbitControls
  const rig = new CameraRig(camera, controls)
  const points = []
  for (const x of [-1.42, 1.42]) for (const y of [-1.42, 2.32]) for (const z of [-.4, .45]) points.push(new Vector3(x, y, z))
  return { camera, controls, rig, points }
}

describe('scenario camera and measured framing', () => {
  it('shows the dial-facing side at every actual product hold while retaining the unwrapped orbit', () => {
    const { camera, rig, points } = setup()
    for (const mobile of [false, true]) {
      const expectedDegrees = mobile ? [-12, 32, 338, 378, 395] : [-18, 40, 338, 385, 405]
      for (const [index, p] of [0, .22, .46, .75, 1].entries()) {
        expect(evaluateStoryCameraAngles(p, mobile).yaw * 180 / Math.PI).toBeCloseTo(expectedDegrees[index], 10)
        rig.frame(p, mobile ? 390 : 1440, mobile ? 844 : 1000, points)
        expect(new Vector3(0, 0, 1).applyQuaternion(camera.quaternion).z).toBeGreaterThan(.65)
      }
    }
  })
  it('approaches the gear for a macro hold and retreats to the exact full composition', () => {
    const { camera, controls, rig, points } = setup()
    const focus = new Vector3(.45, .3, .2)
    rig.frame(.75, 1440, 1000, points)
    const fullDistance = camera.position.distanceTo(controls.target)
    rig.frame(.75, 1440, 1000, points, false, focus)
    expect(camera.position.distanceTo(controls.target)).toBeCloseTo(fullDistance * .36, 10)
    expect(controls.target.distanceTo(focus)).toBeLessThan(1e-12)
    expect(focus.clone().project(camera).length()).toBeLessThan(1)
    const macroCamera = camera.position.toArray()
    for (const p of [1, .1, .9, .3, .75]) rig.frame(p, 1440, 1000, points, false, focus)
    expect(camera.position.toArray()).toEqual(macroCamera)
    for (const p of [0, .25, .5, 1]) expect(evaluateMacroWeight(p)).toBe(0)
    expect(evaluateMacroWeight(.75)).toBe(1)
    expect(evaluateMacroWeight(NaN)).toBe(0)
  })
  it('makes a complete measured orbit instead of taking the short quaternion path', () => {
    const { camera, rig, points } = setup()
    for (const [width, height, expectedDegrees] of [[1440, 900, 423], [390, 700, 407]]) {
      let previous = 0, turn = 0
      for (let index = 0; index <= 200; index++) {
        rig.frame(index / 200, width, height, points)
        const direction = new Vector3(0, 0, 1).applyQuaternion(camera.quaternion)
        const angle = Math.atan2(direction.x, direction.z)
        if (index) turn += Math.atan2(Math.sin(angle - previous), Math.cos(angle - previous))
        previous = angle
      }
      expect(turn * 180 / Math.PI).toBeCloseTo(expectedDegrees, 9)
      // Both endpoints show the front, despite the complete revolution between.
      rig.frame(0, width, height, points)
      expect(new Vector3(0, 0, 1).applyQuaternion(camera.quaternion).z).toBeGreaterThan(.8)
      rig.frame(1, width, height, points)
      expect(new Vector3(0, 0, 1).applyQuaternion(camera.quaternion).z).toBeGreaterThan(.65)
    }
  })
  it('keeps the long orbit absolute, clamped and reversible with a restrained pitch and roll', () => {
    for (const mobile of [false, true]) {
      const expected = evaluateStoryCameraAngles(.37, mobile)
      const output = { yaw: 0, pitch: 0, roll: 0 }
      for (const p of [1, .1, .9, .25, 0, .37]) evaluateStoryCameraAngles(p, mobile, output)
      expect(output).toEqual(expected)
      for (let index = 0; index <= 200; index++) {
        const angles = evaluateStoryCameraAngles(index / 200, mobile, output)
        expect(Math.abs(angles.pitch)).toBeLessThan(22 * Math.PI / 180)
        expect(Math.abs(angles.roll)).toBeLessThan(9 * Math.PI / 180)
      }
      expect(evaluateStoryCameraAngles(-2, mobile)).toEqual(evaluateStoryCameraAngles(0, mobile))
      expect(evaluateStoryCameraAngles(5, mobile)).toEqual(evaluateStoryCameraAngles(1, mobile))
    }
  })
  it('keeps all bounds inside the viewport at required desktop and phone sizes', () => {
    const { camera, rig, points } = setup()
    for (const [width, height] of [[1440, 620], [1280, 430], [390, 350], [360, 330]]) {
      for (const p of Array.from({ length: 41 }, (_, index) => index / 40)) {
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
