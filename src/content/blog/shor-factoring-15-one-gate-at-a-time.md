---
title: "Factoring 15, one gate at a time"
date: "2026-10-08"
description: "Shor's algorithm without the shortcuts: 18 qubits, 6,575 gates, every modular multiplication built from phase rotations, simulated on your GPU in about 50 ms. Here is what is inside the box everyone draws as U."
tags: ["Quantum Computing", "WebGPU", "TypeScript", "Simulation", "Physics"]
---

Every explanation of Shor's algorithm has a box labelled $U$. It sits on the circuit diagram doing all the work, "multiply by $a$ mod $N$", and nobody opens it. Most simulators don't either: they apply the multiplication as a lookup table and move on.

I wanted to open the box. So I wrote a small quantum computer simulator for the browser, on WebGPU, and built Shor's algorithm in it gate by gate. Factoring 15 that way takes 18 qubits and 6,575 gates. On my laptop's GPU it runs in about 50 milliseconds.

**[Open the Shor lab](/demos/shor/)**: pick a number, step through the circuit, click any box to look inside, and measure your way to the factors.

## Factoring is finding a period

The quantum computer never factors anything directly. Shor's insight was that factoring reduces to a different problem, and only that problem needs quantum help.

Pick a number $a$ that shares no factor with $N$ and look at its powers mod $N$. For $N = 15$, $a = 7$:

$$
7^0, 7^1, 7^2, 7^3, 7^4, \dots \equiv 1, 7, 4, 13, 1, \dots \pmod{15}
$$

The sequence repeats with period $r = 4$. That means $7^4 - 1 = (7^2 - 1)(7^2 + 1)$ is a multiple of 15, while neither factor is on its own, so each one must share a factor with 15:

$$
\gcd(48, 15) = 3, \qquad \gcd(50, 15) = 5.
$$

That's the whole classical side. It works whenever $r$ is even and $a^{r/2} \not\equiv -1$, which happens for most choices of $a$. The lab lets you pick a bad one and watch it fail. The hard part is finding $r$: for a 2048-bit $N$ the period can be astronomically long, and no known classical method finds it efficiently.

## The quantum part: make the period visible

The circuit has two registers. A **counting register** of $t$ qubits goes into an equal superposition of every value $j$ from $0$ to $2^t - 1$. A **work register** starts at 1. Counting qubit $k$ then controls a multiplication of the work register by $a^{2^k} \bmod N$. Together, the controlled multiplications compute $a^j \bmod N$ for every $j$ at once:

$$
\frac{1}{\sqrt{2^t}} \sum_j |j\rangle\,|a^j \bmod N\rangle.
$$

The lab draws this state directly: one pixel per amplitude, with counting value $j$ along the x-axis, work value along the y-axis, and colour for phase. After the multiplications you see a striped pattern, because column $j$ lights up in row $a^j \bmod N$, and that repeats every $r$ columns.

An inverse quantum Fourier transform on the counting register turns that repetition into frequency. All the probability ends up in peaks at multiples of $2^t/r$:

![The joint state for N = 21 after the inverse QFT: every row has collapsed into the same six columns, and the histogram below is a comb with six teeth](/blog/shor/amplitudes-21.png)

Measuring gives you one of those peaks, say $y = 192$ out of $2^8 = 256$. Then $192/256 = 3/4$, and a continued-fraction expansion recovers the denominator, $r = 4$. Sometimes you land on a peak like $128/256 = 1/2$ and get a divisor of $r$ instead. Then you check, notice $7^2 \not\equiv 1$, and measure again. The lab shows that whole chain for every shot.

## Inside the box

So what is "multiply by $a$ mod $N$" made of? I followed Stéphane Beauregard's 2003 construction, which builds it from layers of addition, and it has the nicest idea in the whole algorithm at the bottom.

