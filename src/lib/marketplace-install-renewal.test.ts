/**
 * LANE G — recurring billing for plugin installs.
 *
 * - Renewal date math (monthly/annual/one_time).
 * - Purchase opens a schedule; trials store the interval with null renews_at.
 * - Renewal charges + extends + writes a ledger row; replays converge.
 * - Failed charges park past_due; overdue past_due lapses via the H5 path.
 * - Upgrade proration reuses the shared day-math (billing.server daysBetween).
 * - Everything degrades on pre-migration DBs (missing recurring columns).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fakeDb, type FakeDb } from "./__fixtures__/fake-db";
import {
  metricRecorder,
  allowAllRateLimits,
} from "./__fixtures__/test-doubles";

type Recorder = ReturnType<typeof metricRecorder>;
const rec = vi.hoisted(() => ({ holder: null as Recorder | null }));
const recorder = metricRecorder();
rec.holder = recorder;

const shared = vi.hoisted(() => ({
  entries: [] as { id: string; idempotencyKey: string }[],
  fail: false,
}));

vi.mock("./observability.server", () => rec.holder!.observability);
vi.mock("./rate-limit.server", () => allowAllRateLimits());
vi.mock("./ledger.server", () => ({
  postLedgerEntry: async (_c: unknown, entry: {
    idempotencyKey: string;
  }) => {
    if (shared.fail) throw new Error("card_declined");
    const hit = shared.entries.find(
      (e) => e.idempotencyKey === entry.idempotencyKey,
    );
    if (hit) return { id: hit.id, replayed: true };
    const id = `ledger-${shared.entries.length + 1}`;
    shared.entries.push({ id, idempotencyKey: entry.idempotencyKey });
    return { id, replayed: false };
  },
}));

const {
  installListing,
  processInstallRenewal,
  applyInstallUpgrade,
  quoteInstallProration,
  computeRenewsAt,
  lapseExpiredTrials,
} = await import("./marketplace-install.server");
const { runInstallRenewalSweep } = await import("./billing-cron.server");

const MERCHANT = "22222222-2222-2222-2222-222222222222";
const SELLER = "33333333-3333-3333-3333-333333333333";
const LISTING = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const INSTALL = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOW = Date.UTC(2026, 9, 3, 12, 0, 0);
const DAY = 86_400_000;
const PAST = new Date(NOW - 2 * DAY).toISOString();
const FUTURE = new Date(NOW + 15 * DAY).toISOString();

function paidWidgetDb(installs: Record<string, unknown>[]) {
  return fakeDb({
    tables: {
      marketplace_widgets: [
        {
          id: LISTING,
          name: "Recur widget",
          slug: "recur-widget",
          version: "1.0.0",
          status: "active",
          seller_merchant_id: SELLER,
          price_minor_int: 3000,
          currency_code: "BDT",
          trial_allowed: true,
          compatible_versions: [],
          install_count: 4,
          manifest: { permissions: ["render_storefront"], entry: "widget.js" },
        },
      ],
      marketplace_themes: [],
      marketplace_versions: [],
      marketplace_installs: installs,
      store_themes: [],
      theme_versions: [],
      theme_drafts: [],
      activity_log: [],
      plugin_state: [],
      wallet_ledger_entries: [],
    },
  });
}

function paidInput(extra: Record<string, unknown> = {}) {
  return {
    kind: "widget" as const,
    listingId: LISTING,
    trial: false,
    idempotencyKey: `pay-${Math.random().toString(36).slice(2)}`,
    versionId: null,
    grantedScopes: [],
    consentedBy: null,
    ...extra,
  };
}

/**
 * Pre-migration stand-in: the recurring columns don't exist yet, so any read
 * or write touching them fails like PostgREST (missing-column), while every
 * other column behaves normally.
 */
