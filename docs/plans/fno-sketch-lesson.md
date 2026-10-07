# Plan: "One FNO layer, from a student's sketch" — interactive version of a hand drawing

Source: a hand-drawn notebook page by the user's student, written to work out her own
understanding of one Fourier Neural Operator layer on a 5×5 grid. The interactive version must
keep the drawing's structure and her notation, so it reads as *her* sketch brought to life,
and every number shown must be computed, not illustrative.

**This is a standalone page, not a lesson in the Labs course.** No edits to `Labs.tsx`,
`labs/app/page.tsx`, `labs/app/learning-guide.tsx`, `labs/labs.css` or the neural-operators
README; no lesson pager, no LearningGuide entry; no dependency on `.no-labs` / `.paper-*`
styles or on the course's numerical libraries. Reusing the generic `MathTex` component is fine.

## What the drawing shows (in order — this is the page's spine)

1. **Input function** `a(x): D → R^{d_a}`, `D ⊂ R²`, `d = 2`, grid `N = m × n = 5 × 5 = 25`.
   `d_a = 4` channels per pixel: `c₁ = T(x₁,x₂)` (temperature), `c₂ = 0/1` (a mask /
   boundary indicator), `c₃ = x₁`, `c₄ = x₂` (coordinates appended as channels).
   Drawn as a 5×5×4 box with a per-pixel column vector.
2. **Lift** `P: d_a → d_v`, applied per pixel: `v(x) = P a(x) + b_P`, shape `(5×5×4) → (5×5×d_v)`.
   The drawing writes out channel 1 as `P₁₁T + P₁₂m(x) + P₁₃x₁ + P₁₄x₂ + b₁` etc.
3. **Forward DFT per channel**: `v̂(k₁,k₂,c) = Σ_{i=0}^{4} Σ_{j=0}^{4} v(i,j,c) e^{-2πi(k₁i+k₂j)/5}`
   ("komplekst tall" — each coefficient is a complex number). Drawn: one channel slice, each
   pixel times a phase, summed into one coefficient; "do this for each necessary k₁ and k₂,
   then for each channel".
4. **Truncate** `k → K_max`: the drawing writes "keep `2K₁ × K₂max` modes" (both signs of k₁,
   non-negative k₂ — the rfft half-plane, since v is real). Each kept mode holds a channel
   vector `a + bi`. See "Mode set" below for exactly what the page computes and the margin note
   it shows.
5. **Spectral weights** `R(k₁,k₂) ∈ C^{d_v × d_v}`, one matrix per kept frequency pair. For each
   frequency pair, the channel vector `v̂(k₁,k₂,:)` (orange column in the drawing) is
   multiplied by `R(k₁,k₂)`. This mixes channels, never frequencies.
6. **Zero-pad + inverse DFT**: discarded frequencies set to zero, then
   `(1/N) Σ_{k} (R v̂)(k₁,k₂) e^{+2πi(k₁i+k₂j)/5}` per channel with `N = 25`, back to 5×5×d_v.
7. **Local path + nonlinearity**: `v_next(x) = σ( W v(x) + b_W + (𝒦v)(x) )` — `W` is a per-pixel
   d_v×d_v real linear map (the bottom path in the drawing), `b_W ∈ R^{d_v}`, `σ`
   componentwise (ReLU or GELU) → `v_next`, "next layers".
8. **Project** `Q: d_v → d_u` per pixel → output `u(x) = Q v_next(x) + b_Q` (drawn as
   `d_u ⇐ Q`, final box "A"/u). The page fixes **`d_u = 1`** (one output scalar field) and uses
   a single linear Q. There is exactly **one** Fourier layer between P and Q (her "next layers"
   is shown as a faded arrow, not computed).

## Product shape

A standalone page at **`/interests/neural-operators/fno-sketch`**. Title: "One FNO layer, from
a student's sketch". A short intro crediting that it is built from a student's hand-drawn notes
(do not name her unless the user supplies a name). Header may reuse the generic interest-page
classes from `@/features/neural-operators/research.css` (`no-root`, `no-breadcrumb`,
`no-eyebrow`, `no-page-title`, `no-lead`) the way `src/pages/Rendering.tsx` does — these are
site-level page chrome, not course styles; breadcrumb "Interests / Neural operators / From a
student's sketch". The Neural Operators tab bar is **not** shown (this route does not render
`NeuralOperators.tsx`).

