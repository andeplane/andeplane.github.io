# Neural Operators interest

Native React/TypeScript integration of the interactive Neural Operator Lab and its literature atlas. Routes live under `/#/interests/neural-operators/` so direct navigation works on GitHub Pages.

- `NeuralOperators.tsx`: shared navigation and tab routes.
- `Graph.tsx` / `model.ts`: field, paper, author and citation exploration.
- `concepts.tsx` / `Formula.tsx`: explanatory chapters with KaTeX-rendered formulas.
- `Timeline.tsx` / `data/timeline.ts`: high-level milestones and sources.
- `Reading.tsx`: bundled Markdown documents and per-paper notes.
- `Labs.tsx` / `labs/`: native lesson navigation with shareable `?lesson=thermal` (and other lesson IDs), migrated numerical experiments, loaded separately; heavy Three.js, TensorFlow/WebGPU and Pyodide functionality remains dynamically loaded.
- `research.css`: scoped interest styling. `labs/labs.css` scopes the original numerical-workbench styles to `.no-labs`, including its Preferences portal.

The numerical implementation is migrated from `personal/neural-operators`. It still uses the deliberately nonlocal temperature simulator; do not describe it as a conventional local heat PDE. Training, prediction horizons, input interpolation, quadrature and CPU/WebGPU behavior are retained. Numerical regression tests live in `tests/neural-operators`:

```sh
node --experimental-strip-types --test tests/neural-operators/*.test.ts
npm run build
```

Research data are a September 2026 snapshot. Citation counts are within this curated collection, not global impact measures. Graph relationships distinguish bibliography citations from editorial classifications and hypotheses. The original PDF collection remains in the research workspace; public pages link to primary sources rather than republishing manuscripts. Graph exports are in `public/interests/neural-operators/`.

Source workspace generators no longer update this interest automatically. Make future UI/content changes in this React feature; update both `data/graph.json` and the portable exports together when editing graph data.

## Navigation and UI review

`Labs.tsx` owns the course menu and the only previous/next pager. The six foundations precede two Fourier experiments. Fourier heat steps use `?lesson=fourier-heat&step=waves` (overview, pixels, waves, training, prediction, theory); the experiment retains its model state while moving between those steps. Its components must not add another course pager or site footer. Theory section buttons scroll locally without overwriting the hash-router URL. Below 900px, lessons, concept chapters and reading documents use labeled selectors.

Browser review on 10 September 2026 covered all eight lesson routes, all six Fourier steps, the ten concepts, six reading documents and the graph/timeline sections. Desktop and 390px page-overflow checks passed for the lesson/section routes; concepts also passed at 390px with no KaTeX errors. Checked the shared Next button, browser Back, mobile selectors, Preferences open/close and the Full FNO section jump. This is navigation/layout QA, not a browser-wide GPU or numerical performance validation.

The interest now opens on `Overview.tsx` with separate learning, experimentation and research entry points. The sixth foundation lesson is model evaluation (`lesson=evaluation`, with the former `lesson=paper` URL retained as an alias). Its optional paper case study is supporting material. `labs/app/learning-guide.tsx` supplies prediction/activity/reflection prompts. See `QUALITY.md` for observed checks and the remaining broad quality review.
