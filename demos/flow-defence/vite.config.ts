/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

// Built standalone at '/', or under /demos/flow-defence/ by the site's build-demos.mjs.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  // localStorage (level stars) is per-origin and the PORT is part of the
  // origin. Vite's default port-bumping (5173 busy -> 5174) silently moves
  // the dev server to a fresh origin and "loses" saved progress. Pin the
  // port and fail loudly instead of hopping.
  server: { port: 5174, strictPort: true },
  test: {
    // The LBM steady-state tests are wall-clock/CPU sensitive; running spec
    // files in parallel starves them and makes flux thresholds flaky.
    fileParallelism: false,
  },
})
