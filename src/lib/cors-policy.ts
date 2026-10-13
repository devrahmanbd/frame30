/**
 * Single CORS origin policy for credentialed public API routes.
 *
 * Fail-closed contract: an allowlisted storefront origin is echoed back
 * (with credentials); anything else — missing origin, malformed value,
 * foreign host — resolves to null and the caller MUST omit both
 * `access-control-allow-origin` and `access-control-allow-credentials`.
 * Emitting `*` alongside `credentials: true` is a Fetch-spec violation
 * that only browsers paper over; the server must not depend on that.
 */
export function resolveAllowedOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  try {
    const { hostname } = new URL(origin);
    if (
      hostname.endsWith(".framique.store") ||
      hostname.endsWith(".framique.com") ||
      hostname === "framique.qubickle.com" ||
      hostname === "localhost"
    ) {
      return origin;
    }
  } catch {
    /* malformed origin — not allowlisted */
  }
  return null;
}
