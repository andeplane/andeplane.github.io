'use client';
import { useState } from 'react';
import { MathTex } from '@/features/neural-operators/labs/components/math-tex';
import FieldFoundation from './field-foundation';
import FourierLayerExample from './fourier-layer-example';
import FourierCaseStudy from './fourier-case-study';
import { IntegralLab, NeuralKernelLab, RadiusLab } from './continuous-labs';

const chapters = ['Fields & samples', 'Why grids matter', 'Build an integral', 'Learn the kernel', 'Real architectures', 'Read the paper', 'Fourier case study', 'Fourier layer example'];
const titles = ['A field exists before its pixels.', 'The same array operation can mean different physics.', 'Use the samples to approximate a continuous operation.', 'Learn a function that supplies the weights.', 'Extend neural layers to functions.', 'What the paper establishes—and what it does not.', 'Fourier operators, step by step.', 'A learned operator in Fourier space.'];
const tex = String.raw;
export default function Course({ chapter, step, setStep }: { chapter: number; step: number; setStep: (step: number) => void }) {
  const [n, setN] = useState(8);
  return <div className="paper-course">
        {chapters.map((_, i) => i === chapter && <article key={i} className="paper-chapter"><div className="eyebrow">{i >= 6 ? 'OPTIONAL / A CONCRETE SPECTRAL MODEL' : `LESSON ${i + 1} / ${chapters[i].toUpperCase()}`}</div><h2>{titles[i]}</h2>
          {i === 0 && <>
            <p>The paper asks how a neural network can act on <strong>functions</strong> while the computer only receives arrays of samples. The goal is to approximate one function-to-function map consistently across different discretizations. Super-resolution is one application of this idea; producing more pixels by itself is not the definition of a neural operator.</p>
            <FieldFoundation n={n} onNChange={setN} />
            <h3>Two different questions: reconstruct a field, or map it to another field?</h3>
            <div className="paper-two"><div className="paper-callout"><b>Reconstruction</b><MathTex tex={tex`\{(x_i,y_j),F_{ij}\}\longmapsto\widetilde f(x,y)`} /><p>Estimate the same field between measurements. Interpolation chooses one estimate based on assumptions. A finite sample set does not uniquely determine the continuous field: unresolved features can fit between samples.</p></div><div className="paper-callout"><b>Operator learning</b><MathTex tex={tex`\mathcal G:f\longmapsto g,\qquad g=\mathcal G(f)`} /><p>Learn a mapping that works for many input fields. For example, forcing across a fluid domain → its vorticity at a specified later time. One model must handle different forcing functions, not memorize one output field.</p></div></div>
            <p>An <strong>operator</strong> is simply a map whose input and output are functions. A familiar scalar function maps one number to another, such as <MathTex inline tex="z\mapsto az+b" />. An operator consumes a whole field: its value at an output position may depend on input values across the domain. The computer approximates this using finite samples.</p>
            <MathTex tex={tex`\underbrace{\{(\mathbf x_i,F_i)\}_{i=1}^{N}}_{\text{input measurements}}\xrightarrow{\quad\mathcal G_{\theta,N,M}\quad}\underbrace{\{(\mathbf y_j,\widehat G_j)\}_{j=1}^{M}}_{\widehat G_j\,\approx\,(\mathcal G_\theta f)(\mathbf y_j)}`} />
            <p>Bold coordinates represent positions in one, two or three dimensions; in the plate above, each is an (x, y) pair. Input positions and output query positions can differ. Here <MathTex inline tex={tex`\theta`} /> means the finite set of learned model parameters. <MathTex inline tex="N" /> and <MathTex inline tex="M" /> count samples and queries, not parameters.</p>
            <div className="paper-callout"><b>What “the same operator” means</b><p>Hold the input field and trained parameters fixed. As its measurement grid becomes sufficiently fine, the numerical predictions should approach the output of one continuous operator. The limit can still differ from the desired physical solution if the model was poorly approximated or trained.</p></div>
            <p>We will use a simple spatial smoothing map to expose the mechanism. Then we will connect it to dense layers, convolution, attention and Fourier operators, and finally return to the paper’s actual fluid experiment. The separate heat case study introduces physical time explicitly.</p>
            <p className="paper-source">Paper connection: Figure 1, Table 1, equations (1)–(2). A neural field represents one function; a neural operator maps an input function to an output function.</p>
          </>}
          {i === 1 && <RadiusLab />}
          {i === 2 && <IntegralLab />}
          {i === 3 && <NeuralKernelLab />}
          {i === 4 && <Architectures />}
          {i === 5 && <PaperReading />}
          {i === 6 && <FourierCaseStudy lesson={step} setLesson={setStep} />}
          {i === 7 && <FourierLayerExample />}
          
        </article>)}
  </div>;
}
function Architectures() {
  return <>
    <p>The paper’s recipe is: identify the continuous counterpart of a familiar neural layer, then discretize it using coordinates and quadrature. Fourier transforms are one implementation choice within this recipe.</p>
    <h3>1. A dense matrix becomes a kernel function</h3>
    <MathTex tex={tex`g_j=\sum_i W_{ji}f_i+b_j\quad\longrightarrow\quad g(y)=\int_\Omega K_\theta(x,y)f(x)\,dx+b_\theta(y)`} />
    <p>A dense matrix assigns parameters to index pairs. Change the array dimensions and the matrix no longer fits. A kernel network accepts coordinates and returns a number (or a channel-mixing matrix). New coordinates produce new kernel values using the same parameters. The previous lesson implements exactly this mechanism.</p>
    <h3>2. Add field features and nonlinear layers</h3>
    <MathTex tex={tex`v_0(x)=P_\theta(f(x),x),\quad v_{\ell+1}(y)=\sigma\!\left(W_\ell v_\ell(y)+\int_\Omega K_{\theta,\ell}(x,y)v_\ell(x)\,dx+b_\ell\right),\quad g(y)=Q_\theta(v_L(y))`} />
    <p><MathTex inline tex="P" /> lifts each scalar value into a vector of features. The integral mixes information across positions, while <MathTex inline tex="W" /> mixes features locally. A nonlinear activation such as GELU makes the stacked map nonlinear in the input field. <MathTex inline tex="Q" /> projects the final features back to the desired output quantities. These are layers, not physical time steps.</p>
    <p>The local term needs a feature at its query position. A layer on the same grid already has it. A layer producing a different grid must explicitly transfer that feature, or use a query-based integral decoder without that local term. Coordinates alone do not supply unmeasured field values.</p>
    <details open><summary>Minimal PyTorch integral layer with arbitrary output queries</summary><pre><code>{`import torch
from torch import nn

class IntegralLayer(nn.Module):
    def __init__(self, coord_dim, in_channels, out_channels):
        super().__init__()
        self.cin, self.cout = in_channels, out_channels
        self.kernel = nn.Sequential(
            nn.Linear(2 * coord_dim, 32), nn.GELU(),
            nn.Linear(32, in_channels * out_channels))
        self.bias = nn.Parameter(torch.zeros(out_channels))

    def forward(self, v, x, y, cell_volume):
        # Shared coordinates: x [N,d], y [M,d]
        # v [B,N,Cin], cell_volume [N]; physical volume, not counts.
        M, N = y.shape[0], x.shape[0]
        xy = torch.cat((x[None].expand(M, -1, -1),
                        y[:, None].expand(-1, N, -1)), dim=-1)
        K = self.kernel(xy).reshape(M, N, self.cout, self.cin)
        z = torch.einsum('mnoc,bnc,n->bmo', K, v, cell_volume)
        return torch.nn.functional.gelu(z + self.bias)

# Parameter count depends on channels and network width, not N or M.
# This direct layer costs O(M*N); chunking avoids materializing all K.
# It deliberately has no local skip term requiring v at new y points.`}</code></pre><p>This is an explanatory implementation, not copied benchmark code. It uses shared batch coordinates for clarity. Mesh-dependent batches also need per-example coordinates and volumes. It is shown as Python reference code; the live neural-kernel exercise runs TypeScript.</p></details>
    <h3>3. Different architectures choose different continuous operations</h3>
    <div className="paper-table-wrap"><table className="paper-table"><thead><tr><th>Architecture</th><th>Continuous counterpart</th><th>What must survive refinement</th></tr></thead><tbody>
      <tr><td>Dense / kernel network<br />Eq. (9)</td><td>Integral against a coordinate-dependent kernel</td><td>Same kernel parameters; correct cell volumes</td></tr>
      <tr><td>Local convolution / graph<br />Eqs. (12), (15)</td><td>Integral over a physical neighborhood</td><td>Fixed physical radius; kernel evaluated at offsets; quadrature</td></tr>
      <tr><td>Attention<br />Eq. (17)</td><td>Normalized, feature-dependent integral</td><td>Quadrature in both numerator and denominator; query features defined</td></tr>
      <tr><td>Spectral convolution / FNO<br />Eq. (13)</td><td>Translation-invariant integral evaluated through Fourier modes</td><td>Physical domain, mode identities, normalization, boundary treatment</td></tr>
      <tr><td>Encoder–decoder<br />Eq. (19)</td><td>Integrals into a finite latent space, coordinate-based decoding</td><td>Discretization-independent latent definition; awareness of lost fine detail</td></tr>
    </tbody></table></div>
    <h3>Attention: why the normalization matters too</h3>
    <MathTex tex={tex`g(y)=\frac{\sum_i \exp(q(y)^\top k(F_i))\,v(F_i)\,\Delta_i}{\sum_i\exp(q(y)^\top k(F_i))\,\Delta_i}`} />
    <p>Keys and values come from measured features; the query must be supplied, for example by an output coordinate embedding or an existing query feature. Equal cell sizes cancel from the fraction. For nonuniform samples, omitting the volumes overweights densely sampled regions—the same issue as lesson 3.</p>
    <h3>Fourier: a representation of an integral kernel</h3>
    <MathTex tex={tex`\int K(y-x)v(x)\,dx=\mathcal F^{-1}\!\left(\widehat K(k)\widehat v(k)\right)(y)`} />
    <p>For a periodic convolution, the Fourier transform turns the integral into multiplication per frequency. FNO learns channel-mixing matrices <MathTex inline tex="R_\theta(k)" /> on retained modes. The input coefficients are computed anew from each measured field; the learned matrices are reused.</p>
    <MathTex tex={tex`\widehat F_{k_x,k_y}=\frac1{N_xN_y}\sum_{i=0}^{N_x-1}\sum_{j=0}^{N_y-1}F_{ij}\exp\!\left[-2\pi\mathrm i\left(\frac{k_xi}{N_x}+\frac{k_yj}{N_y}\right)\right]`} />
    <p>This is the normalized DFT for uniform periodic samples. It is a finite sum over the pixels, usually computed by FFT. It estimates Fourier-series coefficients, subject to sampling and aliasing. It does not discover information absent from the samples.</p>
    <div className="paper-callout"><b>Yes: Fourier space is also discretized.</b><p>On a fixed domain, increasing the spatial grid count raises the maximum resolvable frequency. It does not make the frequency spacing finer; that spacing is set by the physical domain length. Keeping the same retained modes reuses the same learned parameters. Adding learned modes expands the parameterization and requires parameters for those new modes, usually with additional training. More evaluation pixels alone do neither.</p><p>A fixed mode cutoff leaves a representation limit. Stacked nonlinear FNO layers can create additional feature frequencies, but zero-shot evaluation on a finer grid does not guarantee accurate recovery of unresolved physical structure.</p></div>
    <p className="paper-source">Paper connection: Figure 2 and the architecture correspondences in equations (8)–(19). The Fourier case study provides the pixel-to-DFT arithmetic, training examples, a runnable NumPy exercise and a fuller FNO implementation reference.</p>
  </>;
}
function PaperReading() {
  return <>
    <p><strong>Berner et al., Nature Machine Intelligence 8, 1173–1181 (2026).</strong> The central contribution is a principled recipe for extending neural architectures to function spaces, demonstrated across several architectures. It is not a claim that Fourier truncation reconstructs arbitrary missing detail.</p>
    <h3>Read it in this order</h3>
    <ol className="paper-reading-list"><li><b>Figure 1 and Table 1 — What is the object?</b><p>A function is represented by measurements at coordinates. An operator maps one function to another. Different input and output sampling locations can approximate the same function-space map.</p></li><li><b>Figure 2 and equations (8)–(19) — How do we build it?</b><p>Replace index-based operations with coordinate-aware continuous counterparts. Then discretize those operations. The neural network’s architectural ideas remain useful.</p></li><li><b>Figures 3 and 5 — What can go wrong?</b><p>A fixed index neighborhood changes its physical size. An unweighted sum can change meaning with sample density. Both can make refinement approach the wrong operation.</p></li><li><b>Figure 4 — Does this matter empirically?</b><p>The main experiment maps a forcing function to fluid vorticity at a later fixed time, starting from zero initial vorticity. Models trained at resolution 128 are evaluated at 64, 128, 256, 512 and 1,024. The reported FNO and OFormer results generalize across resolutions more effectively than the compared fixed-grid U-Net and ViT models.</p></li></ol>
    <h3>The physics task in the paper</h3>
    <MathTex tex={tex`\mathcal G_T:\;\text{forcing field}\;f(\mathbf x)\longmapsto\omega(\mathbf x,T),\qquad \omega(\mathbf x,0)=0`} />
    <p>The input is a spatial forcing function; the output is the vorticity after a fixed physical horizon <MathTex inline tex="T" />. This is a different mapping from the heat case study’s initial temperature → future temperature. A finer output grid queries the predicted vorticity more densely. It is not an extra time step, and it does not itself change the horizon.</p>
    <p>Mixed-resolution training helps on seen resolutions but does not by itself guarantee generalization to unseen ones. Interpolation can make an architecture accept different grids; a fixed latent grid can still discard fine-scale information. The paper also notes that a specialized fixed-resolution model can perform better on its preferred grid.</p>
    <h3>Three conditions—not “an FFT makes it an operator”</h3>
    <ol className="paper-reading-list"><li><b>Discretization agnosticism and consistency.</b> Different grids should approximate the same continuous map, with numerical errors that converge appropriately.</li><li><b>Fixed learned parameter count.</b> Sampling more densely should not require a new grid-indexed parameter tensor.</li><li><b>Expressive model families.</b> The paper includes universal approximation of sufficiently regular operators as a principle. This concerns families with sufficient capacity under mathematical assumptions, not exactness of one small trained model.</li></ol>
    <h3>Which error does a finer grid reduce?</h3>
    <MathTex tex={tex`\underbrace{\|\mathcal G_{\theta,N}f-\mathcal Gf\|}_{\text{total prediction error}}\le\underbrace{\|\mathcal G_{\theta,N}f-\mathcal G_\theta f\|}_{\text{discretization error}}+\underbrace{\|\mathcal G_\theta f-\mathcal Gf\|}_{\text{model and training error}}`} />
    <p>This triangle-inequality illustration compares functions in a common output norm after interpreting the discrete prediction on that domain. Refinement addresses the first term under the method’s convergence assumptions. Model capacity, data and optimization affect the second. Neither finite measurements nor finite learned parameters provide a universal guarantee of correct fine detail.</p>
    <div className="paper-callout"><b>For your physics upscaling problem</b><p>First identify the desired map: coarse measurements → a reconstruction of the same field, a material/forcing field → a solution, or a state → its future state. Then specify the domain, coordinates, boundary conditions, measurement process and output queries. Distinguish point samples from pixel averages. Only then choose an architecture and a loss that represent that physical task.</p><p>Evaluate on held-out fields and unseen resolutions. Compare against interpolation for reconstruction, and an appropriate numerical solver for a physics map. Check physical quantities as well as visual sharpness. An attractive fine grid can still contain the wrong field.</p></div>
    <h3>What this app reproduces</h3>
    <p>The quadrature, neighborhood and neural-kernel exercises are small original demonstrations of the paper’s mechanisms. The heat example is a separate, exactly solvable teaching problem. This app does <strong>not</strong> reproduce the paper’s Navier–Stokes training run or its plotted benchmark numbers. We describe those results from the supplied article; we do not present toy results as benchmark evidence.</p>
    <div className="paper-actions"><a className="paper-button" href="https://doi.org/10.1038/s42256-026-01267-z" target="_blank" rel="noreferrer">Paper & supplementary material ↗</a><a className="paper-button" href="https://doi.org/10.5281/zenodo.20335280" target="_blank" rel="noreferrer">Study implementation, reference 22 ↗</a><a className="paper-button" href="https://doi.org/10.5281/zenodo.15687518" target="_blank" rel="noreferrer">Study datasets ↗</a></div>
    <p className="paper-source">Based on the supplied main article, including its methods and figure captions. Links to supplementary material and source code are provided for further study; the external supplement has not been reproduced here.</p>
  </>;
}
