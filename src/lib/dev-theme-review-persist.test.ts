/**
 * Level B review-store durability — TDD vectors.
 *
 * The pure in-memory store (`createDevThemeReleaseStore`) stays the unit-test
 * seam; this suite pins the Supabase-backed adapter in `dev-theme-review.ts`
 * against fakeDb:
 *
 * - submit → approve → publish → load → activate round-trips through durable
 *   rows (no in-memory store passed to the gates).
 * - A fingerprint mismatch refuses activation with no flag flip and no audit.
 * - DB faults fail closed: an unreadable review store refuses before any
 *   write (never default-allow), and a lost activation audit reverts the flag
 *   flip instead of leaving a live-but-unaudited row (same posture as the
 *   install lane's K3 audit-kill compensation).
 * - Re-approving the same fingerprint + decision writes no duplicate row
 *   (unique backstop + read-before-write + 23505 race re-read).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import {
  metricRecorder,
  allowAllRateLimits,
} from "./__fixtures__/test-doubles";
import {
  validateDevThemeBundle,
  type DevThemeBundleFile,
  type DevThemeBundleInput,
} from "./dev-theme-bundle";
import { DEV_THEME_RUNTIME_VERSION } from "./dev-theme-manifest";
import {
  DevThemeReviewError,
  insertDevThemeAuditRow,
  loadDevThemeApproval,
  persistDevThemeReview,
  persistDevThemeSubmission,
  publishDevThemeRelease,
} from "./dev-theme-review";

type Recorder = ReturnType<typeof metricRecorder>;
const rec = vi.hoisted(() => ({ holder: null as Recorder | null }));
const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("./observability.server", () => rec.holder!.observability);
vi.mock("./rate-limit.server", () => allowAllRateLimits());

const { activateDevThemeInstall, DevThemeActivationError } =
  await import("./dev-theme-activate");
const { installReviewedThemeBundle } =
  await import("./dev-theme-bundle-install");

const MERCHANT = "22222222-2222-2222-2222-222222222222";
const SELLER = "11111111-1111-1111-1111-111111111111";
const ACTOR = "99999999-9999-4999-8999-999999999999";
const LISTING_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const THEME_SLUG = "aurora-lookbook";

const GSAP_DEP = {
  name: "gsap",
  version: "3.15.0",
  license: "MIT",
  integrity: "sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
};

const T0 = "2026-10-01T00:00:00.000Z";
const T1 = "2026-10-02T00:00:00.000Z";
const MOD = { id: "reviewer-1", role: "moderator" } as const;

function manifest(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: THEME_SLUG,
    version: "1.0.0",
    runtime: DEV_THEME_RUNTIME_VERSION,
    name: "Aurora Lookbook",
    publisher: "Studio Framique",
    capabilities: ["presentation", "animation"],
    dependencies: [{ ...GSAP_DEP }],
    sections: [{ key: "hero", slot: "main", component: "HeroCanvas" }],
    settings: [{ key: "headline", label: "Headline", type: "text" }],
    ...over,
  };
}

function file(path: string, text: string): DevThemeBundleFile {
  return { path, bytes: new TextEncoder().encode(text) };
}

function bundleInput(hero = `export const h = 1;`): DevThemeBundleInput {
  const m = manifest();
  return {
    manifest: m,
    files: [
      file("dev.theme.json", JSON.stringify(m)),
      file("components/Hero.js", hero),
    ],
    dependencies: [{ ...GSAP_DEP }],
    allowedNetworkHosts: [],
  };
}

/** Durable review tables plus every table the install/activate lanes touch. */
function persistDb() {
  return fakeDb({
    tables: {
      dev_theme_releases: [],
      dev_theme_reviews: [],
      marketplace_themes: [],
      marketplace_installs: [],
      store_themes: [],
      theme_versions: [],
      theme_drafts: [],
      activity_log: [],
      theme_audit: [],
      wallet_ledger_entries: [],
    },
    unique: [
      {
        table: "dev_theme_releases",
        columns: ["merchant_id", "theme_id", "fingerprint"],
      },
      {
        table: "dev_theme_reviews",
        columns: ["merchant_id", "theme_id", "fingerprint", "decision"],
      },
    ],
  });
}

type PersistClient = Parameters<typeof persistDevThemeSubmission>[0];

function listingInput(priceMinor = 0) {
  return {
    id: LISTING_ID,
    slug: THEME_SLUG,
    name: "Aurora Lookbook",
    version: "1.0.0",
    price_minor_int: priceMinor,
    currency_code: "BDT",
    seller_merchant_id: SELLER,
    install_count: 0,
  };
}

