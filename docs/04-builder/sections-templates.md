# 04 — Builder: Sections & Template Library

Status: Planning · Approved plan (parent: `04-builder/README.md`) · Slice S1 (skeleton) / S7 (full editor)
Owners: Builder Platform + Frontend Platform
References: `04-builder/README.md` (engine, data model, publish machine) · `theme-registry.md` (theme pins, AST contract) · `theme-runtime.md` (TR-1/TR-2) · `03-storefront/README.md` (rendered surfaces) · `16-product-pricing/README.md` (entitlements) · `00-meta/design-system.md` §1, §2, §5, §10
Design decision (approved): **a template is the page-type contract** (page, product, article, collection); **a section is a named, reusable group of widgets** that fills one slot in a template; **every page AST is an instance of exactly one template**, and per-page section overrides ride the page draft — the template file itself is never mutated from the editor.

---

## 1. Purpose

Merchants compose storefront pages from widgets today (engine in `04-builder/README.md`). Sections + templates upgrade that into a Shopify-class workflow: shared layouts, template-level consistency, plan-gated libraries, and non-destructive page conversion.

This plan adds, scoped to the builder:

- A template library: page-type contracts with canonical slots and widget allowlists.
- A section model: named widget groups that fill slots, reusable across pages and devices.
- Editor surfaces for both (library, canvas, inspector, publish bar).
- Safe conversion of legacy `pages` rows into template instances (`non-destructive backfill`).
- Server-side validation for every AST write — the client never decides what a slot may hold.

It deliberately does not change `theme-runtime.md` TR-1/TR-2: the runtime keeps owning rendering, data and safety; this plan only changes what the editor can compose and how a page's AST is structured.

## 2. Template hierarchy

```
template (kind + slot_schema + widget allowlists)
  └─ slot × n  (header, main, footer, ...)
       └─ section × 0..n  (ordered, reusable group)
            └─ widget × 0..n  (existing widget model, instance-pinned)
```

1. **Kinds.** Built-in starter kinds: `page` (static/landing), `product`, `collection`, `article`. Merchants can add more kinds from a starter template (`source_template_id`). Every kind has a defined slot schema; store defaults live in `theme-registry.md`.
2. **Per-kind.** A store can hold many templates sharing a kind, but every template belongs to exactly one kind.
3. **Pin rule (mirrors TR-1)**: template installs are pins — a published page renders under the template version it was published with. Template "updates" create a new version; already-published pages are re-rendered only when the merchant opts a page onto the new version (from `draft`), which produces a new `revisions` snapshot.
4. **Token-only styles**: section styling may only consume the theme's semantic tokens (storefront subset, design-system §2) — no arbitrary color/radius values inside a page AST (`save_page_ast` rejects hex).

## 3. Section model

- **Section** = a named block: `{ section_id, label, widgets[] }` + one container style object (`maxwidth`, `gap`, `padding`, `bg` from tokens, `hidden_mobile`/`hidden_desktop` booleans).
- A section is **immaterial to the runtime** — a grouping/ordering aid; the serializer flattens it to HTML exactly like today.
- **Slot schemas** define which widget types a position accepts:
  - `header` / `footer`: layout widgets only (`heading`, `text`, `image`, `custom_html`, `marquee`).
  - `main`: any standard widget.
  - `buybox` (product kind): `buy_box` only, plus `countdown`, `faq_accordion`, `trust` — cart/checkout-sensitive widgets.
  - `grid` (collection kind): `product_grid` / `collection_grid` only.
  - Store-wide defaults live in `theme-registry.md`; a template may narrow, never widen, a slot schema.
- **Server-side validation** (AGENTS.md: no client-trusted decisions): RPC `validate_page_ast(template_id, ast)` rejects a section that violates allowlists. The editor polls this RPC before enabling **Publish**.

## 4. AST shape (page)

The existing `pages(ast jsonb)` evolves from flat children to slot-keyed:

```json
{
  "type": "page",
  "template": { "id": "tpl_123", "version": 7 },
  "slots": {
    "header": [
      { "widget": "heading", "instance": "u8", "props": {}, "styles": {} }
    ],
    "main": [
      { "widget": "product_grid", "instance": "u9", "props": {}, "styles": {} }
    ],
    "footer": []
  }
}
```

