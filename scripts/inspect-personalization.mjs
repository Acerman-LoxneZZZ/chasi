import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const out='docs/screenshots/finale'
mkdirSync(out,{recursive:true})
const quick=process.argv.includes('--quick')
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})
const page=await browser.newPage({viewport:{width:1440,height:1000},locale:'ru-RU'})
const errors=[],warnings=[],external=[],shots=[]
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(['error','warning'].includes(m.type()))warnings.push(m.text())})
page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:')&&!/^(data|blob):/.test(r.url()))external.push(r.url())})
try{
 await page.goto(process.env.PW_BASE_URL||'http://127.0.0.1:4174/')
 await page.locator('.experience[data-status="ready"]').waitFor({timeout:90000})
 await page.evaluate(()=>document.fonts.ready)
 const entry=await page.locator('script[type=module]').getAttribute('src')
 const build={entry:entry.replace(/^\.\//,''),sha256:createHash('sha256').update(readFileSync('dist/'+entry.replace(/^\.\//,''))).digest('hex')}
 for(const [width,height] of(quick?[[1440,1000],[390,844]]:[[1440,1000],[1280,800],[390,844],[360,800]])){
  await page.setViewportSize({width,height});await page.mouse.move(width/2,height/2)
  await page.locator('#personalize').scrollIntoViewIfNeeded()
  const host=page.locator('.detail-scene[data-scene-kind="engraving"]')
  await expectReady(host)
  if(await page.locator('#engraving-input').inputValue()) {
   await page.locator('#engraving-input').fill('')
   await host.scrollIntoViewIfNeeded();await expectReady(host)
   await page.waitForFunction(()=>document.querySelector('[data-scene-kind="engraving"]').dataset.engraving==='')
  }
  const before=+(await host.getAttribute('data-frames'))
  await page.locator('#engraving-input').fill('А.К.')
  await host.scrollIntoViewIfNeeded();await expectReady(host)
  await page.waitForFunction(before=>{const h=document.querySelector('[data-scene-kind="engraving"]');return h.dataset.engraving==='А.К.'&&+h.dataset.frames>before},before,{timeout:60000})
  await page.screenshot({path:`${out}/${width}-engraving.png`})
  shots.push(await describe('engraving',width))
  for(const p of(quick?[0,.45,.98]:[0,.4,.78,.98])){
   await page.evaluate(p=>{const s=document.getElementById('finale'),pin=s.querySelector('.finale-pin');scrollTo({top:s.getBoundingClientRect().top+scrollY+(s.offsetHeight-pin.offsetHeight)*p,behavior:'instant'})},p)
   const finale=page.locator('.detail-scene[data-scene-kind="assembly"]')
   await expectReady(finale)
   await page.waitForFunction(p=>{const h=document.querySelector('[data-scene-kind="assembly"]');return Math.abs(+h.dataset.progress-p)<.001&&h.dataset.renderedProgress===h.dataset.progress},p,{timeout:60000})
   await page.waitForTimeout(400)
   await page.screenshot({path:`${out}/${width}-assembly-${p}.png`})
   shots.push(await describe('assembly',width,p))
  }
 }
 writeFileSync(`${out}/metrics${quick?'-initial':''}.json`,JSON.stringify({build,method:'Headless Chrome / ANGLE SwiftShader, viewport emulation; not physical hardware validation',errors,warnings,external,shots},null,2)+'\n')
 console.log(JSON.stringify({build,shots:shots.length,errors,warnings,external,overflow:shots.filter(s=>s.overflow).length}))
}finally{await browser.close()}
async function expectReady(host){await host.waitFor({state:'visible'});await page.waitForFunction(kind=>{const h=document.querySelector(`[data-scene-kind="${kind}"]`);return h.dataset.sceneStatus==='ready'&&h.dataset.active==='true'&&!!h.querySelector('canvas')},await host.getAttribute('data-scene-kind'),{timeout:90000})}
async function describe(kind,width,requested){return page.locator(`.detail-scene[data-scene-kind="${kind}"]`).evaluate((h,{kind,width,requested})=>({kind,width,requested,...h.dataset,canvas:!!h.querySelector('canvas.detail-canvas'),headerOpacity:getComputedStyle(document.querySelector('.site-header')).opacity,signatureOpacity:getComputedStyle(document.querySelector('.finale-copy')).opacity,sharedCanvasCount:document.querySelectorAll('canvas.detail-canvas').length,overflow:document.documentElement.scrollWidth>innerWidth+1}),{kind,width,requested})}
