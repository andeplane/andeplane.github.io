import { defineConfig } from 'vite';

export default defineConfig({
  // The site build injects BASE_PATH=/demos/ising/; the fallback keeps a standalone
  // `vite preview` working.
  base: process.env.BASE_PATH ?? '/demos/ising/',
  build: {
    target: 'es2022',
  },
});
