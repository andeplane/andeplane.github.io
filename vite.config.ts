import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  optimizeDeps: {
    entries: ['src/**/*.{ts,tsx}'],
  },
  server: {
    watch: {
      // Only the top-level projects/ checkouts — a bare '**/projects/**'
      // would also ignore src/content/projects and src/components/projects,
      // making the dev server serve stale modules for those files.
      ignored: [new URL('./projects/**', import.meta.url).pathname],
    },
  },
})
