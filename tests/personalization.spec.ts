import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test.setTimeout(240000)
const host = (page: Page, kind: string) => page.locator(`.detail-scene[data-scene-kind="${kind}"]`)
const ready = async (page: Page) => {
  await page.goto('/')
  await expect(page.locator('.experience')).toHaveAttribute('data-status','ready',{timeout:90000})
  await page.evaluate(()=>document.fonts.ready)
  test.info().annotations.push({type:'tested-entry',description:(await page.locator('script[type=module]').getAttribute('src'))!})
}
const live = async (page: Page, kind: string) => {
  await expect(host(page,kind)).toHaveAttribute('data-scene-status','ready',{timeout:90000})
  await expect(host(page,kind)).toHaveAttribute('data-active','true')
  await expect(host(page,kind).locator('canvas.detail-canvas')).toHaveCount(1)
  await expect(page.locator('canvas.detail-canvas')).toHaveCount(1)
}
const painted = async (page: Page, kind: string) => {
  await expect.poll(()=>host(page,kind).evaluate(h=>h.dataset.progress===h.dataset.renderedProgress),{timeout:60000}).toBe(true)
}
const ending = async (page: Page, progress: number) => {
  await page.evaluate(p=>{const section=document.getElementById('finale')!,pin=section.querySelector<HTMLElement>('.finale-pin')!;scrollTo({top:section.getBoundingClientRect().top+scrollY+(section.offsetHeight-pin.offsetHeight)*p,behavior:'instant'})},progress)
  await live(page,'assembly')
  await expect.poll(async()=>Math.abs(Number(await host(page,'assembly').getAttribute('data-progress'))-progress)).toBeLessThan(.001)
  await painted(page,'assembly')
}
const reveal = async (page: Page) => {await page.mouse.move(20,20);await expect.poll(()=>page.locator('.site-header').evaluate(el=>Number(getComputedStyle(el).opacity))).toBe(1)}

test('initials alter the actual back-cover pixels, persist and enter the local selection card', async({page})=>{
  await ready(page)
  await page.locator('#personalize').scrollIntoViewIfNeeded();await live(page,'engraving');await painted(page,'engraving')
  const before=await host(page,'engraving').locator('canvas').screenshot()
  const frames=Number(await host(page,'engraving').getAttribute('data-frames'))
  await page.getByLabel('Ваши инициалы',{exact:true}).fill('а.к.')
  await host(page,'engraving').scrollIntoViewIfNeeded();await live(page,'engraving')
  await expect(page.getByLabel('Ваши инициалы',{exact:true})).toHaveValue('А.К.')
  await expect.poll(async()=>Number(await host(page,'engraving').getAttribute('data-frames'))).toBeGreaterThan(frames)
  await expect(host(page,'engraving')).toHaveAttribute('data-engraving','А.К.')
  expect((await host(page,'engraving').locator('canvas').screenshot()).equals(before)).toBe(false)
  expect(Number(await host(page,'engraving').getAttribute('data-model-triangles'))).toBeGreaterThan(180000)
  await expect(page.locator('canvas.watch-canvas')).toHaveAttribute('data-engraving','А.К.')
  await expect.poll(()=>page.evaluate(()=>localStorage.getItem('karpov:engraving'))).toBe('А.К.')
  await page.locator('#selection').scrollIntoViewIfNeeded()
  await page.getByRole('radio',{name:'Графит',exact:true}).check()
  const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Сохранить выбор',exact:true}).click()
  const file=await downloaded,card=await readFile((await file.path())!,'utf8')
  expect(card).toContain('Гравировка (примерка): А.К.');expect(card).toContain('Исполнение корпуса: Графит')
  await page.reload();await expect(page.locator('.experience')).toHaveAttribute('data-status','ready',{timeout:90000})
  await expect(page.getByLabel('Ваши инициалы',{exact:true})).toHaveValue('А.К.')
  await page.locator('#personalize').scrollIntoViewIfNeeded();await live(page,'engraving')
  await expect(host(page,'engraving')).toHaveAttribute('data-finish','graphite')
  await page.getByRole('button',{name:'Убрать гравировку',exact:true}).click()
  await expect(host(page,'engraving')).toHaveAttribute('data-engraving','')
  await expect.poll(()=>page.evaluate(()=>localStorage.getItem('karpov:engraving'))).toBe(null)
})

