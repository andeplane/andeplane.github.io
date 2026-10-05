import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import { privateAssets, usePrivatePearl } from "./tools/privateAssets";

export default defineConfig(({ mode }) => {
  const pearl = usePrivatePearl(mode, process.cwd());
  return {
    plugins: [privateAssets(pearl, process.cwd())],
    define: {
      "import.meta.env.PRIVATE_PEARL": JSON.stringify(pearl),
      "import.meta.env.PRIVATE_PEARL_MOBILE": JSON.stringify(pearl && existsSync(resolve('.private/black-pearl-mobile.glb'))),
    },
    base: loadEnv(mode, ".", "").BASE_PATH || "/",
    server: { port: 5173, open: false },
    build: { target: "es2022", chunkSizeWarningLimit: 7000, outDir: "dist" },
    test: {
      environment: "node",
      // Bound CPU contention between real WASM simulation and geometry tests.
      maxWorkers: 4,
      include: ["src/**/*.test.ts"],
      coverage: {
        provider: "v8",
        include: ["src/sim/**", "src/input/**", "src/game/**", "src/render/captainCamera.ts"],
        exclude: ["**/*.test.ts"],
        thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
      },

    },
  };
});
