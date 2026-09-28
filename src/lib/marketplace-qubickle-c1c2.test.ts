/**
 * QUBICKLE C1 (Rule 15) + C2 (Rule 15) regression tests — TDD RED-first.
 *
 * C1: deleteTheme must retire the ledger row linked by source_install_id
 * only. A slug-sweep retires every install sharing the slug — deleting a
 * spare copy would silently kill the live copy's ledger row.
 *
 * C2: every compensating `delete().eq("id", …)` on the install paths must
 * also predicate on merchant_id, so a compensation can never remove a
 * foreign merchant's row, and the affected-row count is asserted.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fakeDb, FakeDb } from "./__fixtures__/fake-db";
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

const { deleteTheme, installCatalogTheme } =
  await import("./themes/appearance.server");
const { installUploadedTheme } = await import("./themes/appearance.server");

const MERCHANT = "22222222-2222-2222-2222-222222222222";
const FOREIGN = "11111111-1111-4111-8111-111111111111";
const ACTOR = "99999999-9999-4999-8999-999999999999";

const LIVE_INSTALL = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SPARE_INSTALL = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LIVE_THEME = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SPARE_THEME = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function twoCopyDb() {
  return fakeDb({
    tables: {
      marketplace_installs: [
        {
          id: LIVE_INSTALL,
          merchant_id: MERCHANT,
          kind: "theme",
          listing_slug: "supershope",
          status: "installed",
        },
        {
          id: SPARE_INSTALL,
          merchant_id: MERCHANT,
          kind: "theme",
          listing_slug: "supershope",
          status: "installed",
        },
      ],
      store_themes: [
        {
          id: LIVE_THEME,
          merchant_id: MERCHANT,
          name: "Supershope",
          is_active: true,
          source_install_id: LIVE_INSTALL,
          source_listing_slug: "supershope",
        },
        {
          id: SPARE_THEME,
          merchant_id: MERCHANT,
          name: "Supershope (spare)",
          is_active: false,
          source_install_id: SPARE_INSTALL,
          source_listing_slug: "supershope",
        },
      ],
      theme_versions: [],
      theme_drafts: [],
      theme_audit: [],
    },
  });
}

/** Wrap a FakeDb so inserts into `table` fail — exercises compensation. */
function failInsertOn(db: FakeDb, table: string, message: string) {
  const inner = db.from.bind(db);
  const failing = {
    insert: () => failing,
    select: () => failing,
    eq: () => failing,
    single: async () => ({ data: null, error: { message } }),
    maybeSingle: async () => ({ data: null, error: { message } }),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: { message } }).then(resolve),
  };
  const wrapped = Object.create(db);
  wrapped.from = (t: string) => (t === table ? failing : inner(t));
  wrapped.asClient = () => wrapped;
  return wrapped as FakeDb;
}

beforeEach(() => recorder.reset());

describe("C1 — deleteTheme retires by install-id link only", () => {
  it("SELECTs the linkage column so the link is visible", async () => {
    const db = twoCopyDb();
    await deleteTheme(db.asClient(), MERCHANT, SPARE_THEME, ACTOR);
    const selects = db.selects("store_themes");
    expect(selects.length).toBeGreaterThan(0);
    expect(selects.some((s) => s.columns.includes("source_install_id"))).toBe(
      true,
    );
  });

  it("deleting the spare copy leaves the live copy ledger untouched", async () => {
    const db = twoCopyDb();
    await deleteTheme(db.asClient(), MERCHANT, SPARE_THEME, ACTOR);
    const installs = db.rows("marketplace_installs");
    expect(installs.find((r) => r.id === SPARE_INSTALL)!.status).toBe(
      "removed",
    );
    // The live copy keeps its ledger row — a slug-sweep would retire it too.
    expect(installs.find((r) => r.id === LIVE_INSTALL)!.status).toBe(
      "installed",
    );
    expect(db.rows("store_themes").map((r) => r.id)).toEqual([LIVE_THEME]);
  });

  it("fail closed: a theme row with no install link refuses instead of sweeping", async () => {
    const db = fakeDb({
      tables: {
        marketplace_installs: [
          {
            id: LIVE_INSTALL,
            merchant_id: MERCHANT,
            kind: "theme",
            listing_slug: "orphan",
            status: "installed",
          },
        ],
        store_themes: [
          {
            id: SPARE_THEME,
            merchant_id: MERCHANT,
            name: "Orphan",
            is_active: false,
            source_install_id: null,
            source_listing_slug: "orphan",
          },
        ],
        theme_versions: [],
        theme_drafts: [],
        theme_audit: [],
      },
    });
    await expect(
      deleteTheme(db.asClient(), MERCHANT, SPARE_THEME, ACTOR),
    ).rejects.toMatchObject({ code: "theme.unlinked" });
    // Fail closed: nothing retired, nothing deleted.
    expect(
      db.rows("marketplace_installs").find((r) => r.id === LIVE_INSTALL)!
        .status,
    ).toBe("installed");
    expect(db.rows("store_themes")).toHaveLength(1);
  });
});

