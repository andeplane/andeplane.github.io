import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The site build injects BASE_PATH=/demos/water-tanks/; the fallback keeps a standalone
  // `vite preview` working.
  base: process.env.BASE_PATH ?? '/demos/water-tanks/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
