# Learning-experience quality review

Objective: a consistent place to learn, play and explore neural operators, organized around the subject rather than one paper.

## Evidence gathered

- Shared navigation and one lesson pager; Fourier steps have URLs and browser Back restores the selected step. Reviewed in browser on 10 September 2026.
- Eight lesson routes, six Fourier steps, ten concepts, six reading documents and main research sections checked for rendering/layout. Phone-width lesson/section checks found no page overflow after fixes. KaTeX checks passed on the ten concepts.
- Starting page now offers foundations, kernel training, a short Fourier experiment, reference and research entry points. Its six links and 390px page width checked in browser.
- Six foundation lessons now culminate in model evaluation. The Berner paper is an optional detailed case study; legacy `lesson=paper` URLs still work, canonical route is `lesson=evaluation`.
- Foundation lessons and the short Fourier layer include a goal, a concrete activity and a revealable conceptual check. Prompts were checked against the implemented controls.
- Kernel browser smoke: automatic backend selected WebGPU; updates advanced and training loss fell to about 2e-5 in the observed run. Pause and another held-out field worked; the latter retained the optimizer update count. This is functional evidence, not a performance benchmark.
- TypeScript and production Vite build passed after the pedagogy changes. Existing numerical regression suite passed for the migration; no numerical implementation changed in this pass.

- Follow-up exploration pass: wavelet search → WNO graph selection → reading note → same graph selection worked. Connections view citation edges changed from 8 to 0 with Citations disabled. Operator-methods timeline filter showed the new wavelet milestones.
- Added primary-abstract-screened WNO (2022) and multiwavelet (2021) records, author/topic/field links, reading notes and timeline entries. JSON, CSV and GraphML IDs/counts were checked together, including all edge endpoints and paper-note coverage. PDFs downloaded to the original research papers folder and verified to be PDF files. No new bibliography citation edges were inferred from abstracts.
- Short Fourier exercise reached 200/200 updates and reset to zero. Kernel Preferences switched to CPU, random grids and the coordinate-only weighted kernel; training advanced, pause worked and Reset weights returned to zero updates. Output-offset wording now matches the implementation.

## Remaining review before calling the broad goal complete

- Exercise remaining training/reset/preferences paths and Fourier controls, including whether step navigation retains the intended experiment state.
- Review the long-form lessons for unnecessary repetition, unexplained notation and claims that exceed the examples; check the new guided activities on more than the default state.
- Finish author/field traversal and additional timeline filters; paper search, note round-trip, Connections citation toggle and the operator-methods filter have now been exercised.
- Recheck responsive layout and keyboard access for any controls changed in those passes.

Preserve the simulator/model distinction and the difference between input measurements and output queries. Do not replace numerical physics as part of an interface cleanup. Keep PR #35 unmerged pending user review.