describe("C2 — compensating deletes are merchant-scoped", () => {
  it("catalog install: version failure compensates with a merchant predicate", async () => {
    const foreignId = "store_themes-1";
    const db = fakeDb({
      tables: {
        store_themes: [
          {
            id: foreignId,
            merchant_id: FOREIGN,
            name: "Foreign",
            is_active: false,
          },
        ],
        theme_versions: [],
        theme_drafts: [],
        marketplace_installs: [],
        theme_audit: [],
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
      },
    });
    const wrapped = failInsertOn(db, "theme_versions", "boom-version");
    await expect(
      installCatalogTheme(wrapped.asClient(), MERCHANT, "classic", ACTOR),
    ).rejects.toThrow();
    const deletes = db
      .callsOf("delete")
      .filter((c) => c.table === "store_themes");
    expect(deletes.length).toBeGreaterThan(0);
    for (const d of deletes) {
      expect(
        d.filters.some(
          (f) => f.column === "merchant_id" && f.value === MERCHANT,
        ),
      ).toBe(true);
    }
    // A foreign row that happens to share the compensated id survives.
    expect(db.rows("store_themes").map((r) => r.merchant_id)).toEqual([
      FOREIGN,
    ]);
  });

  it("upload install: draft failure compensates with a merchant predicate", async () => {
    const { buildTestZip } = await import("./__fixtures__/test-zip");
    const zip = buildTestZip([
      { name: "theme.json", content: JSON.stringify({ name: "Up" }) },
    ]);
    const foreignId = "store_themes-1";
    const db = fakeDb({
      tables: {
        store_themes: [
          {
            id: foreignId,
            merchant_id: FOREIGN,
            name: "Foreign",
            is_active: false,
          },
        ],
        theme_versions: [
          {
            id: "v-seeded",
            merchant_id: MERCHANT,
            theme_id: "pending",
            version: 1,
            status: "published",
          },
        ],
        theme_drafts: [],
        marketplace_installs: [],
        theme_audit: [],
      },
    });
    const wrapped = failInsertOn(db, "theme_drafts", "boom-draft");
    await expect(
      installUploadedTheme(
        wrapped.asClient(),
        MERCHANT,
        {
          fileName: "up.zip",
          fileBase64: Buffer.from(zip).toString("base64"),
          idempotencyKey: "upload-key-1",
        },
        ACTOR,
      ),
    ).rejects.toThrow();
    const deletes = db
      .callsOf("delete")
      .filter((c) => c.table === "store_themes");
    expect(deletes.length).toBeGreaterThan(0);
    for (const d of deletes) {
      expect(
        d.filters.some(
          (f) => f.column === "merchant_id" && f.value === MERCHANT,
        ),
      ).toBe(true);
    }
    expect(db.rows("store_themes").map((r) => r.merchant_id)).toEqual([
      FOREIGN,
    ]);
  });
});
