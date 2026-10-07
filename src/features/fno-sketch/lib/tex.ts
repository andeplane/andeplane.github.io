// Every TeX string the page renders. MathTex runs KaTeX with strict: 'error' and
// throwOnError, so these must be plain ASCII; tests/fno-sketch renders each one.
// \mathrm{i} is the imaginary unit; a plain i is the row index, as in the sketch.

export const TEX = {
  input: 'a(x) : D \\to \\mathbb{R}^{d_a}, \\qquad D \\subset \\mathbb{R}^2, \\quad d = 2',
  inputGrid: 'N = m \\times n = 5 \\times 5 = 25, \\qquad d_a = 4',
  inputVector: 'a(x) = \\begin{pmatrix} c_1 \\\\ c_2 \\\\ c_3 \\\\ c_4 \\end{pmatrix} = \\begin{pmatrix} T(x_1,x_2) \\\\ 0/1 \\\\ x_1 \\\\ x_2 \\end{pmatrix}',
  lift: 'v(x) = P\\,a(x) + b_P, \\qquad P : d_a \\to d_v',
  liftShape: '(5 \\times 5 \\times 4) \\;\\to\\; (5 \\times 5 \\times d_v)',
  liftRow: 'v_1 = P_{11}T + P_{12}\\,m(x) + P_{13}x_1 + P_{14}x_2 + b_1',
  dft: '\\hat v(k_1,k_2,c) = \\sum_{i=0}^{4} \\sum_{j=0}^{4} v(i,j,c)\\, e^{-2\\pi \\mathrm{i}\\,(k_1 i + k_2 j)/5}',
  dftComplex: '\\hat v(k_1,k_2,c) \\in \\mathbb{C} \\quad (\\text{komplekst tall})',
  truncate: '\\mathbb{K} = \\{ (k_1,k_2) : |k_1| \\le K_1,\\ |k_2| \\le K_{2\\max} \\}',
  hermitian: '\\hat v(-k) = \\overline{\\hat v(k)} \\quad \\text{(v is real)}',
  mix: '(R\\hat v)(k_1,k_2,:) = R(k_1,k_2)\\, \\hat v(k_1,k_2,:)',
  mixShape: 'R(k_1,k_2) \\in \\mathbb{C}^{d_v \\times d_v}',
  mixSymmetry: 'R(-k) = \\overline{R(k)}, \\qquad R(0,0) \\in \\mathbb{R}^{d_v \\times d_v}',
  inverse: '(\\mathcal{K}v)(i,j,c) = \\frac{1}{N} \\sum_{(k_1,k_2) \\in \\mathbb{K}} (R\\hat v)(k_1,k_2,c)\\, e^{+2\\pi \\mathrm{i}\\,(k_1 i + k_2 j)/5}',
  local: 'v_{\\text{next}}(x) = \\sigma\\big( W v(x) + b_W + (\\mathcal{K}v)(x) \\big)',
  relu: '\\sigma(z) = \\max(0, z)',
  gelu: '\\sigma(z) \\approx \\tfrac{1}{2} z \\big( 1 + \\tanh\\big( \\sqrt{2/\\pi}\\, (z + 0.044715\\, z^3) \\big) \\big)',
  project: 'u(x) = Q\\, v_{\\text{next}}(x) + b_Q',
  projectShape: 'Q : d_v \\to d_u, \\qquad d_u = 1',
} as const;

export type TexKey = keyof typeof TEX;
