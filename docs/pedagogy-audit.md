# Content and pedagogy audit — 11 September 2026

## Scope and approach

Audited from a separate worktree created from `origin/main` at `4ef1f11`, including the Recorder Lab additions that reached main during the review. Read the local source content throughout, then checked rendered routes and selected interactions. External projects themselves, including Atomify, were excluded; their descriptions and posts on this site were included.

The review asked whether a new reader can identify the problem, understand prerequisite vocabulary before equations, connect symbols to a concrete example, interpret a demo's controls and measurements, and distinguish a model or illustration from a physical guarantee. Corrections retain the personal voice and connect explanations to actual project behavior. Existing strong explanations, including the Gaussian quadrature lesson, were retained.

## Findings and fixes

Each finding has its own issue and pull request. PR reviews record source inspection and relevant validation; these are author-agent reviews, not independent human approvals.

| Topic | Issue | Fix |
| --- | --- | --- |
| Teach intervals before notation and correct the consonance explanation | [#40](https://github.com/andeplane/andeplane.github.io/issues/40) | [PR #50](https://github.com/andeplane/andeplane.github.io/pull/50) |
| Correct ray-intersection guarantees and introduce the graphics vocabulary | [#41](https://github.com/andeplane/andeplane.github.io/issues/41) | [PR #51](https://github.com/andeplane/andeplane.github.io/pull/51) |
| Explain Enigma stepping and decryption without the odometer misconception | [#42](https://github.com/andeplane/andeplane.github.io/issues/42) | [PR #52](https://github.com/andeplane/andeplane.github.io/pull/52) |
| Make Grover's oracle, real amplitudes and rotation coordinates explicit | [#43](https://github.com/andeplane/andeplane.github.io/issues/43) | [PR #53](https://github.com/andeplane/andeplane.github.io/pull/53) |
| Clarify force, torque and energy in molecular dynamics and tidal locking | [#44](https://github.com/andeplane/andeplane.github.io/issues/44) | [PR #54](https://github.com/andeplane/andeplane.github.io/pull/54) |
| Build a beginner bridge into the FEM derivation and correct solver claims | [#45](https://github.com/andeplane/andeplane.github.io/issues/45) | [PR #55](https://github.com/andeplane/andeplane.github.io/pull/55) |
| Teach what the Ising and acoustic measurements actually establish | [#46](https://github.com/andeplane/andeplane.github.io/issues/46) | [PR #56](https://github.com/andeplane/andeplane.github.io/pull/56) |
| Make research reading pages self-contained and repair source access | [#47](https://github.com/andeplane/andeplane.github.io/issues/47) | [PR #57](https://github.com/andeplane/andeplane.github.io/pull/57) |
| Give project introductions concrete concepts and bounded claims | [#48](https://github.com/andeplane/andeplane.github.io/issues/48) | [PR #58](https://github.com/andeplane/andeplane.github.io/pull/58) |
| Keep internal article links inside the hash router and record audit coverage | [#49](https://github.com/andeplane/andeplane.github.io/issues/49) | This PR |
| Keep physics explanation buttons clear of control panels | [#59](https://github.com/andeplane/andeplane.github.io/issues/59) | [PR #60](https://github.com/andeplane/andeplane.github.io/pull/60) |

## Coverage ledger

All listed local content was read. Browser coverage below is separate from source coverage.

### Site pages

Home, About, Projects index, every project detail, Blog index, every post, Interests index, Music, 3D Rendering, and the Neural Operators overview, concepts, labs, reading, timeline and graph. Shared navigation, Markdown rendering, breadcrumbs and empty/not-found states were also inspected.

### Project records (23)

- `ai-data-analytics`
- `atomify`
- `blast-wall`
- `calc-gpt`
- `curling-simulator`
- `enigma`
- `fem-lab`
- `flow-defence`
- `flute-lab`
- `fyrlysar`
- `grover`
- `interval-trainer`
- `ising`
- `lunarlander`
- `particle-defence`
- `raytracing`
- `special-relativity-travel`
- `sunken`
- `teslacode`
- `three-lefts`
- `tidal-locking`
- `tube-sim`
- `webgpu-md`

### Blog posts (19)

- `a-brick-wall-from-the-weak-form-up`
- `a-hole-in-a-tube-is-not-a-leak-coefficient`
- `a-perfect-fifth-you-can-see`
- `ai-data-analytics-no-server-no-api-keys`
- `atomify-molecular-dynamics-for-the-rest-of-us`
- `curling-physics-why-stones-curl`
- `enigma-build-the-machine-to-understand-it`
- `from-a-steady-breath-to-a-measured-note`
- `fyrlysar-the-math-of-pointing-a-phone-at-a-lighthouse`
- `gaussian-quadrature-two-points-a-cubic`
- `grovers-algorithm-is-two-mirrors`
- `hello-world`
- `lunar-explorer-building-a-moon`
- `particle-defence-tower-defence-in-reverse`
- `raytracing-from-sphere-to-quartic-torus`
- `teslacode-coding-from-the-drivers-seat`
- `three-lefts-a-house-whose-loops-do-not-close`
- `tidal-locking-letting-the-moon-lock-itself`
- `webgpu-md-two-million-atoms-in-a-browser-tab`

The Gaussian quadrature post includes its interactive article implementation, not only its Markdown wrapper.

### Neural Operators

All ten concept chapters: functions, integral, linearity, FNO, domains, wavelets, quadrature, training, speed and monitoring.

All eight selectable labs: Fields & samples; Why grids matter; Build an integral; Thermal · learn the kernel; Real architectures; Evaluate a model; Fourier heat case study; Fourier layer example. Supporting theory, introduction, sampling, transport, training-data, Python and representation-ledger copy was included.

All six reading documents: OVERVIEW, READING-ROUTES, BRIDGES, PEOPLE, CATALOG and RESEARCH-LOG. Graph and timeline labels, source metadata and downloadable graph representations were checked for consistency.

All 56 paper notes:

- `acoustic-quadrature-2026`
- `adaptive-cubature-2026`
- `cecm-2023`
- `chen-1995`
- `composition-2026`
- `cs-generative-2017`
- `cs-polynomials-2017`
- `deeponet-2019`
- `deepvivonet-2025`
- `deim-2009`
- `dreamerv3-2023`
- `ecm-2017`
- `eim-2004`
- `em-design-2023`
- `fno-2020`
- `fno-discretization-2024`
- `fourcastnet-2022`
- `fourcastnet3-2025`
- `frame-kernel-2026`
- `gauss-nodes-hale-townsend-2013`
- `gino-2023`
- `gns-2020`
- `graph-kernel-2020`
- `kno-2024`
- `learnable-quadrature-2025`
- `manufacturing-2025`
- `mwt-2021`
- `neural-operator-2021`
- `neuralop-library-2024`
- `nfm-2024`
- `nio-2023`
- `nonlinear-sampling-2024`
- `operator-sampling-2024`
- `optimal-sampling-2024`
- `parametric-complexity-2023`
- `pde-control-2023`
- `pdebench-2022`
- `pno-2024`
- `poseidon-2024`
- `practical-fno-2025`
- `principled-2026`
- `reno-2023`
- `seismic-2021`
- `sfno-2023`
- `sindy-2015`
- `soft-robot-2026`
- `sparse-operators-2012`
- `stable-cs-2005`
- `theory-tour-2026`
- `u-fno-2021`
- `ultrasound-2024`
- `vjepa2-2025`
- `vjepa21-2026`
- `well-2024`
- `wno-2022`
- `world-models-2018`

### Locally hosted demos (10)

| Demo | Content reviewed |
| --- | --- |
| Blast Wall | Introduction, guide, controls, full theory paper |
| Flow Defence | Menu, how-to-play, level and tool instructions |
| Recorder Lab (`flute-lab`) | Main UI, how-it-works explanation, model limits and sources |
| Grover | All twelve essay chapters, simulator controls and closing examples |
| Interval Trainer | Onboarding, tutorial, difficulty explanations and wave illustration |
| Ising | Welcome, controls, measurement labels and full theory paper |
| Sunken | Start/help text, dive log and narrative text |
| Three Lefts | All eight level introductions, menu, notebook/help and narrative text |
| Tidal Locking | Introduction, controls, readouts and full theory paper |
| Tube Acoustics | Introduction, controls, pressure-meter instructions and model explanation in the post |

## Validation and limits

- Full production build passed, including all ten demo builds and the site's TypeScript check. Every fix PR must also pass GitHub CI before merge.
- Root numerical/content suite: 28 passing tests, including two new navigation regressions. Interval Trainer: 53 passing tests. Recorder Lab physics and audio-worklet tests passed.
- Opened all 23 project routes and 19 posts, all ten concept chapters, all eight lab selections, all six research documents and all 56 notes. Checked rendered math, the catalog table, public source/PDF links, graph selection and article navigation. Inspected project/post layouts at desktop and phone widths.
- Smoke-checked the compiled local demos. Exercised Grover's oracle and the Ising/Tidal explanation dialogs; verified the latter at 1280×720 and 390×844, including actual clicks and hit-testing. Checked all twelve Grover chapter headings and theory panels for equation-rendering errors.
- Verified graph exports agree: 333 nodes, 728 edges, no dangling endpoints; JSON, CSV and GraphML use matching identifiers. The collection contains 56 paper records; the catalog table has 55 rows plus the separate Gaussian quadrature note.
- This was a content and teaching review, not a full playthrough of every game, a new physical calibration, a hardware benchmark reproduction, or a rereading of every external research paper. Source checks for corrected claims used primary documentation/papers; existing note review-depth labels remain explicit.
- No external project repository or deployed project was edited. Numerical model behavior was preserved; functional changes repair site-page links and access to explanation buttons.
