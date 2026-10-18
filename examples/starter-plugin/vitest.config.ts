import { defineConfig } from "vitest/config";

export default defineConfig({
  // Anchor the project to this folder so the suite runs both ways:
  //   cd examples/starter-plugin && npx vitest run
  //   npx vitest run --config examples/starter-plugin/vitest.config.ts
  root: import.meta.dirname,
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
