import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'water-gpt',
  title: 'The Water GPT',
  description:
    'A matrix multiplier made of pipes, valves and reservoirs: a hydraulic crossbar that does a whole matrix–vector product in one step, scaled up until it runs a small trained GPT that adds two-digit numbers, with every matrix product done by water.',
  tags: ['TypeScript', 'Three.js', 'WebGL', 'Physics', 'Simulation', 'Fluids', 'Analogue computing', 'Machine Learning', 'Transformers'],
  liveUrl: '/demos/water-gpt/',
  repoUrl: 'https://github.com/andeplane/andeplane.github.io/tree/main/demos/water-gpt',
  screenshot: '/projects/water-gpt/preview.png',
  screenshotAlt:
    'A glowing grid of brass valve wheels on transparent pipes. Reservoirs on the left feed the rows, and water falls from the columns into a row of glass collectors while a small GPT works out 23+45.',
  longDescription: `
Most of the arithmetic in a neural network is one operation: multiply a matrix by a vector. This
exhibit does that operation with water, then uses it to run a small language model.

## The hydraulic crossbar

Take a row of reservoirs. Each one holds water at a height, or **head**, x_i, and feeds a horizontal
manifold pipe. Across the manifolds run vertical **collector** columns, and wherever a manifold
crosses a column a thin pipe with a **valve** joins them. In a thin pipe the flow is laminar, so
the Hagen–Poiseuille law makes the flow proportional to the head difference: q = G_ji · x_i, where
the conductance G_ji is set by how far the valve is open. Each column drains into a collector held
near zero head. Water is conserved (Kirchhoff's current law for pipes), so a column's outflow is the
sum of everything its valves let in: **y_j = Σ_i G_ji x_i**. That is a whole matrix–vector product,
and every multiply and add happens at the same moment.

Valves and heads can't be negative, so signs are handled the same way as in electronic
crossbars. Every output has a **differential pair** of collectors and the answer is y⁺ − y⁻. A
signed input is split into an x⁺ reservoir and an x⁻ reservoir, and the x⁻ reservoir's valves are
swapped between the pair, so it subtracts.

This is the water version of **analog in-memory computing**. There, a grid of resistive memory
cells holds the weights as conductances, voltages on the rows are the inputs, and Ohm's and
Kirchhoff's laws sum the currents in each column. The weights never move. The computation happens
where they are stored.

## Honest about analogue error

Chapter 1 is a 4 × 4 crossbar you can play with. With ideal valves the water gives exactly W·x,
and the exhibit lets you make the machine worse in the three ways a real one is worse:

- **quantised valves**: each valve has a fixed number of stops (2^bits);
- **valve setting error**: every valve is set with a small random error that stays fixed;
- **manifold resistance**: the manifolds are pipes too, so the head sags along each row and
  builds up along each column. This is the hydraulic version of IR drop in a memory crossbar.

The manifold effect isn't approximated. The whole network of pipe segments and valves is solved
as a linear system (alternating exact line solves of every row and column chain), and the
solver's test suite checks it against a dense direct solve. Like a real crossbar, each tile is
calibrated once. Every reservoir is filled to full head, the collectors are measured, and each
collector gets a flowmeter gain. Because laminar flow is linear, the solved network of each tile
is stored as its as-built transfer matrix, by superposition, so later multiplies are exact for
that network.

## A GPT on crossbars

Chapter 2 runs [calc-gpt](/projects/calc-gpt), a 27 000-parameter GPT written from scratch in
TypeScript: 16-character vocabulary, 12-character context, 2 layers, 4 heads, 32-wide. Its forward
pass is ported here and trained offline, once, on two-digit addition, with a fixed 5% of all sums
held out. It reaches 99.8% on those 508 unseen sums (its one mistake is 0+0=1). A short
hardware-aware fine-tune then perturbs the weights with random valve errors during training, so
the model tolerates an imperfect machine. On the default build (6-bit valves, 0.5% valve error,
manifold resistance λ = 3·10⁻⁵) the water model also scores 99.8%. With 4-bit valves, 2% valve
error and narrower manifolds (the "Cheap" build) it drops to about 86%.

The valves were set at the factory from those trained weights. Nothing is trained in the browser. To calculate, you fill the tanks. Each character you type opens its reservoir in the
**embedding crossbar**, which pours its embedding row into the collectors. From there, water flows
through every weight matrix in turn: Q·K·V, the attention output, MLP up and MLP down in both
layers, and the output head. Matrices larger than 64 × 64 are split into tiles, each with its own
valve scale and calibration. Tiles that share outputs drain into the same collectors.

The same hardware is reprogrammable, so attention is done in water too. For the scores QKᵀ, the
valves are set on the fly from the keys and the query fills the reservoirs. For attention × V, the
valves are set from the values and the attention weights fill the reservoirs. The weights are
never negative, so those crossbars need no x⁻ reservoirs.

**What stays digital:** the glue between crossbars. Flowmeters read the collectors and regulators
set the next heads. LayerNorm, softmax, the 1/√d scale, the bias and residual additions, ReLU and
the final argmax are done digitally, and the exhibit marks them that way.

Beside every answer, the exhibit shows the water model's next-character probabilities next to the
exact digital model's, and it runs both on all held-out sums to report their accuracy.
`.trim(),
}

export default project
