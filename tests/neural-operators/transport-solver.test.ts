import {test} from 'node:test';
import assert from 'node:assert/strict';
import {solveTransport} from '../../src/features/neural-operators/labs/lib/transport-solver.ts';
import {probe,error} from '../../src/features/neural-operators/labs/lib/continuous.ts';
const ys=Array.from({length:33},(_,i)=>i/32);
test('reference temperatures converge in space and time across fields and horizons',()=>{
  for(const [seed,time] of [[0,.1],[1,.1],[8,.1],[100,.1],[0,2]]){
    const f=(x:number)=>probe(x,seed);
    const base=solveTransport(f,ys,{time}),fine=solveTransport(f,ys,{time,n:1024}),tight=solveTransport(f,ys,{time,atol:1e-12,rtol:1e-10});
    assert(error(base.values,fine.values)<1.1e-6);
    assert(error(base.values,tight.values)<1e-8);
    assert(base.accepted>1);
  }
});
test('solver conserves quadrature mean, dissipates variance and preserves equilibrium',()=>{
  const n=128,initial=Array.from({length:n},(_,i)=>probe((i+.5)/n));
  const result=solveTransport(x=>probe(x),ys,{n,time:1});
  const sum=(a:number[])=>a.reduce((s,v)=>s+v,0);
  assert(Math.abs(sum(initial)-sum(result.grid))/n<1e-12);
  assert(sum(result.grid.map(v=>v*v))<sum(initial.map(v=>v*v)));
  assert(Math.min(...result.grid)>=Math.min(...initial)-1e-10);
  assert(Math.max(...result.grid)<=Math.max(...initial)+1e-10);
  assert(solveTransport(()=>1.2,ys,{n,time:2}).values.every(v=>v===1.2));
});
