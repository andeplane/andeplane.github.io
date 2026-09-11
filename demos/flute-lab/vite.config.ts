import { defineConfig } from "vite";
export default defineConfig({
  base: process.env.BASE_PATH ?? "/demos/flute-lab/",
  build: { target: "es2022" },
});
