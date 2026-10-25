import {test} from 'node:test'
import assert from 'node:assert/strict'
import {listenForSoundUnlock,startAudibleSound} from '../../src/features/constellation/sound.ts'
const sample=()=>({paused:true,ended:false,duration:119.97,currentTime:0,muted:true,volume:.5,play:async()=>{}})
test('sound is audible by default and starts at the current story time',async()=>{
 const audio=sample();assert.equal(await startAudibleSound(audio,32,true),true)
 assert.equal(audio.muted,false);assert.equal(audio.volume,1);assert.equal(audio.currentTime,32)
})
test('a blocked autoplay can retry without rewinding or muting the story',async()=>{
 const audio=sample();audio.play=async()=>{throw new Error('NotAllowedError')}
 assert.equal(await startAudibleSound(audio,0,true),false)
 audio.play=async()=>{}
 assert.equal(await startAudibleSound(audio,18,true),true)
 assert.equal(audio.currentTime,18);assert.equal(audio.muted,false)
})
test('finishing music never restarts it',async()=>{
 const audio=sample();let attempts=0;audio.play=async()=>{attempts++}
 audio.ended=true;assert.equal(await startAudibleSound(audio,120,false),false)
 assert.equal(attempts,0)
})

test('a touch release retries sound after a denied pointerdown, then cleans up',async()=>{
 const target=new EventTarget(),audio=sample();let activated=false,attempts=0
 audio.play=async()=>{attempts++;if(!activated)throw new Error('NotAllowedError');audio.paused=false}
 const remove=listenForSoundUnlock(target,()=>{if(audio.paused)void startAudibleSound(audio,8,true)})
 target.dispatchEvent(new Event('pointerdown'));await Promise.resolve();assert.equal(audio.paused,true)
 activated=true;target.dispatchEvent(new Event('touchend'));await Promise.resolve()
 assert.equal(audio.paused,false);assert.equal(audio.currentTime,8);assert.equal(audio.muted,false)
 remove();audio.paused=true;target.dispatchEvent(new Event('click'));assert.equal(attempts,2)
})

test('canplay retries do not continuously seek a track already aligned with the story',async()=>{
 const audio=sample();let seeks=0,time=20
 Object.defineProperty(audio,'currentTime',{get:()=>time,set:(value:number)=>{seeks++;time=value}})
 await startAudibleSound(audio,20.1,true)
 assert.equal(seeks,0)
 await startAudibleSound(audio,23,true)
 assert.equal(seeks,1)
})
