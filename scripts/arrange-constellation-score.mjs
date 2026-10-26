// Preserve the Suno composition; make a restrained memorial mix around the
// brother's death at 43 seconds. The untouched master stays beside this edit.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const source=fileURLToPath(new URL('../public/projects/constellation/music/life-goes-on.mp3',import.meta.url))
const output=fileURLToPath(new URL('../public/projects/constellation/music/life-goes-on-memorial.mp3',import.meta.url))
const ease=x=>`(0.5-0.5*cos(PI*min(1,max(0,${x}))))`
// Four seconds of anticipation, two seconds to hold the loss, six to recover.
const emotion=`if(isnan(t),0,(${ease('(t-39)/4')}*(1-${ease('(t-45)/6')})))`
const filter=[
  '[0:a]asplit=2[dry][felt]',
  `[dry]volume='1-0.78*${emotion}':eval=frame[d]`,
  `[felt]lowpass=f=1800,aecho=0.8:0.8:180|360:0.16|0.10,volume='0.38*${emotion}':eval=frame[f]`,
  '[d][f]amix=inputs=2:duration=first:normalize=0,atrim=duration=120[out]',
].join(';')
const result=spawnSync('ffmpeg',['-hide_banner','-loglevel','warning','-y','-i',source,'-filter_complex',filter,'-map','[out]','-ar','48000','-c:a','libmp3lame','-q:a','2',output],{stdio:'inherit'})
if(result.error)throw result.error
process.exitCode=result.status??1
