/**
 * QUBICKLE H1/H2 (Rule 8) — install replay is bound to the full
 * (merchant, key, kind, listing) tuple, not the key alone; a duplicate-key
 * insert (concurrent double-submit) replays instead of stacking; builtin and
 * catalog installs replay key-first.
 *
 * TDD RED-first: each test fails until the binding + conflict handling land.
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

const { installListing, installBuiltinWidget } =
  await import("./marketplace-install.server");
const { installCatalogTheme } = await import("./themes/appearance.server");

const MERCHANT = "22222222-2222-2222-2222-222222222222";
const ACTOR = "99999999-9999-4999-8999-999999999999";
const LISTING_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LISTING_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function listing(id: string, slug: string) {
  return {
    id,
    name: `Theme ${slug}`,
    slug,
    version: "1.0.0",
    status: "active",
    seller_merchant_id: "seller",
    price_minor_int: 0,
    currency_code: "BDT",
    trial_allowed: false,
    compatible_versions: [],
    install_count: 0,
    manifest: {
      templates: { index: { header: [], main: [], footer: [] } },
      tokens: {},
    },
  };
}

function shopDb() {
  return fakeDb({
    tables: {
      marketplace_themes: [
        listing(LISTING_A, "alpha"),
        listing(LISTING_B, "beta"),
      ],
      marketplace_widgets: [],
      marketplace_versions: [],
      marketplace_installs: [],
      store_themes: [],
      theme_versions: [],
      theme_drafts: [],
      theme_registry: [],
      theme_audit: [],
      activity_log: [],
      plugin_state: [],
    },
  });
}

const BASE_INPUT = {
  kind: "theme" as const,
  listingId: LISTING_A,
  trial: false,
  idempotencyKey: "shared-key-1",
  versionId: null,
  grantedScopes: ["render_storefront"],
  consentedBy: null,
};

/** Fail the next insert into `table` with a duplicate-key error, then pass. */
function failFirstInsertDuplicate(db: FakeDb, table: string) {
  const inner = db.from.bind(db);
  let armed = true;
  const duplicate = () => ({
    insert: () => duplicate(),
    select: () => duplicate(),
    eq: () => duplicate(),
    single: async () => ({
      data: null,
      error: { message: "duplicate key value violates unique constraint" },
    }),
    maybeSingle: async () => ({
      data: null,
      error: { message: "duplicate key value violates unique constraint" },
    }),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({
        data: null,
        error: { message: "duplicate key value violates unique constraint" },
      }).then(resolve),
  });
  const wrapped = Object.create(db);
  wrapped.from = (t: string) => {
    const q = inner(t) as unknown as Record<string, unknown>;
    if (t !== table || !armed) return q;
    return new Proxy(q as object, {
      get(target, prop, receiver) {
        if (prop === "insert" && armed) {
          armed = false;
          return () => duplicate();
        }
        const v = Reflect.get(target, prop, target);
        return typeof v === "function"
          ? (...args: unknown[]) =>
              Reflect.apply(v as (...a: unknown[]) => unknown, target, args)
          : v;
      },
    });
  };
  wrapped.asClient = () => wrapped;
  return wrapped as FakeDb;
}

beforeEach(() => recorder.reset());

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

describe("H1/H2 — replay binds (merchant, key, kind, listing)", () => {
  it("mutated payload under the same key is a conflict, not a replay", async () => {
    const db = shopDb();
    const first = await installListing(db.asClient(), MERCHANT, BASE_INPUT);
    expect(first.replayed).toBe(false);
    await expect(
      installListing(db.asClient(), MERCHANT, {
        ...BASE_INPUT,
        listingId: LISTING_B,
      }),
    ).rejects.toThrow("market_idempotency_conflict");
    expect(db.rows("marketplace_installs")).toHaveLength(1);
  });

  it("kind mismatch under the same key is a conflict", async () => {
    const db = shopDb();
    await installListing(db.asClient(), MERCHANT, BASE_INPUT);
    await expect(
      installListing(db.asClient(), MERCHANT, {
        ...BASE_INPUT,
        kind: "widget",
        listingId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      }),
    ).rejects.toThrow("market_idempotency_conflict");
    expect(db.rows("marketplace_installs")).toHaveLength(1);
  });

  it("concurrent double-insert: loser replays the winner instead of stacking", async () => {
    const db = shopDb();
    // Winner commits first (same key, direct seed = the racing transaction).
    await installListing(db.asClient(), MERCHANT, BASE_INPUT);
    const racy = failFirstInsertDuplicate(db, "marketplace_installs");
    const out = await installListing(racy.asClient(), MERCHANT, BASE_INPUT);
    expect(out.replayed).toBe(true);
    expect(db.rows("marketplace_installs")).toHaveLength(1);
  });

  it("builtin widget install is key-driven and checks the ledger before writing", async () => {
    const db = shopDb();
    const first = await installBuiltinWidget(
      db.asClient(),
      MERCHANT,
      "widget",
      "whatsapp-chat",
      "builtin-key-1",
      ACTOR,
    );
    expect(first.replayed).toBe(false);
    const second = await installBuiltinWidget(
      db.asClient(),
      MERCHANT,
      "widget",
      "whatsapp-chat",
      "builtin-key-1",
      ACTOR,
    );
    expect(second.replayed).toBe(true);
    expect(second.installId).toBe(first.installId);
    const ledgers = db
      .rows("marketplace_installs")
      .filter((r) => r.idempotency_key === "builtin-key-1");
    expect(ledgers).toHaveLength(1);
  });

  it("catalog install with an orphaned ledger key refuses instead of stacking", async () => {
    const db = fakeDb({
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
        // Orphaned first attempt: ledger committed, theme row never linked
        // (crash between the two writes, or a racing double-click).
        marketplace_installs: [
          {
            id: "orphan-ledger",
            merchant_id: MERCHANT,
            kind: "theme",
            listing_slug: "classic",
            status: "installed",
            idempotency_key: `catalog:${MERCHANT}:classic`,
          },
        ],
        theme_audit: [],
      },
    });
    expect(
      await errorCode(
        installCatalogTheme(db.asClient(), MERCHANT, "classic", ACTOR),
      ),
    ).toBe("market_install_conflict");
    expect(
      db.rows("marketplace_installs").filter((r) => r.kind === "theme"),
    ).toHaveLength(1);
    expect(db.rows("store_themes")).toHaveLength(0);
  });
});
