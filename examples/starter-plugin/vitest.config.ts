import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["examples/starter-plugin/tests/**/*.test.ts"],
  },
});
