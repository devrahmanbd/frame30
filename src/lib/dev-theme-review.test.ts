import { describe, expect, it } from "vitest";
import {
  createDevThemeReleaseStore,
  toActivityLogRow,
  toThemeAuditRow,
  type DevThemeRelease,
} from "./dev-theme-review";
import {
  validateDevThemeBundle,
  type DevThemeBundleFile,
} from "./dev-theme-bundle";
import { DEV_THEME_RUNTIME_VERSION } from "./dev-theme-manifest";

/**
 * Level B moderator workflow — TDD vectors.
 *
 * submit → review(decision + reviewer + timestamp + reason) → approve
 * (binds exact fingerprint) → published pointer. ANY code/dependency/
 * capability change mints a new reviewable version; approval never
 * transfers across fingerprints. All transitions emit audit rows shaped
 * for the existing theme_audit / activity_log tables (no migration).
 */

const GSAP_DEP = {
  name: "gsap",
  version: "3.15.0",
  license: "MIT",
  integrity: "sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
};

function manifest(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "aurora-lookbook",
    version: "1.0.0",
    runtime: DEV_THEME_RUNTIME_VERSION,
    name: "Aurora Lookbook",
    publisher: "Studio Framique",
    capabilities: ["presentation"],
    dependencies: [{ ...GSAP_DEP }],
    sections: [],
    settings: [],
    ...over,
  };
}

function file(path: string, text: string): DevThemeBundleFile {
  return { path, bytes: new TextEncoder().encode(text) };
}

function bundleFor(m: Record<string, unknown>, hero = `export const h = 1;`) {
  const verdict = validateDevThemeBundle({
    manifest: m,
    files: [
      file("dev.theme.json", JSON.stringify(m)),
      file("components/Hero.js", hero),
    ],
    dependencies: (m.dependencies ?? []) as (typeof GSAP_DEP)[],
  });
  expect(verdict.ok).toBe(true);
  if (!verdict.ok) throw new Error("fixture bundle rejected");
  return verdict;
}

const MOD = { id: "reviewer-1", role: "moderator" } as const;
const T0 = "2026-10-01T00:00:00.000Z";
const T1 = "2026-10-02T00:00:00.000Z";

function submitted() {
  const store = createDevThemeReleaseStore();
  const v = bundleFor(manifest());
  const { release } = store.submit({
    merchantId: "m1",
    themeId: "aurora-lookbook",
    manifest: v.manifest,
    files: v.files,
    fingerprint: v.fingerprint,
    submittedBy: "dev-1",
    submittedAt: T0,
  });
  return { store, release, fingerprint: v.fingerprint };
}

function approved() {
  const { store, release, fingerprint } = submitted();
  store.review({
    releaseId: release.id,
    merchantId: "m1",
    reviewer: { ...MOD },
    decision: "approve",
    reason: "clean scan, fallback proof attached",
    reviewedAt: T1,
  });
  return {
    store,
    release: store.get(release.id) as DevThemeRelease,
    fingerprint,
  };
}

describe("dev-theme review — submit", () => {
  it("submit mints an in_review version addressable by fingerprint", () => {
    const { store, release, fingerprint } = submitted();
    expect(release.status).toBe("in_review");
    expect(
      store.getByFingerprint("m1", "aurora-lookbook", fingerprint)?.id,
    ).toBe(release.id);
  });

  it("resubmitting identical bytes is idempotent (same release)", () => {
    const { store, release, fingerprint } = submitted();
    const v = bundleFor(manifest());
    const again = store.submit({
      merchantId: "m1",
      themeId: "aurora-lookbook",
      manifest: v.manifest,
      files: v.files,
      fingerprint: v.fingerprint,
      submittedBy: "dev-1",
      submittedAt: T1,
    });
    expect(again.release.id).toBe(release.id);
    expect(again.release.fingerprint).toBe(fingerprint);
  });

  it("ANY code change mints a new reviewable version", () => {
    const { store, release } = submitted();
    const v = bundleFor(manifest(), `export const h = 2;`);
    const next = store.submit({
      merchantId: "m1",
      themeId: "aurora-lookbook",
      manifest: v.manifest,
      files: v.files,
      fingerprint: v.fingerprint,
      submittedBy: "dev-1",
      submittedAt: T1,
    });
    expect(next.release.id).not.toBe(release.id);
    expect(next.release.fingerprint).not.toBe(release.fingerprint);
    expect(next.release.status).toBe("in_review");
  });

  it("a capability change mints a new reviewable version", () => {
    const { store, release } = submitted();
    const m = manifest({ capabilities: ["presentation", "animation"] });
    const v = bundleFor(m);
    const next = store.submit({
      merchantId: "m1",
      themeId: "aurora-lookbook",
      manifest: v.manifest,
      files: v.files,
      fingerprint: v.fingerprint,
      submittedBy: "dev-1",
      submittedAt: T1,
    });
    expect(next.release.fingerprint).not.toBe(release.fingerprint);
  });

  it("a dependency change mints a new reviewable version", () => {
    const { store, release } = submitted();
    const m = manifest({
      dependencies: [{ ...GSAP_DEP, version: "3.16.0" }],
    });
    const bundle = validateDevThemeBundle({
      manifest: m,
      files: [
        file("dev.theme.json", JSON.stringify(m)),
        file("components/Hero.js", `export const h = 1;`),
      ],
      dependencies: [{ ...GSAP_DEP, version: "3.16.0" }],
    });
    expect(bundle.ok).toBe(true);
    if (!bundle.ok) return;
    const next = store.submit({
      merchantId: "m1",
      themeId: "aurora-lookbook",
      manifest: bundle.manifest,
      files: bundle.files,
      fingerprint: bundle.fingerprint,
      submittedBy: "dev-1",
      submittedAt: T1,
    });
    expect(next.release.fingerprint).not.toBe(release.fingerprint);
  });
});

