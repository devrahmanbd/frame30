# 04 — Builder: Publishing (S1)

Status: Planning · Slice: S1 · Gate: approved ("go")
Owners: builder/runtime · storefront · 05-marketing (articles)
References: `04-builder/README.md` (state machine, `page.published` event), `theme-registry.md`
(themes grants, `theme_publish`/`theme_rollback`, revisions), `theme-runtime.md` (TR-3, TR-8,
TR-11 preview semantics), `05-marketing/content-cms.md` (scheduler + rollback precedent),
`03-storefront/i18n.md` (per-locale publish), `00-meta/design-system.md` §2–§3, `AGENTS.md` §2–§4
Implementation note: S1 lands the extra publish columns + `preview_shares` table
(Tenant008; Tenant007 is claimed by 05-marketing). No new `package.json`
surface; the scheduler and purge connect through the existing edge-service event wiring
(`theme.purge` pub/sub, `theme.updated`). Nothing here deploys past the database + events.

---

## 1. Purpose

Definition-of-done for "publish" from the builder: how a merchant takes a draft page from the
canvas to "live on the storefront" — including scheduled publishing, token-gated preview
shares, theme duplicate/switch, cache purge, and rollback — without ever letting the
storefront serve a half-published state. Every write stays on the registry RPC surface
(`theme-registry.md` §5); this spec adds the editor-facing scheduling state, the share
surface, and the promotion behavior on top.

## 2. Scope

- `pages.scheduled_at` column (null until scheduled) + `theme_audit` events
  `page.scheduled`, `page.scheduled_cancelled`, `theme.duplicated`, `preview_share.created`,
  `preview_share.revoked`.
- `preview_shares` table (per merchant, per page) with revocable share tokens.
- Scheduler contract: a repeated edge job promotes `scheduled_at <= now()` pages through the
  same `theme_publish` path — never a second publish implementation.
- Purge mapping: every publish/rollback/switch/duplicate event → the purge decision from
  `theme-registry.md` §6 (revision-keyed URLs, Redis pub/sub, CDN best effort, 60s TTL).
- Editor surfaces: publish bar (instant → confirm dialog), schedule dialog, share sheet,
  revisions timeline, switch/duplicate from the theme manager.

Out of scope: per-widget time-travel diffs (S2 reads `revisions` for that later), archiving a
_set_ of slugs in one op (S7), webhooks for `page.published` consumers, dev-mode preview
tokens for the builder, and any `.e2e` implementation (contract-first, P4).

## 3. Publish state machine

The existing machine from `04-builder/README.md` holds; this spec adds a `scheduled` arm:

| current           | transition          | where enforced                                                 | evidence                 |
| ----------------- | ------------------- | -------------------------------------------------------------- | ------------------------ |
| draft             | → preview           | editor only (`?preview=draft`), never anon                     | `theme-runtime.md` TR-11 |
| draft             | → scheduled         | schedule dialog writes `scheduled_at` (guard `themes.publish`) | §5                       |
| scheduled         | → published         | scheduler promotes through `theme_publish`                     | §6                       |
| draft / scheduled | → published         | instant publish bar (`theme_publish`)                          | §4                       |
| published         | → previous revision | rollback = restore a saved snapshot                            | §9                       |

Invariants:

- A page moves `scheduled → published` only via the scheduler or an explicit "publish now"
  in the schedule dialog.
- `scheduled_at` is never visible to anon; the storefront serves only revisions with
  `published_at` set (TR-8).
- Every transition writes `theme_audit` with the actor (staff) or `system:scheduler`.

## 4. Instant publish

Contract with `theme_publish` already exists (`theme-registry.md` §5.6):
`app.theme_publish(theme_id)` → revision id.

Editor affordances:

- Publish bar shows dirty state (amber dot), last published `revision_no`, time since.
- One click opens a confirm dialog that previews the **published-after** state (rendered
  from the snapshot _about to be written_, not the draft canvas), lists the pages that will
  go live ("3 pages will publish"), and states the rollback safety net.
