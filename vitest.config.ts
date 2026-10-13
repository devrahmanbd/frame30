import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "openapi/**/*.test.ts", "examples/starter-theme/*.test.ts"],
    passWithNoTests: true,
    testTimeout: 30_000,
  },
});
