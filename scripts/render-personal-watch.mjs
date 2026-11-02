import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const base = process.env.RENDER_BASE_URL || 'http://127.0.0.1:5173'
const scratch = '.cache/personal-watch'
mkdirSync(scratch, { recursive: true })
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 1200 } })
  await page.route('**/__personal-studio__', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><style>html,body{margin:0;background:transparent}canvas{display:block}</style><body></body></html>' }))
  await page.goto(`${base}/__personal-studio__`)
  await page.evaluate(async () => {
    const T = await import('/node_modules/.vite/deps/three.js')
    const { RoomEnvironment } = await import('/node_modules/.vite/deps/three_addons_environments_RoomEnvironment__js.js')
    const { loadPersonalWatch } = await import('/src/scene/PersonalWatchModel.ts')
    const renderer = new T.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true })
    renderer.setSize(1000, 1200)
    renderer.outputColorSpace = T.SRGBColorSpace
    renderer.toneMapping = T.ACESFilmicToneMapping
    renderer.toneMappingExposure = .96
    renderer.setClearColor(0, 0)
    document.body.append(renderer.domElement)
    const scene = new T.Scene(), room = new RoomEnvironment(), pmrem = new T.PMREMGenerator(renderer)
    const environment = pmrem.fromScene(room, .07, .1, 100, { size: 128 })
    room.dispose(); pmrem.dispose()
    scene.environment = environment.texture; scene.environmentIntensity = .95
    scene.add(new T.AmbientLight('#cbd9e9', .4))
    for (const [color, intensity, position] of [['#fff1d6', 2.1, [-4,5,7]], ['#cadaee', .8, [5,0,4]], ['#f8d69d', 2.2, [1,4,-5]]]) {
      const light = new T.DirectionalLight(color, intensity); light.position.set(...position); scene.add(light)
    }
    const model = await loadPersonalWatch(new AbortController().signal)
    scene.add(model.root)
    window.studio = { renderer, scene, model, environment, camera: new T.PerspectiveCamera(30, 1000/1200, .05, 100) }
  })
  const results = []
  for (const kind of ['engraving','assembly']) for (const finish of ['brass','steel','graphite']) {
    const filename = `karpov-${kind === 'engraving' ? 'caseback' : 'finale'}-${finish}`
    const stats = await page.evaluate(({kind, finish}) => {
      const { model, camera, renderer, scene } = window.studio
      model.configure(kind, 1000); model.setPersonalization(finish, '')
      model.update(kind === 'assembly' ? 1 : .5, 0, true)
      model.frameCamera(camera, 1000, 1200); renderer.render(scene, camera)
      return { triangles: renderer.info.render.triangles, calls: renderer.info.render.calls }
    }, {kind, finish})
    await page.locator('canvas').screenshot({ path: `${scratch}/${filename}.png`, omitBackground: true })
    const converted = spawnSync('python3', ['-c', 'from PIL import Image; import sys; Image.open(sys.argv[1]).save(sys.argv[2],"WEBP",quality=95,method=6)', `${scratch}/${filename}.png`, `public/images/${filename}.webp`], { encoding: 'utf8' })
    if (converted.status) throw new Error(converted.stderr)
    results.push({kind, finish, file: `public/images/${filename}.webp`, ...stats})
  }
  await page.evaluate(() => { const s=window.studio; s.model.dispose(); s.environment.dispose(); s.renderer.dispose() })
  writeFileSync('docs/evidence/personal-posters.json', JSON.stringify({ source: 'Same original GLB and shared-renderer camera/material code; no generated or stock images', results }, null, 2)+'\n')
  console.log(JSON.stringify({posters: results.length, results}))
} finally { await browser.close() }