- Confirm → `app.theme_publish` → success state + `page.published` events + purge kick.
- Failure leaves draft state untouched: snapshot insert and `published_at` flip are one
  transactional step (registry's single-transaction note).

Dialog copy (Bangla, English-safe key `publish.confirm`):

> "প্রকাশ করুন"? ৩টি পৃষ্ঠা লাইভ হবে। প্রযোজ্য হলে "বাতিল" পরের রিভিশন থেকে ফেরত দেওয়া যাবে।

## 5. Scheduled publish

Schema delta (Tenant008): `pages.scheduled_at timestamptz null`; a page with
`scheduled_at is not null` is _scheduled_. `theme_audit` `page.scheduled` carries
`{at, by}`.

Editor surface:

- Schedule dialog from the publish bar: date + time picker (Asia/Dhaka local, shown with
  the "Asia/Dhaka (UTC+6)" stamp), optional note; writes `scheduled_at` (stored UTC).
- Scheduled pages carry a text label chip "সূচি নির্ধারিত" in the page list; a **Clear
  schedule** action restores draft (`scheduled_at = null`, audit
  `page.scheduled_cancelled`).
- While scheduled, the canvas still edits the draft; the storefront keeps serving the last
  published revision.

Scheduler behavior (promotion):

`promote_due(tenant)` — a repeated edge job (every 60s, per-tenant lock) that:

1. Finds pages where `scheduled_at <= now()` and `published_at is null`, per page.
2. Calls `theme_publish` for that page — same RPC, same guardrails, same purge.
3. On failure: audit `page.publish_failed` + retry with backoff → DLQ. **The page never goes
   half-live**, and the store's previously published revision keeps serving.
4. A crash mid-promotion has the same effect as a failed publish: `scheduled_at` stays set,
   the job retries, and no partial revision is ever served.

The scheduler must NEVER bypass `theme_publish` (no raw inserts into `revisions`).

## 6. Preview shares (token-gated, revocable)

The purpose: "creator can share a preview link — viewer needs no account."

- New table `preview_shares` (Tenant008): `id`, `merchant_id`, `page_id`, `page_slug`,
  `share_token` (40-char URL-safe token from `crypto.randomBytes(20)`), `label`,
  `expires_at` (defaults 72h), `created_by`, `revoked_at`, `created_at`.
- Grant: `themes.edit` creates/revokes; anon reads **only** via a valid, non-revoked,
  non-expired token → runtime renders the _draft_ state (same render path as the editor
  preview, but URL-addressable: `/preview/<share_token>`).
- Shares are not crawlable: `noindex` meta + never in the sitemap.
- Revoke UX: share list in the preview sheet with per-share revoke; revoke is immediate (no
  TTL delay).

Failure realism: after a re-publish, the share renders the **new draft** (the share follows
the page, not a revision snapshot); a "stale share" hint appears when the page's latest
revision differs from the one the share was created against. Re-creating a share for the
same slug issues a _different_ token; old tokens 404.

Copy (Bangla): `নতুন শেয়ার লিংক` (Create new link).

## 7. Theme duplicate & switch

- **Duplicate** (audit `theme.duplicated`): copies the _installed_ theme state — theme pin,
  draft pages, tokens — into a new theme row; `revisions` are **not** copied; the new theme
  starts with the last published snapshot as its draft baseline. Purpose: prepare a risky
  change without touching the store theme; the manager shows a "duplicated from" chip.
- **Switch default** (`app.theme_switch_default`, registry §5.3): instant; purge fires via
  the same channel; the old default keeps its revisions chain (switch is not a deletion;
  rolling back to the prior theme = switching back).
- The builtin fallback is a seeding row only (`theme-registry.md` §7); a merchant with any
  published theme cannot switch to it — `theme_switch_default` requires a published version
  (registry failure table). Uninstall does not exist in v0; switch is the only way out.

## 8. Purge & cache on publish

The decision lives in `theme-registry.md` §6; this spec wires it to every surface:

- Publish/duplicate/switch/rollback → purge the _affected page keys_: revision-keyed URLs
  `/<rev>/<slug>`, plus locale-qualified keys per `i18n.md` §3 (fallback clock).
- Redis pub/sub `theme.purge:<merchant>` is scoped per merchant; edge drops cached entries;
  CDN explicit purge is best-effort; 60s TTL is the worst-case staleness bound (self-heal
  if purge infrastructure fails; `purge_failed` logged + alerted).
- Rollback emits the same purge: the rolled-back revision is served under a different URL
  immediately, and converges everywhere within 60s.

## 9. Rollback & revision trail

- Rollback restores the **published snapshot** from `revisions` (never a re-render from
  memory) as the new current draft → next publish writes a NEW revision (append-only; the
  reverted revision stays in the chain).
- The revisions timeline shows every `revision_no` with time, actor, and page list;
  "Restore" → `app.theme_rollback` (`theme-registry.md` §5.7); restore is immediate, purge
  fires; editor copy: "পূর্বের রিভিশনে ফেরত হয়েছে".
- Rollback targets ANY point in the merchant's chain, not only the most recent revision.
- No deletion: `revisions` are an append-only ledger.

## 10. Persistence table (state changes)

| surface               | transition            | row change                              | cache                 |
| --------------------- | --------------------- | --------------------------------------- | --------------------- |
| publish bar           | draft → published     | `revision_no` bump, `published_at` set  | purge `/<rev>/<slug>` |
| schedule dialog       | draft → scheduled     | `scheduled_at` set                      | none (not served)     |
| scheduler             | scheduled → published | same as publish; `scheduled_at` cleared | purge                 |
| share create / revoke | —                     | `preview_shares` row, `revoked_at` set  | n/a                   |
| duplicate             | —                     | new theme row                           | n/a                   |
| switch default        | —                     | `is_default` flip                       | purge                 |
| rollback              | published → draft     | restore `page_state`, new `revision_no` | purge                 |

## 11. Design guidelines — publishing surfaces

Follows `00-meta/design-system.md` §10; the publish moment is a "stand back and check"
experience, not a one-click gun.

- Intent: give the merchant a breathing room after the risk of a bad publish — the confirm
  dialog shows the after-state, the schedule dialog owns the future, the timeline owns the
  past.
- Key surfaces: publish confirm dialog (after-render preview + page list), schedule dialog
  (date + time pickers, zone stamp), share sheet (link, expiry, revoke), revisions timeline.
- Palette: neutral chrome; BD teal for the primary action; Mint for the published success
  state; amber text chip "সূচি নির্ধারিত" — text label plus color, never color-only.
- Typography: tabular nums for revision numbers and timestamps; `1rem` dialog content;
  Bangla labels (`প্রকাশ করুন`, `সূচি নির্ধারিত`, `পূর্বের রিভিশনে ফেরত`) with English-safe
  keys.
- Density: `0.875rem` components match the editor; schedule dialog rows 32px with 44×44px
  touch targets.
- Motion: dialog 200ms ease; state chip crossfade 120ms; reduced-motion → opacity only.
- A11y: confirm is a native button; the after-state preview is an accessible iframe; 44×44
  targets for share/revoke; text labels never color-only.
- Performance: publish = ONE `theme_publish` round trip; share creation = one insert;
  revisions list lazy-pages 50 rows; the dialog never blocks editor undo.
- Anti-slop: no fake progress bars for a fast local op; real copy, real timestamps; cancel
  (rollback) is a first-class button, not a footnote link.

## 12. Testing gates (E2E contract-first)

- Publish round trip: draft → confirm → published → storefront serves `revision_no + 1`;
  `page.published` emitted; purge registered.
- Schedule: `scheduled_at` set → storefront keeps serving old revision until T → promotion →
  new revision serves; canceled schedule returns to draft.
- Failure: scheduler crash at promotion → page stays scheduled (never published) → DLQ →
  recovery replays.
- Preview share: token renders draft; expired/revoked token → 404; share carries `noindex`.
- Duplicate → publish: new draft loads, original theme untouched; purge fired.
- Rollback: restore revision k → draft; publish → new revision k+1; revision k still listed.
- Guardrail: anon can never fetch `scheduled_at`-only pages or share tokens.

## 13. Residual v0 gaps

- Scheduled publish is per page; a "publish page set at HH:MM" batch job is a later
  extension.
- `revisions` keep every snapshot but there is no per-widget diff; time travel beyond
  "restore a snapshot" waits for S2 diffing.
- Webhook consumers of `page.published` are out (S7 / 12-SDK).
- Annotations on revisions (why did this change?) are not v0.
- Preview shares follow the page, not a pinned revision; snapshot-pinned shares are a later
  option.

## 14. Time-based unpublish (scheduled removal)

Closes `00-meta/audit-verdict.md` (Real gap 1): publish is no longer forward-only. A merchant
can schedule a published page to go off the storefront at a chosen time, mirroring the CMS
precedent in `05-marketing/content-cms.md` (`published → archived`).

Schema delta (same `pages` migration set as §5's `scheduled_at`): `pages.scheduled_removal_at
timestamptz null`. A page with `scheduled_removal_at is not null` is _scheduled for removal_.
`theme_audit` `page.scheduled_removal` carries `{at, by}`.

State machine arm (extends `04-builder/README.md` `draft → preview → published`):

| current           | transition              | where enforced                                                              | evidence |
| ----------------- | ----------------------- | --------------------------------------------------------------------------- | -------- |
| published         | → scheduled_removal     | remove scheduler bar (guard `themes.publish`)                               | §14      |
| scheduled_removal | → published (unchanged) | **Clear removal** action clears the column                                  | §14      |
| scheduled_removal | → unpublished           | scheduler fires at T                                                        | §14      |
| unpublished       | → published             | "publish now" from the removed page's resume draft (normal `theme_publish`) | §4       |

Editor surface:

- Remove scheduler bar: calendar picker + note, `scheduled_removal_at` (stored UTC, shown as
  Asia/Dhaka). Scheduled-for-removal pages carry a text-label chip in the page list
  ("অপসারণ নির্ধারিত"), never color-only.
- While pending, the page keeps serving its published revision (activity continues); the
  canvas still edits the draft, and the publish bar stays "published" until T.
- **Clear removal** restores the publish-only state (`scheduled_removal_at = null`, audit
  `page.scheduled_removal_cancelled`).

Scheduler behavior (fired by the same `promote_due`-style per-page, per-tenant lock loop as
§5; not a second publish implementation):

1. Finds pages where `scheduled_removal_at <= now()` and still serving, per page.
2. Flips the page off the storefront (removal is a state-column write + audit, NOT a
   `revisions` insert — the last published revision stays as history, so the timeline and
   §9 rollback keep working; the storefront's serving rule is unchanged: anon sees only
   pages that are live per TR-8).
3. On failure: audit `page.removal_failed` + retry with backoff → DLQ. The page never goes
   half-served; a crash mid-pick has the same effect as §5 promotion (column stays set,
   job retries, no partial state).
4. Removal emits the §8 purge on the affected page keys (`/<rev>/<slug>`); 60s TTL is the
   worst-case staleness bound, same as publish.

Persistence changes (table pattern, mirrors §10):

| surface              | transition                      | row change                                     | cache                        |
| -------------------- | ------------------------------- | ---------------------------------------------- | ---------------------------- |
| remove scheduler bar | published → scheduled_removal   | `scheduled_removal_at` set                     | none (still serving until T) |
| clear removal        | scheduled_removal → published   | `scheduled_removal_at` cleared                 | none                         |
| scheduler fires      | scheduled_removal → unpublished | page leaves the live set; no `revisions` write | §8 purge; converges ≤ 60s    |

Guardrails:

- An anon request never sees a scheduled-removal or removed page (TR-8 read rule; the purge
  covers the transition window).
- Removal is page-level in v0 (`publish` a _set_ of pages stays out, mirroring §13); a
  later slide can reuse the same column pattern.
- After removal the editor can republish via the ordinary `theme_publish` path — removal is
  not a deletion; the revisions timeline keeps the whole history.
- Copy (Bangla, English-safe keys): `অপসারণ নির্ধারিত` (Removal scheduled), `অপসারণ বাতিল`
  (Clear), `পুনরায় প্রকাশ করুন` (Republish).
