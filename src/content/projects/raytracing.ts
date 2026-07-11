import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'raytracing',
  title: 'Ray–Surface Intersection Explorer',
  description: 'Interactive learning tool for the maths at the heart of every ray tracer — derive, visualise, and live-code ray intersections with spheres, cylinders, and toruses.',
  tags: ['TypeScript', 'WebGL', 'GLSL', 'Three.js', 'Education'],
  liveUrl: 'https://andeplane.github.io/Raytracing/',
  repoUrl: 'https://github.com/andeplane/Raytracing',
  screenshot: '/projects/raytracing/preview.png',
  longDescription: `
An interactive learning tool for the mathematics at the heart of every ray tracer: *"does this ray hit this object, and if so, where?"*

Choose a geometry — **sphere**, **cylinder**, or **torus** — and explore ray–surface intersection across three lenses:

- **Theory** — step-by-step mathematical derivation: implicit surface F(**p**) = 0, ray substitution, polynomial coefficients, surface normal = ∇F, rendered with KaTeX
- **Intuition** — drag a ray interactively and watch the intersection polynomial update live in 3D and on a graph
- **Code** — a live GLSL fragment shader editor; edit the three intersection functions and the scene recompiles in real time

## The core idea

Every analytic ray–surface intersection follows the same three steps: write the implicit surface equation F(**p**) = 0, substitute the ray **P**(t) = **O** + t**D** to get a polynomial f(t) = 0, then find the smallest positive root and evaluate the normal **N** = normalize(∇F) at the hit point.

The torus is the centrepiece because it produces a **degree-4 (quartic)** polynomial — a ray can pierce it at up to four points — making it the richest analytic case before you reach general implicit surfaces. The sphere and cylinder (both quadratic) serve as warm-ups.

## For students

The repo includes a structured coding task that guides students through deriving the implicit equations on paper, implementing them in GLSL while watching the results render in real time, and experimenting with numerical root-finding (scan + bisect vs. Newton's method).

## Stack

TypeScript + Vite, Three.js for the 3D scenes, WebGL2/GLSL for the live shader editor, KaTeX for equation rendering, and Vitest for unit tests on the math layer.
  `.trim(),
}

export default project
