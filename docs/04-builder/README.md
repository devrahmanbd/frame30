# 04 — Builder

Status: Planning · Slices S1/S7 · Reference: `/plan.md` §3.4 (builder), 7 (themes)
Plans: `theme-registry.md` (registry contract) · `theme-runtime.md` (TR-1/TR-2, fallback) · `sections-templates.md` (widget/section models) · `publishing.md` (schedule/publish/rollback) · `app-blocks.md` (widget catalog, sandbox, validation) · E2E: `docs/15-e2e/theme_registry.md`
Design baseline: `00-meta/design-system.md` (builder consumes tokens; themes get token subset)

---

## Purpose

Own drag-and-drop page builder (Elementor-style) over a JSON AST engine. Merchants compose storefront pages from widgets, styled by design tokens — no code. Also drives theme preview.

## Components

- **Editor UI (admin SPA)**: canvas, widget library sidebar, property inspector, device preview (desktop/tablet/mobile), undo/redo, template library.
- **Engine (runtime-agnostic)**: AST `{type:"page", children:[{widget, id, props, styles}]}`; serializer → HTML; hydration for interactivity (only widget JS, sandboxed); SSR-safe.
- **Widget system**: built-in widgets (heading, text, image, product grid, collection grid, buy box, form, video, countdown, FAQ accordion, marquee, custom HTML) + community widgets from marketplace (12) with versioned sandbox.
- **Design tokens editor**: brand palette → semantic map, fonts (Bangla display), radius, spacing; live preview; save per theme.
- **Theme/preview**: `?preview=ast` render in storefront runtime; publish → CDN cache purge.

## Data model

`pages(ast jsonb)`, `widgets(manifest)`, `theme_tokens`, `templates`, `revisions` (every publish snapshot for rollback).

## State machine (publish)

`draft → preview → published` (rollback = restore previous revision).

## Events

`page.published`, `widget.installed`, `theme.updated`.

## Failure/recovery

- Editor crash → autosave draft every 5s to Redis; recovery prompt on reload.
- Invalid widget in page → skip widget, show placeholder, never break whole page.

---

### Design guidelines — builder editor, token editor, preview

- Intent: a tool that feels like a professional design studio — fast, precise, calm; canvas is the star, chrome recedes.
- Key surfaces: canvas + ruler + device bar, widget library rail (left), property inspector (right), top bar (undo/redo/publish), token color picker, live preview.
- Palette: near-monochrome chrome (slate 100–900) so the canvas's brand colors pop; accent only for selection (BD teal) and "unsaved" amber dot; publish mint.
- Typography: compact 0.875rem panels; canvas shows real theme fonts (Bangla display in preview); tabular nums for width/offset inputs.
- Density: editor-dense — snap-to-grid visual, property fields stacked 4px, keyboard-first (arrow keys to nudge, Enter to commit).
- Motion: drag ghost 120ms; panel slide 200ms; device switch crossfade 240ms; reduced-motion → none.
- A11y: every widget selectable+keyboard draggable; property inspector is a form with labels; focus ring; contrast badge live.
- Performance: canvas virtualization (only visible widgets in DOM), AST diffing, worker for serialization, publish purge quick.
- Anti-slop: distinctive — a "widget" tray in Bangla with hand-drawn-style icons; a live BD-brand palette suggestion engine (from merchant's logo upload); 1-click "My color" auto-palette extraction.

---

## Strict guardrails

### 2. Data & tenancy

- Page ASTs, widget manifests, theme tokens, templates and `revisions` are tenant-scoped (`merchant_id` + RLS); a merchant can never see or edit another store's theme or pages.
- `revisions` keep every publish snapshot so rollback is always a restore of a saved snapshot — never re-rendered from memory.

### 3. State transitions

- Publish machine: `draft → preview → published`; only the published revision serves the storefront; rollback = restore previous published revision (a new publish, never a destructive overwrite).
- Publish triggers the CDN cache purge so visitors never land on a stale page after a merchant publishes.

### 4. Vendors & data-export

- Community widgets from the marketplace are versioned and sandboxed — only validated widget JS executes, inside the sandbox (see 12); a failing sandbox validation means the widget is never loaded.
- Unpacking theme upgrades: registry keeps the last-good revision when a new one (or its widgets) fail validation (see 15-e2e/theme_registry.md).

### 6. Accessibility & performance

- Editor is keyboard-first: every widget selectable + keyboard-draggable; property inspector is a labelled form; contrast badge live; focus ring; reduced-motion → editor motion none.
- Canvas virtualization (only visible widgets in DOM), AST diffing, worker-based serialization, publish purge runs off the UI thread.

### 7. Failure & recovery

- Editor crash → autosave draft every 5s to Redis; recovery prompt on reload, no lost work.
- Invalid widget on a page → skip it, show placeholder with an inline error, never break the whole page render.

### 8. Testing gates

- builder_loop E2E must pass: draft → autosave → preview → publish → rollback, plus the invalid-widget placeholder path.
- Theme-registry validation failure → last-good fallback verified in `docs/15-e2e/theme_registry.md`.

### Audit verdict — checklist

Follow-up record for `00-meta/audit-verdict.md`; every line below is verifiable in this plan's own sections or the plans it references.

- **Sections audited**: Purpose, Scope, state machine, guardrails `### 2`/`### 3`, failure & recovery, testing gates; all claims trace to sections above or to `publishing.md`, `theme-registry.md`, `theme-runtime.md`.
- **State machine quoted**: `draft → preview → published` (§3 above); `publishing.md` adds the `scheduled` arm and `§14` adds `scheduled_removal → unpublished`; both flow through `theme_publish` — never a second publish implementation.
- **Scheduled publishing**: `pages.scheduled_at` → scheduler promotes via `theme_publish` (`publishing.md` §5); failure gate is the registry's last-good fallback (`theme-registry.md` §6), and the storefront never serves a half-published page.
- **Widget sandbox**: community widgets are versioned + sandboxed; only validated JS executes (§4 above, `app-blocks.md`); failing validation = widget never loaded.
- **Events (v0)**: `page.published` + `theme.updated` only; no new event surface is introduced by this checklist.
- **Owners**: builder/runtime for the machine; storefront for TR-8 serving rules; 05-marketing for articles via `content-cms.md`.

## Studio UI (implemented)

`/admin/builder` is a three-pane studio: slot outline + widget tray, device-scoped
canvas, and a tabbed side panel (Settings / Brand / History / Themes).

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
  by the `theme_sweep` cron runner.
- **Registry** — official themes install as a draft version, so the merchant keeps
  their last-good published theme if they change their mind.

Published tokens reach the storefront as CSS variables on the store root
(`fq-theme-scope`), so merchant branding never leaks into admin chrome.

## Phase C — official theme packages

Ten official themes now ship a complete template hierarchy (`index`, `product`,
`collection`, `page`, `blog`, `cart`, `checkout`), each with header/main/footer
slots, responsive breakpoint overrides and the context widgets the template
requires.

- Source of truth: `src/lib/theme-presets.ts` (typed, version `2.0.0`).
  `theme_registry` holds catalogue metadata only, so SQL and runtime cannot drift.
- Install path: `theme_install_preset(_merchant_id, _key, _preset)` — the server
  parses and lints the package before the RPC writes a draft version; any lint
  error rejects the install and the merchant keeps their last-good theme.
- Guard rails: `src/lib/theme-presets.test.ts` asserts token validity, template
  completeness, lossless AST parsing, unique section ids and a clean lint for
  every theme and every template.
