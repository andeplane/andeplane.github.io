import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'calc-gpt',
  title: 'calc-gpt',
  description:
    'An interactive blog post where a tiny GPT learns arithmetic live in your tab — hand-written backprop, no ML libraries, then the same model is taught subtraction without starting over.',
  tags: ['TypeScript', 'Machine Learning', 'Transformers', 'Vite', 'Interactive Essay'],
  liveUrl: 'https://andeplane.github.io/calc-gpt/',
  repoUrl: 'https://github.com/andeplane/calc-gpt',
  screenshot: '/projects/calc-gpt/preview.png',
  longDescription: `
Language models feel magical partly because natural language is messy. This project strips
the magic to its skeleton: a language with sixteen characters, where every sentence looks
like \`23+45=68;\`. It has grammar, it has meaning — the part after \`=\` is entailed by the
part before — and you can generate unlimited perfect training data with two random numbers
and a plus sign.

The blog post trains a two-layer GPT with about 27,000 parameters **live in your browser
tab**: embeddings, causal self-attention, the backward pass, and Adam, all written from
scratch in TypeScript on \`Float32Array\`s. No ML library, no autograd, no server. You watch
the loss fall from ln(16) — uniform guessing — as the model discovers digits, then place
value, then carrying, and you can query the live weights mid-training.

## The curriculum trick

The vocabulary ships with \`-\`, \`*\` and \`/\` from day one, even though phase 1 trains only
on addition. Those embedding rows sit there randomly initialized — words the model has
never heard. Clicking "add subtraction" changes only the data mix: same weights, same
optimizer state, same tokenizer. Addition accuracy dips while capacity reorganizes, then
recovers, while a subtraction curve climbs from zero — including negative answers like
\`3-47=-44;\`, where the same token serves as operator and sign.

## Engineering

The engine is dependency-injected throughout — RNG, data generators, optimizer, metrics
sink, even the model behind an interface — and carries a 100% test-coverage gate in CI
(statements, branches, functions, lines). The centerpiece test perturbs every parameter
tensor and compares numerical gradients against the hand-derived backward pass, so if any
equation in the post were coded wrong, CI would go red. A line-for-line numpy twin ships in
the repo for Python readers.
  `.trim(),
}

export default project
