export interface SoundElement {
  paused:boolean;ended:boolean;duration:number;currentTime:number;muted:boolean;volume:number
  play():Promise<void>
}
// Autoplay is requested audibly. A denied browser policy is not bypassed;
// the next real interaction retries at the current story time, without a reset.
export async function startAudibleSound(audio:SoundElement,storySeconds:number,align:boolean) {
  const duration=Number.isFinite(audio.duration)?audio.duration:120
  if(audio.ended||storySeconds>=duration)return false
  audio.muted=false
  audio.volume=1
  if(align) {try{audio.currentTime=Math.min(Math.max(0,storySeconds),duration-.01)}catch{/* retry alignment after metadata arrives */}}
  try {await audio.play();return true}catch{return false}
}
