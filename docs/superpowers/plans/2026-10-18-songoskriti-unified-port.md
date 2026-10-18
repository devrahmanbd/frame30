# Songoskriti Unified Port + Docs Canonicalization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port Songoskriti into the unified widget/editor architecture as a source-owned official theme (shared keys / presentations / theme-owned widgets per the approved design), canonicalize internal + third-party docs, and add a documentation verification gate — with zero core-file edits.

**Architecture:** Three phases. Phase 1 produces an evidence-backed classification map (inventory → classification), freezes the current rendering (fixtures + stills + parity baselines), closes per-lane gaps (a: prove shared+neutral; b: complete presentation claims through productive import paths; c: theme-owned `theme:songoskriti/<slug>` defs following the ornament split), then proves parity before any docs work. Phase 2 rewrites docs A–G with honest verification status lines. Phase 3 builds `scripts/doc-gate.mjs` (8 checks + seeded self-test, no `--allow`) and wires it into `package.json` + the `unit-contract` CircleCI job.

**Tech Stack:** TypeScript/Vite app; Vitest component suites; Playwright E2E (`.e2e/playwright.config.ts`, mode-B loopback stack per `docs/15-e2e/loopback-auth-setup.md`); Node `.mjs` repo gates; CircleCI.

**Authority:** `docs/superpowers/specs/2026-10-18-songoskriti-unified-port-design.md` (revision 2, commit `4cf31ab9`) is the binding spec. This plan is its argument.

## Global Constraints

Every task's requirements implicitly include this section. Copy the exact values; do not paraphrase.

