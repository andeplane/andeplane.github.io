import { useState } from 'react';
import katex from 'katex';
import MarkdownRenderer from '@/components/blog/MarkdownRenderer';
import { gauss, midpoint, trapezoid, integrate, weightedGauss, type NodeWeight } from './math';
import './article.css';
const fmt=(v:number)=>Math.abs(v)<1e-13?'0 (roundoff)':Math.abs(v)<.0001?v.toExponential(3):v.toFixed(6);
const M=({children}:{children:string})=><MarkdownRenderer content={children}/>;
const T=({tex}:{tex:string})=><span dangerouslySetInnerHTML={{__html:katex.renderToString(tex,{throwOnError:true,trust:false,output:'htmlAndMathml'})}}/>;
function Plot({f,nodes}:{f:(x:number)=>number;nodes:NodeWeight[]}) {
  const values=Array.from({length:501},(_,i)=>({x:-1+i/250,y:f(-1+i/250)}));
  const min=Math.min(0,...values.map(v=>v.y)), max=Math.max(.1,...values.map(v=>v.y));
  const X=(x:number)=>45+(x+1)*300, Y=(y:number)=>205-(y-min)/(max-min)*165;
  const path=values.map((v,i)=>`${i?'L':'M'}${X(v.x)},${Y(v.y)}`).join(' ');
  return <figure className="gq-plot"><svg viewBox="0 0 690 250" role="img" aria-label={`Integrand on minus one to one, with ${nodes.length} sampling points. Vertical stems mark evaluations; marker sizes represent quadrature weights.`}>
    <path d={`${path} L645,${Y(0)} L45,${Y(0)} Z`} fill="#6ddbc318"/>
    <line x1="45" x2="645" y1={Y(0)} y2={Y(0)} stroke="#69778a"/>
    <path d={path} fill="none" stroke="#6ddbc3" strokeWidth="2.5"/>
    {[-1,0,1].map(x=><text key={x} x={X(x)} y="230" textAnchor="middle">{x}</text>)}
    <foreignObject x="658" y="212" width="30" height="35"><T tex="x"/></foreignObject><foreignObject x="6" y="5" width="70" height="35"><T tex="f(x)"/></foreignObject>
    {nodes.map(({x,w},i)=><g key={i}><line x1={X(x)} x2={X(x)} y1={Y(0)} y2={Y(f(x))} stroke="#f6bc73" strokeDasharray="4 3"/><circle cx={X(x)} cy={Y(f(x))} r={3+Math.sqrt(w)*5} fill="#f6bc73"><title>{`Position ${x.toFixed(6)}, weight ${w.toFixed(6)}, sampled value ${f(x).toFixed(6)}`}</title></circle></g>)}
  </svg><figcaption>Green: integrand and signed area. Orange: sampled values. Larger markers mean larger weights; they are not integration rectangles.</figcaption></figure>;
}
function Discovery() {
  const [a,setA]=useState(.5), [power,setPower]=useState(2);
  const nodes=[{x:-a,w:1},{x:a,w:1}], exact=power%2?0:2/(power+1), estimate=integrate(nodes,x=>x**power);
  return <section className="gq-lab" aria-label="Discover the two-point rule"><p className="gq-kicker">01 / Find the points</p><h3>Two samples. Where would you put them?</h3><p>Keep both weights equal to 1. Move the symmetric points until the estimate for <T tex="x^2"/> matches its integral, <T tex={String.raw`\frac{2}{3}`}/>.</p>
    <div className="gq-controls"><label>Distance from the centre: {a.toFixed(6)}<input type="range" min="0" max="1" step=".001" value={a} onChange={e=>setA(+e.target.value)}/></label><fieldset className="gq-math-options"><legend>Integrand</legend>{[0,1,2,3,4].map(p=><button key={p} aria-label={["Constant","Linear","Quadratic","Cubic","Quartic"][p]} aria-pressed={power===p} onClick={()=>setPower(p)}><T tex={p===0?"1":p===1?"x":`x^{${p}}`}/></button>)}</fieldset></div>
    <button onClick={()=>setA(1/Math.sqrt(3))}>Set the Gauss points</button> <button onClick={()=>{setA(.5);setPower(2);}}>Reset</button>
    <Plot f={x=>x**power} nodes={nodes}/><div className="gq-metrics" aria-live="polite"><span>Exact integral<strong>{fmt(exact)}</strong></span><span>Weighted sum<strong>{fmt(estimate)}</strong></span><span>Absolute error<strong>{fmt(Math.abs(exact-estimate))}</strong></span></div>
    <p><strong>Try next:</strong> set the Gauss points, then choose <T tex="x^3"/> and <T tex="x^4"/>. The cubic works. The fourth power exposes the limit. Odd powers cancel at any symmetric pair, so <T tex="x^2"/> is the decisive test here.</p>
  </section>;
}
function Budget() {
  const [n,setN]=useState(4),[kind,setKind]=useState('exp'),[centre,setCentre]=useState(.3);
  const f=kind==='exp'?Math.exp:kind==='cubic'?(x:number)=>1+x+2*x*x-x*x*x:kind==='corner'?(x:number)=>Math.abs(x-.2):(x:number)=>1/(1+((x-centre)/.035)**2);
  const exact=kind==='exp'?Math.E-1/Math.E:kind==='cubic'?10/3:kind==='corner'?1.04:.035*(Math.atan((1-centre)/.035)-Math.atan((-1-centre)/.035));
  const rules=[{name:'Midpoint',nodes:midpoint(n)},{name:'Trapezoid',nodes:trapezoid(n)},{name:'Gauss–Legendre',nodes:gauss(n)}];
  return <section className="gq-lab" aria-label="Compare quadrature methods"><p className="gq-kicker">02 / Spend the same budget</p><h3>Accuracy per function evaluation</h3><div className="gq-controls"><label>Evaluations per method: {n}<input type="range" min="2" max="16" value={n} onChange={e=>setN(+e.target.value)}/></label><label>Function<select value={kind} onChange={e=>setKind(e.target.value)}><option value="exp">Smooth exponential</option><option value="cubic">Cubic polynomial</option><option value="corner">Absolute-value corner</option><option value="peak">Narrow peak</option></select></label></div>
    {kind==='peak'&&<label>Peak centre: {centre.toFixed(2)}<input type="range" min="-.8" max=".8" step=".01" value={centre} onChange={e=>setCentre(+e.target.value)}/></label>}
    <div className="gq-selected-formula"><T tex={kind==='exp'?"f(x)=e^x":kind==='cubic'?"f(x)=1+x+2x^2-x^3":kind==='corner'?String.raw`f(x)=\lvert x-0.2\rvert`:String.raw`f(x)=\frac{1}{1+((x-c)/0.035)^2}`}/></div><Plot f={f} nodes={rules[2].nodes}/><p>The plot shows the Gauss samples. Every method below gets exactly {n} function evaluations. The reference integral is calculated from an analytic antiderivative.</p>
    <div className="gq-table"><table><thead><tr><th>Method</th><th>Estimate</th><th>Absolute error</th></tr></thead><tbody>{rules.map(r=>{const q=integrate(r.nodes,f);return <tr key={r.name}><td>{r.name}</td><td>{fmt(q)}</td><td>{fmt(Math.abs(q-exact))}</td></tr>;})}</tbody></table></div><p>Reference integral: <strong>{fmt(exact)}</strong>.</p>
    {kind==='peak'&&<M>{String.raw`The peak is $f(x)=1/[1+((x-c)/0.035)^2]$, with centre $c$. Move it between nodes. A smooth function can still be difficult when its important features are much narrower than the gaps between samples.`}</M>}
    <details><summary>Inspect the actual Gauss nodes and weights</summary><div className="gq-table"><table><thead><tr><th>Point <T tex="x_i"/></th><th>Weight <T tex="w_i"/></th></tr></thead><tbody>{rules[2].nodes.map(({x,w},i)=><tr key={i}><td>{x.toFixed(9)}</td><td>{w.toFixed(9)}</td></tr>)}</tbody></table></div><p>The weights sum to 2, the length of this interval. They stay the same when you change the function.</p></details>
  </section>;
}
const families=[
 {name:'Legendre',formula:String.raw`\int_{-1}^{1} f(x)\,dx`,text:String.raw`A finite interval with constant weight. This is the rule used in the experiments above. Any finite interval can be mapped here.`},
 {name:'Jacobi',formula:String.raw`\int_{-1}^{1}(1-x)^\alpha(1+x)^\beta f(x)\,dx,\qquad\alpha,\beta>-1`,text:String.raw`A finite interval with known endpoint power factors. Put those factors into the weight; the remaining function $f$ is what the rule approximates by polynomials. Chebyshev of the first kind is the special case $\alpha=\beta=-\frac12$.`},
 {name:'Laguerre',formula:String.raw`\int_0^\infty x^\alpha e^{-x}f(x)\,dx,\qquad\alpha>-1`,text:String.raw`A half-line with an exponential weight. Ordinary Gauss–Laguerre uses $\alpha=0$. The full integrand must be integrable; arbitrary growth in $f$ is not allowed.`},
 {name:'Hermite',formula:String.raw`\int_{-\infty}^{\infty}e^{-x^2}f(x)\,dx`,text:String.raw`The whole real line with a bell-shaped weight. Useful for Gaussian expectations after a change of variables. This uses the physicists’ Hermite convention; another convention uses $e^{-x^2/2}$.`}
];
function Families(){
  const [index,setIndex]=useState(0),[n,setN]=useState(2),[power,setPower]=useState(2);
  const nodes=weightedGauss(n,index), factorial=(k:number):number=>k<2?1:k*factorial(k-1);
  const moment=(k:number):number=>k%2?0:2/(k+1);
  const exact=index===0?moment(power):index===1?moment(power)-moment(power+1):index===2?factorial(power):power%2?0:Math.sqrt(Math.PI)*factorial(power)/(4**(power/2)*factorial(power/2));
  const estimate=integrate(nodes,x=>x**power);
  const formulas=[String.raw`\int_{-1}^{1}x^k\,dx`,String.raw`\int_{-1}^{1}(1-x)x^k\,dx`,String.raw`\int_0^\infty e^{-x}x^k\,dx`,String.raw`\int_{-\infty}^{\infty}e^{-x^2}x^k\,dx`];
  const maxX=Math.max(1,...nodes.map(p=>p.x)),minX=Math.min(-1,...nodes.map(p=>p.x));
  const X=(x:number)=>40+(x-minX)/(maxX-minX)*580,maxW=Math.max(...nodes.map(p=>p.w));
  return <section className="gq-lab" aria-label="Gaussian quadrature families"><p className="gq-kicker">03 / Choose the measure</p><label>Integration family<select value={index} onChange={e=>setIndex(+e.target.value)}>{families.map((f,i)=><option key={f.name} value={i}>Gauss–{f.name}</option>)}</select></label><M>{`$$\n${families[index].formula}\n$$`}</M><M>{families[index].text}</M>
  <h3>Try this family</h3><M>{index===1?String.raw`This worked Jacobi example fixes $\alpha=1$ and $\beta=0$, so the density is $1-x$. Its asymmetry shifts the nodes toward the left.`:index===2?String.raw`Here $\alpha=0$. The nodes lie on the positive half-line; farther nodes carry very small weights.`:index===3?String.raw`Both sides of the real line contribute. The total weight is $\sqrt{\pi}$, not 1: this is an unnormalized Gaussian integral.`:'The nodes lie inside the finite interval and the total weight is its length, 2.'}</M>
  <div className="gq-controls"><label>Number of nodes: {n}<input type="range" min="1" max="8" value={n} onChange={e=>setN(+e.target.value)}/></label><label>Power <T tex="k"/>: {power}<input type="range" min="0" max="16" value={power} onChange={e=>setPower(+e.target.value)}/></label></div>
  <M>{`$$\n${formulas[index]}\n$$`}</M>
  <figure className="gq-plot"><svg viewBox="0 0 660 155" role="img" aria-label={`${families[index].name} nodes and weights. Stem height represents weight.`}><line x1="40" x2="620" y1="110" y2="110" stroke="#69778a"/>{nodes.map(({x,w},i)=><g key={i}><line x1={X(x)} x2={X(x)} y1="110" y2={100-75*w/maxW} stroke="#6ddbc3" strokeWidth="3"/><circle cx={X(x)} cy={100-75*w/maxW} r="5" fill="#f6bc73"><title>{`Node ${x.toFixed(6)}, weight ${w.toFixed(6)}`}</title></circle></g>)}<text x="40" y="140">{minX.toFixed(2)}</text><text x="620" y="140" textAnchor="end">{maxX.toFixed(2)}</text><foreignObject x="630" y="122" width="28" height="30"><T tex="x"/></foreignObject></svg><figcaption>Stem height represents weight, scaled to the largest weight in this rule. The x-axis rescales to fit the nodes; infinite domains continue beyond this display.</figcaption></figure>
  <div className="gq-metrics" aria-live="polite"><span>Exact integral<strong>{fmt(exact)}</strong></span><span>Weighted sum<strong>{fmt(estimate)}</strong></span><span>Absolute error<strong>{fmt(Math.abs(estimate-exact))}</strong></span></div>
  <p><strong>Guaranteed polynomial degree: {2*n-1}.</strong> Choose <T tex={`k=${2*n}`}/> to cross the boundary. Symmetry can still make odd powers exact beyond the guarantee. Large moments may show absolute rounding error even inside the exactness range.</p>
  <details><summary>See each node and weight</summary><div className="gq-table"><table><thead><tr><th>Node</th><th>Weight</th></tr></thead><tbody>{nodes.map((p,i)=><tr key={i}><td>{p.x.toFixed(8)}</td><td>{p.w.toExponential(6)}</td></tr>)}</tbody></table></div></details>
  </section>;
}
export default function GaussianArticle(){return <article className="gq-article">
<M>{String.raw`Suppose evaluating a function is expensive. It might run a simulation, query a material model, or evaluate a learned kernel. You want its integral, but you can afford only two evaluations.

Where should you put them?

The surprising answer is that two carefully placed samples can integrate **every cubic polynomial exactly**. You do not need to know the polynomial’s coefficients. The same two points and the same two weights work for all of them.

This is Gaussian quadrature. We will first discover its smallest interesting rule, then see why it works and where it fails.

## 1. What are we choosing?

An integral adds up a continuum of contributions. A quadrature rule replaces that operation with a finite calculation:

$$
I(f)=\int_a^b f(x)\,dx\approx\sum_{i=1}^{n}w_i f(x_i)=Q_n(f).
$$

Here $f$ is the function we can evaluate, $[a,b]$ is the interval, $x_i$ are the **nodes** (evaluation locations), and $w_i$ are the **weights** (multipliers). The error is $I(f)-Q_n(f)$. Exactness means that error is zero in exact arithmetic.

Midpoint quadrature cuts the interval into equal pieces and uses each piece’s width as its weight. Gauss asks a more ambitious question: what if we choose the points **and** the weights to make the rule exact for as many polynomial terms as possible?

“Gaussian” means named after Carl Friedrich Gauss, whose construction dates to 1814. It does not mean that the points are random or normally distributed. [Hale and Townsend’s historical introduction](https://appliedmaths.sun.ac.za/~nhale/publications/HaleTownsend2013a.pdf) places the rule in that history.

## 2. Discover the two-point rule`}</M>
<Discovery/>
<M>{String.raw`On $[-1,1]$, choose symmetric points $-a$ and $a$, with an equal weight $w$:

$$
Q(f)=w f(-a)+w f(a).
$$

Start with the constant function. Its integral is 2, so $2w=2$ and **each weight must be 1**. Symmetry takes care of $x$ and $x^3$: their positive and negative contributions cancel, both in the integral and in the sum.

That leaves $x^2$. Its true integral is $2/3$, while our sum gives $2a^2$. Match them:

$$
2a^2=\frac23\quad\Longrightarrow\quad a=\frac1{\sqrt3}.
$$

We have just derived the rule:

$$
\boxed{\int_{-1}^{1}f(x)\,dx\approx f(-1/\sqrt3)+f(1/\sqrt3).}
$$

Why does checking four functions suffice? Integration and weighted sums are both linear. Every cubic is a combination of $1,x,x^2,x^3$. If we integrate each building block exactly, we integrate any combination exactly.

This does **not** mean two measurements determine a cubic. Many different cubics agree at those two locations. They happen to have the same integral. Recovering the whole function is a harder task than recovering this particular number.

For $x^4$, the rule gives $2/9$, while the true integral is $2/5$. The guarantee has a boundary.

## 3. How can this work for any number of points?

The $n$-point Gauss rule integrates polynomials through degree $2n-1$ exactly. There are $n$ node locations and $n$ weights to choose, suggesting $2n$ moment conditions: match $1,x,\ldots,x^{2n-1}$. That count motivates the construction, but it is not a proof that a good solution exists.

The missing idea is **orthogonality**. For functions, an inner product can be an integral:

$$
\langle u,v\rangle=\int_{-1}^{1}u(x)v(x)\,dx.
$$

Orthogonal means this integral is zero. Positive and negative products cancel. The degree-$n$ Legendre polynomial $P_n$ is orthogonal to every polynomial of lower degree. Its $n$ roots are the Gauss–Legendre nodes.

For our example, $P_2(x)=(3x^2-1)/2$. Its roots are exactly the two locations we discovered. [NIST’s quadrature reference](https://dlmf.nist.gov/3.5#v) gives the general construction.`}</M>
<details className="gq-proof"><summary>Why the roots work: the proof in three steps</summary><M>{String.raw`Take any polynomial $p$ of degree at most $2n-1$.

**Divide it.** Polynomial division gives $p=qP_n+r$, with both $q$ and $r$ of degree at most $n-1$.

**Integrate it.** Orthogonality makes $\int qP_n=0$, so $\int p=\int r$.

**Sample it.** At each root $x_i$, $P_n(x_i)=0$, so $p(x_i)=r(x_i)$. Choose weights that integrate every polynomial of degree at most $n-1$ exactly. Then $Q(p)=Q(r)=\int r=\int p$.

Where do those weights come from? Let $\ell_i$ be the degree-$(n-1)$ interpolation polynomial that is 1 at node i and 0 at the other nodes. Set

$$
w_i=\int_{-1}^{1}\ell_i(x)\,dx.
$$

Every polynomial $r$ of degree at most $n-1$ equals its interpolation $\sum_i r(x_i)\ell_i(x)$, so these weights do the job.

Why stop at $2n-1$? The polynomial $\prod_i(x-x_i)^2$ has degree $2n$. It vanishes at every node, so its quadrature sum is zero, but its integral is positive. No rule based on these $n$ function values can be exact for all degree-$2n$ polynomials.`}</M></details>
<M>{String.raw`## 4. What if the function is not a polynomial?

Exactness on polynomials is useful because many smooth functions can be approximated well by polynomials. If a polynomial $p$ is close to $f$ everywhere on $[-1,1]$, Gauss integrates $p$ exactly and only has to deal with their small difference.

In fact, if $|f-p|\le\varepsilon$ everywhere and $p$ has degree at most $2n-1$, positive Gauss weights summing to 2 give

$$
|I(f)-Q_n(f)|\le |I(f-p)|+|Q_n(f-p)|\le 4\varepsilon.
$$

This explains the practical advantage without claiming that every smooth-looking function is easy. A narrow peak can require a high-degree polynomial to approximate it well over the whole interval.`}</M>
<Budget/>
<M>{String.raw`A corner reduces smoothness. A narrow peak may fall between nodes. Increasing the node count helps eventually for these examples, but the error need not decrease at every increment. A fixed rule does not know what it missed.

For difficult functions, split the interval near known trouble spots or use an adaptive method. Gauss–Kronrod pairs reuse the Gauss nodes in an extended rule and compare estimates to guide subdivision. That difference is an error estimate, not a universal certificate: two rules can both miss the same feature. Periodic smooth functions can also be exceptionally well suited to the trapezoidal rule. Gaussian quadrature is not always the winner.

## 5. Different intervals, different weights

The interval $[-1,1]$ is a convenient reference, not a restriction. To integrate over $[a,b]$, map a reference coordinate $t$ into a physical coordinate $x$:

$$
x=\frac{a+b}{2}+\frac{b-a}{2}t.
$$

Both the nodes and weights change:

$$
\int_a^b f(x)\,dx\approx\frac{b-a}{2}\sum_i w_i f\!\left(\frac{a+b}{2}+\frac{b-a}{2}t_i\right).
$$

For two points on $[0,1]$, the nodes become approximately 0.211325 and 0.788675, each with weight $\frac12$. The weights now sum to 1.

More generally, a known **weight density** $\rho(x)$ can be part of the integral:

$$
I_\rho(f)=\int_a^b \rho(x)f(x)\,dx\approx\sum_i w_i f(x_i).
$$

The continuous density $\rho$ and the discrete weights $w_i$ are different things. The discrete weights already account for the density: do not multiply each sample by $\rho(x_i)$ again. For the classical construction, the measure is positive and has the required finite moments; a rule of order $n$ also needs sufficient support.`}</M>
<Families/>
<M>{String.raw`These are different measures, not separate rules for arbitrary named functions. “Exact for polynomials” always refers to $f$ after removing the stated weight. A non-polynomial $f$ may still be approximated accurately. The classical families and their conventions are tabulated in [NIST DLMF](https://dlmf.nist.gov/3.5#v).

## 6. What this buys us in a neural operator

This article grew out of the [neural-operators interest and learning labs](#/interests/neural-operators). Try the integral lesson there to see quadrature inside a learned map.

Fix one output coordinate $y$. The kernel and input field together form a function of $x$:

$$
h_y(x)=K_\theta(x,y)f(x),\qquad g(y)=\int h_y(x)\,dx.
$$

A quadrature rule is a way to spend evaluations of this integrand. If it is sufficiently smooth and we can evaluate the input at the chosen nodes, good quadrature may reach a target accuracy using fewer kernel evaluations. The polynomial exactness condition concerns the **whole product**, not just the kernel.

But a sensor dataset may already fix the available $x$ locations. We cannot move a sensor value to a Gauss node. Interpolation introduces its own error; it does not provide a new measurement. Likewise, a better quadrature rule cannot correct an inaccurate learned kernel.

In several dimensions, tensor-product rules use $n$ points per coordinate: $n^d$ evaluations in $d$ dimensions. That rapid growth motivates sparse grids, low-rank structure and Monte Carlo approaches. One-dimensional efficiency alone does not solve a high-dimensional problem.

## The useful question to take away

Before adding more samples, ask: **what functions do I need this sum to integrate well?**

If low-degree polynomials approximate them well, Gaussian quadrature has a principled answer. If the important structure is a discontinuity, a narrow feature, noisy measurements or a high-dimensional interaction, the sampling strategy should reflect that structure.

### Sources and further reading

- [NIST Digital Library of Mathematical Functions, §3.5](https://dlmf.nist.gov/3.5): quadrature definitions, Gaussian rules, classical weights, and extensions.
- [Hale & Townsend (2013), Fast and Accurate Computation of Gauss–Legendre and Gauss–Jacobi Quadrature Nodes and Weights](https://appliedmaths.sun.ac.za/~nhale/publications/HaleTownsend2013a.pdf): history and efficient construction when you need many nodes.

The experiments use double-precision arithmetic. “0 (roundoff)” means an absolute value below $10^{-13}$, not a claim of exact floating-point equality. The plots use a dense display grid; those display evaluations are not included in the quadrature budget, which counts only samples used in each estimate.`}</M>
</article>}
