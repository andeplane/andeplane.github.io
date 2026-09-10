# Neural Operators interest

Native React/TypeScript integration of the interactive Neural Operator Lab and its literature atlas. Routes live under `/#/interests/neural-operators/` so direct navigation works on GitHub Pages.

- `NeuralOperators.tsx`: shared navigation and tab routes.
- `Graph.tsx` / `model.ts`: field, paper, author and citation exploration.
- `concepts.tsx` / `Formula.tsx`: explanatory chapters with KaTeX-rendered formulas.
- `Timeline.tsx` / `data/timeline.ts`: high-level milestones and sources.
- `Reading.tsx`: bundled Markdown documents and per-paper notes.
- `Labs.tsx` / `labs/`: migrated numerical experiments, loaded separately; heavy Three.js, TensorFlow/WebGPU and Pyodide functionality remains dynamically loaded.
- `research.css`: scoped interest styling. `labs/labs.css` scopes the original numerical-workbench styles to `.no-labs`, including its Preferences portal.

The numerical implementation is migrated from `personal/neural-operators`. It still uses the deliberately nonlocal temperature simulator; do not describe it as a conventional local heat PDE. Training, prediction horizons, input interpolation, quadrature and CPU/WebGPU behavior are retained. Numerical regression tests live in `tests/neural-operators`:

```sh
node --experimental-strip-types --test tests/neural-operators/*.test.ts
npm run build
```

Research data are a September 2026 snapshot. Citation counts are within this curated collection, not global impact measures. Graph relationships distinguish bibliography citations from editorial classifications and hypotheses. The original PDF collection remains in the research workspace; public pages link to primary sources rather than republishing manuscripts. Graph exports are in `public/interests/neural-operators/`.

Source workspace generators no longer update this interest automatically. Make future UI/content changes in this React feature; update both `data/graph.json` and the portable exports together when editing graph data.
