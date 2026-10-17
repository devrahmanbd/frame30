import type { Plugin } from "vite";

/**
 * Dev-only workaround for an upstream TanStack Start bug.
 *
 * `createClientRpc` (in `@tanstack/start-client-core`) reads
 * `process.env.TSS_SERVER_FN_BASE` when a server-fn stub module initializes
 * (module scope, before any call). The Start plugin emits that key through
 * Vite's `define`, but Vite does not apply `define` to raw-served
 * `optimizeDeps`-excluded framework files in dev, so the bare `process.env`
 * reference reaches the browser and every module that builds a server-fn stub
 * before something else defines `process` crashes with
 * `ReferenceError: process is not defined` — import-order dependent, hence
 * flaky page loads (TanStack/router#7414). Production builds replace the
 * literal at build time; this rewrite closes the dev-only race with the exact
 * value the Start plugin resolved through `define`.
 */

export const TSS_SERVER_FN_BASE_KEY = "process.env.TSS_SERVER_FN_BASE";

/** The only client-reachable framework package that carries the bare key. */
const TSS_CLIENT_CORE_ID_MARKER = "@tanstack/start-client-core";

/**
 * Rewrite the bare define key in framework client modules.
 *
 * Returns the rewritten code, or `null` when the module must be served
 * untouched (non-framework id, SSR transform, or no resolved value).
 */
export function rewriteTssServerFnBase(
  code: string,
  id: string,
  options: { ssr?: boolean } | undefined,
  replacement: string | null,
): string | null {
  if (replacement === null || options?.ssr) return null;
  if (!id.includes(TSS_CLIENT_CORE_ID_MARKER)) return null;
  if (!code.includes(TSS_SERVER_FN_BASE_KEY)) return null;
  // Function replacement: the resolved define literal is inserted verbatim,
  // so `$` sequences in a custom base path are never interpreted.
  return code.replaceAll(TSS_SERVER_FN_BASE_KEY, () => replacement);
}

/**
 * Vite dev plugin applying {@link rewriteTssServerFnBase} with the Start
 * plugin's own resolved `define` value (read after config resolution, so a
 * custom `serverFns.base` stays authoritative).
 */
export function tssServerFnBaseDevTransform(): Plugin {
  let replacement: string | null = null;
  return {
    name: "frame30:tss-server-fn-base-dev-transform",
    apply: "serve",
    configResolved(config) {
      const value = config.define?.[TSS_SERVER_FN_BASE_KEY];
      replacement = typeof value === "string" ? value : null;
    },
    transform(code, id, options) {
      const rewritten = rewriteTssServerFnBase(code, id, options, replacement);
      return rewritten === null ? null : { code: rewritten, map: null };
    },
  };
}
