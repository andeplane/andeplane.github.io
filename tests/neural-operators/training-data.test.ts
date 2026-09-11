import {test} from 'node:test';
import assert from 'node:assert/strict';
import {trainingPairs,sampleAt,probe} from '../../src/features/neural-operators/labs/lib/continuous.ts';
test('training dimensions are independent and query temperatures use only measurements',()=>{
  const pairs=trainingPairs(false,'smoothing',.1,{count:3,inputPoints:2,outputPoints:9});
  assert.equal(pairs.length,3);
  for(const p of pairs){
    assert.equal(p.xs.length,2);assert.equal(p.ys.length,9);
    assert.deepEqual(p.queryValues,p.ys.map(y=>sampleAt(p.xs,p.values,y)));
    assert(Math.abs(p.ds.reduce((a,b)=>a+b,0)-1)<1e-12);
  }
  assert(pairs[0].queryValues.some((v,j)=>Math.abs(v-probe(pairs[0].ys[j],1))>.01));
});
test('random training grids are reproducible, independent and have valid quadrature',()=>{
  const settings={count:3,inputPoints:8,outputPoints:11,sampling:'random' as const};
  const pairs=trainingPairs(false,'smoothing',.1,settings);
  assert.deepEqual(pairs,trainingPairs(false,'smoothing',.1,settings));
  assert.notDeepEqual(pairs[0].xs,pairs[1].xs);
  for(const p of pairs){
    assert(p.xs.every((x,i)=>x>0&&x<1&&(i===0||x>p.xs[i-1])));
    assert(p.ds.every(d=>d>0));
    assert(Math.abs(p.ds.reduce((a,b)=>a+b,0)-1)<1e-12);
    assert.deepEqual(p.queryValues,p.ys.map(y=>sampleAt(p.xs,p.values,y)));
  }
});
