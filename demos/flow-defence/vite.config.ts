/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

// Built standalone at '/', or under /demos/flow-defence/ by the site's build-demos.mjs.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  test: {
    // The LBM steady-state tests are wall-clock/CPU sensitive; running spec
    // files in parallel starves them and makes flux thresholds flaky.
    fileParallelism: false,
  },
})