**Adding a constant is a rotation.** Take a register holding $b$ and apply a QFT. In the Fourier basis, adding a known classical number $c$ just multiplies each basis state $|y\rangle$ by a phase $e^{2\pi i\, c y / 2^m}$. Because $y$ is a sum of its bits, that phase splits into one independent rotation per qubit. Addition becomes $m$ single-qubit phase gates, with no carries and no scratch bits. This is Draper's adder, and everything else is careful bookkeeping on top of it:

- **Modular addition.** Add $c$, subtract $N$, and copy the sign bit into one spare qubit. If the result went negative, add $N$ back. The spare qubit now remembers which branch happened, and quantum circuits can't leave garbage behind, so the last five steps exist only to reset it to $|0\rangle$.
- **Modular multiplication.** Add $a \cdot 2^i \bmod N$ once for every bit $x_i$ of the work register, controlled on that bit. That accumulates $a x \bmod N$ in a second register.
- **In-place multiplication.** Swap the result into the work register, then run the multiplication by $a^{-1}$ backwards to wipe the old value out of the accumulator. Reversibility forces this uncompute step. Without it the scratch register stays entangled with the answer, and the interference that makes the peaks never happens.

![One modular adder inside the lab: add, subtract N, test the sign into the ancilla, conditionally add N back, then the uncompute steps](/blog/shor/modular-adder.png)

In the lab every one of those layers is a box you can click. "×4 mod 15" opens into two multipliers and a swap, a multiplier opens into modular adders, and an adder opens into individual phase gates with angles like π/8.

## The honest footnotes

**Multiply by 1.** For $a = 7$ the multipliers are $a^{2^k} \bmod 15 = 7, 4, 1, 1, 1, \dots$. Six of the eight controlled multiplications multiply by one and do nothing. The lab still runs every one of their gates. A circuit that skips them was built by someone who already knew $r$, and that is exactly the shortcut behind several published "quantum factoring" demonstrations. Smolin, Smith and Vargo's 2013 paper *Pretending to factor large numbers on a quantum computer* is a good read on this.

**It's still idealised.** The simulator applies phase gates with two or three controls in one step. Real hardware would decompose each of them into many CNOTs and single-qubit gates. I also use the full $2n$-qubit counting register. Beauregard reaches his $2n + 3$ qubits by recycling one counting qubit with mid-circuit measurements.

**And it's noiseless.** A real 18-qubit device running 6,575 gates would lose this signal to errors long before the end. The noise budget for doing it for real is the actual research frontier: Gidney's 2025 estimate for RSA-2048 is still just under a million noisy physical qubits running for about a week.

## The simulator

The engine lives in [`packages/quantum`](https://github.com/andeplane/andeplane.github.io/tree/main/packages/quantum), separate from the lab, so future demos can share it. A state on $n$ qubits is $2^n$ complex numbers in a GPU buffer, and every gate is one compute dispatch. A 2×2 unitary on a target qubit, applied only where a mask of control bits is set, covers H, X, phase rotations and their controlled versions in a single kernel. Swaps and lookup-table permutations each get their own kernel. Thousands of gates go out in one compute pass. Each gate's parameters sit in its own slot of one uniform buffer, picked with a dynamic offset, so the CPU's only job is to say "go".

WGSL has no 64-bit floats, so amplitudes are single precision. After 6,575 gates the result differs from the exact answer by about $10^{-4}$, far below anything a histogram can show. A plain CPU backend with the same interface handles browsers without WebGPU, and it is also the reference: the tests check the modular arithmetic exhaustively on the CPU, then compare the GPU against it amplitude by amplitude.

The numbers make the classic argument for building quantum computers better than any slogan. Each extra qubit doubles the memory: 18 qubits is 2 MB, 22 qubits (factoring 21) is 32 MB, and 26 qubits (factoring 35) is 512 MB, roughly where a browser tab gives up. Simulating the circuit for a 2048-bit number would need more amplitudes than there are atoms in the universe. A quantum computer just *has* them.

[Go open the box.](/demos/shor/)
