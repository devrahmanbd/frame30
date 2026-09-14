/**
 * Edge image transform contract — §4.4 (imgproxy-compatible signing).
 *
 * Serving arbitrary remote URLs through a resizer is a classic SSRF, and an
 * unsigned resizer is a free CPU faucet an attacker can point at your bill. So
 * every transform URL is (a) restricted to an allow-listed host and (b) signed
 * with an HMAC over the exact path, meaning the set of renderable variants is
 * fixed at link-generation time.
 *
 * Pure module: builds and verifies the contract, performs no I/O, so the rules
 * are testable without a network.
 */

export type ImageFormat = "avif" | "webp" | "jpeg" | "png";

export type TransformSpec = {
  width: number;
  height: number;
  /** `fit` letterboxes, `cover` crops, `inside` never upscales. */
  resize: "fit" | "cover" | "inside";
  quality: number;
  format: ImageFormat | "auto";
};

/** Descriptor a component needs to render a responsive `<img>`. Pure data. */
export type ResponsiveImage = {
  src: string;
  srcSet: string;
  sizes: string;
  width: number;
  height: number;
};

export const DEFAULT_SPEC: TransformSpec = {
  width: 800,
  height: 0,
  resize: "inside",
  quality: 78,
  format: "auto",
};

/** Discrete ladder: unbounded widths would make the CDN cache useless. */
export const WIDTH_LADDER = [64, 128, 256, 384, 512, 640, 768, 1024, 1280, 1600, 1920] as const;

export function snapWidth(requested: number) {
  const w = Math.max(1, Math.trunc(requested));
  for (const step of WIDTH_LADDER) if (w <= step) return step;
  return WIDTH_LADDER[WIDTH_LADDER.length - 1]!;
}

export function normalizeSpec(input: Partial<TransformSpec>): TransformSpec {
  const format = input.format ?? "auto";
  return {
    width: snapWidth(input.width ?? DEFAULT_SPEC.width),
    height: Math.min(1920, Math.max(0, Math.trunc(input.height ?? 0))),
    resize: input.resize === "fit" || input.resize === "cover" ? input.resize : "inside",
    quality: Math.min(95, Math.max(30, Math.trunc(input.quality ?? DEFAULT_SPEC.quality))),
    format:
      format === "avif" || format === "webp" || format === "jpeg" || format === "png"
        ? format
        : "auto",
  };
}

/**
 * Format negotiation from `Accept`. AVIF first (roughly 30% smaller than WebP
 * at the same quality on product photography), WebP next, JPEG as the floor
 * every browser understands. PNG is only ever served when explicitly asked for,
 * because auto-selecting it on photos triples the bytes.
 */
export function negotiateFormat(accept: string | null, requested: ImageFormat | "auto"): ImageFormat {
  if (requested !== "auto") return requested;
  const a = (accept ?? "").toLowerCase();
  if (a.includes("image/avif")) return "avif";
  if (a.includes("image/webp")) return "webp";
  return "jpeg";
}

export function contentTypeFor(format: ImageFormat) {
  return format === "jpeg" ? "image/jpeg" : `image/${format}`;
}

/* --------------------------------------------------------------- path coding */

export function encodeSpec(spec: TransformSpec) {
  const s = normalizeSpec(spec);
  return `w${s.width}_h${s.height}_${s.resize}_q${s.quality}_${s.format}`;
}

export function decodeSpec(segment: string): TransformSpec | null {
  const m = /^w(\d+)_h(\d+)_(fit|cover|inside)_q(\d+)_(avif|webp|jpeg|png|auto)$/.exec(segment);
  if (!m) return null;
  return normalizeSpec({
    width: Number(m[1]),
    height: Number(m[2]),
    resize: m[3] as TransformSpec["resize"],
    quality: Number(m[4]),
    format: m[5] as TransformSpec["format"],
  });
}

/** Base64url so the source URL survives a path segment without re-encoding. */
export function encodeSource(url: string) {
  const bytes = new TextEncoder().encode(url);
  let bin = "";
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeSource(encoded: string): string | null {
  try {
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/**
 * SSRF guard. Anything not on the allow-list is refused before a request is
 * made, and the literal-IP check blocks the metadata endpoint, loopback and
 * private ranges even if an allow-listed hostname were ever pointed at them.
 */
export function isAllowedSource(rawUrl: string, allowedHosts: readonly string[]) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false as const, reason: "bad_url" };
  }
  if (url.protocol !== "https:") return { ok: false as const, reason: "not_https" };
  if (url.username || url.password) return { ok: false as const, reason: "credentials_in_url" };

  const host = url.hostname.toLowerCase();
  if (/^\[?[0-9a-f:.]+\]?$/i.test(host) && !/^[a-z]/i.test(host)) {
    return { ok: false as const, reason: "literal_ip" };
  }
  const allowed = allowedHosts.some(
    (h) => host === h.toLowerCase() || host.endsWith(`.${h.toLowerCase()}`),
  );
  if (!allowed) return { ok: false as const, reason: "host_not_allowed" };
  return { ok: true as const, url };
}

export function signaturePayload(specSegment: string, sourceSegment: string) {
  return `/${specSegment}/${sourceSegment}`;
}

/**
 * Constant-time compare. A plain `===` on a signature leaks length and prefix
 * timing, which is enough to forge one given patience.
 */
export function safeEqualHex(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** How long a rendered variant may sit in a shared cache. */
export function cacheControlFor(ok: boolean) {
  return ok
    ? // Immutable: the signature pins both source and spec, so a URL can never
      // mean a different image later.
      "public, max-age=31536000, immutable"
    : "public, max-age=60";
}
