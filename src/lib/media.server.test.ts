import { describe, expect, it, vi } from "vitest";
import { createPresignedUploadUrl, uploadMedia } from "./media.server";

let uploadedBytes: Uint8Array | null = null;

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    storage: {
      from: () => ({
        upload: vi.fn(async (_path: string, bytes: Uint8Array) => {
          uploadedBytes = bytes;
          return { data: { path: _path }, error: null };
        }),
        createSignedUploadUrl: vi.fn(async (path: string) => ({
          data: {
            signedUrl: `https://signed.test/${path}`,
            token: "tok-test",
          },
          error: null,
        })),
      }),
    },
  },
}));

describe("uploadMedia SVG sanitization (REPORT WF-13)", () => {
  it("strips malicious script tags from uploaded SVG before storage", async () => {
    uploadedBytes = null;
    const dirtySvg = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert('xss')</script><circle cx="50" cy="50" r="40"/></svg>`;
    const base64 = Buffer.from(dirtySvg, "utf-8").toString("base64");

    const item = await uploadMedia(
      "11111111-1111-4111-8111-111111111111",
      "test.svg",
      "image/svg+xml",
      base64,
    );

    expect(item.name.startsWith("test-")).toBe(true);
    expect(item.name.endsWith(".svg")).toBe(true);
    expect(uploadedBytes).not.toBeNull();
    const storedText = new TextDecoder().decode(uploadedBytes!);
    expect(storedText).not.toContain("<script>");
    expect(storedText).not.toContain("alert");
    expect(storedText).toContain("<circle");
  });
});

describe("createPresignedUploadUrl SVG guard", () => {
  const MERCHANT = "11111111-1111-4111-8111-111111111111";

  it("refuses to issue a presigned URL for SVG (must use the sanitising base64 path)", async () => {
    await expect(
      createPresignedUploadUrl(MERCHANT, "evil.svg", "image/svg+xml", 1024),
    ).rejects.toMatchObject({ code: "bad_type" });
  });

  it("refuses SVG regardless of content-type casing", async () => {
    await expect(
      createPresignedUploadUrl(MERCHANT, "evil.svg", "IMAGE/SVG+XML", 1024),
    ).rejects.toMatchObject({ code: "bad_type" });
  });

  it("still issues presigned URLs for legit raster images", async () => {
    const out = await createPresignedUploadUrl(
      MERCHANT,
      "photo.png",
      "image/png",
      1024,
    );
    expect(out.path.startsWith(`${MERCHANT}/`)).toBe(true);
    expect(out.path.endsWith(".png")).toBe(true);
    expect(out.signedUrl).toContain(out.path);
    expect(out.url.startsWith("/api/public/media/")).toBe(true);
  });
});
