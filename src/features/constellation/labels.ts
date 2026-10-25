export interface LabelItem { id: string; name: string; x: number; y: number; visible: boolean; opacity?: number; memorial?: boolean }
export interface LabelBox { left: number; right: number; top: number; bottom: number }
export interface SkyLabel { id: string; x: number; y: number; font: number; lineHeight: number; lines: string[]; box: LabelBox; leader: { x: number; y: number } }
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n))
// A person always owns this tier. Other arrivals cannot swap their label to
// another row. Siblings, friends and children also have separate physical lanes.
export const LABEL_TIERS:Record<string,number>={self:-1,partner:1,mom:-2,dad:1,brother:-3,sister:2,grandma:-1,grandpa:3,'childhood-friend':-4,'first-love':-2,'college-friends':2,child:-2,daughter:3,'child-partner':1,'grandchild-1':-3,'grandchild-2':-4}
const hash=(id:string)=>[...id].reduce((n,c)=>n*31+c.charCodeAt(0),0)>>>0
function withPosition(label:SkyLabel,x:number,y:number,item:LabelItem):SkyLabel {
  const dx=x-label.x,dy=y-label.y
  const box={left:label.box.left+dx,right:label.box.right+dx,top:label.box.top+dy,bottom:label.box.bottom+dy}
  return {...label,x,y,box,leader:{x:clamp(item.x,box.left+4,box.right-4),y:item.y<box.top?box.top:box.bottom}}
}
export function layoutLabels(items:LabelItem[],width:number,viewHeight:number) {
  const font=Math.min(34,16*800/width),step=font*1.08+16
  const sources=new Map(items.map(item=>[item.id,item]))
  const labels:SkyLabel[]=[]
  for(const item of items) {
    if(!item.visible||item.x<104||item.x>788||item.y<15||item.y>viewHeight*.73)continue
    const spaces=[...item.name.matchAll(/ /g)].map(m=>m.index)
    const split=spaces.sort((a,b)=>Math.abs(a-item.name.length/2)-Math.abs(b-item.name.length/2))[0]
    const lines=item.name.length>11&&split!==undefined?[item.name.slice(0,split),item.name.slice(split+1)]:[item.name]
    const w=Math.max(...lines.map(line=>line.length))*font*.60+8,h=lines.length*font*1.08+6
    const shortTiers:Record<string,number>={sister:-5,daughter:-4,grandpa:-4,'college-friends':-4,'grandchild-2':-6}
    const tier=item.memorial?(['mom','grandpa','partner'].includes(item.id)?1:-1):((viewHeight<650?shortTiers[item.id]:undefined)??LABEL_TIERS[item.id]??((hash(item.id)%3)+1)*(hash(item.id)%2?1:-1))
    const top=clamp(tier<0?item.y-h-14-(Math.abs(tier)-1)*step:item.y+14+(tier-1)*step,18,viewHeight*.74-h)
    const x=clamp(item.x,104+w/2,788-w/2),y=top+font
    labels.push({id:item.id,x,y,font,lineHeight:font*1.08,lines,box:{left:x-w/2,right:x+w/2,top,bottom:top+h},leader:{x:item.x,y:tier<0?top+h:top}})
  }
  // Soft continuous separation within the owned tier, without choosing cells
  // or sorting nearest candidates. Separation is planned while names fade in.
  for(let pass=0;pass<24;pass++)for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++) {
    const a=labels[i],b=labels[j],ab=a.box,bb=b.box
    const ox=Math.min(ab.right,bb.right)-Math.max(ab.left,bb.left)+20
    const oy=Math.min(ab.bottom,bb.bottom)-Math.max(ab.top,bb.top)+20
    if(ox<=0||oy<=0)continue
    const ai=sources.get(a.id)!,bi=sources.get(b.id)!
    const strength=1
    const direction=ai.x===bi.x?(hash(a.id)<hash(b.id)?-1:1):ai.x<bi.x?-1:1
    const push=ox*.51*strength
    const ax=clamp(a.x+direction*push,104+(ab.right-ab.left)/2,788-(ab.right-ab.left)/2)
    const bx=clamp(b.x-direction*push,104+(bb.right-bb.left)/2,788-(bb.right-bb.left)/2)
    labels[i]=withPosition(a,ax,a.y,ai);labels[j]=withPosition(b,bx,b.y,bi)
  }
  return labels
}
export class StableLabelLayout {
  private previous=new Map<string,{label:SkyLabel;starX:number;starY:number}>()
  private viewport=''
  private lastPoints=new Map<string,{x:number;y:number}>()
  update(items:LabelItem[],width:number,height:number,deltaSeconds:number) {
    const viewport=`${width}:${height}`
    if(viewport!==this.viewport){this.previous.clear();this.lastPoints.clear();this.viewport=viewport}
    const dt=clamp(deltaSeconds,0,.1),blend=1-Math.exp(-dt/.3)
    // Plan separation ahead of the moving stars, so easing begins before
    // names touch, rather than responding only after an overlap occurs.
    const ahead=items.map(item=>{
      const previous=this.lastPoints.get(item.id)
      const vx=previous&&dt>0?(item.x-previous.x)/dt:0,vy=previous&&dt>0?(item.y-previous.y)/dt:0
      this.lastPoints.set(item.id,{x:item.x,y:item.y})
      return {...item,x:clamp(item.x+vx*.8,104,788),y:clamp(item.y+vy*.8,15,height*.73)}
    })
    const targets=layoutLabels(ahead,width,height).map(label=>{
      const actual=items.find(item=>item.id===label.id)!,future=ahead.find(item=>item.id===label.id)!
      return withPosition(label,label.x+actual.x-future.x,label.y+actual.y-future.y,actual)
    })
    const visibleIds=new Set(targets.map(target=>target.id))
    for(const id of this.previous.keys())if(!visibleIds.has(id))this.previous.delete(id)
    return targets.map(target=>{
      const item=items.find(item=>item.id===target.id)!,old=this.previous.get(target.id)
      let label=target
      if(old) {
        // Follow the star directly. Only collision corrections ease slowly;
        // their maximum speed is 55 CSS pixels/second, independent of viewport.
        const x=old.label.x+item.x-old.starX,y=old.label.y+item.y-old.starY
        const limit=55*800/width*dt
        label=withPosition(target,x+clamp((target.x-x)*blend,-limit,limit),y+clamp((target.y-y)*blend,-limit,limit),item)
      }
      this.previous.set(item.id,{label,starX:item.x,starY:item.y})
      return label
    })
  }
}
