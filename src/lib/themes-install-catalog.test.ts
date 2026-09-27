/**
 * WF-01 follow-through (TDD): the catalogue install path creates the FULL
 * install shape — theme row + version + draft + ledger linkage + audit —
 * never a bare theme shell invisible to the marketplace.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import {
  metricRecorder,
  allowAllRateLimits,
} from "./__fixtures__/test-doubles";

type Recorder = ReturnType<typeof metricRecorder>;
const rec = vi.hoisted(() => ({ holder: null as Recorder | null }));
const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("./observability.server", () => rec.holder!.observability);
vi.mock("./rate-limit.server", () => allowAllRateLimits());

const { installCatalogTheme, installUploadedTheme } =
  await import("./themes/appearance.server");
type CatalogResult = Awaited<ReturnType<typeof installCatalogTheme>>;
type UploadResult = Awaited<ReturnType<typeof installUploadedTheme>>;
import { MAX_THEME_UPLOAD_BYTES } from "./themes/appearance";

const MERCHANT = "22222222-2222-2222-2222-222222222222";

function catalogDb() {
  return fakeDb({
    tables: {
      store_themes: [],
      theme_versions: [],
      theme_drafts: [],
      theme_registry: [
        {
          key: "classic",
          name_en: "Classic",
          name_bn: "ক্লাসিক",
          summary_en: "Classic theme",
          summary_bn: "ক্লাসিক থিম",
          category: "general",
          version: "1.0.0",
          preset: { tokens: {}, templates: {} },
          active: true,
          sort_order: 1,
        },
      ],
      marketplace_installs: [],
      theme_audit: [],
    },
  });
}

beforeEach(() => recorder.reset());

describe("installCatalogTheme completeness", () => {
  it("creates version, draft, ledger linkage and audit row", async () => {
    const db = catalogDb();
    const out: CatalogResult = await installCatalogTheme(
      db.asClient(),
      MERCHANT,
      "classic",
      "user-9",
    );
    expect(out.alreadyInstalled).toBe(false);
    expect(db.rows("theme_versions")).toHaveLength(1);
    expect(db.rows("theme_drafts")).toHaveLength(1);
    const installs = db.rows("marketplace_installs");
    expect(installs).toHaveLength(1);
    expect(installs[0]).toMatchObject({
      kind: "theme",
      listing_slug: "classic",
      status: "installed",
    });
    const themes = db.rows("store_themes");
    expect(themes[0].source_install_id).toBe(installs[0].id);
    const audit = db.rows("theme_audit");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "theme.installed",
      actor: "user-9",
    });
  });

  it("replays the existing row instead of duplicating", async () => {
    const db = catalogDb();
    const first: CatalogResult = await installCatalogTheme(
      db.asClient(),
      MERCHANT,
      "classic",
      "user-9",
    );
    const out: CatalogResult = await installCatalogTheme(
      db.asClient(),
      MERCHANT,
      "classic",
      "user-9",
    );
    expect(out.alreadyInstalled).toBe(true);
    expect(out.id).toBe(first.id);
    expect(db.rows("store_themes")).toHaveLength(1);
    expect(db.rows("theme_versions")).toHaveLength(1);
  });

  it("refuses unknown catalogue keys without writing anything", async () => {
    const db = catalogDb();
    await expect(
      installCatalogTheme(db.asClient(), MERCHANT, "nope", "user-9"),
    ).rejects.toThrow();
    expect(db.rows("store_themes")).toHaveLength(0);
    expect(db.rows("marketplace_installs")).toHaveLength(0);
  });
});

/**
 * B2 — Upload Theme server path (M-04 / WF-23): the drop-zone was
 * client-only zip validation with zero server path. installUploadedTheme is
 * the server path: authoritative zip checks (extension, size, magic bytes),
 * then a new INACTIVE row via the same shape as catalog installs
 * (row + version + draft + ledger link + audit). [A] burden applies:
 * deny + replay + audit, not just the happy path.
 */
function zipB64(bytes: number[] = [0x50, 0x4b, 0x03, 0x04, 0x0a, 0x00]) {
  return Buffer.from(bytes).toString("base64");
}

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

