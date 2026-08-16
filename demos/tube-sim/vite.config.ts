import { defineConfig } from 'vite';

export default defineConfig({
  // The site build injects BASE_PATH=/demos/tube-sim/; the fallback keeps a standalone
  // `vite preview` working.
  base: process.env.BASE_PATH ?? '/demos/tube-sim/',
  build: {
    target: 'es2022',
  },
});