describe("dev-theme review — review() requires reviewer identity", () => {
  it("approve-decision records reviewer, role, timestamp, reason", () => {
    const { store, release } = submitted();
    const out = store.review({
      releaseId: release.id,
      merchantId: "m1",
      reviewer: { ...MOD },
      decision: "approve",
      reason: "looks good",
      reviewedAt: T1,
    });
    expect(out.release.status).toBe("approved");
    const [record] = out.release.reviews;
    expect(record.reviewerId).toBe("reviewer-1");
    expect(record.reviewerRole).toBe("moderator");
    expect(record.reviewedAt).toBe(T1);
    expect(record.reason).toBe("looks good");
    expect(record.fingerprint).toBe(release.fingerprint);
  });

  it("reject-decision moves to rejected with a reason", () => {
    const { store, release } = submitted();
    const out = store.review({
      releaseId: release.id,
      merchantId: "m1",
      reviewer: { ...MOD },
      decision: "reject",
      reason: "remote host without allowlist",
      reviewedAt: T1,
    });
    expect(out.release.status).toBe("rejected");
  });

  it("refuses a review without reviewer identity (fills the flagged gap)", () => {
    const { store, release } = submitted();
    expect(() =>
      store.review({
        releaseId: release.id,
        merchantId: "m1",
        reviewer: { id: "", role: "moderator" },
        decision: "approve",
        reason: "ok",
        reviewedAt: T1,
      }),
    ).toThrow(/reviewer/);
  });

  it("refuses an unknown reviewer role", () => {
    const { store, release } = submitted();
    expect(() =>
      store.review({
        releaseId: release.id,
        merchantId: "m1",
        reviewer: { id: "r1", role: "merchant" as never },
        decision: "approve",
        reason: "ok",
        reviewedAt: T1,
      }),
    ).toThrow(/role/);
  });

  it("refuses a review without a reason or timestamp", () => {
    const { store, release } = submitted();
    expect(() =>
      store.review({
        releaseId: release.id,
        merchantId: "m1",
        reviewer: { ...MOD },
        decision: "approve",
        reason: "  ",
        reviewedAt: T1,
      }),
    ).toThrow(/reason/);
    expect(() =>
      store.review({
        releaseId: release.id,
        merchantId: "m1",
        reviewer: { ...MOD },
        decision: "approve",
        reason: "ok",
        reviewedAt: "not-a-date",
      }),
    ).toThrow(/timestamp/);
  });
});

