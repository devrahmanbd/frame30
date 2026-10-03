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
  convertTrialToPaid,
  applyInstallUpgrade,
  quoteInstallProration,
  computeRenewsAt,
  lapseExpiredTrials,
  saveListing,
  resolveListingTermPrice,
  getListingTermPrice,
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

describe("G7 — trial-to-paid conversion stamps renews_at", () => {
  const TRIAL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  function trialInstall(extra: Record<string, unknown> = {}) {
    return {
      id: TRIAL,
      merchant_id: MERCHANT,
      kind: "widget",
      listing_slug: "recur-widget",
      listing_name: "Recur widget",
      status: "trial",
      is_trial: true,
      price_minor_int: 0,
      currency_code: "BDT",
      billing_interval: "monthly",
      expires_at: new Date(NOW + 10 * DAY).toISOString(),
      idempotency_key: "trial-key-1",
      ...extra,
    };
  }

  it("live trial converts: charges listing price, flips live, renews_at +30d", async () => {
    const db = paidWidgetDb([trialInstall()]);
    const verdict = await convertTrialToPaid(db.asClient(), MERCHANT, TRIAL, {
      nowMs: NOW,
    });
    expect(verdict.converted).toBe(true);
    if (!verdict.converted) throw new Error("expected conversion");
    expect(verdict.renewsAt).toBe(new Date(NOW + 30 * DAY).toISOString());
    expect(verdict.versioned).toBe(true);
    expect(verdict.replayed).toBe(false);
    expect(shared.entries).toHaveLength(1);
    expect(shared.entries[0]!.idempotencyKey).toBe(`convert:${TRIAL}`);
    const row = db.rows("marketplace_installs").find((r) => r.id === TRIAL)!;
    expect(row.status).toBe("installed");
    expect(row.is_trial).toBe(false);
    expect(row.expires_at).toBeNull();
    expect(row.billing_interval).toBe("monthly");
    expect(row.renews_at).toBe(verdict.renewsAt);
    expect(
      db.rows("activity_log").some((r) => r.action === "market.converted"),
    ).toBe(true);
  });

  it("charge-success retry replays the ledger without double-charging", async () => {
    shared.entries.push({ id: "ledger-1", idempotencyKey: `convert:${TRIAL}` });
    const db = paidWidgetDb([trialInstall()]);
    const verdict = await convertTrialToPaid(db.asClient(), MERCHANT, TRIAL, {
      nowMs: NOW,
    });
    expect(verdict.converted).toBe(true);
    if (!verdict.converted) throw new Error("expected conversion");
    expect(verdict.replayed).toBe(true);
    expect(shared.entries).toHaveLength(1);
  });

  it("expired trial lapses and throws instead of converting", async () => {
    const db = paidWidgetDb([
      trialInstall({ expires_at: new Date(NOW - DAY).toISOString() }),
    ]);
    await expect(
      convertTrialToPaid(db.asClient(), MERCHANT, TRIAL, { nowMs: NOW }),
    ).rejects.toThrow("market_trial_expired");
    expect(
      db.rows("marketplace_installs").find((r) => r.id === TRIAL)!.status,
    ).toBe("lapsed");
    expect(shared.entries).toHaveLength(0);
  });

  it("declined card parks past_due without stamping a schedule", async () => {
    shared.fail = true;
    const db = paidWidgetDb([trialInstall()]);
    const verdict = await convertTrialToPaid(db.asClient(), MERCHANT, TRIAL, {
      nowMs: NOW,
    });
    expect(verdict).toEqual({
      converted: false,
      installId: TRIAL,
      reason: "past_due",
    });
    const row = db.rows("marketplace_installs").find((r) => r.id === TRIAL)!;
    expect(row.status).toBe("past_due");
    expect(row.renews_at ?? null).toBeNull();
  });

  it("one_time trial converts with null renews_at; free listing skips the ledger", async () => {
    const db = paidWidgetDb([
      trialInstall({ id: "once-trial", billing_interval: "one_time" }),
    ]);
    const once = await convertTrialToPaid(
      db.asClient(),
      MERCHANT,
      "once-trial",
      { nowMs: NOW },
    );
    expect(once.converted).toBe(true);
    if (!once.converted) throw new Error("expected conversion");
    expect(once.renewsAt).toBeNull();

    db.rows("marketplace_widgets")[0]!.price_minor_int = 0;
    const freeTrial = trialInstall({ id: "free-trial" });
    db.rows("marketplace_installs").push({ ...freeTrial });
    const before = shared.entries.length;
    const free = await convertTrialToPaid(
      db.asClient(),
      MERCHANT,
      "free-trial",
      { nowMs: NOW },
    );
    expect(free.converted).toBe(true);
    expect(shared.entries).toHaveLength(before);
    expect(
      db.rows("marketplace_installs").find((r) => r.id === "free-trial")!
        .status,
    ).toBe("installed");
  });

  it("already-paid install replays without charging", async () => {
    const db = paidWidgetDb([
      trialInstall({ status: "installed", is_trial: false }),
    ]);
    const verdict = await convertTrialToPaid(db.asClient(), MERCHANT, TRIAL, {
      nowMs: NOW,
    });
    expect(verdict).toEqual({
      converted: false,
      installId: TRIAL,
      reason: "already_paid",
    });
    expect(shared.entries).toHaveLength(0);
  });

  it("delisted listing has nothing to convert against", async () => {
    const db = paidWidgetDb([trialInstall({ listing_slug: "gone-widget" })]);
    const verdict = await convertTrialToPaid(db.asClient(), MERCHANT, TRIAL, {
      nowMs: NOW,
    });
    expect(verdict).toEqual({
      converted: false,
      installId: TRIAL,
      reason: "listing_not_found",
    });
    expect(shared.entries).toHaveLength(0);
  });
});

