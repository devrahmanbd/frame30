/**
 * Per-request CSP nonce store.
 *
 * Single-threaded Node.js: safe for per-request storage during SSR.
 * On the client this is always empty — nonces are server-only.
 */

let _nonce = "";

export const setCurrentNonce = (n: string) => { _nonce = n; };
export const getCurrentNonce = () => _nonce;

/**
 * Hydration-safe nonce for script tags. Server and client must render the
 * identical value or React flags #418 (nonce="abc" vs absent mismatches):
 * - server: the per-request store (real nonce, or undefined when unset —
 *   empty string would render as nonce="" and mismatch);
 * - client: the `<meta name="csp-nonce">` tag the server injects alongside
 *   nonce-bearing responses (module scripts run deferred, so the DOM is
 *   parsed when this evaluates).
 */
export const currentNonce = (): string | undefined => {
  if (typeof window === "undefined") return getCurrentNonce() || undefined;
  try {
    const content = document
      .querySelector('meta[name="csp-nonce"]')
      ?.getAttribute("content")
      ?.trim();
    return content || undefined;
  } catch {
    return undefined;
  }
};
