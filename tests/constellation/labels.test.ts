import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SAMPLE, personLabelOpacity, personName, storyAge, progressAtAge, starPosition } from '../../src/features/constellation/story.ts'
import { projectPoint } from '../../src/features/constellation/projection.ts'
import { layoutLabels } from '../../src/features/constellation/labels.ts'
test('relationship labels fit without overlap across story years and aspect ratios', () => {
  for (const [width,height] of [[1256,776],[366,820],[296,716],[820,366],[272,662]]) for (const age of [0,8,15,19,27,33,38,40,56,68,85,90,100]) {
    const progress=progressAtAge(age),viewHeight=800*height/width
    const items=SAMPLE.map((p,i)=>{const point=starPosition(p,i,SAMPLE.length,progress,SAMPLE);return {id:p.id,name:personName(p,progress),...point,...projectPoint(point,progress,viewHeight),memorial:p.end!==null&&p.exit!=='fade'&&storyAge(progress)>p.end+(p.id==='brother'?1.8:.7),opacity:personLabelOpacity(p,progress),visible:point.visible&&personLabelOpacity(p,progress)>.002}})
    const labels=layoutLabels(items,width,viewHeight)
    for (let i=0;i<labels.length;i++) {
      const a=labels[i].box
      assert.ok(a.left>=104-1e-7&&a.right<=790&&a.top>=18&&a.bottom<=viewHeight*.74+1e-7)
      for (let j=i+1;j<labels.length;j++) {
        const b=labels[j].box
        assert.ok(!(a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top),`${width}x${height} age ${age}: ${labels[i].id}/${labels[j].id}`)
      }
    }
    const me=items.find(p=>p.id==='self')!
    if(me.visible&&me.x>104&&me.y>15&&me.y<viewHeight*.73) assert.ok(labels.some(l=>l.id==='self'))
  }
})

test('Mom, Dad and Brother labels have no frame-to-frame slot jumps', async () => {
  const {StableLabelLayout}=await import('../../src/features/constellation/labels.ts')
  for(const [width,height] of [[1256,776],[366,820],[296,716],[820,366]]) {
    const layout=new StableLabelLayout(),viewHeight=800*height/width
    const previous=new Map<string,{x:number;y:number}>()
    for(let frame=0;frame<=120*20;frame++) {
      const progress=frame/20/120
      const items=SAMPLE.map((p,i)=>{const point=starPosition(p,i,SAMPLE.length,progress,SAMPLE);return{id:p.id,name:personName(p,progress),...point,...projectPoint(point,progress,viewHeight),memorial:p.end!==null&&p.exit!=='fade'&&storyAge(progress)>p.end+(p.id==='brother'?1.8:.7),opacity:personLabelOpacity(p,progress),visible:point.visible&&personLabelOpacity(p,progress)>.002}})
      const labels=layout.update(items,width,viewHeight,1/20)
      for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++) {
        const a=labels[i],b=labels[j]
        if((items.find(item=>item.id===a.id)?.opacity??0)<.9||(items.find(item=>item.id===b.id)?.opacity??0)<.9)continue
        const ox=Math.min(a.box.right,b.box.right)-Math.max(a.box.left,b.box.left)
        const oy=Math.min(a.box.bottom,b.box.bottom)-Math.max(a.box.top,b.box.top)
        assert.ok(ox<=2||oy<=2,`${a.id}/${b.id} overlap at ${frame/20}s, width ${width}`)
      }
      const visibleIds=new Set(labels.map(label=>label.id))
      for(const id of previous.keys())if(!visibleIds.has(id))previous.delete(id)
      for(const label of labels) {
        const item=items.find(item=>item.id===label.id)!,offset={x:label.x-item.x,y:label.y-item.y},old=previous.get(label.id)
        if(old) {
          const limit=55*800/width/20+1e-7
          assert.ok(Math.abs(offset.x-old.x)<=limit,`${label.id} x jumped at ${frame/20}s`)
          assert.ok(Math.abs(offset.y-old.y)<=limit,`${label.id} y jumped at ${frame/20}s`)
        }
        previous.set(label.id,offset)
      }
    }
  }
})
