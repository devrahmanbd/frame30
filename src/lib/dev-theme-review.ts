/**
 * Level B (reviewed developer themes) — moderator workflow (pure).
 *
 * PURE module: no database, no network, no filesystem, no clock. The
 * caller owns persistence (the in-memory store here is a value the caller
 * holds; a Supabase backing is a follow-up) and supplies timestamps — this
 * keeps every transition deterministic and unit-testable.
 *
 * Lifecycle: submit → review(decision + reviewer identity + timestamp +
 * reason) → approve (binds the EXACT fingerprint) → publish (moves the
 * published pointer). ANY code, dependency, or capability change alters the
 * bundle fingerprint (`fingerprintDevThemeRelease`), so it mints a NEW
 * reviewable version by construction: submit is idempotent on fingerprint,
 * and approval binds a fingerprint, never a row id — an approval can never
 * transfer to modified bytes.
 *
 * Reviewer identity (fills the flagged gap): unlike the marketplace
 * `reviewVersion` (`marketplace-vault.server.ts`, no actor param — left
 * untouched), every transition here takes an explicit actor with a closed
 * reviewer role. Anonymous or mis-roled reviews throw before any write.
 *
 * Audit (no migration — justified): every transition returns an audit event;
 * `toThemeAuditRow` / `toActivityLogRow` shape it for the EXISTING
 * `theme_audit` (merchant_id/theme_id/actor/action/before/after) and
 * `activity_log` (merchant_id/actor/action/resource_type/resource_id/changed)
 * tables. Both are free-form JSON audit trails — the new `dev_theme.*`
 * action codes fit the existing columns, RLS is untouched, and no schema
 * change is required. A migration adding a dedicated table would add
 * surface without adding evidence.
 *
 * Rollback precedent: like `rollbackPackage` / `rollbackPluginPackage`
 * (`package-install.server.ts` K3), a rollback mints a NEW release carrying
 * the target's exact approved bytes with an explicit `rollbackOf` link plus
 * a `dev_theme.rolled_back` audit row — never an enable-flip. Revocation
 * parks the release and clears the pointer; remove-compromised quarantines
 * the bytes (hashes retained for forensics) under a separate terminal
 * status that can never publish again.
 *
 * Durability (this module's second half): the pure store above is unchanged
 * and stays the unit-test seam. The `persist*` / `load*` adapter below backs
 * it with Supabase (`dev_theme_releases` + `dev_theme_reviews`, migration
 * 20261015000000): submissions upsert on (merchant, theme, fingerprint),
 * approvals upsert on (merchant, theme, fingerprint, decision) — a
 * re-approval returns the existing row, never a duplicate — and every DB
 * fault throws before any trust decision (fail-closed: an unreadable store
 * refuses, it never default-allows). Audit events are still returned, not
 * written: the caller persists them with `insertDevThemeAuditRow`, which
 * throws when the audit row does not land. Durable addressing is always the
 * fingerprint, never a row id — the pure `releaseId` is accepted for
 * signature symmetry and ignored for lookups.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { DevThemeManifest } from "./dev-theme-manifest";
import type { DevThemeHashedFile } from "./dev-theme-bundle";

export type DevThemeReleaseStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "published"
  | "superseded"
  | "rejected"
  | "revoked"
  | "removed";

/** Closed reviewer vocabulary (lane-local: platform moderation, not
 * merchant roles — merchant roles govern tenant data, these govern the
 * review desk). */
export const DEV_THEME_REVIEWER_ROLES = [
  "moderator",
  "admin",
  "system",
] as const;
export type DevThemeReviewerRole = (typeof DEV_THEME_REVIEWER_ROLES)[number];

export type DevThemeActor = {
  id: string;
  role: DevThemeReviewerRole;
};

export type DevThemeReviewRecord = {
  reviewerId: string;
  reviewerRole: DevThemeReviewerRole;
  decision: "approve" | "reject";
  reason: string;
  reviewedAt: string;
  fingerprint: string;
};

export type DevThemeRelease = {
  id: string;
  merchantId: string;
  themeId: string;
  version: string;
  manifest: DevThemeManifest;
  files: DevThemeHashedFile[];
  /** Retained even when bytes are quarantined (remove-compromised), so a
   * removed release stays forensically addressable by fingerprint. */
  fileHashes: Array<{ path: string; sha256: string }>;
  fingerprint: string;
  status: DevThemeReleaseStatus;
  submittedBy: string;
  submittedAt: string;
  reviews: DevThemeReviewRecord[];
  /** Explicit rollback link (new release → restored target), never a flip. */
  rollbackOf: string | null;
  publishedAt: string | null;
};

export type DevThemeAuditEvent = {
  action:
    | "dev_theme.submitted"
    | "dev_theme.reviewed"
    | "dev_theme.published"
    | "dev_theme.rejected"
    | "dev_theme.revoked"
    | "dev_theme.removed"
    | "dev_theme.rolled_back";
  merchantId: string;
  themeId: string;
  releaseId: string;
  actorId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
};

export class DevThemeReviewError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DevThemeReviewError";
  }
}

function fail(code: string, message: string): never {
  throw new DevThemeReviewError(code, message);
}

function requireId(value: string, what: string): string {
  if (typeof value !== "string" || !value.trim()) {
    fail(`dev_theme.${what}_missing`, `${what} is required.`);
  }
  return value;
}

