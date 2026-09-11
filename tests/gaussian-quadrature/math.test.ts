import test from 'node:test';
import assert from 'node:assert/strict';
import { gauss, weightedGauss, integrate } from '../../src/features/gaussian-quadrature/math.ts';
const factorial=(k:number):number=>k<2?1:k*factorial(k-1);
const moment=(k:number)=>k%2?0:2/(k+1);
test('all four Gaussian families integrate moments through degree 2n-1',()=>{
 for(let family=0;family<4;family++)for(let n=1;n<=8;n++){
  const nodes=weightedGauss(n,family);assert.ok(nodes.every(p=>p.w>0));
  for(let k=0;k<2*n;k++){
   const expected=family===0?moment(k):family===1?moment(k)-moment(k+1):family===2?factorial(k):k%2?0:Math.sqrt(Math.PI)*factorial(k)/(4**(k/2)*factorial(k/2));
   const value=integrate(nodes,x=>x**k);
   assert.ok(Math.abs(value-expected)<2e-10*Math.max(1,Math.abs(expected)),`family ${family}, n ${n}, degree ${k}: ${value} vs ${expected}`);
  }
 }
});
test('Legendre at degree 2n fails and mapped rule respects interval scale',()=>{
 const nodes=gauss(2);assert.ok(Math.abs(integrate(nodes,x=>x**4)-.4)>.1);
 const mapped=nodes.map(({x,w})=>({x:(x+1)/2,w:w/2}));assert.ok(Math.abs(integrate(mapped,x=>x**3)-.25)<1e-14);
});
