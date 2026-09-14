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

  plugins.push(
    viteReact(),
    tailwindcss(),
    tsconfigPaths(),
  );

  return {
    server: { port: 3000, host: '0.0.0.0', allowedHosts: true, hmr: process.env.DISABLE_HMR !== 'true', watch: process.env.DISABLE_HMR === 'true' ? null : {} },
    
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
