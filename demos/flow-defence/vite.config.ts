import { defineConfig } from 'vite'

// Built standalone at '/', or under /demos/flow-defence/ by the site's build-demos.mjs.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
})
