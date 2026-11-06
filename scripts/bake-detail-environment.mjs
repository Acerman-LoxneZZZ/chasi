/** Lossless local lighting data, not an image replacing the live 3D models. */
import { createServer } from 'vite'
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const server = await createServer({ server: { host: '127.0.0.1', port: 5175, strictPort: true } })
await server.listen()
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome', headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  const page = await browser.newPage()
  await page.route('**/__lighting__', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }))
  await page.goto('http://127.0.0.1:5175/__lighting__')
  const result = await page.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js')
    const { RoomEnvironment } = await import('/node_modules/.vite/deps/three_addons_environments_RoomEnvironment__js.js')
    const renderer = new THREE.WebGLRenderer(), room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer)
    const target = pmrem.fromScene(room, .07, .1, 100, { size: 128 })
    const pixels = new Uint16Array(target.width * target.height * 4)
    renderer.readRenderTargetPixels(target, 0, 0, target.width, target.height, pixels)
    const baked = new THREE.DataTexture(pixels, target.width, target.height, THREE.RGBAFormat, THREE.HalfFloatType)
    baked.mapping = THREE.CubeUVReflectionMapping
    baked.minFilter = baked.magFilter = THREE.LinearFilter
    baked.colorSpace = THREE.LinearSRGBColorSpace
    baked.generateMipmaps = false; baked.needsUpdate = true
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(35, 1, .1, 10)
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshStandardMaterial({ color: '#b58b4d', metalness: .92, roughness: .29 }))
    scene.add(sphere); camera.position.z = 4
    const output = new THREE.WebGLRenderTarget(128, 128), reference = new Uint8Array(128 * 128 * 4), restored = new Uint8Array(reference.length)
    renderer.setRenderTarget(output)
    scene.environment = target.texture; renderer.render(scene, camera)
    renderer.readRenderTargetPixels(output, 0, 0, 128, 128, reference)
    scene.environment = baked; renderer.render(scene, camera)
    renderer.readRenderTargetPixels(output, 0, 0, 128, 128, restored)
    let maxPixelDeviation = 0
    for (let i = 0; i < reference.length; i++) maxPixelDeviation = Math.max(maxPixelDeviation, Math.abs(reference[i] - restored[i]))
    if (maxPixelDeviation > 1) throw new Error(`Baked reflection differs: ${maxPixelDeviation}`)
    renderer.setRenderTarget(null); output.dispose(); baked.dispose(); sphere.geometry.dispose(); sphere.material.dispose()
    const bytes = new Uint8Array(pixels.buffer)
    let text = ''
    for (let i = 0; i < bytes.length; i += 16384) text += String.fromCharCode(...bytes.subarray(i, i + 16384))
    const metadata = { width: target.width, height: target.height, format: 'RGBA16F / CubeUVReflectionMapping', pmremSize: 128, blur: .07, near: .1, far: 100, validation: { renderedMetalSphere: [128, 128], maxPixelDeviation, method: 'Same live PMREM vs restored half-float DataTexture, per-channel GPU pixel comparison' } }
    target.dispose(); pmrem.dispose(); room.dispose(); renderer.dispose()
    return { ...metadata, data: btoa(text) }
  })
  const { data, ...metadata } = result, bytes = Buffer.from(data, 'base64')
  if (!bytes.some(value => value !== 0)) throw new Error('Lighting readback is empty')
  mkdirSync('public/lighting', { recursive: true })
  writeFileSync('public/lighting/detail-room.bin', bytes)
  const evidence = { ...metadata, source: 'Three.js RoomEnvironment + PMREMGenerator; same parameters as the previous live detail renderer. Lossless half-float GPU readback.', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
  writeFileSync('docs/evidence/detail-lighting.json', JSON.stringify(evidence, null, 2) + '\n')
  console.log(JSON.stringify(evidence, null, 2))
} finally { await browser.close(); await server.close() }