describe("G8 — listing term pricing (PRICING lane)", () => {
  const TERM_TRIAL = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  function trialRow(extra: Record<string, unknown> = {}) {
    return {
      id: TERM_TRIAL,
      merchant_id: MERCHANT,
      kind: "widget",
      listing_slug: "recur-widget",
      listing_name: "Recur widget",
      status: "trial",
      is_trial: true,
      price_minor_int: 0,
      currency_code: "BDT",
      billing_interval: "monthly",
      expires_at: new Date(NOW + 10 * DAY).toISOString(),
      idempotency_key: "trial-key-8",
      ...extra,
    };
  }
  function dueRow(extra: Record<string, unknown> = {}) {
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
      idempotency_key: "orig-key-8",
      ...extra,
    };
  }
  function chargeOf(db: FakeDb, action: string): number {
    const audit = db
      .rows("activity_log")
      .find((r) => r.action === action)!;
    return (audit.changed as { charge_minor_int: number }).charge_minor_int;
  }
  function listingInput(extra: Record<string, unknown> = {}) {
    return {
      kind: "widget" as const,
      name: "Term widget",
      slug: "term-widget",
      description: null,
      category: "general",
      version: "1.0.0",
      priceMinor: 3000,
      trialAllowed: false,
      manifest: {},
      ...extra,
    };
  }

  /**
   * Pre-migration listing tables: the term columns don't exist yet, so any
   * read or write touching them fails like PostgREST (missing-column),
   * while every other column behaves normally.
   */
  function termPreMigrationDb(inner: FakeDb): FakeDb {
    const TERM = /price_monthly_minor_int|price_annual_minor_int/;
    const missing = (): never => {
      throw new Error('column "price_monthly_minor_int" does not exist');
    };
    const wrapQuery = (q: unknown) =>
      new Proxy(q as object, {
        get(target, prop, receiver) {
          const v = Reflect.get(target as object, prop, target);
          if (typeof v !== "function") return v;
          return (...args: unknown[]) => {
            const str = (a: unknown) =>
              typeof a === "string" && TERM.test(a);
            if (prop === "select" && args.some(str)) missing();
            if (
              (prop === "insert" || prop === "upsert" || prop === "update") &&
              args.some((a) => {
                const rows = Array.isArray(a) ? a : [a];
                return rows.some(
                  (r) =>
                    r &&
                    typeof r === "object" &&
                    Object.keys(r as object).some((k) => TERM.test(k)),
                );
              })
            )
              missing();
            const out = (v as (...a: unknown[]) => unknown).apply(
              target,
              args,
            );
            return out === target ? receiver : out;
          };
        },
      });
    const wrapped = Object.create(inner) as FakeDb;
    wrapped.from = ((t: string) =>
      t === "marketplace_widgets" || t === "marketplace_themes"
        ? wrapQuery(
            (inner as unknown as { from: (t: string) => unknown }).from(t),
          )
        : (inner as unknown as { from: (t: string) => unknown }).from(t)
    ) as FakeDb["from"];
    (wrapped as unknown as { asClient: () => unknown }).asClient = () =>
      wrapped;
    return wrapped;
  }

  it("term quote: per-interval prices resolve, base is the fallback, unknown intervals throw", () => {
    const termed = {
      price_minor_int: 3000,
      price_monthly_minor_int: 2000,
      price_annual_minor_int: 20000,
    };
    expect(resolveListingTermPrice(termed, "monthly")).toBe(2000);
    expect(resolveListingTermPrice(termed, "annual")).toBe(20000);
    expect(resolveListingTermPrice(termed, "one_time")).toBe(3000);
    const bare = { price_minor_int: 3000 };
    expect(resolveListingTermPrice(bare, "monthly")).toBe(3000);
    expect(resolveListingTermPrice(bare, "annual")).toBe(3000);
    expect(getListingTermPrice(bare, "monthly")).toBeNull();
    expect(getListingTermPrice(termed, "one_time")).toBeNull();
    expect(() =>
      resolveListingTermPrice(termed, "weekly" as never),
    ).toThrow("market_listing_terms_invalid");
  });

  it("saveListing validates term amounts and persists valid terms", async () => {
    const db = paidWidgetDb([]);
    await expect(
      saveListing(
        db.asClient(),
        MERCHANT,
        listingInput({ priceMonthlyMinor: -5 }),
      ),
    ).rejects.toThrow("market_listing_terms_invalid");
    await expect(
      saveListing(
        db.asClient(),
        MERCHANT,
        listingInput({ priceAnnualMinor: 19.99 }),
      ),
    ).rejects.toThrow("market_listing_terms_invalid");
    const out = await saveListing(
      db.asClient(),
      MERCHANT,
      listingInput({ priceMonthlyMinor: 2000, priceAnnualMinor: 20000 }),
    );
    expect(out.ok).toBe(true);
    const row = db
      .rows("marketplace_widgets")
      .find((r) => r.id === out.id)!;
    expect(row.price_monthly_minor_int).toBe(2000);
    expect(row.price_annual_minor_int).toBe(20000);
  });

  it("purchase charges the term price for the chosen cadence", async () => {
    const db = paidWidgetDb([]);
    db.rows("marketplace_widgets")[0]!.price_monthly_minor_int = 2000;
    db.rows("marketplace_widgets")[0]!.price_annual_minor_int = 20000;
    const m = await installListing(
      db.asClient(),
      MERCHANT,
      paidInput({ billingInterval: "monthly" }),
    );
    expect(
      db.rows("marketplace_installs").find((r) => r.id === m.installId)!
        .price_minor_int,
    ).toBe(2000);
    const a = await installListing(
      db.asClient(),
      MERCHANT,
      paidInput({ billingInterval: "annual" }),
    );
    expect(
      db.rows("marketplace_installs").find((r) => r.id === a.installId)!
        .price_minor_int,
    ).toBe(20000);
    const o = await installListing(db.asClient(), MERCHANT, paidInput());
    expect(
      db.rows("marketplace_installs").find((r) => r.id === o.installId)!
        .price_minor_int,
    ).toBe(3000);
  });

  it("conversion charges the term price; falls back to base when absent", async () => {
    const db = paidWidgetDb([trialRow()]);
    db.rows("marketplace_widgets")[0]!.price_monthly_minor_int = 2500;
    const verdict = await convertTrialToPaid(db.asClient(), MERCHANT, TERM_TRIAL, {
      nowMs: NOW,
    });
    expect(verdict.converted).toBe(true);
    expect(chargeOf(db, "market.converted")).toBe(2500);

    const bare = paidWidgetDb([trialRow()]);
    const v2 = await convertTrialToPaid(bare.asClient(), MERCHANT, TERM_TRIAL, {
      nowMs: NOW,
    });
    expect(v2.converted).toBe(true);
    expect(chargeOf(bare, "market.converted")).toBe(3000);
  });

  it("renewal charges the term price; falls back to the install price when absent", async () => {
    const db = paidWidgetDb([dueRow()]);
    db.rows("marketplace_widgets")[0]!.price_monthly_minor_int = 2500;
    const verdict = await processInstallRenewal(
      db.asClient(),
      MERCHANT,
      INSTALL,
      { nowMs: NOW },
    );
    expect(verdict.renewed).toBe(true);
    expect(chargeOf(db, "market.renewed")).toBe(2500);

    // Listing base moved since purchase and no terms: the install-row price
    // (not the listing base) is charged — the pre-lane behaviour.
    const fb = paidWidgetDb([dueRow()]);
    fb.rows("marketplace_widgets")[0]!.price_minor_int = 5000;
    const v2 = await processInstallRenewal(fb.asClient(), MERCHANT, INSTALL, {
      nowMs: NOW,
    });
    expect(v2.renewed).toBe(true);
    expect(chargeOf(fb, "market.renewed")).toBe(3000);
  });

  it("upgrade proration nets an annual price against a monthly credit", async () => {
    const q = quoteInstallProration({
      currentPriceMinorInt: 3000,
      newPriceMinorInt: 30000,
      renewsAt: new Date(NOW + 15 * DAY).toISOString(),
      billingInterval: "monthly",
      nowMs: NOW,
    });
    expect(q).toEqual({
      remainingDays: 15,
      periodDays: 30,
      creditMinorInt: 1500,
      dueMinorInt: 28500,
    });
    const db = paidWidgetDb([
      dueRow({
        status: "installed",
        renews_at: new Date(NOW + 15 * DAY).toISOString(),
      }),
    ]);
    const out = await applyInstallUpgrade(db.asClient(), MERCHANT, INSTALL, {
      newPriceMinorInt: 30000,
      nowMs: NOW,
    });
    expect(out.dueMinorInt).toBe(28500);
    expect(shared.entries).toHaveLength(1);
  });

  it("pre-migration listing table degrades term reads/writes without failing", async () => {
    const inner = paidWidgetDb([trialRow()]);
    const db = termPreMigrationDb(inner);
    const verdict = await convertTrialToPaid(db.asClient(), MERCHANT, TERM_TRIAL, {
      nowMs: NOW,
    });
    expect(verdict.converted).toBe(true);
    expect(chargeOf(inner, "market.converted")).toBe(3000);
    expect(
      recorder.logs.some(
        (l) => l.event === "market.listing_terms_columns_missing",
      ),
    ).toBe(true);

    const saveInner = paidWidgetDb([]);
    const saveDb = termPreMigrationDb(saveInner);
    const out = await saveListing(
      saveDb.asClient(),
      MERCHANT,
      listingInput({ priceMonthlyMinor: 2000, priceAnnualMinor: 20000 }),
    );
    expect(out.ok).toBe(true);
    const row = saveInner
      .rows("marketplace_widgets")
      .find((r) => r.id === out.id)!;
    expect(row.price_monthly_minor_int).toBeUndefined();
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
