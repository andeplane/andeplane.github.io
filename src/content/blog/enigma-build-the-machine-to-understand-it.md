---
title: "Enigma: build the machine to understand it"
date: "2026-02-15"
description: "Why is Enigma its own inverse? Why can no letter encrypt to itself? Writing the machine twice — once with index arithmetic, once with permutation matrices — until the famous flaw becomes one line of algebra."
tags: ["Cryptography", "Math", "Python", "History", "Education"]
---

Joachim and I have a running fascination with the Enigma machine. Not just the codebreaking drama — the *machine itself*. A keyboard, a battery, some lamps, three rotors and a mirror, and out comes a cipher that Germany staked a war on. We'd both read the books and could recite the story; neither of us could honestly say we understood *why* the machine has the properties it has.

So we did the only thing that reliably converts "I've read about it" into "I understand it": we built one. [enigma.py](https://github.com/andeplane/enigma.py) is a historically faithful emulator — and because the point was understanding, it contains **two complete implementations** that must agree with each other.

## The machine in one diagram

Press a key and a current runs through: the plugboard $S$ (a handful of user-configured letter swaps), three rotors $R$, $M$, $L$ (each a fixed scrambled wiring, each rotatable), and the reflector $U$, which sends the current *back* through everything in reverse before it lights a lamp:

![One keypress, seven permutations and a reflection](/blog/enigma/signal-path.svg)

*The full journey of one keypress. Before the signal even enters, the fast rotor steps — successive keypresses use different rotor positions, until the stepping cycle repeats.*

A **permutation** rearranges the letters without losing or duplicating any: for example, A → C, B → A, C → B is a permutation of a three-letter alphabet. Every Enigma component permutes 26 letters. At one fixed rotor position, the complete signal path computes:

$$
E \;=\; S^{-1} R^{-1} M^{-1} L^{-1} \, U \, L M R S
$$

Read right-to-left: plugboard, three rotors, reflector, and back out through the same components inverted. The superscript −1 means undoing a permutation. The wiring stays fixed, but stepping changes which contacts meet, so the substitution changes during a message.

The stepping mechanism is **not an odometer**. The right rotor steps every press. Its turnover notch lets a pawl advance the middle rotor; when the middle rotor is itself at its notch, the next press advances both it and the left rotor. The middle rotor can therefore step on two consecutive presses. For the usual three moving, single-notch rotors this double-step gives a cycle of 16,900 presses, rather than all 26³ possible positions. [David Hamer’s analysis of the stepping mechanism](https://www.cryptomuseum.com/people/hamer/files/double_stepping.pdf) explains the mechanical reason.

**Implementation one** (`enigma_python.py`) says exactly this in code: rotors are lookup tables with index arithmetic, rotation is an offset, the notch mechanism advances the neighbour. It reads like the machine's manual, and it's the version to open if you want to *follow the current*.

## Then write it again, as linear algebra

**Implementation two** (`enigma_matrix.py`) represents every component as a 26×26 **permutation matrix** — a single 1 in each row and column. A **one-hot vector** represents a letter by putting 1 in its position and 0 everywhere else: A is (1, 0, …), B is (0, 1, …). Encrypting letter $x$, represented by $\mathbf{e}_x$, is a chain of matrix multiplications; rotating a rotor is conjugating it with the cyclic-shift matrix $C$: after $k$ steps, the rotor's effective permutation is $C^{-k} R\, C^{k}$.

This sounds like a party trick — NumPy cosplay. It isn't. The matrix formulation makes the machine's two most famous properties fall out as one-liners.

**Property 1: Enigma is an involution — encryption *is* decryption.** Group the machinery around the reflector as $P = LMRS$, so $E = P^{-1} U P$. The historical reflector pairs letters up, so $U^2 = I$ (and $U^{\mathsf T} = U$). Then:

$$
E^2 = P^{-1} U P \, P^{-1} U P = P^{-1} U^2 P = I
$$

This identity applies at a **fixed rotor state**. To decrypt a whole message, restore the same rotor order, ring settings, plugboard and **starting rotor positions** used before encryption, then type the ciphertext. Both runs follow the same stepping sequence. Try a short message, reset those positions, and feed the output back: your message should reappear. Continuing from the final positions would use a different sequence.

**Property 2: no letter ever encrypts to itself.** The reflector pairs *distinct* letters, so $U$ has zeros on its diagonal. Conjugation by a permutation matrix just relabels which letter is which — it shuffles the diagonal entries but can't create new ones. Cleanest way to see it: the trace is invariant under conjugation,

$$
\mathrm{tr}(E) = \mathrm{tr}(P^{-1} U P) = \mathrm{tr}(U) = 0
$$

and for a permutation matrix, the trace *counts fixed points*. Zero trace, zero fixed points: **pressing A can light up any lamp except A.**

That innocent-looking guarantee is the crack in the armour. It leaks information with every keystroke: any alignment where a guessed plaintext word ("WETTERBERICHT" — the weather report sent at the same time every morning) would require some letter to encrypt to itself is *impossible* and can be discarded. This constraint helped reject crib alignments. It was one ingredient in a much larger cryptanalytic effort involving Polish breakthroughs, intercepted traffic, operator practices, guessed plaintext and mechanized searches. The reflector provides a useful weakness to understand; the equation alone is not a method for recovering a key.

I knew that story from books. But deriving $\mathrm{tr}(E) = 0$ myself, from a design decision I had just implemented, was the first time it felt *obvious* — the flaw isn't a subtle oversight, it's algebraically forced by the reflector.

## The engineering bit

Both implementations sit behind shared abstract interfaces (`Rotor`, `Reflector`, `Plugboard`), so either can be swapped into the `EnigmaMachine` orchestrator. The test suite drives both with the same key settings and historical test vectors and requires identical output — each implementation debugs the other. Independent implementations can reveal different coding mistakes. Agreement alone cannot rule out a shared misconception, so historical test vectors and explicit double-step cases matter too.

And the key space, for the record: 60 rotor orders × 17,576 rotor positions × ~150 trillion plugboard configurations ≈ **1.6 × 10²⁰ keys**. That illustrative count fixes assumptions about the machine and plugboard and is not the stepping period. The successful attacks reduced the search using machine structure and message evidence; they did not simply try every key or apply the trace identity by itself.

The best way to learn is to build. The second-best way is to build it *twice*.
