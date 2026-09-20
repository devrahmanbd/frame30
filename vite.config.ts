import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import browserslistToEsbuild from "browserslist-to-esbuild";
import { fileURLToPath } from "node:url";

export default defineConfig(async ({ command }) => {
  const plugins: any[] = [
    tanstackStart({
      server: { entry: "server" },
      // Per-route code splitting: without this the route tree eagerly
      // imports every route file, so the first dashboard load downloads the
      // entire app (builder, marketing, blog, storefront…) and the main
      // thread blocks for seconds parsing it. With splitting, each route
      // becomes its own chunk loaded on navigation.
      router: { autoCodeSplitting: true },
    }),
  ];

  if (command === "build") {
    try {
      const { nitro } = await import("nitro/vite");
      plugins.push(nitro({ defaultPreset: "node-server" }));
    } catch {
      // optional
    }
  }

  plugins.push(viteReact(), tailwindcss(), tsconfigPaths());

  return {
    server: {
      port: 3000,
      host: "0.0.0.0",
      allowedHosts: true,
      hmr: process.env.DISABLE_HMR !== "true",
      watch: process.env.DISABLE_HMR === "true" ? null : {},
    },

    build: {
      target: browserslistToEsbuild(),
    },
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    plugins,
  };
});
