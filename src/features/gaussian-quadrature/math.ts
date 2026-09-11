export type NodeWeight = { x: number; w: number };
export function legendre(n: number, x: number): [number, number] {
  let previous = 1, current = x;
  if (n === 0) return [1, 0];
  for (let k = 2; k <= n; k++) { const next = ((2*k-1)*x*current-(k-1)*previous)/k; previous=current; current=next; }
  return [current, n*(x*current-previous)/(x*x-1)];
}
export function gauss(n: number): NodeWeight[] {
  return Array.from({length:n}, (_, i) => {
    let x = Math.cos(Math.PI*(i+.75)/(n+.5));
    for (let k=0;k<30;k++) { const [p,d]=legendre(n,x); const delta=p/d; x-=delta; if(Math.abs(delta)<1e-15) break; }
    const d=legendre(n,x)[1]; return {x,w:2/((1-x*x)*d*d)};
  }).sort((a,b)=>a.x-b.x);
}
export function midpoint(n:number): NodeWeight[] {return Array.from({length:n},(_,i)=>({x:-1+(i+.5)*2/n,w:2/n}));}
export function trapezoid(n:number): NodeWeight[] {return Array.from({length:n},(_,i)=>({x:-1+i*2/(n-1),w:(i===0||i===n-1?1:2)/(n-1)}));}
export function integrate(nodes:NodeWeight[], f:(x:number)=>number) {return nodes.reduce((s,{x,w})=>s+w*f(x),0);}
// Golub–Welsch: nodes are eigenvalues of the Jacobi matrix; weights come
// from the squared first components of its normalized eigenvectors.
export function weightedGauss(n:number, family:number):NodeWeight[] {
  if(family===0)return gauss(n);
  const a=Array.from({length:n},()=>Array<number>(n).fill(0));
  const v:number[][]=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?1:0));
  for(let k=0;k<n;k++){
    a[k][k]=family===1?-1/((2*k+1)*(2*k+3)):family===2?2*k+1:0;
    if(k>0){const off=family===1?2/(2*k+1)*Math.sqrt(k*(k+1)*k*(k+1)/((2*k)*(2*k+2))):family===2?k:Math.sqrt(k/2);a[k][k-1]=a[k-1][k]=off;}
  }
  for(let iteration=0;iteration<100*n*n;iteration++){
    let p=0,q=1,max=0;
    for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)if(Math.abs(a[i][j])>max){p=i;q=j;max=Math.abs(a[i][j]);}
    if(max<1e-14)break;
    const angle=.5*Math.atan2(2*a[p][q],a[q][q]-a[p][p]),c=Math.cos(angle),s=Math.sin(angle);
    const ap=a[p][p],aq=a[q][q],b=a[p][q];
    a[p][p]=c*c*ap-2*s*c*b+s*s*aq;a[q][q]=s*s*ap+2*s*c*b+c*c*aq;a[p][q]=a[q][p]=0;
    for(let k=0;k<n;k++){if(k!==p&&k!==q){const x=a[k][p],y=a[k][q];a[k][p]=a[p][k]=c*x-s*y;a[k][q]=a[q][k]=s*x+c*y;}const x=v[k][p],y=v[k][q];v[k][p]=c*x-s*y;v[k][q]=s*x+c*y;}
  }
  const mass=family===1?2:family===2?1:Math.sqrt(Math.PI);
  return a.map((row,i)=>({x:row[i],w:mass*v[0][i]**2})).sort((x,y)=>x.x-y.x);
}