function requireActor(actor: DevThemeActor, what = "actor"): DevThemeActor {
  if (!actor || typeof actor.id !== "string" || !actor.id.trim()) {
    fail("dev_theme.reviewer_required", `${what} identity is required.`);
  }
  if (!(DEV_THEME_REVIEWER_ROLES as readonly string[]).includes(actor.role)) {
    fail("dev_theme.reviewer_role", `${what} role is not a reviewer role.`);
  }
  return actor;
}

function requireReason(reason: string): string {
  if (typeof reason !== "string" || !reason.trim()) {
    fail("dev_theme.reason_required", "A review reason is required.");
  }
  return reason.trim().slice(0, 500);
}

function requireTimestamp(value: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    fail("dev_theme.timestamp_invalid", "A valid ISO timestamp is required.");
  }
  return value;
}

/**
 * Shape a transition event for the existing `theme_audit` table
 * (merchant_id/theme_id/actor/action/before/after — see types.ts).
 */
export function toThemeAuditRow(event: DevThemeAuditEvent): {
  merchant_id: string;
  theme_id: string;
  actor: string | null;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
} {
  return {
    merchant_id: event.merchantId,
    theme_id: event.themeId,
    actor: event.actorId,
    action: event.action,
    before: event.before,
    after: event.after,
  };
}

/**
 * Shape a transition event for the existing `activity_log` table
 * (merchant_id/actor/action/resource_type/resource_id/changed — the shape
 * `auditAction` writes for plugin approvals).
 */
export function toActivityLogRow(event: DevThemeAuditEvent): {
  merchant_id: string;
  actor: string | null;
  action: string;
  resource_type: string;
  resource_id: string;
  changed: Record<string, unknown>;
} {
  return {
    merchant_id: event.merchantId,
    actor: event.actorId,
    action: event.action,
    resource_type: "dev_theme",
    resource_id: event.releaseId,
    changed: event.after,
  };
}

export type SubmitInput = {
  merchantId: string;
  themeId: string;
  manifest: DevThemeManifest;
  files: DevThemeHashedFile[];
  fingerprint: string;
  submittedBy: string;
  submittedAt: string;
};

export type ReviewInput = {
  releaseId: string;
  merchantId: string;
  reviewer: DevThemeActor;
  decision: "approve" | "reject";
  reason: string;
  reviewedAt: string;
};

export type PublishInput = {
  releaseId: string;
  merchantId: string;
  actor: DevThemeActor;
  /** The fingerprint the publisher reviewed. Must equal the release's own. */
  expectedFingerprint: string;
  publishedAt: string;
};

export type RevokeInput = {
  releaseId: string;
  merchantId: string;
  actor: DevThemeActor;
  reason: string;
  revokedAt: string;
};

export type RemoveCompromisedInput = {
  releaseId: string;
  merchantId: string;
  actor: DevThemeActor;
  reason: string;
  removedAt: string;
};

export type RollbackInput = {
  merchantId: string;
  themeId: string;
  targetFingerprint: string;
  actor: DevThemeActor;
  rolledBackAt: string;
};

/**
 * Caller-owned, in-memory release registry. Values are immutable snapshots;
 * every method returns the new release plus its audit event (persistence
 * and row writes are the caller's step, using the audit-row builders).
 */
