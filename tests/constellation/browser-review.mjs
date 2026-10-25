// Isolated browser geometry checks. Does not attach to a personal browser or
// capture screens. Supply PLAYWRIGHT_MODULE if Playwright is installed externally.
import assert from 'node:assert/strict'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright')
const base=process.argv[2]||'http://127.0.0.1:5194'
const browser=await chromium.launch({headless:true})
let states=0
try {
  const page=await browser.newPage(),errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  for(const [width,height,safe]of [[1280,800,false],[390,844,false],[320,740,false],[390,844,true],[320,740,true],[844,390,true]]) {
    await page.setViewportSize({width,height})
    for(const year of [85,90,95,100,130,180,200,215,230,500]) {
      await page.goto(`${base}/tests/constellation/review.html?age=${year}${safe?'&safe=1':''}`)
      await page.locator('.cl-sky-svg').waitFor()
      const state=await page.evaluate(()=>{
        const svg=document.querySelector('.cl-sky-svg'),height=svg.viewBox.baseVal.height
        const names=[...document.querySelectorAll('[data-label]')].filter(g=>Number(g.getAttribute('opacity'))>.85).map(g=>{
          const r=g.querySelector('text').getBoundingClientRect()
          return {id:g.dataset.label,x:r.x,y:r.y,right:r.right,bottom:r.bottom}
        })
        const overlaps=[]
        for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++) {
          const a=names[i],b=names[j]
          if(Math.min(a.right,b.right)-Math.max(a.x,b.x)>2&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>2)overlaps.push([a.id,b.id])
        }
        const remembered=['self','partner','mom','dad','grandma','grandpa','brother'].map(id=>{
          const group=document.querySelector(`[data-person="${id}"]`),dot=group?.querySelector('circle')
          return dot&&Number(group.getAttribute('opacity'))>.8&&Number(dot.getAttribute('cx'))>104&&Number(dot.getAttribute('cx'))<788&&Number(dot.getAttribute('cy'))>15&&Number(dot.getAttribute('cy'))<height*.73
        })
        const root=document.querySelector('[data-ancestor="self"]')?.getAttribute('d'),you=document.querySelector('[data-person="self"] circle')
        return {overlaps,remembered,root,you:[you?.getAttribute('cx'),you?.getAttribute('cy')],youLabel:names.some(n=>n.id==='self'),axis:Number(document.querySelector('.cl-age-axis').getAttribute('opacity')),individuals:document.querySelectorAll('[data-future-life],[data-living-trail]').length,links:document.querySelectorAll('[data-memorial-link]').length,tooltips:document.querySelectorAll('svg title,[title]').length,overflow:document.documentElement.scrollWidth>innerWidth}
      })
      assert.deepEqual(state.overlaps,[],`${width}x${height} year ${year}`)
      assert.equal(state.tooltips,0);assert.equal(state.overflow,false)
      if(year>=115){assert.ok(state.remembered.every(Boolean));assert.equal(state.links,7);assert.ok(state.youLabel)}
      if(year<=200)assert.equal(state.axis,1)
      if(year===215)assert.ok(Math.abs(state.axis-.5)<1e-7)
      if(year>=230)assert.equal(state.axis,0)
      if(year>=200)assert.equal(state.individuals,0)
      if(year>120)assert.ok(state.root.startsWith(`M${state.you[0]},${state.you[1]} `),'the mass must visibly originate at You')
      states++
    }
  }
  assert.deepEqual(errors,[])
  console.log(JSON.stringify({states,pageErrors:errors,method:'isolated headless DOM geometry; no screenshots'}))
} finally {await browser.close()}
