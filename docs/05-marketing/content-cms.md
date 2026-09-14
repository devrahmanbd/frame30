# 05 — Marketing: Content CMS

Status: Planning · Approved plan (parent: `05-marketing/README.md`) · Slice S6
Owners: Marketing Platform + Backend (content pipelines)
References: `05-marketing/README.md` (data model, events, guardrails) · `04-builder/sections-templates.md` (§7 editor surfaces pattern, error-code table) · `03-storefront/README.md` (rendered article pages, nav slot) · `16-product-pricing/README.md` (plan entitlements) · `00-meta/design-system.md` §1, §2, §3, §10 · `01-architecture/README.md` (Storage + imgproxy asset path)
Design decision (approved): **an article is a JSON-structured document** (`articles`, extended below) with an explicit publish state machine (`draft → scheduled | published → archived`); **media lives in Storage and is rendered only through the imgproxy transform pipeline**; **menus are editor-authored navigation models applied to the storefront nav slot** — marketing never forces a page-format change on a published store.

---

## 1. Purpose

Merchants need a first-class content surface: blog/articles to tell their brand story, media to feed the storefront, and structured SEO/AEO meta that the marketplace respects. The platform already ships `articles`, `seo_meta` and the media path (Storage + imgproxy in `01-architecture`); this plan turns those rows into a real CMS for the editor with per-surface inventory and guardrails.

Scope:

- An article editor with drafts, scheduling, cats and tags, author attribution, AEO/SEO fields.
- A media library over Storage + imgproxy (public URLs only, tenant-scoped buckets, transform params).
- A menu builder (site nav + mega-nav) that writes the storefront nav slot — no storefront page changes.
- A category manager with tree-safe deletes (relinked, never orphaned).
- Entitlement-gated quantities via `check_entitlement(tenant_id, 'articles', n)` reads from `16-product-pricing`.

It never changes the storefront render path (`04-builder/theme-runtime.md` TR-2): menus and articles render through the existing nav widget and the article template.

## 2. Content model & state machine

```
article {
  id (uuid, tenant-scoped, RLS),
  title (Bangla-first; `en_title` optional),
  slug (unique per tenant; reused after archive),
  excerpt, body (structured blocks, see §3),
  cover_media_id (uuid → media), author_id (identifiable staff),
  category_id (nullable, tree), tags[],
  seo { title, description, jsonld, canonical, robots },
  published_at (timestamptz), scheduled_for (nullable),
  state: draft | scheduled | published | archived,
  revisions (jsonb[] of snapshots — last-N undo)
}
```

- **State machine**: `draft → scheduled` (needs `scheduled_for` in future) / `draft → published` (needs content in body + valid `published_at`); `published → archived`; `archived → draft` is a recycle (a new un-publish event, mirroring the existing publish transition). `scheduled → published` is a one-way transition handled by the scheduler, not the editor.
- **Scheduled is a promise**: the `.scheduled` state is displayed with a countdown in author UI; the storefront never renders scheduled content ahead of `published_at` (server check, not client `now()`).
- **No destructive delete**: deleting a published or scheduled article fails server-side with `article_has_publish_state`; the editor surface instead offers **Archive** which marks it archived. Hard-delete exists only platform-side.
- **Events** (05 set `form.submitted`, `coupon.redeemed`, …): `article.created`, `article.updated (draft autosave)`, `article.published`, `article.scheduled`, `article.archived`, `media.uploaded`, `media.deleted`, `nav.updated`. No event ever carries the article body; drafts persist via the page draft model.

## 3. Media library (Storage + imgproxy)

- Developer-facing contract in `01-architecture`: public assets in Storage (bucket per tenant, `media/…` key) then served through **imgproxy** transforms — `?width=`, `?height=`, `?fit=`, `?quality=`; the store URL is always a derived transform CDN URL, never a raw object URL for editorial content.
- **Editor media picker**: grid (2-col mobile, 4-col desktop) with file upload (drag + drop), search by filename, filter by type (`image` / `video` / `document`), recent-first order; **Upload progress** with cancel; selected state shows a preview + alt-text prompt (alt required before publish: `media_missing_alt`).
- Upload validations: content-type allowlist (`image/*`, `video/mp4`, `application/pdf`), size cap (images ≤ 10 MB, video ≤ 100 MB), malware scan hook; reject with a framed upload error banner under the dropzone — never silent.
- **Transform preview**: the editor shows the EXACT transform URL preflight. Any size/quality param is applied via imgproxy query string; the store never receives crop-at-runtime (server does).
- Cost guardrail: the media library reads the plan's storage cap from `check_entitlement(tenant_id, 'storage_gb', …)` and blocks new uploads with `plan_limit_exceeded` when over; existing objects are never deleted on downgrade.

## 4. Categories & tags

- **Categories are a tree** (parent_id nullable, `category-tree` RLS); a row may have one parent, cycles rejected.
- Ordering is manual (`sort_order`, unique per parent).
- **Delete safety**: deleting a category with child content: server RPC `archive_category` moves child categories + article refs one level up, honors `category_not_empty_guard` (refuses at auto-shift > 25), article rows keep `category_id` set null → a `category.removed` event fires with the count.
- Tags: free-form strings on the article; replicated into Meilisearch index (search surface in storefront).

