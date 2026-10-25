export interface LabelItem { id: string; name: string; x: number; y: number; visible: boolean }
export interface LabelBox { left: number; right: number; top: number; bottom: number }
export interface SkyLabel { id: string; x: number; y: number; font: number; lineHeight: number; lines: string[]; box: LabelBox; leader: { x: number; y: number } }
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n))
export function layoutLabels(items: LabelItem[], width: number, viewHeight: number) {
  const font = Math.min(34, 16 * 800 / width)
  const boxes: LabelBox[] = []
  const labels: SkyLabel[] = []
  const priority = ['self','partner','mom','dad','brother','sister']
  const rank = (id: string) => priority.includes(id) ? priority.indexOf(id) : 10
  for (const item of [...items].sort((a,b) => rank(a.id) - rank(b.id))) {
    if (!item.visible || item.x < 104 || item.x > 788 || item.y < 15 || item.y > viewHeight * .73) continue
    const spaces = [...item.name.matchAll(/ /g)].map(m => m.index)
    const split = spaces.sort((a,b) => Math.abs(a-item.name.length/2)-Math.abs(b-item.name.length/2))[0]
    const lines = item.name.length > 11 && split !== undefined ? [item.name.slice(0,split),item.name.slice(split+1)] : [item.name]
    const w = Math.max(...lines.map(line => line.length)) * font * .60 + 8
    const h = lines.length * font * 1.08 + 6
    const sceneBottom = viewHeight * .74
    const candidates: {x:number;y:number}[] = []
    for (let row=0;row<8;row++) for (const dx of [0,-28,28,-56,56,-84,84]) {
      const y = row % 2 ? item.y + 13 + Math.floor(row/2)*(h+12) : item.y - h - 13 - Math.floor(row/2)*(h+12)
      candidates.push({x:clamp(item.x+dx,104+w/2,788-w/2),y})
    }
    for (let y=20;y+h<sceneBottom;y+=font+12) for (let x=104+w/2;x+w/2<790;x+=60) candidates.push({x,y})
    candidates.sort((a,b) => Math.hypot(a.x-item.x,(a.y+h/2-item.y)*1.1)-Math.hypot(b.x-item.x,(b.y+h/2-item.y)*1.1))
    const chosen = candidates.find(({x,y}) => {
      const box={left:x-w/2,right:x+w/2,top:y,bottom:y+h}
      return y>=18 && box.bottom<=sceneBottom && !boxes.some(b => box.left<b.right+8&&box.right>b.left-8&&box.top<b.bottom+7&&box.bottom>b.top-7) && !items.some(p => p.visible&&p.x>box.left-6&&p.x<box.right+6&&p.y>box.top-7&&p.y<box.bottom+7)
    })
    if (!chosen) continue
    const box={left:chosen.x-w/2,right:chosen.x+w/2,top:chosen.y,bottom:chosen.y+h}
    boxes.push(box)
    labels.push({id:item.id,x:chosen.x,y:chosen.y+font,font,lineHeight:font*1.08,lines,box,leader:{x:clamp(item.x,box.left+4,box.right-4),y:item.y<box.top?box.top:box.bottom}})
  }
  return labels
}