describe("installUploadedTheme (upload server path)", () => {
  it("installs a validated zip as a new inactive row with ledger link + audit", async () => {
    const db = uploadDb();
    const out: UploadResult = await installUploadedTheme(
      db.asClient(),
      MERCHANT,
      {
        fileName: "my-shop.zip",
        fileBase64: zipB64(),
        idempotencyKey: "upload-key-1",
      },
      "user-9",
    );
    expect(out.alreadyInstalled).toBe(false);
    const themes = db.rows("store_themes");
    expect(themes).toHaveLength(1);
    expect(themes[0]).toMatchObject({
      merchant_id: MERCHANT,
      name: "my-shop",
      is_active: false,
      source_listing_slug: null,
    });
    expect(db.rows("theme_versions")).toHaveLength(1);
    expect(db.rows("theme_drafts")).toHaveLength(1);
    const installs = db.rows("marketplace_installs");
    expect(installs).toHaveLength(1);
    expect(installs[0]).toMatchObject({
      kind: "theme",
      status: "installed",
      price_minor_int: 0,
      idempotency_key: "upload-key-1",
    });
    expect(themes[0].source_install_id).toBe(installs[0].id);
    expect(themes[0].published_version_id).toBe(
      db.rows("theme_versions")[0].id,
    );
    const audit = db.rows("theme_audit");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "theme.installed",
      actor: "user-9",
      theme_id: themes[0].id,
    });
    expect(audit[0].after).toMatchObject({ via: "upload" });
  });

  it("deny: rejects a non-zip extension without writing anything", async () => {
    const db = uploadDb();
    const err = await installUploadedTheme(
      db.asClient(),
      MERCHANT,
      { fileName: "theme.tar.gz", fileBase64: zipB64(), idempotencyKey: "k-x" },
      "user-9",
    ).catch((e) => e);
    expect(err?.code).toBe("theme.upload_name");
    expect(db.rows("store_themes")).toHaveLength(0);
    expect(db.rows("marketplace_installs")).toHaveLength(0);
    expect(db.rows("theme_audit")).toHaveLength(0);
  });

  it("deny: rejects empty bytes without writing anything", async () => {
    const db = uploadDb();
    const err = await installUploadedTheme(
      db.asClient(),
      MERCHANT,
      { fileName: "empty.zip", fileBase64: "", idempotencyKey: "k-x" },
      "user-9",
    ).catch((e) => e);
    expect(err?.code).toBe("theme.upload_empty");
    expect(db.rows("store_themes")).toHaveLength(0);
    expect(db.rows("marketplace_installs")).toHaveLength(0);
  });

  it("deny: rejects bytes without the zip magic without writing anything", async () => {
    const db = uploadDb();
    const notZip = Buffer.from("hello world, not a zip").toString("base64");
    const err = await installUploadedTheme(
      db.asClient(),
      MERCHANT,
      { fileName: "evil.zip", fileBase64: notZip, idempotencyKey: "k-x" },
      "user-9",
    ).catch((e) => e);
    expect(err?.code).toBe("theme.upload_magic");
    expect(db.rows("store_themes")).toHaveLength(0);
    expect(db.rows("marketplace_installs")).toHaveLength(0);
    expect(db.rows("theme_audit")).toHaveLength(0);
  });

  it("deny: rejects oversized archives without writing anything", async () => {
    const db = uploadDb();
    const big = Buffer.alloc(MAX_THEME_UPLOAD_BYTES + 1).toString("base64");
    const err = await installUploadedTheme(
      db.asClient(),
      MERCHANT,
      { fileName: "huge.zip", fileBase64: big, idempotencyKey: "k-x" },
      "user-9",
    ).catch((e) => e);
    expect(err?.code).toBe("theme.upload_too_large");
    expect(db.rows("store_themes")).toHaveLength(0);
    expect(db.rows("marketplace_installs")).toHaveLength(0);
  });

  it("replay: the same idempotency key returns the original row, never a duplicate", async () => {
    const db = uploadDb();
    const input = {
      fileName: "double-click.zip",
      fileBase64: zipB64(),
      idempotencyKey: "stable-intent-key",
    };
    const first: UploadResult = await installUploadedTheme(
      db.asClient(),
      MERCHANT,
      input,
      "user-9",
    );
    const second: UploadResult = await installUploadedTheme(
      db.asClient(),
      MERCHANT,
      input,
      "user-9",
    );
    expect(second.alreadyInstalled).toBe(true);
    expect(second.id).toBe(first.id);
    expect(db.rows("store_themes")).toHaveLength(1);
    expect(db.rows("marketplace_installs")).toHaveLength(1);
    expect(db.rows("theme_versions")).toHaveLength(1);
    expect(db.rows("theme_audit")).toHaveLength(1);
  });

  it("deny: a foreign merchant's rows are untouched (tenant isolation)", async () => {
    const db = uploadDb();
    const existing: UploadResult = await installUploadedTheme(
      db.asClient(),
      MERCHANT,
      { fileName: "mine.zip", fileBase64: zipB64(), idempotencyKey: "k-own" },
      "user-9",
    );
    await installUploadedTheme(
      db.asClient(),
      "11111111-1111-4111-8111-111111111111",
      {
        fileName: "theirs.zip",
        fileBase64: zipB64(),
        idempotencyKey: "k-other",
      },
      "user-9",
    );
    const mine = db
      .rows("store_themes")
      .filter((r) => r.merchant_id === MERCHANT);
    expect(mine).toHaveLength(1);
    expect(mine[0].id).toBe(existing.id);
    expect(
      db.rows("marketplace_installs").filter((r) => r.merchant_id === MERCHANT),
    ).toHaveLength(1);
  });
});