function preMigrationDb(inner: FakeDb): FakeDb {
  const RECURRING = /billing_interval|renews_at|last_renewed_at/;
  const missing = (col: string): never => {
    throw new Error(`column "${col}" does not exist`);
  };
  const wrapQuery = (q: unknown) =>
    new Proxy(q as object, {
      get(target, prop, receiver) {
        const v = Reflect.get(target as object, prop, target);
        if (typeof v !== "function") return v;
        return (...args: unknown[]) => {
          const str = (a: unknown) => typeof a === "string" && RECURRING.test(a);
          if (prop === "select" && args.some(str)) missing("renews_at");
          if (
            ["eq", "neq", "in", "lte", "gte", "is", "order"].includes(
              prop as string,
            ) &&
            str(args[0])
          )
            missing(String(args[0]));
          if (
            (prop === "insert" || prop === "upsert" || prop === "update") &&
            args.some((a) => {
              const rows = Array.isArray(a) ? a : [a];
              return rows.some(
                (r) =>
                  r &&
                  typeof r === "object" &&
                  Object.keys(r as object).some((k) => RECURRING.test(k)),
              );
            })
          )
            missing("billing_interval");
          const out = (v as (...a: unknown[]) => unknown).apply(
            target,
            args,
          );
          // Chainable methods return the raw query — re-wrap so the rest of
          // the chain stays intercepted.
          return out === target ? receiver : out;
        };
      },
    });
  const wrapped = Object.create(inner) as FakeDb;
  wrapped.from = ((t: string) =>
    t === "marketplace_installs"
      ? wrapQuery((inner as unknown as { from: (t: string) => unknown }).from(t))
      : (inner as unknown as { from: (t: string) => unknown }).from(t)) as FakeDb["from"];
  (wrapped as unknown as { asClient: () => unknown }).asClient = () => wrapped;
  return wrapped;
}

beforeEach(() => {
  recorder.reset();
  shared.entries.length = 0;
  shared.fail = false;
});

describe("G1 — renewal date math", () => {
  it("monthly anchors 30 days out, annual 365, one_time is null", () => {
    expect(computeRenewsAt("monthly", NOW)).toBe(
      new Date(NOW + 30 * DAY).toISOString(),
    );
    expect(computeRenewsAt("annual", NOW)).toBe(
      new Date(NOW + 365 * DAY).toISOString(),
    );
    expect(computeRenewsAt("one_time", NOW)).toBeNull();
  });
});

describe("G2 — purchase opens a schedule", () => {
  it("paid monthly purchase stores the interval and a +30d renews_at", async () => {
    const db = paidWidgetDb([]);
    const out = await installListing(db.asClient(), MERCHANT, paidInput({
      billingInterval: "monthly",
    }));
    expect(out.replayed).toBe(false);
    const row = db
      .rows("marketplace_installs")
      .find((r) => r.id === out.installId)!;
    expect(row.billing_interval).toBe("monthly");
    const skew = Math.abs(
      Date.parse(row.renews_at as string) - (Date.now() + 30 * DAY),
    );
    expect(skew).toBeLessThan(60_000);
  });

  it("trial stores the interval with null renews_at; default is one_time", async () => {
    const db = paidWidgetDb([]);
    const t = await installListing(db.asClient(), MERCHANT, {
      ...paidInput({ billingInterval: "monthly" }),
      trial: true,
    });
    const trialRow = db
      .rows("marketplace_installs")
      .find((r) => r.id === t.installId)!;
    expect(trialRow.billing_interval).toBe("monthly");
    expect(trialRow.renews_at).toBeNull();

    const o = await installListing(db.asClient(), MERCHANT, paidInput());
    const oneRow = db
      .rows("marketplace_installs")
      .find((r) => r.id === o.installId)!;
    expect(oneRow.billing_interval).toBe("one_time");
    expect(oneRow.renews_at).toBeNull();
  });
});

