/** Method of lines with midpoint spatial quadrature and adaptive RK4 step doubling.
 * Query positions evolve alongside the quadrature nodes; no output interpolation.
 */
export function solveTransport(initial: (x:number)=>number, queries:number[], options: {n?:number;time?:number;atol?:number;rtol?:number} = {}) {
  const { n=512, time=.1, atol=1e-10, rtol=1e-8 }=options;
  const nodes=Array.from({length:n},(_,i)=>(i+.5)/n), locations=[...nodes,...queries], size=locations.length;
  const kernel=locations.map(y=>Float64Array.from(nodes,x=>Math.exp(-(((y-x)/.16)**2))/(.16*Math.sqrt(Math.PI)*n)));
  function rhs(u:Float64Array) {
    const out=new Float64Array(size);
    for(let j=0;j<size;j++) {let sum=0;const row=kernel[j],uj=u[j];for(let i=0;i<n;i++){const d=u[i]-uj;sum+=row[i]*(d+d*d*d);}out[j]=sum;}
    return out;
  }
  function rk4(u:Float64Array,h:number) {
    const k1=rhs(u),tmp=new Float64Array(size);
    for(let i=0;i<size;i++)tmp[i]=u[i]+h*k1[i]/2;
    const k2=rhs(tmp);for(let i=0;i<size;i++)tmp[i]=u[i]+h*k2[i]/2;
    const k3=rhs(tmp);for(let i=0;i<size;i++)tmp[i]=u[i]+h*k3[i];
    const k4=rhs(tmp),out=new Float64Array(size);
    for(let i=0;i<size;i++)out[i]=u[i]+h*(k1[i]+2*k2[i]+2*k3[i]+k4[i])/6;
    return out;
  }
  let u=Float64Array.from(locations,initial),t=0,h=Math.min(.025,time),accepted=0,rejected=0;
  for(let attempts=0;t<time;attempts++) {
    if(attempts>10000||h<1e-12)throw new Error('Transport solver failed to meet tolerance');
    h=Math.min(h,time-t);
    const coarse=rk4(u,h),fine=rk4(rk4(u,h/2),h/2);
    let scaled=0;
    for(let i=0;i<size;i++)scaled=Math.max(scaled,Math.abs(fine[i]-coarse[i])/15/(atol+rtol*Math.max(Math.abs(u[i]),Math.abs(fine[i]))));
    if(!Number.isFinite(scaled))throw new Error('Non-finite transport solver state');
    if(scaled<=1){u=fine;t+=h;accepted++;}else rejected++;
    h*=scaled===0?2:Math.min(2,Math.max(.2,.9*scaled**(-.2)));
  }
  return { values:Array.from(u.slice(n)), grid:Array.from(u.slice(0,n)), accepted, rejected, n, atol, rtol };
}
