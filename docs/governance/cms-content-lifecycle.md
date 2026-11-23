# Frame30 CMS Content Lifecycle & Publishing Specification
**Document ID:** `F30-SPEC-CMS-001`  
**Version:** 1.0.0  
**Authority:** Human Specification Authority (`@devrahmanbd`)  
**Standard:** Frame30 Engineering SDLC (`F30-SDLC-001`)  
**Applicability:** `storefront_pages`, `articles`, `page_revisions`, `article_revisions`, `src/lib/editor/editor.server.ts`, `src/lib/cms.server.ts`  

---

## 1. Executive Summary

This specification establishes the authoritative, independent correctness definition for content state transitions, revision monotonicity, publication concurrency, and tenant boundaries in the Frame30 Content Management System (CMS).

In accordance with the Central Engineering Law of `F30-SDLC-001`, the implementation is not the definition of correctness; the approved specification defines correctness.

---

## 2. Content States & Properties

Every content item (Page or Article) in Frame30 exists in exactly one of four primary lifecycle states:

```
                  ┌──────────────────────┐
                  │        DRAFT         │◄───────────────────────┐
                  └──────────┬───────────┘                        │
                             │                                    │
               ┌─────────────┴─────────────┐                      │
               ▼                           ▼                      │
     ┌───────────────────┐       ┌───────────────────┐            │
     │     SCHEDULED     │       │     PUBLISHED     │────────────┤ (unpublish)
     └─────────┬─────────┘       └─────────┬─────────┘            │
               │                           │                      │
               │ (publish_time reached)    │                      │
               └─────────────┬─────────────┘                      │
                             ▼                                    │
                  ┌──────────────────────┐                        │
                  │       ARCHIVED       │────────────────────────┘ (restore)
                  └──────────────────────┘
```

### State Definitions
1. **`DRAFT`**:
   - Work-in-progress content.
   - May be incomplete, unvalidated, or autosaved.
   - Strictly forbidden from public visibility (`is_published = false`).
   - Accessible only by authenticated merchant members with `marketing.read` or higher.
2. **`SCHEDULED`**:
   - Validated content queued for automated future release.
   - Must have a non-null, valid ISO 8601 future timestamp: `scheduled_for > now()`.
   - Strictly forbidden from public visibility prior to publication time.
   - Can only be scheduled by actors with `marketing.publish` permission.
3. **`PUBLISHED`**:
   - Canonical content publicly rendered on the merchant's storefront.
   - Must correspond to a persisted, validated revision.
   - Carries an immutable first publication timestamp `published_at <= now()`.
   - `is_published = true`, `deleted_at IS NULL`, `status = 'published'`.
4. **`ARCHIVED` (or Trashed)**:
   - Soft-deleted content (`trashed_at IS NOT NULL` or `deleted_at IS NOT NULL`).
   - Hidden from public rendering and standard dashboard lists.
   - Preserved for compliance, audit trails, and recovery.

---

## 3. Permitted State Transitions

