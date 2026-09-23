# 04 — Builder

Status: Planning · Slices S1/S7 · Reference: `/plan.md` §3.4 (builder), 7 (designs)
Plans: `sections-templates.md` (widget/section models) · `publishing.md` (schedule/publish/rollback) · `app-blocks.md` (widget catalog, sandbox, validation)
Design baseline: `00-meta/design-system.md` (builder consumes tokens; designs get token subset)

---

## Purpose

Own drag-and-drop page builder (Elementor-style) over a JSON AST engine. Merchants compose storefront pages from widgets, styled by design tokens — no code. Also drives page preview.

## Components

- **Editor UI (admin SPA)**: canvas, widget library sidebar, property inspector, device preview (desktop/tablet/mobile), undo/redo, template library.
- **Engine (runtime-agnostic)**: AST `{type:"page", children:[{widget, id, props, styles}]}`; serializer → HTML; hydration for interactivity (only widget JS, sandboxed); SSR-safe.
- **Widget system**: built-in widgets (heading, text, image, product grid, collection grid, buy box, form, video, countdown, FAQ accordion, marquee, custom HTML) + community widgets from marketplace (12) with versioned sandbox.
- **Design tokens editor**: brand palette → semantic map, fonts (Bangla display), radius, spacing; live preview; save per design.
- **Design/preview**: `?preview=ast` render in storefront runtime; publish → CDN cache purge.

## Data model

`pages(ast jsonb)`, `widgets(manifest)`, `design_tokens`, `templates`, `revisions` (every publish snapshot for rollback).

## State machine (publish)

`draft → preview → published` (rollback = restore previous revision).

## Events

`page.published`, `widget.installed`, `design.updated`.

## Failure/recovery

- Editor crash → autosave draft every 5s to Redis; recovery prompt on reload.
- Invalid widget in page → skip widget, show placeholder, never break whole page.

---

### Design guidelines — builder editor, token editor, preview

- Intent: a tool that feels like a professional design studio — fast, precise, calm; canvas is the star, chrome recedes.
- Key surfaces: canvas + ruler + device bar, widget library rail (left), property inspector (right), top bar (undo/redo/publish), token color picker, live preview.
- Palette: near-monochrome chrome (slate 100–900) so the canvas's brand colors pop; accent only for selection (BD teal) and "unsaved" amber dot; publish mint.
- Typography: compact 0.875rem panels; canvas shows real design fonts (Bangla display in preview); tabular nums for width/offset inputs.
- Density: editor-dense — snap-to-grid visual, property fields stacked 4px, keyboard-first (arrow keys to nudge, Enter to commit).
- Motion: drag ghost 120ms; panel slide 200ms; device switch crossfade 240ms; reduced-motion → none.
- A11y: every widget selectable+keyboard draggable; property inspector is a form with labels; focus ring; contrast badge live.
- Performance: canvas virtualization (only visible widgets in DOM), AST diffing, worker for serialization, publish purge quick.
- Anti-slop: distinctive — a "widget" tray in Bangla with hand-drawn-style icons; a live BD-brand palette suggestion engine (from merchant's logo upload); 1-click "My color" auto-palette extraction.

---

## Strict guardrails

### 2. Data & tenancy

- Page ASTs, widget manifests, design tokens, templates and `revisions` are tenant-scoped (`merchant_id` + RLS); a merchant can never see or edit another store's design or pages.
- `revisions` keep every publish snapshot so rollback is always a restore of a saved snapshot — never re-rendered from memory.

### 3. State transitions

- Publish machine: `draft → preview → published`; only the published revision serves the storefront; rollback = restore previous published revision (a new publish, never a destructive overwrite).
- Publish triggers the CDN cache purge so visitors never land on a stale page after a merchant publishes.

### 4. Vendors & data-export

- Community widgets from the marketplace are versioned and sandboxed — only validated widget JS executes, inside the sandbox (see 12); a failing sandbox validation means the widget is never loaded.
- Unpacking upgrades: the registry keeps the last-good revision when a new one (or its widgets) fail validation.

### 6. Accessibility & performance

- Editor is keyboard-first: every widget selectable + keyboard-draggable; property inspector is a labelled form; contrast badge live; focus ring; reduced-motion → editor motion none.
- Canvas virtualization (only visible widgets in DOM), AST diffing, worker-based serialization, publish purge runs off the UI thread.

### 7. Failure & recovery

- Editor crash → autosave draft every 5s to Redis; recovery prompt on reload, no lost work.
- Invalid widget on a page → skip it, show placeholder with an inline error, never break the whole page render.

### 8. Testing gates

- builder_loop E2E must pass: draft → autosave → preview → publish → rollback, plus the invalid-widget placeholder path.
- Registry validation failure → last-good fallback.

### Audit verdict — checklist

Follow-up record for `00-meta/audit-verdict.md`; every line below is verifiable in this plan's own sections or the plans it references.

- **Sections audited**: Purpose, Scope, state machine, guardrails `### 2`/`### 3`, failure & recovery, testing gates; all claims trace to sections above or to `publishing.md`.
- **State machine quoted**: `draft → preview → published` (§3 above); `publishing.md` adds the `scheduled` arm and `§14` adds `scheduled_removal → unpublished`; both flow through `design_publish` — never a second publish implementation.
- **Scheduled publishing**: `pages.scheduled_at` → scheduler promotes via `design_publish` (`publishing.md` §5); failure gate is the registry's last-good fallback, and the storefront never serves a half-published page.
- **Widget sandbox**: community widgets are versioned + sandboxed; only validated JS executes (§4 above, `app-blocks.md`); failing validation = widget never loaded.
- **Events (v0)**: `page.published` + `design.updated` only; no new event surface is introduced by this checklist.
- **Owners**: builder/runtime for the machine; storefront for TR-8 serving rules; 05-marketing for articles via `content-cms.md`.

## Studio UI (implemented)

`/admin/builder` is a three-pane studio: slot outline + widget tray, device-scoped
canvas, and a tabbed side panel (Settings / Brand / History / Designs).

- **Templates** — index, product, collection, cart, checkout, blog, page. Each is
  edited independently and stored in one `templates` JSONB document.
- **Autosave** — `useBuilderEditor` debounces 3s of quiet, carries a monotonic
  revision so a slow request cannot overwrite newer work, keeps a 50-step
  undo/redo history, and blocks navigation while a change is unsaved.
- **Lint gate** — `lintTemplate` errors disable Publish (for example a template
  with no primary heading); warnings stay advisory.
- **Brand tokens** — colours are contrast-checked live against AA 4.5:1 and the
  badge states pass/fail in words, never colour alone.
- **History** — immutable versions with restore, plus scheduled publishes handled
  by the `design_sweep` cron runner.
- **Registry** — official designs install as a draft version, so the merchant keeps
  their last-good published design if they change their mind.

Published tokens reach the storefront as CSS variables on the store root
(`fq-design-scope`), so merchant branding never leaks into admin chrome.

## Phase C — official design packages — RETIRED 2026-09-23

Retired with the full purge: no design packages ship, install, or version.
Stores render builder content with default chrome. Original package-contract
text removed; recover via git.
