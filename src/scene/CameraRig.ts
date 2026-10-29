import { Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { clampProgress } from '../animation/evaluatePartTransform'
import type { ViewMode } from '../animation/scrollCoordinator'

const UP = new Vector3(0, 1, 0)
const ORIGIN = new Vector3()
const rotations = (directions: number[][]) => directions.map(direction =>
  new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(new Vector3(direction[0], direction[1], direction[2]), ORIGIN, UP)))
const DESKTOP = rotations([[.30, .11, 1], [.50, .18, 1], [.82, .26, 1], [1, .35, 1], [.92, .42, 1], [.94, .38, 1]])
const MOBILE = rotations([[.19, .07, 1], [.36, .12, 1], [.57, .20, 1], [.64, .27, 1], [.63, .31, 1], [.65, .27, 1]])

/** Fit actual moving mesh bounds in camera space, instead of a growing guessed sphere. */
export class CameraRig {
  private mode: ViewMode = 'story'
  private reduced = false
  private zoom = 1
  private baseline = 8
  private updating = false
  private rotation = new Quaternion()
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

  frame(progress: number, width: number, height: number, points: Vector3[], reset = false) {
    this.camera.aspect = width / Math.max(1, height)
    this.camera.updateProjectionMatrix()
    if (!points.length) return
    this.updating = true
    if (this.mode === 'story' || reset) {
      const keys = width < 700 ? MOBILE : DESKTOP
      const t = this.reduced ? 0 : clampProgress(progress) * 5
      const i = Math.min(4, Math.floor(t))
      const u = t - i
      this.rotation.copy(keys[i]).slerp(keys[i + 1], u * u * (3 - 2 * u))
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
    const fill = width < 700 ? .87 : .84 + .035 * progress
    const tanY = Math.tan(this.camera.fov * Math.PI / 360) * fill
    const tanX = tanY * this.camera.aspect
    let distance = 0
    for (const world of points) {
      this.point.copy(world).applyQuaternion(this.inverse).sub(this.center)
      distance = Math.max(distance, this.point.z + Math.max(Math.abs(this.point.x) / tanX, Math.abs(this.point.y) / tanY))
    }
    this.baseline = distance
    this.desiredTarget.copy(this.center).applyQuaternion(this.rotation)
    this.desiredPosition.set(0, 0, distance * this.zoom).applyQuaternion(this.rotation).add(this.desiredTarget)
    this.controls.minDistance = distance * .72
    this.controls.maxDistance = distance * 2.1
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
    const e = t * t * (3 - 2 * t)
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
