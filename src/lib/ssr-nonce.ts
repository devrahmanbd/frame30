/**
 * Hydration-safe CSP nonce.
 *
 * The authoritative value is per request: `src/server.ts` mints a fresh nonce
 * and puts it on the request (`x-csp-nonce`) before SSR. `currentNonce()`
 * reads it back through the request's async context on the server, so a
 * concurrent document can never make this one emit a script with another
 * document's nonce (measured 2026-10-26: the shared module store mismatched
 * 110/120 concurrent documents; Chrome blocked `window.$_TSR` and the page
 * went blank).
 *
 * The module store below is only a fallback for calls with no request context
 * (unit tests, prerender). On the client the nonce comes from the csp-nonce
 * meta tag — TanStack emits property="csp-nonce", our server gate emits
 * name="csp-nonce"; accept either (module scripts run deferred, so the DOM is
 * parsed when this evaluates).
 *
 * Client reads are cached: React re-renders <head> during hydration (pruning
 * server-injected metas and re-emitting TanStack head tags), so a per-render
 * DOM query can observe a transient empty/missing meta and mismatch the SSR
 * bytes. The first client read happens at router creation, before hydration
 * mutates <head>, so caching it pins the document's nonce for the session
 * (correct: the CSP nonce is per-document, SPA navigations reuse it).
 */
import { createIsomorphicFn } from "@tanstack/react-start";
import { readRequestNonce } from "./ssr-nonce.server";

let _nonce = "";

export const setCurrentNonce = (n: string) => {
  _nonce = n;
};
export const getCurrentNonce = () => _nonce;

/**
 * Server-only: the nonce minted for THIS document. The request header wins
 * over the module store; the store is the fallback outside a request.
 */
const requestNonce = createIsomorphicFn()
  .client((): string | undefined => undefined)
  .server((): string | undefined => readRequestNonce());

let _clientNonce: string | undefined | null = null;

export const currentNonce = (): string | undefined => {
  if (typeof window === "undefined")
    return requestNonce() ?? (getCurrentNonce() || undefined);
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