- `instance` is stable across drag/duplicate (undo/redo depends on it).
- Styles reference semantic tokens only (design-system §2); hex values rejected by `save_page_ast`.
- Render path, SSR and hydration unchanged (`04-builder/README.md` engine path, TR-2).

## 5. Data model

No new tables in S1:

- `templates` — add columns: `kind`, `slot_schema jsonb`, `widget_allowlist jsonb`, `version int`, `source_template_id uuid null`, `backfilled_from_legacy bool default false`. Tenant-scoped (`merchant_id` + RLS).
- `pages` — add `template_id uuid → templates(id)`. `ast` keeps the new slot-keyed shape; legacy `children`-shaped rows migrate via §6.
- `revisions` — snapshot the full page row (template_id + ast) on every publish.

In S7 (editor): `template_favorites` (per-merchant pinning) and `sections_library` (tenant-custom sections), both `merchant_id`-scoped.

**Event additions** (04 event set `page.published`, `widget.installed`, `theme.updated`): `template.created`, `template.versioned`, `template.archived`. A `template.updated` never exists — template edits are version bumps (§2-3).

## 6. Non-destructive backfill

Legacy `pages` rows (flat `children`) become template instances without loss:

1. For each legacy page: create `kind` template `tpl_legacy_page` (slot `main` only); mark `backfilled_from_legacy = true`.
2. Copy the widget list into `slots.main` in order; preserve `instance` ids.
3. The conversion is **idempotent** — reruns bind nothing new (`pages.template_id` already set) and never fail a live page: if the backfilled AST fails validation (e.g. an allowlist break), the row stays legacy, the template records `error_reason`, and the storefront keeps the pre-backfill render (fallback mirrors `theme-runtime.md` §8).
4. Notify the merchant whenever a page render would change (`template.migration_completed` notice) — no silent layout changes on a published store.

## 7. Editor surfaces (inventory)

Each surface follows the repository per-page Design guidelines (design-system §10).

### Surface 1 — Template library (`admin/builder/templates`)

- **Controls**: **New template** (primary opens a kind chooser), **Duplicate**, **Preview**, **Version history**; kind filter chips (`page` / `product` / `collection` / `custom`); search.
- **Row info**: template name (Bangla-first), kind badge, pages using it (count), last edited-at, plan-usage meter ("X of Y templates on this plan").
- **States**:
  - empty: illustration + “তোমার স্টোরে এখনো কোনো টেমপ্লেট নেই — প্রথমটা বানাও” (Add your first template).
  - plan-limit-hit: **New template** disabled + tooltip “Your plan covers X templates — upgrade unlocks more” + **Upgrade** link (entitlements in `16-product-pricing`).
  - errors: RLS/permission → inline banner “You don't have edit rights on this template”.
- **Confirmations**: Duplicate → modal naming the copy ({name} — copy, editable); Archive → modal: “X pages keep rendering from the pinned version” (§2-3).

### Surface 2 — Composer canvas (extends the existing editor)

- **New surfaces**: **Add section** placeholders (dashed 44px rows between slots); **Section library rail** (left; groups Layout, Products, Media, Text, Commerce; search); **Slot indicator** (which slot a section snaps to; arrow-key navigation).
- **Empty state** per slot: “Add your first section to {slot}” with the same in-canvas CTA.
- A section moves/drag/duplicates as one unit; widgets keep existing drag behavior inside it.
- 44×44px hit targets for every handle and ghost (design-system §4).

### Surface 3 — Section inspector (right)

- Edits a section (whole group), not a single widget: container fields (`orientation`, `gap`, `padding`, `bg` token, alignment), `hidden_mobile` / `hidden_desktop` toggles.
- Numeric/spacing fields use tabular numerals; any token-out-of-set value disables **Save / Apply** with an inline error under the field (`aria-describedby`).
- Device toggle (desktop / tablet / mobile) is a field-level segmented control.

### Surface 4 — Publish bar (reuses the publish machine from `publishing.md`)

- **Publish** (primary) opens a diff modal: sections added / changed, template bump, affected storefront pages.
- Blocked states: AST validation failing → disabled with inline reason; not “preview verified”; entitlement at limit → `plan_limit_exceeded` with upgrade link.
- **Rollback** = “Revert to last published” → restores the most recent `revisions` snapshot (a new publish, never a destructive write).

