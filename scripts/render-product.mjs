/**
 * Render the project's actual GLB into transparent commercial stills.
 * Start `npm run dev -- --port 5173` first, then run `node scripts/render-product.mjs`.
 * No external images or models are used; the main website remains live Three.js.
 */
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const base = process.env.RENDER_BASE_URL || 'http://127.0.0.1:5173'
const output = 'public/images'
const scratch = '.cache/product-render'
mkdirSync(output, { recursive: true })
mkdirSync(scratch, { recursive: true })
const views = [
  { name: 'karpov-product', width: 1400, height: 1600, type: 'product', finish: 'brass' },
  { name: 'karpov-product-steel', width: 1400, height: 1600, type: 'product', finish: 'steel' },
  { name: 'karpov-product-graphite', width: 1400, height: 1600, type: 'product', finish: 'graphite' },
  { name: 'karpov-movement', width: 1400, height: 1200, type: 'movement', finish: 'brass' },
  { name: 'karpov-detail', width: 1200, height: 1200, type: 'detail', finish: 'brass' },
]
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome', headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const metrics = []
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1600 }, deviceScaleFactor: 1 })
  page.setDefaultTimeout(120000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/__karpov-studio__', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent;overflow:hidden}canvas{display:block}</style></head><body></body></html>',
  }))
  await page.goto(`${base}/__karpov-studio__`)
  // Vite prebundles these project dependencies on startup. All imports use one
  // optimized Three.js instance, the same version as the live viewer.
  await page.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js')
    const { GLTFLoader } = await import('/node_modules/.vite/deps/three_addons_loaders_GLTFLoader__js.js')
    const { RoomEnvironment } = await import('/node_modules/.vite/deps/three_addons_environments_RoomEnvironment__js.js')
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(1)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = .88
    renderer.setClearColor(0, 0)
    document.body.append(renderer.domElement)
    const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer)
    const environment = pmrem.fromScene(room, .06)
    room.dispose(); pmrem.dispose()
    const scene = new THREE.Scene()
    scene.environment = environment.texture
    scene.environmentIntensity = .9
    scene.add(new THREE.AmbientLight('#c5d4e5', .28))
    const key = new THREE.DirectionalLight('#fff3df', 1.65)
    key.position.set(-4, 6, 8)
    const fill = new THREE.DirectionalLight('#cbdff7', .7)
    fill.position.set(5, 0, 4)
    const rim = new THREE.DirectionalLight('#f6d5a0', 2.35)
    rim.position.set(-4, 3, -5)
    scene.add(key, fill, rim)
    const [gltf, parts] = await Promise.all([
      new GLTFLoader().loadAsync('/models/pocket-watch.glb'),
      fetch('/src/data/watch-parts.json').then(response => response.json()),
    ])
    window.__productStudio = { THREE, renderer, scene, environment, original: gltf.scene, parts, current: null }
  })
  for (const view of views) {
    await page.setViewportSize({ width: view.width, height: view.height })
    const result = await page.evaluate(view => {
      const studio = window.__productStudio
      const { THREE, renderer, scene, original, parts } = studio
      if (studio.current) {
        scene.remove(studio.current)
        studio.current.traverse(child => {
          if (child.isMesh) for (const material of Array.isArray(child.material) ? child.material : [child.material]) material.dispose()
        })
      }
      const model = original.clone(true)
      studio.current = model
      const finishes = { steel: { color: '#bfc6cc', roughness: .30 }, graphite: { color: '#424c59', roughness: .32 } }
      for (const part of parts) {
        const object = model.getObjectByName(part.nodeName)
        if (view.type === 'movement') {
          object.visible = part.category === 'movement' || part.category === 'fastener'
          if (['crown_stem', 'motion_works', 'hour_wheel', 'barrel_cover', 'ratchet_wheel', 'dial_fastener_01', 'dial_fastener_02'].includes(part.nodeName)) object.visible = false
          if (part.nodeName === 'movement_bridge_upper') object.position.z += .32
          if (part.nodeName === 'movement_bridge_train') object.position.z += .16
          if (part.nodeName === 'movement_bridge_balance') object.position.z += .13
        }
        object.traverse(child => {
          if (!child.isMesh) return
          const materials = (Array.isArray(child.material) ? child.material : [child.material]).map(material => {
            const clone = material.clone()
            if (clone.isMeshStandardMaterial && clone.name.includes('Charcoal dial printing')) {
              clone.metalness = 0; clone.roughness = .8; clone.envMapIntensity = .2
            }
            if (part.category === 'case' && finishes[view.finish] && /brass|aged case/i.test(clone.name)) {
              clone.color.set(finishes[view.finish].color)
              clone.roughness = finishes[view.finish].roughness
            }
            return clone
          })
          child.material = materials.length === 1 ? materials[0] : materials
          if (part.nodeName === 'front_glass') {
            for (const material of materials) material.dispose()
            child.material = new THREE.MeshPhysicalMaterial({ color: '#edf5fa', roughness: .035, metalness: 0,
              transmission: 0, thickness: .018, ior: 1.46, transparent: true, opacity: .055,
              depthWrite: false, side: THREE.FrontSide, envMapIntensity: .5 })
            child.renderOrder = 2
          }
        })
      }
      model.rotation.z = view.type === 'movement' ? -.24 : -.11
      model.updateMatrixWorld(true)
      scene.add(model)
      renderer.setSize(view.width, view.height, false)
      const camera = new THREE.PerspectiveCamera(30, view.width / view.height, .05, 100)
      const yaw = (view.type === 'movement' ? 24 : -20) * Math.PI / 180
      const pitch = (view.type === 'movement' ? 13 : 8) * Math.PI / 180
      const direction = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
      const orientation = new THREE.Matrix4().lookAt(direction, new THREE.Vector3(), new THREE.Vector3(0, 1, 0))
      const rotation = new THREE.Quaternion().setFromRotationMatrix(orientation)
      const inverse = rotation.clone().invert()
      const low = new THREE.Vector3(Infinity, Infinity, Infinity), high = new THREE.Vector3(-Infinity, -Infinity, -Infinity)
      const points = []
      model.traverse(child => {
        if (!child.isMesh) return
        let visible = child.visible
        child.traverseAncestors(ancestor => { if (!ancestor.visible) visible = false })
        if (!visible) return
        child.geometry.computeBoundingBox()
        const box = child.geometry.boundingBox
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
          const point = new THREE.Vector3(x, y, z).applyMatrix4(child.matrixWorld)
          points.push(point)
          const local = point.clone().applyQuaternion(inverse)
          low.min(local); high.max(local)
        }
      })
      const center = low.clone().add(high).multiplyScalar(.5)
      const fill = view.type === 'movement' ? .87 : .9
      const tanY = Math.tan(camera.fov * Math.PI / 360) * fill
      const tanX = tanY * camera.aspect
      let distance = 0
      for (const world of points) {
        const local = world.clone().applyQuaternion(inverse).sub(center)
        distance = Math.max(distance, local.z + Math.max(Math.abs(local.x) / tanX, Math.abs(local.y) / tanY))
      }
      const target = center.clone().applyQuaternion(rotation)
      if (view.type === 'detail') {
        // Intentionally crop to the signature, enamel, bow and fluted crown.
        target.set(.03, .91, .25)
        distance *= .57
      }
      camera.position.copy(direction.multiplyScalar(distance)).add(target)
      camera.quaternion.copy(rotation)
      camera.updateMatrixWorld()
      renderer.render(scene, camera)
      return { width: view.width, height: view.height, drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles, camera: camera.position.toArray(), target: target.toArray() }
    }, view)
    await page.locator('canvas').screenshot({ path: `${scratch}/${view.name}.png`, omitBackground: true })
    const converted = spawnSync('python3', ['-c',
      'from PIL import Image; import sys; im=Image.open(sys.argv[1]).convert("RGBA"); im.save(sys.argv[2],"WEBP",quality=95,method=6)',
      `${scratch}/${view.name}.png`, `${output}/${view.name}.webp`], { encoding: 'utf8' })
    if (converted.status !== 0) throw new Error(converted.stderr || 'WebP conversion failed')
    metrics.push({ ...view, ...result, bytes: readFileSync(`${output}/${view.name}.webp`).length })
  }
  if (errors.length) throw new Error(errors.join('\n'))
  const metadata = { modelSha256: createHash('sha256').update(readFileSync('public/models/pocket-watch.glb')).digest('hex'),
    source: 'Original project GLB; transparent Three.js render, no stock or generated imagery', views: metrics }
  writeFileSync(`${scratch}/renders.json`, JSON.stringify(metadata, null, 2) + '\n')
  console.log(JSON.stringify(metadata, null, 2))
} finally { await browser.close() }
