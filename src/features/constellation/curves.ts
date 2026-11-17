export interface CurvePoint { x:number; y:number }
// A cubic spline passes through every sample, including the actual life head.
// Shared tangents make joins round instead of exposing the sampling polygon.
export function flowingPath(points:CurvePoint[]) {
  if(!points.length)return ''
  let path=`M${points[0].x},${points[0].y}`
  for(let i=1;i<points.length;i++) {
    const a=points[Math.max(0,i-2)],b=points[i-1],c=points[i],d=points[Math.min(points.length-1,i+1)]
    path+=` C${b.x+(c.x-a.x)/6},${b.y+(c.y-a.y)/6} ${c.x-(d.x-b.x)/6},${c.y-(d.y-b.y)/6} ${c.x},${c.y}`
  }
  return path
}
