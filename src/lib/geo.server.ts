/**
 * Coarse request geography for analytics — server-side only.
 *
 * Why not read the MaxMind `.mmdb` files directly here: the request runtime is
 * a serverless edge worker with no real filesystem and a hard bundle budget,
 * and a GeoLite2-City database is far larger than that budget allows. So the
 * resolution order is:
 *
 *  1. Edge headers the platform already provides (`cf-ipcountry`,
 *     `x-vercel-ip-*`, `cf-*`, `x-geo-*`). Free, synchronous, no PII stored.
 *  2. `GEOIP_LOOKUP_URL` — an optional lookup service on the self-hosted node
 *     that owns the `.mmdb` files (GeoLite2-ASN / -City / -Country,
 *     ip-index.mmdb). It is asked with the caller IP and must answer with
 *     `{ country, region, city, asn, network }`. Timeout is short and a failure
 *     is silent: telemetry never delays or breaks a shopper's page.
 *
 * The caller IP itself is never persisted — only the coarse result is.
 */

export type RequestGeo = {
  countryCode: string;
  region: string;
  city: string;
  asn: number | null;
  network: string;
  deviceClass: "mobile" | "tablet" | "desktop" | "unknown";
};

const EMPTY: RequestGeo = {
  countryCode: "",
  region: "",
  city: "",
  asn: null,
  network: "",
  deviceClass: "unknown",
};

const LOOKUP_TIMEOUT_MS = 350;

export function clientIp(request: Request): string | null {
  const header =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for");
  if (!header) return null;
  return header.split(",")[0]!.trim().slice(0, 64) || null;
}

export function deviceClassOf(userAgent: string | null): RequestGeo["deviceClass"] {
  const ua = (userAgent ?? "").toLowerCase();
  if (!ua) return "unknown";
  if (/ipad|tablet|playbook|silk|kindle/.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|android.*mobile|windows phone/.test(ua)) return "mobile";
  if (/android/.test(ua)) return "tablet";
  return "desktop";
}

function clean(value: string | null, max: number) {
  return (value ?? "").trim().slice(0, max);
}

function headerGeo(request: Request): RequestGeo {
  const h = request.headers;
  const country = clean(
    h.get("cf-ipcountry") ?? h.get("x-vercel-ip-country") ?? h.get("x-geo-country"),
    2,
  ).toUpperCase();
  const asnRaw = clean(h.get("x-geo-asn") ?? h.get("cf-asn"), 12);
  const asn = /^\d+$/.test(asnRaw) ? Number(asnRaw) : null;
  return {
    countryCode: country === "XX" || country === "T1" ? "" : country,
    region: clean(h.get("x-vercel-ip-country-region") ?? h.get("cf-region") ?? h.get("x-geo-region"), 60),
    city: clean(h.get("x-vercel-ip-city") ?? h.get("cf-ipcity") ?? h.get("x-geo-city"), 80),
    asn,
    network: clean(h.get("x-geo-network") ?? h.get("cf-asorganization"), 80),
    deviceClass: deviceClassOf(h.get("user-agent")),
  };
}

type LookupAnswer = {
  country?: string | null;
  country_code?: string | null;
  region?: string | null;
  city?: string | null;
  asn?: number | string | null;
  network?: string | null;
};

/** Asks the self-hosted MMDB lookup service. Never throws, never blocks long. */
async function lookupGeo(ip: string): Promise<Partial<RequestGeo>> {
  const base = process.env["GEOIP_LOOKUP_URL"];
  if (!base) return {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const url = `${base}${base.includes("?") ? "&" : "?"}ip=${encodeURIComponent(ip)}`;
    const token = process.env["GEOIP_LOOKUP_TOKEN"];
    const res = await fetch(url, {
      signal: controller.signal,
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) return {};
    const body = (await res.json()) as LookupAnswer;
    const asnValue = Number(body.asn ?? NaN);
    return {
      countryCode: clean(body.country_code ?? body.country ?? "", 2).toUpperCase(),
      region: clean(body.region ?? "", 60),
      city: clean(body.city ?? "", 80),
      asn: Number.isFinite(asnValue) && asnValue > 0 ? Math.trunc(asnValue) : null,
      network: clean(body.network ?? "", 80),
    };
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolves the coarse geography for one request. Header values win because
 * they cost nothing; the lookup service only fills what the edge did not know.
 */
export async function requestGeo(request: Request): Promise<RequestGeo> {
  const fromHeaders = headerGeo(request);
  const needsLookup = !fromHeaders.countryCode || !fromHeaders.asn;
  if (!needsLookup || !process.env["GEOIP_LOOKUP_URL"]) return fromHeaders;

  const ip = clientIp(request);
  if (!ip) return fromHeaders;
  const extra = await lookupGeo(ip);
  return {
    ...fromHeaders,
    countryCode: fromHeaders.countryCode || (extra.countryCode ?? ""),
    region: fromHeaders.region || (extra.region ?? ""),
    city: fromHeaders.city || (extra.city ?? ""),
    asn: fromHeaders.asn ?? extra.asn ?? null,
    network: fromHeaders.network || (extra.network ?? ""),
  };
}

export const EMPTY_GEO = EMPTY;
