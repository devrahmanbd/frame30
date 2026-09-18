/**
 * Per-request CSP nonce store.
 *
 * Single-threaded Node.js: safe for per-request storage during SSR.
 * On the client this is always empty — nonces are server-only.
 */

let _nonce = "";

export const setCurrentNonce = (n: string) => { _nonce = n; };
export const getCurrentNonce = () => _nonce;