describe("G3 — renewal processing", () => {
  function dueInstall(extra: Record<string, unknown> = {}) {
    return {
      id: INSTALL,
      merchant_id: MERCHANT,
      kind: "widget",
      listing_slug: "recur-widget",
      listing_name: "Recur widget",
      status: "installed",
      is_trial: false,
      price_minor_int: 3000,
      currency_code: "BDT",
      billing_interval: "monthly",
      renews_at: PAST,
      last_renewed_at: new Date(NOW - 32 * DAY).toISOString(),
      started_at: new Date(NOW - 62 * DAY).toISOString(),
      idempotency_key: "orig-key",
      ...extra,
    };
  }

  it("due install charges, extends +30d and writes one ledger row", async () => {
    const db = paidWidgetDb([dueInstall()]);
    const verdict = await processInstallRenewal(
      db.asClient(),
      MERCHANT,
      INSTALL,
      { nowMs: NOW },
    );
    expect(verdict.renewed).toBe(true);
    if (!verdict.renewed) throw new Error("expected renewal");
    expect(verdict.renewsAt).toBe(new Date(NOW + 30 * DAY).toISOString());
    expect(verdict.replayed).toBe(false);
    expect(shared.entries).toHaveLength(1);
    const row = db.rows("marketplace_installs").find((r) => r.id === INSTALL)!;
    expect(row.status).toBe("installed");
    expect(row.renews_at).toBe(verdict.renewsAt);
    expect(row.last_renewed_at).toBe(new Date(NOW).toISOString());
    expect(
      db
        .rows("activity_log")
        .some((r) => r.action === "market.renewed"),
    ).toBe(true);
  });

  it("ledger replay converges: same period key never double-charges", async () => {
    const periodStart = new Date(NOW - 32 * DAY).toISOString();
    shared.entries.push({
      id: "ledger-1",
      idempotencyKey: `renew:${INSTALL}:${periodStart}`,
    });
    const db = paidWidgetDb([dueInstall({ last_renewed_at: periodStart })]);
    const verdict = await processInstallRenewal(
      db.asClient(),
      MERCHANT,
      INSTALL,
      { nowMs: NOW },
    );
    expect(verdict.renewed).toBe(true);
    if (!verdict.renewed) throw new Error("expected renewal");
    expect(verdict.replayed).toBe(true);
    expect(shared.entries).toHaveLength(1);
  });

  it("not-due, one_time and trial installs are skipped without charging", async () => {
    const db = paidWidgetDb([
      dueInstall({ id: "not-due", renews_at: FUTURE }),
      dueInstall({ id: "one-time", billing_interval: "one_time" }),
      dueInstall({ id: "trial-row", status: "trial" }),
    ]);
    for (const id of ["not-due", "one-time", "trial-row"]) {
      const v = await processInstallRenewal(db.asClient(), MERCHANT, id, {
        nowMs: NOW,
      });
      expect(v.renewed).toBe(false);
    }
    expect(shared.entries).toHaveLength(0);
  });

  it("failed charge parks past_due and audits; overdue past_due lapses via H5", async () => {
    shared.fail = true;
    const db = paidWidgetDb([dueInstall()]);
    const verdict = await processInstallRenewal(
      db.asClient(),
      MERCHANT,
      INSTALL,
      { nowMs: NOW },
    );
    expect(verdict).toEqual({
      renewed: false,
      installId: INSTALL,
      reason: "past_due",
    });
    expect(
      db.rows("marketplace_installs").find((r) => r.id === INSTALL)!.status,
    ).toBe("past_due");

    // Window passes with the row still unpaid → terminal lapsed, same H5 path.
    const lapsed = await lapseExpiredTrials(db.asClient(), MERCHANT, NOW);
    expect(lapsed.lapsed).toEqual([INSTALL]);
    expect(
      db.rows("marketplace_installs").find((r) => r.id === INSTALL)!.status,
    ).toBe("lapsed");
  });

  it("past_due inside its window is left alone by the lapse", async () => {
    const db = paidWidgetDb([
      dueInstall({ status: "past_due", renews_at: FUTURE }),
    ]);
    const out = await lapseExpiredTrials(db.asClient(), MERCHANT, NOW);
    expect(out.lapsed).toEqual([]);
    expect(
      db.rows("marketplace_installs").find((r) => r.id === INSTALL)!.status,
    ).toBe("past_due");
  });
});

describe("G4 — upgrade proration reuses the shared day-math", () => {
  it("mid-period upgrade credits the unused remainder per day", () => {
    const q = quoteInstallProration({
      currentPriceMinorInt: 3000,
      newPriceMinorInt: 5000,
      renewsAt: new Date(NOW + 15 * DAY).toISOString(),
      billingInterval: "monthly",
      nowMs: NOW,
    });
    expect(q).toEqual({
      remainingDays: 15,
      periodDays: 30,
      creditMinorInt: 1500,
      dueMinorInt: 3500,
    });
  });

  it("downgrade nets to zero; missing renews_at charges full price", () => {
    const down = quoteInstallProration({
      currentPriceMinorInt: 5000,
      newPriceMinorInt: 1000,
      renewsAt: new Date(NOW + 15 * DAY).toISOString(),
      billingInterval: "monthly",
      nowMs: NOW,
    });
    expect(down.dueMinorInt).toBe(0);
    const bare = quoteInstallProration({
      currentPriceMinorInt: 3000,
      newPriceMinorInt: 5000,
      renewsAt: null,
      billingInterval: "monthly",
      nowMs: NOW,
    });
    expect(bare).toEqual({
      remainingDays: 0,
      periodDays: 30,
      creditMinorInt: 0,
      dueMinorInt: 5000,
    });
  });

  it("applyInstallUpgrade charges the net and moves the price", async () => {
    const db = paidWidgetDb([
      {
        id: INSTALL,
        merchant_id: MERCHANT,
        kind: "widget",
        listing_slug: "recur-widget",
        listing_name: "Recur widget",
        status: "installed",
        price_minor_int: 3000,
        currency_code: "BDT",
        billing_interval: "monthly",
        renews_at: new Date(NOW + 15 * DAY).toISOString(),
      },
    ]);
    const out = await applyInstallUpgrade(db.asClient(), MERCHANT, INSTALL, {
      newPriceMinorInt: 5000,
      nowMs: NOW,
    });
    expect(out.dueMinorInt).toBe(3500);
    expect(shared.entries).toHaveLength(1); // the prorated net only
    expect(
      db.rows("marketplace_installs").find((r) => r.id === INSTALL)!
        .price_minor_int,
    ).toBe(5000);
  });
});

