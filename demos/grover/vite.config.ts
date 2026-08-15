import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // GitHub Pages serves this from a subpath of the main site, so assets need
  // the prefix. Overridable for local `vite preview` and any other host.
  base: process.env.BASE_PATH ?? '/demos/grover/',
  plugins: [react()],
  build: {
    target: 'es2022',
    // KaTeX + React are most of the bundle and nothing defers usefully.
    chunkSizeWarningLimit: 800,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