## 5. Menus (nav + mega-nav)

- Menu = ordered list of nodes: `{ node_id, label (bn/en), type: page|product|collection|article|url, target, children[] }`, stored per tenant (`nav_config`) — this target is the render source for the storefront **nav slot** (`03-storefront/README.md` populated; fallback to default theme nav when empty).
- The mega-nav extension: node type `mega` = a section with up to 4 columns (category trees or recent articles); a column renders as a static heading + links.
- Editor surface (`admin/marketing/menus`): tree rows with drag-to-sort, add-child button, per-node static type menu; depth + children-count column; 44px hit targets for tree rows when writing to the nav slot.
- Guard: render-time fallback loop kills a nav cycle (node linking to itself) at publish; `nav.cycle_detected` event + blocked save with the cycle path.

## 6. SEO/AEO meta (seo_meta)

- Every publishable row gets a row in `seo_meta` (`article_id`, slug, meta_title, meta_description, canonical, robots, json_schema).
- **Slug uniqueness** enforced at API layer on publish; rename creates a 301 from the old slug (storefront handles, blog list 404 not).
- JSON-LD: article + breadcrumbs + author `@graph` (Product/FAQ recipes inherited per `pages_extra` route); teaser meta in **Bangla-first**, English fallback auto-rendered empty.
- The storefront renders meta in `<head>` (canonical, og, schema) and the sitemap feeds `articles` (marketing admin reuses `sitemap.xml` generator from `03-storefront`).
- `robots: noindex` on scheduled + archived → crawler does not see work-in-progress; merged out of scope: auto-generated FAQ works on storefront templates (see residual §12).

## 7. Plan entitlements + usage meter

- Article count limits, media storage caps and nav depth are **not** owned here — read from `16-product-pricing` via `check_entitlement(tenant_id, 'articles'|'storage_gb'|'menus', n)`.
- Writer-side countdown: the plan-progress line shows "X of Y used" — **text, not color**, and never counts archived rows.
- Over-limit: block write with `plan_limit_exceeded` + inline `Upgrade` link; never silent truncation (mirror §7-2 from spec 1).

## 8. Revisions & safety

- Autosave (draft) snapshot inside the row; publish writes a full `revisions` row.
- **Rollback** = restore the most recent snapshot (published or draft) into a **new** draft — same recovery contract as spec 4; never destructive.
- Revisions are append-only per publish; the editor keeps local undo stack per session only (not durable).
- Abuse: a malicious author can't set `state: published` on someone else's draft — `staff_rbac` check on every state transition + `article.published` event carries `by` (staff id).

## 9. Design guidelines — blog admin & article editor

- **Intent**: calm, editorial, Bangla-natural — the content is the hero; chrome stays monochrome slate so article previews pop.
- **Key surfaces**: article list (rows, not cards), article composer (left rail: media picker; center: md-rendered live preview), media library grid, menu tree editor.
- **Palette**: teal = select/primary action; mint = published only; amber = scheduled/draft; never color-only (every status shows text label first). No invented hex.
- **Typography**: BN display for article titles; tabular for numbers (dates, counts); the editor body uses the store's real font stack.
- **Density**: list compact (whole rows tighten); composer spacious (40px preview grid).
- **Motion**: cards 120ms hover; panel slide 200ms; publish success = 200ms fade + role status; reduced-motion safe (design-system §5).
- **A11y**: every alt has a prompt, contrast AA for admin text, focus visible per §3 of design-system, live region announces publish state.
- **Performance**: editor loads code-split; preview refetches on 500ms debounce; menu config serializes once into `nav_items`.
- **Anti-slop**: distinctive — publish confirm shows the "কেমন দেখাচ্ছে" (how it looks) window with the real article; the scheduled list shows Bangla weekdays; never Lorem.

## 10. Persistence & publish state copy

| State        | Copy (Bangla-first)                | Note               |
| ------------ | ---------------------------------- | ------------------ |
| draft        | "খসড়া" (Draft)                    | slate dot          |
| scheduled    | "প্রোগ্রামকৃত" (Scheduled)         | amber dot          |
| published    | "প্রকাশিত" (Published)             | mint dot           |
| archived     | "সংগ্রহাগারে" (Archived)           | muted dot          |
| error saving | "সংরক্ষণ হয়নি — আবার চেষ্টা করুন" | coral field border |

## 11. Testing gates

- `store_loop` adds: article CRUD → scheduled → published; nav serializes; menu cycle → blocked; tag/cat tree correctness; `seo_meta` renders meta bytes on article page; fast publish → prod render.
- `admin_loop` covers: transfer states, storage cap path, alt-missing block, delete-safety (archive path), menu tree.
- Failure suite: storage bucket 500 returns on upload → error surface; scheduler tick delivers scheduled article on state advancement; concurrent article edit conflict → 409 + saved copy in revision.

## 12. Residual v0 gaps

- MFS licensing, KYC, and live money flows are out of scope (mock-MFS sandbox per `06-payments`).
- Video transcoding / PDF preview in the composer is deferred (images only).
- Drafts of _storefront pages_ are not part of this spec (see `04-builder/publishing.md`).
