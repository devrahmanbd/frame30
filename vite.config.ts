import { defineConfig, type UserConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import browserslistToEsbuild from "browserslist-to-esbuild";
import { fileURLToPath } from "node:url";

export default defineConfig(async ({ command }): Promise<UserConfig> => {
  const plugins: any[] = [
    tanstackStart({
      server: { entry: "server" },
      // Per-route code splitting: without this the route tree eagerly
      // imports every route file, so the first dashboard load downloads the
      // entire app (builder, marketing, blog, storefront…) and the main
      // thread blocks for seconds parsing it. Components split by default;
      // loaders are split too so route data-fetching graphs (server-fn
      // stubs, validators, schemas) also load on navigation, not upfront.
      // `head` cannot split (needed synchronously) — keep those imports lean.
      // The Start plugin always registers the code splitter; only
      // `codeSplittingOptions` is configurable here (no `autoCodeSplitting`
      // key in this plugin version — it is stripped from the options).
      router: {
        codeSplittingOptions: {
          defaultBehavior: [
            ["component"],
            ["loader"],
            ["errorComponent"],
            ["notFoundComponent"],
          ],
        },
      },
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
      // NOTE: no manualChunks — a manualChunks function collapsed the
      // framework shared chunks back into the entry (770KB → 1.49MB in a
      // local build). The TanStack code splitter already separates route
      // components; vendor chunking needs rolldown advancedChunks instead
      // (follow-up, verify entry size before shipping).
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