**Error codes** (RPC, Bangla-first microcopy):

| Code                  | Inline copy                                                              |
| --------------------- | ------------------------------------------------------------------------ |
| `template_not_found`  | “এই টেমপ্লেটটি আর নেই” (This template is gone)                           |
| `slot_not_allowed`    | “এই স্লটে এই উইজেট অনুমোদিত নয়” (Widget not allowed in this slot)       |
| `token_not_allowed`   | “শুধুমাত্র থিম টোকেন ব্যবহার করুন” (Only theme tokens allowed)           |
| `plan_limit_exceeded` | “আপনার প্ল্যানের সীমা শেষ — আপগ্রেড করুন” (Plan limit reached — upgrade) |

## 8. Plan entitlements + usage meter

Template counts are not inventoried here — they live in the `16-product-pricing` matrix and are enforced by the shared entitlement RPC (`check_entitlement(tenant_id, 'templates', n)`):

- Over-limit write → blocked, `plan_limit_exceeded`, never silent truncation.
- No store-local cap state — the same backend RPC behind the plan-features surface.
- The library's usage meter is text (not color-coded) per `16`'s meter rule, and crossfades on change.

## 9. Revisions & rollback

- Publish always appends a `revisions` row (template_id + ast snapshot).
- Rollback restores the most recent row for that page as a **new** draft → follow the `draft → preview → published` machine.
- Durable revisions are per-publish only; per-section undo steps live in the editor's local history (S7).
- `template.archived` blocks new pages bound to the template; existing pages keep rendering from their pinned version.

## 10. Design guidelines — template library & composer

- **Intent**: measured, editorial — composable structure, quiet chrome (near-monochrome slate); the canvas previews the storefront with real theme tokens.
- **Key surfaces**: template cards, slot-zone indicator, section library rail, dashed 44px placeholders, inspector layout-field group.
- **Palette emphasis**: mint = publish-valid / network-ok no state; amber = unsaved or blocked; teal = selection/focus. No page invents colors (repo anti-slop rule).
- **Typography**: compact 0.875rem admin; canvas shows the store's real Bangla font stack; tabular numerals for spacing.
- **Density**: builder-dense inspector; canvas airy (32px grid).
- **Motion**: 120ms drag-ghost, 200ms panel; opacity-only under `prefers-reduced-motion` (design-system §5).
- **A11y**: keyboard-navigable slot tree (treeitem semantics), visible focus ring everywhere, live region announces section add/remove.
- **Performance**: canvas virtualization, ast-diff debounce, publish purge (existing 04 gate).
- **Anti-slop**: no invented colors or radius — all populated from tokens; every microcopy string lives in the i18n catalog (`03-storefront/i18n.md`) with Bangla-first + English fallback.

## 11. Persistence states (surface-wide)

| State   | Copy (Bangla-first)                                        | Note                            |
| ------- | ---------------------------------------------------------- | ------------------------------- |
| saving  | “সংরক্ষণ হচ্ছে…” (Saving…)                                 | no spinner text, no color       |
| saved   | “সংরক্ষিত” (Saved)                                         | muted tone, slide out           |
| error   | “সংরক্ষণ হয়নি — আবার চেষ্টা করুন” (Not saved — try again) | coral border on the failing row |
| offline | “সংরক্ষণ হয়নি” (Saved on this device)                     | amber dot; changes keep locally |

## 12. Testing gates

- `builder_loop` E2E extends: create template → compose with sections → validate AST → publish → rollback → verify rendered storefront.
- Negative: wrong-slot widget → `slot_not_allowed` with blocked write; hex style → `token_not_allowed`.
- Entitlement: cap reached → `plan_limit_exceeded` blocked write; meter text updates.
- Backfill: legacy page converts; conversion idempotent (run twice → one bind); failing validation → legacy page still renders.
- Version/rollback: publish produces a `revisions` row; rollback produces a new revision; `template.versioned` announced.

## 13. Residual v0 gaps

- MFS licensing, KYC, and live money flows are out of scope (mock-MFS sandbox per `06-payments/README.md`).
- Section widgets in the runtime: currently HTML-only (no interactive hydrated widgets beyond the storefront widget runtime).
- Template ownership transfer between staff roles is a v1 follow-up (needs `staff-rbac.md` extension).
