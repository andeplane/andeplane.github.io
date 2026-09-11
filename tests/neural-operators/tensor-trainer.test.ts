import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as tf from '@tensorflow/tfjs';
import {TensorTrainer} from '../../src/features/neural-operators/labs/lib/tensor-trainer.ts';
import {createTrainer,trainKernel,trainingPairs} from '../../src/features/neural-operators/labs/lib/continuous.ts';
test('vectorized trainer agrees with reference Adam and preserves optimizer state across restarts',async()=>{
  await tf.setBackend('cpu');
  const baseline=tf.memory().numTensors;
  for(const [mode,form] of [['coordinates','weighted'],['temperature_x','direct'],['temperatures','direct']] as const){
    const state=createTrainer(mode,false,3,[3,2],form),pairs=trainingPairs(false,'smoothing',.1,{count:3,inputPoints:7,outputPoints:11,sampling:'random'});
    let tensor=new TensorTrainer(state,pairs);
    for(let i=0;i<3;i++)trainKernel(state,pairs);
    const checkpoint=await tensor.run(3);tensor.dispose();
    assert(Math.max(...state.theta.map((v,i)=>Math.abs(v-checkpoint.theta[i])))<2e-5);
    assert(Math.abs(state.loss-checkpoint.loss)<1e-6);
    const restored={...state,...checkpoint};
    tensor=new TensorTrainer(restored,pairs);
    trainKernel(state,pairs);const resumed=await tensor.run(1);tensor.dispose();
    assert(Math.max(...state.theta.map((v,i)=>Math.abs(v-resumed.theta[i])))<2e-5);
  }
  assert.equal(tf.memory().numTensors,baseline);
});
