import Formula from "./Formula";

export const concepts = [
  {
    id: "functions",
    label: "Functions & samples",
    content: (
      <>
        {" "}
        <div className="eyebrow">Start here</div>
        <h2>Functions, samples and operators</h2>
        <p>
          An input field exists over a domain; the computer receives observations of that field. In
          one dimension, let <Formula inline tex={String.raw`f(x)`} /> be the continuous input and{" "}
          <Formula inline tex={String.raw`F_i=f(x_i)`} /> its measured values at coordinates{" "}
          <Formula inline tex={String.raw`x_i`} />. The desired output is a function{" "}
          <Formula inline tex={String.raw`g(y)`} />, evaluated at query coordinates{" "}
          <Formula inline tex={String.raw`y`} />.
        </p>
        <Formula
          tex={String.raw`\mathcal G_\theta:\mathcal X\to\mathcal Y,\qquad f\mapsto g=\mathcal G_\theta(f)`}
        />
        <p>
          A <strong>neural operator</strong> is a trainable model designed to approximate a mapping
          between function spaces. Here <Formula inline tex={String.raw`\mathcal X,\mathcal Y`} />{" "}
          are the input and output function spaces, and <Formula inline tex={String.raw`\theta`} />{" "}
          denotes all trainable parameters. An example is initial temperature along a rod mapped to
          temperature at a fixed later time.
        </p>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Construction</th>
                <th>What it represents</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Coordinate network</td>
                <td>
                  Coordinates to values of one field; learning a new field may require new
                  parameters.
                </td>
              </tr>
              <tr>
                <td>Ordinary fixed-size network</td>
                <td>
                  A mapping between vectors of specified sizes, such as a vibration window to a
                  fault label.
                </td>
              </tr>
              <tr>
                <td>Neural operator</td>
                <td>
                  A reusable function-to-function mapping, designed with its numerical
                  discretization in mind.
                </td>
              </tr>
              <tr>
                <td>Numerical solver</td>
                <td>
                  Computes a response from specified governing equations, often through many
                  internal steps.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          These are distinctions in modeling, not mutually exclusive software components. A CNN can
          be part of an operator architecture. A dense output array alone does not establish a
          function-space interpretation.
        </p>
        <div className="note">
          Shared parameters across grids and a consistent discretization are key design goals.
          Arbitrary irregular sampling, faster inference and recovery of missing information are not
          automatic guarantees.
        </div>
        <p className="source">
          <a
            target="_blank"
            rel="noopener noreferrer"
            href="https://jmlr.org/papers/v24/21-1524.html"
          >
            Neural operator framework
          </a>{" "}
          ·{" "}
          <a
            target="_blank"
            rel="noopener noreferrer"
            href="https://www.nature.com/articles/s42256-026-01267-z"
          >
            Principled architectures
          </a>
        </p>{" "}
      </>
    ),
  },
  {
    id: "integral",
    label: "Learned integral operators",
    content: (
      <>
        {" "}
        <div className="eyebrow">Your formulation</div>
        <h2>Learn contributions, aggregate, produce an output</h2>
        <p>
          Let <Formula inline tex={String.raw`x`} /> be an input location and{" "}
          <Formula inline tex={String.raw`y`} /> an output query. The learnable function{" "}
          <Formula inline tex={String.raw`K_\theta`} /> produces contributions, and{" "}
          <Formula inline tex={String.raw`A_\theta`} /> combines their integral with local
          information.
        </p>
        <Formula
          tex={String.raw`g(y)=A_\theta\!\left(y,f(y),\int_{\Omega_{\mathrm{in}}}K_\theta\!\left(x,y,f(x),f(y)\right)\,dx\right)`}
        />
        <p>
          This is a broad <strong>learned integral-operator architecture</strong>, rather than the
          definition of every neural operator. Both functions can be neural networks; the integrated
          quantity can be a vector of features. The variable <Formula inline tex={String.raw`x`} />{" "}
          is integrated out and does not remain a free argument of the outer function.
        </p>
        <p>
          The value <Formula inline tex={String.raw`f(y)`} /> can only be used where it is defined
          and available from the supplied representation. With sparse measurements, it may be
          interpolated. It must not be taken from an unobserved true field.
        </p>
        <h3>Different input and output domains</h3>
        <Formula
          tex={String.raw`g(y)=A_\theta\!\left(y,\int_{\Omega_{\mathrm{in}}}K_\theta(x,y,f(x))\,dx\right),\qquad y\in\Omega_{\mathrm{out}}`}
        />
        <p>
          No subtraction of coordinates is required here. The domains can differ, even in
          dimension—for example, boundary measurements mapped to a field inside a volume.
        </p>{" "}
      </>
    ),
  },
  {
    id: "linearity",
    label: "Kernels & nonlinearity",
    content: (
      <>
        {" "}
        <h2>A nonlinear kernel network can define a linear operator</h2>
        <p>
          Distinguish a coordinate-dependent kernel{" "}
          <Formula inline tex={String.raw`B_\theta(x,y)`} /> from an entire integrand{" "}
          <Formula inline tex={String.raw`K_\theta(x,y,f(x),f(y))`} />.
        </p>
        <Formula tex={String.raw`g(y)=\int_\Omega B_\theta(x,y)f(x)\,dx`} />
        <p>
          This expression is linear in the input function, even if a deep nonlinear network computes{" "}
          <Formula inline tex={String.raw`B_\theta`} />. Nonlinearity in coordinates is different
          from nonlinearity in the input field.
        </p>
        <p>
          Nonlinear activations between layers, field-dependent contributions, or a nonlinear outer
          function can make the overall operator nonlinear. Kernels need not be coordinate-taking
          networks: Fourier coefficients, wavelet coefficients and low-rank basis expansions are
          other parameterizations.
        </p>
        <h3>Layers operate on hidden fields</h3>
        <p>
          Let <Formula inline tex={String.raw`v_\ell(y)`} /> be the vector of hidden features at
          location <Formula inline tex={String.raw`y`} /> in layer{" "}
          <Formula inline tex={String.raw`\ell`} />. A common layer is:
        </p>
        <Formula
          tex={String.raw`v_{\ell+1}(y)=\sigma\!\left(W_\ell v_\ell(y)+\int_\Omega B_{\theta,\ell}(x,y)v_\ell(x)\,dx+b_\ell\right)`}
        />
        <p>
          The matrix <Formula inline tex={String.raw`W_\ell`} /> mixes channels locally; the
          integral exchanges information across locations;{" "}
          <Formula inline tex={String.raw`b_\ell`} /> is a bias and{" "}
          <Formula inline tex={String.raw`\sigma`} /> is a nonlinear activation. A complete model
          lifts physical inputs into features, stacks layers, and projects features back to physical
          outputs.
        </p>{" "}
      </>
    ),
  },
  {
    id: "fno",
    label: "FNO: compare formulas",
    content: (
      <>
        {" "}
        <div className="eyebrow">Same operation, three expressions</div>
        <h2>Fourier neural operators</h2>
        <p>
          Use a one-dimensional periodic domain <Formula inline tex={String.raw`[0,1]`} />. In this
          section, <Formula inline tex={String.raw`f,g`} /> denote one layer’s input and output
          feature fields. The integer <Formula inline tex={String.raw`k`} /> indexes frequencies;{" "}
          <Formula inline tex={String.raw`\mathcal M`} /> is a finite, symmetric set of retained
          modes. The learned matrix <Formula inline tex={String.raw`R_\theta(k)`} /> mixes feature
          channels at mode <Formula inline tex={String.raw`k`} />.
        </p>
        <h3>1. Fourier form</h3>
        <Formula
          tex={String.raw`g(y)=\sigma\!\left(W_\theta f(y)+\mathcal F^{-1}\!\left[R_\theta(k)\widehat f(k)\right](y)+b_\theta\right)`}
        />
        <p>
          Transform the input, apply learned spectral weights on retained modes, transform back,
          then add the local branch and apply the activation. Spectral weights outside the retained
          set are zero in this expression.
        </p>
        <h3>2. Full integral form</h3>
        <Formula
          tex={String.raw`g(y)=\sigma\!\left(W_\theta f(y)+\int_0^1\left[\sum_{k\in\mathcal M}R_\theta(k)e^{2\pi i k(y-x)}\right]f(x)\,dx+b_\theta\right)`}
        />
        <p>
          The bracketed sum is the convolution kernel{" "}
          <Formula inline tex={String.raw`\kappa_\theta(y-x)`} />. Its learned parameters are
          spectral coefficients; there is no need to evaluate a coordinate network for every pair.
        </p>
        <h3>3. Match your A / K formulation</h3>
        <Formula
          tex={String.raw`K_\theta(x,y,f(x),f(y))=\underbrace{\sum_{k\in\mathcal M}R_\theta(k)e^{2\pi i k(y-x)}}_{\kappa_\theta(y-x)}\,f(x)`}
        />
        <Formula tex={String.raw`A_\theta(y,u,z)=\sigma(W_\theta u+z+b_\theta)`} />
        <p>
          Here <Formula inline tex={String.raw`u=f(y)`} /> and{" "}
          <Formula inline tex={String.raw`z`} /> is the integrated feature vector. This particular
          integrand does not use <Formula inline tex={String.raw`f(y)`} />; the outer function does
          not explicitly use <Formula inline tex={String.raw`y`} />. Coordinates may separately be
          included as input features.
        </p>
        <details>
          <summary>Derive the integral from the Fourier expression</summary>
          <p>
            With <Formula inline tex={String.raw`i^2=-1`} />, define the Fourier coefficients by:
          </p>
          <Formula tex={String.raw`\widehat f(k)=\int_0^1 f(x)e^{-2\pi i kx}\,dx`} />
          <p>Substitute them into the finite reconstruction:</p>
          <Formula
            tex={String.raw`\sum_{k\in\mathcal M}R_\theta(k)\left[\int_0^1f(x)e^{-2\pi i kx}\,dx\right]e^{2\pi i ky}`}
          />
          <p>Interchange the finite sum and integral, and combine the exponentials:</p>
          <Formula
            tex={String.raw`\int_0^1\left[\sum_{k\in\mathcal M}R_\theta(k)e^{2\pi i k(y-x)}\right]f(x)\,dx`}
          />
          <p>
            Conjugate symmetry of the spectral representation gives a real-valued result for real
            input fields. Actual implementations use discrete transforms of samples, not exact
            continuous coefficients.
          </p>
        </details>
        <p className="source">
          <a target="_blank" rel="noopener noreferrer" href="https://arxiv.org/abs/2010.08895">
            Original FNO paper
          </a>{" "}
          ·{" "}
          <a target="_blank" rel="noopener noreferrer" href="https://arxiv.org/abs/2405.02221">
            FNO discretization error
          </a>
        </p>{" "}
      </>
    ),
  },
  {
    id: "domains",
    label: "Domains & convolution",
    content: (
      <>
        {" "}
        <h2>When does y − x make sense?</h2>
        <p>
          The general kernel <Formula inline tex={String.raw`B(x,y)`} /> takes a pair of
          coordinates. Replacing it with <Formula inline tex={String.raw`\kappa(y-x)`} /> assumes
          compatible coordinates and an interaction depending only on relative displacement.
        </p>
        <p>
          The two domains need not be identical to subtract coordinates, but must lie in a
          compatible coordinate space. Subtracting a spatial coordinate from a time coordinate has
          no natural meaning here.
        </p>
        <p>
          A standard FNO layer works on a shared regular grid and its spectral branch corresponds to
          periodic convolution. Boundary treatments, geometry mappings or encoders/decoders are
          needed for other settings. This convolution structure applies to the spectral branch, not
          necessarily every part of the full model.
        </p>
        <div className="note">
          In initial-to-future temperature prediction, both x and y are spatial coordinates. The
          prediction horizon is a separate physical time interval.
        </div>{" "}
      </>
    ),
  },
  {
    id: "wavelets",
    label: "Wavelets & other architectures",
    content: (
      <>
        {" "}
        <h2>Other ways to represent the mapping</h2>
        <p>
          <strong>Wavelet operators</strong> represent or process fields at multiple scales and
          locations. Unlike a Fourier mode extending over the domain, wavelet functions can be
          localized. Particular WNO architectures differ; they are not all the same Fourier formula
          with a renamed transform.
        </p>
        <p>
          A schematic coefficient-space layer uses a wavelet analysis transform{" "}
          <Formula inline tex={String.raw`\mathcal W`} />, learned coefficient processing{" "}
          <Formula inline tex={String.raw`T_\theta`} />, and a synthesis transform:
        </p>
        <Formula
          tex={String.raw`g=\sigma\!\left(W_\theta f+\mathcal W^{-1}T_\theta(\mathcal Wf)+b_\theta\right)`}
        />
        <p>
          This is an illustrative architecture, not a definition of every WNO. Localized
          representations motivate experiments on transient signals; they do not establish better
          accuracy or lower latency by themselves.
        </p>
        <p>
          <strong>DeepONet</strong> provides a different construction: an input encoder produces
          coefficients <Formula inline tex={String.raw`b_r(f)`} />, while an output-coordinate
          network produces basis values <Formula inline tex={String.raw`t_r(y)`} />.
        </p>
        <Formula tex={String.raw`g(y)=\sum_{r=1}^{p}b_r(f)t_r(y)`} />
        <p>
          The integer <Formula inline tex={String.raw`p`} /> is the number of learned expansion
          terms. The input encoder still receives finite observations, and its sampling flexibility
          depends on its design. No explicit kernel integral is needed to evaluate this expansion.
        </p>
        <p className="source">
          <a target="_blank" rel="noopener noreferrer" href="https://arxiv.org/abs/2205.02191">
            Wavelet neural operator
          </a>{" "}
          ·{" "}
          <a target="_blank" rel="noopener noreferrer" href="https://arxiv.org/abs/2109.13459">
            Multiwavelet operators
          </a>{" "}
          ·{" "}
          <a target="_blank" rel="noopener noreferrer" href="https://arxiv.org/abs/1910.03193">
            DeepONet
          </a>
        </p>{" "}
      </>
    ),
  },
  {
    id: "quadrature",
    label: "Sampling & quadrature",
    content: (
      <>
        {" "}
        <h2>The computer evaluates samples and sums</h2>
        <p>
          For the learned-integrand construction, let <Formula inline tex={String.raw`N`} /> be the
          number of input samples and <Formula inline tex={String.raw`w_i`} /> their integration
          weights:
        </p>
        <Formula
          tex={String.raw`g(y)\approx A_\theta\!\left(y,\widetilde f(y),\sum_{i=1}^N w_i K_\theta(x_i,y,F_i,\widetilde f(y))\right)`}
        />
        <p>
          The interpolated value <Formula inline tex={String.raw`\widetilde f(y)`} /> comes only
          from supplied samples. Omit it when the model does not use a local input value. Ordinary
          quadrature weights represent integration measure, not neural parameters.
        </p>
        <p>
          On a uniform midpoint grid over <Formula inline tex={String.raw`[0,1]`} />, weights are{" "}
          <Formula inline tex={String.raw`w_i=1/N`} />. On irregular grids, appropriate weights
          matter: equal weights at clustered points generally bias the integral toward densely
          sampled regions.
        </p>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Change</th>
                <th>What it changes</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>More input measurements</td>
                <td>Potentially resolves new structure and improves numerical integration.</td>
              </tr>
              <tr>
                <td>More output queries</td>
                <td>
                  Evaluates the learned output more densely; supplies no new input information.
                </td>
              </tr>
              <tr>
                <td>More retained Fourier modes</td>
                <td>
                  Changes spectral representation capacity; differs from increasing grid resolution.
                </td>
              </tr>
              <tr>
                <td>Better quadrature points / weights</td>
                <td>
                  May approximate an integrand family with fewer evaluations, subject to access and
                  accuracy constraints.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Training on different grids can help robustness, but does not remove finite-sample error
          or guarantee transfer to every grid.
        </p>{" "}
      </>
    ),
  },
  {
    id: "training",
    label: "Training & physical time",
    content: (
      <>
        {" "}
        <h2>What is learned, and from which data?</h2>
        <p>
          A training pair contains observations of one input function and its corresponding output
          function. Multiple pairs expose the model to different inputs. Let{" "}
          <Formula inline tex={String.raw`P`} /> be the pair count and{" "}
          <Formula inline tex={String.raw`M`} /> the query count per pair; an illustrative sampled
          loss is:
        </p>
        <Formula
          tex={String.raw`L(\theta)=\frac{1}{PM}\sum_{p=1}^{P}\sum_{j=1}^{M}\left\|\mathcal G_\theta(f_p)(y_{pj})-g_p(y_{pj})\right\|^2`}
        />
        <p>
          The model’s evaluation here uses the available samples of each{" "}
          <Formula inline tex={String.raw`f_p`} />. This is a discrete training objective;
          nonuniform query sampling may require weights if the intended objective is a
          physical-domain integral.
        </p>
        <p>
          An optimizer update changes model parameters. A physical prediction horizon specifies how
          far into the future the target lies. A reference solver may take many internal time steps
          to generate that one target. These are three distinct operations.
        </p>
        <div className="note">
          Low training loss does not establish generalization, physically correct dynamics or stable
          repeated rollout. Hold out complete input cases and relevant operating conditions.
        </div>{" "}
      </>
    ),
  },
  {
    id: "speed",
    label: "Speed & compressed sensing",
    content: (
      <>
        {" "}
        <h2>When could an operator be faster?</h2>
        <p>
          A trained operator can replace many numerical-solver steps with a forward pass. That is
          different from beating a small CNN or signal-processing detector; there is no general
          speed advantage over those baselines.
        </p>
        <p>
          A dense pairwise layer with <Formula inline tex={String.raw`N`} /> inputs and{" "}
          <Formula inline tex={String.raw`M`} /> output queries evaluates roughly{" "}
          <Formula inline tex={String.raw`NM`} /> contributions. FFTs can organize regular-grid
          global interactions efficiently; fixed-channel transform cost grows roughly as{" "}
          <Formula inline tex={String.raw`N\log N`} />, but channel mixing, layers and memory
          traffic also contribute.
        </p>
        <p>
          Variable input size is flexibility, not free acceleration. Fewer inputs can save work
          while losing information. More carefully selected integration samples may save work while
          preserving an approximate integral.
        </p>
        <h3>Three different sampling questions</h3>
        <ol>
          <li>Which input functions or experiments should generate training pairs?</li>
          <li>Where should physical sensors acquire measurements?</li>
          <li>Which already available samples should a model use for integration?</li>
        </ol>
        <p>
          Compressed sensing needs a suitable sparse or compressible representation and informative
          measurements. A neural operator, Fourier transform or wavelet transform alone does not
          provide those guarantees. Empirical cubature is a particularly relevant baseline when the
          aim is reducing integral evaluations.
        </p>
        <p className="source">
          <a target="_blank" rel="noopener noreferrer" href="https://arxiv.org/abs/1703.06987">
            Sparse approximation seed
          </a>{" "}
          ·{" "}
          <a target="_blank" rel="noopener noreferrer" href="https://arxiv.org/abs/2308.03877">
            Continuous empirical cubature
          </a>
        </p>{" "}
      </>
    ),
  },
  {
    id: "monitoring",
    label: "Edge monitoring & latency",
    content: (
      <>
        {" "}
        <h2>What does millisecond response mean?</h2>
        <p>
          For vibration monitoring of pumps, motors or machine tools, distinguish three quantities:
        </p>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Quantity</th>
                <th>Meaning</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Compute latency</td>
                <td>Time to process measurements that are already available.</td>
              </tr>
              <tr>
                <td>Update interval</td>
                <td>Time between consecutive output scores.</td>
              </tr>
              <tr>
                <td>Detection delay</td>
                <td>Time from a new physical event to a reliable alarm.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          For illustration, a 256-sample window at 6.4 kHz spans 40 ms. A rolling-window score could
          update every millisecond while still using that longer history. A machine at 3,000 rpm
          takes 20 ms per revolution.
        </p>
        <p>
          A compact operator is a research candidate when predicting signal responses or
          transferring across sampling and operating conditions matters. For a fixed-window fault
          label, a lightweight conventional detector remains an essential baseline. A wavelet
          feature extractor followed by a classifier is not automatically a wavelet neural operator.
        </p>
        <div className="note">
          Measure the full pipeline: acquisition, buffering, filtering, feature computation,
          inference and alarm logic. Test memory, energy and delay on the actual target device. Do
          not infer embedded feasibility from desktop inference timings.
        </div>{" "}
      </>
    ),
  },
];
