'use client';
import { MathTex } from '@/features/neural-operators/labs/components/math-tex';
import { E } from '@/features/neural-operators/labs/lib/equations';
import PythonPlayground from './python-playground';
import DiscretizationLab from './discretization-lab';
const libraryCode = `# Python / PyTorch + neuraloperator; run in a Python environment.
# pip install torch neuraloperator
import torch
from neuralop.models import FNO

model = FNO(n_modes=(12, 12), hidden_channels=32,
            in_channels=1, out_channels=1, n_layers=4)
optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)

# loader yields real input/target PDE pairs, not random labels.
# now, later: [batch, 1, 64, 64], normalized consistently.
for now, later in loader:
    optimizer.zero_grad()
    prediction = model(now)
    loss = (prediction - later).square().mean()
    loss.backward()   # autograd differentiates through FFTs
    optimizer.step()

model.eval()
with torch.no_grad():
    # fine_initial contains actual observations on the fine grid.
    future = model(fine_initial)  # e.g. [batch, 1, 256, 256]
# Loading fine_initial by interpolating coarse inputs is a
# different information budget; it does not create observations.
# This is a training-loop excerpt: supply loader/fine_initial.
`;
const spectralCode = `# Core operation inside one spectral layer (PyTorch).
# v: [batch, input_channels, height, width].
z = torch.fft.rfft2(v, norm="forward")
# z: [batch, input_channels, height, width//2 + 1]

# R_pos/R_neg are LEARNED complex Parameters of shape
# [input_channels, output_channels, mx, my].
# Require 2*mx <= height and my <= width//2 + 1.
y = z.new_zeros(v.shape[0], out_channels, height, width//2+1)
for region, R in [(slice(0,mx), R_pos), (slice(-mx,None), R_neg)]:
    y[:, :, region, :my] = torch.einsum(
        "bixy,ioxy->boxy", z[:, :, region, :my], R)
# Omitted modes in the spectral branch are zero.
spectral = torch.fft.irfft2(y, s=(height,width), norm="forward")
next_v = torch.nn.functional.gelu(spectral + local_1x1(v))
# Production code also handles Hermitian constraints, padding,
# dtype, device, mode indexing and optional channel MLPs.
`;
export default function Theory() {
  return (
    <article className="theory">
      <div className="theory-heading">
        <span className="eyebrow">
          THEORY / FROM OUR 40 WEIGHTS TO A REAL FNO
        </span>
        <h2>One mathematical story, from pixels to a learned operator.</h2>
        <p>
          The live lab is deliberately small: a zero-mean scalar field, periodic
          square domain, and linear heat diffusion. Here is the notation behind
          its calculations, followed by the changes needed for a full neural
          operator.
        </p>
      </div>
      <nav className="theory-nav" aria-label="Theory sections">
        <button onClick={() => document.getElementById("theory-sampling")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Sampling & DFT</button>
        <button onClick={() => document.getElementById("theory-learning")?.scrollIntoView({ behavior: "smooth", block: "start" })}>What is learned?</button>
        <button onClick={() => document.getElementById("theory-fno")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Full FNO</button>
        <button onClick={() => document.getElementById("theory-python")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Run Python</button>
        <button onClick={() => document.getElementById("theory-practice")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Real implementation</button>
      </nav>
      <section id="theory-sampling">
        <span className="eyebrow">
          01 / MEASUREMENTS ARE NOT THE CONTINUOUS FIELD
        </span>
        <h3>Pixels are samples of an unknown function.</h3>
        <div className="math-display">
          <MathTex tex={E.samples} />
        </div>
        <p>
          F is the sampled array you have. f is the underlying continuous field.
          The reconstructed function is written with a tilde to keep it distinct
          from the truth. Infinitely many functions agree on a finite set of
          samples. Reconstruction becomes possible only after assumptions:
          bilinear interpolation chooses piecewise bilinear behavior; our
          Fourier model chooses a periodic, band-limited representation.
        </p>
        <p>
          For a physical domain of width Lₓ, the x-wave is exp(2πikₓx/Lₓ). The
          lab sets both lengths to 1. Standard FFTs assume uniformly spaced
          samples; arbitrary sensor positions need a different transform or an
          operator designed for irregular geometry.
        </p>
        <h4>The discrete Fourier transform reads the pixel values.</h4>
        <div className="math-display">
          <MathTex tex={E.dft} />
        </div>
        <p>
          The upright i in the exponential is the imaginary unit; p and q
          enumerate samples. Each coefficient is a weighted sum of all pixels.
          Using exp(−iθ) = cosθ − i sinθ gives the exact cosine and sine sums
          you inspected in step 2.
        </p>
        <div className="math-display">
          <MathTex tex={E.realBasis} />
        </div>
        <p>
          The real-basis sum keeps one representative from each ±k pair. The
          factor 2 applies to paired, non-Nyquist modes; the mean and
          self-conjugate Nyquist modes require separate handling. The
          walkthrough omits Nyquist modes and adds the sampled mean separately.
          An FFT computes the DFT efficiently; it is not a different learned
          algorithm.
        </p>
        <div className="theory-callout">
          <b>A simple aliasing counterexample</b>
          <p>
            At x = i/4, cos(2π·3x) = cos(2π·x). These columns of the sampled
            basis are identical. The data constrain only their combined
            amplitude. Also sin(2π·2j/4) = 0 for every y sample. No clever
            optimizer can distinguish the missing possibilities without
            additional assumptions or information.
          </p>
        </div>
      </section>
      <section id="theory-learning">
        <p>
          To add physical time, write{' '}
          <MathTex tex={String.raw`u(x,y,t)`} inline /> with{' '}
          <MathTex tex={String.raw`f(x,y)=u(x,y,0)`} inline /> and{' '}
          <MathTex tex={String.raw`F_{ij}(t)=u(x_i,y_j,t)`} inline />. A Fourier
          hat on the continuous u below denotes continuous Fourier coefficients;
          a hat on sampled F denotes the DFT estimate.
        </p>
        <span className="eyebrow">02 / FIXED TRANSFORMS, LEARNED PHYSICS</span>
        <h3>
          The coefficients describe this field. The weights describe its
          evolution.
        </h3>
        <div className="math-display">
          <MathTex tex={E.pipeline} />
        </div>
        <p>
          F and F⁻¹ are fixed transforms. Input coefficients change whenever the
          measured field changes. Parameters θ are learned across many field
          pairs and then reused on a new field.
        </p>
        <div className="theory-callout">
          <b>
            “Rule” here means an explicit computation, not an extra mechanism.
          </b>
          <p>
            For each mode, y = wx: input amplitude x, output amplitude y,
            learned scalar w, with zero additive offset. Collecting the
            amplitudes into a vector gives y = diag(w)x. The same w acts on that
            mode’s sine and cosine pair. The physical field coordinates are a
            different x from the scalar input in this analogy.
          </p>
          <p>
            The trained mapping is G<sub>Δt</sub>: u(t) → u(t+Δt). In this app
            Δt is fixed when training pairs are generated. One inference applies
            this map once. Optimization iterations fit its parameters; they are
            not physical timesteps. A different Δt needs retraining here, unless
            a different model is explicitly trained to take time as an input.
          </p>
        </div>
        <h4>Why one multiplier is enough for heat diffusion</h4>
        <div className="math-display">
          <MathTex tex={E.heat} />
        </div>
        <p>
          Each Fourier wave is an eigenfunction of the Laplacian: applying it
          only scales that wave. Solving the resulting scalar differential
          equation gives the multiplier. That is why the lab can learn a real
          number wₖ for each mode. Our reference instead evaluates the same heat
          solution directly in space: each Gaussian widens to variance σ² + 2νΔt
          and its peak scales by σ²/(σ² + 2νΔt). Periodic copies handle the
          boundary. This creates targets independently of the model’s finite
          Fourier representation. Gradient descent receives only the paired
          sampled fields, not either exact formula.
        </p>
        <div className="math-display">
          <MathTex tex={E.loss} />
        </div>
        <p>
          The star denotes a target coefficient computed from future pixels.
          This is exactly the TypeScript update in the training lesson. Its
          chart averages the coefficient losses over modes; the update treats
          modes independently (equivalent to absorbing a constant factor into
          the learning rate).
        </p>
        <p>
          For advection, the multiplier exp(−2πikct) is complex: it changes
          phase. For nonlinear PDEs, wave interactions are not generally
          captured by independent fixed scalar multipliers. That motivates a
          richer network.
        </p>
      </section>
      <DiscretizationLab />
      <section id="theory-fno">
        <span className="eyebrow">03 / A FULL FOURIER NEURAL OPERATOR</span>
        <h3>
          Lift to channels, mix in Fourier space, then apply nonlinearities.
        </h3>
        <div className="math-display">
          <MathTex tex={E.fno} />
        </div>
        <p>
          P expands input values into a vector of hidden features at every
          point. Rₗ(k) is a learned complex matrix that mixes channels at a
          frequency. Wₗ mixes features locally at the same point; σ is a
          pointwise nonlinear activation. Q converts hidden features back to
          output quantities. This is the core FNO construction; practical
          variants add other blocks.{' '}
          <a
            href="https://arxiv.org/abs/2010.08895"
            target="_blank"
            rel="noreferrer"
          >
            Original FNO paper ↗
          </a>
        </p>
        <div className="architecture-flow">
          <div>
            <b>Input</b>
            <span>B × 1 × H × W</span>
          </div>
          <div>
            <b>Lift P</b>
            <span>B × C × H × W</span>
          </div>
          <div className="learned-block">
            <b>FNO blocks × L</b>
            <span>spectral + local + activation</span>
          </div>
          <div>
            <b>Project Q</b>
            <span>B × output channels × H × W</span>
          </div>
        </div>
        <p>
          Unlike the lab, hidden channels are learned features—not simply
          separate physical variables. Nonlinearities can mix spatial patterns
          and generate frequencies. That adds expressive power, but does not
          guarantee recovery of unobserved physical detail.
        </p>
        <details open>
          <summary>Inside the spectral branch: tensor operations</summary>
          <div className="code-panel detection-code">
            <pre>
              <code>{spectralCode}</code>
            </pre>
          </div>
          <p>
            This is an annotated core excerpt, not a standalone layer class. It
            shows both positive and negative frequencies along the first axis;
            real FFT storage halves only the last axis. Matching forward/inverse
            normalization and explicit output shape matter when working across
            resolutions.{' '}
            <a
              href="https://neuraloperator.github.io/dev/theory_guide/fno.html"
              target="_blank"
              rel="noreferrer"
            >
              Official architecture guide ↗
            </a>{' '}
            ·{' '}
            <a
              href="https://github.com/neuraloperator/neuraloperator/blob/main/neuralop/layers/spectral_convolution.py"
              target="_blank"
              rel="noreferrer"
            >
              Production spectral-layer source ↗
            </a>
          </p>
        </details>
      </section>
      <section id="theory-python">
        <PythonPlayground />
      </section>
      <section id="theory-practice">
        <span className="eyebrow">
          04 / WHAT A REAL TRAINING RUN LOOKS LIKE
        </span>
        <h3>Data generation and validation matter as much as the layer.</h3>
        <ol className="how-list">
          <li>
            <b>Define the operator.</b>
            <span>
              Specify inputs, outputs, domain, boundaries, parameters and time
              horizon. If viscosity or time varies, provide that information to
              the model and include the variation in training.
            </span>
          </li>
          <li>
            <b>Build paired simulation data.</b>
            <span>
              Vary initial conditions or coefficient fields. Split by simulation
              or trajectory, not nearly identical neighboring frames. Fit
              normalization statistics only on training data.
            </span>
          </li>
          <li>
            <b>Optimize a real network.</b>
            <span>
              Use autograd through spectral layers, local layers and
              activations. A field-space MSE or relative L₂ loss compares
              predictions against solver targets; a physics residual is an
              optional extra objective, not inherent to every FNO.
            </span>
          </li>
          <li>
            <b>Validate on the physics and grids you need.</b>
            <span>
              Measure errors, conservation, boundary behavior and rollout
              stability on unseen conditions. Refine the reference solver enough
              that its error does not dominate the comparison.
            </span>
          </li>
        </ol>
        <div className="code-panel detection-code">
          <div className="code-header">
            PyTorch + neuraloperator / training-loop reference (not Pyodide)
          </div>
          <pre>
            <code>{libraryCode}</code>
          </pre>
        </div>
        <p>
          The library handles lifting, spectral layers, local paths, activation
          and projection. Its FNO model accepts grid tensors and exposes mode
          count, channel width, depth and output-shape controls. This reference
          is separate from the runnable NumPy experiment: it needs PyTorch, a
          dataset loader and a suitable Python environment.{' '}
          <a
            href="https://neuraloperator.github.io/dev/modules/generated/neuralop.models.FNO.html"
            target="_blank"
            rel="noreferrer"
          >
            FNO API documentation ↗
          </a>
        </p>
        <div className="theory-callout">
          <b>Two different meanings of “upscaling”</b>
          <p>
            <strong>Resolution transfer:</strong> evaluate the learned mapping
            on a new grid, with a clearly specified input sampling procedure.{' '}
            <strong>Coarse-to-fine reconstruction:</strong> infer fine fields
            from only coarse observations. The latter may be non-unique and can
            require fine targets, physical constraints or uncertainty estimates.
            A smooth output and grid-compatible weights do not establish
            accuracy.
          </p>
        </div>
        <p>
          FFT-based FNOs work naturally on regular grids. Other domains require
          boundary treatment, padding, coordinate mappings or different operator
          architectures. Do not assume adding coordinates or padding
          automatically enforces your physical boundary condition.
        </p>
      </section>
    </article>
  );
}
