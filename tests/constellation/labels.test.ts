import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SAMPLE, personName, progressAtAge, starPosition } from '../../src/features/constellation/story.ts'
import { projectPoint } from '../../src/features/constellation/projection.ts'
import { layoutLabels } from '../../src/features/constellation/labels.ts'
test('relationship labels fit without overlap across story years and aspect ratios', () => {
  for (const [width,height] of [[1256,776],[366,820],[296,716],[820,366],[272,662]]) for (const age of [0,8,15,19,27,33,38,40,56,68,85,90,100]) {
    const progress=progressAtAge(age),viewHeight=800*height/width
    const items=SAMPLE.map((p,i)=>{const point=starPosition(p,i,SAMPLE.length,progress,SAMPLE);return {id:p.id,name:personName(p,progress),...point,...projectPoint(point,progress,viewHeight)}})
    const labels=layoutLabels(items,width,viewHeight)
    for (let i=0;i<labels.length;i++) {
      const a=labels[i].box
      assert.ok(a.left>=104-1e-7&&a.right<=790&&a.top>=18&&a.bottom<=viewHeight*.74+1e-7)
      for (let j=i+1;j<labels.length;j++) {
        const b=labels[j].box
        assert.ok(!(a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top))
      }
    }
    const me=items.find(p=>p.id==='self')!
    if(me.visible&&me.x>104&&me.y>15&&me.y<viewHeight*.73) assert.ok(labels.some(l=>l.id==='self'))
  }
})
