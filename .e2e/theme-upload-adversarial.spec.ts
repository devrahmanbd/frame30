import { test, expect, type APIRequestContext } from "@playwright/test";
import { blockExternalRequests } from "./helpers";

/**
 * Adversarial theme-upload spec (a).
 *
 * Verified 2026-10-11 against the dev server: there is NO unauthenticated
 * HTTP theme-ZIP upload surface. Theme/plugin install flows go through
 * authenticated dashboard server functions (session required); the public
 * REST gateway demands `Authorization: Bearer` (401 without it) and the
 * media endpoint is GET-only (other methods fall through to the not-found
 * document). So this spec takes the task's else-branch on the HTTP side —
 * proving the traversal ZIP is never accepted anonymously — AND the
 * preview side: a hostile preview URL must render nothing executable.
 *
 * - Builds a minimal stored ZIP in-test (no deps) with a `../../evil.json`
 *   path-traversal entry, POSTs it as multipart to every plausible public
 *   upload path, and asserts none of them accept it as a package.
 * - Loads /theme-preview/songoskriti with script/event-handler payloads in
 *   every reflected search slot and asserts zero execution.
 * - Hermetic: localhost only. Cleanup: the extra API context is disposed
 *   in afterAll; the dev server is owned by webServer / README.
 */

export const TRAVERSAL_ENTRY = "../../evil.json";

const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++)
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data)
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Minimal stored (method 0) ZIP with a single hostile entry. No deps. */
export function buildTraversalZip(entryName = TRAVERSAL_ENTRY): Buffer {
  const name = new TextEncoder().encode(entryName);
  const data = new TextEncoder().encode('{"pwned":true}');
  const crc = crc32(data);
  const headerLen = 30 + name.length;
  const centralLen = 46 + name.length;
  const total = headerLen + data.length + centralLen + 22;
  const buf = new Uint8Array(total);
  const view = new DataView(buf.buffer);
  let p = 0;
  const u16 = (v: number): void => {
    view.setUint16(p, v, true);
    p += 2;
  };
  const u32 = (v: number): void => {
    view.setUint32(p, v, true);
    p += 4;
  };
  // Local file header.
  u32(0x04034b50);
  u16(20);
  u16(0);
  u16(0);
  u16(0);
  u16(0);
  u32(crc);
  u32(data.length);
  u32(data.length);
  u16(name.length);
  u16(0);
  buf.set(name, p);
  p += name.length;
  buf.set(data, p);
  p += data.length;
  const centralOffset = p;
  // Central directory entry.
  u32(0x02014b50);
  u16(20);
  u16(20);
  u16(0);
  u16(0);
  u16(0);
  u16(0);
  u32(crc);
  u32(data.length);
  u32(data.length);
  u16(name.length);
  u16(0);
  u16(0);
  u16(0);
  u16(0);
  u32(0);
  u32(0);
  buf.set(name, p);
  p += name.length;
  // End of central directory.
  u32(0x06054b50);
  u16(0);
  u16(0);
  u16(1);
  u16(1);
  u32(centralLen);
  u32(centralOffset);
  u16(0);
  return Buffer.from(buf);
}

const CANDIDATE_UPLOAD_PATHS = [
  "/api/public/v1/themes/upload",
  "/api/public/v1/upload",
  "/api/public/themes/upload",
  "/api/public/media/upload",
  "/api/themes/upload",
];

let anon: APIRequestContext | null = null;

test.afterAll(async () => {
  await anon?.dispose();
  anon = null;
});

test("malicious theme ZIP is never accepted without auth", async ({
  playwright,
}) => {
  anon = await playwright.request.newContext();
  const zip = buildTraversalZip();
  // Sanity: the fixture really is a traversal ZIP (magic + hostile name).
  expect(zip[0]).toBe(0x50);
  expect(zip[1]).toBe(0x4b);
  expect(zip.includes(TRAVERSAL_ENTRY)).toBe(true);

  for (const path of CANDIDATE_UPLOAD_PATHS) {
    const res = await anon.post(path, {
      timeout: 45_000,
      multipart: {
        file: {
          name: "evil-theme.zip",
          mimeType: "application/zip",
          buffer: zip,
        },
      },
    });
    const contentType = res.headers()["content-type"] ?? "";
    // JSON error envelopes include application/problem+json.
    if (contentType.includes("json")) {
      const body = (await res.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;
      // A JSON API must answer with an error envelope (401 auth / 404
      // unknown route / 4xx validation) — never an install receipt.
      expect(res.status()).toBeGreaterThanOrEqual(400);
      expect(body).not.toBeNull();
      expect(body).not.toHaveProperty("themeId");
      expect(body).not.toHaveProperty("installed");
    } else {
      // HTML answers are router shells: the not-found document for unknown
      // routes, or a matched-route empty document when the route defines
      // no handler for POST (verified: /api/public/media/* is GET-only,
      // so POST renders the route shell with status 200 and no body).
      // Either way no upload handler ran — assert the hostile entry is
      // nowhere reflected and no install-receipt shape is present.
      const text = await res.text();
      expect(text).not.toContain(TRAVERSAL_ENTRY);
      expect(text).not.toMatch(/themeId|"installed"|upload complete|uploaded/i);
    }
  }

  // Nothing materialized: the hostile entry is not retrievable anywhere.
  for (const probe of ["/evil.json", "/api/public/media/evil.json"]) {
    const res = await anon.get(probe, { timeout: 30_000 });
    expect(res.status()).toBe(404);
  }
});

test("hostile preview URL renders nothing executable", async ({ page }) => {
  const blocked: string[] = [];
  await blockExternalRequests(page, blocked);
  const marker = "__pwned_e2e";
  const hostile =
    "/theme-preview/songoskriti" +
    `?template=<script>window.${marker}="template"</script>` +
    `&focus=<img src=x onerror="window.${marker}='focus'">` +
    `&q="><svg onload="window.${marker}='q'">` +
    `&max="><script>window.${marker}="max"</script>` +
    `&variation=<script>window.${marker}="variation"</script>`;
  const response = await page.goto(hostile, {
    waitUntil: "domcontentloaded",
    // Cold-sensitive first navigation only (see theme-preview-isolation
    // spec): SSR compile budget lives on this goto alone; assertions below
    // keep their strict timeouts.
    timeout: 180_000,
  });
  // The route itself stays servable (unknown keys are sanitized, not fatal).
  expect(response?.status()).toBe(200);

  // No payload reached a script element …
  await expect(
    page.locator("script", { hasText: marker }),
    "no script element may contain the hostile marker",
  ).toHaveCount(0);
  // … no event-handler attribute was born from the payload …
  await expect(
    page.locator(`[onerror*="${marker}"], [onload*="${marker}"]`),
    "no handler attribute may contain the hostile marker",
  ).toHaveCount(0);
  // … and nothing executed.
  const executed = await page.evaluate(
    (key) =>
      (window as unknown as Record<string, unknown>)[key] ?? null,
    marker,
  );
  expect(executed).toBeNull();
});
