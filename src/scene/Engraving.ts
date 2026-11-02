import { CanvasTexture, Mesh, MeshStandardMaterial, Object3D, PlaneGeometry, SRGBColorSpace } from 'three'
import { normalizeEngraving } from '../data/personalization'
import type { WatchFinish } from '../data/collection'

/** A depth-tested inscription attached to the existing back-cover carrier. */
export class Engraving {
  private canvas = document.createElement('canvas')
  private texture: CanvasTexture
  private material: MeshStandardMaterial
  readonly mesh: Mesh
  private text = ''
  constructor(cover: Object3D) {
    this.canvas.width = 1024
    this.canvas.height = 256
    this.texture = new CanvasTexture(this.canvas)
    this.texture.colorSpace = SRGBColorSpace
    this.material = new MeshStandardMaterial({ name: 'KARpOV personal inscription', map: this.texture,
      transparent: true, alphaTest: .08, depthWrite: false, metalness: .62, roughness: .54,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
    this.mesh = new Mesh(new PlaneGeometry(1.02, .255), this.material)
    this.mesh.name = 'karpov-personal-engraving'
    // The original cover is flat at local z=-.07; turning rings reach -.076.
    this.mesh.position.set(0, .035, -.079)
    this.mesh.rotation.y = Math.PI
    this.mesh.visible = false
    cover.add(this.mesh)
    this.setFinish('brass')
  }
  setFinish(finish: WatchFinish) {
    this.material.color.set(finish === 'graphite' ? '#b7bfc6' : finish === 'steel' ? '#36434e' : '#49351d')
  }
  setText(value: string) {
    const text = normalizeEngraving(value).trim()
    if (text === this.text) return
    this.text = text
    this.mesh.visible = text.length > 0
    const context = this.canvas.getContext('2d')!
    context.clearRect(0, 0, 1024, 256)
    if (text) {
      context.font = '400 178px "Cormorant Garamond"'
      const gap = 18
      const measured = [...text].reduce((sum, letter) => sum + context.measureText(letter).width, 0) + gap * (text.length - 1)
      const scale = Math.min(1, 900 / measured)
      context.save()
      context.translate(512, 132)
      context.scale(scale, scale)
      context.fillStyle = '#ffffff'
      context.textBaseline = 'middle'
      let x = -measured / 2
      for (const letter of text) {
        context.fillText(letter, x, 0)
        x += context.measureText(letter).width + gap
      }
      context.restore()
    }
    this.texture.needsUpdate = true
  }
  dispose() {
    this.mesh.removeFromParent()
    this.mesh.geometry.dispose()
    this.material.dispose()
    this.texture.dispose()
  }
}
