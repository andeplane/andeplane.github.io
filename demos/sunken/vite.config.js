import { defineConfig } from 'vite';

export default defineConfig( {
	// GitHub Pages serves this from a repository subpath, so assets need the
	// prefix. `scripts/build-demos.mjs` sets BASE_PATH; the fallback keeps a
	// bare `vite preview` working.
	base: process.env.BASE_PATH ?? '/demos/sunken/',
	server: { port: 5180, open: false },
	worker: { format: 'es' },
	build: {
		target: 'esnext',
		// three.js is most of the bundle and there is nothing to lazily defer to.
		chunkSizeWarningLimit: 2000,
	},
	optimizeDeps: { include: [ 'three/webgpu', 'three/tsl' ] },
} );
