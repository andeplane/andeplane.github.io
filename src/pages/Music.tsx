import { Link } from 'react-router-dom'
import intervalTrainer from '@/content/projects/interval-trainer'
import tubeSim from '@/content/projects/tube-sim'
import recorderLab from '@/content/projects/flute-lab'
import '@/features/neural-operators/research.css'

const experiments = [
  {
    project: recorderLab,
    eyebrow: 'Play the physics',
    description: 'Hold Space to blow into a recorder-inspired model, cover holes to play a melody, and measure the sound with a microphone in the simulated room. Watch its Fourier spectrum, or slow the physics and the pitch together.',
    action: 'Play Recorder Lab',
    post: 'from-a-steady-breath-to-a-measured-note',
    postTitle: 'From a steady breath to a measured note',
  },
  {
    project: intervalTrainer,
    eyebrow: 'Train your ear',
    description: 'Hear a root and fifth together, then try to recognise the note that follows. Practise at your own pace or play against the clock, with the sounds drawn as waves behind the notes.',
    action: 'Practise intervals',
    post: 'a-perfect-fifth-you-can-see',
    postTitle: 'A perfect fifth you can see',
  },
  {
    project: tubeSim,
    eyebrow: 'Explore the physics',
    description: 'Strike a tube and watch a pressure wave travel, reflect and escape through a hole. Change the hole or cap the end to explore the acoustics behind a flute-like tube in a 2D simulation.',
    action: 'Open the acoustics lab',
    post: 'a-hole-in-a-tube-is-not-a-leak-coefficient',
    postTitle: 'A hole in a tube is not a leak coefficient',
  },
]

export default function Music() {
  return (
    <div className="no-root">
      <nav className="no-breadcrumb" aria-label="Breadcrumb">
        <Link to="/interests">Interests</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Music</span>
      </nav>

      <header className="mb-10">
        <p className="no-eyebrow">Piano, guitar & the physics of sound</p>
        <h1 className="no-page-title">Music</h1>
        <p className="no-lead">
          Playing for the enjoyment of it, and trying to understand a little more of what I hear.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="no-article" aria-labelledby="music-playing">
          <h2 id="music-playing">Mostly, I just enjoy playing</h2>
          <p>
            I’ve played the piano since I was about seven or eight. I’m an okay player,
            I suppose, but what has kept me at it is how much I enjoy it.
          </p>
          <p>
            I also play some guitar, and I’d like to buy an electric guitar soon.
            One goal, sometime in my life, is to play <em>Shine On You Crazy Diamond</em> beautifully.
            That feels like something worth working towards.
          </p>
        </section>

        <section className="no-article" aria-labelledby="music-theory">
          <h2 id="music-theory">The theory is part of the fun</h2>
          <p>
            I’m also interested in music theory and the things around music: recognising
            intervals — the distance in pitch between two notes — understanding how notes fit together, and connecting what I hear
            with what I’m playing.
          </p>
          <p>
            Then there’s the physics. Notes are vibrations, instruments shape sound,
            and a hole in a tube becomes a surprisingly interesting simulation problem.
            The apps below explore that curiosity through listening, playing and simulation.
          </p>
        </section>
      </div>

      <section className="no-article mt-8" aria-labelledby="music-first-listen">
        <h2 id="music-first-listen">A first thing to listen for</h2>
        <p>The root is the note we treat as home. Count C, D, E, F, G: G is the fifth
          note of C major, so C to G is a fifth. C to the next C is an octave; its
          frequency doubles. A semitone is one step between adjacent piano keys,
          including the black keys, and twelve semitones make an octave.</p>
        <p>In the trainer, listen to C and G together, then compare E with E-flat.
          E is the major third, labelled 3; E-flat is one semitone lower, labelled ♭3.
          Start in Easy practice, then switch to Medium to include altered notes such as E-flat. Replay before answering. The aim is to recognise
          each note’s relationship to home, even when home changes.</p>
        <p>In the tube lab, watch the pressure rather than a travelling parcel of air.
          Air moves back and forth locally while the disturbance travels along the tube.
          Compare the returning pulse with the far end open and capped.</p>
      </section>

      <section className="mt-12" aria-labelledby="music-experiments">
        <p className="no-eyebrow">Listen, practise, experiment</p>
        <h2 id="music-experiments" className="text-2xl font-semibold tracking-tight mb-6">Music you can explore</h2>
        <div className="grid gap-6 md:grid-cols-2">
          {experiments.map(({ project, eyebrow, description, action, post, postTitle }) => (
            <article key={project.slug} className="overflow-hidden rounded-xl border border-[#292c36] bg-[#12151c] flex flex-col">
              <a href={project.liveUrl} aria-label={action} className="block">
                <img src={project.screenshot} alt={`${project.title} preview`} loading="lazy" className="aspect-video w-full object-cover" />
              </a>
              <div className="p-6 flex flex-col flex-1">
                <p className="no-eyebrow">{eyebrow}</p>
                <h3 className="text-xl font-semibold mb-3">{project.title}</h3>
                <p className="text-[#a1a4b0] leading-relaxed mb-6">{description}</p>
                <div className="mt-auto">
                  <a href={project.liveUrl} className="inline-block rounded-lg border border-[#53618b] bg-[#1b2331] px-4 py-2 text-sm text-[#c6d2ff] hover:bg-[#29324c]">
                    {action} <span aria-hidden="true">↗</span>
                  </a>
                  <p className="mt-4 text-sm leading-relaxed text-[#a1a4b0]">
                    Behind the app: <Link className="text-[#9eafff] hover:underline" to={`/blog/${post}`}>{postTitle}</Link>
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