test('the finale assembles all carriers, reveals the signature only after motion, and replays the original story',async({page})=>{
  await ready(page)
  // Late font/content layout changes above the finale must update its scroll
  // bounds too, even though the fixed-height 3D host itself did not resize.
  await page.locator('.collection-intro').evaluate(section=>{
    section.style.paddingBottom=`${parseFloat(getComputedStyle(section).paddingBottom)+137}px`
  })
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  await ending(page,.04)
  await expect(host(page,'assembly')).toHaveAttribute('data-assembly-pose','1.00000')
  expect(await page.locator('.finale-copy').evaluate(el=>Number(getComputedStyle(el).opacity))).toBe(0)
  await expect.poll(()=>page.locator('.site-header').evaluate(el=>Number(getComputedStyle(el).opacity))).toBe(0)
  await ending(page,.42)
  const middle=await host(page,'assembly').getAttribute('data-camera')
  const pose=Number(await host(page,'assembly').getAttribute('data-assembly-pose'))
  expect(pose).toBeGreaterThan(0);expect(pose).toBeLessThan(1)
  await ending(page,.94)
  await expect(host(page,'assembly')).toHaveAttribute('data-assembly-pose','0.00000')
  const held=await host(page,'assembly').getAttribute('data-frames')
  await ending(page,.98)
  expect(await host(page,'assembly').getAttribute('data-frames')).toBe(held)
  expect(await page.locator('.finale-copy').evaluate(el=>Number(getComputedStyle(el).opacity))).toBe(1)
  await ending(page,.42)
  expect(await host(page,'assembly').getAttribute('data-camera')).toBe(middle)
  await ending(page,.98)
  await page.getByRole('button',{name:'Повторить историю',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBeLessThan(1500)
  await expect(page.getByRole('button',{name:'Пауза просмотра',exact:true})).toBeAttached()
  await page.keyboard.press('Escape')
  await expect(page.locator('canvas.detail-canvas')).toHaveCount(0)
})

test('reduced motion gives a compact completed finale and a static engraving view',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await ready(page)
  await page.locator('#personalize').scrollIntoViewIfNeeded();await live(page,'engraving')
  await expect(host(page,'engraving')).toHaveAttribute('data-reduced-motion','true')
  const frames=await host(page,'engraving').getAttribute('data-frames');await page.waitForTimeout(400)
  expect(await host(page,'engraving').getAttribute('data-frames')).toBe(frames)
  await page.locator('#finale').scrollIntoViewIfNeeded();await live(page,'assembly')
  expect((await page.locator('#finale').boundingBox())!.height).toBeLessThanOrEqual(1001)
  await expect(host(page,'assembly')).toHaveAttribute('data-assembly-pose','0.00000')
  expect(await page.locator('.finale-copy').evaluate(el=>Number(getComputedStyle(el).opacity))).toBe(1)
})

test('sound is silent by default, uses a real opt-in AudioContext, and pauses on simulated tab hiding',async({page})=>{
  await page.addInitScript(()=>{
    const scope=window as Window & {qaSound:{contexts:AudioContext[];starts:number}}
    scope.qaSound={contexts:[],starts:0}
    const Original=window.AudioContext
    window.AudioContext=class extends Original {constructor(...args:ConstructorParameters<typeof Original>){super(...args);scope.qaSound.contexts.push(this)}}
    const start=AudioBufferSourceNode.prototype.start
    AudioBufferSourceNode.prototype.start=function(...args:Parameters<typeof start>){scope.qaSound.starts++;return start.apply(this,args)}
  })
  await ready(page)
  expect(await page.evaluate(()=>(window as unknown as {qaSound:{contexts:unknown[]}}).qaSound.contexts.length)).toBe(0)
  await reveal(page);await page.locator('.site-header .sound-toggle').click()
  await expect(page.locator('.karpov-site')).toHaveAttribute('data-sound-status','playing')
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {qaSound:{starts:number}}).qaSound.starts)).toBeGreaterThan(0)
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))})
  await expect(page.locator('.karpov-site')).toHaveAttribute('data-sound-status','paused')
  expect(await page.evaluate(()=>(window as unknown as {qaSound:{contexts:AudioContext[]}}).qaSound.contexts[0].state)).toBe('suspended')
  const paused=await page.evaluate(()=>(window as unknown as {qaSound:{starts:number}}).qaSound.starts)
  await page.waitForTimeout(700);expect(await page.evaluate(()=>(window as unknown as {qaSound:{starts:number}}).qaSound.starts)).toBe(paused)
  await page.evaluate(()=>{delete (document as unknown as {hidden?:boolean}).hidden;document.dispatchEvent(new Event('visibilitychange'))})
  await expect(page.locator('.karpov-site')).toHaveAttribute('data-sound-status','playing')
  await reveal(page);await page.locator('.site-header .sound-toggle').click()
  await expect(page.locator('.karpov-site')).toHaveAttribute('data-sound-enabled','false')
  expect(await page.evaluate(()=>(window as unknown as {qaSound:{contexts:AudioContext[]}}).qaSound.contexts.length)).toBe(1)
})