export function createDevThemeReleaseStore() {
  let seq = 0;
  const releases = new Map<string, DevThemeRelease>();
  /** Fingerprint index per theme: every submitted fingerprint stays
   * addressable (immutability Rita: known-good bytes are never overwritten). */
  const byFingerprint = new Map<string, string>();
  /** Live pointer per theme: the single published release id (or null). */
  const pointer = new Map<string, string | null>();

  const scope = (merchantId: string, themeId: string) =>
    `${merchantId}:${themeId}`;

  function scopedRelease(
    releaseId: string,
    merchantId: string,
  ): DevThemeRelease {
    const release = releases.get(releaseId);
    if (!release || release.merchantId !== merchantId) {
      fail("dev_theme.not_found", "Release not found for this merchant.");
    }
    return release as DevThemeRelease;
  }

  function event(
    action: DevThemeAuditEvent["action"],
    release: DevThemeRelease,
    actorId: string | null,
    before: Record<string, unknown> | null,
    after: Record<string, unknown>,
  ): DevThemeAuditEvent {
    return {
      action,
      merchantId: release.merchantId,
      themeId: release.themeId,
      releaseId: release.id,
      actorId,
      before,
      after: { fingerprint: release.fingerprint, ...after },
    };
  }

  return {
    submit(input: SubmitInput): {
      release: DevThemeRelease;
      audit: DevThemeAuditEvent;
    } {
      const merchantId = requireId(input.merchantId, "merchant");
      const themeId = requireId(input.themeId, "theme");
      const fingerprint = requireId(input.fingerprint, "fingerprint");
      if (!/^[0-9a-f]{64}$/.test(fingerprint)) {
        fail(
          "dev_theme.fingerprint_invalid",
          "Fingerprint must be sha256 hex.",
        );
      }
      const submittedAt = requireTimestamp(input.submittedAt);
      // Idempotent on fingerprint: identical bytes never fork a second version.
      const existingId = byFingerprint.get(
        `${scope(merchantId, themeId)}:${fingerprint}`,
      );
      if (existingId) {
        const existing = releases.get(existingId) as DevThemeRelease;
        return {
          release: existing,
          audit: event(
            "dev_theme.submitted",
            existing,
            input.submittedBy ?? null,
            null,
            {
              deduplicated: true,
            },
          ),
        };
      }
      seq += 1;
      const release: DevThemeRelease = {
        id: `dtr_${seq}`,
        merchantId,
        themeId,
        version: input.manifest.version,
        manifest: input.manifest,
        files: input.files,
        fileHashes: input.files.map((f) => ({
          path: f.path,
          sha256: f.sha256,
        })),
        fingerprint,
        status: "in_review",
        submittedBy: requireId(input.submittedBy, "submitter"),
        submittedAt,
        reviews: [],
        rollbackOf: null,
        publishedAt: null,
      };
      releases.set(release.id, release);
      byFingerprint.set(
        `${scope(merchantId, themeId)}:${fingerprint}`,
        release.id,
      );
      return {
        release,
        audit: event(
          "dev_theme.submitted",
          release,
          release.submittedBy,
          null,
          {
            version: release.version,
          },
        ),
      };
    },

    /**
     * Moderator review. The approve decision binds the release's CURRENT
     * fingerprint into the review record; publish later re-verifies it, so
     * bytes changed after review can never ride the old decision.
     */
    review(input: ReviewInput): {
      release: DevThemeRelease;
      audit: DevThemeAuditEvent;
    } {
      const merchantId = requireId(input.merchantId, "merchant");
      const reviewer = requireActor(input.reviewer, "reviewer");
      const reason = requireReason(input.reason);
      const reviewedAt = requireTimestamp(input.reviewedAt);
      if (input.decision !== "approve" && input.decision !== "reject") {
        fail(
          "dev_theme.decision_invalid",
          "Decision must be approve or reject.",
        );
      }
      const release = scopedRelease(input.releaseId, merchantId);
      if (release.status !== "in_review") {
        fail(
          "dev_theme.review_state",
          `Only in_review releases can be reviewed (is ${release.status}).`,
        );
      }
      const record: DevThemeReviewRecord = {
        reviewerId: reviewer.id,
        reviewerRole: reviewer.role,
        decision: input.decision,
        reason,
        reviewedAt,
        fingerprint: release.fingerprint,
      };
      const next: DevThemeRelease = {
        ...release,
        status: input.decision === "approve" ? "approved" : "rejected",
        reviews: [...release.reviews, record],
      };
      releases.set(next.id, next);
      const action =
        input.decision === "approve"
          ? "dev_theme.reviewed"
          : "dev_theme.rejected";
      return {
        release: next,
        audit: event(
          action,
          next,
          reviewer.id,
          { status: release.status },
          {
            status: next.status,
            reviewer_role: reviewer.role,
            reason,
            reviewed_at: reviewedAt,
          },
        ),
      };
    },

    /**
     * Publish the approved release and move the live pointer. Refuses unless
     * the release is approved AND the publisher names the release's own
     * fingerprint — an unapproved or modified bundle never publishes under
     * an old approval. The displaced live release is retained as
     * `superseded`, still addressable by fingerprint.
     */
    publish(input: PublishInput): {
      release: DevThemeRelease;
      audit: DevThemeAuditEvent;
    } {
      const merchantId = requireId(input.merchantId, "merchant");
      const actor = requireActor(input.actor);
      const publishedAt = requireTimestamp(input.publishedAt);
      const release = scopedRelease(input.releaseId, merchantId);
      if (release.status === "removed") {
        fail("dev_theme.removed", "A removed release can never publish.");
      }
      if (input.expectedFingerprint !== release.fingerprint) {
        fail(
          "dev_theme.fingerprint_mismatch",
          "Publish names a different fingerprint than the release carries.",
        );
      }
      if (release.status !== "approved") {
        fail(
          "dev_theme.approval_required",
          `Release is ${release.status}: an approval for this exact fingerprint is required before publish.`,
        );
      }
      // The approval is the review record binding THIS fingerprint.
      const approval = release.reviews.some(
        (r) =>
          r.decision === "approve" && r.fingerprint === release.fingerprint,
      );
      if (!approval) {
        fail(
          "dev_theme.approval_required",
          "No review approval covers this exact fingerprint.",
        );
      }
      const key = scope(merchantId, release.themeId);
      const previousId = pointer.get(key) ?? null;
      if (previousId && previousId !== release.id) {
        const previous = releases.get(previousId);
        if (previous && previous.status === "published") {
          releases.set(previousId, { ...previous, status: "superseded" });
        }
      }
      const next: DevThemeRelease = {
        ...release,
        status: "published",
        publishedAt,
      };
      releases.set(next.id, next);
      pointer.set(key, next.id);
      return {
        release: next,
        audit: event(
          "dev_theme.published",
          next,
          actor.id,
          {
            previous_release_id: previousId,
          },
          { published_at: publishedAt },
        ),
      };
    },

    /** Revoke a live or approved release; clears the pointer when live. */
    revoke(input: RevokeInput): {
      release: DevThemeRelease;
      audit: DevThemeAuditEvent;
    } {
      const merchantId = requireId(input.merchantId, "merchant");
      const actor = requireActor(input.actor);
      const reason = requireReason(input.reason);
      const revokedAt = requireTimestamp(input.revokedAt);
      const release = scopedRelease(input.releaseId, merchantId);
      if (release.status !== "published" && release.status !== "approved") {
        fail(
          "dev_theme.revoke_state",
          `Only published or approved releases can be revoked (is ${release.status}).`,
        );
      }
      const next: DevThemeRelease = { ...release, status: "revoked" };
      releases.set(next.id, next);
      const key = scope(merchantId, release.themeId);
      if (pointer.get(key) === release.id) pointer.set(key, null);
      return {
        release: next,
        audit: event(
          "dev_theme.revoked",
          next,
          actor.id,
          { status: release.status },
          {
            reason,
            revoked_at: revokedAt,
          },
        ),
      };
    },

    /**
     * Remove a compromised release: terminal `removed` status, bytes
     * quarantined (hashes retained for forensics), pointer cleared. Only a
     * reviewer-role actor may remove, and a removed release can never
     * publish again — recovery is a fresh reviewed submission.
     */
    removeCompromised(input: RemoveCompromisedInput): {
      release: DevThemeRelease;
      audit: DevThemeAuditEvent;
    } {
      const merchantId = requireId(input.merchantId, "merchant");
      const actor = requireActor(input.actor);
      const reason = requireReason(input.reason);
      const removedAt = requireTimestamp(input.removedAt);
      const release = scopedRelease(input.releaseId, merchantId);
      if (release.status === "removed") {
        fail("dev_theme.remove_state", "Release is already removed.");
      }
      const next: DevThemeRelease = {
        ...release,
        status: "removed",
        files: [],
        publishedAt: null,
      };
      releases.set(next.id, next);
      const key = scope(merchantId, release.themeId);
      if (pointer.get(key) === release.id) pointer.set(key, null);
      return {
        release: next,
        audit: event(
          "dev_theme.removed",
          next,
          actor.id,
          { status: release.status },
          {
            reason,
            removed_at: removedAt,
            compromised: true,
            retained_hashes: next.fileHashes.length,
          },
        ),
      };
    },

    /**
     * Rollback to a previously APPROVED fingerprint: mints a NEW release
     * carrying the target's exact bytes (rollbackOf link) and publishes it.
     * The target must carry an approval for its own fingerprint — rolling
     * back to unreviewed bytes refuses.
     */
    rollback(input: RollbackInput): {
      release: DevThemeRelease;
      audit: DevThemeAuditEvent;
    } {
      const merchantId = requireId(input.merchantId, "merchant");
      const themeId = requireId(input.themeId, "theme");
      const actor = requireActor(input.actor);
      const rolledBackAt = requireTimestamp(input.rolledBackAt);
      if (!/^[0-9a-f]{64}$/.test(input.targetFingerprint)) {
        fail(
          "dev_theme.fingerprint_invalid",
          "Rollback target must be sha256 hex.",
        );
      }
      const targetId = byFingerprint.get(
        `${scope(merchantId, themeId)}:${input.targetFingerprint}`,
      );
      const target = targetId ? releases.get(targetId) : undefined;
      if (!target) {
        fail("dev_theme.not_found", "No release carries that fingerprint.");
      }
      const typed = target as DevThemeRelease;
      // Safe-rollback (additive — the approval check below is untouched): a
      // revoked, removed, or rejected target never restores, even when it
      // carries a historical approval. Only ever-approved live states
      // (approved/published/superseded) restore; anything else refuses before
      // any write, so a compromised latest cannot be rolled back INTO.
      if (typed.status === "revoked" || typed.status === "removed") {
        fail(
          "dev_theme.rollback_revoked",
          `Rollback target ${typed.id} is ${typed.status}: revoked bytes never restore.`,
        );
      }
      const approvedTarget = typed.reviews.some(
        (r) => r.decision === "approve" && r.fingerprint === typed.fingerprint,
      );
      if (!approvedTarget) {
        fail(
          "dev_theme.approval_required",
          "Rollback target was never approved: unreviewed bytes never go live.",
        );
      }
      if (
        typed.status !== "approved" &&
        typed.status !== "published" &&
        typed.status !== "superseded"
      ) {
        fail(
          "dev_theme.approval_required",
          `Rollback target is ${typed.status}: only approved releases restore.`,
        );
      }
      seq += 1;
      const key = scope(merchantId, themeId);
      const previousId = pointer.get(key) ?? null;
      if (previousId) {
        const previous = releases.get(previousId);
        if (previous && previous.status === "published") {
          releases.set(previousId, { ...previous, status: "superseded" });
        }
      }
      const next: DevThemeRelease = {
        ...(target as DevThemeRelease),
        id: `dtr_${seq}`,
        status: "published",
        rollbackOf: (target as DevThemeRelease).id,
        publishedAt: rolledBackAt,
      };
      releases.set(next.id, next);
      pointer.set(key, next.id);
      return {
        release: next,
        audit: event(
          "dev_theme.rolled_back",
          next,
          actor.id,
          {
            previous_release_id: previousId,
          },
          {
            rollback_of: (target as DevThemeRelease).id,
            rolled_back_at: rolledBackAt,
            version: (target as DevThemeRelease).version,
          },
        ),
      };
    },

    get(releaseId: string): DevThemeRelease | null {
      return releases.get(releaseId) ?? null;
    },

    getByFingerprint(
      merchantId: string,
      themeId: string,
      fingerprint: string,
    ): DevThemeRelease | null {
      const id = byFingerprint.get(
        `${scope(merchantId, themeId)}:${fingerprint}`,
      );
      return (id ? releases.get(id) : undefined) ?? null;
    },

    published(merchantId: string, themeId: string): DevThemeRelease | null {
      const id = pointer.get(scope(merchantId, themeId)) ?? null;
      return (id ? releases.get(id) : undefined) ?? null;
    },
  };
}

