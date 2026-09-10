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

## Completion audit — 10 September 2026

| Requirement | Evidence |
|---|---|
| One consistent application and navigation hierarchy | Shared homepage shell; one course pager; lesson/step URLs; desktop and phone-width route checks described above. Duplicate inner footer removed and in-page theory jumps verified. |
| Learn without a required paper syllabus | Start page offers learning/play/research entry points. Foundations teach samples, grids, integrals, learned kernels, architectures and evaluation. Paper review is an optional case study. Long-form explanations retain named sources without relying on an unnamed “the paper.” |
| Activities explain what to manipulate and observe | Goals, activities and revealable explanations were compared with implemented controls. Guided kernel fitting, held-out exploration, different grids, Fourier sampling and horizon changes were exercised. Information available to the model is distinguished from simulator reference information. |
| Playable experiments and reliable state | CPU and WebGPU kernel smoke checks, pause/reset and alternate data/kernel settings; short Fourier completion/reset; long Fourier completion at 400 updates and retention into prediction. Keyboard output-grid change 64→80 retained weights; changing horizon 0.30→0.35 restored the untrained state. |
| Meaningful research exploration | Paper search, note round-trip, author and field traversal, citation visibility in Connections view and all timeline filters verified. Timeline has 22 milestones; sampling/application/robotics filters each show their five entries. Wavelet concepts connect to primary-paper notes and graph nodes. |
| Accessible and responsive controls | Shared sliders now put accessible names on their actual thumbs. Keyboard arrows changed Fourier controls and Enter opened an author graph node. Labeled mobile selectors, Preferences open/close, and desktop/390px layout checks passed. Long equations/tables/code scroll within their containers. |
| Accurate scope and provenance | Integral/field/model/simulator distinctions retained. Output-label bump is identified as a post-generation offset, not physical forcing. Wavelet application hypotheses and editorial edges are distinguished from evidence. Graph exports and paper-note coverage validated together. |
| Technical regression gate | Fresh 24/24 numerical tests, TypeScript and production Vite build passed after the slider fix. Prior complete homepage CI build passed; final branch remains an unmerged PR. |

The review is complete for the requested learning app. These checks establish the implemented workflows and tested layouts, not universal browser/hardware performance or independent reproduction of every research result. The numerical models retain their documented limitations; the research collection remains a dated, curated snapshot. PR #35 must remain unmerged until the user's review.
