import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// Pages: index.html (the crossbar app) when present, and big.html (the hall of valves:
// GPT-2 / TinyStories on water). Weights are never bundled: they stream from Hugging Face.
const pages = ['index.html', 'big.html'].filter((p) => existsSync(resolve(__dirname, p)))

export default defineConfig({
  // The site build injects BASE_PATH=/demos/water-gpt/; the fallback keeps a
  // standalone `vite preview` working.
  base: process.env.BASE_PATH ?? '/demos/water-gpt/',
  build: {
    target: 'es2022',
    rollupOptions: {
      input: Object.fromEntries(pages.map((p) => [p.replace('.html', ''), resolve(__dirname, p)])),
    },
  },
})