export type DevThemeReleaseStore = ReturnType<
  typeof createDevThemeReleaseStore
>;

/* ------------------------------------------------ Supabase-backed durability */

export const DEV_THEME_RELEASES_TABLE = "dev_theme_releases";
export const DEV_THEME_REVIEWS_TABLE = "dev_theme_reviews";

type ReviewStoreClient = SupabaseClient<Database>;

/**
 * Minimal table accessor covering exactly the query shapes the adapter
 * issues. The real client is cast to this (the generated `Database` type has
 * no dev_theme tables checked in — types.ts is generated, not hand-edited);
 * FakeDb satisfies it structurally through `asClient()`.
 */
type StoreDbQuery = PromiseLike<{ data: unknown; error: unknown }> & {
  select(columns?: string): StoreDbQuery;
  eq(column: string, value: unknown): StoreDbQuery;
  order(column: string, opts?: { ascending?: boolean }): StoreDbQuery;
  limit(n: number): StoreDbQuery;
  insert(rows: Record<string, unknown>): StoreDbQuery;
  update(patch: Record<string, unknown>): StoreDbQuery;
  maybeSingle(): Promise<{ data: unknown; error: unknown }>;
  single(): Promise<{ data: unknown; error: unknown }>;
};

type StoreDb = { from(table: string): StoreDbQuery };