test('the shared watch retries its asset and restores its WebGL context with the same initials',async({page})=>{
  test.setTimeout(300000)
  let count=0
  await page.route('**/models/pocket-watch.glb',route=>{count++;return count===2?route.fulfill({status:503,body:'Controlled lazy watch failure'}):route.continue()})
  await ready(page);await page.locator('#personalize').scrollIntoViewIfNeeded()
  await expect(host(page,'engraving')).toHaveAttribute('data-scene-status','error',{timeout:90000})
  await page.getByLabel('Ваши инициалы',{exact:true}).fill('K.P.')
  await page.getByRole('button',{name:'Повторить 3D-примерку',exact:true}).click()
  await live(page,'engraving');await expect(host(page,'engraving')).toHaveAttribute('data-engraving','K.P.')
  const original=await host(page,'engraving').locator('canvas').elementHandle()
  await original!.evaluate(canvas=>{const gl=(canvas as HTMLCanvasElement).getContext('webgl2')!,extension=gl.getExtension('WEBGL_lose_context')!;(canvas as HTMLCanvasElement&{qaRestore:()=>void}).qaRestore=()=>extension.restoreContext();extension.loseContext()})
  await expect(host(page,'engraving')).toHaveAttribute('data-scene-status','context-lost')
  await original!.evaluate(canvas=>(canvas as HTMLCanvasElement&{qaRestore:()=>void}).qaRestore())
  await live(page,'engraving');await expect(host(page,'engraving')).toHaveAttribute('data-engraving','K.P.')
  await expect(page.locator('canvas.watch-canvas, canvas.detail-canvas')).toHaveCount(2)
  await ending(page,.98);await expect(host(page,'assembly')).toHaveAttribute('data-engraving','K.P.')
})

test('unsupported audio leaves the live scene usable and shows a clear status',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message))
  await page.addInitScript(()=>{window.AudioContext=class {constructor(){throw new Error('Controlled unavailable audio')}} as unknown as typeof AudioContext})
  await ready(page);await reveal(page);await page.locator('.site-header .sound-toggle').click()
  await expect(page.locator('.sound-notice')).toHaveText('В этом браузере звук недоступен.')
  await expect(page.locator('.karpov-site')).toHaveAttribute('data-sound-enabled','false')
  await expect(page.locator('.experience')).toHaveAttribute('data-status','ready')
  expect(errors).toEqual([])
})
