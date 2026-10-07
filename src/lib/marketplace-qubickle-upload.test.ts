/**
 * QUBICKLE H6 (Rule 16) — theme uploads are parsed server-side, not sniffed.
 *
 * - The central directory is parsed; entry paths are validated (no absolute
 *   paths, no `..`, no backslashes).
 * - Caps on entry count and inflated bytes (zip-bomb guard).
 * - A root manifest (theme.json / manifest.json) is extracted — or the
 *   upload is rejected.
 * - Upload slugs are unique per install (no slug collisions).
 *
 * TDD RED-first.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import {
  metricRecorder,
  allowAllRateLimits,
} from "./__fixtures__/test-doubles";
import { buildTestZip } from "./__fixtures__/test-zip";

type Recorder = ReturnType<typeof metricRecorder>;
const rec = vi.hoisted(() => ({ holder: null as Recorder | null }));
const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("./observability.server", () => rec.holder!.observability);
vi.mock("./rate-limit.server", () => allowAllRateLimits());

const { installUploadedTheme } = await import("./themes/appearance.server");

const MERCHANT = "22222222-2222-2222-2222-222222222222";
const ACTOR = "99999999-9999-4999-8999-999999999999";

function uploadDb() {
  return fakeDb({
    tables: {
      store_themes: [],
      theme_versions: [],
      theme_drafts: [],
      marketplace_installs: [],
      theme_audit: [],
    },
  });
}

function b64(zip: Uint8Array): string {
  return Buffer.from(zip).toString("base64");
}

let keySeq = 0;
function upload(
  db: ReturnType<typeof fakeDb>,
  fileName: string,
  zip: Uint8Array,
  key = `h6-key-${(keySeq += 1)}`,
) {
  return installUploadedTheme(
    db.asClient(),
    MERCHANT,
    {
      fileName,
      fileBase64: b64(zip),
      idempotencyKey: key,
    },
    ACTOR,
  );
}

const MANIFEST = JSON.stringify({
  key: "hardened",
  name: "Hardened",
  nameBn: "হার্ডেনড",
  version: "1.0.0",
  api: "^3.0.0",
  templates: ["index"],
  presentationSurfaces: ["widget"],
  locales: ["en"],
  capabilities: ["render_storefront"],
});

/** Rejection-code assertion (ThemeDeskError carries the code on `.code`). */
async function errorCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (e) {
    return (
      (e as { code?: string }).code ?? (e as Error | null)?.message ?? "threw"
    );
  }
  return "no_throw";
}

beforeEach(() => recorder.reset());

describe("H6 — upload archive hardening", () => {
  it("rejects a zip-slip entry even when the manifest is valid", async () => {
    const db = uploadDb();
    const zip = buildTestZip([
      { name: "theme.json", content: MANIFEST },
      { name: "../../evil.json", content: "{}" },
    ]);
    expect(await errorCode(upload(db, "slip.zip", zip))).toBe(
      "theme.upload_path",
    );
    expect(db.rows("store_themes")).toHaveLength(0);
  });

  it("rejects absolute entry paths", async () => {
    const db = uploadDb();
    const zip = buildTestZip([
      { name: "theme.json", content: MANIFEST },
      { name: "/abs.json", content: "{}" },
    ]);
    expect(await errorCode(upload(db, "abs.zip", zip))).toBe(
      "theme.upload_path",
    );
    expect(db.rows("store_themes")).toHaveLength(0);
  });

  it("rejects an archive with no extractable manifest", async () => {
    const db = uploadDb();
    const zip = buildTestZip([{ name: "readme.txt", content: "hi" }]);
    expect(await errorCode(upload(db, "nomanifest.zip", zip))).toBe(
      "theme.upload_manifest",
    );
    expect(db.rows("store_themes")).toHaveLength(0);
  });

  it("rejects a manifest that is not a JSON object with a name", async () => {
    const db = uploadDb();
    const zip = buildTestZip([
      { name: "theme.json", content: JSON.stringify({ nope: true }) },
    ]);
    expect(await errorCode(upload(db, "badmanifest.zip", zip))).toBe(
      "theme.upload_manifest",
    );
    expect(db.rows("store_themes")).toHaveLength(0);
  });

  it("rejects a zip bomb (lied inflated size beyond the cap)", async () => {
    const db = uploadDb();
    // One tiny stored entry whose central-directory header claims 600 MB.
    const zip = buildTestZip([{ name: "theme.json", content: MANIFEST }]);
    const buf = Buffer.from(zip);
    // Local header (30 + name length) then payload; central dir follows.
    const nameLen = "theme.json".length;
    const payloadLen = Buffer.byteLength(MANIFEST);
    const centralOff = 30 + nameLen + payloadLen;
    // Central header: uncompressed size u32 at +24.
    buf.writeUInt32LE(600 * 1024 * 1024, centralOff + 24);
    expect(await errorCode(upload(db, "bomb.zip", buf))).toBe(
      "theme.upload_bomb",
    );
    expect(db.rows("store_themes")).toHaveLength(0);
  });

  it("rejects an archive over the entry-count cap", async () => {
    const db = uploadDb();
    const entries = [{ name: "theme.json", content: MANIFEST }];
    for (let i = 0; i < 1200; i++)
      entries.push({ name: `skin/part-${i}.txt`, content: "x" });
    expect(await errorCode(upload(db, "many.zip", buildTestZip(entries)))).toBe(
      "theme.upload_bomb",
    );
    expect(db.rows("store_themes")).toHaveLength(0);
  });

  it("accepts a valid archive with a deflated manifest and mints unique slugs", async () => {
    const db = uploadDb();
    const zip = buildTestZip([
      { name: "theme.json", content: MANIFEST, method: 8 },
      { name: "assets/logo.png", content: "logo" },
    ]);
    const first = await upload(db, "same.zip", zip, "h6-unique-1");
    const second = await upload(db, "same.zip", zip, "h6-unique-2");
    expect(first.alreadyInstalled).toBe(false);
    expect(second.alreadyInstalled).toBe(false);
    const slugs = db.rows("marketplace_installs").map((r) => r.listing_slug);
    expect(slugs).toHaveLength(2);
    expect(new Set(slugs).size).toBe(2);
    expect(db.rows("store_themes")).toHaveLength(2);
  });
});
