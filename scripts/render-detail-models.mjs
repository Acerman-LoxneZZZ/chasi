/** Reproduce transparent posters from the original, live procedural detail models. */
import { chromium } from '@playwright/test'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const base = process.env.RENDER_BASE_URL || 'http://127.0.0.1:5173'
const output = 'public/images', scratch = '.cache/detail-render'
mkdirSync(output, { recursive: true }); mkdirSync(scratch, { recursive: true })
const views = [
  { kind: 'balance', yaw: -.2, pitch: .25 },
  { kind: 'crown', yaw: -.3, pitch: .18 },
  { kind: 'geartrain', yaw: .25, pitch: .25 },
]
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome', headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1200 } })
  page.setDefaultTimeout(120000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/__karpov-detail-studio__', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent;overflow:hidden}canvas{display:block}</style></head><body></body></html>' }))
  await page.goto(`${base}/__karpov-detail-studio__`)
  await page.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js')
    const { RoomEnvironment } = await import('/node_modules/.vite/deps/three_addons_environments_RoomEnvironment__js.js')
    const { createDetailModels } = await import('/src/scene/detailModels.ts')
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(1); renderer.setSize(1200, 1200, false)
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = .96; renderer.setClearColor(0, 0)
    document.body.append(renderer.domElement)
    const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer)
    const environment = pmrem.fromScene(room, .06, .1, 100, { size: 128 })
    room.dispose(); pmrem.dispose()
    const scene = new THREE.Scene(); scene.environment = environment.texture; scene.environmentIntensity = 1.05
    scene.add(new THREE.AmbientLight('#c5d4e5', .28))
    const key = new THREE.DirectionalLight('#fff3df', 2.1); key.position.set(-4, 5, 7)
    const fill = new THREE.DirectionalLight('#cbdff7', .8); fill.position.set(5, 0, 4)
    const rim = new THREE.DirectionalLight('#f6d5a0', 2.2); rim.position.set(-3, 3, -5)
    scene.add(key, fill, rim)
    window.__detailStudio = { THREE, renderer, scene, environment, models: createDetailModels(), current: null }
  })
  const metrics = []
  for (const view of views) {
    const result = await page.evaluate(view => {
      const studio = window.__detailStudio, { THREE, renderer, scene, models } = studio
      if (studio.current) scene.remove(studio.current.root)
      const model = models[view.kind]; studio.current = model
      model.update(.5, 0, true); scene.add(model.root)
      const distance = model.radius / Math.sin(17.5 * Math.PI / 180) / .9
      const camera = new THREE.PerspectiveCamera(35, 1, .1, 100)
      camera.position.set(Math.sin(view.yaw) * Math.cos(view.pitch), Math.sin(view.pitch), Math.cos(view.yaw) * Math.cos(view.pitch)).multiplyScalar(distance)
      camera.lookAt(0, 0, 0); camera.updateMatrixWorld()
      renderer.render(scene, camera)
      return { kind: view.kind, width: 1200, height: 1200, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
        camera: camera.position.toArray(), progress: .5, reduced: true }
    }, view)
    const png = `${scratch}/karpov-${view.kind}.png`, webp = `${output}/karpov-${view.kind}.webp`
    await page.locator('canvas').screenshot({ path: png, omitBackground: true })
    const conversion = spawnSync('python3', ['-c', 'from PIL import Image; import sys; Image.open(sys.argv[1]).convert("RGBA").save(sys.argv[2],"WEBP",quality=95,method=6)', png, webp], { encoding: 'utf8' })
    if (conversion.status !== 0) throw new Error(conversion.stderr || 'WebP conversion failed')
    metrics.push({ ...result, path: webp, bytes: readFileSync(webp).length })
  }
  if (errors.length) throw new Error(errors.join('\n'))
  const metadata = { source: 'Original procedural models in src/scene/detailModels.ts; actual Three.js transparent render, no external or generated imagery',
    sourceSha256: createHash('sha256').update(readFileSync('src/scene/detailModels.ts')).digest('hex'),
    lighting: { exposure: .96, environmentIntensity: 1.05, pmremSize: 128, key: 2.1, fill: .8, rim: 2.2 }, views: metrics }
  writeFileSync(`${scratch}/renders.json`, JSON.stringify(metadata, null, 2) + '\n')
  console.log(JSON.stringify(metadata, null, 2))
} finally { await browser.close() }
