import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "./",
  publicDir: false,
  plugins: [{
    name: "island-font-licenses",
    generateBundle() {
      for (const family of ["dm-sans", "fraunces", "pirata-one"]) {
        const filename = family + "-OFL.txt";
        const license = new URL("../public/assets/fonts/" + filename, import.meta.url);
        this.emitFile({type:"asset", fileName:"licenses/" + filename, source:readFileSync(license,"utf8")});
      }
    },
  }],
  server: { fs: { allow: [fileURLToPath(new URL("..", import.meta.url))] } },
  build: { target: "es2022", outDir: "dist", chunkSizeWarningLimit: 2400 },
});