describe("dev-theme review — approval never transfers across fingerprints", () => {
  it("publishes the exact approved fingerprint", () => {
    const { store, release, fingerprint } = approved();
    const out = store.publish({
      releaseId: release.id,
      merchantId: "m1",
      actor: { ...MOD },
      expectedFingerprint: fingerprint,
      publishedAt: T1,
    });
    expect(out.release.status).toBe("published");
    expect(store.published("m1", "aurora-lookbook")?.id).toBe(release.id);
  });

  it("FAILING FIRST: a modified bundle never publishes under an old approval", () => {
    const { store, release, fingerprint } = approved();
    // The approved release publishes fine…
    store.publish({
      releaseId: release.id,
      merchantId: "m1",
      actor: { ...MOD },
      expectedFingerprint: fingerprint,
      publishedAt: T1,
    });
    // …but one changed byte mints a new version the old approval cannot cover.
    const v = bundleFor(manifest(), `export const h = 999;`);
    const { release: tampered } = store.submit({
      merchantId: "m1",
      themeId: "aurora-lookbook",
      manifest: v.manifest,
      files: v.files,
      fingerprint: v.fingerprint,
      submittedBy: "dev-1",
      submittedAt: T1,
    });
    // Direct publish: not approved.
    expect(() =>
      store.publish({
        releaseId: tampered.id,
        merchantId: "m1",
        actor: { ...MOD },
        expectedFingerprint: tampered.fingerprint,
        publishedAt: T1,
      }),
    ).toThrow(/approval/);
    // Smuggled old fingerprint: mismatch with the release's own bytes.
    expect(() =>
      store.publish({
        releaseId: tampered.id,
        merchantId: "m1",
        actor: { ...MOD },
        expectedFingerprint: fingerprint,
        publishedAt: T1,
      }),
    ).toThrow(/fingerprint/);
  });

  it("publish of an in_review (never-approved) release refuses", () => {
    const { store, release } = submitted();
    expect(() =>
      store.publish({
        releaseId: release.id,
        merchantId: "m1",
        actor: { ...MOD },
        expectedFingerprint: release.fingerprint,
        publishedAt: T1,
      }),
    ).toThrow(/approval/);
  });

  it("rejected releases cannot publish", () => {
    const { store, release } = submitted();
    store.review({
      releaseId: release.id,
      merchantId: "m1",
      reviewer: { ...MOD },
      decision: "reject",
      reason: "nope",
      reviewedAt: T1,
    });
    expect(() =>
      store.publish({
        releaseId: release.id,
        merchantId: "m1",
        actor: { ...MOD },
        expectedFingerprint: release.fingerprint,
        publishedAt: T1,
      }),
    ).toThrow();
  });
});

describe("dev-theme review — immutability, pointer, rollback", () => {
  it("publishing a newer approved release retains the previous known-good", () => {
    const { store, release: r1, fingerprint: fp1 } = approved();
    store.publish({
      releaseId: r1.id,
      merchantId: "m1",
      actor: { ...MOD },
      expectedFingerprint: fp1,
      publishedAt: T1,
    });
    const v = bundleFor(manifest({ version: "1.0.1" }), `export const h = 2;`);
    const { release: r2 } = store.submit({
      merchantId: "m1",
      themeId: "aurora-lookbook",
      manifest: v.manifest,
      files: v.files,
      fingerprint: v.fingerprint,
      submittedBy: "dev-1",
      submittedAt: T1,
    });
    store.review({
      releaseId: r2.id,
      merchantId: "m1",
      reviewer: { ...MOD },
      decision: "approve",
      reason: "v2 ok",
      reviewedAt: T1,
    });
    store.publish({
      releaseId: r2.id,
      merchantId: "m1",
      actor: { ...MOD },
      expectedFingerprint: r2.fingerprint,
      publishedAt: T1,
    });
    // Previous known-good retained and still addressable by fingerprint.
    const prev = store.getByFingerprint("m1", "aurora-lookbook", fp1);
    expect(prev?.status).toBe("superseded");
    expect(prev?.files.map((f) => f.sha256)).toEqual(
      r1.files.map((f) => f.sha256),
    );
    expect(store.published("m1", "aurora-lookbook")?.id).toBe(r2.id);
  });

  it("rollback restores the exact approved bytes as a new release", () => {
    const { store, release: r1, fingerprint: fp1 } = approved();
    store.publish({
      releaseId: r1.id,
      merchantId: "m1",
      actor: { ...MOD },
      expectedFingerprint: fp1,
      publishedAt: T1,
    });
    const v = bundleFor(manifest({ version: "1.0.1" }), `export const h = 2;`);
    const { release: r2 } = store.submit({
      merchantId: "m1",
      themeId: "aurora-lookbook",
      manifest: v.manifest,
      files: v.files,
      fingerprint: v.fingerprint,
      submittedBy: "dev-1",
      submittedAt: T1,
    });
    store.review({
      releaseId: r2.id,
      merchantId: "m1",
      reviewer: { ...MOD },
      decision: "approve",
      reason: "v2 ok",
      reviewedAt: T1,
    });
    store.publish({
      releaseId: r2.id,
      merchantId: "m1",
      actor: { ...MOD },
      expectedFingerprint: r2.fingerprint,
      publishedAt: T1,
    });
    const rolled = store.rollback({
      merchantId: "m1",
      themeId: "aurora-lookbook",
      targetFingerprint: fp1,
      actor: { ...MOD },
      rolledBackAt: T1,
    });
    expect(rolled.release.id).not.toBe(r1.id);
    expect(rolled.release.fingerprint).toBe(fp1);
    expect(rolled.release.rollbackOf).toBe(r1.id);
    expect(rolled.release.status).toBe("published");
    expect(rolled.release.files.map((f) => f.sha256)).toEqual(
      r1.files.map((f) => f.sha256),
    );
    expect(store.published("m1", "aurora-lookbook")?.id).toBe(
      rolled.release.id,
    );
  });

  it("rollback of a never-approved fingerprint refuses", () => {
    const { store } = submitted();
    const v = bundleFor(manifest(), `export const h = 7;`);
    // The bytes are known (submitted) but never reviewed: rollback to
    // unreviewed bytes refuses with approval_required, not not_found.
    store.submit({
      merchantId: "m1",
      themeId: "aurora-lookbook",
      manifest: v.manifest,
      files: v.files,
      fingerprint: v.fingerprint,
      submittedBy: "dev-1",
      submittedAt: T1,
    });
    expect(() =>
      store.rollback({
        merchantId: "m1",
        themeId: "aurora-lookbook",
        targetFingerprint: v.fingerprint,
        actor: { ...MOD },
        rolledBackAt: T1,
      }),
    ).toThrow(/approv/);
  });
});

