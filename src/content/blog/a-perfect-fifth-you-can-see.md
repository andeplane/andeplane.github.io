---
title: "A perfect fifth you can see"
date: "2026-08-17"
description: "An ear trainer where the background is not decoration: every note becomes a point source whose crest spacing is its real frequency, so a fifth locks into standing fringes and a tritone churns. Consonance stops being a word and becomes a picture."
tags: ["Web Audio", "WebGL", "Music", "Physics", "TypeScript", "Game"]
---

Recognising an interval by ear is not knowledge. You cannot read your way to it. It is a few thousand repetitions of *hear it, name it, find out* — which means the practice has to be fast, honest, and pleasant enough that you come back tomorrow.

So I built one, and then I could not resist making the background do some physics.

**[Try it](/demos/interval-trainer/)** — a chord, a note, ten buttons.

## Two sounds, not three

The first version played the root, then the fifth, then the target: three notes in a row. It worked, and it was wrong. Three events is a little melody, and a melody invites you to compare the last note with the one just before it rather than with *home*. The fix was to strike the root and the fifth **together**:

> **chord — note**

One second of an open fifth to tell your ear where home is, then the note you have to name. Two sonic events, and the second one is the question.

That choice pays a second dividend. If the opening chord hands you `1` and `5` for free, they can never be the answer, and the keypad drops from twelve buttons to ten:

```
2b  2  3b  3  4  4#
6b  6  7b  7
```

The accidental goes *after* the number, which is how I think when I'm counting degrees, and the tritone is `4#` rather than `5b` — the fifth is the fifth, and it is already in the chord.

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

One propagation speed $c$ for every ripple, exactly as in air. Pitch therefore changes *only* the crest spacing:

$$
\lambda_i \;=\; \lambda_0 \cdot \frac{f_\text{root}}{f_i}
$$

An octave's crests sit at half the root's. A fifth's sit at two thirds. And because those ratios are the real ones, the interference is the real thing too: a 3:2 pair sums into fringes that barely move, while a tritone never settles.

That last contrast is sharper than I expected, and the reason is a nice piece of tuning arithmetic. Equal temperament's fifth is $2^{7/12} = 1.4983$, about two cents flat of a true $3{:}2$ — so the fringes do not stand perfectly still, they *drift*, slowly, like a beat you can watch. The tritone is $2^{1/2}$, which has no low-order rational neighbour worth the name; its pattern churns and never repeats. You can see the difference between the interval your ear finds restful and the one it finds restless, on the same screen, in the same second.

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

Which is the whole pitch, really: the thing your ear is reaching for is drawn on the screen behind it, at the right wavelength, the whole time.
