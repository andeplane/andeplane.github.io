import {test} from 'node:test'
import assert from 'node:assert/strict'
import {startAudibleSound} from '../../src/features/constellation/sound.ts'
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
