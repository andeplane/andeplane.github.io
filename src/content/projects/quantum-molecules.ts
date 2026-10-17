import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'quantum-molecules',
  title: 'Quantum Molecules',
  description:
    'Hartree–Fock and DFT for small molecules in a browser tab: a Rust quantum chemistry engine compiled to WebAssembly, with the electron density and orbitals ray-marched on your GPU. Drag an atom and the wavefunction follows.',
  tags: ['Rust', 'WebAssembly', 'WebGPU', 'TypeScript', 'Quantum Chemistry', 'Physics', 'Simulation'],
  liveUrl: 'https://andeplane.github.io/quantum-molecules/',
  repoUrl: 'https://github.com/andeplane/quantum-molecules',
  screenshot: '/projects/quantum-molecules/preview.png',
  screenshotAlt: 'Benzene with its highest occupied orbital drawn as blue and orange lobes inside a glowing electron density cloud',
  longDescription: `
Pick a molecule, choose a level of theory and a basis set, and the page solves the
electronic structure from scratch: the self-consistent field equations for the
electrons in the field of fixed nuclei. What comes back is the total energy, the
orbital energies, the dipole moment and the forces on every nucleus, and the
electron density drawn as a cloud you can rotate. Click an orbital level and that
orbital appears as an isosurface, blue where the wavefunction is positive and orange
where it is negative.

## Things to try

Drag a hydrogen away from water and watch the energy climb and the density stretch
with it; the SCF re-runs as you move, starting from the previous orbitals. Press
Relax and the geometry optimizer walks back to the minimum using analytic forces.
Look at ethylene's lowest empty orbital to see the π* node between the carbons, or
benzene's highest occupied pair, the π orbitals spread above and below the ring.
Play the SCF to watch the density settle from a superposition of atoms into the
molecule.

## The methods

Restricted and unrestricted Hartree–Fock, and Kohn–Sham density functional theory
with LDA (Slater exchange plus VWN5 correlation) or PBE, in the STO-3G, 6-31G and
6-31G* basis sets for hydrogen through neon. Open-shell molecules such as the OH
radical and triplet O₂ run with unrestricted Hartree–Fock. Benzene stays at STO-3G
to keep it interactive.

## Under the hood

The engine is a Rust library with no browser dependencies, so other simulators can
build on it and it runs natively too. Two-electron integrals use the
McMurchie–Davidson scheme with Schwarz screening, the SCF starts from atomic
densities and converges with DIIS, and DFT integrates on Becke-partitioned atomic
grids. Every method's energy, dipole, orbital energies and gradient are tested
against PySCF: Hartree–Fock agrees to 10⁻⁸ hartree and DFT to 2 × 10⁻⁵.

The quantum chemistry runs in double precision in WebAssembly inside a worker. WGSL
has no doubles, but drawing does not need them: after each SCF a compute shader
evaluates the density and the chosen orbital on a 3D grid in half precision, and a
full-screen pass ray-marches it, stopping at the depth of the atoms. The browser
tests run the app headless on a software WebGPU adapter and check the GPU grid point
by point against the CPU.
  `.trim(),
}

export default project
