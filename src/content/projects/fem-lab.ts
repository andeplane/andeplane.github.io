import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'fem-lab',
  title: 'FEM Lab',
  description:
    'A finite element program that runs in the browser: a Rust engine compiled to WebAssembly with a WebGPU solver, a geometry-to-results editor, and an AI assistant that drives the same commands you do.',
  tags: ['Rust', 'WebAssembly', 'WebGPU', 'TypeScript', 'Finite Elements', 'Simulation', 'AI'],
  liveUrl: 'https://andeplane.github.io/fem-lab/',
  repoUrl: 'https://github.com/andeplane/fem-lab',
  screenshot: '/projects/fem-lab/preview.png',
  longDescription: `
Draw a part, give it a material, hold it somewhere, push on it, and read off where it
bends and how much. That is what a finite element program does, and this is one that
opens as a web page. Finite elements divide the part into small connected pieces;
their shared nodes carry displacement or temperature, and interpolation fills in the
space between nodes. Refining this mesh lets you check whether the result is converging. The engine is Rust compiled to WebAssembly; the linear solves run
either through a sparse Cholesky factorisation on the CPU or as a conjugate gradient on
your GPU through WebGPU, with the answer refined in double precision either way. The numerical solver runs locally. The optional AI assistant is a separate service
interaction, so local computation alone is not a blanket claim about all data flows. The same engine also builds natively for the command line, and a Journal
replayed on your laptop and in the browser hashes to the same bytes.

## Every action is a command

The editor is a thin skin over a registry of commands: add a box, name a face, assign a
material, set the mesh, fix an edge, apply a pressure, run a step. Clicking a button,
typing in the palette, running a TypeScript script and asking the assistant all issue
the same commands, and every one of them lands in a Journal you can undo, replay, hash,
export as a script or hand to someone else as a link. The AI assistant gets the same
command set as tools, plus the read-back queries an engineer would use: extremes with
their locations, the reaction table against the applied loads, a probe at a point, the
mesh quality. It can look at a sketch you paste in and build the geometry from it, and it
is asked to check its own answers against hand calculations before it reports them.

## Elements, procedures and the benchmarks that hold them

Hexahedra and tetrahedra in first and second order, quadrilaterals and triangles for
plane stress, plane strain and axisymmetry, with incompatible modes on the linear
elements so they do not lock in bending. Static, modal, steady and transient heat,
thermal stress chained from a heat step, and explicit dynamics. Structured, mapped,
swept and free meshers, and a convergence study that re-meshes, re-solves and reports
the observed rate with a Richardson extrapolation.

Thirty-odd benchmark cases run in CI as Journals with checks: Timoshenko's cantilever,
the Kirsch plate with a hole, Lamé's thick cylinder in three idealisations, Cook's
membrane in both plane stress and plane strain, the NAFEMS LE1, LE10, T3, T4 and FV32
problems, the MacNeal–Harder patch tests. The status table in the repository is
generated from the run, and the engine and geometry crates hold one hundred per cent
line, function and region coverage.

## Learning it

A gallery of examples opens solved, each with the reference value it should hit and the
theory behind it, and a set of step-by-step tutorials watch the Journal and advance when
you issue the expected command, or issue it for you. Results come as contours with a
legend in your own units, a deformed shape you can scale, a probe under the cursor, and
exports to VTU, Gmsh, Abaqus and STL, or as a Markdown report with the assumptions and
the Journal as an appendix.
  `.trim(),
}

export default project
