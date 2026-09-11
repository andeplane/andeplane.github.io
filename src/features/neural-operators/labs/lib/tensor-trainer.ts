import * as tf from '@tensorflow/tfjs';
import { layout } from './kernel-network.ts';
import type { KernelTrainer, trainingPairs } from './continuous.ts';

export async function initializeWebGPU() {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) throw new Error('WebGPU is unavailable in this browser');
  await import('@tensorflow/tfjs-backend-webgpu');
  if (!await tf.setBackend('webgpu')) throw new Error('Could not initialize the WebGPU device');
  await tf.ready();
  const probe=tf.tensor1d([1]);try { await probe.data(); } finally { probe.dispose(); }
}
/** Vectorized full-batch forward/backprop and Adam; CPU arrays are checkpointed after each batch. */
export class TensorTrainer {
  private theta: tf.Variable;
  private m: tf.Variable;
  private v: tf.Variable;
  private inputs: tf.Tensor2D;
  private factors: tf.Tensor2D;
  private targets: tf.Tensor1D;
  private layers: ReturnType<typeof layout>;
  private rows: number;
  private nodes: number;
  private step: number;
  constructor(state:KernelTrainer,pairs:ReturnType<typeof trainingPairs>) {
    this.layers=layout(state.mode,state.widths);this.step=state.step;
    this.nodes=pairs[0].xs.length;this.rows=pairs.length*pairs[0].ys.length;
    if(pairs.some(p=>p.xs.length!==this.nodes||p.ys.length!==pairs[0].ys.length))throw new Error('Tensor batches require equal grid sizes');
    const inputs:number[][]=[],factors:number[][]=[],targets:number[]=[];
    for(const p of pairs)for(let j=0;j<p.ys.length;j++) {
      const row:number[]=[];
      for(let i=0;i<p.xs.length;i++) {
        const x=p.xs[i],y=p.ys[j],fx=p.values[i],fy=p.queryValues[j];
        inputs.push(state.mode==='difference'?[y-x]:state.mode==='coordinates'?[x,y]:state.mode==='temperature_x'?[x,y,fx]:[x,y,fx,fy]);
        row.push(p.ds[i]*(state.aggregation==='direct'?1:fx));
      }
      factors.push(row);targets.push(p.target[j]);
    }
    this.inputs=tf.tensor2d(inputs);this.factors=tf.tensor2d(factors);this.targets=tf.tensor1d(targets);
    this.theta=tf.tidy(()=>tf.variable(tf.tensor1d(state.theta)));
    this.m=tf.tidy(()=>tf.variable(tf.tensor1d(state.m),false));
    this.v=tf.tidy(()=>tf.variable(tf.tensor1d(state.v),false));
  }
  private loss():tf.Scalar {
    let h:tf.Tensor=this.inputs;
    for(const layer of this.layers) {
      const packed=tf.reshape(tf.slice(this.theta,[layer.offset],[layer.outputs*(layer.inputs+1)]),[layer.outputs,layer.inputs+1]);
      const w=tf.slice(packed,[0,0],[layer.outputs,layer.inputs]);
      const b=tf.reshape(tf.slice(packed,[0,layer.inputs],[layer.outputs,1]),[layer.outputs]);
      h=tf.add(tf.matMul(h as tf.Tensor2D,w as tf.Tensor2D,false,true),b);
      if(layer.nonlinear)h=tf.tanh(h);
    }
    const prediction=tf.sum(tf.mul(tf.reshape(h,[this.rows,this.nodes]),this.factors),1);
    return tf.mean(tf.square(tf.sub(prediction,this.targets))) as tf.Scalar;
  }
  async run(count:number) {
    let loss:tf.Scalar|undefined;
    try {
      for(let i=0;i<count;i++) {
        loss?.dispose();
        this.step++;
        loss=tf.tidy(()=> {
          const result=tf.variableGrads(()=>this.loss(),[this.theta]);
          const g=result.grads[this.theta.name];
          this.m.assign(tf.add(tf.mul(this.m,.9),tf.mul(g,.1)));
          this.v.assign(tf.add(tf.mul(this.v,.999),tf.mul(tf.square(g),.001)));
          const mh=tf.div(this.m,1-.9**this.step),vh=tf.div(this.v,1-.999**this.step);
          this.theta.assign(tf.sub(this.theta,tf.div(tf.mul(mh,.02),tf.add(tf.sqrt(vh),1e-8))));
          return result.value;
        });
      }
      const [theta,m,v,lastLoss]=await Promise.all([this.theta.data(),this.m.data(),this.v.data(),loss!.data()]);
      const checkpoint={theta:Array.from(theta),m:Array.from(m),v:Array.from(v),step:this.step,loss:lastLoss[0]};
      if(!checkpoint.theta.every(Number.isFinite)||!Number.isFinite(checkpoint.loss))throw new Error('Non-finite GPU training result');
      return checkpoint;
    } finally {loss?.dispose();}
  }
  dispose(){tf.dispose([this.theta,this.m,this.v,this.inputs,this.factors,this.targets]);}
}