function storeDb(db: ReviewStoreClient): StoreDb {
  return db as unknown as StoreDb;
}

export type PersistedDevThemeReleaseRow = {
  id: string;
  merchant_id: string;
  theme_id: string;
  version: string;
  fingerprint: string;
  status: string;
  submitted_by: string;
  submitted_at: string;
  published_at: string | null;
  manifest: unknown;
  files: unknown;
};

export type PersistedDevThemeReviewRow = {
  id: string;
  merchant_id: string;
  theme_id: string;
  fingerprint: string;
  decision: "approve" | "reject";
  reviewer_id: string;
  reviewer_role: DevThemeReviewerRole;
  reason: string;
  reviewed_at: string;
  release_id: string | null;
};

export type PersistDevThemeReviewInput = ReviewInput & {
  /** Durable addressing is fingerprint-bound; the pure row id is ignored. */
  themeId: string;
  fingerprint: string;
};

export type PublishDevThemeReleaseInput = {
  merchantId: string;
  themeId: string;
  fingerprint: string;
  actor: DevThemeActor;
  publishedAt: string;
};

const FINGERPRINT_RE = /^[0-9a-f]{64}$/;
const KNOWN_STATUSES = [
  "draft",
  "in_review",
  "approved",
  "published",
  "superseded",
  "rejected",
  "revoked",
  "removed",
] as const;

function requireFingerprint(value: string): string {
  requireId(value, "fingerprint");
  if (!FINGERPRINT_RE.test(value)) {
    fail("dev_theme.fingerprint_invalid", "Fingerprint must be sha256 hex.");
  }
  return value;
}

function isDuplicateKey(error: unknown): boolean {
  const err = error as { code?: unknown; message?: unknown } | null;
  if (err?.code === "23505") return true;
  return (
    typeof err?.message === "string" && err.message.includes("duplicate key")
  );
}

/** Fail-closed: any store read fault refuses, it never resolves to allow. */
function unreadable(detail: string): never {
  fail("dev_theme.store_unreadable", detail);
}

