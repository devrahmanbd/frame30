/**
 * Server half of the per-request CSP nonce read.
 *
 * The nonce is minted in `src/server.ts` and written onto the request as
 * `x-csp-nonce` BEFORE the TanStack handler runs. Reading it back through the
 * request's own async context keeps every document's scripts tied to the
 * nonce that document's CSP header allows — the module-level store is only a
 * fallback for calls made outside a request (unit tests, prerender).
 *
 * Why this exists (measured 2026-10-26): two concurrent SSR documents shared
 * one module-level nonce, so a document could emit its `window.$_TSR`
 * bootstrap inline script with the OTHER request's nonce. Chrome then blocked
 * the bootstrap (CSP `script-src 'nonce-<other>'`), TanStack threw
 * "Expected to find bootstrap data on window.$_TSR", and React unmounted the
 * page to a blank body. A 12-way concurrent probe reproduced a nonce mismatch
 * on 110/120 responses; a verbatim replay of one mismatched document produced
 * exactly that invariant and a blank body.
 *
 * `@tanstack/react-start/server` is blocked from the client graph by import
 * protection, which is why this lives in a `.server.ts` module and the
 * isomorphic `currentNonce()` reaches it through `createIsomorphicFn` (the
 * established `lang-boot.server.ts` pattern).
 */
import { getRequest } from "@tanstack/react-start/server";

export function readRequestNonce(): string | undefined {
  try {
    return getRequest().headers.get("x-csp-nonce")?.trim() || undefined;
  } catch {
    // No request context (prerender, unit test, client build): the caller
    // falls back to the module store, exactly as before this fix.
    return undefined;
  }
}
