// Capture uninterrupted playback every five seconds through 30 seconds after
// the score. Run named profiles (desktop phone narrow landscape), then inspect
// every PNG. Screenshots and state records go to REVIEW_OUTPUT (outside git).
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.env.REVIEW_OUTPUT||'/tmp/constellation-playback-review';
const url=process.env.REVIEW_URL||'http://127.0.0.1:5194/experiments/constellation/';
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const profiles={desktop:[1280,800,false],phone:[390,844,false],narrow:[320,740,true],landscape:[844,390,true]};
async function capture(name){
 const [width,height,safe]=profiles[name];const dir=`${out}/${name}`;await mkdir(dir,{recursive:true});
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1});
 const page=await context.newPage(),errors=[],frames=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{Math.random=()=>.2;window.__reviewAudioEnded=0;document.addEventListener('ended',e=>{if(e.target.tagName==='AUDIO')window.__reviewAudioEnded=performance.now()},true)});
 await page.goto(url);
 if(safe)await page.addStyleTag({content:'.cl-app{padding:44px 24px 34px!important}'});
 await page.locator('.cl-sky-svg').waitFor();
 const cdp=await context.newCDPSession(page);
 const read=async expression=>(await cdp.send('Runtime.evaluate',{expression,returnByValue:true,userGesture:false})).result.value;
 for(const target of Array.from({length:31},(_,i)=>i*5)){
  for(let i=0;i<160;i++){
   const time=await read(`(()=>{const a=document.querySelector('audio');return a.ended?a.duration+(performance.now()-window.__reviewAudioEnded)/1000:a.currentTime})()`);
   if(time>=target)break;
   await page.waitForTimeout(100);
   if(i===159)throw Error(`${name} playback stalled before ${target}`);
  }
  const state=await read(`(()=>{
   const a=document.querySelector('audio'),app=document.querySelector('.cl-app');
   const labels=[...document.querySelectorAll('[data-label]')].filter(g=>Number(g.getAttribute('opacity'))>.85).map(g=>{const r=g.querySelector('text').getBoundingClientRect();return {id:g.dataset.label,x:r.x,y:r.y,right:r.right,bottom:r.bottom}});
   const overlaps=[];for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){const x=labels[i],y=labels[j];if(Math.min(x.right,y.right)-Math.max(x.x,y.x)>2&&Math.min(x.bottom,y.bottom)-Math.max(x.y,y.y)>2)overlaps.push([x.id,y.id])}
   const caption=document.querySelector('.cl-story-message');const cr=caption?.getBoundingClientRect();
   return {time:a.currentTime,ended:a.ended,paused:a.paused,muted:a.muted,progress:app.dataset.progress,age:document.querySelector('.cl-current-age')?.textContent,axisOpacity:document.querySelector('.cl-age-axis')?.getAttribute('opacity'),labels,overlaps,caption:caption?.textContent,captionOpacity:caption?Number(getComputedStyle(caption).opacity):0,captionInBounds:!cr||(cr.left>=0&&cr.right<=innerWidth&&cr.top>=0&&cr.bottom<=innerHeight),overflow:document.documentElement.scrollWidth>innerWidth,tooltips:document.querySelectorAll('svg title,[title]').length,hidden:document.hidden,flow:[...document.querySelectorAll('[data-future-flow] path')].map(p=>p.getAttribute('d')).join('|'),links:document.querySelectorAll('[data-memorial-link]').length};
  })()`);
  await page.screenshot({path:`${dir}/${String(target).padStart(3,'0')}.png`,animations:'allow'});
  frames.push({target,...state});
  await writeFile(`${dir}/frames.json`,JSON.stringify({name,width,height,safe,errors,frames},null,2));
 }
 await context.close();return {name,frames:frames.length,errors,overlaps:frames.filter(f=>f.overlaps.length).map(f=>({time:f.target,overlaps:f.overlaps})),badLayout:frames.filter(f=>!f.captionInBounds||f.overflow||f.tooltips).map(f=>f.target),continues:frames.at(-1).flow!==frames.at(-2).flow};
}
try {
 const names=process.argv.slice(2);assert.ok(names.length,'Specify one or two profiles to review');
 for(const name of names)assert.ok(name in profiles,`Unknown profile: ${name}`);
 const results=await Promise.all(names.map(capture));
 console.log(JSON.stringify(results));
 for(const r of results){assert.deepEqual(r.errors,[]);assert.deepEqual(r.overlaps,[]);assert.deepEqual(r.badLayout,[]);assert.ok(r.continues);}
} finally {await browser.close()}
