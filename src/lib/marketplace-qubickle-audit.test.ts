/**
 * QUBICKLE H7 (Rule 17) — every mutation is audited with actor/before/after,
 * and an audit-write failure is observable (never silently swallowed).
 *
 * - installListing writes a `market.installed` audit for the install itself.
 * - When the audit transport fails, the action still succeeds but emits
 *   `audit.write_failed` to observability.
 *
 * TDD RED-first.
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

const { installListing, setInstallStatus } =
  await import("./marketplace-install.server");

const MERCHANT = "22222222-2222-2222-2222-222222222222";
const ACTOR = "99999999-9999-4999-8999-999999999999";
const LISTING = "55555555-5555-4555-8555-555555555555";

function shopDb() {
  return fakeDb({
    tables: {
      marketplace_themes: [
        {
          id: LISTING,
          name: "Audited theme",
          slug: "audited-theme",
          version: "1.0.0",
          status: "active",
          seller_merchant_id: "seller",
          price_minor_int: 0,
          currency_code: "BDT",
          trial_allowed: true,
          compatible_versions: [],
          install_count: 0,
          manifest: {
            permissions: ["render_storefront"],
          },
        },
      ],
      marketplace_versions: [],
      marketplace_installs: [],
      store_themes: [],
      theme_versions: [],
      theme_drafts: [],
      theme_audit: [],
      activity_log: [],
    },
  });
}

/** Wrapper whose activity_log inserts fail — the audit transport is down. */
function auditDownDb(db: FakeDb) {
  const inner = db.from.bind(db);
  const failing = {
    insert: () => failing,
    select: () => failing,
    eq: () => failing,
    single: async () => ({ data: null, error: { message: "audit_down" } }),
    maybeSingle: async () => ({ data: null, error: { message: "audit_down" } }),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: { message: "audit_down" } }).then(
        resolve,
      ),
  };
  const wrapped = Object.create(db);
  wrapped.from = (t: string) => (t === "activity_log" ? failing : inner(t));
  wrapped.asClient = () => wrapped;
  return wrapped as FakeDb;
}

beforeEach(() => recorder.reset());

describe("H7 — install itself is audited", () => {
  it("installListing writes market.installed with actor, before and after", async () => {
    const db = shopDb();
    const out = await installListing(db.asClient(), MERCHANT, {
      kind: "theme",
      listingId: LISTING,
      trial: true,
      idempotencyKey: "audit-key-1",
      versionId: null,
      grantedScopes: ["render_storefront"],
      consentedBy: ACTOR,
    });
    expect(out.replayed).toBe(false);
    const log = db.rows("activity_log");
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      merchant_id: MERCHANT,
      actor: ACTOR,
      action: "market.installed",
    });
    expect(log[0].resource_id).toBe(out.installId);
    // before carries the displaced snapshot, after the new install shape.
    expect(log[0].changed).toMatchObject({});
    expect(Object.keys(log[0].changed as object)).toContain("before");
    expect(Object.keys(log[0].changed as object)).toContain("after");
  });

  it("an audit-write failure is observable but never fails the action", async () => {
    const db = shopDb();
    const wrapped = auditDownDb(db);
    const out = await installListing(wrapped.asClient(), MERCHANT, {
      kind: "theme",
      listingId: LISTING,
      trial: true,
      idempotencyKey: "audit-key-2",
      versionId: null,
      grantedScopes: ["render_storefront"],
      consentedBy: ACTOR,
    });
    // The install still lands — audit is transport best-effort.
    expect(out.replayed).toBe(false);
    expect(db.rows("marketplace_installs")).toHaveLength(1);
    // ...but the dropped audit is visible in observability, not swallowed.
    const auditLogs = recorder.logs.filter(
      (l) => l.event === "audit.write_failed",
    );
    expect(auditLogs.length).toBeGreaterThan(0);
    expect(auditLogs[0].level).toBe("error");
  });

  it("setInstallStatus audit failure is observable and the status still flips", async () => {
    const db = shopDb();
    await installListing(db.asClient(), MERCHANT, {
      kind: "theme",
      listingId: LISTING,
      trial: true,
      idempotencyKey: "audit-key-3",
      versionId: null,
      grantedScopes: ["render_storefront"],
      consentedBy: ACTOR,
    });
    recorder.reset();
    const installId = db.rows("marketplace_installs")[0].id;
    const wrapped = auditDownDb(db);
    const out = await setInstallStatus(
      wrapped.asClient(),
      MERCHANT,
      installId,
      "paused",
      ACTOR,
    );
    expect(out.status).toBe("paused");
    expect(
      recorder.logs.filter((l) => l.event === "audit.write_failed").length,
    ).toBeGreaterThan(0);
  });
});
