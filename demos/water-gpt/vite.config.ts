import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The site build injects BASE_PATH=/demos/water-gpt/; the fallback keeps a standalone
  // `vite preview` working. BASE_PATH=./ gives a build with relative asset URLs.
  base: process.env.BASE_PATH ?? '/demos/water-gpt/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 30000,
  },
});