describe("G5 — daily sweep entry point", () => {
  it("renews due rows, retries past_due, skips one_time, isolates throws", async () => {
    const db = paidWidgetDb([
      {
        id: "due-1",
        merchant_id: MERCHANT,
        kind: "widget",
        listing_slug: "recur-widget",
        listing_name: "Recur widget",
        status: "installed",
        price_minor_int: 3000,
        currency_code: "BDT",
        billing_interval: "monthly",
        renews_at: PAST,
        started_at: new Date(NOW - 60 * DAY).toISOString(),
      },
      {
        id: "retry-1",
        merchant_id: MERCHANT,
        kind: "widget",
        listing_slug: "recur-widget",
        listing_name: "Recur widget",
        status: "past_due",
        price_minor_int: 3000,
        currency_code: "BDT",
        billing_interval: "monthly",
        renews_at: PAST,
        started_at: new Date(NOW - 60 * DAY).toISOString(),
      },
      {
        id: "once",
        merchant_id: MERCHANT,
        kind: "widget",
        listing_slug: "recur-widget",
        listing_name: "Recur widget",
        status: "installed",
        price_minor_int: 3000,
        currency_code: "BDT",
        billing_interval: "one_time",
        renews_at: PAST,
      },
      {
        id: "future",
        merchant_id: MERCHANT,
        kind: "widget",
        listing_slug: "recur-widget",
        listing_name: "Recur widget",
        status: "installed",
        price_minor_int: 3000,
        currency_code: "BDT",
        billing_interval: "monthly",
        renews_at: FUTURE,
      },
    ]);
    const result = await runInstallRenewalSweep({
      db: db.asClient(),
      nowMs: NOW,
    });
    expect(result.degraded).toBe(false);
    expect(result.renewed).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.past_due).toBe(0);
  });
});

describe("G6 — missing-column degradation (pre-migration DB)", () => {
  it("purchase still completes; schedule write degrades", async () => {
    const inner = paidWidgetDb([]);
    const db = preMigrationDb(inner);
    const out = await installListing(db.asClient(), MERCHANT, paidInput({
      billingInterval: "monthly",
    }));
    expect(out.replayed).toBe(false);
    const row = inner
      .rows("marketplace_installs")
      .find((r) => r.id === out.installId)!;
    expect(row.billing_interval).toBeUndefined();
    expect(
      recorder.logs.some(
        (l) => l.event === "market.recurring_columns_missing",
      ),
    ).toBe(true);
  });

  it("lapse still parks trials and reports the degraded leg", async () => {
    const inner = fakeDb({
      tables: {
        marketplace_installs: [
          {
            id: "t1",
            merchant_id: MERCHANT,
            status: "trial",
            expires_at: new Date(NOW - DAY).toISOString(),
          },
        ],
        activity_log: [],
      },
    });
    const db = preMigrationDb(inner);
    const out = await lapseExpiredTrials(db.asClient(), MERCHANT, NOW);
    expect(out.lapsed).toEqual(["t1"]);
    expect(out.recurringDegraded).toBe(true);
  });

  it("renewal and sweep return degraded verdicts instead of throwing", async () => {
    const inner = paidWidgetDb([
      {
        id: INSTALL,
        merchant_id: MERCHANT,
        kind: "widget",
        listing_slug: "recur-widget",
        listing_name: "Recur widget",
        status: "installed",
        price_minor_int: 3000,
        currency_code: "BDT",
      },
    ]);
    const db = preMigrationDb(inner);
    const verdict = await processInstallRenewal(
      db.asClient(),
      MERCHANT,
      INSTALL,
      { nowMs: NOW },
    );
    expect(verdict).toEqual({
      renewed: false,
      installId: INSTALL,
      reason: "recurring_columns_missing",
    });
    const sweep = await runInstallRenewalSweep({
      db: db.asClient(),
      nowMs: NOW,
    });
    expect(sweep.degraded).toBe(true);
    expect(sweep.renewed).toBe(0);
    expect(shared.entries).toHaveLength(0);
  });
});
