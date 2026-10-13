import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["examples/demo-theme/**/*.test.ts"],
  },
});
