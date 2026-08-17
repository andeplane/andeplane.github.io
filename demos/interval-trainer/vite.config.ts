import { defineConfig } from 'vite';

export default defineConfig({
  // The site build injects BASE_PATH=/demos/interval-trainer/; the fallback keeps a
  // standalone `vite preview` working.
  base: process.env.BASE_PATH ?? '/demos/interval-trainer/',
  build: {
    target: 'es2022',
    // The aurora backdrop is a real file, not a data URI — it is far too large to inline
    // and the browser should be able to cache it separately from the bundle.
    assetsInlineLimit: 4096,
  },
});
