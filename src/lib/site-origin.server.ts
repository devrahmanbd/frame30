/**
 * Public origin of the current request.
 *
 * Canonical URLs, Open Graph tags and JSON-LD must be absolute. We derive the
 * origin from the live request (honouring the forwarded proto/host set by the
 * edge) rather than baking a build-time constant, so preview, published and
 * custom-domain traffic each canonicalise to themselves. Returns null when no
 * request context exists, and callers then omit the absolute-URL tags entirely.
 */
import { getRequest } from "@tanstack/react-start/server";

export function requestOrigin(): string | null {
  try {
    const req = getRequest();
    if (!req) return null;
    const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? req.headers.get("host");
    if (host) return `${proto || new URL(req.url).protocol.replace(":", "")}://${host}`;
    return new URL(req.url).origin;
  } catch {
    return null;
  }
}
