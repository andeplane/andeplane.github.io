import { useState } from 'react'
import { Link } from 'react-router-dom'
import AtomsIllustration from '@/features/rendering/AtomsIllustration'
import atomify from '@/content/projects/atomify'
import raytracing from '@/content/projects/raytracing'
import webgpuMd from '@/content/projects/webgpu-md'
import '@/features/neural-operators/research.css'

const projects = [
  { project: atomify, text: 'Run molecular dynamics and watch the atoms move. This is where my interest in making simulations visible really took shape.', action: 'Open Atomify' },
  { project: raytracing, text: 'Explore the ray–sphere and ray–cylinder intersections behind atom and bond rendering, then work up to the torus.', action: 'Explore the intersections' },
  { project: webgpuMd, text: 'GPU simulation and rendering meet in a browser tab: explore how a collection of individual particles becomes a material in motion.', action: 'Open WebGPU MD' },
]

export default function Rendering() {
  const [bounds, setBounds] = useState(false)

  return (
    <div className="no-root">
      <nav className="no-breadcrumb" aria-label="Breadcrumb">
        <Link to="/interests">Interests</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">3D rendering</span>
      </nav>

      <header className="mb-10 max-w-4xl">
        <p className="no-eyebrow">Atoms, bonds & the visual brain</p>
        <h1 className="no-page-title">The unreasonable effectiveness of 3D rendering</h1>
        <p className="no-lead">
          A few spheres, some light, and suddenly people want to know what they’re looking at.
          I find that both useful and fascinating.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-2 mb-8">
        <section className="no-article" aria-labelledby="rendering-attention">
          <h2 id="rendering-attention">First, it makes you look</h2>
          <p>
            I like how much a good 3D rendering can change someone’s reaction to a simulation.
            Give the atoms some shape, light them nicely, let people turn the scene around,
            and something quite technical becomes something they want to play with.
            People get impressed. They enjoy looking at it. I think that matters.
          </p>
          <p>
            That first bit of attention is an invitation. A person who stops to look can
            start asking questions: what is moving, why does that region look different,
            what happens if I change the temperature? The picture gives the conversation
            somewhere to begin.
          </p>
        </section>

        <figure className="rounded-xl border border-[#303546] bg-[#111723] overflow-hidden flex flex-col justify-center">
          <AtomsIllustration bounds={bounds} />
          <figcaption className="px-6 pb-6 text-sm leading-relaxed text-[#a1a4b0]">
            <label className="flex items-center gap-3 text-[#e7e8ed] mb-4 cursor-pointer">
              <input type="checkbox" checked={bounds} onChange={(event) => setBounds(event.target.checked)} className="accent-[#9eafff] h-4 w-4" />
              Show the billboard geometry
            </label>
            A schematic atom cluster. Turn on the outlines: each apparent sphere fits inside
            a flat square made of two triangles. In a GPU renderer, the shader supplies the
            curved surface and its depth. Here, SVG shading illustrates the idea.
          </figcaption>
        </figure>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="no-article" aria-labelledby="rendering-perception">
          <h2 id="rendering-perception">Give the visual brain something to work with</h2>
          <p>
            A table of coordinates asks you to reconstruct a scene in your head. A rendering
            does some of that work for you. Overlap suggests what is in front, shading suggests
            curvature, and rotating the scene helps reveal its shape.
          </p>
          <p>
            There is a lovely example in perception research: people can recover 3D structure
            from moving dots on a flat screen. <a href="https://pubmed.ncbi.nlm.nih.gov/1771786/">Experiments on structure from motion</a> explore
            that ability. A screen does not need to be physically three-dimensional to give
            us a sense of depth.
          </p>
          <p>
            That is part of what I think makes interactive scientific graphics so effective.
            We get to use our visual intuition to explore an unfamiliar system. With atoms,
            a crystal, a void, or a moving interface can become a shape to investigate.
          </p>
        </section>

        <section className="no-article" aria-labelledby="rendering-bonds">
          <h2 id="rendering-bonds">Atoms and bonds: a small visual vocabulary</h2>
          <p>
            Spheres give positions a visible size and surface. Bonds add connections.
            Colour can distinguish atom types or show a quantity such as local energy.
            A surprisingly small set of visual choices can describe a complicated structure.
          </p>
          <p>
            Those choices carry meaning. A drawn bond might represent a chemical bond,
            or simply a pair selected by a distance rule. Sphere radii and colours are
            choices too. I’m interested in making that visual vocabulary both appealing
            and easy to read.
          </p>
          <p>
            Rotation, a cutaway, or hiding one type of atom can be as useful as better
            lighting. The aim is to help someone notice a relationship, then give them
            a way to look more closely.
          </p>
        </section>
      </div>

      <section className="no-article mt-8" aria-labelledby="rendering-billboards">
        <h2 id="rendering-billboards">The sphere is two triangles</h2>
        <p>
          One of my favourite tricks is billboarding. For each atom, draw a small quad — a flat rectangle made of two triangles — that
          faces the camera. It covers the part of the screen where the sphere will appear.
          For each pixel in that quad, a fragment shader — a small GPU program that computes the pixel’s appearance — asks whether the viewing ray hits
          the sphere. Misses are discarded; hits give a surface position and a normal, the direction perpendicular to the surface, for lighting.
        </p>
        <p>
          The crucial detail is depth: write the depth of the sphere’s surface, rather than
          the flat quad, so objects overlap correctly. Bonds can use the same idea with
          ray–cylinder intersections. The geometry stays simple while the pixels describe
          a smooth curved object.
        </p>
        <p>
          This shifts work from a detailed triangle mesh into the fragment shader. It is
          particularly appealing when drawing many small atoms, though large, overlapping
          billboards can still mean a lot of pixel work. <a href="https://developer.nvidia.com/gpugems/gpugems3/part-iv-image-effects/chapter-21-true-impostors">GPU Gems’ chapter on true impostors</a> explores
          the broader idea of rendering 3D objects through camera-facing quads.
        </p>
        <p>
          I wrote up the analytic intersections in <Link to="/blog/raytracing-from-sphere-to-quartic-torus">Ray tracing by hand</Link>.
          The connection back to my own simulations is in <Link to="/blog/atomify-molecular-dynamics-for-the-rest-of-us">the story of Atomify</Link>.
          I love that such a small piece of geometry and mathematics can make a whole
          simulated world feel tangible.
        </p>
      </section>

      <section className="mt-12" aria-labelledby="rendering-projects">
        <p className="no-eyebrow">From the trick to the simulation</p>
        <h2 id="rendering-projects" className="text-2xl font-semibold tracking-tight mb-6">See it in practice</h2>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {projects.map(({ project, text, action }) => (
            <article key={project.slug} className="rounded-xl border border-[#292c36] bg-[#12151c] overflow-hidden flex flex-col">
              <Link to={`/projects/${project.slug}`} aria-label={`About ${project.title}`}>
                <img src={project.screenshot} alt={`${project.title} preview`} loading="lazy" className="aspect-video w-full object-cover" />
              </Link>
              <div className="p-6 flex flex-col flex-1">
                <h3 className="text-xl font-semibold mb-3">{project.title}</h3>
                <p className="text-[#a1a4b0] leading-relaxed mb-6">{text}</p>
                <a href={project.liveUrl} className="text-sm text-[#9eafff] hover:underline mt-auto">{action} <span aria-hidden="true">↗</span></a>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
