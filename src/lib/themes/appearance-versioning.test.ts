/**
 * Frame30 item 13 (extension versioning + recovery) — Pass 1 regression
 * proof for the theme upload lane.
 *
 * `installUploadedTheme` runs the real PKG-1 theme gate before the replay
 * lookup or any write, so an upload whose builder-API range the running
 * builder cannot satisfy is refused with `theme.upload_manifest` and lands
 * nothing. This pins the installation-time compat rule for the upload path
 * (the pipeline path pins the same rule in `package-install.test.ts`).
 */
import { describe, expect, it } from "vitest";
import { fakeDb } from "../__fixtures__/fake-db";
import { installUploadedTheme } from "./appearance.server";

const MERCHANT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const enc = new TextEncoder();
const u16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff];
const u32 = (v: number) => [
  v & 0xff,
  (v >>> 8) & 0xff,
  (v >>> 16) & 0xff,
  (v >>> 24) & 0xff,
];

function buildZip(entries: { name: string; content: string }[]): Uint8Array {
  const out: number[] = [];
  const central: number[] = [];
  for (const e of entries) {
    const nameBytes = Array.from(enc.encode(e.name));
    const raw = Array.from(enc.encode(e.content));
    const localOffset = out.length;
    out.push(
      0x50,
      0x4b,
      0x03,
      0x04,
      ...u16(20),
      ...u16(0x0800),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(raw.length),
      ...u32(raw.length),
      ...u16(nameBytes.length),
      ...u16(0),
      ...nameBytes,
      ...raw,
    );
    central.push(
      0x50,
      0x4b,
      0x01,
      0x02,
      ...u16(20),
      ...u16(20),
      ...u16(0x0800),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(raw.length),
      ...u32(raw.length),
      ...u16(nameBytes.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(localOffset),
      ...nameBytes,
    );
  }
  const centralOffset = out.length;
  out.push(...central);
  const centralSize = out.length - centralOffset;
  out.push(
    0x50,
    0x4b,
    0x05,
    0x06,
    ...u16(0),
    ...u16(0),
    ...u16(entries.length),
    ...u16(entries.length),
    ...u32(centralSize),
    ...u32(centralOffset),
    ...u16(0),
  );
  return new Uint8Array(out);
}

function themeZip(api: string): string {
  const manifest = {
    key: "upload-probe",
    name: "Upload Probe",
    nameBn: "আপলোড প্রোব",
    version: "1.0.0",
    api,
    templates: ["index"],
    presentationSurfaces: ["widget"],
    locales: ["en"],
    capabilities: ["render_storefront"],
  };
  const bytes = buildZip([
    { name: "theme.json", content: JSON.stringify(manifest) },
    { name: "templates/index.json", content: JSON.stringify({ blocks: [] }) },
  ]);
  return Buffer.from(bytes).toString("base64");
}

function uploadDb() {
  return fakeDb({
    tables: {
      store_themes: [],
      theme_versions: [],
      theme_drafts: [],
      theme_assets: [],
      marketplace_installs: [],
      theme_audit: [],
    },
  });
}

describe("upload installation-time API compat", () => {
  it("refuses an upload the running builder cannot satisfy, writing nothing", async () => {
    const db = uploadDb();
    let code = "no_throw";
    try {
      await installUploadedTheme(db.asClient(), MERCHANT, {
        fileName: "theme.zip",
        fileBase64: themeZip("^99.0.0"),
        idempotencyKey: "upload-v13-key-1",
      });
    } catch (e) {
      code = (e as { code?: string }).code ?? "threw";
    }
    expect(code).toBe("theme.upload_manifest");
    expect(db.rows("store_themes")).toHaveLength(0);
    expect(db.rows("theme_versions")).toHaveLength(0);
    expect(db.rows("marketplace_installs")).toHaveLength(0);
  });
});
