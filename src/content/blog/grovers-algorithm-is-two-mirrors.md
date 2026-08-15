---
title: "Grover's algorithm is two mirrors"
date: "2026-08-15"
description: "Quantum search finds one box among N in about √N looks. The whole trick is a reflection followed by a reflection — so I built an interactive essay where you can run it, watch it, and break it."
tags: ["Quantum Computing", "Interactive Essay", "TypeScript", "Physics", "Simulation"]
---

You are given $N$ shuffled boxes, one prize, and a yes/no check. Classically there is nothing clever to do: open boxes until you find it, about $N/2$ looks on average. In 1996 Lov Grover showed a quantum computer needs about $\sqrt{N}$ — same check, same boxes. A million boxes: roughly 785 queries instead of half a million.

**[Run the interactive essay](/demos/grover/)** — every claim below has a widget there, driven by a live statevector simulator.

## The myth first

"A quantum computer tries every answer at once" is the folklore, and it's uselessly half-true. A quantum state does assign an amplitude to every box simultaneously — but *measure* the uniform superposition and you get one box uniformly at random, exactly like guessing. Superposition alone buys nothing.

The actual resource is that amplitudes are *signed*: two paths to the same outcome add before they're squared, so they can cancel. Grover's algorithm is nothing but choreographed interference — arranged so the wrong answers eat each other and the right one accumulates.

## Two mirrors

The choreography needs exactly two moves, both reflections:

1. **The oracle** — the yes/no check, run in superposition — flips the *sign* of the marked box's amplitude. Nothing measurable changes: squaring erases a lone sign. The winner is branded invisibly.
2. **Diffusion** reflects every amplitude about the mean, $a_i \mapsto 2\bar a - a_i$. It knows nothing about which box is marked; it's pure democratic arithmetic. But the flipped bar has dragged the mean down, so the reflection throws that one bar high above the crowd while everyone else dips slightly.

The essay animates that as bars — the mean line drawn, every bar passing through it. But the deeper picture is geometric. The whole state lives in a plane spanned by "the marked one" and "everything else," where the oracle is a reflection across one axis and diffusion is a reflection across the uniform state $|s\rangle$. And a reflection followed by a reflection is a **rotation** — by $2\theta$ per iteration, where

$$
\sin\theta = \frac{1}{\sqrt N}.
$$

That one triangle is the entire algorithm. Success probability after $t$ steps is $\sin^2((2t{+}1)\theta)$; you want the arrow vertical, so $t^* \approx \frac{\pi}{4}\sqrt N$ — *that's* where the square root comes from. And because the rotation is blind and metronomic, iteration $t^*{+}1$ rotates straight past the target: run it too long and the success probability falls, sweeps around, and comes back — a sine wave forever. The essay has a slider for exactly this; overshooting is the part everyone finds surprising, and it's just geometry.

## Honesty section

The essay ends the way I think every Grover explainer should:

- The speedup is **quadratic, not exponential** — and provably optimal. Grover doesn't break encryption; it halves effective key bits, which is why the response was AES-256, not panic.
- The algorithm is an **amplifier for whatever the oracle says**: mark the wrong box and it amplifies the wrong box to near-certainty. There's a sabotage bench where you can watch it do that.
- The gate decomposition of diffusion actually implements $-(2|s\rangle\langle s|-I)$ — every amplitude comes out upside-down versus the textbook picture. No measurement can see a global phase, and the circuit widget shows the minus sign rather than hiding it.

The simulator is ~200 lines of TypeScript on `Float64Array`s — H, X, Z, and multi-controlled-Z as bitmask pair loops, no quantum libraries — and the essay displays the exact source it runs. Unit tests check the sim against the closed form to $10^{-12}$, including the exact certainties at $N{=}4$ and the $N{=}16, k{=}4$ party trick where one iteration succeeds with probability 1.

Reflection, reflection, rotation. [Go bounce the arrow.](/demos/grover/)
