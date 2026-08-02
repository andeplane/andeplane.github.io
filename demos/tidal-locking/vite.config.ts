import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages serves this from a repository subpath, so assets need the prefix.
  // Overridable for local `vite preview` and for any other host.
  base: process.env.BASE_PATH ?? '/moon-tidal-lock/',
  build: {
    target: 'es2022',
    // three.js is most of the bundle and there is nothing to lazily defer to.
    chunkSizeWarningLimit: 800,
  },
});
