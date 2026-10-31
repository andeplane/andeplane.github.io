import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'water-buckets',
  title: 'Bucket LLM',
  description: 'Explore an editable Ax + b using volumes of water. Positive and negative collectors make signed matrix arithmetic visible; a welcome guide introduces the operations needed for a water transformer.',
  tags: ['TypeScript', 'Three.js', 'Physics', 'Simulation', 'Analogue computing', 'AI'],
  liveUrl: '/demos/water-buckets/',
  repoUrl: 'https://github.com/andeplane/andeplane.github.io/tree/main/demos/water-buckets',
  screenshot: '/projects/water-buckets/preview.png',
  screenshotAlt: 'An editable two-by-two matrix beside water input buckets and positive and negative output collectors.',
  longDescription: `
A connected, volume-based companion to Water GPT. Resize **A** from 1×1 to 4×4,
edit **A**, **x** and **b**, and inspect the complete stationary machine before
pressing Pour. Input water divides through weighted branches into intermediate
buckets, then pours into the signed output pairs alongside the bias water.

All water comes from the visible loaded buckets. Split fractions use a common
normalization, and calibrated height rulers recover **Ax + b**. A spare-water
bucket catches unused fractions. The ideal network tracks water through its
pipes and conserves the total throughout a run.

A small welcome modal introduces the operations needed for a transformer.
Calc-GPT execution and sequential matrix layers are future work. The original
water demos remain separate.
`.trim(),
}

export default project