| Initial State | Event / Action | Target State | Prerequisites & Guard Conditions | Server Side Effect |
|---|---|---|---|---|
| *None* | `create` | `DRAFT` | Authenticated tenant actor with `marketing.update` or `marketing.create`. | Assigns UUID, binds `merchant_id` to authenticated session, stamps `created_at` and initial revision. |
| `DRAFT` | `autosave` | `DRAFT` | Actor has `marketing.update`. Concurrency token matches or forward edit. | Snapshots content into revisions table marked `is_autosave = true`. Never mutates slug, dates, or publishing status. |
| `DRAFT` | `save_manual` | `DRAFT` | Actor has `marketing.update`. Concurrency token matches `updated_at`. | Snapshots manual revision. Updates `updated_at`. Rejects stale saves with `409 Conflict`. |
| `DRAFT` | `schedule` | `SCHEDULED` | Actor has `marketing.publish`. Payload passes full validation; `scheduled_for > now()`. | Records `scheduled_for` timestamp. Marks status `scheduled`. Sets `is_published = false`. |
| `SCHEDULED` | `cron_publish` | `PUBLISHED` | Current time `>= scheduled_for`. Idempotent background job. | Atomically flips `status = 'published'`, `is_published = true`, sets `published_at = now()`. Clears `scheduled_for`. Emits audit event. |
| `DRAFT` | `publish` | `PUBLISHED` | Actor has `marketing.publish`. Payload passes block/AST validation. | Sets `status = 'published'`, `is_published = true`. Sets `published_at = now()` (if first time). Generates 301 redirect if published slug changed. |
| `PUBLISHED` | `unpublish` | `DRAFT` | Actor has `marketing.publish`. | Sets `status = 'draft'`, `is_published = false`. Content disappears immediately from public routes. |
| `DRAFT` / `PUBLISHED` | `archive` | `ARCHIVED` | Actor has `marketing.update`. | Sets `trashed_at = now()`, `is_published = false`. Preserves all historical revisions. |
| `ARCHIVED` | `restore` | `DRAFT` | Actor has `marketing.update`. | Clears `trashed_at = NULL`. Restores item into `draft` status. |
| `ANY` | `rollback_revision` | Current state | Actor has `marketing.update` (or `marketing.publish` if restoring directly to live). | Appends a NEW forward revision containing the historical body/props. **Never deletes historical revisions.** |

---

## 4. Inviolable Invariants (Non-Negotiable)

1. **No Public Drafts (Safety Invariant 1)**:  
   Under no condition shall a resource with `is_published = false` or `status != 'published'` or `trashed_at IS NOT NULL` be returned to unauthenticated shoppers (`anon` role) or rendered on public storefront routes (`/`, `/pages/*`, `/blog/*`).
2. **Publication Monotonicity & Scheduling Gate (Safety Invariant 2)**:  
   Scheduled content is invisible to the public until `now() >= scheduled_for`. When the scheduled time arrives, publication is atomic.
3. **Strict Authority Boundary (Safety Invariant 3)**:  
   Publishing and restoring actions require explicit server-validated `marketing.publish` permission. Actors possessing only `marketing.update` are demoted to draft/pending-review.
4. **Stale Revision Conflict Rejection (Safety Invariant 4)**:  
   A client submitting a save with an outdated `updated_at` or revision base must be rejected with `EditorError('stale_revision')` or `409 Conflict`. A stale save cannot silently overwrite a newer revision saved by another tab or colleague.
5. **Idempotent Background Jobs (Safety Invariant 5)**:  
   Repeated execution of the scheduled publication job or webhook retry must produce identical, idempotent side effects. Zero duplicate records or double-publication anomalies.
6. **All-or-Nothing Atomic Publication (Safety Invariant 6)**:  
   Publishing must execute within an atomic transaction: database record update, revision snapshot creation, and URL redirect registration must either all succeed or all fail.
7. **Append-Only Revision History (Safety Invariant 7)**:  
   Restoring an earlier revision creates a new revision with an incremented revision ID or timestamp. Historical revisions are permanent, monotonic, and immutable.
8. **Tenant Isolation on Publication (Safety Invariant 8)**:  
   Content owned by Merchant A can never be published, read, or modified under Merchant B's tenant context. Forged merchant IDs in request payloads are completely ignored in favor of the authenticated session context.

---

## 5. Audit & Error Accounting

All failed transitions and security violations must emit structured logs and fail-closed errors:
- Unauthorized publish attempt: `403 Forbidden` (`FORBIDDEN_PUBLISH_PERMISSION`).
- Stale revision conflict: `409 Conflict` (`STALE_REVISION_CONFLICT`).
- Cross-tenant access attempt: `404 Not Found` or `403 Forbidden` (`TENANT_CROSS_ACCESS_DENIED`) plus security audit log.
- Validation failure (e.g. missing image alt/dimensions, malformed AST): `422 Unprocessable Entity` (`VALIDATION_ERROR`).
