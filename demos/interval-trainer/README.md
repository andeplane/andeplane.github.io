# Interval Trainer

Ear training for musical intervals. Every question sounds the root and its fifth
*together* to establish a key, then one more note; you name where that note sits — `3` or
`3b`, `7` or `7b`. Practice mode has no clock and tracks which intervals you keep missing;
game mode runs a two-minute clock that correct answers extend.

```
npm install
npm run dev        # http://localhost:5173/demos/interval-trainer/
npm test           # vitest, watch mode
npm run build      # typecheck + tests + bundle
```

`?mute` prevents the AudioContext from ever being created, so the page is guaranteed
silent for screenshotting. `?canvas2d` forces the wave field's fallback renderer.

## The rules, and where they live

- **Ten answers, never the root or the fifth** — those two are given away by the chord.
  `src/core/intervals.ts` holds all twelve degrees and the ten askable ones, labelled with
  the accidental after the number (`3b`, `7b`) and the tritone written `4#`.
- **Three difficulties** (`src/core/difficulty.ts`), two dials between them: which degrees
  can be asked, and whether the key moves. *Easy* holds one key for the whole run and asks
  only the five degrees written without a flat or a sharp — a five-key pad, shortcuts
  `1`–`5`. *Medium* keeps the one key and opens up all ten. *Hard* re-rolls the key every
  question. Each keeps **its own highscore board**; a five-answer run and a ten-answer one
  are not the same game. A run is bound to the difficulty it started at, so changing the
  setting mid-run starts a fresh one rather than moving the goalposts under a live score.
- **Roots span F3–E4** (`src/core/question.ts`) so every pitch class is available when the
  key is pinned, and the highest target still lands in a comfortable register. The target
  may fall below the fifth — the context fixes *home*, not a ceiling.
- **Scoring** is a single block of constants in `src/core/scoring.ts`: 100 a correct
  answer, +100 under a second and +50 under two, a streak bonus capped at +100, six
  seconds on the clock, and a three-minute ceiling so a hot streak can't run forever. The
  game opens at two minutes. The answer clock starts when the target note sounds, and
  replays deliberately do not reset it. Earned seconds fly from the note that won them up
  to the readout (`Hud.flyTime`), which is scripted rather than CSS because the path
  depends on where the note is sitting.

## The sound

No samples. `src/audio/piano.ts` builds each note from six harmonics over a slightly
inharmonic series (`f_n = n·f·sqrt(1 + B·n²)`), with upper partials decaying faster than
lower ones and low notes ringing longer than high ones — the two details that separate a
struck string from an organ. The two context notes are struck on the same tick and a
little softer than a lone note, so the chord reads as one sound and never arrives louder
than the note you are listening for. `src/audio/engine.ts` adds a generated exponential-decay
impulse response for a little room. The context is created on the first gesture, because
browsers allow no other way.

## The wave field

The background is not decoration. Every note that sounds becomes a point source, and the
canvas draws their superposition:

    env(t - r/SPEED) · spread(r) · sin(2π (SPEED·t - r) / λ)

with `λ = λ0 · f_root / f_note`. One speed for all of them, exactly as in air, so pitch
sets the wavelength and nothing else: the fifth's crests are spaced 2/3 of the root's, an
octave's half. Because those ratios are exact, a 3:2 sums into near-stationary fringes
while the tritone's 45:32 never repeats and shimmers — consonance you can see.

`src/ui/field.ts` is the single definition of that field, in TypeScript for the canvas-2D
fallback and as a GLSL transcription immediately below it for the shader. `src/ui/waves.ts`
runs whichever backend is available: a WebGL2 fragment shader at full resolution, or the
same function evaluated into a quarter-resolution ImageData and scaled up with smoothing
(the trick `demos/tube-sim` uses for its pressure field). The loop stops itself when
nothing has sounded for a moment, so practice mode is genuinely idle between questions.

## Layout

`src/main.ts` owns the state and the round lifecycle; `core/` is the pure, tested rules,
`audio/` the sound, `ui/` the DOM. Tests are colocated (`*.test.ts`) and run as part of
`npm run build`.
