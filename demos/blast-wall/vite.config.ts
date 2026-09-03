import { defineConfig } from 'vite';

export default defineConfig({
  // The site build injects BASE_PATH=/demos/blast-wall/; the fallback keeps a standalone
  // `vite preview` working.
  base: process.env.BASE_PATH ?? '/demos/blast-wall/',
  build: { target: 'es2022' },
});
