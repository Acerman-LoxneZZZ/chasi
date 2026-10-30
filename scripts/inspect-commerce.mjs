import {chromium} from '@playwright/test'
import {mkdirSync,writeFileSync} from 'node:fs'
const out=process.argv[2] || 'docs/screenshots/karpov';mkdirSync(out,{recursive:true})
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})
const page=await browser.newPage({viewport:{width:1440,height:1000},locale:'ru-RU'})
const errors=[],consoleProblems=[],externalRequests=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(['error','warning'].includes(m.type()))consoleProblems.push(m.text())});page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:')&&!r.url().startsWith('data:'))externalRequests.push(r.url())});const results=[]
try{
await page.goto(process.env.PW_BASE_URL || 'http://127.0.0.1:4173/')
await page.locator('.experience[data-status="ready"]').waitFor({timeout:90000});await page.evaluate(()=>document.fonts.ready)
const environment=await page.locator('canvas').evaluate(el=>{const gl=el.getContext('webgl2');const ext=gl.getExtension('WEBGL_debug_renderer_info');return {userAgent:navigator.userAgent,renderer:gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER),entry:document.querySelector('script[type=module]').src,method:'Headless Chrome / ANGLE SwiftShader; viewport emulation, not a physical phone or hardware GPU benchmark'}})
for(const[w,h]of[[1440,1000],[390,844]]){
 await page.setViewportSize({width:w,height:h});await page.waitForTimeout(200)
 for(const p of[0,.28,.53,.78,.97]){
  await page.evaluate(p=>{const s=document.querySelector('.watch-story');scrollTo({top:+s.dataset.storyStart + +s.dataset.storyTravel*p,behavior:'instant'})},p)
  await page.waitForFunction(p=>Math.abs(+document.querySelector('canvas').dataset.progress-p)<.001,p,{timeout:30000})
  await page.waitForFunction(()=>{const c=document.querySelector('canvas');return c.dataset.renderedProgress===c.dataset.progress},null,{timeout:30000})
  await page.waitForTimeout(650);await page.screenshot({path:`${out}/${w}-stop-${p}.png`})
  results.push(await page.evaluate(()=>({kind:'stop',w:innerWidth,p:document.querySelector('canvas').dataset.progress,pose:document.querySelector('canvas').dataset.poseProgress,overflow:document.documentElement.scrollWidth>innerWidth+1,bounds:JSON.parse(document.querySelector('canvas').dataset.bounds)})))
 }
 for(const id of['design','materials','mechanism','selection','specifications']){
  await page.evaluate(id=>{const el=document.getElementById(id);scrollTo({top:el.getBoundingClientRect().top+scrollY-76,behavior:'instant'})},id)
  await page.waitForTimeout(350);await page.locator(`#${id} img`).evaluateAll(async imgs=>{await Promise.all(imgs.map(im=>im.decode().catch(()=>{})))})
  await page.screenshot({path:`${out}/${w}-${id}.png`})
  results.push(await page.evaluate(id=>({kind:id,w:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,images:[...document.querySelectorAll(`#${id} img`)].map(im=>({src:im.getAttribute('src'),loaded:im.naturalWidth>0}))}),id))
 }
}
writeFileSync(`${out}/metrics.json`,JSON.stringify({environment,errors,consoleProblems,externalRequests,results},null,2));console.log(JSON.stringify({errors,consoleProblems,externalRequests,shots:results.length,overflow:results.filter(r=>r.overflow)}))
}finally{await browser.close()}
