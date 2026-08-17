import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'interval-trainer',
  title: 'Interval Trainer',
  description:
    'Ear training that shows its physics. Hear the root and fifth together, name the note that follows — while every note you hear ripples across the page at its own wavelength, and consonance becomes something you can see.',
  tags: ['TypeScript', 'Web Audio', 'WebGL', 'Music', 'Game'],
  liveUrl: '/demos/interval-trainer/',
  repoUrl: 'https://github.com/andeplane/andeplane.github.io/tree/main/demos/interval-trainer',
  screenshot: '/projects/interval-trainer/preview.png',
  longDescription: `
Recognising an interval by ear is a skill you can only get by doing it a few thousand
times, which means the practice has to be quick, honest, and pleasant enough to come back
to. Every question here opens the same way — the root and the fifth above it struck
together, an open chord that tells your ear where *home* is — and then plays one more
note. You say where it landed: **3** or
**3b**, **7** or **7b**, ten buttons, ten keyboard shortcuts, no menus in between.

## What you can do

Pick a difficulty first. **Easy** stays in one key for the whole run and asks only the five
degrees written without a flat or a sharp — five fat buttons, five shortcuts. **Medium**
keeps the single key and opens up all ten. **Hard** moves the key every question, so
nothing carries over from the last one. Each keeps its own highscore board.

Practice with no clock at all: replay a question as many times as you like, get the answer
named the moment you commit to it, and hear a miss played back to you with the right
answer on screen. A strip along the bottom keeps score per interval, so the vague feeling
that you are bad at **6b** turns into a bar you can watch climb.

Or play it as a game. Two minutes on the clock, six more seconds for every correct answer
— you watch them fly up from the note that earned them — and a hundred points plus a
hundred more if you name it inside a second. A wrong answer costs
nothing but time — no points, streak back to zero, next question. Each board keeps your ten
best runs in the browser. There is a four-step tutorial for anyone who has never thought
about intervals as numbers, and the key can be pinned to one note instead of drawn fresh
each run.

## Consonance you can see

The background is not decoration: it is the notes themselves, drawn. Each one becomes a
point source, and the canvas shows their superposition, with a wavelength set by the note's
own frequency — one speed for every ripple, exactly as in air, so pitch changes the spacing
of the crests and nothing else. The fifth's crests sit at two thirds of the root's, an
octave's at half. Because those ratios are the real ones, a simple interval sums into
almost stationary interference fringes while the tritone's 45:32 never repeats and shimmers
instead. The thing your ear is reaching for is on the screen behind it.

## Under the hood

The piano is synthesised, not sampled: six harmonics over a slightly inharmonic series,
upper partials decaying faster than lower ones, low notes ringing longer than high ones,
through a generated impulse response for a little room. Nothing to download, and it works
offline. The wave field is a WebGL2 fragment shader evaluating the field per pixel, with
the same function in TypeScript as a canvas-2D fallback at quarter resolution — one
definition of the physics, two backends, kept side by side in a single file so they cannot
drift. The rules — the interval table, question generation, scoring, the highscore board —
are pure functions with tests that run as part of the build.
  `.trim(),
}

export default project
