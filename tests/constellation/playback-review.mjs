import assert from 'node:assert/strict'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright')
const url=process.argv[2]||'http://127.0.0.1:5194/experiments/constellation/'
let freshStarts=0,captions=0
for(const mode of ['allowed','blocked-touch','blocked-mouse']) {
  const browser=await chromium.launch({headless:true,args:[`--autoplay-policy=${mode==='allowed'?'no-user-gesture-required':'user-gesture-required'}`]})
  try {
    for(let repeat=0;repeat<(mode==='allowed'?6:1);repeat++) {
      const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:mode==='blocked-touch'})
      const page=await context.newPage(),errors=[]
      page.on('pageerror',error=>errors.push(error.message))
      const cdp=await context.newCDPSession(page)
      const read=async expression=>(await cdp.send('Runtime.evaluate',{expression,returnByValue:true,userGesture:false})).result.value
      const state=()=>read(`(()=>{const a=document.querySelector('audio');return a&&{paused:a.paused,muted:a.muted,time:a.currentTime,ready:a.readyState,prompt:!!document.querySelector('.cl-sound-prompt'),activated:navigator.userActivation.hasBeenActive}})()`)
      await page.goto(url)
      for(let n=0;n<60;n++){const s=await state();if(s?.ready>=3&&(mode==='allowed'?!s.paused:s.prompt))break;await page.waitForTimeout(100)}
      if(mode!=='allowed') {
        const before=await state();assert.equal(before.paused,true);assert.equal(before.prompt,true);assert.equal(before.activated,false)
        const button=page.getByRole('button',{name:'Enable the soundtrack'})
        assert.ok((await button.boundingBox()).height>=44)
        if(mode==='blocked-touch')await button.tap();else await button.click()
      }
      await page.waitForTimeout(500)
      const first=await state();await page.waitForTimeout(500);const next=await state()
      assert.equal(first.paused,false,JSON.stringify({mode,repeat,first}));assert.equal(first.muted,false);assert.equal(next.prompt,false);assert.ok(next.time>first.time+.1)
      if(mode==='allowed')assert.equal(first.activated,false)
      freshStarts++
      if(mode==='allowed'&&repeat===0) {
        for(const [width,height]of [[1280,800],[390,844],[320,740],[844,390]]) {
          await page.setViewportSize({width,height})
          for(const [seconds,text]of [[3,'Life is already moving.'],[8,'Then you arrive.'],[33,'Some paths become home.'],[39,'And your world grows.'],[46,'Sometimes people die young.'],[112,'Take care of the people around you.'],[119.7,'To my brother, Mikael.']]) {
            await read(`document.querySelector('audio').currentTime=${seconds};void document.querySelector('audio').play()`)
            await page.waitForTimeout(250)
            const caption=await read(`(()=>{const e=document.querySelector('.cl-story-message');if(!e)return null;const r=e.getBoundingClientRect();return {text:e.textContent,opacity:Number(getComputedStyle(e).opacity),left:r.left,right:r.right,top:r.top,bottom:r.bottom}})()`)
            assert.ok(caption?.text.includes(text),JSON.stringify({seconds,caption}));assert.ok(caption.opacity>.7)
            assert.ok(caption.left>=0&&caption.right<=width&&caption.top>=0&&caption.bottom<=height)
            captions++
          }
        }
        const flow=()=>read(`[...document.querySelectorAll('[data-future-flow] path')].map(p=>p.getAttribute('d')).join('|')`)
        const before=await flow();await page.waitForTimeout(1000);assert.notEqual(await flow(),before)
      }
      assert.deepEqual(errors,[])
      await context.close()
    }
  } finally {await browser.close()}
}
console.log(JSON.stringify({freshStarts,actualPlaybackCaptions:captions,method:'isolated headless audio and DOM checks; no screenshots'}))
