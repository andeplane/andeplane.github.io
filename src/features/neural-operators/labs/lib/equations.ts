export const E = {
  samples: String.raw`F_{ij}=f(x_i,y_j),\qquad x_i=\frac{i}{N_x},\quad y_j=\frac{j}{N_y},\quad(x,y)\in[0,1)^2`,
  dft: String.raw`\widehat F_{k_x,k_y}=\frac{1}{N_xN_y}\sum_{p=0}^{N_x-1}\sum_{q=0}^{N_y-1}F_{pq}\exp\!\left[-2\pi\mathrm{i}\left(\frac{k_xp}{N_x}+\frac{k_yq}{N_y}\right)\right]`,
  realBasis: String.raw`\begin{aligned}a_{\mathbf k}&=2\operatorname{Re}(\widehat F_{\mathbf k}),&b_{\mathbf k}&=-2\operatorname{Im}(\widehat F_{\mathbf k})\\[6pt]\widetilde f(\mathbf x)&=\overline F+\sum_{\mathbf k\in\mathcal K}\left[a_{\mathbf k}\cos(2\pi\mathbf k\cdot\mathbf x)+b_{\mathbf k}\sin(2\pi\mathbf k\cdot\mathbf x)\right].\end{aligned}`,
  reconstruction: String.raw`\widetilde f(x,y)=\overline F+\sum_{\mathbf k\in\mathcal K}\left[a_{\mathbf k}\cos\!\bigl(2\pi(k_xx+k_yy)\bigr)+b_{\mathbf k}\sin\!\bigl(2\pi(k_xx+k_yy)\bigr)\right]`,
  pipeline: String.raw`F(t)\;\xrightarrow{\;\mathcal F\;}\;\widehat F(t)\;\xrightarrow{\;R_\theta\;}\;\widehat F(t+\Delta t)\;\xrightarrow{\;\mathcal F^{-1}\;}\;\widetilde F(t+\Delta t)`,
  heatPDE: String.raw`\frac{\partial u}{\partial t}=\nu\nabla^2u`,
  heat: String.raw`\begin{aligned}\frac{\partial u}{\partial t}&=\nu\nabla^2u\\[6pt]\nabla^2e^{2\pi\mathrm i\mathbf k\cdot\mathbf x}&=-4\pi^2\lVert\mathbf k\rVert^2e^{2\pi\mathrm i\mathbf k\cdot\mathbf x}\\[6pt]\frac{\mathrm d\widehat u_{\mathbf k}}{\mathrm dt}&=-4\pi^2\nu\lVert\mathbf k\rVert^2\widehat u_{\mathbf k}\\[6pt]\widehat u_{\mathbf k}(t+\Delta t)&=\underbrace{e^{-4\pi^2\nu\lVert\mathbf k\rVert^2\Delta t}}_{w_{\mathbf k}(\Delta t)}\widehat u_{\mathbf k}(t).\end{aligned}`,
  loss: String.raw`\begin{aligned}\ell_{\mathbf k}&=\frac12\left[(w_{\mathbf k}a_{\mathbf k}-a_{\mathbf k}^{*})^2+(w_{\mathbf k}b_{\mathbf k}-b_{\mathbf k}^{*})^2\right]\\[6pt]\frac{\partial\ell_{\mathbf k}}{\partial w_{\mathbf k}}&=(w_{\mathbf k}a_{\mathbf k}-a_{\mathbf k}^{*})a_{\mathbf k}+(w_{\mathbf k}b_{\mathbf k}-b_{\mathbf k}^{*})b_{\mathbf k}\\[6pt]w_{\mathbf k}&\leftarrow w_{\mathbf k}-\eta\,\operatorname{mean}_{\text{training examples}}\!\left(\frac{\partial\ell_{\mathbf k}}{\partial w_{\mathbf k}}\right).\end{aligned}`,
  fno: String.raw`\begin{aligned}v_0(\mathbf x)&=P\!\left([u(\mathbf x),\mathbf x]\right)\\[6pt]v_{\ell+1}(\mathbf x)&=\sigma\!\left(W_\ell v_\ell(\mathbf x)+\mathcal F^{-1}\!\left[R_\ell(\mathbf k)\,\mathcal F[v_\ell](\mathbf k)\right](\mathbf x)+b_\ell\right)\\[6pt]\widetilde u(\mathbf x)&=Q\!\left(v_L(\mathbf x)\right).\end{aligned}`,
  cosine: String.raw`a_{\mathbf k}=\frac{2}{N^2}\sum_{i=0}^{N-1}\sum_{j=0}^{N-1}F_{ij}\cos\theta_{ij}`,
  sine: String.raw`b_{\mathbf k}=\frac{2}{N^2}\sum_{i=0}^{N-1}\sum_{j=0}^{N-1}F_{ij}\sin\theta_{ij}`,
  gaussian: String.raw`f(\mathbf x)=\sum_{r\in\text{spots}}\sum_{\mathbf m\in\mathbb Z^2}A_r\exp\!\left(-\frac{\lVert\mathbf x-\boldsymbol\mu_r+\mathbf m\rVert^2}{2\sigma_r^2}\right)-\overline u`,
  timestep: String.raw`a_{\mathbf k}(t+\Delta t)=w_{\mathbf k}(\Delta t)\,a_{\mathbf k}(t)`,
  pairedStep: String.raw`\begin{aligned}a_{\mathbf k}(t+\Delta t)&=w_{\mathbf k}(\Delta t)\,a_{\mathbf k}(t)\\b_{\mathbf k}(t+\Delta t)&=w_{\mathbf k}(\Delta t)\,b_{\mathbf k}(t)\end{aligned}`,
  diagonal: String.raw`\mathbf z'=\operatorname{diag}(w_1,w_2,\ldots,w_K)\,\mathbf z\qquad\text{for one fixed }\Delta t`,
  transport: String.raw`\begin{aligned}a\cos\!\bigl(2\pi k(x-ct)\bigr)&=a\cos\phi\cos(2\pi kx)+a\sin\phi\sin(2\pi kx),\\\phi&=2\pi kct.\end{aligned}`,
};
export const phaseTex = (kx: number, ky: number) =>
  String.raw`\theta_{ij}=2\pi\left(\frac{${kx}\,i}{N}+\frac{${ky}\,j}{N}\right)`;
export const amplitudesTex = (a: number, b: number) =>
  String.raw`a_{\mathbf k}=${a.toFixed(4)},\qquad b_{\mathbf k}=${b.toFixed(4)}`;
export const productTex = (a: number, w: number) =>
  String.raw`\underbrace{(${a.toFixed(4)})}_{a_k(0)}\;\times\;\underbrace{${w.toFixed(4)}}_{w_k(\Delta t)}\;=\;\underbrace{(${(a * w).toFixed(4)})}_{\widetilde a_k(\Delta t)}`;
export const shiftTex = (shift: number) =>
  String.raw`u(x,t)=u_0(x-ct),\qquad ct=${shift.toFixed(3)}\;\text{laps}`;

export const contributionTex = (kernel: number, value: number, cellWidth: number) =>
  String.raw`\underbrace{${kernel.toFixed(4)}}_{K(x_i,y)}\;\times\;\underbrace{(${value.toFixed(4)})}_{F_i}\;\times\;\underbrace{${cellWidth.toFixed(4)}}_{\Delta_i}\;\approx\;${(kernel * value * cellWidth).toFixed(5)}`;
