import { Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { clampProgress, smootherStep } from '../animation/evaluatePartTransform'
import type { ViewMode } from '../animation/scrollCoordinator'

const UP = new Vector3(0, 1, 0)
const ORIGIN = new Vector3()
const FORWARD = new Vector3(0, 0, 1)
const RADIANS = Math.PI / 180
const CAMERA_POSES = [0, .22, .46, .75, 1] as const
const DESKTOP_YAW = [-18, 40, 338, 385, 405] as const
const MOBILE_YAW = [-12, 32, 338, 378, 395] as const

export type StoryCameraAngles = { yaw: number; pitch: number; roll: number }

/** A deliberate approach, readable macro hold, and retreat; all scroll reversible. */
export function evaluateMacroWeight(progress: number) {
  const p = clampProgress(progress)
  return smootherStep(clampProgress((p - .54) / .18)) * (1 - smootherStep(clampProgress((p - .78) / .18)))
}

/** Unwrapped absolute angles retain a whole orbit when the end view faces front again. */
export function evaluateStoryCameraAngles(progress: number, mobile = false, out: StoryCameraAngles = { yaw: 0, pitch: 0, roll: 0 }) {
  const p = clampProgress(progress)
  const wave = Math.sin(p * Math.PI * 2)
  const arch = Math.sin(p * Math.PI)
  const yawStops = mobile ? MOBILE_YAW : DESKTOP_YAW
  let yaw: number = yawStops[4]
  // The full orbit happens between the case and dial holds. Every reading
  // stop returns to the front so its visible materials match the product copy.
  for (let index = 1; index < CAMERA_POSES.length; index++) {
    if (p > CAMERA_POSES[index]) continue
    const u = clampProgress((p - CAMERA_POSES[index - 1]) / (CAMERA_POSES[index] - CAMERA_POSES[index - 1]))
    // The raw→pose timeline already eases into every stop. Easing this angle
    // again compresses the large turn into a short, high-speed middle burst.
    yaw = yawStops[index - 1] + (yawStops[index] - yawStops[index - 1]) * u
    break
  }
  out.yaw = yaw * RADIANS
  out.pitch = ((mobile ? 5 : 8) + (mobile ? 7 : 8) * wave + (mobile ? 3 : 4) * arch) * RADIANS
  out.roll = ((mobile ? -2 : -4) * (1 - p) + (mobile ? 3 : 7) * wave) * RADIANS
  return out
}

/** Fit actual moving mesh bounds in camera space, instead of a growing guessed sphere. */
export class CameraRig {
  private mode: ViewMode = 'story'
  private reduced = false
  private zoom = 1
  private baseline = 8
  private updating = false
  private rotation = new Quaternion()
  private rollRotation = new Quaternion()
  private orientation = new Matrix4()
  private eyeDirection = new Vector3()
  private angles: StoryCameraAngles = { yaw: 0, pitch: 0, roll: 0 }
  private inverse = new Quaternion()
  private point = new Vector3()
  private low = new Vector3()
  private high = new Vector3()
  private center = new Vector3()
  private desiredPosition = new Vector3()
  private desiredTarget = new Vector3()
  private fromPosition = new Vector3()
  private fromTarget = new Vector3()
  private fromRotation = new Quaternion()
  private transitionStart: number | null = null
  private macroWeight = 0

  get macro() { return this.macroWeight }
  get transitioning() { return this.transitionStart !== null }

  constructor(readonly camera: PerspectiveCamera, readonly controls: OrbitControls) {
    controls.enablePan = false
    controls.enableDamping = false
    controls.minPolarAngle = .25
    controls.maxPolarAngle = Math.PI - .25
    controls.rotateSpeed = .65
    controls.zoomSpeed = .65
    controls.addEventListener('change', this.trackZoom)
    controls.disconnect()
    controls.enabled = false
  }

  private trackZoom = () => {
    if (!this.updating && this.mode === 'manual') this.zoom = this.camera.position.distanceTo(this.controls.target) / this.baseline
  }

  setMode(mode: ViewMode, reduced: boolean, element: HTMLCanvasElement) {
    this.reduced = reduced
    if (mode === this.mode) { element.style.touchAction = mode === 'story' ? 'pan-y' : 'none'; return }
    this.mode = mode
    this.transitionStart = null
    this.controls.enabled = mode === 'manual'
    if (mode === 'manual') {
      this.controls.connect(element)
      this.zoom = this.camera.position.distanceTo(this.controls.target) / this.baseline
    } else {
      this.controls.disconnect()
      this.fromPosition.copy(this.camera.position)
      this.fromTarget.copy(this.controls.target)
      this.fromRotation.copy(this.camera.quaternion)
      if (!reduced) this.transitionStart = performance.now()
      this.zoom = 1
    }
    element.style.touchAction = mode === 'story' ? 'pan-y' : 'none'
  }

  frame(progress: number, width: number, height: number, points: Vector3[], reset = false, focus?: Vector3) {
    this.camera.aspect = width / Math.max(1, height)
    this.camera.updateProjectionMatrix()
    if (!points.length) return
    this.updating = true
    if (this.mode === 'story' || reset) {
      const { yaw, pitch, roll } = evaluateStoryCameraAngles(this.reduced ? 0 : progress, width < 700, this.angles)
      this.eyeDirection.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
      this.orientation.lookAt(this.eyeDirection, ORIGIN, UP)
      this.rotation.setFromRotationMatrix(this.orientation)
      this.rollRotation.setFromAxisAngle(FORWARD, roll)
      this.rotation.multiply(this.rollRotation)
      if (reset) { this.zoom = 1; this.transitionStart = null }
    } else this.rotation.copy(this.camera.quaternion)
    this.inverse.copy(this.rotation).invert()
    this.low.set(Infinity, Infinity, Infinity)
    this.high.set(-Infinity, -Infinity, -Infinity)
    for (const world of points) {
      this.point.copy(world).applyQuaternion(this.inverse)
      this.low.min(this.point); this.high.max(this.point)
    }
    this.center.copy(this.low).add(this.high).multiplyScalar(.5)
    // A generous opening close-up gradually withdraws before the first detail
    // stop. The desktop hero may slightly cross the frame by design.
    const opening = 1 - smootherStep(clampProgress(progress / .22))
    const fill = width < 700 ? .88 + .25 * opening : .91 + .22 * opening
    const tanY = Math.tan(this.camera.fov * Math.PI / 360) * fill
    const tanX = tanY * this.camera.aspect
    let distance = 0
    for (const world of points) {
      this.point.copy(world).applyQuaternion(this.inverse).sub(this.center)
      distance = Math.max(distance, this.point.z + Math.max(Math.abs(this.point.x) / tanX, Math.abs(this.point.y) / tanY))
    }
    const macro = focus && !this.reduced ? evaluateMacroWeight(progress) : 0
    this.macroWeight = macro
    const dolly = 1 - macro * (width < 700 ? .32 : .64)
    this.baseline = distance * dolly
    this.desiredTarget.copy(this.center).applyQuaternion(this.rotation)
    if (focus) this.desiredTarget.lerp(focus, macro)
    this.desiredPosition.set(0, 0, this.baseline * this.zoom).applyQuaternion(this.rotation).add(this.desiredTarget)
    this.controls.minDistance = this.baseline * .72
    this.controls.maxDistance = this.baseline * 2.1
    if (this.transitionStart === null) this.apply()
    this.updating = false
  }

  private apply() {
    this.camera.position.copy(this.desiredPosition)
    this.camera.quaternion.copy(this.rotation)
    this.controls.target.copy(this.desiredTarget)
    this.camera.updateMatrixWorld()
    if (this.mode === 'manual') this.controls.update()
  }

  tick(time: number) {
    if (this.transitionStart === null) return false
    const t = clampProgress((time - this.transitionStart) / 380)
    const e = smootherStep(t)
    this.updating = true
    this.camera.position.lerpVectors(this.fromPosition, this.desiredPosition, e)
    this.camera.quaternion.slerpQuaternions(this.fromRotation, this.rotation, e)
    this.controls.target.lerpVectors(this.fromTarget, this.desiredTarget, e)
    this.camera.updateMatrixWorld()
    this.updating = false
    if (t === 1) this.transitionStart = null
    return t < 1
  }
  suspend() { this.transitionStart = null }
  dispose() { this.controls.removeEventListener('change', this.trackZoom) }
}
