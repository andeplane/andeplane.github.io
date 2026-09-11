---
title: "A perfect fifth you can see"
date: "2026-08-17"
description: "An ear trainer that connects scale degrees to sound, with a wave illustration whose spacing follows the played notes’ frequency ratios."
tags: ["Web Audio", "WebGL", "Music", "Physics", "TypeScript", "Game"]
---

Recognising an interval by ear is not knowledge. You cannot read your way to it. It is a few thousand repetitions of *hear it, name it, find out* — which means the practice has to be fast, honest, and pleasant enough that you come back tomorrow.

So I built one, and then I could not resist making the background do some physics.

**[Try it](/demos/interval-trainer/)** — a chord, a note, ten buttons.

## Before the buttons: what is an interval?

An **interval** is a distance in pitch. The **root** is our reference note. In C major,
C–D–E–F–G–A–B are degrees 1–7: E is degree 3 and G is degree 5. A degree number is
not a count of semitones. A **semitone** is the step to the adjacent piano key,
including black keys; C to E spans four, while C to G spans seven.

Here `♭3` means lower degree 3 by one semitone: E-flat when C is home. `♭5` means
lower degree 5: G-flat, the six-semitone tritone. The octave is the next C, twelve semitones above the root.
Try singing C–D–E, then compare C–E with C–E-flat before using the keypad.

## Two sounds, not three

The first version played the root, then the fifth, then the target: three notes in a row. It worked, and it was wrong. Three events is a little melody, and a melody invites you to compare the last note with the one just before it rather than with *home*. The fix was to strike the root and the fifth **together**:

> **chord — note**

One second of an open fifth to tell your ear where home is, then the note you have to name. Two sonic events, and the second one is the question.

That choice pays a second dividend. If the opening chord hands you `1` and `5` for free, they can never be the answer, and the keypad drops from twelve buttons to ten:

```
♭2  2  ♭3  3  4  ♭5
♭6  6  ♭7  7
```

The accidental goes **before** the number. I use flat labels consistently for the altered degrees. In equal temperament, `♭2 = ♯1`, `♭3 = ♯2`, `♭5 = ♯4`, `♭6 = ♯5` and `♭7 = ♯6`: these are **enharmonic** spellings of the same pitches. Musical context determines the spelling, but this game asks you to recognise a sound relative to the root. Each pitch therefore has one answer button. The perfect fifth (`5`, seven semitones) is in the opening chord; the tritone (`♭5`, six semitones) is still an answer.

## What actually makes it hard

The obvious dial is how many answers there are. It is not the interesting one.

The interesting dial is whether the key stays put. With one key for a whole run, your ear builds a reference over the first few questions and every later answer is measured against something you already own. Move the key every question and that reference is demolished each time; you are re-establishing home from scratch, forever. Same ten buttons, a different skill.

So the three difficulties open one dial at a time:

| | key | answers |
|---|---|---|
| **Easy** | one key all run | the five degrees written without a flat or a sharp |
| **Medium** | one key all run | all ten |
| **Hard** | a new key every question | all ten |

Easy's five answers are `2 3 4 6 7` — every one of them a note of the key the chord just established, so it also sounds gentler, not merely shorter. Each difficulty keeps its own highscore board, because a five-answer run and a ten-answer one are not the same game and ranking them together would only reward picking the easy one.

## Consonance you can see

Here is the part I actually wanted to build.

Every note that sounds drops a point source onto a full-screen canvas, and the canvas draws their superposition:

$$
u(\mathbf{r}, t) \;=\; \sum_i \operatorname{env}\!\left(t - \frac{r_i}{c}\right)\, s(r_i)\, \sin\!\left(\frac{2\pi\,(c\,t - r_i)}{\lambda_i}\right)
$$

Here $u$ is the displayed signed field, $i$ labels a sounding note, $r_i$ is distance
from its source, $t$ is time since that note began, and $\lambda_i$ is crest spacing.
The envelope $\operatorname{env}$ sets the note’s rise and decay; $s(r_i)$ fades it
with distance. The displayed speed $c$ is in pixels per second, not metres per second.
With one shared speed, higher pitch gives closer crests:

