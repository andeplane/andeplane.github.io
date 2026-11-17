import { andersPath } from './model.ts'
import type { Point, StrokeTarget } from './model.ts'
import { scriptGlyphs } from './script-font.ts'

/** Original Hershey centreline glyphs, including their separate pen strokes. */
function glyphStrokes(d:string): Point[][] {
  const strokes:Point[][]=[]
  const tokens=d.match(/[ML]|-?\d+(?:\.\d+)?/g)??[]
  for(let i=0;i<tokens.length;) {
    const token=tokens[i]
    if(token==='M'){strokes.push([]);i++}
    else if(token==='L')i++
    else {const x=Number(tokens[i++]),y=Number(tokens[i++]);strokes[strokes.length-1].push([x,y])}
  }
  return strokes.filter(s=>s.length>1)
}

const ring=(x:number,y:number,r=1.5): Point[]=>Array.from({length:17},(_,i)=>[x+r*Math.cos(i/16*2*Math.PI),y+r*Math.sin(i/16*2*Math.PI)])
const dot=(x:number,y:number): Point[]=>[[x-.4,y],[x,y-.4],[x+.4,y],[x,y+.4],[x-.4,y]]

export function nameTarget(text:string): StrokeTarget {
  const name=text.trim().replace(/\s+/g,' ')
  if(!name)throw new Error('Type a name to fit the pendulums.')
  if([...name].length>40)throw new Error('Try a name with 40 characters or fewer.')
  // Preserve the original, hand-authored demonstration as one connected stroke.
  if(name==='Anders')return {strokes:[andersPath()]}
  const strokes:Point[][]=[]
  let offset=0,previousCenter=0,previousTop=0
  const expansions:Record<string,string>={'Æ':'AE','æ':'ae','Œ':'OE','œ':'oe','ß':'ss','’':"'",'‘':"'",'–':'-','—':'-'}
  const slashed:Record<string,string>={'Ø':'O','ø':'o','Ł':'L','ł':'l','Đ':'D','đ':'d'}
  for(const raw of [...name.normalize('NFD')]) {
    if(/\p{M}/u.test(raw)) {
      const x=previousCenter,y=previousTop-3
      const marks:Record<string,Point[][]>={
        '\u0301':[[[x-2,y+1],[x+2,y-3]]], '\u0300':[[[x-2,y-3],[x+2,y+1]]],
        '\u0302':[[[x-3,y+1],[x,y-2],[x+3,y+1]]], '\u0308':[dot(x-2,y),dot(x+2,y)],
        '\u030a':[ring(x,y)], '\u0303':[[[x-4,y+1],[x-2,y-1],[x,y],[x+2,y+1],[x+4,y-1]]],
        '\u0327':[[[x,23],[x-1,25],[x+1,27],[x-1,28]]], '\u0304':[[[x-3,y],[x+3,y]]],
        '\u0307':[dot(x,y)], '\u030c':[[[x-3,y-2],[x,y+1],[x+3,y-2]]],
      }
      if(!marks[raw])throw new Error('That accent is not in the script font. You can draw it as a custom target.')
      strokes.push(...marks[raw]);continue
    }
    if(raw===' '){offset+=10;continue}
    const letters=expansions[raw]??slashed[raw]??raw
    for(const letter of letters) {
      const glyph=scriptGlyphs[letter]
      if(!glyph)throw new Error(`“${raw}” is not in the Latin script font. Try drawing your name instead.`)
      const local=glyphStrokes(glyph.d)
      const points=local.flat(),xs=points.map(p=>p[0]),ys=points.map(p=>p[1])
      previousCenter=offset+(Math.min(...xs)+Math.max(...xs))/2;previousTop=Math.min(...ys)
      strokes.push(...local.map(stroke=>stroke.map(([x,y])=>[x+offset,y] as Point)))
      if(slashed[raw])strokes.push([[offset+1,23],[offset+glyph.advance-2,previousTop-1]])
      offset+=glyph.advance
    }
  }
  if(!strokes.length)throw new Error('Type a name with at least one visible character.')
  return {strokes}
}

export const letterA: Point[]=[[0,90],[35,10],[70,90],[52,49],[17,49]]
