import { PerspectiveCamera, Vector3 } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

/** Framing changes distance and target only; a visitor's rotation and zoom survive progress changes. */
export class CameraRig {
  private zoom = 1
  private baseline = 8
  private updating = false
  private offset = new Vector3()
  private nextTarget = new Vector3()

  constructor(readonly camera: PerspectiveCamera, readonly controls: OrbitControls) {
    controls.enablePan = false
    controls.enableDamping = false
    controls.minPolarAngle = 0.3
    controls.maxPolarAngle = Math.PI - 0.3
    controls.rotateSpeed = 0.65
    controls.zoomSpeed = 0.65
    controls.zoomToCursor = false
    controls.addEventListener('change', this.trackZoom)
  }

  private trackZoom = () => {
    if (!this.updating) this.zoom = this.camera.position.distanceTo(this.controls.target) / this.baseline
  }

  frame(progress: number, width: number, height: number, reset = false) {
    const aspect = width / height
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()
    // A sphere encloses every layer, including the bow and the rear cover.
    const radius = 2.15 + 0.55 * Math.min(progress / 0.6, 1)
    const verticalHalf = this.camera.fov * Math.PI / 360
    const halfFov = Math.min(verticalHalf, Math.atan(Math.tan(verticalHalf) * aspect))
    this.baseline = radius / Math.sin(halfFov) * 1.03
    this.nextTarget.set(-0.12 * progress, 0.32, 0.46 * progress)
    this.updating = true
    if (reset) {
      this.zoom = 1
      this.offset.set(0.72, 0.26, 1).normalize()
    } else {
      this.offset.copy(this.camera.position).sub(this.controls.target).normalize()
    }
    this.controls.target.copy(this.nextTarget)
    this.camera.position.copy(this.nextTarget).addScaledVector(this.offset, this.baseline * this.zoom)
    this.controls.minDistance = this.baseline * 0.76
    this.controls.maxDistance = this.baseline * 1.9
    this.controls.update()
    this.updating = false
  }

  dispose() { this.controls.removeEventListener('change', this.trackZoom) }
}
