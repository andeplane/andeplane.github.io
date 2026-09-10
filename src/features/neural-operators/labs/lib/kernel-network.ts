export type Architecture = 'coordinates' | 'difference' | 'temperature_x' | 'temperatures';
export function layout(mode: Architecture, widths: number[]) {
  let offset = 0, inputs = mode === 'difference' ? 1 : mode === 'temperatures' ? 4 : mode === 'temperature_x' ? 3 : 2;
  return [...widths, 1].map((outputs, index) => {
    const layer = { inputs, outputs, offset, nonlinear: index < widths.length };
    offset += outputs * (inputs + 1); inputs = outputs;
    return layer;
  });
}
export function initialize(mode: Architecture, widths: number[]) {
  const layers = layout(mode, widths), theta: number[] = [];
  layers.forEach((l, depth) => {
    for (let h = 0; h < l.outputs; h++) {
      for (let i = 0; i < l.inputs; i++) {
        if (!l.nonlinear) theta.push(.04 * Math.sin(i * 17 + 3));
        else if (depth === 0) theta.push(mode === 'difference' ? 3 + h % 4 : i === 0 ? 4 * Math.sin(h * 2.3 + 1) : 4 * Math.cos(h * 1.7 + 2));
        else theta.push(Math.sqrt(3 / l.inputs) * Math.sin(17 * h + 7 * i + depth * 3.2));
      }
      theta.push(!l.nonlinear ? 0 : depth === 0 ? mode === 'difference' ? -2.2 + h * .4 : -1 + 2 * Math.sin(h * 3.1) : 0);
    }
  });
  return theta;
}
export function evaluate(theta: number[], x: number, y: number, mode: Architecture, widths: number[], gradient = false, fx = 0, fy = 0) {
  const layers = layout(mode, widths), activations = [mode === 'difference' ? [y-x] : mode === 'temperatures' ? [x,y,fx,fy] : mode === 'temperature_x' ? [x,y,fx] : [x,y]];
  for (const l of layers) {
    const input = activations.at(-1)!;
    activations.push(Array.from({length:l.outputs},(_,j)=> {
      const start=l.offset+j*(l.inputs+1);
      let value=theta[start+l.inputs];
      for(let i=0;i<l.inputs;i++) value+=theta[start+i]*input[i];
      return l.nonlinear ? Math.tanh(value) : value;
    }));
  }
  const derivative = gradient ? Array(theta.length).fill(0) as number[] : [];
  if(gradient) {
    let delta=[1];
    for(let depth=layers.length-1;depth>=0;depth--) {
      const l=layers[depth], back=Array(l.inputs).fill(0) as number[];
      for(let j=0;j<l.outputs;j++) {
        const d=delta[j]*(l.nonlinear ? 1-activations[depth+1][j]**2 : 1), start=l.offset+j*(l.inputs+1);
        derivative[start+l.inputs]=d;
        for(let i=0;i<l.inputs;i++) {derivative[start+i]=d*activations[depth][i];back[i]+=d*theta[start+i];}
      }
      delta=back;
    }
  }
  return { value: activations.at(-1)![0], derivative, activations, layers };
}
