import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// The simulator is shared source in packages/quantum, compiled straight into
// this bundle rather than installed, so the alias and the dev-server allow
// list both have to reach outside the demo folder.
const quantum = fileURLToPath(new URL('../../packages/quantum/src/index.ts', import.meta.url))

export default defineConfig({
  base: process.env.BASE_PATH ?? '/demos/shor/',
  plugins: [react()],
  resolve: { alias: { '@andeplane/quantum': quantum } },
  server: { fs: { allow: ['.', '../../packages/quantum'] } },
  build: { target: 'es2022' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
