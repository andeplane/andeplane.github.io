import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'atomify',
  title: 'Atomify',
  description: 'Browser-based molecular dynamics simulator powered by LAMMPS compiled to WebAssembly.',
  tags: ['C++', 'WebAssembly', 'React', 'TypeScript', 'LAMMPS'],
  liveUrl: 'https://andeplane.github.io/atomify',
  repoUrl: 'https://github.com/andeplane/atomify',
  screenshot: '/projects/atomify/preview.gif',
  longDescription: `
Atomify brings the gold-standard molecular dynamics engine [LAMMPS](https://lammps.sandia.gov/) directly into the browser — no installation, no backend, no GPU cluster required.

The entire LAMMPS simulation engine is compiled to WebAssembly via Emscripten, running at near-native speed inside a Web Worker so the UI stays responsive. A React + TypeScript front-end wraps a JupyterLite notebook environment, letting users write LAMMPS input scripts, run simulations interactively, and visualise atoms in real time using [omovi](https://github.com/andeplane/omovi).

## Key features

- **Full LAMMPS engine in the browser** — upgraded to the July 2025 stable release
- **WebAssembly + Web Worker** — simulation runs off the main thread; no UI jank
- **JupyterLite integration** — write Python notebooks that drive simulations and plot results
- **Example gallery** — curated simulations (NVT water, crack propagation, argon FCC, …) ready to run with one click
- **Embeddable** — iframe-friendly embed mode with sidebar hiding for docs/courses

## Technical highlights

The LAMMPS WASM build uses a custom CMake + Emscripten toolchain containerised in a dev container. Memory leaks from embind wrapper objects were fixed by explicitly deleting C++ objects after each timestep callback. The build exposes a thin C API that the TypeScript layer calls through the generated Emscripten bindings.

Atomify was originally a Qt/QML desktop application; this web version reimplements the visualisation layer entirely in WebGL via *omovi* and replaced Qt signals with a message-passing protocol over \`postMessage\`.
  `.trim(),
}

export default project
