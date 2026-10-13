import { defineConfig } from 'vite';

export default defineConfig({
  // The site build injects BASE_PATH=/demos/ripple-computer/; the fallback keeps a
  // standalone `vite preview` working.
  base: process.env.BASE_PATH ?? '/demos/ripple-computer/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
  worker: { format: 'es' },
});
