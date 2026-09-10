import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialize, evaluate } from '../../src/features/neural-operators/labs/lib/kernel-network.ts';
import { createTrainer, trainingPairs, trainKernel, applyLearned, points, probe } from '../../src/features/neural-operators/labs/lib/continuous.ts';

test('deep four-input backpropagation agrees with finite differences',()=>{
  const widths=[3,2,4],mode='temperatures',theta=initialize(mode,widths);
  const r=evaluate(theta,.2,.7,mode,widths,true,1.1,-.4);
  for(let k=0;k<theta.length;k++){
    const plus=[...theta],minus=[...theta],eps=1e-5;
    plus[k]+=eps;minus[k]-=eps;
    const numerical=(evaluate(plus,.2,.7,mode,widths,false,1.1,-.4).value-evaluate(minus,.2,.7,mode,widths,false,1.1,-.4).value)/(2*eps);
    assert(Math.abs(r.derivative[k]-numerical)<1e-7);
  }
});
test('all depths and input modes support forward and training updates',()=>{
  for(const mode of ['difference','coordinates','temperatures'] as const)for(let depth=1;depth<=5;depth++){
    const widths=Array.from({length:depth},(_,i)=>i%2?12:1),s=createTrainer(mode,false,widths[0],widths);
    trainKernel(s,trainingPairs(false,'nonlinear'));
    assert(Number.isFinite(s.loss));
    assert(s.theta.every(Number.isFinite));
  }
});
test('temperature-aware kernel learns nonlinear transport from paired temperatures',()=>{
  const s=createTrainer('temperatures',false,6,[6,6],'direct'),pairs=trainingPairs(false,'nonlinear');
  trainKernel(s,pairs);const initial=s.loss;
  for(let i=0;i<150;i++)trainKernel(s,pairs);
  assert(s.loss<initial*.5);
  const xs=points(24),ys=points(32);

  const normal=applyLearned(s.theta,s.mode,s.widths,xs,xs.map(x=>probe(x)),ys,'nonlinear');
  assert(normal.every(Number.isFinite));
});

test('direct temperature aggregation has no hidden input multiplier, residual or horizon factor',()=>{
  const s=createTrainer('temperatures',false,2,[2]);
  const theta=s.theta.map(()=>0);theta[theta.length-1]=2;
  for(const value of [0,1.2,-.7])for(const horizon of [.1,2]) {
    const out=applyLearned(theta,s.mode,s.widths,[.1,.4,.9],[value,value,value],[.2,.8],'nonlinear',horizon);
    assert(out.every(v=>Math.abs(v-2)<1e-12));
  }
});

test('four-input kernel supports both explicit aggregation formulas for either target',()=>{
  const s=createTrainer('temperatures',false,2,[2]);const theta=s.theta.map(()=>0);theta[theta.length-1]=2;
  for(const target of ['smoothing','nonlinear'] as const) {
    const direct=applyLearned(theta,s.mode,s.widths,[.25,.75],[3,3],[.4],target,.1,'direct');
    const weighted=applyLearned(theta,s.mode,s.widths,[.25,.75],[3,3],[.4],target,.1,'weighted');
    assert.equal(direct[0],2);assert.equal(weighted[0],6);
  }
});

test('three-input kernel uses T0(x) and ignores T0(y), with correct gradients',()=>{
  const mode='temperature_x',widths=[3,2],theta=initialize(mode,widths);
  const a=evaluate(theta,.2,.7,mode,widths,true,.8,-.3);
  assert.equal(a.value,evaluate(theta,.2,.7,mode,widths,false,.8,4).value);
  assert.notEqual(a.value,evaluate(theta,.2,.7,mode,widths,false,-.8,-.3).value);
  for(let k=0;k<theta.length;k++) {
    const plus=[...theta],minus=[...theta],eps=1e-5;plus[k]+=eps;minus[k]-=eps;
    const numerical=(evaluate(plus,.2,.7,mode,widths,false,.8,-.3).value-evaluate(minus,.2,.7,mode,widths,false,.8,-.3).value)/(2*eps);
    assert(Math.abs(a.derivative[k]-numerical)<1e-7);
  }
});
