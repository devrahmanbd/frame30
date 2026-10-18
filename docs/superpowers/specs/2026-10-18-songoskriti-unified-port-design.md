# Songoskriti Unified Port + Docs Canonicalization — Design

**Date:** 2026-10-18
**Status:** Draft — revision 2 (incorporates the user's 2026-10-18 review; 8 revision points)

**Goal:** Port Songoskriti into the unified widget/editor architecture as a trusted, source-owned theme — shared widget keys for standard commerce, theme presentations where only markup/styling differs, `theme:songoskriti/<widget>` definitions only for genuinely unique components — then canonicalize internal and third-party docs around the shipped architecture and add a documentation verification gate to the harness. Zero core-file edits.

**Non-goals:** Level B re-packaging of Songoskriti; manufacturing an official theme ZIP; removing legacy render paths this cycle; engine/plumbing changes; Somvabona changes; mass-rewriting historical docs (contradictory material is bannered, deleted, or pointed at the canonical doc).

## 1. Problem

1. **Architecture gap.** Songoskriti is a source-owned official theme (`src/lib/themes/builtin-themes.ts` — the only authority for official identity), with theme-owned tokens, homepage composition, header/footer builders, and several presentations. Its sections do not yet fully participate in the unified widget/editor contracts: there is no written map from each Songoskriti section to (shared key | presentation | theme-owned widget), so gaps are invisible and porting risks duplicating generic widgets. A second, subtler gap: in unkeyed editor/studio resolution, shared catalog keys can resolve to Songoskriti-specific renderers regardless of the active theme (the registry merges `SONGOSKRITI_WIDGETS` into its renderer sources; keyed storefront resolution is theme-gated and test-enforced), so "exists in the catalog" does not mean "theme-neutral" (§3, §4.2).
2. **Documentation drift.** Concrete examples, cited by content (line numbers verified at commit `5b5b8835` but treated as drifting — Phase 2 re-locates them): `docs/04-builder/README.md` claims "no Playwright, no `.e2e/`" infrastructure; describes `/admin/builder` as the three-pane studio; and carries an honesty disclaimer that names a suite which does not exist — keep the honesty, reword the reference so it does not read as a dead path to the gate (or suppress it with the §6 marker). `docs/developers/plugins.md` is "Last verified 2026-09-26" and predates the `propsSchema`/`defaultProps` contract. `src/lib/themes/songoskriti/homepage.ts` says "30+ sections" while the returned homepage array holds 21 entries. There is no single canonical widget-contract document, and no documentation gate exists in `scripts/` or CI, so drift recurs.
3. **Directive.** Port per the 5-step sequence (freeze → classify → editor contracts → theme-owned visuals → parity), then rewrite docs (A–G) and add the doc gate. Core files are prohibited from now on.

## 2. Direction (approved)

**Approach A — source-owned unified port (accepted).** Principle: shared capability, theme-owned presentation, source-owned official implementation. Merchant/community executable themes stay on the isolated Level B lane.

Rejected: **B** Level B package port (turns the official theme into a third-party distribution; contradicts `builtin-themes.ts` authority and the Level B isolation lane); **C** docs-only porting guide (does not make sections participate in unified contracts).

Why one spec: the port map is consumed by the docs work (C), the docs are enforced by the gate (§6), and the directive sequences them as one program. The implementation plan phases them with review checkpoints.

## 3. Grounding — what exists today

| Fact | Where |
| --- | --- |
| Official theme identity: `isOfficialThemeKey` / `getBuiltinTheme`; never resolved through bundle JSON or `theme_registry` rows | `src/lib/themes/builtin-themes.ts` |
| Theme-owned widget precedent: `theme:songoskriti/ornament` — `WidgetDef` (namespace `theme`, `themes: ["songoskriti"]`, closed `propsSchema` from `PropField` kinds, custom renderer) + native component; registrations currently run only in tests (see reachability note below) | `src/lib/themes/songoskriti/ornament-def.ts`, `ornament-presentation.tsx` |
| Presentation registry: `registerThemePresentation(themeKey, widgetType, Component)`; first-wins; foreign themes never resolve to another theme's presentation; `SectionRenderer` fallback keeps existing behavior | `src/lib/theme-presentations.ts` |
| Presentation claims today: **header — live** (via the `preview.ts:16` re-export → `builtin-themes.ts` → preview-source chain; consumed through the registry's `resolveThemePresentation`); **announcement + footer-proof** — `registerThemePresentation`, currently **test-only**; **dressed-hero + reviews** — versioned-dressing lane (`registerVersionedPresentation`, `builtin:hero`), currently **test-only** | `header-presentation.tsx`, `announcement-presentation.tsx`, `footer-proof-presentation.tsx`, `dressed-hero-dressings.ts` |
| **Shared renderer packs merge theme components:** `SONGOSKRITI_WIDGETS` maps shared catalog keys (`finder_row`, `craft_story`, `testimonials`, `trust_footer`, `product_rail`, `product_grid`, `rich_text`, `newsletter`, `footer_sitemap`, `payment_icons`, `department_grid`, `mega_menu`, …) to Songoskriti renderers and is merged into the registry's renderer source list (iterated as `[components, generic, ...packs]`). Nuance: the registry adapter consumes the packs for def **keys and schemas** (defs are `renderer: "builtin"`), while markup resolution lives in `theme-widgets.ts` and the studio renderers — the **unkeyed** editor/studio path (`resolveWidgetComponent(null, …)` → `WIDGET_COMPONENTS`, which composes `...GENERIC_WIDGETS, ...SONGOSKRITI_WIDGETS`; studio delegations such as `product_grid`) can render Songoskriti markup regardless of theme, while **keyed** storefront resolution is theme-gated and test-enforced | `src/lib/unified-widget-registry.ts:127`, `:1148`; `src/components/builder/songoskriti.tsx:2577`; `src/components/builder/theme-widgets.ts:73-78`, `src/components/builder/widgets.tsx`; `src/components/builder/studio/renderers.tsx`; `src/components/builder/theme-widgets.test.ts` |
| **Theme-owned tray resolution is theme-gated today:** the append seams are `themeTrayEntries(themeKey, …)` (missing/incompatible themes → empty list + reason) and `studioPluginTrayEntries(installed, themeKey)`; active-theme defs append only when themed, empty/disabled/unknown themes append nothing; foreign-theme render resolution falls back to `GENERIC_WIDGETS` (`themeWidgetKeys(installed?)` is a discovery union without a themeKey parameter — not the gate) | `src/lib/widget-presentation.ts:829`, `src/components/builder/studio/plugin-tray.ts:57`, `src/components/builder/theme-widgets.ts:73-78`; `src/components/builder/tray-theme.test.ts` |
| Editor path: route → `buildEditorExtensionRegistry({installedPlugins, themeKey, approvedDevManifest, isActive})` (tenant installs + active theme defs, fail-closed) → one registry → `EditorShell` → `StudioBuilder`; save re-validates per-instance props against each def's schema | `src/lib/editor/editor-registry.ts`, `src/lib/editor/editor-seam.ts` |
| Catalog coverage: the intended homepage types are shared `builder-ast` `SectionType` keys; the emitted homepage uses 12 distinct types across 21 sections (see §4.1); the "30+ sections" comment is stale | `src/lib/builder-ast.ts`, `src/lib/themes/songoskriti/homepage.ts:9`, `types.ts` |
| Songoskriti-specific renderers live in the builder tree; `songoskriti.tsx` sits on the editor client path | `src/components/builder/songoskriti.tsx` (FinderRow, CraftStory, Testimonials, TrustFooter), imported by `src/lib/unified-widget-registry.ts:127`; hero via `heritage.tsx` |
| Variations `minimal` / `festive` (token + skin-default overrides only); collection archetypes | `variations.ts`, `archetypes.ts` |
| Parity infra today: fixed-fixture + builder↔fixture equality + static-markup pins; theme-dir suites (variations/widgets/preview/skins/wiring/ornament) | `src/components/builder/songoskriti-snapshots.test.tsx`, `src/lib/themes/songoskriti/*.test.*` |
| Evidence home with existing reference stills/snapshots (`t6-*`) | `docs/superpowers/songoskriti-evidence/` |
| Demo seed for a Songoskriti tenant (catalogue data only — no theme/widget rows) | `supabase/migrations/20260924_songoskriti_demo.sql` |
| No doc gate exists (no doc/link checker in `scripts/`, no docs job in CI) | `scripts/`, `.circleci/config.yml` |

**Activation reachability (verified 2026-10-18).** The only registration side effect verified to run in prod today is the header presentation: the `preview.ts:16` re-export rides `builtin-themes.ts:12` → `preview-sources.ts` (with client dynamic imports in `src/routes/c.$collectionSlug.tsx:37` / `p.$productSlug.tsx:41`). Store chrome consumes it through the registry (`resolveThemePresentation`) instead of importing the theme module. Ornament registrations, announcement, footer-proof, and the dressed-hero dressings run only under tests; `index.ts` has zero productive importers and is NOT an activation root. Several theme modules are productive in specific graphs — `skins.ts` (`src/lib/themes.server.ts:46`), `variations.ts` (`src/routes/_authenticated/dashboard/builder.tsx:125`), `archetypes.ts` (`src/components/store/CollectionView.tsx:14`), and `songoskriti.tsx` (`src/lib/unified-widget-registry.ts:127`, the editor client path) — so (b)/(c) registrations must ride a module reachable in **each target graph** (see §4.4).

**Renderer neutrality (verified 2026-10-18).** The registry merges theme packs alongside neutral `components`/`generic` maps, so a key's sharedness says nothing about its resolved rendering. The inventory must record, per key, which map provides the winning renderer for a non-songoskriti theme and whether that resolved renderer is theme-neutral (§4.2 lane (a)).

Note: `scripts/capture-ui-stills.mjs` captures marketing stills, not theme references — the port's reference captures follow the `t6-*` evidence pattern (Playwright against a running app) instead.

## 4. Phase 1 — Widget map + parity freeze

### 4.1 Inventory (read-only) — produces the map

Axes (each row gets evidence: `file:line`, current editor visibility (authorized-registry resolve / tray / schema evidence), renderer + **which source map wins for a non-owner theme**, neutrality verdict, and parity coverage):

- Templates: all `TEMPLATE_KEYS` the theme dresses (`TEMPLATE_ZONES` coverage), plus `SONGOSKRITI_VARIATIONS` (`minimal`, `festive`).
- Homepage: emitted ∪ intended — `homepage.ts` emits 21 sections across 12 distinct types (`product_rail` ×6, `split_feature` ×4, `craft_story` ×2, plus `ugc_gallery`, `trust_footer`, `testimonials`, `store_locator`, `recently_viewed`, `hero_carousel`, `finder_row`, `department_grid`, `collection_story`); `HOMEPAGE_SECTION_TYPES` lists 9 intended, two of which (`announcement_bar`, `circle_categories`) are never emitted. The map covers the union (14 distinct types) and records the intended-vs-emitted drift. The stale "30+ sections" comment is corrected by the port; the port map uses the evidence-backed counts, never comments.
- Renderer neutrality: per shared catalog key Songoskriti renders (the `SONGOSKRITI_WIDGETS` key set), determine the verdict **per resolution graph** — keyed storefront resolution (theme-gated, test-enforced) vs unkeyed editor/studio resolution (`resolveWidgetComponent(null, …)` → `WIDGET_COMPONENTS`, including studio delegations like `product_grid`) — and whether the resolved renderer is theme-neutral in each; record leakage findings scoped to the graph that leaks (do not chase a storefront override that keyed tests prove absent; do not miss the studio delegation).
- Global chrome: header (`header.ts`, `header-presentation.tsx`, `header-fallback.ts`), footer (`footer.ts`, `footer-proof-presentation.tsx`, shared copy `footer-copy.ts`), menu behavior.
- Tokens/skins: `tokens.ts`, `skins.ts`, `skins.css`.
- Bilingual copy: bitext pairs across sections and chrome.
- Media/assets: `public/ph/songoskriti/`, `scripts/gen-songoskriti-assets.mjs`.
- Motion: `songoskriti-motion.ts`, shared motion hooks.
- Product-data dependencies: collection slugs and demo-data assumptions (`SONGOSKRITI_COLLECTIONS` archetypes, `/c/` hrefs, `/ph/songoskriti/` asset paths).

Citation rule: all references are by content; exact line numbers are re-located at execution time (working-tree anchors were verified at commit `5b5b8835`, but they drift).

### 4.2 Classification rubric (per section, one of three lanes)

- **(a) Shared key** — allowed **only when both the widget contract and its resolved rendering are shared and theme-neutral**: the type exists in the `builder-ast` catalog, resolves through the unified editor tray/schema, AND the inventory shows a non-owner theme resolves that key to neutral markup (not the Songoskriti pack) **in every resolution graph (keyed storefront and unkeyed editor/studio)**. If Songoskriti-specific markup or styling is needed for the key, classify it as lane (b) even when the key is shared. Any Songoskriti presentation leaking into other themes is a recorded gap: fix it with a theme presentation claim plus a neutral shared fallback where theme-owned files suffice; if neutralizing resolution requires core-side changes, escalate. Action for a clean (a) row: record evidence; change nothing; no duplicate definitions.
- **(b) Presentation** — same catalog key, but Songoskriti needs its own markup/styling. Action: claim via `registerThemePresentation`; ensure foreign themes keep the fallback. Versioned dressings (`registerVersionedPresentation`, e.g. `dressed-hero`) are presentation-lane variants. Every presentation claim (core or versioned) must be **live in the target graph(s) and tested**. `Dormant` is a safe exception, not a shortcut: it requires inventory evidence that the surface is unused by any current template/storefront path, or superseded by a named live path, plus a recorded rationale; deferring a surface that a current path uses requires **explicit user approval**. Visual-parity requirements cannot be satisfied by labeling a claim dormant.
- **(c) Theme-owned widget** — genuinely unique component with no shared capability. Action: `theme:songoskriti/<widget>` definition (see 4.4); `ornament` is the reference implementation and is not a reason to duplicate generic widgets. Theme-owned widgets are **insertable under every active theme** (dress/body model — see the §4.4 addendum); instances saved before a theme switch keep rendering (themed dress under the owner, universal generic body otherwise), and return to the dressed render when the owning theme is active again.

The completed map is a deliverable; it publishes as the Songoskriti port-map section of `docs/themes/creation.md` (Phase 2), with a working copy maintained in the plan/evidence during Phase 1.

### 4.3 Reference freeze (before any renderer change)

- Serialized template fixtures: hand-written fixed literals (never derived from builders), builder↔fixture equality + static-markup pins — the `songoskriti-snapshots.test.tsx` pattern, in NEW test files only.
- Reference stills: desktop 1440 / tablet 768 / mobile 375 widths (aligned with the existing `t6-*` stills) for each template + representative sections, captured via Playwright following the `t6-*` evidence pattern. Capture recipe is fixed: locales `en` + `bn`; wait for `document.fonts.ready`; capture in reduced-motion state for deterministic frames (normal-motion behavior reviewed separately where it matters); animations frozen/seeded; catalogue + fixture data pinned to the same fixtures the parity tests use; every capture records its parameters.
- Visual-parity decision: baseline pixel-diff with per-surface thresholds calibrated once in the plan against the frozen reference, **or** a documented manual review for differences that cannot be measured reliably (motion, canvas, font rasterization). Every approved difference links its before/after stills under `docs/superpowers/songoskriti-evidence/port/` with a rationale; unreviewed differences never pass silently.
- Purpose: the port is proven against a frozen reference; captured before any theme renderer edit.

### 4.4 Gap closure

- (a) rows: prove tray + schema + save round-trip and neutrality with existing coverage; add coverage only where evidence is missing.
- (b) rows: complete the presentation claim list (inventory output); each claim must run through a module reachable in the target graph(s); tests must assert **actual registration** through the productive import path — not a direct module import — and the foreign-theme fallback; dormant claims carry the §4.2 proof or an explicit user approval.
- (c) rows: per widget, following the ornament split:
  - `*-def.ts`: stable id `theme:songoskriti/<slug>` (lowercase), namespace `theme`, `themes: ["songoskriti"]`, `version` (start 1.0.0), closed `propsSchema` (`{ fields: PropField[] }`, kinds from `src/lib/widget-props.ts`), `defaults`, `slots` where applicable, renderer reference; **no components exported from the def file** (react-refresh lint contract).
  - `*-presentation.tsx`: the native component (single concern per file).
  - Activation: ride a module reachable in **each target graph**. Verified candidates: storefront — the `preview.ts` pattern (live precedent) or other productive theme modules; editor — `songoskriti.tsx`, already imported by `unified-widget-registry.ts:127` on the editor client path (pre-authorized as an activation carrier under §7). `index.ts` re-exports are NOT activation. Registration guards can silently no-op and module-evaluation/cycle order around the registry is a real hazard — tests must assert actual registration and resolution, not merely import. Ornament's own reachability is fixed in the same pass (currently test-only).
  - Registered def must appear in `/dashboard/content/editor` in the real graph: tray → schema-generated inspector → property edit → save (canonicalization re-validation) → reload → approved-component render.
  - Tray availability + recovery: a theme-owned widget is insertable under **every** active theme; the owning theme renders its themed dress, and other (foreign) themes render the widget's **universal generic presentation** (registered via `registerGenericPresentation` in `src/lib/theme-presentations.ts`); only a widget with **no registered generic** falls back to the recoverable placeholder — "Widget preview unavailable" is retired for registered components; a previously saved instance keeps rendering across theme switches (themed dress under the owner, generic body otherwise) and returns to the dressed render when the owning theme is active again. All asserted through the real graph.
  - Tests: schema validity, registration, native resolution for the owner, universal tray availability, generic presentation for foreign themes (recoverable placeholder only without a registered generic), save-time canonicalization path, saved-instance render across theme switches, plus a **graph-reachability test** that fails when registration does not run through the productive import path (storefront + editor surfaces). If a surface cannot be reached from theme-owned files, escalate — never edit core.
- **Universal addendum (user ruling after the Task 9 fix).** The four core-required keys (`finder_row`, `craft_story`, `testimonials`, `trust_footer`) and `product_grid` remain **global/native** — no ownership move, no catalog-key deletion; their branded look is a dress, not a body. Added per the user ruling after the Task 9 fix; see the ledger `.superpowers/sdd/2026-10-18-songoskriti-unified-port/progress.md` (BINDING DIRECTION + Task 9-FIX sections).

### 4.5 Parity proof (before any legacy removal)

Matrix: template × {insert/edit, save/reload, preview, publication, storefront render, mobile/tablet, theme switch}. Representative sections = every (c) widget + at least one per lane (a)/(b). Component-level suites carry the matrix; one additive `.e2e/` browser journey covers the end-to-end editor path (mode-B stack). The journey installs/activates Songoskriti for the test tenant itself — `supabase/migrations/20260924_songoskriti_demo.sql` seeds catalogue data only and writes no theme/widget rows. Versioned-dressing surfaces join the matrix only once wired. **Acceptance bar for this cycle: a passing local run of the journey, with the exact command, required services/environment (per `docs/15-e2e/loopback-auth-setup.md`), expected assertions, and evidence path recorded in the implementation plan. CI lane wiring is separate and requires explicit approval (escalation).** Legacy paths are preserved this cycle; removal requires parity evidence **and** explicit user approval.

## 5. Phase 2 — Docs canonicalization

### 5.1 Canonical set (authority map)

| Contract | Authority |
| --- | --- |
| Editor architecture (`/dashboard/content/editor`) | `docs/04-builder/README.md` |
| Widget contract (identity, schemas, defaults, slots, rendering modes, taxonomy) | `docs/04-builder/app-blocks.md` |
| Official-theme authoring + Songoskriti port map | `docs/themes/creation.md` |
| Package distribution lanes (official source / declarative ZIP / Level B) | `docs/packages/contract.md`, `docs/themes/packages.md`, `docs/themes/level-b.md` |
| Third-party widget authoring | `docs/developers/plugins.md` |
| Third-party theme entry point | `docs/developers/themes.md` |
| Editor journey for extension developers | `docs/developers/editor.md` (new) |

### 5.2 Per-document work

- **A. `docs/04-builder/README.md`** — rewrite as the editor source of truth: real route, `EditorShell`, `StudioBuilder`, authorized registry build, widget tray, schema inspector, canvas renderer, persisted node model, preview, publishing, recovery, test commands. Remove the "no Playwright/.e2e" claim outright (check 8 has no banner escape); the `/admin/builder` description may be removed or bannered with check 3's token; keep the honesty disclaimer but reword it so it does not read as a dead path (or suppress with the §6 marker). Sibling `docs/04-builder/*` pages: minimal linking fixes only where they contradict; no mass rewrite.
- **B. `docs/04-builder/app-blocks.md`** — canonical widget contract: identity, schemas, defaults, instance properties, slots, responsive controls, rendering modes, validation, compatibility, fallback. Taxonomy: native, source-backed official, isolated plugin, themeable plugin, theme-owned. Other guides link here instead of restating divergent contracts.
- **C. `docs/themes/creation.md`** — keep isolation rules; rewrite migration/authoring around the unified registry; add the Songoskriti port map (from Phase 1: reuse / presentation / theme-owned, with the evidence-backed homepage counts and neutrality verdicts); document source registration, props schemas, asset ownership, bilingual content, visual-parity tests; state explicitly that official themes are not ordinary exported packages.
- **D. `docs/packages/contract.md` + `docs/themes/packages.md` + `docs/themes/level-b.md`** — one canonical lifecycle, three distinct cases: official source themes, declarative merchant/community ZIP themes, reviewed executable Level B themes. Manifests, validators, install/activation paths, security limits, review requirements, lane chooser. Preserve "official themes are not ZIP packages".
- **E. `docs/developers/plugins.md`** — current widget-authoring guide: `propsSchema` + `defaultProps` contract, sample definitions, every supported field type, schema validation, per-instance vs global settings, Class A/Class B behavior, theme compatibility, local test fixtures, the actual editor workflow. First audit the shipped contract against `examples/starter-plugin/` (it currently uses `settings`, not `propsSchema`/`defaultProps`/`themeable`): document the shipped contract and additively refresh the example to it (§7 authorizes this); if the refresh proves out of docs scope, inline the samples and record why.
- **F. `docs/developers/themes.md`** — current entry point: decision table (data-only ZIP vs Level B executable), SDK/build links, compatibility requirements, review/install/activation path, editor-visible theme widgets, security links. Explicitly: Songoskriti is source-owned official, not a downloadable template to upload as a package.
- **G. `docs/developers/editor.md` (new)** — the real developer journey: install/activate an extension, find its widgets, insert, edit schema-generated settings, responsive views, preview, save, publish; troubleshooting: missing schemas, incompatible theme presentations, disabled packages, safe fallbacks. Linked from `docs/developers/README.md`.

### 5.3 Conventions

- **Verification status lines (no false labels).** Each required in-scope doc carries exactly one recognized status line in its first lines:
  - `Last verified: YYYY-MM-DD @ <sha>` — only after the document has actually been checked against source; `<sha>` is the **source revision verified** (never the commit that adds the header).
  - `Needs verification` — maintained docs not yet checked against current source.
  - `Historical — <reason>` — unmaintained, kept for reference.
  A–G (rewritten) get fresh verified headers after their rewrite is checked against the tree at completion. The 12 non-conformant developer guides (`themes.md`, `plugins.md`, `widget-development.md`, `versioning-publishing.md`, `getting-started.md`, `community-plugins.md`, `global-chrome.md`, `menu-extensions.md`, `security-sandbox.md`, `examples.md`, `concepts.md`, `themeable-widgets.md`) get `Needs verification` unless their content is genuinely reviewed in this cycle — **never a mechanical "verified" stamp**. Five files already conform (`guidelines.md`, `review-policy.md`, `sdk.md`, `theme-updates.md`, `docs/packages/contract.md`). Status-line placement and the exact required-doc list live in the gate config (single source); status lines are scanned in the document's leading block only, and pattern-matching occurrences inside fenced code blocks are excluded (self-test fixture mirrors the `docs/developers/guidelines.md` format example); `docs/developers/README.md` is an index and is exempt from status lines while still covered by the other checks; `docs/04-builder/README.md` is an authority and requires one.
- Quickstarts: widget (from the refreshed `examples/starter-plugin/`; two independent instances + themeable presentation test), theme (from `examples/starter-theme/`; data-only vs Level B choice; presentation for an existing plugin widget; fallback on theme switch; Level B = actual bundle build + sandboxed browser test), verification (exact commands for schema validation, plugin/theme tests, editor/browser journeys, typecheck, lint, security gates). If the §5.2E inline-samples fallback triggers, the plan records the exception and this sourcing line is adjusted to match.
- Test claims labeled passed / skipped / not-run; never imply a documented test runs green automatically.

## 6. Phase 3 — Documentation gate (harness)

New `scripts/doc-gate.mjs`, styled after the existing gates (exit 0 clean / 1 findings / 2 harness failure; `--json`; human report on stdout; no thresholds hidden in docs). **No `--allow` flag: findings are never suppressible from the CLI, and CI never passes suppressions.** The only suppression is an inline `<!-- doc-gate-ok: <reason> -->` on a specific line for a deliberate negative reference (reason required; every suppression instance is listed in the gate report). Wired as an npm/bun script (`doc:gate`) into the static gate chain, plus a CI step in the lane that runs contract gates.

Checks (scoped to `docs/developers/**`, `docs/04-builder/README.md`, `docs/04-builder/app-blocks.md`, `docs/themes/creation.md`, `docs/themes/packages.md`, `docs/themes/level-b.md`, `docs/packages/contract.md`):

1. **Source refs** — backticked repo paths (`docs/…`, `src/…`, `scripts/…`, `.e2e/…`, `public/…`, `supabase/…`, `examples/…`) exist on disk; tolerate `:line`/`:range` suffixes and globs (≥1 match). Deliberate negative references use the inline suppression above.
2. **Commands** — `bun run <name>` / `npm run <name>` resolve to `package.json` scripts; `bun scripts/<file>` exists; known binaries (`vitest`, `playwright`, `tsc`) allowed.
3. **Routes** — `/dashboard/…` references resolve to `src/routes` files; `/admin/builder` fails unless the line carries an explicit legacy banner token.
4. **Manifest/code examples** — labeled JSON blocks parse; required top-level keys checked against a small per-label allowlist.
5. **Field kinds** — `kind: "…"` tokens in widget-authoring docs must be a subset of the exported kinds in `src/lib/widget-props.ts` (best-effort extraction, pinned by the self-test).
6. **Authority links (deterministic)** — each authority document exists, and an in-scope doc that mentions a contract keyword from the curated keyword→authority map must link that authority document. This is a link-presence rule only; semantic divergence is left to check 8.
7. **Verification status** — every required doc (enumerated in the gate config, single source) carries exactly one recognized status line per §5.3; a `Last verified` line must parse and its sha must resolve in git (`git rev-parse --verify --quiet <sha>^{commit}`).
8. **Contradiction lint (finite, fixture-tested)** — the curated list: official themes as downloadable/uploadable ZIPs; Songoskriti as a package; unbannered `/admin/builder`; "no Playwright" / "no `.e2e`"; unsupported field kinds; Level B described as available to official themes. Every pattern has both `pass/` and `fail/` fixtures.

Honesty: the gate auto-runs a self-test against a seeded fixture corpus (`scripts/fixtures/doc-gate/`) as preflight — covering authority links, all three status forms, each contradiction pattern, inline suppression, route banners, and field kinds, not just the easy cases; mismatches are harness failure (exit 2). Findings include `file:line`, matched token, and why it matters. No silent skips. Heuristic limits documented in the script header.

## 7. Boundary — "no core files"

**Editable:** `src/lib/themes/songoskriti/**`; `src/components/builder/songoskriti.tsx` + `songoskriti-motion.ts` (theme-owned renderers — editable only if the port requires it, including as an activation carrier for (b)/(c) registrations); NEW test/fixture files; NEW `.e2e/` spec/helper files; `docs/**`; `scripts/**`; `examples/starter-plugin/**` + `examples/starter-theme/**` (guide-alignment only — explicitly exempt from the test freeze; never `examples/demo-theme/**`); and minimal wiring-only edits to `package.json` (`doc:gate` script + gate-chain entry) and `.circleci/config.yml` (the CI step for `doc:gate`). These two wiring files are the minimum needed to satisfy §6's mandate and are flagged here for your review.

**Prohibited:** engine/plumbing — `src/lib/unified-widget-registry.ts`, `src/lib/editor/**`, `src/lib/theme-presentations.ts`, `src/lib/builder-ast.ts`, `src/components/builder/widgets.tsx`, `heritage.tsx`, `theme-widgets.ts`, all `src/routes/**`, `EditorShell`/`StudioBuilder`, existing test files and their snapshots (`.snap`) under `src/`, existing `.e2e/**` files (specs and `playwright.config.ts`; new `.e2e` specs/helpers are additive-only, config edits escalate), and everything else under `src/`.

**Escalation:** any required capability missing in core → stop, report, wait for a decision. Never edit silently.

## 8. Invariants

- Never weaken assertions, remove tests, or skip tests to force green; skips are always reported as skipped, never as passes.
- Never commit the churn files (`.artifacts/e2e/playwright-report/index.html`, `ops/routing/canary-weights.conf`, `ops/routing/upstream.conf`); stash untouched.
- No official ZIP is manufactured; no Level B packaging of Songoskriti.
- Official identity resolves only through `builtin-themes.ts`.
- Legacy paths preserved until parity evidence + user approval.

## 9. Testing & evidence

- New component suites per (c) widget and per completed (b) claim, including universal tray availability + saved-instance render across theme switches and renderer-neutrality evidence for (a) rows.
- Parity fixtures/stills per 4.3 / 4.5 in NEW files; capture recipe parameters and comparison decisions recorded per still. Existing suites and snapshots stay frozen: a change that alters existing pinned output is a parity finding first; if genuinely required, escalate with the exact diff and rationale before any update (named and called out, never blind `-u`).
- Additive `.e2e/` journey for the editor path with a passing local run as this cycle's bar; exact command, services, assertions, and evidence path recorded in the plan; CI lane wiring escalates separately.
- Doc-gate self-test (seeded violations incl. edge cases) + clean run.
- Existing suites: targeted vitest, typecheck, lint at each checkpoint. Evidence archived under `docs/superpowers/songoskriti-evidence/port/`.

## 10. Acceptance criteria

- [ ] Port map published in `docs/themes/creation.md`; every section classified with evidence (emitted ∪ intended homepage types included; evidence-backed counts; neutrality verdicts per shared key).
- [ ] Every (a) row proven shared **and** theme-neutral; every (c) widget has a working editor contract (tray → inspector → save → reload → render) in the real graph (graph-reachability test); tray insertion available under every active theme (universal body — see the §4.4 addendum); saved instances keep rendering across theme switches.
- [ ] Every presentation claim (core + versioned, dressed-hero included) is either live in the target graph(s) and tested, or dormant with §4.2 proof or explicit user approval — parity items are never waived by dormancy.
- [ ] Parity matrix green (templates × journeys; mobile/tablet; theme switch) via a passing local e2e run with recorded command/services/assertions/evidence path.
- [ ] Docs A–G rewritten; no contradictory legacy claims remain (checked by the gate); status lines conformant per §5.3 with no false "verified" labels.
- [ ] `doc:gate` green on the repo and red on seeded fixtures (including edge cases); wired into the gate chain + CI; no `--allow` path exists.
- [ ] Zero core edits; any escalation recorded; no test weakening; skips reported as skips.

## 11. Open points (ruled)

- `src/components/builder/songoskriti.tsx` + `songoskriti-motion.ts` are treated as theme-owned (editable only if the port requires it, including as an activation carrier); a correction before the plan executes is welcome.
- Activation roots: (b)/(c) registrations ride a module reachable in each target graph — verified candidates are the storefront `preview.ts` pattern and the editor-graph `songoskriti.tsx` (via `unified-widget-registry.ts:127`); `index.ts` is not an activation root. Graph tests assert actual registration; if a target graph is unreachable from theme-owned files, that is an escalation (core wiring is prohibited).
- Dormancy: proof of non-use/supersession or explicit user approval only; parity requirements cannot be waived by dormancy.
- Header retrofit: no mechanical "verified" stamps; `Needs verification` / `Historical` markers for unchecked docs; verified headers only post-check (sha = verified source revision).
- E2E acceptance: a passing local run is this cycle's bar; CI lane wiring requires separate approval.
- Gate suppressions: none via CLI (`--allow` does not exist); inline `<!-- doc-gate-ok: reason -->` only, listed in reports.
- Port-map size: if it grows beyond one screen in `creation.md`, detail splits to a linked `docs/themes/songoskriti-port-map.md`.
- No legacy removal this cycle.

## 12. Sequencing

Phase 1 → Phase 2 (A, B, C first; then D, E, F, G) → Phase 3, each with a review checkpoint. The implementation plan (`writing-plans`) breaks this into ordered tasks with per-task verification.
