import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import { pirateBuildProvenance } from "./tools/pirateBuildProvenance";
import { privateAssets, usePrivatePearl } from "./tools/privateAssets";

export default defineConfig(({ mode }) => {
  const calculusIos = mode === "calculus-ios";
  const pearl = !calculusIos && usePrivatePearl(mode, process.cwd());
  const input: Record<string, string> = calculusIos
    ? { calculus: "math/index.html" }
    : { broadside: "index.html", calculus: "math/index.html" };
  return {
    plugins: [privateAssets(pearl, process.cwd()), pirateBuildProvenance(process.cwd(),pearl)],
    define: {
      "import.meta.env.PRIVATE_PEARL": JSON.stringify(pearl),
      "import.meta.env.PRIVATE_PEARL_MOBILE": JSON.stringify(pearl && existsSync(resolve('.private/black-pearl-mobile.glb'))),
    },
    base: loadEnv(mode, ".", "").BASE_PATH || "/",
    cacheDir: ".vite",
    server: { port: 5173, open: false },
    optimizeDeps: { include: ["@dimforge/rapier3d-compat"] },
    build: {
      target: "es2022", chunkSizeWarningLimit: 7000, outDir: "dist",
      rollupOptions: {
        input,
        output: {
          // Separate entry points must not run one another's Babylon startup.
          manualChunks: (id) => id.includes("/node_modules/@babylonjs/") ? "babylon" : undefined,
          onlyExplicitManualChunks: true,
        },
      },
    },
    test: {
      environment: "node",
      // Bound CPU contention between real WASM simulation and geometry tests.
      maxWorkers: process.env.CI ? 2 : 4,
      include: ["src/**/*.test.ts"],
      coverage: {
        provider: "v8",
        include: ["src/sim/**", "src/input/**", "src/game/**", "src/render/captainCamera.ts", "src/math/academy.ts"],
        exclude: ["**/*.test.ts"],
        thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
      },
    },
  };
});