describe("dev-theme review — reject / revoke / remove-compromised", () => {
  it("revoke parks a published release and clears the pointer", () => {
    const { store, release, fingerprint } = approved();
    store.publish({
      releaseId: release.id,
      merchantId: "m1",
      actor: { ...MOD },
      expectedFingerprint: fingerprint,
      publishedAt: T1,
    });
    const out = store.revoke({
      releaseId: release.id,
      merchantId: "m1",
      actor: { ...MOD },
      reason: "license violation",
      revokedAt: T1,
    });
    expect(out.release.status).toBe("revoked");
    expect(store.published("m1", "aurora-lookbook")).toBeNull();
  });

  it("remove-compromised quarantines bytes but retains hashes for forensics", () => {
    const { store, release, fingerprint } = approved();
    store.publish({
      releaseId: release.id,
      merchantId: "m1",
      actor: { ...MOD },
      expectedFingerprint: fingerprint,
      publishedAt: T1,
    });
    const out = store.removeCompromised({
      releaseId: release.id,
      merchantId: "m1",
      actor: { id: "admin-1", role: "admin" },
      reason: "credential exfiltration confirmed",
      removedAt: T1,
    });
    expect(out.release.status).toBe("removed");
    expect(out.release.files.length).toBe(0);
    expect(out.release.fileHashes.length).toBeGreaterThan(0);
    // Still addressable by fingerprint for forensics.
    expect(
      store.getByFingerprint("m1", "aurora-lookbook", fingerprint)?.status,
    ).toBe("removed");
    expect(store.published("m1", "aurora-lookbook")).toBeNull();
  });

  it("a removed release can never publish again", () => {
    const { store, release, fingerprint } = approved();
    store.publish({
      releaseId: release.id,
      merchantId: "m1",
      actor: { ...MOD },
      expectedFingerprint: fingerprint,
      publishedAt: T1,
    });
    store.removeCompromised({
      releaseId: release.id,
      merchantId: "m1",
      actor: { id: "admin-1", role: "admin" },
      reason: "compromised",
      removedAt: T1,
    });
    expect(() =>
      store.publish({
        releaseId: release.id,
        merchantId: "m1",
        actor: { ...MOD },
        expectedFingerprint: fingerprint,
        publishedAt: T1,
      }),
    ).toThrow();
  });
});

describe("dev-theme review — audit rows reuse existing table shapes", () => {
  it("every transition emits a theme_audit-shaped row", () => {
    const { store, release } = submitted();
    const reviewed = store.review({
      releaseId: release.id,
      merchantId: "m1",
      reviewer: { ...MOD },
      decision: "approve",
      reason: "ok",
      reviewedAt: T1,
    });
    const row = toThemeAuditRow(reviewed.audit);
    expect(row).toMatchObject({
      merchant_id: "m1",
      action: "dev_theme.reviewed",
      actor: "reviewer-1",
    });
    expect(typeof row.theme_id).toBe("string");
    expect(row.after).toMatchObject({ fingerprint: release.fingerprint });
  });

  it("every transition emits an activity_log-shaped row", () => {
    const { store, release, fingerprint } = approved();
    const published = store.publish({
      releaseId: release.id,
      merchantId: "m1",
      actor: { ...MOD },
      expectedFingerprint: fingerprint,
      publishedAt: T1,
    });
    const row = toActivityLogRow(published.audit);
    expect(row).toMatchObject({
      merchant_id: "m1",
      action: "dev_theme.published",
      resource_type: "dev_theme",
    });
    expect((row.changed as Record<string, unknown>).fingerprint).toBe(
      fingerprint,
    );
  });
});