One component with a **stage stepper** (her 8 stages above, kept in local `useState` — not the
URL). The stepper is a row of 8 numbered buttons plus ‹ / › buttons. ←/→ keys are handled
**only by `onKeyDown` on the stepper element itself** (roving focus), never by a `window`
listener — a global listener would hijack the sliders' arrow keys.

Each stage has:

- a **diagram panel**: one small SVG pipeline strip at the top (8 boxes
  `a → P → v → F → R·(trunc) → F⁻¹ → +W, σ → Q → u`, current stage highlighted, boxes
  clickable) plus the stage's own visual below it. Tensors are drawn as **stacked offset 5×5
  sheets** (one sheet per channel, each offset by a few px diagonally) — her `5×5×d` box
  without true isometric projection. Notebook look: faint ruled lines, pencil-grey strokes, and
  her **pink** (selected pixel / its vector) and **orange** (selected mode / its vector)
  highlights.
- a short **explanation** with her formula in KaTeX, in her notation.
- a **live numbers panel** for the current selection.
- where her drawing is imprecise, a **margin note** in the form "in the sketch: … / computed
  here: …" — small, pencil-styled, beside the panel on desktop, inline on mobile. Kind, short,
  no lecturing.

### What each stage shows (keep it to this)

| # | Stage | Visual | Numbers panel |
|---|-------|--------|---------------|
| 1 | Input `a(x)` | 4 channel grids (T, mask, x₁, x₂) | `a(x)` for the pink pixel; T −/+ and mask toggle buttons |
| 2 | Lift `P` | `a` sheets → `v` sheets, selected pixel's column highlighted | written-out sum for each channel `P_{c1}·T + P_{c2}·m + P_{c3}·x₁ + P_{c4}·x₂ + b_c = value`, P matrix |
| 3 | DFT | channel picker + one channel grid (each cell tinted by its phase) + phasor chain | `v̂(k,c)` as `a+bi`, `|v̂|`, phase |
| 4 | Truncate | spectral grid of `|v̂|` (half-plane layout), discarded modes greyed/crossed | count of kept modes; `v̂(k,:)` column for the orange mode; the 2K₁ margin note |
| 5 | `R(k)` mix | `R(k)` heat grid of `|R_{ab}|`, `v̂(k,:)` → `R(k)v̂(k,:)` | the complex numbers of all three |
| 6 | Zero-pad + inverse | `v` vs spectral output `𝒦v`, same colour scale, per chosen channel | `𝒦v(x)` at the pink pixel; max |imag| (shown as ~1e-16) |
| 7 | `W`, bias, `σ` | three small grids: `Wv+b`, `𝒦v`, `σ(sum)` for chosen channel | the d_v-vector sums at the pink pixel |
| 8 | Project `Q` | `v_next` sheets → `u` grid | written-out `Q·v_next + b_Q = u` at pink pixel |

### Interactions (all stages share one computed state)

- **Click a pixel** (i,j) on any spatial grid → pink highlight everywhere. No hover-only
  behaviour (mobile has none). Pixel grids are **CSS grids of `<button>`s** (keyboard and
  screen-reader accessible, numbers can be printed in cells, scale naturally to 390px), not SVG.
- **Click a mode** (k₁,k₂) on the spectral grid → orange highlight. Default selection
  `(1,0)`; default pixel `(2,2)`. Mirrored cells (`k₂ = 0, k₁ < 0`) are rendered dashed and
  selecting one selects its partner `(−k₁,0)` with a note "conjugate of (−k₁,0)".
- **DFT phasor picture** (stage 3): for the selected mode and channel, draw the 25 terms
  `v(i,j,c)·e^{-2πi(k₁i+k₂j)/5}` as arrows **head to tail** in an SVG complex plane, then the
  resultant arrow from the origin = `v̂(k,c)`. Arrow length `|v|`; a negative value points the
  opposite way (phase + π). Pink-highlight the selected pixel's arrow. Point to state: on a
  5-grid each mode has only 5 distinct phases (`k₁i+k₂j mod 5`), so arrows come in 5
  directions; for `k = (0,0)` all are horizontal and the sum is `25 × mean`.