$$
\lambda_i \;=\; \lambda_0 \cdot \frac{f_\text{root}}{f_i}
$$

An octave’s wavelength is half the root’s. The trainer uses twelve-tone equal temperament:
seven semitones give a frequency ratio $2^{7/12}\approx1.4983$, close to a just fifth’s
$3/2$. Its wavelength is therefore approximately, rather than exactly, two thirds of the
root’s. A tritone spans six semitones and has ratio $\sqrt2$ in this tuning.
[UNSW’s acoustics explanation](https://newt.phys.unsw.edu.au/jw/notes.html) connects these
ratios to note names.

The animation preserves these ratios at a slowed visual scale. It illustrates
**superposition**: add the signed disturbances from the sources at each location.
Two different frequencies do not form a stationary standing-wave pattern simply because
their ratio is 3:2. Ideal sustained tones at a rational ratio repeat together after a
common period; the decaying, spatially separated sources here add further changes.

Nor is the picture a meter of consonance. The synthesized piano has several partials,
while each visual source shows one wavelength. Harmonic relationships, the sound’s
spectrum and musical context all matter to listening. Use the waves to compare spacing
and addition, then use your ears to learn the interval.

The rest of the field function is just honesty about a real wavefront. The envelope is evaluated at *retarded* time $t - r/c$, because what you see at radius $r$ left the source $r/c$ ago; amplitude falls as $\exp(-r/R)/\sqrt{1 + r/a}$, cylindrical spreading with a soft horizon so nothing ever reaches the far corner and sits there.

That retarded time caught me out, in the good way. I had written a test asserting the field weakens with distance, and it failed. The test was wrong: sampling a fixed instant at growing radius does not measure spreading, it measures *age* — the far field is older, and can easily be stronger than a near field that has already decayed. The right test samples along the wavefront, at $t = r/c + \tau$, which holds phase and envelope constant and leaves spreading as the only variable. Rings also keep expanding after their note has died, which is what a wave does and what the corrected test now pins down.

One definition of that field lives in `src/ui/field.ts` in TypeScript, with its GLSL transcription immediately beneath it. A WebGL2 shader evaluates it per pixel; where WebGL is missing, the same TypeScript function fills a quarter-resolution `ImageData` that gets scaled up with smoothing on. Two backends, one physics, kept in one file so they cannot drift apart.

## The piano is a formula

No samples — nothing to download, and it works offline. Each note is six partials over a slightly inharmonic series,

$$
f_n = n f \sqrt{1 + B n^2}, \qquad B \approx 4\times10^{-4}
$$

with upper partials decaying faster than lower ones and low notes ringing longer than high ones. Those two details are most of what separates a struck string from an organ. A generated exponential-noise impulse response puts it in a small room. The two context notes are struck on the same tick and a little softer than a lone note, so the chord reads as one sound and never arrives louder than the note you are listening for.

## Making the clock feel fair

Game mode runs two minutes. A correct answer pays a hundred points and six seconds, doubled-ish if you name it inside a second, and a wrong answer costs nothing but the time you spent on it.

The detail I kept fiddling with was not the numbers, it was the *provenance* of the time. A clock that silently ticks up teaches you nothing about which answer earned it. So the earned seconds are a physical object: a gold `+6s` is born at the note you just named, arcs up to the clock, and is still solid when it lands, at which point the readout flashes. It arrives just under the digits rather than on top of them — covering the number at the exact moment it changes would hide the thing the animation is announcing.

The answer clock starts when the target note *sounds*, and replaying does not reset it. The bonus is for hearing the interval, not for hammering the replay button.

---

The pieces that decide whether it is any good — the interval table, question generation, the scoring constants, the highscore boards, the field function — are pure functions with tests that run as part of the build. Everything else is a canvas, an `AudioContext`, and ten buttons.

The useful loop is simple: listen, choose, hear the answer, and try again. The waves make the frequency ratios visible; recognising the interval remains a listening skill.