1. **Boundary (§7).** Editable: `src/lib/themes/songoskriti/**`; `src/components/builder/songoskriti.tsx` + `songoskriti-motion.ts` (only if the port requires it, incl. as an activation carrier); NEW test/fixture files; NEW `.e2e/` spec/helper files; `docs/**`; `scripts/**`; `examples/starter-plugin/**` + `examples/starter-theme/**` (guide alignment only; never `examples/demo-theme/**`); minimal wiring-only edits to `package.json` and `.circleci/config.yml`. **Prohibited:** `src/lib/unified-widget-registry.ts`, `src/lib/editor/**`, `src/lib/theme-presentations.ts`, `src/lib/builder-ast.ts`, `src/components/builder/widgets.tsx`, `heritage.tsx`, `theme-widgets.ts`, all `src/routes/**`, `EditorShell`/`StudioBuilder`, existing tests/snapshots (`.snap`) under `src/`, existing `.e2e/**` files (config edits escalate), everything else under `src/`.
2. **Escalation (§7).** Any required capability missing in core → stop, report in the ledger, wait for a decision. Never edit core silently.
3. **Never weaken assertions, remove tests, or skip tests to force green.** Skips are reported as skipped, never as passes.
4. **Never commit the churn files:** `.artifacts/e2e/playwright-report/index.html`, `ops/routing/canary-weights.conf`, `ops/routing/upstream.conf`. They stay modified/stashed, untouched.
5. **No pushes.** Branch `frame30` stays local. Merging/pushing is the user's decision, never a task step.
6. **No official ZIP is manufactured; no Level B packaging of Songoskriti.** Official identity resolves only through `src/lib/themes/builtin-themes.ts`.
7. **Status-line forms (§5.3), exactly:** `Last verified: YYYY-MM-DD @ <sha>` (only after an actual content check; `<sha>` is the source revision verified — `git rev-parse --short=12 HEAD` taken **before** the commit that adds/updates the status line, never the header's own commit) | `Needs verification` | `Historical — <reason>`. Never a mechanical "verified" stamp. Scanned in the document's leading block (before the first `## ` heading), fenced code excluded.
8. **No `--allow` in the doc gate.** The only suppression is an inline `<!-- doc-gate-ok: <reason> -->` on the specific offending line, reason required, every instance listed in the gate report.
9. **E2E acceptance:** a passing **local** run of the new journey is this cycle's bar. E2E CI-lane wiring requires separate approval (stop and ask). The doc-gate CI wiring **is** in scope (§6).
10. **Commits:** conventional prefixes (`feat(theme):`, `test:`, `docs:`, `chore(gate):`), one concern per commit, referencing the task. Stage explicit paths — never `git add -A`.
11. **Existing suites/snapshots frozen.** A change that alters existing pinned output is a parity finding first: stop, record, escalate with the exact diff and rationale. Never blind `-u`.
12. **Evidence home:** `docs/superpowers/songoskriti-evidence/port/` (subdirs `reference/`, `after/`, `e2e/`, `doc-gate/`).

## File Structure

**Phase 1 — created:**
- `docs/superpowers/songoskriti-evidence/port/inventory.md` — raw evidence tables (Task 1).
- `docs/superpowers/songoskriti-evidence/port/classification.md` — lane map, leak list, parity target list (Task 2).
- `src/components/builder/songoskriti-port-freeze.test.tsx` — serialized template/homepage fixtures + static-markup pins (Task 3).
- `.e2e/helpers-songoskriti.ts` — `ensureSongoskritiActive`, `setActiveTheme` (Task 4).
- `.e2e/songoskriti-port-parity.spec.ts` + its `-snapshots/` baselines — stills + machine comparison (Tasks 4, 8).
- `docs/superpowers/songoskriti-evidence/port/reference/` + `reference-manifest.json` — frozen stills + parameters (Task 4).
- `docs/superpowers/songoskriti-evidence/port/after/` — post-port stills (Task 8).
- `docs/superpowers/songoskriti-evidence/port/parity-report.md` — per-surface verdicts (Task 8).
- `.e2e/songoskriti-editor-journey.spec.ts` — the acceptance-bar browser journey (Task 9).
- Per-lane expansion files (Tasks 5–7): `src/lib/themes/songoskriti/<slug>-def.ts`, `<slug>-presentation.tsx`, `<slug>-def.test.ts`, `<slug>-reachability.test.ts`, `<slug>-presentation.test.tsx`, `<slug>-activation.test.ts` — exact set per classification row.

**Phase 1 — modified (only as map/rows require):** `src/lib/themes/songoskriti/preview.ts` (storefront activation carrier), `src/components/builder/songoskriti.tsx` (editor activation carrier), `src/lib/themes/songoskriti/ornament-def.ts` (reachability fix), `src/lib/themes/songoskriti/homepage.ts` (stale "30+ sections" comment only).

**Phase 2 — modified:** `docs/04-builder/README.md`, `docs/04-builder/app-blocks.md`, `docs/themes/creation.md`, `docs/packages/contract.md`, `docs/themes/packages.md`, `docs/themes/level-b.md`, `docs/developers/plugins.md`, `docs/developers/themes.md`, `examples/starter-plugin/**`; status retrofit in 10 further `docs/developers/*.md`; **created:** `docs/developers/editor.md`, possibly `docs/themes/songoskriti-port-map.md` (only if the map exceeds one screen in `creation.md`).

**Phase 3 — created:** `scripts/doc-gate.mjs`, `scripts/fixtures/doc-gate/**`; **modified:** `package.json` (`doc:gate` script + `gates:release` chain entry), `.circleci/config.yml` (one step in the `unit-contract` job).

## Execution notes (controller, SDD)

- **Expansion protocol.** Tasks 5–7 are templates. After Task 2, the controller renders one full brief per classification row (substituting row values: slug, key/type, one-line purpose, prop list, target graphs, carrier files, surfaces, evidence refs) **verbatim into the template**, and runs each expansion as its own SDD cycle (fresh implementer + task reviewer). Templates are copied complete — never "similar to Task N".
- **Escalations** (core-edit-needed leaks, unreachable target graphs, dormant surfaces without proof, existing-pinned-output changes) are collected in the ledger and batched to the user at checkpoint P1, except when they block their own lane task — then stop that task and report.
- **Checkpoints.** P1 (after Task 9), P2 (after Task 17), P3 (after Task 19): one broader review dispatch over the phase's range (`review-package PLAN MERGE_BASE HEAD`) before proceeding; P1 also carries the batched escalation list.

---

## Phase 1 — Port map + parity freeze

### Task 1: Inventory recon (read-only)

**Files:**
- Create: `docs/superpowers/songoskriti-evidence/port/inventory.md`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `inventory.md` tables consumed by Task 2. Row format (markdown table per axis): `surface | definition site (file:line, symbol) | editor visibility evidence (authorized-registry resolve / tray / schema; file:line) | renderer + winning source map for a non-songoskriti theme, per graph (keyed storefront; unkeyed editor/studio) | neutrality verdict per graph | parity coverage (existing test/snapshot; file:line)`.

- [ ] **Step 1: Build the eight evidence sections.** In `inventory.md`, one `##` section per axis:
  1. **Templates** — every `TEMPLATE_KEYS` the theme dresses (`TEMPLATE_ZONES` coverage), plus `SONGOSKRITI_VARIATIONS` (`minimal`, `festive`).
  2. **Homepage** — emitted ∪ intended: `buildHomepageMain(s)` in `homepage.ts` emits 21 sections across 12 distinct types (`product_rail` ×6, `split_feature` ×4, `craft_story` ×2, plus `ugc_gallery`, `trust_footer`, `testimonials`, `store_locator`, `recently_viewed`, `hero_carousel`, `finder_row`, `department_grid`, `collection_story`); `HOMEPAGE_SECTION_TYPES` (`types.ts`) lists 9 intended, `announcement_bar` and `circle_categories` never emitted **by the homepage builder** (`circle_categories` does appear in `archetypes.ts` collection builders — record both facts). Union = 14 types. Verify each count against the tree and record the evidence.
  3. **Renderer neutrality** — the `SONGOSKRITI_WIDGETS` key set from `src/components/builder/songoskriti.tsx` and the registry import at `src/lib/unified-widget-registry.ts:127`; for **each key**: which map provides the winning renderer for a non-songoskriti theme in (i) keyed storefront resolution (`src/components/builder/theme-widgets.ts:73-78`) and (ii) unkeyed editor/studio resolution (`resolveWidgetComponent(null, …)` → `WIDGET_COMPONENTS` in `src/components/builder/widgets.tsx`, including studio delegations such as `product_grid` in `src/components/builder/studio/renderers.tsx`). Verdict vocabulary: `neutral | songoskriti-leak | unreachable`.
  4. **Global chrome** — `header.ts`, `header-presentation.tsx`, `header-fallback.ts`, `footer.ts`, `footer-proof-presentation.tsx`, `footer-copy.ts`, menu behavior; per-graph liveness of each registration.
  5. **Tokens/skins** — `tokens.ts`, `skins.ts`, `skins.css`, variation overrides.
  6. **Bilingual copy** — bitext pairs across sections and chrome (en/bn locations).
  7. **Media/assets** — `public/ph/songoskriti/`, `scripts/gen-songoskriti-assets.mjs`.
  8. **Motion + product-data deps** — `songoskriti-motion.ts`, shared motion hooks; `SONGOSKRITI_COLLECTIONS` archetypes, `/c/` hrefs, `/ph/songoskriti/` asset paths, demo-data assumptions.
- [ ] **Step 2: Cite by content.** Every reference is `path` + symbol name; line numbers are recorded as found now but must be re-located at use time (they drift). No claim without a `file:line`.
- [ ] **Step 3: Verify counts mechanically.** Run, and paste the raw output into the file as appendix: `grep -c` / small `node -e` lines that count sections and distinct types from `homepage.ts`, and the `SONGOSKRITI_WIDGETS` key count from `songoskriti.tsx`. Reconcile with Step 1's prose; numbers in prose must equal the appendix.
- [ ] **Step 4: Self-check** — every row has all six columns populated; no row says "see above" without its own evidence.
- [ ] **Step 5: Commit**
  ```bash
  git add docs/superpowers/songoskriti-evidence/port/inventory.md
  git commit -m "docs(port): inventory recon for songoskriti unified port"
  ```

### Task 2: Classification map (lanes + leaks + parity targets)

**Files:**
- Create: `docs/superpowers/songoskriti-evidence/port/classification.md`

**Interfaces:**
- Consumes: `inventory.md` (Task 1); spec §4.2/§4.3/§4.4.
- Produces: the row list Task 5–7 briefs are rendered from. Each row: `row-id | surface | lane (a|b|c) | dormant?(yes/no + proof or "user-approval-required") | slug/key | purpose (one line) | props (from inventory; for (c)) | target graphs (storefront/editor) | carrier files (verified reachable) | existing renderer file to follow | evidence (inventory anchors)`. Plus sections: `## Leaks`, `## Escalations`, `## Parity targets` (surfaces for Task 4).

- [ ] **Step 1: Apply the rubric verbatim** (spec §4.2):
  - **(a)** only when the widget contract **and** its resolved rendering are shared and theme-neutral in **every** resolution graph (keyed storefront and unkeyed editor/studio). Any Songoskriti markup/styling needed → (b). Clean (a) action: record evidence; change nothing.
  - **(b)** same key, theme-owned markup/styling → `registerThemePresentation`; foreign themes keep the fallback; versioned dressings (`registerVersionedPresentation`, `dressed-hero`) are variants. Claims must be live in target graph(s) and tested; `dormant` only with inventory proof of non-use/supersession, or explicit user approval.
  - **(c)** genuinely unique, no shared capability → `theme:songoskriti/<slug>`; `ornament` is the template; insertable only while the owning theme is active; saved instances preserved/recoverable. *(Superseded: universal dress/body ruling — design spec §4.4 addendum; Task 9-FIX ledger.)*
- [ ] **Step 2: Classify every row.** Every inventory row gets exactly one lane. For (c) rows run the duplication check against the shared catalog first — "no shared capability" is the bar, not "Songoskriti renders one".
- [ ] **Step 3: Write `## Leaks`.** Every `songoskriti-leak` verdict with its graph. Owner verdict per leak: `theme-fixable` (fixable via presentation claim + neutral fallback in theme-owned files) or `core-required` (would need prohibited files) → the latter is an escalation entry, not a task.
- [ ] **Step 4: Write `## Escalations`** — every core-required leak, unreachable target graph, and dormancy lacking proof; one line each with the inventory evidence and the spec clause.
- [ ] **Step 5: Write `## Parity targets`** — the frozen-surface list for Task 4: homepage; every `TEMPLATE_KEYS` route; chrome states; each (b) live surface. Representative sections = every (c) widget + at least one per lane.
- [ ] **Step 6: Self-check against spec §4.2** — no (a) row without a per-graph neutral verdict; no (b) row without a named target graph; no dormant without proof/approval flag.
- [ ] **Step 7: Commit**
  ```bash
  git add docs/superpowers/songoskriti-evidence/port/classification.md
  git commit -m "docs(port): lane classification map from inventory evidence"
  ```

### Task 3: Freeze fixtures (serialized literals + static pins)

**Files:**
- Create: `src/components/builder/songoskriti-port-freeze.test.tsx`
- Read (do not modify): `src/components/builder/songoskriti-snapshots.test.tsx` (pattern source), `src/lib/themes/songoskriti/homepage.ts`, `src/lib/themes/songoskriti/archetypes.ts`, `src/lib/builder-ast.ts`

**Interfaces:**
- Consumes: Task 1 counts (for wording), the existing snapshots test's harness.
- Produces: literal pins later tasks must not change: homepage composition literal; per-`TEMPLATE_KEYS` zone literals; static-markup pins. Later tasks read this file's failures as parity findings.

- [ ] **Step 1: Copy the harness, not the data.** Open `songoskriti-snapshots.test.tsx`; reuse its imports, fixture builders, render helper, and assertion style **in the new file** with new test names. Do not import fixtures from it and do not edit it.
- [ ] **Step 2: Write the homepage composition test.** Use `buildSongoskritiHomepage(stubBuilder<never>())` exactly as `songoskriti-snapshots.test.tsx:228` calls it (copy its `stubBuilder` helper into the new file; never import from the existing test). The literal below was transcribed from the tree on 2026-10-18 — re-verify it against `homepage.ts` before committing; if the tree disagrees, the tree wins and you record the drift in the report.
  ```ts
  it("homepage composition is frozen: 21 sections / 12 distinct types", () => {
    const sections = buildSongoskritiHomepage(stubBuilder<never>());
    expect(sections.map((x) => x.type)).toEqual([
      "hero_carousel", "department_grid", "product_rail", "craft_story",
      "product_rail", "split_feature", "product_rail", "recently_viewed",
      "finder_row", "split_feature", "product_rail", "product_rail",
      "split_feature", "collection_story", "product_rail", "craft_story",
      "ugc_gallery", "testimonials", "split_feature", "trust_footer",
      "store_locator",
    ]);
    expect(new Set(sections.map((x) => x.type)).size).toBe(12);
  });
  ```
  Run it green. Then **prove it bites**: temporarily reorder one literal entry, run → FAIL, revert → green. A freeze test with nothing to fail-first against demonstrates its teeth this way, never by leaving it un-driven.
- [ ] **Step 3: Per-template zone literals.** For each `TEMPLATE_KEY` in scope (list from `inventory.md` §Templates), one test asserting the zone/type composition against a transcribed literal, and one static-markup pin in the snapshots test's style (fixed markup string or fixed serialization — whatever that file pins; mirror it).
- [ ] **Step 4: Chrome + representative section pins.** One static pin each for header and footer chrome; one per homepage singleton type (the nine non-repeated types), fixed so the port can prove nothing shifted.
- [ ] **Step 5: Prove determinism.** Run the file twice; identical results. Then run the neighborhood: `npx vitest run src/components/builder/songoskriti-port-freeze.test.tsx src/components/builder/songoskriti-snapshots.test.tsx` — both green; the existing file untouched (`git status` shows only the new file).
- [ ] **Step 6: Commit**
  ```bash
  git add src/components/builder/songoskriti-port-freeze.test.tsx
  git commit -m "test(port): freeze songoskriti template + homepage fixtures"
  ```

### Task 4: Reference stills + parity baselines + activation helper

**Files:**
- Create: `.e2e/helpers-songoskriti.ts`, `.e2e/songoskriti-port-parity.spec.ts`, `.e2e/songoskriti-port-parity.spec.ts-snapshots/**` (or the config's `snapshotPathTemplate` equivalent), `docs/superpowers/songoskriti-evidence/port/reference/**`, `docs/superpowers/songoskriti-evidence/port/reference-manifest.json`
- Read: `docs/15-e2e/loopback-auth-setup.md`, `.e2e/plugin-authenticated-journey.spec.ts`, `.e2e/theme-preview-isolation.spec.ts`, `.e2e/playwright.config.ts` (read-only), `docs/superpowers/songoskriti-evidence/t6-*.png`

**Interfaces:**
- Consumes: `inventory.md` §Templates/§Homepage (surface list), Task 2 `## Parity targets`.
- Produces: `export async function ensureSongoskritiActive(page: Page): Promise<void>` (idempotent: real UI activation flow; no auth stubbing — follow `plugin-authenticated-journey.spec.ts`), `export async function setActiveTheme(page: Page, themeKey: string): Promise<void>`. Consumed by Task 9. Baselines consumed by Task 8.

- [ ] **Step 1: Boot the mode-B stack** per `docs/15-e2e/loopback-auth-setup.md` §§1–3 (compose `docker-compose.e2e.yml`, relay, migrations + seed, real GoTrue merchant, Vite `--port 3020 --strictPort` with `DISABLE_HMR=true`). Creds/env live in the unsaved `/tmp/opencode/e2e-auth/.e2e.env`; never commit them. Teardown §5 is mandatory at the end.
- [ ] **Step 2: Write the helper first (red).** `helpers-songoskriti.ts` exports the two functions above; implement by discovering the real activation path used by existing specs (the demo seed `supabase/migrations/20260924_songoskriti_demo.sql` writes **no** theme/widget rows — the spec activates itself through the real UI/server path). Run `E2E_BASE_URL=http://localhost:3020 E2E_NO_WEBSERVER=1 npx playwright test -c .e2e/playwright.config.ts songoskriti-port-parity` → fails (no spec yet) — then write the spec below (same run proves the wiring).
- [ ] **Step 3: Write the parity spec.** The spec resolves its evidence dir once: `const OUT = process.env.PORT_CAPTURE_OUT === "after" ? "docs/superpowers/songoskriti-evidence/port/after" : "docs/superpowers/songoskriti-evidence/port/reference";` (Task 8 reuses the same spec with `PORT_CAPTURE_OUT=after`; no edits between freeze and parity). For each surface × width {1440, 768, 375} × locale {en, bn}: navigate, `await page.evaluate(() => document.fonts.ready)`, `await page.emulateMedia({ reducedMotion: "reduce" })`, capture human evidence to `OUT` (`page.screenshot({ path: \`${OUT}/<surface>-<width>-<locale>.png\`, fullPage: true })`), then machine baseline:
  ```ts
  await expect(page).toHaveScreenshot(`<surface>-${width}-${locale}.png`, {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    threshold: 0.2,
  });
  ```
  Use `test.use({ viewport: { width, height: 900 }, locale })` per describe block; locale switching must match how `.e2e/theme-preview-isolation.spec.ts` renders en/bn. Record every capture's parameters (width, locale, reduced-motion, viewport, freeze sha `git rev-parse --short=12 HEAD`, catalogue= demo seed) into `reference-manifest.json`.
- [ ] **Step 4: Create baselines, then prove stability (calibration).** `npx playwright test -c .e2e/playwright.config.ts songoskriti-port-parity --update-snapshots`, then immediately re-run **without** `--update-snapshots`. All surfaces must pass. Any unstable surface: mark it `manual-review` in the manifest, `test.skip` it with an explicit reason string listed in the manifest (never silently), and record the decision. **This step is the one-time calibration** — thresholds are never adjusted after it; later differences go through manual review with before/after stills.
- [ ] **Step 5: Guard the freeze order.** Confirm `git status` shows no edits under `src/` — freeze precedes any renderer change. If anything under `src/` is modified, stop and report.
- [ ] **Step 6: Teardown + commit**
  ```bash
  git add .e2e/helpers-songoskriti.ts .e2e/songoskriti-port-parity.spec.ts .e2e/songoskriti-port-parity.spec.ts-snapshots docs/superpowers/songoskriti-evidence/port/reference docs/superpowers/songoskriti-evidence/port/reference-manifest.json
  git commit -m "test(port): freeze songoskriti reference stills + parity baselines"
  ```

### Task 5: Lane (a) top-up coverage — expanded per gap

**Files:**
- Create: `src/lib/themes/songoskriti/<key>-neutrality.test.ts` (one per gap row; names from classification.md)

**Interfaces:**
- Consumes: classification.md (a) rows + `## Leaks`; Task 3 fixtures.
- Produces: per-key neutrality evidence for the Phase-2 port map (Task 13).

- [ ] **Step 1 (per row):** Write the failing test: assert the key resolves to the **neutral** renderer for a foreign theme in the keyed storefront graph (through `resolveWidgetComponent(themeKey, key)` semantics in `theme-widgets.ts:73-78`), and assert the unkeyed editor/studio resolution state exactly as classified (`neutral` or recorded leak — a leak assertion must reference the classification row). Run it against the current tree: a clean (a) row passes immediately; a misclassified row fails → stop, return to Task 2's map (fix the row through a Task 2 amendment commit), never change `src/` to make it pass.
- [ ] **Step 2 (per row):** If the row was a "coverage missing" item, add the tray/schema half: assert the key's def appears in `buildEditorExtensionRegistry({installedPlugins: [], themeKey: <foreign theme>, approvedDevManifest: null, isActive: false})` (fail-closed) and is absent for tray insertion without the owning theme (see `tray-theme.test.ts` semantics in `src/components/builder/tray-theme.test.ts` — read it, do not modify).
- [ ] **Step 3:** Run `npx vitest run <new files>` — green; run the existing frozen suites `src/components/builder/theme-widgets.test.ts` + `tray-theme.test.ts` — untouched, green.
- [ ] **Step 4: Commit** (one commit per batch of rows; message lists the keys)
  ```bash
  git add src/lib/themes/songoskriti/<key>-neutrality.test.ts
  git commit -m "test(port): prove shared-neutral rendering for <keys>"
  ```

> Controller: if classification.md has no (a) gaps, record a no-op ruling in the ledger and skip to Task 6.

### Task 6: Lane (b) completion — expanded per presentation claim

**Template — render one brief per (b) row from classification.md.**

**Files (per row):**
- Modify: the row's carrier file(s) — verified candidates: `src/lib/themes/songoskriti/preview.ts` (storefront; the live precedent rides `builtin-themes.ts:12` → `preview-sources.ts`), `src/components/builder/songoskriti.tsx` (editor graph; imported at `unified-widget-registry.ts:127`). A carrier outside these files is an escalation, not an edit.
- Create: `src/lib/themes/songoskriti/<slug>-activation.test.ts`; extend (add-only) `src/lib/themes/songoskriti/<slug>-presentation.tsx` if the row is not yet complete (e.g., announcement/footer-proof exist; dressed-hero uses `registerVersionedPresentation`).

**Interfaces:**
- Consumes: classification.md row (slug, key, target graphs, carrier, dormancy flag); existing presentation module; Task 3/4 freezes.
- Produces: live registration in each target graph, proven by test; Phase-2 port-map entry.

- [ ] **Step 1:** Write the failing activation test. It must import only the **productive entry module** for the target graph (for storefront: the same module the app's chain imports — `builtin-themes.ts` path or the theme's `preview.ts`; for editor: `src/lib/unified-widget-registry.ts` — and assert the presentation resolves through the registry API `resolveThemePresentation`, never by importing the presentation module directly). Assert: (i) owner resolution returns the theme component; (ii) a foreign theme resolves to the fallback; (iii) if the row is `dormant`, the test asserts the inventory-named non-use/supersession fact instead — dormant rows require their proof or the escalation flag.
- [ ] **Step 2:** Run it: `npx vitest run src/lib/themes/songoskriti/<slug>-activation.test.ts` → red (registration does not run through the productive path — this is the reachability failure the spec predicts; ornament is currently test-only).
- [ ] **Step 3:** Fix activation: make the carrier module import the presentation module (side-effect registration pattern already used by header) — storefront: through `preview.ts`; editor: through `songoskriti.tsx`. If the import changes bundle graphs and something in `src/` outside the boundary objects, stop — escalation.
- [ ] **Step 4:** Green: re-run Step 2's command, then the neighborhood (`npx vitest run src/lib/themes/songoskriti/ src/components/builder/theme-widgets.test.ts src/components/builder/tray-theme.test.ts`). All green, existing files untouched.
- [ ] **Step 5:** If the claim is versioned (`dressed-hero`): same steps via `registerVersionedPresentation`, and add the surface to the Task 8 parity matrix note (it joins the matrix only once wired).
- [ ] **Step 6: Commit**
  ```bash
  git add src/lib/themes/songoskriti/<slug>-activation.test.ts src/lib/themes/songoskriti/<files touched>
  git commit -m "feat(theme): activate <slug> presentation through productive graph"
  ```

### Task 7: Lane (c) widgets — expanded per theme-owned widget

**Template — render one brief per (c) row from classification.md. `ornament` is the first row: it already has `ornament-def.ts` + `ornament-presentation.tsx` (test-only registration) and its reachability fix rides this template; inspect those files and follow their exact shapes.**

**Files (per row):**
- Create: `src/lib/themes/songoskriti/<slug>-def.ts`, `<slug>-presentation.tsx` (only the split; no components exported from the def file — react-refresh lint contract), `<slug>-def.test.ts`, `<slug>-reachability.test.ts`, `<slug>-presentation.test.tsx`.
- Modify: carrier file(s) per row (`preview.ts`, `songoskriti.tsx`); `ornament-def.ts` for the first row.

**Interfaces:**
- Consumes: classification row (slug, purpose, props from inventory renderer); `ornament-def.ts`/`ornament-presentation.tsx` as the split template; `src/lib/widget-props.ts` kinds; Task 3/4 freezes.
- Produces: `theme:songoskriti/<slug>` def with stable id (lowercase), `namespace: "theme"`, `themes: ["songoskriti"]`, `version: "1.0.0"`, closed `propsSchema` (`{ fields: PropField[] }` — function or array, match ornament), `defaults`, `slots` where ornament's shape has them, renderer reference; native component file; reachability + gating + recovery tests.

- [ ] **Step 1:** Def test first (red): schema validity (every `kind` from `src/lib/widget-props.ts`), stable id `theme:songoskriti/<slug>`, `themes` gating — the def is absent from the registry build for a foreign `themeKey`, present for `songoskriti`; save-time canonicalization path accepts a saved instance's props (follow `ornament-presentation.test.tsx`'s validation assertions).
- [ ] **Step 2:** Reachability test (red): import the productive editor entry (`src/lib/unified-widget-registry.ts`) and the storefront chain (via `preview.ts`/`builtin-themes.ts`), assert the def is present/resolvable **through those imports** — the test must fail if registration does not run through the productive path (this is the graph-reachability requirement; do not import `-def.ts` directly in this file except to compare ids).
- [ ] **Step 3:** Recovery test (red): with a foreign active theme, the widget is **not insertable** (tray/schema absent — reference `tray-theme.test.ts` semantics) while a previously saved instance still renders (fallback/placeholder), and returns to full render when the owning theme is active again. *(Superseded: universal dress/body ruling — design spec §4.4 addendum; Task 9-FIX ledger.)*
- [ ] **Step 4:** Implement `-def.ts` + `-presentation.tsx` by splitting the existing renderer the row names in classification.md (move markup out of `songoskriti.tsx` only if classification says the renderer currently lives there; otherwise copy-adapt per ornament). Port props 1:1 from the inventory's prop evidence into the closed schema; defaults must reproduce current output with no props set.
- [ ] **Step 5:** Activate through carriers (same rules as Task 6); fix `ornament`'s storefront+editor reachability in the same shape.
- [ ] **Step 6:** Green: run the three new files; then `npx vitest run src/lib/themes/songoskriti/ src/components/builder/songoskriti-port-freeze.test.tsx` (freeze still green — if the freeze fails, that is a parity finding: stop, record, escalate).
- [ ] **Step 7: Commit**
  ```bash
  git add src/lib/themes/songoskriti/<slug>-def.ts src/lib/themes/songoskriti/<slug>-presentation.tsx src/lib/themes/songoskriti/<slug>-def.test.ts src/lib/themes/songoskriti/<slug>-reachability.test.ts src/lib/themes/songoskriti/<slug>-presentation.test.tsx <carriers>
  git commit -m "feat(theme): theme-owned widget theme:songoskriti/<slug> with gated tray + recovery"
  ```

> Also in Task 7: correct the stale `homepage.ts:9` "30+ sections" comment to the evidence-backed counts from Task 1 (comment-only; commit as `docs(theme): correct stale homepage section count comment`).

### Task 8: Parity comparison against the freeze

**Files:**
- Create: `docs/superpowers/songoskriti-evidence/port/after/**` (recaptures), `docs/superpowers/songoskriti-evidence/port/parity-report.md`
- Read: `reference-manifest.json`, `.e2e/songoskriti-port-parity.spec.ts`

**Interfaces:**
- Consumes: Task 4 baselines + manifest; the completed gap-closure diffs.
- Produces: per-surface verdict table (surface, capture params, measured delta / manual-review, threshold, verdict, evidence links) — required by spec §10.

- [ ] **Step 1: Boot stack, recapture.** Run the parity spec with `PORT_CAPTURE_OUT=after` (Task 4 pinned this switch; no spec edits) **without** `--update-snapshots`: command as in Task 4 Step 1 + `npx playwright test -c .e2e/playwright.config.ts songoskriti-port-parity`.
- [ ] **Step 2:** Record results into `parity-report.md`: one row per surface/width/locale; machine pass/fail with ratio from Playwright output; `manual-review` surfaces get verdict by eye against the named reference still, with rationale. **Every approved difference links before/after stills** under `port/` with the rationale; **unreviewed differences never pass silently**.
- [ ] **Step 3:** Regressions: route each failing surface to the owning Task 5–7 expansion via the SDD fix loop (resume that widget's implementer with the diff artifacts). Do not fix in the controller session, do not adjust thresholds.
- [ ] **Step 4:** Include the theme-switch + mobile/tablet rows from the matrix (component-level evidence from Tasks 6–7 suites + these stills); note that legacy removal is out of scope this cycle.
- [ ] **Step 5: Teardown + commit**
  ```bash
  git add docs/superpowers/songoskriti-evidence/port/after docs/superpowers/songoskriti-evidence/port/parity-report.md
  git commit -m "test(port): parity report against frozen reference"
  ```

### Task 9: E2E editor journey — the acceptance bar

**Files:**
- Create: `.e2e/songoskriti-editor-journey.spec.ts`, `docs/superpowers/songoskriti-evidence/port/e2e/**` (run log + copied trace/screenshots)

**Interfaces:**
- Consumes: `helpers-songoskriti.ts` (Task 4: `ensureSongoskritiActive`, `setActiveTheme`); Task 7 widgets; the frozen helper/spec files must not be modified (if a helper gap appears, add a new helper export in a NEW file rather than editing Task 4's file — Task 4's file may be extended add-only only if its own reviewer accepts the change; prefer new file).
- Produces: the cycle's acceptance evidence.

**Recorded run recipe (exact):**
- **Services:** mode-B stack per `docs/15-e2e/loopback-auth-setup.md` §§1–3 — docker compose (`e2e-supabase`) + relay `socat TCP-LISTEN:58000` + migrations/seed + real GoTrue merchant + `VITE_SUPABASE_URL=http://127.0.0.1:58000 … DISABLE_HMR=true npx vite --port 3020 --strictPort --host localhost`. Teardown §5 mandatory.
- **Command:** `E2E_BASE_URL=http://localhost:3020 E2E_NO_WEBSERVER=1 E2E_MERCHANT_EMAIL=e2e-merchant@example.invalid E2E_MERCHANT_PASSWORD='<throwaway from unsaved env>' npx playwright test -c .e2e/playwright.config.ts songoskriti-editor-journey`
- **Assertions (in order):** real-form login → merchant session; `ensureSongoskritiActive` → theme shown active; open `/dashboard/content/editor`; tray shows the theme-owned widgets while active; insert one (the row's slug from Task 7); inspector shows schema-generated fields; edit a prop; save; reload the editor → the node persists (canonicalization re-validation passed); preview renders the widget; `setActiveTheme(page, <foreign>)` → widget not insertable (tray absent) + saved instance renders fallback; `setActiveTheme(page, "songoskriti")` → full render returns; no uncaught console errors during the flow (mirror how neighboring specs assert console hygiene; if none do, skip this check and say so in the report — never invent a failing check). *(Superseded: universal dress/body ruling — design spec §4.4 addendum; Task 9-FIX ledger.)*
- **Evidence path:** copy the run log and Playwright's trace/screenshots to `docs/superpowers/songoskriti-evidence/port/e2e/`. Do **not** commit `.artifacts/e2e/playwright-report/index.html` (churn file).
- **CI:** not wired this cycle — wiring requires separate approval (Global Constraint 9).
- [ ] **Step 1:** Write the spec with the assertion list above; first run → red against a deliberate gap check (e.g., assert a not-yet-insertable state first to prove the test fails when it should — commit that as the test's own history).
- [ ] **Step 2:** Run the recorded command until green **locally**, twice in a row (once more to prove stability), with logs saved.
- [ ] **Step 3:** If an assertion cannot be made to pass because core wiring is missing → stop, escalation entry, report (never weaken the assertion).
- [ ] **Step 4: Commit**
  ```bash
  git add .e2e/songoskriti-editor-journey.spec.ts docs/superpowers/songoskriti-evidence/port/e2e
  git commit -m "test(e2e): songoskriti editor journey (tray → schema → save → reload → switch)"
  ```

### Checkpoint P1

- [ ] Broader review over `4cf31ab9..HEAD` (Phase-1 range) with the ledger's deferred minors + escalations list.
- [ ] Present batched escalations (core-required leaks, unreachable graphs, dormancy without proof) to the user with the inventory/classification evidence. Do not proceed into Phase 2 with an unresolved escalation that a Phase-2 deliverable (the port map in `creation.md`) depends on; docs-only work may proceed while escalations wait.

---

## Phase 2 — Docs canonicalization

Order: status retrofit, A, B, C first; then D, E, F, G (spec §12). Every rewrite: content first, then status line per Global Constraint 7 (`sha` before the commit), then reviewer check for false claims (`file:line` pins where the doc makes behavioral claims, matching the house style of `docs/developers/guidelines.md`).

### Task 10: Status retrofit — 10 non-conformant guides

**Files:**
- Modify (line 3 only): `docs/developers/widget-development.md`, `versioning-publishing.md`, `getting-started.md`, `community-plugins.md`, `global-chrome.md`, `menu-extensions.md`, `security-sandbox.md`, `examples.md`, `concepts.md`, `themeable-widgets.md`

**Interfaces:**
- Consumes: Global Constraint 7; the observed malformed lines (`Last verified <date>.` — no colon, no sha).
- Produces: honest `Needs verification` status for exactly these 10 files. `plugins.md` and `themes.md` are excluded here (Tasks 15/16 give them verified lines post-rewrite). `docs/developers/guidelines.md`, `review-policy.md`, `sdk.md`, `theme-updates.md`, `docs/packages/contract.md` keep their conformant lines (shas verified to resolve: `1bb2cef6`, `d95316b6`, `10fc35c`, `8ec9abda`).

- [ ] **Step 1:** For each of the 10 files, replace the malformed `Last verified…` line with exactly `Needs verification`. No other edits in this task.
- [ ] **Step 2:** Verify: `grep -rn "Last verified [0-9]" docs/developers/` returns only the five conformant files' `Last verified: …@ sha` lines plus the fenced example inside `guidelines.md` (which stays — it is inside a fence). Every other file's line reads `Needs verification`.
- [ ] **Step 3: Commit**
  ```bash
  git add docs/developers/widget-development.md docs/developers/versioning-publishing.md docs/developers/getting-started.md docs/developers/community-plugins.md docs/developers/global-chrome.md docs/developers/menu-extensions.md docs/developers/security-sandbox.md docs/developers/examples.md docs/developers/concepts.md docs/developers/themeable-widgets.md
  git commit -m "docs: honest verification status for 10 unchecked developer guides"
  ```

### Task 11 (A): `docs/04-builder/README.md` — editor source of truth

**Files:** Modify `docs/04-builder/README.md`

- [ ] **Step 1: Rewrite as the editor source of truth.** Required content: real route `/dashboard/content/editor` (not `/admin/builder`); `EditorShell` + `StudioBuilder`; the authorized registry build (`buildEditorExtensionRegistry({installedPlugins, themeKey, approvedDevManifest, isActive})`, fail-closed); widget tray (incl. theme-owned tray gating); schema-generated inspector; canvas renderer + persisted node model; save/re-validation path; preview; publishing; recovery; test commands (existing: `npx vitest run src/lib/editor src/components/builder`, `npx playwright test -c .e2e/playwright.config.ts plugin-registry-editor-wiring`).
- [ ] **Step 2:** Remove the "no Playwright, no `.e2e`" claim outright (no banner escape). For `/admin/builder`: remove the description or keep only a legacy-bannered mention (lowercase `legacy` on the same line — the gate's check 3 token). Keep the honesty disclaimer; reword so it does not name a non-existent suite or dead path, or suppress the specific line with `<!-- doc-gate-ok: deliberate negative reference -->`.
- [ ] **Step 3:** Sibling `docs/04-builder/*` pages: minimal linking fixes only where they contradict A (no mass rewrite).
- [ ] **Step 4:** Status: record `git rev-parse --short=12 HEAD` **before** committing, add `Last verified: 2026-10-18 @ <sha>` beneath the H1.
- [ ] **Step 5:** Cross-check every behavioral claim against source (`file:line` per house style); reviewer verifies against the tree.
- [ ] **Step 6: Commit**
  ```bash
  git add docs/04-builder/README.md docs/04-builder/
  git commit -m "docs(builder): README as editor source of truth"
  ```

### Task 12 (B): `docs/04-builder/app-blocks.md` — canonical widget contract

**Files:** Modify `docs/04-builder/app-blocks.md`

- [ ] **Step 1:** Cover: identity (key, namespace), schemas (`propsSchema`, `defaultProps`), instance properties, slots, responsive controls, rendering modes, validation, compatibility, fallback. Taxonomy: native, source-backed official, isolated plugin, themeable plugin, theme-owned. Field kinds must be a subset of `src/lib/widget-props.ts` exports (gate check 5 later enforces this — get them exactly right now).
- [ ] **Step 2:** Other guides link here instead of restating divergent contracts (no divergence left in A/G).
- [ ] **Step 3:** Status line as in Task 11 Step 4; commit
  ```bash
  git add docs/04-builder/app-blocks.md
  git commit -m "docs(builder): canonical widget contract in app-blocks"
  ```

### Task 13 (C): `docs/themes/creation.md` — authoring + the Songoskriti port map

**Files:** Modify `docs/themes/creation.md`; create `docs/themes/songoskriti-port-map.md` **only** if the map exceeds one screen (spec §11), linked from `creation.md`

- [ ] **Step 1:** Keep the isolation rules; rewrite migration/authoring around the unified registry.
- [ ] **Step 2:** Add the port-map section from `classification.md` + Task 1 evidence: reuse (a) / presentation (b) / theme-owned (c) per row with the evidence-backed homepage counts (21 sections / 12 distinct types / union 14) and per-graph neutrality verdicts; live/dormant status per presentation claim with proof pointers.
- [ ] **Step 3:** Document source registration (activation carriers, productive-path rule, `index.ts` is not a root), props schemas, asset ownership, bilingual content, visual-parity tests (reference/manifest/parity-report links).
- [ ] **Step 4:** State explicitly that official themes are not ordinary exported packages (negative reference — phrase carefully; if the sentence trips gate check 8, add `<!-- doc-gate-ok: <reason> -->` on that line and expect it listed in reports).
- [ ] **Step 5:** Status line + commit (add `docs/themes/songoskriti-port-map.md` to the `git add` only if Step 1's size rule split it out)
  ```bash
  git add docs/themes/creation.md
  git commit -m "docs(themes): unified authoring + songoskriti port map"
  ```

### Task 14 (D): package lanes — `docs/packages/contract.md` + `docs/themes/packages.md` + `docs/themes/level-b.md`

**Files:** Modify all three

- [ ] **Step 1:** One canonical lifecycle, three distinct cases: official source themes; declarative merchant/community ZIP themes; reviewed executable Level B themes. Manifests, validators, install/activation paths, security limits, review requirements, lane chooser. Preserve and state "official themes are not ZIP packages" (negative reference → suppression marker if the lint trips).
- [ ] **Step 2:** `packages/contract.md` already conformant (`8ec9abda`) — if its content is genuinely re-checked here, refresh the sha; otherwise leave the line; either way state in the commit message which happened.
- [ ] **Step 3:** Status lines for `packages.md` + `level-b.md` + commit
  ```bash
  git add docs/packages/contract.md docs/themes/packages.md docs/themes/level-b.md
  git commit -m "docs(packages): canonical three-lane distribution lifecycle"
  ```

### Task 15 (E): `docs/developers/plugins.md` + `examples/starter-plugin/` refresh

**Files:** Modify `docs/developers/plugins.md`, `examples/starter-plugin/manifest.json` (+ tests only if additive assertions are needed); Read: `examples/starter-plugin/src/widget.ts`, `tests/*`

**Interfaces:**
- Consumes: shipped contract verified against source (`propsSchema` + `defaultProps` + `themeable`; `settings` still supported where shipped).
- Produces: guide + runnable quickstart fixture using the shipped contract.

- [ ] **Step 1: Audit first.** Verify the shipped manifest contract in source (validator + types). The example currently uses `settings` only: `"settings": [{ "key": "greeting", "label": "Greeting", "kind": "text", "default": "Hello" }]` — additively add the shipped-contract fields (`propsSchema`-equivalent manifest surface, `defaultProps`, `themeable`) **without removing `settings`** unless source proves removal is required (then escalate to the user first — contract change out of docs scope).
- [ ] **Step 2:** Guide content: `propsSchema` + `defaultProps` contract, sample definitions, every supported field type (subset of `src/lib/widget-props.ts`), schema validation, per-instance vs global settings, Class A/Class B behavior, theme compatibility, local test fixtures, the actual editor workflow (link `docs/developers/editor.md` once Task 17 lands). First replace "Last verified 2026-09-26." per Global Constraint 7 (fresh line at the end).
- [ ] **Step 3:** Examples run: `cd examples/starter-plugin && npx vitest run` — report passed/skipped counts verbatim in the task report.
- [ ] **Step 4:** Status line + commit
  ```bash
  git add docs/developers/plugins.md examples/starter-plugin/
  git commit -m "docs(developers): current widget-authoring contract + refreshed starter-plugin"
  ```

### Task 16 (F): `docs/developers/themes.md` — third-party theme entry point

**Files:** Modify `docs/developers/themes.md`

- [ ] **Step 1:** Decision table (data-only ZIP vs Level B executable), SDK/build links, compatibility requirements, review/install/activation path, editor-visible theme widgets, security links. Explicitly: Songoskriti is source-owned official, not a downloadable template to upload as a package (negative reference → suppression marker if needed).
- [ ] **Step 2:** Status line (replaces "Last verified 2026-09-26 against HEAD.") + commit
  ```bash
  git add docs/developers/themes.md
  git commit -m "docs(developers): theme entry point decision table"
  ```

### Task 17 (G): `docs/developers/editor.md` (new) + README link

**Files:** Create `docs/developers/editor.md`; modify `docs/developers/README.md` (index link only)

- [ ] **Step 1:** The real developer journey: install/activate an extension → find its widgets → insert → edit schema-generated settings → responsive views → preview → save → publish. Troubleshooting: missing schemas, incompatible theme presentations, disabled packages, safe fallbacks. Behavioral claims pinned `file:line`; commands from `package.json` only.
- [ ] **Step 2:** Status line; link from `docs/developers/README.md` (README itself gets no status line — index exempt).
- [ ] **Step 3: Commit**
  ```bash
  git add docs/developers/editor.md docs/developers/README.md
  git commit -m "docs(developers): editor journey for extension developers"
  ```

### Checkpoint P2

- [ ] Broader review over the Phase-2 range: cross-doc contradictions (A–G + retrofit), status-line honesty (no verified stamp without a check; shas resolve), `examples/starter-plugin` runnable. Fix findings via the owning task's fix loop.

---

## Phase 3 — Documentation gate

### Task 18: `scripts/doc-gate.mjs` + seeded self-test fixtures

**Files:**
- Create: `scripts/doc-gate.mjs`, `scripts/fixtures/doc-gate/**`
- Read: `scripts/design-gate.mjs` (style template: exit 0 clean / 1 findings / 2 harness failure, `--json`, human report on stdout; but **no** `--allow` — check code and CLI parsing both lack it)

**Pinned config (single source, at top of the script):**

```js
const IN_SCOPE = [
  "docs/developers/**",
  "docs/04-builder/README.md",
  "docs/04-builder/app-blocks.md",
  "docs/themes/creation.md",
  "docs/themes/packages.md",
  "docs/themes/level-b.md",
  "docs/packages/contract.md",
];
const STATUS_REQUIRED = [ /* IN_SCOPE markdown minus the index: */
  "docs/developers/community-plugins.md", "docs/developers/concepts.md",
  "docs/developers/editor.md", "docs/developers/examples.md",
  "docs/developers/getting-started.md", "docs/developers/global-chrome.md",
  "docs/developers/guidelines.md", "docs/developers/menu-extensions.md",
  "docs/developers/plugins.md", "docs/developers/review-policy.md",
  "docs/developers/sdk.md", "docs/developers/security-sandbox.md",
  "docs/developers/themeable-widgets.md", "docs/developers/themes.md",
  "docs/developers/theme-updates.md", "docs/developers/versioning-publishing.md",
  "docs/developers/widget-development.md",
  "docs/04-builder/README.md", "docs/04-builder/app-blocks.md",
  "docs/themes/creation.md", "docs/themes/packages.md", "docs/themes/level-b.md",
  "docs/packages/contract.md",
  // exempt: docs/developers/README.md (index; covered by other checks, no status line)
];
const STATUS_FORMS = [
  /^Last verified: \d{4}-\d{2}-\d{2} @ [0-9a-f]{7,40}$/,
  /^Needs verification$/,
  /^Historical — .+$/,
];
const AUTHORITY_KEYWORDS = { /* keyword (case-insensitive) -> authority path */
  "propsSchema": "docs/04-builder/app-blocks.md",
  "defaultProps": "docs/04-builder/app-blocks.md",
  "themeable": "docs/04-builder/app-blocks.md",
  "widget tray": "docs/04-builder/README.md",
  "schema inspector": "docs/04-builder/README.md",
  "theme presentation": "docs/themes/creation.md",
  "registerThemePresentation": "docs/themes/creation.md",
  "source-owned": "docs/themes/creation.md",
  "Level B": "docs/packages/contract.md",
};
const CONTRADICTIONS = [ /* check 8, each with pass/ + fail/ fixtures */
  { id: "official-as-zip", pattern: /\bofficial\b[^\n.]*\b(downloadable|ZIP)\b/i },
  { id: "songoskriti-as-package", pattern: /\bSongoskriti\b[^\n.]*\b(package|downloadable|ZIP)\b/i },
  { id: "admin-builder", pattern: /\/admin\/builder/ , banner: /legacy/i },
  { id: "no-playwright", pattern: /\bno\s+Playwright\b/i },
  { id: "no-e2e", pattern: /\bno\s+`?\.e2e`?\b/i },
  { id: "levelb-official", pattern: /\bofficial themes?[^\n.]*\bLevel B\b/i },
];
const LABEL_KEYS = { "plugin-manifest": { required: ["id","name","version","api","widgets"], allow: ["id","name","version","description","api","permissions","widgets","hooks","hooksUrl","i18n","budget","settings","propsSchema","defaultProps","themeable"] },
                     "theme-manifest.json": { required: ["id","name","version"], allow: ["id","name","version","description","tokens","skins","homepage","presentations","assets"] } };
const SUPPRESSION = /<!-- doc-gate-ok: .+ -->/; // must carry a reason
```

**Check behavior (each finding = `file:line`, matched token, why-it-matters):**
1. **Source refs** — backticked repo paths in IN_SCOPE docs exist on disk; tolerate `:line`/`:range` suffixes and globs (≥1 match); suppression marker on the line for deliberate negatives.
2. **Commands** — `` `bun run <name>` ``/`` `npm run <name>` `` exist in `package.json` scripts; `` `bun scripts/<f>` ``/`` `node scripts/<f>` `` exist; known binaries (`vitest`, `playwright`, `tsc`, `vite`) allowed.
3. **Routes** — `/dashboard/…` references resolve to a file under `src/routes/**` via segment-suffix heuristic (documented in the header); `/admin/builder` fails unless the line carries the `legacy` banner token (case-insensitive).
4. **Manifest/code examples** — fenced blocks labeled `plugin-manifest` / `theme-manifest.json` must parse as JSON and satisfy `LABEL_KEYS` (required present, no keys outside allow).
5. **Field kinds** — `kind: "…"` tokens in widget-authoring docs ⊆ exported kinds from `src/lib/widget-props.ts` (best-effort regex extraction, pinned by self-test).
6. **Authority links (deterministic)** — each authority in `AUTHORITY_KEYWORDS` exists on disk; any IN_SCOPE doc mentioning a keyword must contain a markdown link whose normalized target path is that authority path. Link-presence only; semantic divergence is check 8's job.
7. **Verification status** — every `STATUS_REQUIRED` doc carries exactly one `STATUS_FORMS` match in its leading block (lines before the first `## `), fenced blocks excluded; `Last verified` shas must satisfy `git rev-parse --verify --quiet <sha>^{commit}` in the repo. Zero matches, multiple matches, malformed lines, or valid-line-inside-fence-only → findings. **In-scope predicate = the Python-on-the-wall: `STATUS_REQUIRED` is the single source; nothing else is scanned for status.**
8. **Contradiction lint** — `CONTRADICTIONS` above; a match is suppressed only by `SUPPRESSION` (with reason) on the same line; every suppression instance is listed in the report.

**Self-test (preflight, exit 2 on mismatch):** run all checks against `scripts/fixtures/doc-gate/` — a seeded corpus with `pass/` and `fail/` per item: check 1 (exists/missing path); check 2 (valid/invalid script + binary); check 3 (resolvable route / `/admin/builder` unbannered / bannered-pass); check 4 (valid JSON label / malformed JSON / unknown key); check 5 (valid kind / `kind: "banana"`); check 6 (keyword + authority link / keyword without link); check 7 (each of: valid sha line; non-resolving sha; `Needs verification`; `Historical — reason`; two status lines → fail; fenced-only occurrence → fail; fenced *format example* above a real line → pass — mirrors `docs/developers/guidelines.md`); check 8 (one pass + one fail fixture per contradiction id, plus a suppression-pass fixture carrying `<!-- doc-gate-ok: deliberate negative reference -->`). The corpus contains forbidden strings by design; it lives outside `IN_SCOPE` so the repo run never scans it, and the gate's own file is excluded from its scan set. Fixture check-7 pass shas use a commit that resolves in the repo (e.g. `c86a6125`); fail shas use an unresolvable token (e.g. `deadbeefdead`).

- [ ] **Step 1:** Write the self-test fixtures first (red): all pairs under `scripts/fixtures/doc-gate/`.
- [ ] **Step 2:** Write `scripts/doc-gate.mjs` with the pinned config, the eight checks, `--json`, human report listing findings + suppression instances, exit codes 0/1/2, heuristic limits in the header comment. CLI parsing must reject and fail exit-2 on any unknown flag — assert in self-test that `--allow` is unknown-flag failure while remaining absent from the code.
- [ ] **Step 3:** Self-test green: `node scripts/doc-gate.mjs --self-test` (or automatic preflight; pin the flag name in the header and use it in Step 5).
- [ ] **Step 4:** Repo run: `node scripts/doc-gate.mjs` — findings here are real; fix them in the owning docs task via its fix loop (or, if the finding itself is a gate defect, fix the gate + add the missing fixture pair — never weaken the check).
- [ ] **Step 5: Commit**
  ```bash
  git add scripts/doc-gate.mjs scripts/fixtures/doc-gate
  git commit -m "chore(gate): documentation gate with seeded self-test fixtures"
  ```

### Task 19: Wiring + red/green evidence

**Files:**
- Modify: `package.json` (add `"doc:gate": "node scripts/doc-gate.mjs"` near `design:gate`; add `&& bun run doc:gate` into the `gates:release` chain directly after `bun run design:gate`), `.circleci/config.yml` (in job `unit-contract`, after the `Contract gate` step: `- run: { name: Documentation gate, command: bun run doc:gate }`)
- Create: `docs/superpowers/songoskriti-evidence/port/doc-gate/{run.txt,run.json,selftest.txt}`

- [ ] **Step 1:** Apply the two wiring edits exactly as above (no other changes in either file).
- [ ] **Step 2:** Validate wiring: `jq -e '.scripts["doc:gate"]' package.json` and `bun run doc:gate` → exit 0; `grep -n "doc:gate" .circleci/config.yml package.json`.
- [ ] **Step 3:** Red/green evidence: green = repo run output; red = the self-test's seeded failures (it must fail before passing — capture the fixture-driven failure using the gate binary against the `fail/` tree with the required exit code 1; if the self-test structure makes a single-binary red run impossible, capture the self-test log showing each fail fixture was detected, and say so explicitly). Save stdout + `--json` to the evidence dir.
- [ ] **Step 4:** Confirmation checks: no `--allow` exists (`grep -n "allow" scripts/doc-gate.mjs` shows no suppression flag); every `<!-- doc-gate-ok:` occurrence in repo docs appears in the gate report (grep the docs, compare with report output, list both in the evidence).
- [ ] **Step 5:** Run the neighborhood: `bun run test:contracts` still green (the gate chain edit must not break it) and `node scripts/doc-gate.mjs --json > /dev/null` exits 0.
- [ ] **Step 6: Commit**
  ```bash
  git add package.json .circleci/config.yml docs/superpowers/songoskriti-evidence/port/doc-gate
  git commit -m "chore(gate): wire doc:gate into release chain + unit-contract CI"
  ```

### Checkpoint P3 + final

- [ ] Final whole-branch review over the full plan range (MERGE_BASE = `c86a6125`), pointed at the ledger's deferred minors/parked items; ONE fix wave if findings; one scoped re-review; residuals adjudicated.
- [ ] Acceptance-criteria sweep against spec §10, each with its evidence pointer.
- [ ] Stop before any push/merge; present the branch state to the user (`finishing-a-development-branch` options).

---

## Self-review (spec coverage)

- Spec §2 approach A / §3 grounding → Tasks 1–2 consume the verified facts; nothing re-litigates direction.
- §4.1 inventory axes → Task 1 (all eight axes incl. the 14-type union + counts).
- §4.2 lanes + dormancy + tray gating/recovery → Tasks 2, 5, 6, 7 (templates carry the gating/recovery tests; dormant requires proof or approval). *(Superseded: universal dress/body ruling — design spec §4.4 addendum; Task 9-FIX ledger.)*
- §4.3 freeze recipe + visual-parity decision + thresholds → Tasks 3, 4 (calibration-once rule, manual-review fallback, before/after links).
- §4.4 activation/reachability rules → Tasks 6, 7 (productive-path tests; `index.ts` never an activation root; escalation for unreachable graphs).
- §4.5 parity matrix + acceptance bar + recorded recipe → Tasks 8, 9 (exact command/services/assertions/evidence path; CI wiring deferred).
- §5.1/5.2 A–G → Tasks 11–17; §5.3 status lines + quickstarts + test-claim labeling → Task 10 + per-task status steps + Task 15 examples run reporting.
- §6 gate: 8 checks, self-test, no `--allow`, wiring → Tasks 18, 19.
- §7 boundary/§8 invariants → Global Constraints 1–12 (enforced at every review).
- §10 acceptance criteria → Checkpoint P3 sweep.
- §11 open points → dormancy proof (Tasks 2/6), port-map split rule (Task 13), no legacy removal (Task 8 Step 4), no mechanical stamps (Task 10).
- Spec-review plan requirements: check 7 predicate pinned in Task 18 (`STATUS_REQUIRED` literal + seeded pass/fail/edge fixtures); local e2e command/services/assertions/evidence path recorded in Task 9.
- Type/name consistency: `ensureSongoskritiActive`/`setActiveTheme` defined Task 4, consumed Task 9; `<slug>-def.ts`/`<slug>-presentation.tsx` naming consistent across Tasks 6–7; `STATUS_REQUIRED`/`STATUS_FORMS`/`AUTHORITY_KEYWORDS`/`CONTRADICTIONS` used only in Task 18; `PORT_CAPTURE_OUT` defined Task 4, consumed Task 8; `inventory.md`/`classification.md`/`reference-manifest.json`/`parity-report.md` named consistently.