- **Controls** (plain `<input type="range">` with label and value, `<button aria-pressed>`
  toggles, all styled in the page's own CSS):
  - `d_v` slider 2–6, default 4 (6 keeps the R(k) grid and column vectors legible at 390px).
  - `K₁` slider 0–2, `K₂max` slider 0–2, default `K₁ = K₂max = 1`.
  - activation ReLU / GELU.
  - "New random weights" (increments the weight seed) and "Random field" (increments the
    field seed).
  - Input editing: **no painting.** In the stage-1 numbers panel the selected pixel has
    `T −0.25` / `T +0.25` buttons (clamped to [0,1]) and a "mask 0/1" toggle.
  - "Identity check" checkbox (stage 6): forces all 25 modes kept and `R(k) = I`; the panel
    then shows `max |𝒦v − v|` ≈ 1e-16 — the DFT round trip reproduces v exactly.

### Coordinates and conventions (stated on the page)

- Grid points `x₁ = i/5`, `x₂ = j/5`, `i,j = 0..4` on the unit periodic square, so the phase is
  `e^{-2πi(k₁ i + k₂ j)/5}`. Forward DFT **unnormalized**, inverse with **`1/N`, N = 25**
  (= 1/(m·n); her `1/n` is this total count). With this convention `v̂(0,0,c) = 25 × mean of
  channel c`, so spectral numbers are ~25× the pixel values; the page says so in one line.
- N = 5 is odd: frequencies are `k₁, k₂ ∈ {−2,…,2}` (array index = `k mod 5`). There is no
  Nyquist bin, so the only self-conjugate mode is `(0,0)`.
- **Mode set (the one scheme to implement).** Kept set `𝕂 = {(k₁,k₂) : |k₁| ≤ K₁, |k₂| ≤ K₂max}`,
  a box symmetric under `k → −k`. It is *displayed* in the half-plane layout her drawing uses:
  rows `k₁ = −K₁..K₁`, columns `k₂ = 0..K₂max`, i.e. `(2K₁+1) × (K₂max+1)` cells; the K₁ cells
  with `k₂ = 0, k₁ < 0` are conjugate mirrors of `(−k₁,0)`, so the number of independent kept
  modes is `(2K₁+1)(K₂max+1) − K₁`. The modes with `k₂ < 0` are kept too but not drawn (they
  are conjugates of drawn ones); the page says this in one sentence.
- **Margin note on "2K₁".** Stage 4 computes and labels the counts above, and beside her
  `2K₁ × K₂max` shows e.g. "in the sketch: 2K₁ × K₂max / computed here: (2K₁+1) × (K₂max+1) —
  k₁ runs from −K₁ to K₁, including 0. (The 2K₁ often comes from FNO code, which keeps
  k₁ = 0…K₁−1 and −K₁…−1.)" Nothing more.
- **Weights R and Hermitian symmetry (by construction).** Draw a complex `R(k)` for each of
  the 15 half-plane cells `k₁ ∈ −2..2, k₂ ∈ 0..2` — always all 15, independent of K, so moving
  the truncation sliders never changes a surviving mode's R. Then overwrite:
  `R(k₁,0) := conj(R(−k₁,0))` for `k₁ < 0`; `R(0,0) := Re R(0,0)` (imaginary part zeroed);
  and for `k₂ < 0` define `R(k) := conj(R(−k))`. Because `v` is real, `v̂(−k) = conj v̂(k)`, so
  `(Rv̂)(−k) = conj (Rv̂)(k)` and the inverse is real.
- **Inverse (exact recipe).** `𝒦v(i,j,:) = (1/25) Σ_{k ∈ 𝕂} R(k) v̂(k,:) e^{+2πi(k₁i+k₂j)/5}`, a
  direct complex sum over the full symmetric kept set (all signs of k₂). Take the real part;
  the imaginary part is ~1e-16 and is *shown* (stage 6) as a sanity check, never silently
  needed. Verified numerically during review (max |imag| 4e-16, identity round trip 6e-16,
  matches `numpy.fft.fft2` bin-for-bin).
- **Weights**: deterministic from a seed with a small PRNG (mulberry32), drawn in a fixed order
  P, b_P, R (15 cells, row-major in k₁ then k₂, real then imaginary), W, b_W, Q, b_Q. Scales:
  `P, W, Q` entries `U(−1,1)/√d_in`; `R` real and imaginary parts `U(−1,1)/d_v`; biases
  `U(−0.1,0.1)`. Changing `d_v` necessarily redraws everything (shapes change) — acceptable.
- **Input field**: `T(i,j) ∈ [0,1]` from the field seed as a smooth periodic field, e.g.
  `0.5 + 0.25 cos(2π(i/5 + φ₁)) + 0.25 cos(2π(j/5 + φ₂))` with seeded phases, rounded to 2
  decimals. Default mask = outer ring (`i` or `j` ∈ {0,4}) = 1, interior 0. Coordinate channels
  are `i/5`, `j/5`.
- **GELU**: JS has no `erf`; use the tanh form `0.5x(1 + tanh(√(2/π)(x + 0.044715x³)))` and
  label it "GELU (tanh approximation)".
- Display: real numbers 2 decimals; complex as `a ± bi` with 2 decimals.

## Code structure

Self-contained feature folder, in the same spirit as `src/features/gaussian-quadrature/`.

- `src/features/fno-sketch/lib/fno.ts` — pure math, no React, no `@/` alias imports (tests run
  it under `node --experimental-strip-types`; use only relative `./x.ts` imports and erasable
  TS syntax: no `enum`, no namespaces, no parameter properties). Exports:
  `mulberry32(seed)`, `makeField(seed)`, `defaultMask()`, `makeInput(T, mask)` →
  `a[25][4]`, `makeWeights(seed, dv)` → `{P, bP, R, W, bW, Q, bQ}` with `R` covering all 25 k
  with symmetry already applied, `lift(a, P, bP)`, `dft2(v)` → `vhat` indexed by
  `(k₁,k₂) ∈ {−2..2}²`, `phasorTerms(v, c, k)` (the 25 complex terms whose sum is `vhat`),
  `keptModes(K1, K2)`, `spectralPath(vhat, R, kept)` → `{mixed, out, maxImag}`, `gelu`, `relu`,
  and `fnoLayer(input, weights, {K1, K2, activation, identity})` returning every intermediate
  `{a, v, vhat, kept, mixed, spectralOut, maxImag, local, preAct, next, u}` so the UI reads from
  one memoized object. Complex as `{re, im}`. Tensors as flat arrays indexed
  `pixel = i*5 + j`, channel last; keep `i` = row (x₁), `j` = column (x₂) consistently in the UI.
  Include a small diverging colour map `colour(value, maxAbs)` (do not import `color()` from the
  course's `labs/lib/operator`).
- `src/features/fno-sketch/FnoSketch.tsx` — the page (header, stepper, pipeline strip SVG,
  CSS-grid pixel/mode grids, phasor SVG, panels, margin notes). Default export, lazy-loaded.
- `src/features/fno-sketch/fno-sketch.css` — everything scoped under `.fno-sketch`.
- **KaTeX**: import `MathTex` from `@/features/neural-operators/labs/components/math-tex` and
  `katex/dist/katex.min.css`. `MathTex` uses `throwOnError: true, strict: 'error'`, so **all TeX
  strings must be ASCII** (`k_1`, `\mathbb{C}`, `\sum`, `\hat v`, `\text{komplekst tall}`) — a
  Unicode subscript or `ℂ` inside TeX throws and blanks the page. Unicode is fine in JSX text.
- **Styles / theme**: checked `src/index.css` — the site is **dark-only**: tokens on `:root`
  (`--color-background #0a0a0a`, `--color-surface`, `--color-surface-2`, `--color-border`,
  `--color-text`, `--color-text-muted`, `--color-accent`) with no `prefers-color-scheme` or
  light variant. Use those tokens for page chrome. Notebook card: `--color-surface` with faint
  ruled lines (repeating-linear-gradient, ≈ `#1d1d22`) and a thin red-ish margin rule,
  pencil strokes ≈ `#9aa0aa`, pink ≈ `#ff7ab6`, orange ≈ `#ffa24d`, margin notes in muted
  pencil grey italics. Colour SVG text via `.fno-sketch` classes. If the site ever gains a light
  theme, these are the only values to remap — keep them as custom properties on `.fno-sketch`.
  Must fit at 390px: SVGs scale via `viewBox` + `width:100%`, visual/numbers panels side by side
  above ~900px and stacked below, 5×5 grids use `grid-template-columns: repeat(5,
  minmax(0,1fr))`, the stepper wraps, margin notes go inline below ~900px. No horizontal page
  scroll.
- **Route registration (exact edits)**:
  - `src/router/index.tsx`: `const FnoSketch = lazy(() => import('@/features/fno-sketch/FnoSketch'))`
    and a child route `{ path: 'interests/neural-operators/fno-sketch', element: <Suspense
    fallback={<p>Loading…</p>}><FnoSketch /></Suspense> }` placed **before** the
    `interests/neural-operators/:tab?` route. (React Router 7 ranks a static segment above a
    dynamic one regardless of order, so this is belt-and-braces; the browser check confirms the
    page, not the "Start here" tab, renders.) Keep the `path: '…'` single-quoted form —
    `scripts/routes.mjs` `routerPaths()` regex-parses that file.
  - `scripts/routes.mjs`: add `{ path: '/interests/neural-operators/fno-sketch', title: 'One FNO
    layer, from a student\'s sketch', description: '…one sentence…' }` to `STATIC_ROUTES`.
    Required: build-seo emits one static HTML shell per route (GitHub Pages has no rewrites), and
    `tests/seo/routes.test.ts` fails for a static router path without a shell.
  - No inbound link is required; whether to link it from the Neural Operators overview or
    `/interests` is the user's call (ask, do not add one unprompted).
- `package.json`: add `"test:fno-sketch": "node --experimental-strip-types --test tests/fno-sketch/*.test.ts"`.
- `.github/workflows/ci.yml`: add a step "Test FNO sketch numerics" running
  `npm run test:fno-sketch` (next to the Gaussian quadrature step), so the tests actually run
  in CI.

## Tests

`tests/fno-sketch/fno.test.ts`, importing `../../src/features/fno-sketch/lib/fno.ts`:

1. DFT matches the definition: for a random real field, `dft2(v)` at a few k equals a
   hand-written double sum (or a precomputed literal), and `Σ phasorTerms(v,c,k) = vhat(k,c)`.
2. Hermitian symmetry: `vhat(−k) = conj vhat(k)` for real v, and `vhat(0,0)` has zero
   imaginary part.
3. Weight symmetry: `R(−k) = conj R(k)` for all 25 k and `Im R(0,0) = 0`; `makeWeights` is
   deterministic for a seed; a surviving mode's `R` is identical for `K = (1,1)` and `(2,2)`.
4. Round trip: identity mode (all modes, R = I) reproduces v to 1e-12.
5. Realness: for random R and every `(K₁,K₂max) ∈ {0,1,2}²`, `maxImag < 1e-12`.
6. Single mode: `v = cos(2π(1·i + 2·j)/5)` → `vhat` is 12.5 at (1,2) and (−1,−2) and
   < 1e-12 elsewhere.
7. `K₁ = K₂max = 0`: spectral output at every pixel equals `R(0,0) · (channel-mean vector of v)`.
8. Kept-mode count: `keptModes(K1,K2)` has `(2K₁+1)(2K₂+1)` entries and is closed under
   `k → −k`; the half-plane display count is `(2K₁+1)(K₂+1)`.
9. Lift is per-pixel affine: matches a hand-computed `P a + b_P` for one pixel.
10. Translation equivariance of the spectral path *on v* (not on `a`, whose coordinate
    channels break it): `spectralPath(dft2(roll(v, s)))` = `roll(spectralPath(dft2(v)), s)`
    to 1e-12 for a shift `s = (1,2)`.
11. Activations: `relu(−1) = 0`, `gelu(0) = 0`, `gelu(3) ≈ 2.9964`.

## Verification

- `npm --prefix /Users/anderhaf/projects/personal/homepage-fno-sketch run test:fno-sketch`
- `npm --prefix /Users/anderhaf/projects/personal/homepage-fno-sketch run test:seo`
- `/Users/anderhaf/projects/personal/homepage-fno-sketch/node_modules/.bin/tsc -b /Users/anderhaf/projects/personal/homepage-fno-sketch`
- `npm --prefix /Users/anderhaf/projects/personal/homepage-fno-sketch run build`
  (no `cd`; `npx --prefix` does not change cwd, so do not use it for `tsc -b`).
- Browser check at desktop and 390px on `/interests/neural-operators/fno-sketch`, including a
  direct load of the built shell: the sketch page (not the Neural Operators overview) renders;
  all 8 stages render with no KaTeX error and no console error; pixel and mode selection update
  the numbers; each control changes results; identity check shows ~1e-16; margin notes
  readable; no horizontal page overflow. `/interests/neural-operators` and `?lesson=` URLs
  still behave as before, and `git diff --stat` shows no files changed under
  `src/features/neural-operators/`.

## Out of scope

Training. Any integration with the Labs course (lesson entry, pager, learning guide, course
CSS). Free-hand painting of the input, hover-only previews, true isometric 3-D boxes, more than
one Fourier layer, an MLP for Q, URL-persisted stage state, inbound links (ask the user).

## Review notes

Changes made in review, and why:

1. **Standalone page** (user's scope change: these are a student's own notes, not course
   material). Folded the scope-change banner into the body and removed every course-wiring
   instruction (Labs.tsx / page.tsx / learning-guide.tsx / pager / README / labs.css). Route
   `/interests/neural-operators/fno-sketch` as its own lazy route before `:tab?`; it must also
   be in `scripts/routes.mjs` `STATIC_ROUTES`, or the SEO route test fails and direct loads 404
   on GitHub Pages. Added the `test:fno-sketch` script **and** a CI step so the tests run.
2. **Mode set made precise and symmetric.** Her `2K₁ × K₂max` matches the reference-code count
   (k₁ ∈ {−K₁..K₁−1}, k₂ ∈ {0..K₂−1}), which is asymmetric in k₁ and only gives a real output
   because `irfft2` discards the non-Hermitian part. On a 5×5 grid with k ∈ {−2..2} the clean
   choice is the symmetric box |k₁| ≤ K₁, |k₂| ≤ K₂max, shown in her half-plane layout
   `(2K₁+1) × (K₂max+1)` with the k₂ = 0, k₁ < 0 cells marked as mirrors. The page shows the
   computed counts plus a short "in the sketch / computed here" margin note.
3. **One concrete inverse.** Replaced "plus its conjugate mirror … or take the real part" with a
   single recipe: R drawn for all 15 half-plane cells, made symmetric (`R(−k) = conj R(k)`,
   real `R(0,0)`), direct complex inverse over the full kept set, take the real part, display
   the ~1e-16 imaginary residue. Checked numerically against NumPy (imag 4e-16, round trip
   6e-16, translation equivariance 2e-15). R does not depend on K, so the sliders only truncate.
4. **Normalization wording.** `1/N` with N = 25 = m·n (her "1/n" is the total count); noted
   that unnormalized forward coefficients are ~25× pixel values.
5. **Under-specified pieces fixed**: `d_u = 1`, linear Q, a single Fourier layer, explicit bias
   `b_W`, GELU tanh approximation (no `Math.erf`), weight scales and draw order, default field,
   default mask, default selections, `d_v` capped at 6, K sliders allow 0.
6. **Theme checked.** `src/index.css` is dark-only (no light tokens or `prefers-color-scheme`),
   so the notebook look is ruled lines on a dark card using the site tokens; page-specific
   colours (pink, orange, pencil, rules) are custom properties on `.fno-sketch`.
7. **KaTeX crash risk flagged.** `MathTex` is `strict: 'error'` + `throwOnError`; Unicode
   inside TeX would blank the page.
8. **Scope cut** to reduce risk: no paint-dragging (−/+ and mask toggle on the selected pixel),
   no hover, interactive grids are CSS grids of buttons (accessible, mobile-friendly), stacked
   offset sheets instead of true isometric boxes, arrow keys scoped to the stepper, and a
   per-stage table of what to show. Course components `Heatmap`/`Plot`/`Control` are not used
   (canvas without click targets; 1-D; course-styled).
9. **Tests corrected and extended.** Translation equivariance is stated on `v` (coordinate
   channels break it for `a → u`); the K = 0 test says "R(0,0) applied to the channel-mean
   vector"; the single-mode test gives the exact value (12.5 at ±k). Added tests for the DFT
   definition and phasor sum, Hermitian symmetry of v̂, R symmetry and K-independence,
   realness over all (K₁,K₂max), kept-mode counts, and activations. The math module must avoid
   `@/` imports and non-erasable TS so `node --experimental-strip-types` can run it.
10. **Verification commands** made `cd`-free with absolute paths; added `test:seo`, a direct
    load of the new URL, a check that the static route wins over `:tab?`, and a check that no
    course files changed.
11. **Open questions for the user**: whether to name the student on the page, and whether to
    link the page from the Neural Operators overview or `/interests`.