function unwritable(detail: string): never {
  fail("dev_theme.store_unwritable", detail);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function decodeReleaseRow(value: unknown): PersistedDevThemeReleaseRow {
  const row = asRecord(value);
  const id = row ? asString(row.id) : null;
  const merchantId = row ? asString(row.merchant_id) : null;
  const themeId = row ? asString(row.theme_id) : null;
  const version = row ? asString(row.version) : null;
  const fingerprint = row ? asString(row.fingerprint) : null;
  const status = row ? asString(row.status) : null;
  const submittedBy = row ? asString(row.submitted_by) : null;
  const submittedAt = row ? asString(row.submitted_at) : null;
  if (
    !row ||
    !id ||
    !merchantId ||
    !themeId ||
    !version ||
    !fingerprint ||
    !status ||
    !submittedBy ||
    !submittedAt ||
    !FINGERPRINT_RE.test(fingerprint) ||
    !(KNOWN_STATUSES as readonly string[]).includes(status)
  ) {
    fail("dev_theme.store_corrupt", "Stored release row is malformed.");
  }
  return {
    id,
    merchant_id: merchantId,
    theme_id: themeId,
    version,
    fingerprint,
    status,
    submitted_by: submittedBy,
    submitted_at: submittedAt,
    published_at: asString((row as Record<string, unknown>).published_at),
    manifest: (row as Record<string, unknown>).manifest ?? {},
    files: (row as Record<string, unknown>).files ?? [],
  };
}

function decodeReviewRow(value: unknown): PersistedDevThemeReviewRow {
  const row = asRecord(value);
  const decision = row?.decision;
  const role = row?.reviewer_role;
  const record = {
    id: row ? asString(row.id) : null,
    merchantId: row ? asString(row.merchant_id) : null,
    themeId: row ? asString(row.theme_id) : null,
    fingerprint: row ? asString(row.fingerprint) : null,
    reviewerId: row ? asString(row.reviewer_id) : null,
    reason: row ? asString(row.reason) : null,
    reviewedAt: row ? asString(row.reviewed_at) : null,
  };
  if (
    !row ||
    !record.id ||
    !record.merchantId ||
    !record.themeId ||
    !record.fingerprint ||
    !record.reviewerId ||
    !record.reason ||
    !record.reviewedAt ||
    !FINGERPRINT_RE.test(record.fingerprint) ||
    (decision !== "approve" && decision !== "reject") ||
    !(DEV_THEME_REVIEWER_ROLES as readonly string[]).includes(String(role))
  ) {
    fail("dev_theme.store_corrupt", "Stored review row is malformed.");
  }
  const releaseId = asString(row.release_id);
  return {
    id: record.id,
    merchant_id: record.merchantId,
    theme_id: record.themeId,
    fingerprint: record.fingerprint,
    decision: decision as "approve" | "reject",
    reviewer_id: record.reviewerId,
    reviewer_role: role as DevThemeReviewerRole,
    reason: record.reason as string,
    reviewed_at: record.reviewedAt as string,
    release_id: releaseId,
  };
}

function decodeManifest(value: unknown): DevThemeManifest {
  const manifest = asRecord(value);
  if (!manifest || typeof manifest.version !== "string") {
    fail("dev_theme.store_corrupt", "Stored manifest is malformed.");
  }
  return manifest as unknown as DevThemeManifest;
}

function decodeFiles(value: unknown): DevThemeHashedFile[] {
  if (!Array.isArray(value)) {
    fail("dev_theme.store_corrupt", "Stored file list is malformed.");
  }
  return value.map((entry) => {
    const file = asRecord(entry);
    const path = file ? asString(file.path) : null;
    const sha256 = file ? asString(file.sha256) : null;
    const bytes = file?.bytes;
    if (
      !path ||
      !sha256 ||
      !FINGERPRINT_RE.test(sha256) ||
      typeof bytes !== "number" ||
      !Number.isFinite(bytes) ||
      bytes < 0
    ) {
      fail("dev_theme.store_corrupt", "Stored file entry is malformed.");
    }
    return {
      path: path as string,
      sha256: sha256 as string,
      bytes: bytes as number,
    };
  });
}

function submissionEvent(
  row: PersistedDevThemeReleaseRow,
  actorId: string | null,
  deduplicated: boolean,
): DevThemeAuditEvent {
  return {
    action: "dev_theme.submitted",
    merchantId: row.merchant_id,
    themeId: row.theme_id,
    releaseId: row.id,
    actorId,
    before: null,
    after: deduplicated
      ? { fingerprint: row.fingerprint, deduplicated: true }
      : { fingerprint: row.fingerprint, version: row.version },
  };
}

async function findRelease(
  db: StoreDb,
  merchantId: string,
  themeId: string,
  fingerprint: string,
): Promise<PersistedDevThemeReleaseRow | null> {
  let data: unknown;
  let error: unknown;
  try {
    ({ data, error } = await db
      .from(DEV_THEME_RELEASES_TABLE)
      .select("*")
      .eq("merchant_id", merchantId)
      .eq("theme_id", themeId)
      .eq("fingerprint", fingerprint)
      .maybeSingle());
  } catch (e) {
    unreadable(e instanceof Error ? e.message : "release read failed");
  }
  if (error)
    unreadable(
      `release read failed: ${String((error as { message?: unknown }).message ?? error)}`,
    );
  if (data === null || data === undefined) return null;
  return decodeReleaseRow(data);
}

async function findReview(
  db: StoreDb,
  merchantId: string,
  themeId: string,
  fingerprint: string,
  decision: "approve" | "reject",
): Promise<PersistedDevThemeReviewRow | null> {
  let data: unknown;
  let error: unknown;
  try {
    ({ data, error } = await db
      .from(DEV_THEME_REVIEWS_TABLE)
      .select("*")
      .eq("merchant_id", merchantId)
      .eq("theme_id", themeId)
      .eq("fingerprint", fingerprint)
      .eq("decision", decision)
      .maybeSingle());
  } catch (e) {
    unreadable(e instanceof Error ? e.message : "review read failed");
  }
  if (error)
    unreadable(
      `review read failed: ${String((error as { message?: unknown }).message ?? error)}`,
    );
  if (data === null || data === undefined) return null;
  return decodeReviewRow(data);
}

/**
 * Durable submit: idempotent on (merchant, theme, fingerprint) — identical
 * bytes re-resolve the existing row (mirrors the pure store's dedup). A
 * unique-violation race between the pre-check and the insert re-reads the
 * winner instead of failing; any other DB fault throws.
 */
export async function persistDevThemeSubmission(
  db: ReviewStoreClient,
  input: SubmitInput,
): Promise<{
  release: PersistedDevThemeReleaseRow;
  deduplicated: boolean;
  audit: DevThemeAuditEvent;
}> {
  const merchantId = requireId(input.merchantId, "merchant");
  const themeId = requireId(input.themeId, "theme");
  const fingerprint = requireFingerprint(input.fingerprint);
  const submittedAt = requireTimestamp(input.submittedAt);
  const submittedBy = requireId(input.submittedBy, "submitter");
  const store = storeDb(db);
  const existing = await findRelease(store, merchantId, themeId, fingerprint);
  if (existing) {
    return {
      release: existing,
      deduplicated: true,
      audit: submissionEvent(existing, submittedBy, true),
    };
  }
  const version =
    asString((input.manifest as unknown as Record<string, unknown>)?.version) ??
    "0.0.0";
  let inserted: unknown;
  let insertError: unknown;
  try {
    ({ data: inserted, error: insertError } = await store
      .from(DEV_THEME_RELEASES_TABLE)
      .insert({
        merchant_id: merchantId,
        theme_id: themeId,
        version,
        fingerprint,
        status: "in_review",
        submitted_by: submittedBy,
        submitted_at: submittedAt,
        manifest: input.manifest as unknown as Record<string, unknown>,
        files: input.files as unknown as Record<string, unknown>,
      })
      .select("*")
      .single());
  } catch (e) {
    unwritable(e instanceof Error ? e.message : "submission write failed");
  }
  if (insertError) {
    if (isDuplicateKey(insertError)) {
      const raced = await findRelease(store, merchantId, themeId, fingerprint);
      if (raced) {
        return {
          release: raced,
          deduplicated: true,
          audit: submissionEvent(raced, submittedBy, true),
        };
      }
    }
    unwritable(
      `submission write failed: ${String((insertError as { message?: unknown }).message ?? insertError)}`,
    );
  }
  const release = decodeReleaseRow(inserted);
  return {
    release,
    deduplicated: false,
    audit: submissionEvent(release, submittedBy, false),
  };
}

/**
 * Durable review: idempotent on (merchant, theme, fingerprint, decision) —
 * re-approving the same bytes returns the existing row, never a duplicate.
 * The release status converges to the decision outcome (so a retry after a
 * partially-failed first write still lands `approved`); anything past
 * `in_review` refuses a NEW decision, mirroring the pure store.
 */
export async function persistDevThemeReview(
  db: ReviewStoreClient,
  input: PersistDevThemeReviewInput,
): Promise<{
  review: PersistedDevThemeReviewRow;
  release: PersistedDevThemeReleaseRow;
  audit: DevThemeAuditEvent;
}> {
  const merchantId = requireId(input.merchantId, "merchant");
  const themeId = requireId(input.themeId, "theme");
  const fingerprint = requireFingerprint(input.fingerprint);
  const reviewer = requireActor(input.reviewer, "reviewer");
  const reason = requireReason(input.reason);
  const reviewedAt = requireTimestamp(input.reviewedAt);
  if (input.decision !== "approve" && input.decision !== "reject") {
    fail("dev_theme.decision_invalid", "Decision must be approve or reject.");
  }
  const decision = input.decision;
  const store = storeDb(db);
  const release = await findRelease(store, merchantId, themeId, fingerprint);
  if (!release) {
    fail("dev_theme.not_found", "No release carries that fingerprint.");
  }
  const outcome = decision === "approve" ? "approved" : "rejected";
  const action =
    decision === "approve" ? "dev_theme.reviewed" : "dev_theme.rejected";

  const converged = async (
    review: PersistedDevThemeReviewRow,
    current: PersistedDevThemeReleaseRow,
  ): Promise<PersistedDevThemeReleaseRow> => {
    if (current.status !== "in_review") return current;
    let updateError: unknown;
    try {
      ({ error: updateError } = await store
        .from(DEV_THEME_RELEASES_TABLE)
        .update({ status: outcome })
        .eq("merchant_id", merchantId)
        .eq("theme_id", themeId)
        .eq("fingerprint", fingerprint));
    } catch (e) {
      unwritable(e instanceof Error ? e.message : "status write failed");
    }
    if (updateError) {
      unwritable(
        `status write failed: ${String((updateError as { message?: unknown }).message ?? updateError)}`,
      );
    }
    return { ...current, status: outcome };
  };

  const auditFor = (
    current: PersistedDevThemeReleaseRow,
    review: PersistedDevThemeReviewRow,
  ): DevThemeAuditEvent => ({
    action: action as DevThemeAuditEvent["action"],
    merchantId,
    themeId,
    releaseId: current.id,
    actorId: reviewer.id,
    before: { status: "in_review" },
    after: {
      fingerprint,
      status: outcome,
      reviewer_role: reviewer.role,
      reason,
      reviewed_at: reviewedAt,
    },
  });

  const existing = await findReview(
    store,
    merchantId,
    themeId,
    fingerprint,
    decision,
  );
  if (existing) {
    const current = await findRelease(store, merchantId, themeId, fingerprint);
    const next = current ? await converged(existing, current) : release;
    return { review: existing, release: next, audit: auditFor(next, existing) };
  }
  if (release.status !== "in_review") {
    fail(
      "dev_theme.review_state",
      `Only in_review releases can be reviewed (is ${release.status}).`,
    );
  }
  let inserted: unknown;
  let insertError: unknown;
  try {
    ({ data: inserted, error: insertError } = await store
      .from(DEV_THEME_REVIEWS_TABLE)
      .insert({
        merchant_id: merchantId,
        theme_id: themeId,
        fingerprint,
        decision,
        reviewer_id: reviewer.id,
        reviewer_role: reviewer.role,
        reason,
        reviewed_at: reviewedAt,
        release_id: release.id,
      })
      .select("*")
      .single());
  } catch (e) {
    unwritable(e instanceof Error ? e.message : "review write failed");
  }
  if (insertError) {
    if (isDuplicateKey(insertError)) {
      const raced = await findReview(
        store,
        merchantId,
        themeId,
        fingerprint,
        decision,
      );
      if (raced) {
        const current = await findRelease(
          store,
          merchantId,
          themeId,
          fingerprint,
        );
        const next = current ? await converged(raced, current) : release;
        return { review: raced, release: next, audit: auditFor(next, raced) };
      }
    }
    unwritable(
      `review write failed: ${String((insertError as { message?: unknown }).message ?? insertError)}`,
    );
  }
  const review = decodeReviewRow(inserted);
  const next = await converged(review, release);
  return { review, release: next, audit: auditFor(next, review) };
}

/**
 * Durable publish: refuses unless the release is approved AND an approve
 * review binds its exact fingerprint (the same two gates the pure store
 * enforces). Re-publishing an already-published fingerprint re-resolves it.
 */
export async function publishDevThemeRelease(
  db: ReviewStoreClient,
  input: PublishDevThemeReleaseInput,
): Promise<{
  release: PersistedDevThemeReleaseRow;
  audit: DevThemeAuditEvent;
}> {
  const merchantId = requireId(input.merchantId, "merchant");
  const themeId = requireId(input.themeId, "theme");
  const fingerprint = requireFingerprint(input.fingerprint);
  const actor = requireActor(input.actor);
  const publishedAt = requireTimestamp(input.publishedAt);
  const store = storeDb(db);
  const release = await findRelease(store, merchantId, themeId, fingerprint);
  if (!release) {
    fail("dev_theme.not_found", "No release carries that fingerprint.");
  }
  if (release.status === "removed") {
    fail("dev_theme.removed", "A removed release can never publish.");
  }
  if (release.status === "published") {
    return {
      release,
      audit: {
        action: "dev_theme.published",
        merchantId,
        themeId,
        releaseId: release.id,
        actorId: actor.id,
        before: null,
        after: { fingerprint, deduplicated: true, published_at: publishedAt },
      },
    };
  }
  if (release.status !== "approved") {
    fail(
      "dev_theme.approval_required",
      `Release is ${release.status}: an approval for this exact fingerprint is required before publish.`,
    );
  }
  const approval = await findReview(
    store,
    merchantId,
    themeId,
    fingerprint,
    "approve",
  );
  if (!approval) {
    fail(
      "dev_theme.approval_required",
      "No review approval covers this exact fingerprint.",
    );
  }
  let updateError: unknown;
  try {
    ({ error: updateError } = await store
      .from(DEV_THEME_RELEASES_TABLE)
      .update({ status: "published", published_at: publishedAt })
      .eq("merchant_id", merchantId)
      .eq("theme_id", themeId)
      .eq("fingerprint", fingerprint));
  } catch (e) {
    unwritable(e instanceof Error ? e.message : "publish write failed");
  }
  if (updateError) {
    unwritable(
      `publish write failed: ${String((updateError as { message?: unknown }).message ?? updateError)}`,
    );
  }
  const next: PersistedDevThemeReleaseRow = {
    ...release,
    status: "published",
    published_at: publishedAt,
  };
  return {
    release: next,
    audit: {
      action: "dev_theme.published",
      merchantId,
      themeId,
      releaseId: release.id,
      actorId: actor.id,
      before: { status: release.status },
      after: { fingerprint, published_at: publishedAt },
    },
  };
}

/**
 * Durable approval snapshot for the activation/install gates. Throws
 * `dev_theme.store_unreadable` on ANY store fault (fail-closed — the caller
 * refuses activation) and returns null only when no release carries the
 * fingerprint. Malformed stored rows refuse too (`store_corrupt`): an
 * approval the store cannot vouch for never activates.
 */
export async function loadDevThemeApproval(
  db: ReviewStoreClient,
  merchantId: string,
  themeId: string,
  fingerprint: string,
): Promise<{ release: DevThemeRelease } | null> {
  requireId(merchantId, "merchant");
  requireId(themeId, "theme");
  requireFingerprint(fingerprint);
  const store = storeDb(db);
  const row = await findRelease(store, merchantId, themeId, fingerprint);
  if (!row) return null;
  let data: unknown;
  let error: unknown;
  try {
    ({ data, error } = await store
      .from(DEV_THEME_REVIEWS_TABLE)
      .select("*")
      .eq("merchant_id", merchantId)
      .eq("theme_id", themeId)
      .eq("fingerprint", fingerprint)
      .order("reviewed_at", { ascending: true }));
  } catch (e) {
    unreadable(e instanceof Error ? e.message : "review read failed");
  }
  if (error)
    unreadable(
      `review read failed: ${String((error as { message?: unknown }).message ?? error)}`,
    );
  const reviews = ((data ?? []) as unknown[]).map((entry) => {
    const review = decodeReviewRow(entry);
    return {
      reviewerId: review.reviewer_id,
      reviewerRole: review.reviewer_role,
      decision: review.decision,
      reason: review.reason,
      reviewedAt: review.reviewed_at,
      fingerprint: review.fingerprint,
    };
  });
  const manifest = decodeManifest(row.manifest);
  const files = decodeFiles(row.files);
  if (!(KNOWN_STATUSES as readonly string[]).includes(row.status)) {
    fail("dev_theme.store_corrupt", "Stored release status is unknown.");
  }
  return {
    release: {
      id: row.id,
      merchantId: row.merchant_id,
      themeId: row.theme_id,
      version: row.version,
      manifest,
      files,
      fileHashes: files.map((f) => ({ path: f.path, sha256: f.sha256 })),
      fingerprint: row.fingerprint,
      status: row.status as DevThemeRelease["status"],
      submittedBy: row.submitted_by,
      submittedAt: row.submitted_at,
      reviews,
      rollbackOf: null,
      publishedAt: row.published_at,
    },
  };
}

/**
 * Durable audit write for a review-lane transition event, shaped for the
 * EXISTING `theme_audit` table (no migration — free-form audit columns).
 * Throws `dev_theme.audit_failed` when the row does not land: a lost audit
 * fails loudly, it never passes silently.
 */
export async function insertDevThemeAuditRow(
  db: ReviewStoreClient,
  event: DevThemeAuditEvent,
): Promise<void> {
  let error: unknown;
  try {
    ({ error } = await storeDb(db)
      .from("theme_audit")
      .insert(toThemeAuditRow(event)));
  } catch (e) {
    fail(
      "dev_theme.audit_failed",
      e instanceof Error ? e.message : "audit write failed",
    );
  }
  if (error) {
    fail(
      "dev_theme.audit_failed",
      String((error as { message?: unknown }).message ?? error),
    );
  }
}