/** Submit → approve → publish through the DURABLE adapter (no memory store). */
async function approvedDurable(db: ReturnType<typeof persistDb>) {
  const client = db.asClient() as PersistClient;
  const v = validateDevThemeBundle(bundleInput());
  expect(v.ok).toBe(true);
  if (!v.ok) throw new Error("fixture bundle rejected");
  await persistDevThemeSubmission(client, {
    merchantId: SELLER,
    themeId: THEME_SLUG,
    manifest: v.manifest,
    files: v.files,
    fingerprint: v.fingerprint,
    submittedBy: "dev-1",
    submittedAt: T0,
  });
  await persistDevThemeReview(client, {
    releaseId: "unresolved",
    merchantId: SELLER,
    themeId: THEME_SLUG,
    fingerprint: v.fingerprint,
    reviewer: { ...MOD },
    decision: "approve",
    reason: "clean scan, fallback proof attached",
    reviewedAt: T1,
  });
  await publishDevThemeRelease(client, {
    merchantId: SELLER,
    themeId: THEME_SLUG,
    fingerprint: v.fingerprint,
    actor: { ...MOD },
    publishedAt: T1,
  });
  const loaded = await loadDevThemeApproval(
    client,
    SELLER,
    THEME_SLUG,
    v.fingerprint,
  );
  expect(loaded).not.toBeNull();
  return { release: loaded!.release, fingerprint: v.fingerprint };
}

async function installed(
  db: ReturnType<typeof persistDb>,
  release: Awaited<ReturnType<typeof approvedDurable>>["release"],
  key: string,
) {
  const out = (await installReviewedThemeBundle(
    db.asClient() as PersistClient,
    MERCHANT,
    {
      release,
      bytes: bundleInput(),
      idempotencyKey: key,
      listing: listingInput(),
      trial: false,
      consentedBy: ACTOR,
      expectedThemeId: THEME_SLUG,
    },
  )) as unknown as { installId: string };
  const theme = db
    .rows("store_themes")
    .find(
      (r) =>
        (r as { source_install_id?: unknown }).source_install_id ===
        out.installId,
    );
  expect(theme).toBeDefined();
  return { installId: out.installId, themeId: (theme as { id: string }).id };
}

beforeEach(() => recorder.reset());

describe("durable review store — submit → approve → activate round-trip", () => {
  it("persists the submission, approval, and activation audit in Supabase rows", async () => {
    const db = persistDb();
    const client = db.asClient() as PersistClient;
    const { release, fingerprint } = await approvedDurable(db);

    expect(release.status).toBe("published");
    expect(
      release.reviews.some(
        (r) => r.decision === "approve" && r.fingerprint === fingerprint,
      ),
    ).toBe(true);
    expect(db.rows("dev_theme_releases")).toHaveLength(1);
    expect(db.rows("dev_theme_reviews")).toHaveLength(1);

    const { installId, themeId } = await installed(db, release, "persist-ok-1");
    const out = await activateDevThemeInstall(
      db.asClient() as PersistClient,
      MERCHANT,
      {
        installId,
        themeId,
        release,
        expectedFingerprint: fingerprint,
        expectedThemeId: THEME_SLUG,
        actorId: ACTOR,
      },
    );
    expect(out).toMatchObject({ themeId, fingerprint });
    const themes = db.rows("store_themes") as {
      id: string;
      is_active: boolean;
    }[];
    expect(themes.find((t) => t.id === themeId)!.is_active).toBe(true);
    const audit = db.rows("theme_audit") as {
      action: string;
      after: { fingerprint: string; release_id: string };
    }[];
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "dev_theme.activated" });
    expect(audit[0]!.after.fingerprint).toBe(fingerprint);
    void client;
  });

  it("resubmitting identical bytes is idempotent (same durable row)", async () => {
    const db = persistDb();
    const client = db.asClient() as PersistClient;
    const v = validateDevThemeBundle(bundleInput());
    expect(v.ok).toBe(true);
    if (!v.ok) throw new Error("fixture bundle rejected");
    const input = {
      merchantId: SELLER,
      themeId: THEME_SLUG,
      manifest: v.manifest,
      files: v.files,
      fingerprint: v.fingerprint,
      submittedBy: "dev-1",
      submittedAt: T0,
    };
    const first = await persistDevThemeSubmission(client, input);
    expect(first.deduplicated).toBe(false);
    const second = await persistDevThemeSubmission(client, {
      ...input,
      submittedAt: T1,
    });
    expect(second.deduplicated).toBe(true);
    expect(second.release.id).toBe(first.release.id);
    expect(db.rows("dev_theme_releases")).toHaveLength(1);
  });
});

