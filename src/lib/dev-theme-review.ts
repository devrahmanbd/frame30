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
 */

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
      const targetId = byFingerprint.get(
        `${scope(merchantId, themeId)}:${input.targetFingerprint}`,
      );
      const target = targetId ? releases.get(targetId) : undefined;
      if (!target) {
        fail("dev_theme.not_found", "No release carries that fingerprint.");
      }
      const approvedTarget = (target as DevThemeRelease).reviews.some(
        (r) =>
          r.decision === "approve" &&
          r.fingerprint === (target as DevThemeRelease).fingerprint,
      );
      if (!approvedTarget) {
        fail(
          "dev_theme.approval_required",
          "Rollback target was never approved: unreviewed bytes never go live.",
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
