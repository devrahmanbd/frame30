/**
 * Per-request CSP nonce store.
 *
 * Single-threaded Node.js: safe for per-request storage during SSR.
 * On the client this is always empty — nonces are server-only.
 */

let _nonce = "";

export const setCurrentNonce = (n: string) => {
  _nonce = n;
};
export const getCurrentNonce = () => _nonce;

/**
 * Hydration-safe nonce for script tags. Server and client must render the
 * identical value or React flags #418 (nonce="abc" vs absent mismatches):
 * - server: the per-request store (real nonce, or undefined when unset —
 *   empty string would render as nonce="" and mismatch);
 * - client: the csp-nonce meta tag the server injects alongside
 *   nonce-bearing responses — TanStack emits property="csp-nonce", our
 *   server gate emits name="csp-nonce"; accept either (module scripts run
 *   deferred, so the DOM is parsed when this evaluates).
 *
 * Client reads are cached: React re-renders <head> during hydration (pruning
 * server-injected metas and re-emitting TanStack head tags), so a per-render
 * DOM query can observe a transient empty/missing meta and mismatch the SSR
 * bytes. The first client read happens at router creation, before hydration
 * mutates <head>, so caching it pins the document's nonce for the session
 * (correct: the CSP nonce is per-document, SPA navigations reuse it).
 */
let _clientNonce: string | undefined | null = null;

export const currentNonce = (): string | undefined => {
  if (typeof window === "undefined") return getCurrentNonce() || undefined;
  if (_clientNonce !== null) return _clientNonce;
  try {
    const content = document
      .querySelector('meta[name="csp-nonce"], meta[property="csp-nonce"]')
      ?.getAttribute("content")
      ?.trim();
    _clientNonce = content || undefined;
  } catch {
    _clientNonce = undefined;
  }
  return _clientNonce;
};

/** Test-only: reset the cached client read between cases. */
export const resetClientNonceCache = () => {
  _clientNonce = null;
};
