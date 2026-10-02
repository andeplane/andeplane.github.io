import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  base: loadEnv(mode, ".", "").BASE_PATH || "/",
  server: { port: 5173, open: true },
  build: { target: "es2022", chunkSizeWarningLimit: 7000 },
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
}));