describe("durable review store — fingerprint-mismatch refusal", () => {
  it("a tampered fingerprint never activates (no flag, no audit)", async () => {
    const db = persistDb();
    const { release } = await approvedDurable(db);
    const { themeId } = await installed(db, release, "persist-tamp-1");
    await expect(
      activateDevThemeInstall(db.asClient() as PersistClient, MERCHANT, {
        themeId,
        release,
        expectedFingerprint: "c".repeat(64),
        actorId: ACTOR,
      }),
    ).rejects.toThrow(/fingerprint_mismatch/);
    const themes = db.rows("store_themes") as {
      id: string;
      is_active: boolean;
    }[];
    expect(themes.find((t) => t.id === themeId)!.is_active).toBe(false);
    expect(db.rows("theme_audit")).toHaveLength(0);
  });
});

describe("durable review store — DB faults fail closed", () => {
  /** A client whose review-store reads are down (outage, RLS break, DDL lag). */
  function storeOutageDb(real: ReturnType<typeof persistDb>) {
    const t = real.asClient() as {
      from: (table: string) => unknown;
    };
    const inner = t.from.bind(t);
    return {
      from: (table: string) => {
        if (table === "dev_theme_releases" || table === "dev_theme_reviews") {
          throw new Error("injected_store_outage");
        }
        return inner(table);
      },
    } as unknown as PersistClient;
  }

  it("an unreadable review store refuses the load (never default-allow)", async () => {
    const db = persistDb();
    const client = db.asClient() as PersistClient;
    const v = validateDevThemeBundle(bundleInput());
    expect(v.ok).toBe(true);
    if (!v.ok) throw new Error("fixture bundle rejected");
    await persistDevThemeSubmission(client, {
      merchantId: SELLER,
      themeId: THEME_SLUG,
      manifest: v.manifest,
      files: v.files,
      fingerprint: v.fingerprint,
      submittedBy: "dev-1",
      submittedAt: T0,
    });
    const err = await loadDevThemeApproval(
      storeOutageDb(db),
      SELLER,
      THEME_SLUG,
      v.fingerprint,
    ).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(DevThemeReviewError);
    expect((err as DevThemeReviewError).code).toBe(
      "dev_theme.store_unreadable",
    );
    // The refusal happens before any write: no activation rows land anywhere.
    expect(db.rows("store_themes")).toHaveLength(0);
    expect(db.rows("theme_audit")).toHaveLength(0);
  });

  it("an unwritable review store refuses the submission", async () => {
    const db = persistDb();
    const v = validateDevThemeBundle(bundleInput());
    expect(v.ok).toBe(true);
    if (!v.ok) throw new Error("fixture bundle rejected");
    const err = await persistDevThemeSubmission(storeOutageDb(db), {
      merchantId: SELLER,
      themeId: THEME_SLUG,
      manifest: v.manifest,
      files: v.files,
      fingerprint: v.fingerprint,
      submittedBy: "dev-1",
      submittedAt: T0,
    }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(DevThemeReviewError);
    expect(String((err as DevThemeReviewError).code)).toMatch(
      /store_unreadable|store_unwritable/,
    );
    expect(db.rows("dev_theme_releases")).toHaveLength(0);
  });

  it("a lost activation audit reverts the flag (no live-but-unaudited row)", async () => {
    const db = persistDb();
    const { release, fingerprint } = await approvedDurable(db);
    const { installId, themeId } = await installed(db, release, "persist-ak-1");
    const t = db.asClient() as { from: (table: string) => unknown };
    const inner = t.from.bind(t);
    const auditKilled = {
      from: (table: string) => {
        const q = inner(table) as Record<string, (...a: never[]) => unknown>;
        if (table !== "theme_audit") return q;
        return new Proxy(q, {
          get(
            qt: Record<string, (...a: never[]) => unknown>,
            qp: string | symbol,
          ) {
            if (qp === "insert")
              return () => ({
                data: null,
                error: { message: "injected_audit_failure" },
              });
            const val = qt[qp as string];
            return typeof val === "function" ? val.bind(qt) : val;
          },
        });
      },
    } as unknown as PersistClient;
    await expect(
      activateDevThemeInstall(auditKilled, MERCHANT, {
        installId,
        themeId,
        release,
        expectedFingerprint: fingerprint,
        expectedThemeId: THEME_SLUG,
        actorId: ACTOR,
      }),
    ).rejects.toThrow(DevThemeActivationError);
    await expect(
      activateDevThemeInstall(auditKilled, MERCHANT, {
        installId,
        themeId,
        release,
        expectedFingerprint: fingerprint,
        expectedThemeId: THEME_SLUG,
        actorId: ACTOR,
      }),
    ).rejects.toThrow(/audit_failed/);
    const themes = db.rows("store_themes") as {
      id: string;
      is_active: boolean;
    }[];
    expect(themes.find((t) => t.id === themeId)!.is_active).toBe(false);
    expect(db.rows("theme_audit")).toHaveLength(0);
  });

  it("the audit-row helper fails closed when theme_audit is down", async () => {
    const db = persistDb();
    const { release } = await approvedDurable(db);
    const { audit } = await persistDevThemeReview(
      db.asClient() as PersistClient,
      {
        releaseId: "unresolved",
        merchantId: SELLER,
        themeId: THEME_SLUG,
        fingerprint: release.fingerprint,
        reviewer: { id: "reviewer-2", role: "moderator" },
        decision: "approve",
        reason: "second look",
        reviewedAt: T1,
      },
    );
    const t = db.asClient() as { from: (table: string) => unknown };
    const inner = t.from.bind(t);
    const auditDown = {
      from: (table: string) => {
        if (table === "theme_audit") throw new Error("injected_audit_outage");
        return inner(table);
      },
    } as unknown as PersistClient;
    const err = await insertDevThemeAuditRow(auditDown, audit).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(DevThemeReviewError);
    expect((err as DevThemeReviewError).code).toBe("dev_theme.audit_failed");
  });
});

describe("durable review store — idempotent approval writes", () => {
  it("re-approving the same fingerprint + decision writes no duplicate row", async () => {
    const db = persistDb();
    const client = db.asClient() as PersistClient;
    const v = validateDevThemeBundle(bundleInput());
    expect(v.ok).toBe(true);
    if (!v.ok) throw new Error("fixture bundle rejected");
    await persistDevThemeSubmission(client, {
      merchantId: SELLER,
      themeId: THEME_SLUG,
      manifest: v.manifest,
      files: v.files,
      fingerprint: v.fingerprint,
      submittedBy: "dev-1",
      submittedAt: T0,
    });
    const first = await persistDevThemeReview(client, {
      releaseId: "unresolved",
      merchantId: SELLER,
      themeId: THEME_SLUG,
      fingerprint: v.fingerprint,
      reviewer: { ...MOD },
      decision: "approve",
      reason: "clean scan",
      reviewedAt: T1,
    });
    const second = await persistDevThemeReview(client, {
      releaseId: "unresolved",
      merchantId: SELLER,
      themeId: THEME_SLUG,
      fingerprint: v.fingerprint,
      reviewer: { id: "reviewer-2", role: "admin" },
      decision: "approve",
      reason: "second look, still clean",
      reviewedAt: T1,
    });
    expect(second.review.id).toBe(first.review.id);
    expect(db.rows("dev_theme_reviews")).toHaveLength(1);
    // The returned audit event lands in the existing theme_audit shape.
    await insertDevThemeAuditRow(client, first.audit);
    expect(
      db.rows("theme_audit").filter((r) => r.action === "dev_theme.reviewed"),
    ).toHaveLength(1);
    const loaded = await loadDevThemeApproval(
      client,
      SELLER,
      THEME_SLUG,
      v.fingerprint,
    );
    expect(loaded!.release.status).toBe("approved");
  });

  it("a duplicate-key race on approval returns the existing row", async () => {
    const db = persistDb();
    const client = db.asClient() as PersistClient;
    const v = validateDevThemeBundle(bundleInput());
    expect(v.ok).toBe(true);
    if (!v.ok) throw new Error("fixture bundle rejected");
    await persistDevThemeSubmission(client, {
      merchantId: SELLER,
      themeId: THEME_SLUG,
      manifest: v.manifest,
      files: v.files,
      fingerprint: v.fingerprint,
      submittedBy: "dev-1",
      submittedAt: T0,
    });
    // First approval lands; then hide it from the read path once so the
    // second call races past the pre-check into the unique backstop.
    await persistDevThemeReview(client, {
      releaseId: "unresolved",
      merchantId: SELLER,
      themeId: THEME_SLUG,
      fingerprint: v.fingerprint,
      reviewer: { ...MOD },
      decision: "approve",
      reason: "clean scan",
      reviewedAt: T1,
    });
    const t = db.asClient() as { from: (table: string) => unknown };
    const inner = t.from.bind(t);
    let hideOnce = true;
    const racy = {
      from: (table: string) => {
        const q = inner(table) as Record<string, (...a: never[]) => unknown>;
        if (table !== "dev_theme_reviews" || !hideOnce) return q;
        hideOnce = false;
        return new Proxy(q, {
          get(
            qt: Record<string, (...a: never[]) => unknown>,
            qp: string | symbol,
          ) {
            if (qp === "maybeSingle")
              return async () => ({ data: null, error: null });
            const val = qt[qp as string];
            return typeof val === "function" ? val.bind(qt) : val;
          },
        });
      },
    } as unknown as PersistClient;
    const out = await persistDevThemeReview(racy, {
      releaseId: "unresolved",
      merchantId: SELLER,
      themeId: THEME_SLUG,
      fingerprint: v.fingerprint,
      reviewer: { id: "reviewer-2", role: "admin" },
      decision: "approve",
      reason: "racy second look",
      reviewedAt: T1,
    });
    expect(out.review.decision).toBe("approve");
    expect(db.rows("dev_theme_reviews")).toHaveLength(1);
  });
});
