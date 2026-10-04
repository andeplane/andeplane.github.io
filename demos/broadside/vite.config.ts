import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import { privateAssets, usePrivatePearl } from "./tools/privateAssets";

export default defineConfig(({ mode }) => {
  const pearl = usePrivatePearl(mode, process.cwd());
  return {
    plugins: [privateAssets(pearl, process.cwd())],
    define: { "import.meta.env.PRIVATE_PEARL": JSON.stringify(pearl) },
    base: loadEnv(mode, ".", "").BASE_PATH || "/",
    server: { port: 5173, open: true },
    build: { target: "es2022", chunkSizeWarningLimit: 7000, outDir: "dist" },
    test: {
      environment: "node",
      include: ["src/**/*.test.ts"],
      coverage: {
        provider: "v8",
        include: ["src/sim/**", "src/input/**", "src/game/**"],
        exclude: ["**/*.test.ts"],
        thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
      },
    },
  };
});
