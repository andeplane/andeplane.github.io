import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages serves this from a repository subpath, so assets need the
  // prefix. `scripts/build-demos.mjs` sets BASE_PATH; the fallback keeps a
  // bare `vite preview` working.
  base: process.env.BASE_PATH ?? '/demos/heraion-samos/',
  server: { port: 5181, open: false },
  build: {
    target: 'es2022',
    // three.js is most of the bundle and there is nothing to lazily defer to.
    chunkSizeWarningLimit: 800,
  },
});
