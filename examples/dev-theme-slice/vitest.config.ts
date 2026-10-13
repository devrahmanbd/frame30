import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["examples/dev-theme-slice/**/*.test.ts"],
  },
});
