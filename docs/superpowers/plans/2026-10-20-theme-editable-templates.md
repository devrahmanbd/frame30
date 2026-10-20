# Phase 1 — Theme-editable CMS templates: give Songoskriti's `page` template the route's real content

**Goal:** Songoskriti's `page` template must declare the shared `page_content` slot, so the CMS page route and the CMS-designated homepage both render the merchant's real body **inside** the theme layout, with no demo copy anywhere in the template — and the theme preview's `?template=page` tab must keep showing a body (a clearly labelled **demo** page) instead of chrome around an empty one.

**Architecture:** One root cause, two symptoms. Songoskriti's `page` template authors a `heading` + `rich_text` pair of demo copy and declares **no** `page_content` section (`src/lib/themes/songoskriti/preview.ts:207-217`). `ThemeChrome` renders a route's theme body only when the theme's main declares that route's `contentSlot` (`src/components/store/ThemeChrome.tsx:302-310`), so the CMS page route falls back to route-owned prose (the theme layout is bypassed), while the CMS-designated homepage — which names **no** `contentSlot` (`src/components/store/StoreHomepage.tsx:101-123`) — renders the theme's hardcoded demo copy and silently drops the merchant's real body. The fix is one theme-owned array: the theme's `page` main becomes `breadcrumb` + `page_content`. Everything else in the pipeline (the `contentSlot` contract, `ContextSlot`, the route's `contextSlots`) already exists and is not touched. **One consequence follows**: `page_content` is a context widget (`src/components/builder/widgets.tsx:1617`), so the *host* must hand it a React node — and the preview's host (`src/components/store/ThemePreviewFrame.tsx`) had no node to give it (`useMockProductSlots` returns `undefined` for every template but `product`, `:309`). Left alone, the fixed template would render chrome around an empty body in `?template=page`. Under the owner's approved escalation (Task 1) the preview therefore gains a **demo** page source (a NEW fixture plus one slot map in the frame), and the fixture is typed as a `Pick` of the production page record so it cannot drift from the route's payload shape.

**Tech Stack:** TypeScript 5 / React 19 (TanStack Start), Vitest 4, `tsgo` typecheck, ESLint 9 + Prettier 3, Node 24. No new npm dependency is added.

**Spec:** `docs/superpowers/songoskriti-evidence/port/phase0-implementation-map.md` (the Phase-0 audit — §2.3 the Page question, §5 the §7 boundary, §8 the phase order) + `docs/superpowers/plans/2026-10-20-theme-editable-templates-brief-review.md` (the brief's review — §3 premise table P1/P2, §6 risk ranking, §7 the re-cut) + `docs/superpowers/specs/2026-10-18-songoskriti-unified-port-design.md` §7 (the editable/prohibited boundary) and §9 (the frozen-pin escalation procedure). The brief under review is `docs/superpowers/plans/2026-10-20-theme-editable-templates-brief.md`.

---

## Corrections to the audit

The audit's Phase 1 is right about the defect and about the fix location. Five statements in it are wrong or materially incomplete, and this plan is written against the code, not against the audit.

1. **"Phase 1 … needs no port-spec escalation" is wrong.** The audit (§8, Phase 1) says *"Files touched: `src/lib/themes/songoskriti/preview.ts` only. Plus a NEW test file."* In fact **three** existing files are implicated: two **existing** test files pin the page template's current composition and both go red under the fix, and both are prohibited by port spec §7 (*"existing test files and their snapshots (`.snap`) under `src/`"*):
   - `src/components/builder/songoskriti-port-freeze.test.tsx:106` — `page: ["heading", "rich_text"]`, asserted at `:155-159`.
   - `src/lib/theme-preview-nav.test.ts:142-148` — every template's main must open with `heading` (exceptions: `index`, `collection`). The page template's opener changes, so this assertion changes too.

   And a third file is prohibited for a different reason: `src/components/store/ThemePreviewFrame.tsx` — the preview's slot map (`useMockProductSlots`, `:256`) is the only place a `page_content` node can come from, and it returns `undefined` for every template but `product` (`:309`). Without a change there, the fix ships a blank preview page (Correction 4). The **owner has approved** this third file inside the §7 escalation; the escalation record names it, its reason and its exact scope (Task 1, step 1.4 (g)).

   Port spec §9 governs exactly this case: *"a change that alters existing pinned output is a parity finding first; if genuinely required, escalate with the exact diff and rationale before any update (named and called out, never blind `-u`)."* Task 1 therefore writes the escalation record (a `docs/**` file — allowed) and commits it **before** Task 3 touches the pins and before Task 4 touches the frame.

2. **The audit's Phase-1 acceptance criterion #3 is under-specified.** It says the demo strings must not appear "in the `page` preview body", which leaves open whether the template may keep other sections. It may not: `page` is a route-h1 template (`ROUTE_H1_TEMPLATES`, `src/lib/builder-ast.ts:68-75`, `page` at `:72`), the route renders its own `<h1>{page.title}</h1>` inside the slot (`src/components/store/PageView.tsx:77`), and `PageView` passes `ownsPrimary={custom}` (`:165`) — so on a **path host** (`/store/<slug>/pages/<slug>`, `custom === false`) the theme's body still elects a primary section (`src/components/store/ThemeChrome.tsx:316` → `primarySectionId`, `src/lib/builder-ast.ts:88-106`). Any section with a non-empty `heading` prop, or a `heading`-type section with non-empty `text`, would therefore render a **second `<h1>`**. Measured on this tree: a `product_rail` carrying a heading prop makes `primarySectionId` return that rail (`primarySectionId` → `null` only when no section qualifies). The plan therefore pins `primarySectionId(pageAst) === null` — *silence is legal there* (`routeSuppliesH1`, `src/lib/builder-ast.ts:76-79`) — and additionally pins that the page main contains **no heading-bearing section at all** (see correction 5).

3. **The audit omits a storefront regression the fix causes.** `PageView`'s route fallback carries the breadcrumb **and** the "More information" sibling-page nav (`src/components/store/PageView.tsx:112-151`, `:177-186`). The moment the theme's main declares `page_content`, `themed` is non-null and the fallback is no longer rendered (`src/components/store/ThemeChrome.tsx:403-425`) — so the sibling-page nav disappears, and the breadcrumb disappears too unless the theme declares the `breadcrumb` slot. The breadcrumb is recoverable inside the boundary (`breadcrumb` allows the `page` template, `src/lib/builder-ast.ts:1500-1509`, `templates` at `:1506`; the route hands it over at `src/components/store/PageView.tsx:175`), so the plan keeps it. The sibling-page nav has **no widget** and can only be restored by editing the prohibited `src/components/store/PageView.tsx` — it is recorded as a known consequence and routed to the boundary Decision Gate, not silently dropped.

4. **"The preview shows the page template" needs a caveat the audit does not state — and the audit also stops one step short of the fix.** The preview supplies **no** `page_content` context slot, and `SectionRenderer` renders `null` for a context widget whose slot is `undefined` outside the editor (`src/components/builder/SectionRenderer.tsx:825-833`). The preview's only slot source is `useMockProductSlots` (`src/components/store/ThemePreviewFrame.tsx:256`), which returns `undefined` for every template but `product` (`:309`), so after the fix `?template=page` would show the theme's chrome with an **empty body** — the demo copy is gone and the merchant's page is not in the preview either. The audit parks that on Phase 6 (*"two distinct CMS page fixtures"*, `phase0-implementation-map.md:547`), which is not acceptable for a Phase-1 change: the fix would ship a merchant-visible regression (a blank page in the theme preview) in exchange for a correctness win. The owner has therefore approved a **third** file inside the port spec §7 escalation (`src/components/store/ThemePreviewFrame.tsx`), and Task 4 gives the preview a **demo** page source: a NEW fixture (`src/lib/preview-page-data.ts`) plus one slot map in the frame. The fixture mirrors the production payload's shape (`title`, `excerpt`, `html`, `updated_at` — `src/components/store/PageView.tsx:73-110`) and is typed as a `Pick` of the production page record (`StorePage`, `src/lib/storefront-search.server.ts:257-269`), so it cannot drift from the route's payload. Its **copy** is demo copy and says so — the same contract as "Demo Shopper" (`src/lib/preview-demo-data.ts:42`) and "Sample product" (`src/components/builder/CartContext.tsx:95`); it never pretends to be a real merchant page. Measured on this tree after the change: `GET /theme-preview/songoskriti?template=page` returns `200` with the demo body present and the old demo strings gone (Task 5, step 5.5). **One residual gap remains and is stated plainly**: the `breadcrumb` section still renders **nothing** in the preview — the breadcrumb is route context (merchant name + page title, `src/components/store/PageView.tsx:47-69`) and the preview supplies no such slot — so the preview shows the body without the trail above it. It does not affect the body content, the storefront, or CI; it is a cosmetic parity gap in one preview tab, and Phase 6 still owns the wider preview-honesty work (`?? templates.index`, `src/components/store/ThemePreviewFrame.tsx:485`).

5. **The audit omits a false lint warning the fix creates in the merchant's editor.** `lintTemplate` takes the template key as an *optional* second argument (`src/lib/builder-ast.ts:8380-8383`) and only then honours `routeSuppliesH1(template)` (`src/lib/builder-ast.ts:8431-8437`: `if (headings.length === 0 && !routeSuppliesH1(template))` → *"No primary heading on this template."*). Two call sites — the two that compute the **editor/workspace lint issues** — pass **no** template key:
   - `src/hooks/use-builder-editor.ts:635` — `out[key] = lintTemplate(doc.templates[key] ?? EMPTY_AST);`
   - `src/lib/themes.server.ts:284` — `issues[key] = lintTemplate(templateOf(templates, key));`

   (Other call sites already do it correctly — `src/lib/themes.server.ts:850` and `:1492` both pass the key — so the keyed form is the intended contract and the two sites above are the defect.) Because the key is missing, `routeSuppliesH1(undefined)` is `false` and the route-h1 exemption never applies. Today every Songoskriti template opens with a **heading-claiming** section — `index` with `hero_carousel` (`src/lib/themes/songoskriti/homepage.ts:31`), `collection` with `category_header` (`src/lib/themes/songoskriti/preview.ts:110`), and the rest with a `heading` widget — and `hero_carousel` and `category_header` are CATALOG types flagged `heading: true` (`src/lib/builder-ast.ts:4968`, `:2695`) alongside `heading` itself (`:1186`), so all of them claim the h1 (the lint counts claimants by exactly that flag, `src/lib/builder-ast.ts:8424-8426`). The warning is therefore silent for every template today; the `page` template — whose main becomes `breadcrumb` + `page_content`, and neither of those two types claims a heading (`heading: false`, `src/lib/builder-ast.ts:1505`, `:1596`) — becomes the **only** template in the theme that triggers it. `builder-lint-fixes.ts:131-136` classifies the message as `heading.missing_h1` (regex `/No primary heading/i`, rank 8) and `builder-lint-fixes.ts:384-390` routes it to the SEO panel, which is what `LintPanel` surfaces in the builder (`src/components/builder/LintPanel.tsx:22`, mounted at `src/routes/_authenticated/dashboard/builder.tsx:1490`).

   **Merchant-visible symptom:** a merchant editing the `page` template is told *"you have no primary heading"* on a template where the route deliberately owns the `<h1>`. The natural response is to add a `heading` widget — and on a **path host** that heading is elected by `primarySectionId` (`src/components/store/ThemeChrome.tsx:316`), producing the **second `<h1>`** this plan exists to prevent. The fix (pass the template key to `lintTemplate`) lives in `src/hooks/use-builder-editor.ts` and `src/lib/themes.server.ts`, both **prohibited** by port spec §7, so this plan can only **record** it. The plan therefore (a) records the consequence in the Task-1 escalation record and the Task-5 evidence doc, (b) routes it to the D4 boundary decision, and (c) pins the theme's page template as containing **no heading-bearing section** (Task 2, assertion 7) so the path to a second `<h1>` is guarded and cannot be reopened silently.

   Additionally, the plan's own theme test calls `lintTemplate(ast, "page")` **with** the key (Task 2, assertion 3), so the plan's contract is the correct one; the defect is confined to the two key-less call sites named above.

Additionally, the audit's claim that the theme's page main is "generic" is now measurable rather than rhetorical: the current page main's section types (`["heading", "rich_text"]`) are **identical** to the engine's `genericDemoMain("page", …)` body (`src/lib/theme-preview-nav.ts:357-372`). The new test pins that inequality.

---

## Global Constraints

- **No new npm dependency.** This plan adds no package to `package.json` and changes no lockfile.
- **No test is deleted, skipped, weakened, or made conditional.** Two existing tests are *updated* (Task 3) because they pin the old composition; each update replaces a stale expectation with a **stronger** one (the exact new composition / an explicit per-template opener map) and is named in the Task-1 escalation record. No `it.skip`, no `test.skip`, no loosened `expect`. The third escalated file is **not** a test — `src/components/store/ThemePreviewFrame.tsx` is a component, and the change adds a slot map without touching, skipping or loosening a single assertion in it.
- **Port spec §7 boundary.** Editable: `src/lib/themes/songoskriti/**`; `src/components/builder/songoskriti.tsx` + `songoskriti-motion.ts`; NEW test/fixture files; NEW `.e2e/` spec/helper files; `docs/**`; `scripts/**`; wiring-only `package.json` / `.circleci/config.yml` edits. Prohibited: `src/lib/builder-ast.ts`, `src/components/builder/widgets.tsx`, `src/lib/theme-presentations.ts`, `src/lib/unified-widget-registry.ts`, `src/lib/editor/**`, all `src/routes/**`, existing test files and their `.snap` files, existing `.e2e/**` files, and everything else under `src/`.
  **Files this plan may touch:** `src/lib/themes/songoskriti/preview.ts`; NEW `src/lib/themes/songoskriti/page-content.test.ts`; NEW `src/components/store/songoskriti-page-content.test.tsx`; NEW `src/lib/preview-page-data.ts`; NEW `src/components/store/songoskriti-preview-page.test.tsx`; NEW `docs/superpowers/songoskriti-evidence/port/phase1-page-content-escalation.md`; NEW `docs/superpowers/songoskriti-evidence/port/phase1-page-content-evidence.md`; and — **only** through the single named escalation recorded in Task 1 — exactly three existing files: the two existing test files `src/components/builder/songoskriti-port-freeze.test.tsx` and `src/lib/theme-preview-nav.test.ts` (both **updated** to stronger assertions, never weakened), and `src/components/store/ThemePreviewFrame.tsx` (the preview's slot map — the owner-approved third file of the escalation, whose exact scope is Task 1 step 1.4 (g)). No other file under `src/` and no route file is edited.
- **Explicit-path staging only.** Every commit uses `git add <exact paths>`; never `git add -A`, `git add .`, `git commit -a`.
- **Never commit the churn files.** `.artifacts/e2e/playwright-report/index.html`, `ops/routing/canary-weights.conf`, `ops/routing/upstream.conf` — leave them dirty, untouched, unstaged (they are already modified in this working tree; `git status --short` must show them unstaged at every commit).
- **Never commit `.output-snapshots/`** (untracked in this tree; it is what makes a repo-wide `eslint .` stall).
- **The brief and its review are published as plan inputs under `docs/superpowers/plans/`.** The controller decided, after this plan's own verification, to publish the implementation brief (`docs/superpowers/plans/2026-10-20-theme-editable-templates-brief.md`) and its review (`docs/superpowers/plans/2026-10-20-theme-editable-templates-brief-review.md`) beside this plan instead of leaving them as root-level files; all five plan documents — this plan, the Phase-0 audit, the brief, the brief's review and the Task-5/6 evidence document — were committed together in `16f2743d`. **They are inputs, not implementation files**: no task in this plan edits them, and the "never staged" constraint recorded in Tasks 1.6 / 4.9 / 6.13 governs *this plan's own task commits* — the controller's publication is a separate, recorded decision outside them.
- **Never edit an applied migration.** No file under `supabase/migrations/` is read for edit or written; no migration is created or altered by this plan (no schema change is needed — `theme_drafts.templates` and `theme_versions.templates` are `jsonb`).
- **No deploy inside the plan.** The deploy is a separate, explicit step at the end of this document, after the branch merges. No task in the plan runs it and no task's commit depends on it.
- **`bun` is NOT on PATH in this environment.** Use `node_modules/.bin/<tool>` — `node_modules/.bin/vitest`, `node_modules/.bin/tsgo`, `node_modules/.bin/eslint`, `node_modules/.bin/prettier` — and plain `node` for the `scripts/*.mjs` gates. CI uses `bun`; local verification does not. **This constraint does not reach inside a gate script's own child processes:** `scripts/contract-gate.mjs` hardcodes `spawnSync("bunx", …)` (`:302`), so it cannot be made to work locally by invoking it with `node` (see Task 6.8).
- **Three release gates are red on this tree for reasons that predate this plan.** `node scripts/contract-gate.mjs` (exit 2 — `bunx` absent), `node scripts/schema-fingerprint.mjs --check` (exit 1 — needs a live Supabase RPC) and `node scripts/secret-scan.mjs` (exit 1 — 10 findings, 2 of them in a **tracked** file) all fail on a clean checkout of `frame30` at `71271834`. Task 6 states each one as **expected-red-with-reason** and gives the local command that produces the real signal. They are **not** regressions from this change, and this plan does **not** fix them.
- **A repo-wide `eslint .` stalls on the untracked `.output-snapshots/`.** Measured on this tree: `node_modules/.bin/eslint .` produced no output and was still running at a 180 s timeout (exit 124). Lint **specific paths** only.
- **Done prerequisite — the three `// TBD` collection-editorial fixes are already shipped.** They are *not* re-planned here. Verified: the three collection-asset `// TBD` comments recorded at `docs/superpowers/plans/2026-10-19-songoskriti-asset-acceptance-gate.md:591-595` (in `src/lib/themes/songoskriti/archetypes.ts`) are gone — a `TBD` search over `src/` returns only `src/lib/plugin-manifest.ts:1724` (`* TBD` — an aspiration note, not a collection-asset marker), `src/lib/brand-voice.ts:340` (`/\b(lorem ipsum|TODO|TBD|FIXME|placeholder text)\b/i` — a copy-quality regex) and `src/lib/copy-quality.contract.test.ts:149` (`"TBD"` — a fixture list). No step in this plan depends on them. The search command is `rg -n "TBD" src/` — **`rg -n "//\s*TBD" src/` matches nothing** (the three surviving hits are not `//`-prefixed), so do not use the `//`-anchored form to confirm this prerequisite.

---

## Review Focus

The seven failure modes most likely to bite a person on this change, most likely first. Each line names the test that pins it, and that test lives in the task that owns the code it protects.

1. **Two frozen pins go red and the obvious "fix" is to weaken them.** The page composition is pinned by `src/components/builder/songoskriti-port-freeze.test.tsx:106` and by the preview engine's "every template opens with a `heading`" rule at `src/lib/theme-preview-nav.test.ts:142-148`. Both are prohibited existing test files. → Pinned by **Task 3** (the two pins are updated to the *stronger* new expectation) and by the **Task 1** escalation record that names the exact diff before Task 3 runs.
2. **A duplicate `<h1>` on the page route.** `page` is route-h1 (`src/lib/builder-ast.ts:72`), the route renders `<h1>{page.title}</h1>` inside the slot (`src/components/store/PageView.tsx:77`), and `ownsPrimary={custom}` (`:165`) leaves the theme free to elect a primary on path hosts — so any heading-bearing section in the page main doubles the h1. → Pinned by **Task 2**: `primarySectionId(pageAst) === null` and the new "no heading-bearing section" assertion in the theme test, and by the exactly-one-`<h1>` assertion in the new storefront test.
3. **Demo copy still leaks above the merchant's body.** The template merchants inherit is seeded from the theme's own source (`registryPackage` → `resolveThemePreview` → `assemblePreviewTemplates`, `src/lib/themes.server.ts:1154-1174`), so "Size guide" is what a new Songoskriti merchant gets. → Pinned by **Task 2**: the no-demo-string assertion in the new theme test, and the storefront test's "the merchant's body renders / the demo strings do not" assertions.
4. **The preview page goes blank (or fakes a merchant page) and nobody notices.** `page_content` is a context widget (`src/components/builder/widgets.tsx:1617`), so the host must hand it a React node; the preview's only slot source returns `undefined` for every template but `product` (`src/components/store/ThemePreviewFrame.tsx:309`), and `SectionRenderer` renders `null` for an undefined slot outside the editor (`src/components/builder/SectionRenderer.tsx:825-833`) — so the fixed `?template=page` would render chrome around an empty body. The two ways to "fix" that are equally bad: leave it empty, or invent a merchant page that pretends to be real. → Pinned by **Task 4**: the new suite asserts the preview body is **non-empty** and carries the labelled demo fixture, that it leaks no "Size guide" / "How to measure" / "Demo article" copy, and that it renders exactly one `<h1>`; **Task 5** then fetches the live preview route and asserts the same on the running app. The fixture's honesty is the point: demo copy that says it is demo, like "Demo Shopper" and "Sample product".
5. **The route's page furniture vanishes.** The breadcrumb and the "More information" sibling-page nav live only in `PageView`'s fallback (`src/components/store/PageView.tsx:112-151`, `:177-186`), which stops rendering once the theme declares the slot. → The breadcrumb is protected by **Task 2** (the theme's page main declares the `breadcrumb` slot, so the route's breadcrumb survives); the sibling-page nav is pinned as *known* by **Task 5**'s evidence record and escalated through the Decision Gate, because restoring it needs the prohibited `src/components/store/PageView.tsx`.
6. **The fix makes the editor lie to the merchant.** The two `lintTemplate` call sites that compute the editor/workspace lint issues pass no template key (`src/hooks/use-builder-editor.ts:635`, `src/lib/themes.server.ts:284`), so the page template alone reports *"No primary heading on this template."* — and a merchant who "fixes" it by adding a heading produces the second `<h1>` of failure mode 2. → The consequence is **recorded** (Corrections §5), **escalated** through the Task-1 record and the D4 boundary decision (the fix needs two prohibited files), and **guarded** by **Task 2**'s new assertion that the theme's page template contains no heading-bearing section. **That guard is load-bearing, and it is the only thing standing between a merchant who obeys the warning and a second `<h1>` on a path host** — it is the *"contains no heading-bearing section"* case in `src/lib/themes/songoskriti/page-content.test.ts` (with the catalog-flag check in *"elects no primary section"* beside it), and it must not be weakened while the lint-key defect stays unfixed.
7. **The preview's demo source drifts from the production payload.** The preview's page body must mirror what the CMS route actually hands the slot — `{ title, excerpt, html, updated_at }` (`src/components/store/PageView.tsx:73-110`; the record type is `StorePage`, `src/lib/storefront-search.server.ts:257-269`). A fixture that keeps its own shape renders a body the storefront never shows, and the drift is invisible until a merchant compares the two. → Pinned by **Task 4**: the fixture is typed as a `Pick` of the production row (`src/lib/preview-page-data.ts`), so a renamed or dropped field breaks `tsgo --noEmit` (Task 4, step 4.8), and the new suite asserts the fixture's field set is exactly `["excerpt", "html", "title", "updated_at"]` (Task 4, step 4.1, assertion 4).

---

## Decision Gate

These five decisions are the human's, not the engineer's. Each is a **scope boundary**: the plan below is fully executable without any of them, and each decision unblocks a *later* phase. Nothing here blocks Phase 1.

**D1 — Archive semantics: does "Archive" mean the blog taxonomy archives, or a product-side listing archive?**
*Question:* Should Frame30 add an `archive` template key at all, or is the blog taxonomy surface (index / category / tag / author) the whole of "Archive"?
*Evidence that settles it:* `grep -rn 'template="' src/routes/` returns **no** `template="blog"` — the blog template is read by no route; the blog surfaces are served by `BlogArchiveTheme` (`src/components/store/BlogArchiveTheme.tsx:29-33`, `ast={null}`). The route-level taxonomy archives are exactly `src/routes/blog.category.$slug.tsx`, `blog.tag.$slug.tsx`, `blog.author.$slug.tsx`, `blog.index.tsx`. Product categories are a **search facet**, not a route (`src/lib/storefront-search.ts:158-166` puts `category` in the search query); brands resolve to a search query (`src/lib/widget-data.ts:224-225`); product collections already own the `collection` template. So: Option A (no new key — connect the existing blog pack to the `blog` template) needs zero core edits; Option B (a new key) needs edits to `src/lib/builder-ast.ts` (`TEMPLATE_KEYS` `:46-59`, `TEMPLATE_ZONES` `:156`, `ROUTE_H1_TEMPLATES` `:68-75`, the catalogue `templates:` allowlists, the `required` table `:8438-8462`), `src/lib/theme-package.ts:172` (`TEMPLATE_SET`), `src/lib/theme-preview-nav.ts:340` (`GENERIC_TITLES`), `src/lib/widget-weight.ts:205` (`TEMPLATE_JS_BUDGET`), `src/components/builder/BuilderTopBar.tsx:6` (`TEMPLATE_META`), `src/routes/_authenticated/dashboard/builder.tsx:205` (`TEMPLATE_LABEL`) and the hand-written `z.enum` in `src/lib/storefront.functions.ts:97-107` — every one prohibited by §7.
*Unlocks:* Phase 5 of the roadmap, and with it the scope of Phase 2 (blog pack connection).

**D2 — Is the checkout template meant to be themeable?**
*Question:* May a theme author checkout body sections, or is checkout tokens-only by design?
*Evidence that settles it:* The route refuses the theme's AST: `src/routes/store.$slug.checkout.tsx:415-420` — *"the checkout form is hand-built (server-quoted totals, live rails), so the theme contributes the tokens only"*, `ast={null}` (`:420`); the custom-host twin keeps header/footer only (`src/routes/checkout.tsx:276`). Against it: `TEMPLATE_ZONES.checkout` permits a `thank_you` zone (`src/lib/builder-ast.ts:187`), the `checkout` template is a seeded body (`src/lib/themes/songoskriti/preview.ts:283-317`), the editor's per-template label map carries a `checkout` entry (`src/routes/_authenticated/dashboard/builder.tsx:205-214`, `checkout` at `:211`), and a theme package may declare `checkout` (`src/lib/theme-package.ts:172` `TEMPLATE_SET`; `:353-356` the non-empty-subset check).
*Unlocks:* Phase 4 (cart / account / checkout real templates) — and it decides whether the `checkout` key is a surface or documentation.

**D3 — Songoskriti only, or both official themes?**
*Question:* Is the deliverable "Songoskriti is a working end-to-end CMS capability" (9 bodies) or "every official theme ships every template" (18 bodies)?
*Evidence that settles it:* `OFFICIAL_THEME_KEYS = ["songoskriti", "somvabona"]` (`src/lib/themes/builtin-themes.ts:15`, *"this map is the ONLY place that names official themes for identity"*). Somvabona authors **no** non-homepage template — its `preview.ts` has no `case "search"` — so its six secondary surfaces fall through to the engine's generic demo body (`src/lib/theme-preview-nav.ts:357-372`, *"Demo page. The live theme authors this template — what you see here is the engine fallback."*).
*Unlocks:* Phase 2 (real Songoskriti bodies) and its size.

**D4 — Does port spec §7 still govern this Frame30 work?**
*Question:* Is the port's no-core-edits boundary still the rule for Frame30, or is it relaxed for this programme?
*Evidence that settles it:* `docs/superpowers/specs/2026-10-18-songoskriti-unified-port-design.md:150-156` (§7 editable/prohibited lists, *"any required capability missing in core → stop, report, wait for a decision. Never edit silently."*) and `:169` (§9, the frozen-pin escalation procedure). Phase 1 needs exactly **one** narrow exception — three existing files, enumerated in the Task-1 record: two existing test files (updated to stronger assertions) and the preview frame `src/components/store/ThemePreviewFrame.tsx` (the owner-approved third file) — and no core file at all. Phases 2-5 need core and route edits (blog route, search route, checkout route, `builder-ast.ts`, `storefront.functions.ts`) and therefore cannot be planned until this is answered.
*Three further consequences ride on D4, and Phase 1 can only record them:* (a) the `lintTemplate` template-key defect (Corrections §5) needs `src/hooks/use-builder-editor.ts` and `src/lib/themes.server.ts`, both prohibited; (b) the lost sibling-page nav needs `src/components/store/PageView.tsx`, also prohibited; (c) **the empty 15rem gutter that the lost nav leaves behind** — `PageView` still passes `containerClassName="mx-auto grid max-w-5xl gap-8 px-4 py-8 lg:grid-cols-[1fr_15rem]"` (`src/components/store/PageView.tsx:176`), and now that the theme's `themed` AST is non-null the grid has a **single** child, so the `lg:grid-cols-[1fr_15rem]` template still reserves a 15rem column that the "More information" aside used to occupy — an empty gutter at `lg+` where the aside was. **D4's scope therefore covers the container class, not only re-rendering the aside**: restoring the nav means editing `PageView`'s `containerClassName` as well as its fallback, in the same prohibited file. All three are escalated, not fixed. A fourth consequence is *fixed* rather than escalated — but only because the owner approved it: the preview's missing `page_content` source (Corrections §4) needs `src/components/store/ThemePreviewFrame.tsx`, and that edit sits inside the Phase-1 exception.
*Unlocks:* Phases 2, 3, 4 and 5 of the roadmap, and whether the Task-1 exception is a one-off or the first of many.

**D5 — The blog reader is "themeless by design": does that decision stand?**
*Question:* The storefront reader blog was deliberately purged of theming ("theme purge Task 3"). Does Frame30 reverse that decision and let the theme's `blog` template wear the reader?
*Evidence that settles it:* `src/components/store/BlogArchiveTheme.tsx:1-9` — *"Themeless reader blog (theme purge Task 3). Renders the live articles with default chrome — no theme blog template, no preset tokens. … the render stays generic for every key by design — pinned in BlogArchiveTheme.test.tsx."* — and the test that pins it: `src/components/store/BlogArchiveTheme.test.tsx:82` — *"forwards themeKey to ThemeChrome with zero behavioral change (generic by design)"*. `grep -rn 'template="blog"' src/routes/` returns **nothing**: the `blog` template is authored, seeded, previewable, linted — and rendered by no route.
*Unlocks:* Phase 2 (the storefront blog route wearing the theme's `blog` template and the existing `blog_archive` / `blog_terms` / `blog_pager` pack). If the answer is "themeless stays", the `blog` key is documentation, not a surface, and `docs/themes/creation.md:36` must be corrected to match.

---

## Phase Roadmap

The audit's phase order (`docs/superpowers/songoskriti-evidence/port/phase0-implementation-map.md` §8), with the blocked-by decision and the files each phase would touch.

**These phases are not yet planned; each phase gets its own plan after its decision is made.** Phase 1 is the only phase this document plans.

| Phase | What it delivers | Blocked by | Files it would touch |
|---|---|---|---|
| **1 — Page template** *(this plan)* | Songoskriti's `page` template declares the `page_content` slot and ships no demo copy; the CMS page route and the CMS-designated homepage both render the merchant's real body inside the theme layout; the preview's `?template=page` tab renders a labelled demo body instead of an empty one. | — (none) | `src/lib/themes/songoskriti/preview.ts`; NEW test files; NEW `src/lib/preview-page-data.ts`; NEW `docs/**` evidence; three frozen files (escalation) |
| **2 — Blog route wears the theme's `blog` template** | The storefront blog listing and article read the theme's `blog` template through the existing `blog_archive` / `blog_terms` / `blog_pager` pack, with the bespoke grid kept as the fallback. | D5 (themeless-by-design), D4 (boundary) | `src/components/store/BlogArchiveTheme.tsx`; `src/routes/store.$slug.blog.index.tsx`; `src/routes/blog.{index,category.$slug,tag.$slug,author.$slug}.tsx` — all prohibited |
| **3 — Search listing → route-owned context slots** | The live result set is decomposed into per-widget slots (`facet_sidebar`, `filter_chips`, `result_toolbar`, `pagination`, `empty_state` already exist in the catalogue) so a theme can place them. | D4 | `src/routes/store.$slug.search.tsx` — prohibited; new widgets/catalogue entries would need `src/components/builder/widgets.tsx` + `src/lib/builder-ast.ts` — prohibited |
| **4 — Cart, Account, Checkout real templates** | Real theme bodies for cart/account; a ruling on whether checkout may be authored. | D2 (checkout ruling), D3 (scope) | `src/routes/store.$slug.checkout.tsx` — prohibited; `src/lib/themes/songoskriti/preview.ts` — allowed |
| **5 — `archive`** | Option A: the blog pack (delivered by Phase 2) satisfies the requirement, zero new keys. Option B: one atomic new key (union + `z.enum` + storage read + a route that reads it + a default body for both official themes). | D1 (archive semantics), D4 | Option B only: `src/lib/builder-ast.ts`; `src/lib/theme-package.ts`; `src/lib/theme-preview-nav.ts`; `src/lib/widget-weight.ts`; `src/components/builder/BuilderTopBar.tsx`; `src/routes/_authenticated/dashboard/builder.tsx`; `src/lib/storefront.functions.ts`; both themes' seeds — all prohibited |
| **6 — Preview honesty** | The silent `templates[template] ?? templates.index` fallback becomes an explicit unsupported state (`src/components/store/ThemePreviewFrame.tsx:485`); preview data is labelled; the remaining demo providers are added — search results, cart lines/totals, checkout steps, blog articles, archive records, a **second** CMS page fixture and the route-context `breadcrumb` the Phase-1 fixture leaves out. | D4 | `src/components/store/ThemePreviewFrame.tsx`; `src/lib/preview-demo-data.ts` — prohibited; `src/lib/themes/songoskriti/preview.ts` — allowed |
| **7 — Docs, third-party contract, CI lane** | The canonical docs' template list matches `TEMPLATE_KEYS`; the Songoskriti parity lane is wired into CI or an owner-run note is recorded. | D4 | `docs/themes/creation.md`; `docs/packages/contract.md`; `docs/04-builder/theme-runtime.md`; `docs/themes/packages.md`; `package.json`; `.circleci/config.yml` (wiring-only) — allowed |
| **X — Distinctness gate** *(cross-cutting, from `docs/superpowers/plans/2026-10-20-theme-editable-templates-brief-review.md` §7 Phase 1)* | A gate that fails when a theme claims a template but ships the shared default, so "theme-owned but generic" cannot recur. It must fail against today's Songoskriti bodies first — a gate that has never failed proves nothing. | D3 (which themes it covers) | NEW test file + a rule module under `src/lib/themes/songoskriti/**` or `scripts/**` — allowed |

---

## Tasks

### Task 1 — Record the frozen-pin escalation, the preview-frame escalation and the parity finding

**Files:**
- Create: `docs/superpowers/songoskriti-evidence/port/phase1-page-content-escalation.md`
- Read-only references: `src/components/builder/songoskriti-port-freeze.test.tsx`, `src/lib/theme-preview-nav.test.ts`, `src/lib/themes/songoskriti/preview.ts`, `src/components/store/ThemePreviewFrame.tsx`, `src/components/builder/widgets.tsx`, `src/components/store/PageView.tsx`, `docs/superpowers/specs/2026-10-18-songoskriti-unified-port-design.md`

**Interfaces:**
- Consumes: `songoskritiPreviewSource()` (`src/lib/themes/songoskriti/preview.ts:70`), `songoskritiPreviewSource().main(template, s)` (`:83`), `lintTemplate(ast, template?)` (`src/lib/builder-ast.ts:8380`), `routeSuppliesH1(template?)` (`:76-79`), `primarySectionId(ast)` (`:88-106`), `genericDemoMain(template, s)` (`src/lib/theme-preview-nav.ts:357`), `useMockProductSlots` (`src/components/store/ThemePreviewFrame.tsx:256`), `ContextSlot` (`src/components/builder/widgets.tsx:1617`), `StorePage` (`src/lib/storefront-search.server.ts:257`).
- Produces: `docs/superpowers/songoskriti-evidence/port/phase1-page-content-escalation.md` — a document, no code symbols.

- [ ] **1.1** Confirm the two frozen pins and their current expectations, that no third file pins the page composition, and where the preview's `page_content` node would come from:
  ```
  cd /opt/frame28
  grep -n 'page: \[' src/components/builder/songoskriti-port-freeze.test.tsx
  grep -n 'first section' src/lib/theme-preview-nav.test.ts
  grep -n 'Size guide\|How to measure\|Demo article' src/lib/themes/songoskriti/preview.ts
  grep -rn 'page_content' src/ --include=*.test.ts --include=*.test.tsx
  grep -n 'useMockProductSlots\|page_content\|if (!demoProduct) return undefined' src/components/store/ThemePreviewFrame.tsx
  ```
  Expected output, in order: `src/components/builder/songoskriti-port-freeze.test.tsx:106:  page: ["heading", "rich_text"],` · `src/lib/theme-preview-nav.test.ts:142:      expect(ast.main[0]!.type, \`${key} first section\`).toBe(` · `src/lib/themes/songoskriti/preview.ts:209` (`text: "Size guide"`), `:211` (`heading: "How to measure"`), `:213` (`body: "Demo article. …"`) · and the fourth grep lists only `src/components/store/ThemeChrome.route-content.test.tsx` (the content-slot contract suite, which builds synthetic sections and is unaffected) and `src/lib/studio/catalog.test.ts` + `src/lib/studio/catalog-dedup.test.ts` (both of which only *exclude* `page_content` from the studio catalogue). **No other test pins the theme's page composition** — the two files named above are the whole *pin* surface. The fifth grep is the **third** escalated file: `src/components/store/ThemePreviewFrame.tsx:256` (the definition of `useMockProductSlots`), `:535` (its only call site), `:309` (`if (!demoProduct) return undefined;` — the early return that leaves the slot map `undefined` for every template but `product`) and `:415` (`page_content: pageContent,` — the one `page_content` key the preview ever builds, and only on the product template).

- [ ] **1.2** Confirm the demo copy that will be removed, with its exact lines:
  ```
  sed -n '205,220p' src/lib/themes/songoskriti/preview.ts
  ```
  Expected output: the `case "page":` branch returning `s("heading", { text: "Size guide", text_bn: "সাইজ গাইড" })` and `s("rich_text", { heading: "How to measure", …, body: "Demo article. Chest, waist and length guidance for panjabis, kurtas and saree blouses.", … })`.

- [ ] **1.3** Confirm the frozen-pin procedure that applies (port spec §9) and the boundary it sits under:
  ```
  sed -n '150,157p' docs/superpowers/specs/2026-10-18-songoskriti-unified-port-design.md
  sed -n '166,171p' docs/superpowers/specs/2026-10-18-songoskriti-unified-port-design.md
  ```
  Expected output: §7's editable/prohibited lists ending in *"and everything else under `src/`."* + *"Escalation: any required capability missing in core → stop, report, wait for a decision. Never edit silently."*; and §9's *"Existing suites and snapshots stay frozen: a change that alters existing pinned output is a parity finding first; if genuinely required, escalate with the exact diff and rationale before any update (named and called out, never blind `-u`)."*

- [ ] **1.4** Write the escalation record to `docs/superpowers/songoskriti-evidence/port/phase1-page-content-escalation.md`. It must contain, in this order: (a) the finding — *"the theme's `page` template must declare the `page_content` slot, so its current composition `["heading", "rich_text"]` is stale"*; (b) the **exact old → new diff** for each of the two files, quoted as unified diff hunks:
  - `src/components/builder/songoskriti-port-freeze.test.tsx:106` — `-  page: ["heading", "rich_text"],` / `+  page: ["breadcrumb", "page_content"],`
  - `src/lib/theme-preview-nav.test.ts:142-148` — the ternary default replaced by an explicit per-template opener map (`index: "hero_carousel"`, `product: "heading"`, `collection: "category_header"`, `account: "heading"`, `page: "breadcrumb"`, `blog: "heading"`, `cart: "heading"`, `checkout: "heading"`, `search: "heading"`), so the assertion stays total and pins **every** template's opener instead of defaulting six of them to `"heading"`;
  (c) the rationale — *"the old expectation is the bug: it pins a body that carries demo copy and no `page_content` slot, which is what makes `ThemeChrome` skip the theme's layout (`src/components/store/ThemeChrome.tsx:302-310`) and lets the CMS-designated homepage render the theme's demo copy instead of the merchant's body (`src/components/store/StoreHomepage.tsx:101-123`). The new expectation is strictly stronger: it pins the content slot, the breadcrumb slot, and the exact ordered composition."*;
  (d) the **parity impact** — *"6 `page` reference stills and 6 machine baselines (`<template>-<width>-<locale>-chromium-linux.png`) under `docs/superpowers/songoskriti-evidence/port/reference/` and `.e2e/songoskriti-port-parity.spec.ts-snapshots/` become stale. Each of those two directories holds **59** files — 54 template stills (9 templates × 6 widths/locales) + 2 index-variation stills (`index-minimal-1440-en.png`, `index-festive-1440-en.png`) + 2 chrome mega-menu stills + 1 chrome mobile-drawer still — so the other **53** files in each directory are unaffected, because only the `page` template's body changes. `reference-manifest.json` holds **60** capture entries (the 59 above plus one `manual-review` entry, `chrome-mobile-drawer-375-bn.png`, that has no baseline file on disk), and re-freezing `reference/` rewrites all 60 entries — a separate owner-approved step, not part of this plan's commits. The parity suite is owner-run only (it is in neither `e2e:critical` nor `e2e:security`, `package.json`), so a stale baseline does not break CI."*;
  (e) the **boundary statement** — *"this record escalates exactly **three** existing files: the two existing test files named above and `src/components/store/ThemePreviewFrame.tsx`; no prohibited core file, no route file and no snapshot file is touched."*;
  (f) the **lint-key consequence** (Corrections §5 of this plan) — *"the change leaves the page template with no h1-claiming widget, which is correct for a route-h1 template, but both live `lintTemplate` call sites pass no template key (`src/hooks/use-builder-editor.ts:635`, `src/lib/themes.server.ts:284`), so the route-h1 exemption is not applied and the builder reports `'No primary heading on this template.'` for the `page` template alone. A merchant who adds a heading in response produces a second `<h1>` on a path host. The fix is to pass the template key to `lintTemplate` in both call sites; both files are prohibited by port spec §7, so this plan records and escalates the defect rather than fixing it. Recorded for the D4 boundary decision."*;
  (g) the **third file — `src/components/store/ThemePreviewFrame.tsx`** — quoted as a unified diff hunk, with the reason and the scope:
  - *reason* — *"`page_content` is a CONTEXT widget (`src/components/builder/widgets.tsx:1617`), so the host must hand it a React node; `SectionRenderer` renders `null` for a context widget whose slot is `undefined` outside the editor (`src/components/builder/SectionRenderer.tsx:825-833`). The preview's only slot source is `useMockProductSlots` (`src/components/store/ThemePreviewFrame.tsx:256`), and it returns `undefined` for every template but `product` (`:309`) — its one `page_content` key (`:415`) exists only on the product template. So the moment the theme's `page` main declares `page_content`, the preview's `?template=page` renders the theme's chrome around an **empty body**: the demo copy is gone and no merchant page is in its place. Leaving that would trade a correctness win for a merchant-visible blank page in the theme preview."*;
  - *scope* — *"the change is exactly: (1) one new import of the NEW fixture `src/lib/preview-page-data.ts`; (2) one new `pageSlots` memo beside the existing `accountSlots` / `cartSlots` memos, which returns `{ page_content: <article>…</article> }` when `template === "page"` and `undefined` otherwise; (3) `...pageSlots` added to the three `contextSlots` spreads (`:664-668`, `:689-693`, `:715-719`). Nothing else in the file changes: the `?? templates.index` fallback (`:485`), the click/submit interception, the skin sheets, the demo focus, `useMockProductSlots`, `accountSlots`, `cartSlots` and `previewDemoMap` are all untouched, and no assertion in the file is skipped, weakened or deleted. The fixture's copy is DEMO copy and is labelled as such — it never pretends to be a real merchant page."*;
  - *approval* — *"this third file is inside the **owner's approved escalation**: the owner has ruled that the preview's `?template=page` tab must keep showing content after the fix instead of chrome with an empty body, and has named `src/components/store/ThemePreviewFrame.tsx` as the file that carries the change."*;
  Do **not** record any change to `src/components/builder/__snapshots__/songoskriti-snapshots.test.tsx.snap` — the page template's markup is not in it (that snapshot pins the homepage and chrome renderers only).

- [ ] **1.5** Verify every `file:line` cited in the record resolves, by grepping each cited symbol out of the tree:
  ```
  grep -n 'export function lintTemplate' src/lib/builder-ast.ts
  grep -n 'export function routeSuppliesH1' src/lib/builder-ast.ts
  grep -n 'export function primarySectionId' src/lib/builder-ast.ts
  grep -n 'export function genericDemoMain' src/lib/theme-preview-nav.ts
  grep -n 'const themed =' src/components/store/ThemeChrome.tsx
  grep -n 'ownsPrimary={custom}' src/components/store/PageView.tsx
  grep -n 'contentSlot="page_content"' src/components/store/PageView.tsx
  grep -n 'page_content: ContextSlot' src/components/builder/widgets.tsx
  grep -n 'export type StorePage' src/lib/storefront-search.server.ts
  grep -n 'if (!demoProduct) return undefined' src/components/store/ThemePreviewFrame.tsx
  ```
  Expected output: one match per line, at `src/lib/builder-ast.ts:8380`, `:77`, `:88`; `src/lib/theme-preview-nav.ts:357`; `src/components/store/ThemeChrome.tsx:302`; `src/components/store/PageView.tsx:165`; `src/components/store/PageView.tsx:166`; `src/components/builder/widgets.tsx:1617`; `src/lib/storefront-search.server.ts:257`; `src/components/store/ThemePreviewFrame.tsx:309`.

- [ ] **1.6** Confirm the working tree is clean of anything this plan would sweep in, and that the three churn files are unstaged:
  ```
  git status --short
  ```
  Expected output — eight lines, in this order: ` M .artifacts/e2e/playwright-report/index.html`, ` M ops/routing/canary-weights.conf`, ` M ops/routing/upstream.conf`, `?? .output-snapshots/`, `?? docs/superpowers/plans/2026-10-20-theme-editable-templates.md` (this plan, untracked), `?? docs/superpowers/songoskriti-evidence/port/phase0-implementation-map.md` (the Phase-0 audit this plan implements, untracked), `?? docs/superpowers/plans/2026-10-20-theme-editable-templates-brief.md` (the brief, untracked), `?? docs/superpowers/plans/2026-10-20-theme-editable-templates-brief-review.md` (the brief's review, untracked). **No** `git add` of any of those. The three churn files and the untracked snapshot directory stay unstaged for the whole plan; the four untracked documents (this plan, the audit, the brief, the brief's review) are inputs and are never staged either — only the files this plan creates or edits are.

  > **Post-verification (controller).** The brief and the brief's review were untracked files at the repo root when this step ran; the controller later published them under `docs/superpowers/plans/` — the paths named above — and committed all five plan documents in `16f2743d`. The four inputs are tracked documents now; this plan's own task commits never staged them. See the Global Constraints note on the published inputs.

- [ ] **1.7** Commit the record on its own, with an explicit path:
  ```
  git add docs/superpowers/songoskriti-evidence/port/phase1-page-content-escalation.md
  git commit -m "docs(songoskriti): record the page-template escalation (frozen pins + preview frame)"
  ```
  Expected output: a commit touching **one** file. `git status --short` afterwards still shows the three churn files, `.output-snapshots/` and the four untracked documents, all unstaged.

---

### Task 2 — The theme's `page` template declares the route's content slot

**Files:**
- Create: `src/lib/themes/songoskriti/page-content.test.ts`
- Create: `src/components/store/songoskriti-page-content.test.tsx`
- Modify: `src/lib/themes/songoskriti/preview.ts` (the `case "page":` branch, `:207-217`)

**Interfaces:**
- Consumes: `songoskritiPreviewSource()` (`src/lib/themes/songoskriti/preview.ts:70`), `songoskritiPreviewSource().main(template, s)` (`:83`), `SectionBuilder` (`src/lib/builder-ast.ts:507`), `ThemeAst` (`:512`), `Section` (`:206`-region), `lintTemplate(ast, template?)` (`:8380`), `primarySectionId(ast)` (`:88`), `routeSuppliesH1(template?)` (`:77`), `genericDemoMain(template, s)` (`src/lib/theme-preview-nav.ts:357`), `ThemeChrome` (`src/components/store/ThemeChrome.tsx`), `withSongoskritiDefaults` / `withSongoskritiVariation` (applied internally by `main`, `preview.ts:89`).
- Produces: `songoskritiPreviewSource().main("page", s)` now returns `[Section]` whose types are exactly `["breadcrumb", "page_content"]`; the theme's page template carries no `heading`, `rich_text`, no demo string, and no heading-bearing section.

- [ ] **2.1** Write the failing theme-level test to `src/lib/themes/songoskriti/page-content.test.ts`. It must import `describe/expect/it` from `vitest`, `lintTemplate`, `primarySectionId`, `routeSuppliesH1`, `type SectionBuilder` from `../../builder-ast`, `genericDemoMain` from `../../theme-preview-nav`, and `songoskritiPreviewSource` from `./preview`. It builds the page AST the way the engine does — a plain builder (`(type, props = {}) => ({ id: \`${type}-${n++}\`, type, props: { ...props } })`) passed to `songoskritiPreviewSource().main("page", s)`, because the theme's own `withSongoskritiDefaults`/`withSongoskritiVariation` wrap happens inside `main` (`preview.ts:89`) — and asserts, in seven `it` blocks:
  1. `expect(types).toEqual(["breadcrumb", "page_content"])` — the **exact ordered composition**, not a containment check. This one assertion carries all three facts the plan needs: the content slot is present exactly once, the breadcrumb slot is present, and the content slot is second (so the breadcrumb opens the body and the route's furniture survives);
  2. the serialised props of the page main contain none of `"Size guide"`, `"How to measure"`, `"Demo article"`;
  3. `expect(lintTemplate(ast, "page")).toEqual([])` — zero issues at every level, with the template key **passed** (see Corrections §5: the key is what enables the route-h1 exemption, and this plan's contract is the keyed one);
  4. `expect(routeSuppliesH1("page")).toBe(true)` **and** `expect(primarySectionId(ast)).toBeNull()` — the route owns the h1, so the template must elect no primary section;
  5. `expect(types[0]).toBe("breadcrumb")` — the theme test and the preview-nav opener map (`FIRST_SECTION.page = "breadcrumb"`, Task 3.5) cannot drift apart: one pins the composition, the other pins the opener, and this one ties the two to the same first section;
  6. `expect(types).not.toEqual(genericDemoMain("page", s).map((x) => x.type))` — the template is no longer structurally the engine's generic demo body;
  7. the page main contains **no heading-bearing section**: `expect(ast.main.filter((x) => x.type === "heading" || (typeof x.props["heading"] === "string" && x.props["heading"] !== "")).map((x) => x.type)).toEqual([])` — the guard for the second-`<h1>` path. `primarySectionId(ast) === null` alone is not enough: a `heading` section with an **empty** `text` would not be elected, yet a merchant editing that template can type into it and be elected on the next render.

- [ ] **2.2** Write the failing storefront-level test to `src/components/store/songoskriti-page-content.test.tsx`. It must mock `@tanstack/react-router` with `useRouterState: () => ({ location: { pathname: "/store/acme/pages/about" } })` and a `Link` that renders an `<a>` (the same mock shape as `src/components/store/ThemeChrome.route-content.test.tsx:18-41`), then import `ThemeChrome` from `./ThemeChrome` and `songoskritiPreviewSource` from `@/lib/themes/songoskriti/preview`, build the theme's real page AST as `{ header: [], main, footer: [] }` with the same plain builder the engine uses (`assemblePreviewTemplates`, `src/lib/theme-preview-nav.ts:384-391`), and render it with `renderToStaticMarkup` (as `src/components/store/ThemeChrome.route-content.test.tsx:58-77` does), passing `tokens: null`, `merchantId: null`, `siteKit: null`. Two cases:
  - **the CMS page route** — `ThemeChrome` with `template="page"`, `ast` = the theme's page AST, `contentSlot="page_content"`, `ownsPrimary={false}` (the path-host shape, `PageView.tsx:165`), `contextSlots={{ breadcrumb: <nav>BREADCRUMB-MARKER</nav>, page_content: <article><h1>Merchant Title</h1><p>MERCHANT-BODY-MARKER</p></article> }}` and `fallback={<div>ROUTE-FALLBACK-MARKER</div>}`; assertions **in this order**: the markup contains `MERCHANT-BODY-MARKER`, contains `BREADCRUMB-MARKER`, does **not** contain `ROUTE-FALLBACK-MARKER`, contains exactly one `<h1` (count the occurrences of the literal `<h1`), and contains none of `"Size guide"`, `"How to measure"`, `"Demo article"`;
  - **the CMS-designated homepage** — `ThemeChrome` with `template="page"`, the same `ast`, **no** `contentSlot` prop (the `StoreHomepage` shape, `StoreHomepage.tsx:101-123`), `ownsPrimary`, `contextSlots={{ page_content: <article><h1>Merchant Title</h1><p>MERCHANT-HOMEPAGE-MARKER</p></article> }}`, `fallback={<div>ROUTE-FALLBACK-MARKER</div>}`; assertions: the markup contains `MERCHANT-HOMEPAGE-MARKER`, contains exactly one `<h1`, and contains none of `"Size guide"`, `"How to measure"`, `"Demo article"`.

- [ ] **2.3** Run the theme-level test and confirm the expected failure:
  ```
  node_modules/.bin/vitest run src/lib/themes/songoskriti/page-content.test.ts
  ```
  Expected output: `Test Files  1 failed (1)` / `Tests  7 failed (7)`, with the seven failures being: `expected [ 'heading', 'rich_text' ] to deeply equal [ 'breadcrumb', 'page_content' ]`; the demo-string assertion failing on `"Size guide"`; the lint assertion failing with `expected [ { level: 'warn', sectionId: null, message: 'Page template has no page content widget.' } ] to deeply equal []`; `expected 'heading-0' to be null`; `expected 'heading' to be 'breadcrumb'`; the generic-body equality failing with `expected [ 'heading', 'rich_text' ] to not deeply equal [ 'heading', 'rich_text' ]`; and the heading-bearing guard failing with `expected [ 'heading', 'rich_text' ] to deeply equal []`.

- [ ] **2.4** Run the storefront-level test and confirm the expected failure:
  ```
  node_modules/.bin/vitest run src/components/store/songoskriti-page-content.test.tsx
  ```
  Expected output: `Test Files  1 failed (1)` / `Tests  2 failed (2)`. The **page-route** case fails on its *first* assertion — `expect(markup).toContain("MERCHANT-BODY-MARKER")` — because today the theme's main declares no `page_content` section, so `ThemeChrome` bypasses the theme layout and renders the route's `fallback` instead of the theme body: the merchant's body is absent and `ROUTE-FALLBACK-MARKER` is present. The reported error is an `AssertionError` whose message follows Vitest's own `toContain` template — `expected #{this} to contain #{exp}` (`node_modules/@vitest/expect/dist/index.js:1313`), i.e. **the received markup first, the expected marker second**: `expected '<received markup>' to contain 'MERCHANT-BODY-MARKER'`. The received side is the whole rendered string, **truncated by Vitest** (chai's `truncateThreshold: 40`, `node_modules/chai/index.js:850`), so on this tree the message reads `expected '<div class="fq-theme-scope min-h-scre…' to contain 'MERCHANT-BODY-MARKER'` — the `…` is Vitest's ellipsis, not part of the markup. (The `not.toContain("ROUTE-FALLBACK-MARKER")` assertion would fail too — `expected '<div class="fq-theme-scope min-h-scre…' not to contain 'ROUTE-FALLBACK-MARKER'` — but it is the *third* assertion, so the first failure reported is the merchant-body one.) The **homepage** case fails on `expected '<div class="fq-theme-scope min-h-scre…' to contain 'MERCHANT-HOMEPAGE-MARKER'` and on the demo-copy assertion (`expected '<div class="fq-theme-scope min-h-scre…' not to contain 'Size guide'` — `Size guide` is in the markup today).

- [ ] **2.5** Implement the fix in `src/lib/themes/songoskriti/preview.ts`: replace the whole `case "page":` branch (`:207-217`) with a body that returns exactly two sections and no demo copy —
  ```ts
        case "page":
          // The route owns the body: `page_content` is the shared slot the
          // CMS page route and the CMS-designated homepage flow their real
          // content through (`PageView.tsx:166,175`; `StoreHomepage.tsx:120`).
          // `page` is a route-h1 template (`ROUTE_H1_TEMPLATES`), so the route
          // owns the <h1> too — this template elects no primary section, and
          // declares no demo copy of its own.
          return [
            s("breadcrumb", { homeLabel: "Home" }),
            s("page_content", {}),
          ];
  ```
  The array above is **already in the exact form prettier produces** at this indentation, so step 2.9's check passes on the snippet as written — do not reformat it. Measured on this tree (no prettier config in the repo, so prettier's defaults apply: `printWidth: 80`): in the real file the `case` line sits at column 9 and the `return` at column 11 (0-based 8 and 10), so the collapsed one-liner `return [s("breadcrumb", { homeLabel: "Home" }), s("page_content", {})];` would be **81** columns — one over the limit — and prettier therefore keeps the array **expanded** into the three lines shown. (At one column less the same call is 80 columns and prettier *would* collapse it, which is why a snippet checked outside this file's nesting can look deceptively different; the file's own nesting is what counts, and the `--write` fallback in step 2.9 fixes the block either way.) Verify it yourself before committing:
  ```
  node_modules/.bin/prettier --check src/lib/themes/songoskriti/preview.ts
  ```
  Use the file's own conventions: the `s(...)` helper for sections (as the product template does at `:181`), and no `rail(...)` — a rail carries a `heading` prop and would therefore be elected as the page's primary heading, producing a second `<h1>` next to the route's `<h1>{page.title}</h1>` on path hosts. Do not touch any other `case` branch, the `rail` helper, or the `main` wrapper at `:83-90`.

- [ ] **2.6** Run the theme-level test and confirm it passes:
  ```
  node_modules/.bin/vitest run src/lib/themes/songoskriti/page-content.test.ts
  ```
  Expected output: `Test Files  1 passed (1)` / `Tests  7 passed (7)`.

- [ ] **2.7** Run the storefront-level test and confirm it passes:
  ```
  node_modules/.bin/vitest run src/components/store/songoskriti-page-content.test.tsx
  ```
  Expected output: `Test Files  1 passed (1)` / `Tests  2 passed (2)`.

- [ ] **2.8** Run the affected neighbouring suites and confirm they are green:
  ```
  node_modules/.bin/vitest run src/lib/themes/songoskriti/preview.test.ts src/lib/themes/songoskriti/wiring.test.ts src/lib/themes/songoskriti/skins.test.ts src/lib/themes/songoskriti/widgets.test.ts src/components/store/ThemeChrome.route-content.test.tsx src/components/store/ThemePreviewFrame.test.tsx src/components/store/PageView.twin-wiring.test.tsx src/lib/definition-of-done.test.ts
  ```
  Expected output: `Test Files  8 passed (8)` / `Tests  118 passed (118)` — `preview.test.ts` 3, `wiring.test.ts` 7, `skins.test.ts` 20, `widgets.test.ts` 18, `ThemeChrome.route-content.test.tsx` 3, `ThemePreviewFrame.test.tsx` 53, `PageView.twin-wiring.test.tsx` 3, `definition-of-done.test.ts` 11. **Every** file must be green. Then:
  ```
  node_modules/.bin/vitest run src/components/builder/songoskriti-port-freeze.test.tsx src/lib/theme-preview-nav.test.ts
  ```
  Expected output: `Test Files  2 failed (2)`; the freeze suite fails on `page template main zone is frozen` with `expected [ 'breadcrumb', 'page_content' ] to deeply equal [ 'heading', 'rich_text' ]`, and the preview-nav suite fails on `page first section` with `expected 'breadcrumb' to be 'heading'`. **Both failures are the stale pins and are fixed in Task 3** — no other failure is acceptable.

- [ ] **2.9** Check formatting on the touched files:
  ```
  node_modules/.bin/prettier --check src/lib/themes/songoskriti/preview.ts src/lib/themes/songoskriti/page-content.test.ts src/components/store/songoskriti-page-content.test.tsx
  ```
  Expected output: `All matched files use Prettier code style!` and exit 0. This is the expected output **on the first run**: the `preview.ts` snippet in step 2.5 is written in the exact form prettier produces at that file's indentation (verified above), so the only files that can report a diff are the two **new** test files, whose prose formatting is the implementer's own. (If the check reports a diff, run `node_modules/.bin/prettier --write` on those three paths only and re-run the check; the fallback is for the two new test files, never for re-shaping the pinned snippet — and re-running the check afterwards must again print `All matched files use Prettier code style!`.)

- [ ] **2.10** Lint the touched files — **specific paths only**, never `eslint .`:
  ```
  node_modules/.bin/eslint src/lib/themes/songoskriti/preview.ts src/lib/themes/songoskriti/page-content.test.ts src/components/store/songoskriti-page-content.test.tsx
  ```
  Expected output: no output, exit code 0.

- [ ] **2.11** Typecheck **before** staging, so a type error in a new test file can never land in a commit:
  ```
  node_modules/.bin/tsgo --noEmit
  ```
  Expected output: no output, exit 0. (Typecheck also runs in Task 6.3, but that is after the commits; this step is the pre-commit gate.)

- [ ] **2.12** Stage exactly the three paths and commit:
  ```
  git add src/lib/themes/songoskriti/preview.ts src/lib/themes/songoskriti/page-content.test.ts src/components/store/songoskriti-page-content.test.tsx
  git status --short
  ```
  Expected output: the three paths staged (`M  src/lib/themes/songoskriti/preview.ts`, `A  src/lib/themes/songoskriti/page-content.test.ts`, `A  src/components/store/songoskriti-page-content.test.tsx`) and the three churn files + `.output-snapshots/` + the four untracked documents still **unstaged** (` M` / `??`) — exactly the same eight lines step 1.6 listed, none of them staged.

- [ ] **2.13** Commit:
  ```
  git commit -m "fix(songoskriti): give the page template the route's content slot"
  ```
  Expected output: a commit touching exactly three files; `git show --stat --oneline HEAD` lists `preview.ts` plus the two new test files.

---

### Task 3 — Move the two frozen pins to the new composition

**Files:**
- Modify: `src/components/builder/songoskriti-port-freeze.test.tsx` (the `TEMPLATE_MAIN.page` literal at `:106`)
- Modify: `src/lib/theme-preview-nav.test.ts` (the first-section assertion at `:142-148`)
- Reference (unchanged): `docs/superpowers/songoskriti-evidence/port/phase1-page-content-escalation.md` (the Task-1 escalation that authorises this task)

**Interfaces:**
- Consumes: `songoskritiPreviewSource()` (`src/lib/themes/songoskriti/preview.ts:70`), `songoskritiPreviewSource().main(template, s)` (`:83`), `TEMPLATE_KEYS` (`src/lib/builder-ast.ts:46-59`), `TemplateKey` (`:60`), `resolveThemePreview(key)` (`src/lib/theme-preview-nav.ts:414`).
- Produces: `TEMPLATE_MAIN.page` = `["breadcrumb", "page_content"]`; a per-template opener map in `src/lib/theme-preview-nav.test.ts` that pins the first section of **every** template.

- [ ] **3.1** Confirm the Task-1 escalation is committed before touching either pin:
  ```
  git log --oneline -1 -- docs/superpowers/songoskriti-evidence/port/phase1-page-content-escalation.md
  ```
  Expected output: `docs(songoskriti): record the page-template escalation (frozen pins + preview frame)`. If this prints nothing, **stop** — Task 1 has not landed and port spec §9 forbids the update.

- [ ] **3.2** Reproduce the stale-pin failure in the freeze suite:
  ```
  node_modules/.bin/vitest run src/components/builder/songoskriti-port-freeze.test.tsx
  ```
  Expected output: `Test Files  1 failed (1)` / `Tests  1 failed (20)`; the failing case is `page template main zone is frozen` with `expected [ 'breadcrumb', 'page_content' ] to deeply equal [ 'heading', 'rich_text' ]`. The other 20 cases pass — the failure is the pin, not the theme.

- [ ] **3.3** Reproduce the stale-pin failure in the preview-nav suite:
  ```
  node_modules/.bin/vitest run src/lib/theme-preview-nav.test.ts
  ```
  Expected output: `Test Files  1 failed (1)` / `Tests  1 failed | 42 passed (43)`; the failing assertion is the `page first section` case with `expected 'breadcrumb' to be 'heading'`.

- [ ] **3.4** Update the freeze pin — one line, `src/components/builder/songoskriti-port-freeze.test.tsx:106`:
  ```
  -  page: ["heading", "rich_text"],
  +  page: ["breadcrumb", "page_content"],
  ```
  The assertion itself (`:159`, `expect(main.map((x: Section) => x.type)).toEqual(TEMPLATE_MAIN[key])`) is **not** touched: it still pins the exact ordered composition of the page template. The old expectation is replaced, not deleted, and the replacement is strictly stronger — it names the route's content slot.

- [ ] **3.5** Update the preview-nav first-section expectation — `src/lib/theme-preview-nav.test.ts:142-148`. Replace the inline ternary with an explicit map declared immediately above the `it` block, and assert against it:
  ```ts
  const FIRST_SECTION: Record<TemplateKey, string> = {
    index: "hero_carousel",
    product: "heading",
    collection: "category_header",
    account: "heading",
    page: "breadcrumb",
    blog: "heading",
    cart: "heading",
    checkout: "heading",
    search: "heading",
  };
  ```
  and inside the loop:
  ```ts
  expect(ast.main[0]!.type, `${key} first section`).toBe(FIRST_SECTION[key]);
  ```
  This is a strengthening, not a loosening: today six of the nine templates fall through a default branch to the literal `"heading"`; after the change every template's opener is pinned explicitly, including `page` → `"breadcrumb"`. The map's `page` entry and the theme test's `expect(types[0]).toBe("breadcrumb")` (Task 2.1, assertion 5) are the same fact pinned from two sides, so the opener map and the composition cannot drift apart. `TemplateKey` is **not** currently imported in that file — the import at `src/lib/theme-preview-nav.test.ts:5` is `import { flattenSections } from "./builder-ast";` — so change it to `import { flattenSections, type TemplateKey } from "./builder-ast";` (one added type import, no assertion removed).

- [ ] **3.6** Run the freeze suite and confirm it passes:
  ```
  node_modules/.bin/vitest run src/components/builder/songoskriti-port-freeze.test.tsx
  ```
  Expected output: `Test Files  1 passed (1)` / `Tests  21 passed (21)`.

- [ ] **3.7** Run the preview-nav suite and confirm it passes:
  ```
  node_modules/.bin/vitest run src/lib/theme-preview-nav.test.ts
  ```
  Expected output: `Test Files  1 passed (1)` / `Tests  43 passed (43)`.

- [ ] **3.8** Run the whole neighbourhood again, including the two new Phase-1 suites and every suite Task 2.8 ran:
  ```
  node_modules/.bin/vitest run src/components/builder/songoskriti-port-freeze.test.tsx src/lib/theme-preview-nav.test.ts src/lib/themes/songoskriti/preview.test.ts src/lib/themes/songoskriti/wiring.test.ts src/lib/themes/songoskriti/skins.test.ts src/lib/themes/songoskriti/widgets.test.ts src/lib/themes/songoskriti/page-content.test.ts src/components/store/songoskriti-page-content.test.tsx src/components/store/ThemeChrome.route-content.test.tsx src/components/store/ThemePreviewFrame.test.tsx src/components/store/PageView.twin-wiring.test.tsx src/lib/definition-of-done.test.ts
  ```
  Expected output: `Test Files  12 passed (12)` / `Tests  191 passed (191)` — freeze 21, preview-nav 43, `preview.test.ts` 3, `wiring.test.ts` 7, `skins.test.ts` 20, `widgets.test.ts` 18, the two new Phase-1 suites 7 + 2, `ThemeChrome.route-content.test.tsx` 3, `ThemePreviewFrame.test.tsx` 53, `PageView.twin-wiring.test.tsx` 3, `definition-of-done.test.ts` 11 — and **zero** failures.

- [ ] **3.9** Check formatting and lint on the two touched files:
  ```
  node_modules/.bin/prettier --check src/components/builder/songoskriti-port-freeze.test.tsx src/lib/theme-preview-nav.test.ts
  node_modules/.bin/eslint src/components/builder/songoskriti-port-freeze.test.tsx src/lib/theme-preview-nav.test.ts
  ```
  Expected output: `All matched files use Prettier code style!` and no eslint output, exit 0.

- [ ] **3.10** Typecheck **before** committing:
  ```
  node_modules/.bin/tsgo --noEmit
  ```
  Expected output: no output, exit 0.

- [ ] **3.11** Stage exactly the two paths and commit:
  ```
  git add src/components/builder/songoskriti-port-freeze.test.tsx src/lib/theme-preview-nav.test.ts
  git commit -m "test(songoskriti): move the page composition pins to the content-slot body"
  ```
  Expected output: a commit touching exactly two files; `git show --stat --oneline HEAD` lists only those two.

---

### Task 4 — Give the theme preview a page-content source

**Files:**
- Create: `src/lib/preview-page-data.ts`
- Create: `src/components/store/songoskriti-preview-page.test.tsx`
- Modify (**escalated**, Task 1 step 1.4 (g)): `src/components/store/ThemePreviewFrame.tsx` (one import, one `pageSlots` memo, three `contextSlots` spreads)

**Interfaces:**
- Consumes: `ContextSlot` (`src/components/builder/widgets.tsx:1617`) — `page_content` is a context widget, so the slot value is a React node; the `page_content` catalogue entry (`src/lib/builder-ast.ts:1591-1600`, `templates: ["page","blog"]`); `SectionRenderer`'s context-slot gate (`src/components/builder/SectionRenderer.tsx:825-833`) — an `undefined` slot renders `null` outside the editor; `useMockProductSlots` (`src/components/store/ThemePreviewFrame.tsx:256-417`, early return at `:309`) and its single call site (`:535`); the production payload — `PageView`'s `content` node (`src/components/store/PageView.tsx:73-110`) over the `StorePage` row (`src/lib/storefront-search.server.ts:257-269`); `songoskritiPreviewSource()` (`src/lib/themes/songoskriti/preview.ts:70`).
- Produces: `PREVIEW_DEMO_PAGE` — the demo page payload (`src/lib/preview-page-data.ts`); a `pageSlots` map in `ThemePreviewFrame` that supplies `contextSlots.page_content` for the `page` template and `undefined` for every other template.

- [ ] **4.1** Write the failing test to `src/components/store/songoskriti-preview-page.test.tsx`. It must:
  - mock `@tanstack/react-router` with `useNavigate` (the frame calls it, `src/components/store/ThemePreviewFrame.tsx:477`), `useRouterState` and `Link` — the same shape as `src/components/store/ThemeChrome.route-content.test.tsx:18-41`, plus `useNavigate` as `src/components/store/ThemePreviewFrame.test.tsx:15-18` has it;
  - mock `@/components/store/StoreHeader` with the minimal stub `src/components/store/ThemePreviewFrame.test.tsx:24-36` uses — the real header needs a live router and a cart provider;
  - build the theme's **real** page AST with the plain builder `(type, props = {}) => ({ id: \`${type}-${n++}\`, type, props: { ...props } })` passed to `songoskritiPreviewSource().main("page", s)` — the same builder Task 2's theme test uses, because `withSongoskritiDefaults` / `withSongoskritiVariation` wrap happens inside `main` (`src/lib/themes/songoskriti/preview.ts:89`);
  - render it with `renderToStaticMarkup` and `initialTemplate="page"`, `templates.page` = that AST and every other template empty (so the `templates[template] ?? templates.index` fallback, `src/components/store/ThemePreviewFrame.tsx:485`, cannot paper over an empty body);
  - assert, in four `it` blocks:
    1. **the body is non-empty** — `expect(html).toContain("<article")`, `expect(html).toContain("</article>")` and `expect(html).toContain("Demo page body.")`;
    2. **exactly one `<h1>`** — `expect(html.match(/<h1/g)?.length ?? 0).toBe(1)`: the route owns the `<h1>` (`src/components/store/PageView.tsx:77-79`), so the preview body carries the demo title and nothing else does;
    3. **no demo copy leaks** — `expect(html).not.toContain("Size guide")`, `not.toContain("How to measure")`, `not.toContain("Demo article")`;
    4. **the payload shape mirrors production** — a dynamic `await import("@/lib/preview-page-data")` **inside** the test body (so the module not existing yet fails this one case, not the whole file) followed by `expect(Object.keys(PREVIEW_DEMO_PAGE).sort()).toEqual(["excerpt", "html", "title", "updated_at"])`.

- [ ] **4.2** Run the test and confirm the expected failure:
  ```
  node_modules/.bin/vitest run src/components/store/songoskriti-preview-page.test.tsx
  ```
  Expected output: `Test Files  1 failed (1)` / `Tests  3 failed | 1 passed (4)`. Measured on this tree (theme fixed by Task 2, frame not yet changed):
  - the first case fails on its first assertion, `expect(html).toContain("<article")`, with Vitest's own `toContain` template — `expected #{this} to contain #{exp}` (`node_modules/@vitest/expect/dist/index.js:1313`), i.e. **the received markup first, the expected marker second**: `expected '<div role="dialog" aria-modal="true" …' to contain '<article'`. The received side is the whole rendered string, **truncated by Vitest** (chai's `truncateThreshold: 40`, `node_modules/chai/index.js:850`), so the `…` is Vitest's ellipsis, not part of the markup. The full received markup shows the page template's `<main …></main>` rendered **empty** — the `breadcrumb` and `page_content` sections both produce nothing;
  - the second case fails with `expected +0 to be 1 // Object.is equality` — the body carries no `<h1>` at all;
  - the third case **passes** — trivially, because the body is empty; it is the assertion that must keep passing after the fix;
  - the fourth case fails with `Error: Cannot find package '@/lib/preview-page-data' imported from /opt/frame28/src/components/store/songoskriti-preview-page.test.tsx` — the fixture does not exist yet.

- [ ] **4.3** Create the demo fixture `src/lib/preview-page-data.ts`. It is **data only** — no UI — and it mirrors the production page payload's shape:
  ```ts
  /**
   * Demo page fixture for the theme preview's `?template=page` tab.
   *
   * `page_content` is a CONTEXT widget (`src/components/builder/widgets.tsx:1617`),
   * so the host hands it a React node — the preview's only slot source,
   * `useMockProductSlots` (`src/components/store/ThemePreviewFrame.tsx:256`),
   * returns `undefined` for every template but `product` (`:309`), which left the
   * fixed page template rendering chrome with an empty body.
   *
   * The payload mirrors the shape the production CMS page route builds
   * (`src/components/store/PageView.tsx:73-110`): the record's title, its
   * excerpt, the rendered body html and the last-updated stamp. The copy is
   * DEMO copy and says so — the same contract as "Demo Shopper"
   * (`src/lib/preview-demo-data.ts:42`) and "Sample product"
   * (`src/components/builder/CartContext.tsx:95`). It never pretends to be a
   * real merchant page.
   */
  import type { StorePage } from "./storefront-search.server";

  /**
   * The fields the production page payload carries (`PageView.tsx:73-110`):
   * three fields of the production page record plus the route's rendered html.
   * Typing the fixture as a `Pick` of `StorePage` makes it drift with the
   * record — if the route's page row renames or drops one of those fields, this
   * module stops typechecking and the plan's `tsgo --noEmit` gate fails.
   */
  export type PreviewPagePayload = Pick<
    StorePage,
    "title" | "excerpt" | "updated_at"
  > & {
    /** The rendered body html the route injects (`PageView.tsx:100`). */
    html: string;
  };

  /** The demo page the preview shows. Data only — the frame renders it. */
  export const PREVIEW_DEMO_PAGE: PreviewPagePayload = {
    title: "Demo page",
    excerpt:
      "Demo excerpt — the theme preview shows sample copy, never a real merchant page.",
    html: "<p>Demo page body. Sample copy for the theme preview.</p><p>This paragraph stands in for the merchant's own CMS page body.</p>",
    updated_at: "2026-10-01T00:00:00.000Z",
  };
  ```
  The `import type` is erased at compile time, so the client bundle never pulls in the server module — it exists only to bind the fixture's shape to the production record. **Do not** put a merchant's name, a real page title or a fake "About us" body in the fixture: the demo must read as demo.

- [ ] **4.4** Modify `src/components/store/ThemePreviewFrame.tsx` — the escalated third file — in exactly three places:
  1. one import, next to the existing demo-data import (after `:49`):
     ```ts
     import { PREVIEW_DEMO_PAGE } from "@/lib/preview-page-data";
     ```
  2. one `pageSlots` memo, immediately after the `cartSlots` memo (after `:576`):
     ```tsx
     // The preview has no CMS page record: `page_content` is a CONTEXT widget
     // (`src/components/builder/widgets.tsx:1617`), so the host must hand it a
     // node. Without one the fixed page template renders chrome with an empty
     // body. The demo fixture mirrors the production payload shape
     // (`src/components/store/PageView.tsx:73-110`) and is labelled as demo.
     const pageSlots = useMemo(() => {
       if (template !== "page") return undefined;
       const page = PREVIEW_DEMO_PAGE;
       return {
         page_content: (
           <article>
             <h1 className="font-bangla-display text-3xl font-bold">
               {page.title}
             </h1>
             <p className="mt-2 text-muted-foreground">{page.excerpt}</p>
             <div
               className="fq-prose mt-6 space-y-4 text-sm leading-relaxed"
               dangerouslySetInnerHTML={{ __html: page.html }} // sast-allow: html-sink -- static first-party demo literal from src/lib/preview-page-data.ts, no merchant or shopper data reaches this sink
             />
             <p className="mt-8 text-xs text-muted-foreground">
               Last updated:{" "}
               <time dateTime={page.updated_at} className="money">
                 {new Date(page.updated_at).toLocaleDateString("en-GB")}
               </time>
             </p>
           </article>
         ),
       };
     }, [template]);
     ```
  3. `...pageSlots,` added to the **three** `contextSlots` spreads — the header sections (`:667`), the main sections (`:692`) and the footer sections (`:718`) — right after `...cartSlots,`:
     ```tsx
     contextSlots={{
       ...accountSlots,
       ...productSlots,
       ...cartSlots,
       ...pageSlots,
     }}
     ```
  The `dangerouslySetInnerHTML` carries the `// sast-allow: html-sink -- …` annotation the repo requires for that sink (`src/components/store/PageView.tsx:100` is the precedent); the sink carries a static first-party literal and no merchant or shopper data. **Touch nothing else** in the file: the `?? templates.index` fallback (`:485`), the click/submit interception, the skin sheets, the demo focus, `useMockProductSlots`, `accountSlots`, `cartSlots` and `previewDemoMap` stay exactly as they are.

- [ ] **4.5** Run the test and confirm it passes:
  ```
  node_modules/.bin/vitest run src/components/store/songoskriti-preview-page.test.tsx
  ```
  Expected output: `Test Files  1 passed (1)` / `Tests  4 passed (4)`. Measured on this tree: the rendered page body is `<div class="fq-node" data-fq-node="page_content-1"><article><h1 class="font-bangla-display text-3xl font-bold">Demo page</h1><p class="mt-2 text-muted-foreground">Demo excerpt — the theme preview shows sample copy, never a real merchant page.</p><div class="fq-prose mt-6 space-y-4 text-sm leading-relaxed"><p>Demo page body. Sample copy for the theme preview.</p><p>This paragraph stands in for the merchant's own CMS page body.</p></div><p class="mt-8 text-xs text-muted-foreground">Last updated: <time dateTime="2026-10-01T00:00:00.000Z" class="money">01/10/2026</time></p></article></div>` — one `<h1>`, and no "Size guide" / "How to measure" / "Demo article" anywhere.

- [ ] **4.6** Run the affected neighbouring suites and confirm they are green:
  ```
  node_modules/.bin/vitest run src/components/store/ThemePreviewFrame.test.tsx src/components/store/ThemeChrome.route-content.test.tsx src/components/store/songoskriti-preview-page.test.tsx src/lib/themes/songoskriti/preview.test.ts src/lib/themes/songoskriti/wiring.test.ts src/lib/themes/songoskriti/skins.test.ts src/lib/themes/songoskriti/widgets.test.ts src/components/store/PageView.twin-wiring.test.tsx src/lib/definition-of-done.test.ts
  ```
  Expected output: `Test Files  9 passed (9)` / `Tests  122 passed (122)` — `ThemePreviewFrame.test.tsx` 53, `ThemeChrome.route-content.test.tsx` 3, `songoskriti-preview-page.test.tsx` 4, `preview.test.ts` 3, `wiring.test.ts` 7, `skins.test.ts` 20, `widgets.test.ts` 18, `PageView.twin-wiring.test.tsx` 3, `definition-of-done.test.ts` 11. **Every** file must be green. (The two frozen-pin suites are not in this list — Task 3 has already moved them, and Task 3.8 ran the wider 12-file neighbourhood.)

- [ ] **4.7** Check formatting and lint on the three touched files:
  ```
  node_modules/.bin/prettier --check src/lib/preview-page-data.ts src/components/store/ThemePreviewFrame.tsx src/components/store/songoskriti-preview-page.test.tsx
  node_modules/.bin/eslint src/lib/preview-page-data.ts src/components/store/ThemePreviewFrame.tsx src/components/store/songoskriti-preview-page.test.tsx
  ```
  Expected output: prettier prints `All matched files use Prettier code style!` and exits 0 **after** one `--write` pass over the new test file only — the new test file's own prose formatting is the implementer's, and prettier's measured complaint on a freshly written file is the `await import(…)` line wrap in it (`Replace \`·await·import(⏎··"@/lib/themes/songoskriti/preview"⏎\` with \`⏎··await·import("@/lib/themes/songoskriti/preview"\``). The fixture and the frame edit are prettier-clean as written. eslint exits 0 with **no** error — the only output is the two `react-hooks/exhaustive-deps` warnings the frame **already** carried before this change (`src/components/store/ThemePreviewFrame.tsx:293` and `:459` on the pre-change file, shifted to `:294` and `:460` by the added import). If prettier reports the new test file, run `node_modules/.bin/prettier --write` on that one path and re-run the check; never re-shape the frame edit or the fixture to satisfy a formatter.

- [ ] **4.8** Typecheck **before** staging:
  ```
  node_modules/.bin/tsgo --noEmit
  ```
  Expected output: no output, exit 0. This step is also the **shape-drift gate** for Review Focus 7: the fixture is typed as a `Pick` of the production `StorePage` row, so if the route's page record renames or drops `title`, `excerpt` or `updated_at`, this typecheck fails here.

- [ ] **4.9** Stage exactly the three paths and commit:
  ```
  git add src/lib/preview-page-data.ts src/components/store/ThemePreviewFrame.tsx src/components/store/songoskriti-preview-page.test.tsx
  git status --short
  ```
  Expected output — eleven lines: the three staged paths (`A  src/lib/preview-page-data.ts`, `M  src/components/store/ThemePreviewFrame.tsx`, `A  src/components/store/songoskriti-preview-page.test.tsx`) and the eight unstaged lines step 1.6 listed — the three churn files (` M`), `?? .output-snapshots/` and the four input documents (`??` — untracked at the time; tracked since the controller's `16f2743d`, see Global Constraints) — none of them staged. Then:
  ```
  git commit -m "fix(songoskriti): give the theme preview a demo page body"
  ```
  Expected output: a commit touching exactly three files; `git show --stat --oneline HEAD` lists the fixture, the frame and the new test.

---

### Task 5 — Verify the preview and the storefront on the running app, and record the evidence

**Files:**
- Create: `docs/superpowers/songoskriti-evidence/port/phase1-page-content-evidence.md`
- Read-only references: `src/routes/theme-preview.$key.tsx`, `src/components/store/ThemePreviewFrame.tsx`, `src/lib/preview-page-data.ts`, `src/lib/theme-preview-nav.ts`

**Interfaces:**
- Consumes: the preview route `GET /theme-preview/$key?template=page` (`src/routes/theme-preview.$key.tsx:208-251`), `ThemePreviewFrame` (`src/components/store/ThemePreviewFrame.tsx`), `PREVIEW_DEMO_PAGE` (`src/lib/preview-page-data.ts`), `resolveThemePreview(key)` (`src/lib/theme-preview-nav.ts:414`).
- Produces: `docs/superpowers/songoskriti-evidence/port/phase1-page-content-evidence.md` — the command/response log for this phase.

- [ ] **5.1** Start the dev server on a fixed port (background) and wait for it to answer:
  ```
  cd /opt/frame28 && node_modules/.bin/vite --port 5173 --strictPort
  ```
  Expected output: `Local: http://localhost:5173/` in the log. Leave it running for steps 5.2-5.6 and stop it after step 5.6.

- [ ] **5.2** Prove the preview route is actually serving the page template before asserting anything about its body — otherwise every grep below would pass vacuously on a 404:
  ```
  curl -s -o /tmp/opencode/preview-page.html -w '%{http_code}\n' "http://localhost:5173/theme-preview/songoskriti?template=page"
  ```
  Expected output: `200`. **If the response is not 200**, the preview host gate (`themePreviewHostGateFn`, `src/routes/theme-preview.$key.tsx:186`) denied the local request: record the status in the evidence doc and **do not** substitute the deployed route for steps 5.3-5.5. The deployed preview `https://framique.qubickle.com/theme-preview/songoskriti?template=page` answers `200` but serves the **pre-change build** — measured on this tree: it still contains one `"Size guide"`, one `"How to measure"` and one `"Demo article"` (the audit's §2.1 reading, re-measured) — so it can only re-confirm the *old* behaviour, never the post-change preview body. If the local run is gate-denied, record that the preview-body assertions could not be taken locally and that their evidence is Task 4's component-level suite (which renders the real `ThemePreviewFrame`).

- [ ] **5.3** Assert the demo copy is gone from the preview:
  ```
  grep -c "Size guide" /tmp/opencode/preview-page.html
  grep -c "How to measure" /tmp/opencode/preview-page.html
  grep -c "Demo article" /tmp/opencode/preview-page.html
  ```
  Expected output: `0`, `0`, `0`. (Before the fix this was `1`, `1`, `1` — the theme's own `case "page":` demo body, `src/lib/themes/songoskriti/preview.ts:207-217`.)

- [ ] **5.4** Assert the theme's chrome still renders (the preview is not broken by the change):
  ```
  grep -c "Songoskriti" /tmp/opencode/preview-page.html
  ```
  Expected output: `1` or more (the masthead wordmark and/or the `© 2026 Songoskriti` footer marker, `src/lib/themes/songoskriti/footer.ts`).

- [ ] **5.5** Assert the preview's page body is **present** and carries the labelled demo fixture (Task 4), not an empty body:
  ```
  grep -c "Demo page body." /tmp/opencode/preview-page.html
  grep -c "<article" /tmp/opencode/preview-page.html
  grep -c "<h1" /tmp/opencode/preview-page.html
  ```
  Expected output: `1` or more, `1` or more, and exactly `1`. Measured on this tree after Tasks 2-4: the preview's `<main>` carries `<div class="fq-node" data-fq-node="page_content-…"><article><h1 …>Demo page</h1><p …>Demo excerpt — the theme preview shows sample copy, never a real merchant page.</p><div class="fq-prose …"><p>Demo page body. Sample copy for the theme preview.</p><p>This paragraph stands in for the merchant's own CMS page body.</p></div><p …>Last updated: <time dateTime="2026-10-01T00:00:00.000Z" class="money">01/10/2026</time></p></article></div>`. The `<h1` count is `1` because the **route** owns the `<h1>` in production (`src/components/store/PageView.tsx:77-79`) and the demo body mirrors it — the same single `<h1>` the storefront shows, and the theme elects none (`primarySectionId` is `null` for the page main). Before the fix this count was also `1`, but it was the demo `<h1>Size guide</h1>`; the difference is *which* `<h1>`, and that is what step 5.3's greps pin.

- [ ] **5.6** Record what cannot be verified locally, and why, in the evidence doc:
  - The **live storefront** rendering — `/store/<slug>/pages/<pageSlug>` wearing the theme's page layout, and the CMS-designated homepage `/store/<slug>/` showing the merchant's body instead of "Size guide" — **cannot** be verified from this environment: the live DB has no `store_themes` row for Songoskriti (audit §2.1), the platform host 404s path storefronts (`src/lib/storefront-host.server.ts:433-447`), and no store with a CMS-designated homepage is reachable. The Phase-1 evidence for the storefront is therefore the component-level proof in Task 2's storefront test, which exercises the real `ThemeChrome` contract (`contentSlot` gate at `:302-310`, `contextSlots` fill at `:825-833`) with the theme's real page AST.
  - The **preview's `breadcrumb` section still renders nothing** — the residual gap Corrections §4 names. The `breadcrumb` widget is a context widget (`src/lib/builder-ast.ts:1500-1509`) and the preview supplies no `breadcrumb` slot (the only `breadcrumb` node in the preview is `useMockProductSlots`' product-template one, `src/components/store/ThemePreviewFrame.tsx:340`), so `SectionRenderer` renders `null` for it (`src/components/builder/SectionRenderer.tsx:825-833`). Measured: the preview's `<main>` carries the `page_content` node and **no** `data-fq-node="breadcrumb…"` node. It is **cosmetic and harmless**: the breadcrumb is route context (merchant name + page title, `src/components/store/PageView.tsx:47-69`), the storefront is unaffected (the route hands the breadcrumb over, `:175`), the body is unaffected, and nothing in CI reads the preview's breadcrumb. It matters only as a preview-parity gap, and Phase 6 still owns the wider preview-honesty work. Record it as such — **not** as "the preview body is empty", which is no longer true.
  - The **sibling-page nav** loss: `PageView`'s "More information" aside (`src/components/store/PageView.tsx:112-151`) exists only in the route fallback (`:177-186`), so it stops rendering once the theme declares the content slot. No widget represents it, so it cannot be restored inside port spec §7; restoring it needs `src/components/store/PageView.tsx`, which is prohibited. Record it as an open item for the D4 boundary decision.
  - The **false lint warning** in the merchant's editor (Corrections §5): both live `lintTemplate` call sites pass no template key (`src/hooks/use-builder-editor.ts:635`, `src/lib/themes.server.ts:284`), so the builder reports `'No primary heading on this template.'` for the `page` template alone, and a merchant who adds a heading in response produces a second `<h1>` on a path host. The fix needs two prohibited files; record it as a second open item for the D4 boundary decision, alongside the Task-1 record's item (f).
  - The **frozen parity stills** for the `page` template (6 reference stills + 6 machine baselines) are now stale; re-freezing `reference/` rewrites `reference-manifest.json` for all 60 capture entries and is an owner-approved step outside this plan's commits (see the Task-1 record).

- [ ] **5.7** Write `docs/superpowers/songoskriti-evidence/port/phase1-page-content-evidence.md` with: the commit SHA of the Task-2 change and of the Task-4 change; the exact commands and their exact outputs from steps 5.2-5.5; the five "cannot be verified locally" items from step 5.6; and the phase's acceptance criteria with their evidence:
  1. the theme's page template contains a `page_content` section → Task 2's theme test, assertion 1;
  2. `lintTemplate(pageAst, "page")` produces zero issues → Task 2's theme test, assertion 3 (today it produces `"Page template has no page content widget."`, `src/lib/builder-ast.ts:8448-8453`);
  3. the demo strings are gone from the page body → Task 2's theme test assertion 2 and Task 5 step 5.3;
  4. the page template elects no primary heading and contains no heading-bearing section → Task 2's theme test, assertions 4 and 7;
  5. the CMS page route and the CMS-designated homepage render the merchant's body inside the theme layout → Task 2's storefront test, both cases;
  6. the theme preview's `?template=page` renders a **non-empty**, labelled demo body with exactly one `<h1>` and no demo copy → Task 4's new suite (all four assertions) and Task 5 step 5.5;
  7. the preview's demo payload mirrors the production payload's shape → Task 4's new suite, assertion 4, plus the `tsgo --noEmit` gate in Task 4 step 4.8.

- [ ] **5.8** Stage and commit the evidence doc:
  ```
  git add docs/superpowers/songoskriti-evidence/port/phase1-page-content-evidence.md
  git commit -m "docs(songoskriti): record the page-template preview verification"
  ```
  Expected output: a commit touching exactly one file.

---

### Task 6 — Post-merge verification

**Files:**
- Modify: `docs/superpowers/songoskriti-evidence/port/phase1-page-content-evidence.md` (append the verification log)
- Read-only: the whole tree

**Interfaces:**
- Consumes: the repository's gate scripts (`scripts/songoskriti-assets-check.mjs`, `scripts/gen-songoskriti-assets.mjs`, `scripts/contract-gate.mjs`, `scripts/doc-gate.mjs`, `scripts/schema-fingerprint.mjs`, `scripts/gen-crontab.mjs`, `scripts/secret-scan.mjs`) and `node_modules/.bin/{vitest,tsgo,eslint,prettier}`.
- Produces: the verification section of `docs/superpowers/songoskriti-evidence/port/phase1-page-content-evidence.md`.

> **Three of the gates below (6.8, 6.10, 6.12) are expected-red on this tree.** They fail on a clean checkout of `frame30` at `71271834`, before and after this plan's change, for reasons that have nothing to do with the page template. Each of those three steps states the measured output, the reason, and the command that produces the real signal locally. **Do not "fix" any of them inside this plan** — report them. A red gate that is red for a pre-existing reason is not a regression; a gate that is red for a *new* reason is.

- [ ] **6.1** Run the Songoskriti asset gate (the first step of `gates:release`):
  ```
  node scripts/songoskriti-assets-check.mjs
  ```
  Expected output: `songoskriti asset gate GREEN — 0 findings, 11 note(s)` and exit 0. The theme's page template references no art, so the expected-asset set is unchanged.

- [ ] **6.2** Run the asset generator check (the expected-output set must reproduce without a key change):
  ```
  node scripts/gen-songoskriti-assets.mjs --check
  ```
  Expected output: exit 0 with no missing/extra asset reported.

- [ ] **6.3** Typecheck:
  ```
  node_modules/.bin/tsgo --noEmit
  ```
  Expected output: no output, exit 0.

- [ ] **6.4** Lint the touched paths (never `eslint .` — it stalls on `.output-snapshots/`):
  ```
  node_modules/.bin/eslint src/lib/themes/songoskriti/preview.ts src/lib/themes/songoskriti/page-content.test.ts src/components/store/songoskriti-page-content.test.tsx src/components/builder/songoskriti-port-freeze.test.tsx src/lib/theme-preview-nav.test.ts src/lib/preview-page-data.ts src/components/store/ThemePreviewFrame.tsx src/components/store/songoskriti-preview-page.test.tsx
  ```
  Expected output: exit 0 with no error. The only output is the two `react-hooks/exhaustive-deps` warnings `src/components/store/ThemePreviewFrame.tsx` already carried before this plan (`:294` and `:460` after the change, `:293` and `:459` before it) — they are pre-existing and are not touched by this plan.

- [ ] **6.5** Prettier on the touched code files:
  ```
  node_modules/.bin/prettier --check src/lib/themes/songoskriti/preview.ts src/lib/themes/songoskriti/page-content.test.ts src/components/store/songoskriti-page-content.test.tsx src/components/builder/songoskriti-port-freeze.test.tsx src/lib/theme-preview-nav.test.ts src/lib/preview-page-data.ts src/components/store/ThemePreviewFrame.tsx src/components/store/songoskriti-preview-page.test.tsx
  ```
  Expected output: `All matched files use Prettier code style!`. (The two `docs/**` files are **not** prettier-managed in this repo — `docs/superpowers/plans/2026-10-19-songoskriti-asset-acceptance-gate.md` and `docs/superpowers/songoskriti-evidence/port/phase0-implementation-map.md` both fail `prettier --check` on this tree — so markdown is checked by reading it, not by prettier.)

- [ ] **6.6** Reproduce the known local-only flake and confirm it is exactly that:
  ```
  node_modules/.bin/vitest run src/lib/site.server.test.ts
  ```
  Expected output: `Test Files  1 failed (1)` / `Tests  1 failed | 2 passed (3)` — the failing case is `throws a guarded missing-env error, never a placeholder client`. This is the documented local-only env artifact (audit §7.2: the gitignored `.env` supplies `VITE_SUPABASE_URL`, so `import.meta.env` is truthy at module-evaluation time). It is **expected** and must not be "fixed" by weakening the assertion. Confirm the mechanism by re-running with the Supabase env vars emptied — `VITE_SUPABASE_URL="" SUPABASE_URL="" SUPABASE_PUBLISHABLE_KEY="" VITE_SUPABASE_PUBLISHABLE_KEY="" node_modules/.bin/vitest run src/lib/site.server.test.ts` — which must report `Tests  3 passed (3)`.

- [ ] **6.7** Run the full unit suite:
  ```
  node_modules/.bin/vitest run
  ```
  Expected output: **exactly one** failing file — `src/lib/site.server.test.ts` (the step-6.6 flake) — and every other file green. Any second failure is a regression from this change and must be fixed before the deploy step.

- [ ] **6.8** Run the contract gate — **expected-red for a pre-existing environment reason**:
  ```
  node scripts/contract-gate.mjs
  ```
  Expected output: the script's own manifest verification passes (a `contract ok …` line per contract file), then it prints `running 13 contract suites…` and finally **exits 2** with `contract-gate: could not start vitest — spawnSync bunx ENOENT`.
  *Why:* `scripts/contract-gate.mjs:302` hardcodes `spawnSync("bunx", ["vitest", "run", ...testFiles], …)`. `bun`/`bunx` are not on PATH in this environment, and the plan's "use plain `node` for the `scripts/*.mjs` gates" constraint covers only how the script is **launched** — it does not reach the `bunx` the script **spawns**. This is a tooling gap, not a contract failure: the manifest check that the gate exists to enforce passed.
  *Local equivalent (produces the real signal):* `node scripts/contract-gate.mjs --list` prints the manifest; run the 13 contract **test** files it names (the two `__fixtures__` entries are fixtures, not suites) with the local runner, e.g.
  ```
  node_modules/.bin/vitest run src/lib/seo-weight.contract.test.ts src/lib/search-console.contract.test.ts src/lib/content-health.contract.test.ts src/lib/query-discipline.contract.test.ts src/lib/motion-policy.test.ts src/lib/motion.contract.test.ts src/lib/copy-quality.contract.test.ts src/lib/newsletter.contract.test.ts src/lib/marketing-seo.contract.test.ts src/lib/contact.contract.test.ts src/lib/semrush.contract.test.ts src/lib/concurrency-and-caching.contract.test.ts src/lib/disaster-proof-backup.contract.test.ts
  ```
  Expected output: all 13 files green. CI installs bun (`.circleci/config.yml:36-42`), so the `unit-contract` job's `bun run test:contracts` (`config.yml:66-79`) runs this gate for real. **Do not edit `scripts/contract-gate.mjs` inside this plan** — making the gate runner-agnostic is a release-gate change and needs an owner's decision; report it instead.

- [ ] **6.9** Run the documentation gate:
  ```
  node scripts/doc-gate.mjs
  ```
  Expected output: exit 0, `findings: 0`. (The two new `docs/superpowers/**` files are outside the gate's scanned set — `docs/developers/**`, `docs/04-builder/README.md`, `docs/04-builder/app-blocks.md`, `docs/themes/creation.md`, `docs/themes/packages.md`, `docs/themes/level-b.md`, `docs/packages/contract.md` — so they cannot introduce findings; they also must not be added to that set without an owner decision.)

- [ ] **6.10** Run the schema fingerprint check — **expected-red for a pre-existing environment reason**:
  ```
  node scripts/schema-fingerprint.mjs --check
  ```
  Expected output: **exit 1** with `schema-fingerprint: rpc failed (400)`.
  *Why:* the check reads the **live** schema through a Supabase RPC (`scripts/schema-fingerprint.mjs:49` prints that exact message on a non-2xx response). The local `.env` supplies credentials, but the RPC call itself does not succeed from this environment, so the check cannot run. This is **not** a schema change: the plan creates no migration and alters no migration, and `theme_drafts.templates` / `theme_versions.templates` are `jsonb` (`theme_drafts`/`theme_versions` are read and written by the theme version path, not by a migration). A fingerprint change is therefore not expected, and the pre-existing red is independent of this change. CI's `e2e-levelb-production` job runs `schema:check` against the real environment (`config.yml:302-352`).
  *What to do:* record the red and its reason in the evidence doc. **Do not** create a migration, rewrite the fingerprint, or edit `scripts/schema-fingerprint.mjs` inside this plan — the plan's own change touches no schema.

- [ ] **6.11** Run the cron check:
  ```
  node scripts/gen-crontab.mjs --check
  ```
  Expected output: exit 0, `gen-crontab: ok (18 jobs scheduled)`.

- [ ] **6.12** Run the secret scan — **expected-red for a pre-existing repository condition**:
  ```
  node scripts/secret-scan.mjs
  ```
  Expected output: **exit 1** with `secret scan FAILED — 10 finding(s):`.
  *Why — and where the findings are:* 8 of the 10 are in the **untracked** `.output-snapshots/` build output (four `VITE_SUPABASE_PUBLISHABLE_KEY` JWT hits each in `snap_20261019T110422Z_26f3447` and `snap_20261020T040348Z_40673d3`, under `server/_ssr/client-*.mjs` and `server/_ssr/router-*.mjs`). That directory is **not tracked** — it is a local build artefact, and the plan never commits it — so those 8 disappear on a pristine checkout. The remaining **2 are in a tracked file**: `docs/superpowers/songoskriti-evidence/port/e2e/foreign-gap-probe.json:50-51`, a committed anon JWT recorded as e2e evidence (committed in `044624af`). **Consequence: the secret scan is red on a clean checkout of `frame30` at `71271834`, and CI's `secrets:scan` job (`.circleci/config.yml:94`, `bun run secrets:scan`) is red at HEAD — before this plan's change.**
  *What to do:* treat it as a **pre-existing repository condition, unrelated to this plan's change.** Report it — in the evidence doc and to the owner — and **do not fix it inside this plan.** Rewriting or removing a committed evidence file is an owner decision (the file records a real e2e gap), and this plan's change adds no secret, touches no credential and does not alter the scan's scope. This plan's commits touch only `src/lib/themes/songoskriti/preview.ts`, the three new test files, the NEW fixture `src/lib/preview-page-data.ts`, the escalated preview frame `src/components/store/ThemePreviewFrame.tsx`, the two frozen pins and the two new `docs/**` records — none of which contains a JWT, and none of which can change the finding count.

- [ ] **6.13** Confirm nothing unwanted is staged and the churn files are untouched:
  ```
  git status --short
  git diff --cached --stat
  ```
  Expected output: `git diff --cached --stat` prints **nothing** (the index is clean). `git status --short` shows exactly the same set it showed in step 1.6 — the three churn files (` M .artifacts/e2e/playwright-report/index.html`, ` M ops/routing/canary-weights.conf`, ` M ops/routing/upstream.conf`), the untracked snapshot directory (`?? .output-snapshots/`), and the four input documents (`?? docs/superpowers/plans/2026-10-20-theme-editable-templates.md`, `?? docs/superpowers/songoskriti-evidence/port/phase0-implementation-map.md`, `?? docs/superpowers/plans/2026-10-20-theme-editable-templates-brief.md`, `?? docs/superpowers/plans/2026-10-20-theme-editable-templates-brief-review.md`) — the three churn files, the untracked snapshot directory and the untracked audit, **never** staged and **never** committed.

  > **Post-verification (controller).** The four input documents were untracked files at the repo root when these steps ran; the controller later published the brief and the brief's review under `docs/superpowers/plans/` — the paths named above — and committed all five plan documents in `16f2743d`. The "never staged" constraint above still holds for *this plan's own task commits*; the controller's publication is a separate, recorded decision outside them (Global Constraints).

- [ ] **6.14** Append the verification log to `docs/superpowers/songoskriti-evidence/port/phase1-page-content-evidence.md` — one line per step 6.1-6.13 with the command and its exact output, including the one expected failure in 6.6/6.7 (and its proof in 6.6's second run) and the **three** expected-red gates in 6.8, 6.10 and 6.12, each recorded with its reason and with the local command that produced the real signal (6.8's 13 contract suites). State explicitly in the log that none of the three is a regression from this change.

- [ ] **6.15** Stage and commit the verification log:
  ```
  git add docs/superpowers/songoskriti-evidence/port/phase1-page-content-evidence.md
  git commit -m "docs(songoskriti): record the phase-1 post-merge verification"
  ```
  Expected output: a commit touching exactly one file. `git status --short` afterwards still shows the three churn files, `.output-snapshots/` and the four untracked documents, unstaged.

---

## Deploy — a separate, explicit step (NOT part of this plan's commits)

Nothing above deploys. The plan's commits stop at the verification log. The deploy happens **after** the branch is merged and pushed, and is executed by the operator under the repo's release procedure:

```
# 1. the branch must be pushed and the working tree clean of untracked noise
git push origin frame30
git status --short          # only the three churn files may be dirty; nothing staged

# 2. the only supported production path (ops/deploy-from-git.sh header:
#    "Deploy Framique from git — the ONLY supported path to production";
#    "Deploy ONLY from a pushed git branch (never a dirty tree)")
ops/deploy-from-git.sh frame30 <owner>

# 3. the release train's pre-flight gate (DEPLOY.md:7)
bun run typecheck && bun run test && bun run test:contracts && bun run schema:check && bun run secrets:scan

# 4. the mandatory pre-deploy snapshot (DEPLOY.md:15-18)
./ops/backup/time-machine-snapshot.sh snap_pre_deploy_$(git rev-parse --short HEAD) take
./ops/backup/time-machine-snapshot.sh snap_pre_deploy_$(git rev-parse --short HEAD) verify
```

**Pre-flight caveat, carried from Task 6:** step 3 runs the same three gates that are expected-red locally (6.8 `test:contracts`, 6.10 `schema:check`, 6.12 `secrets:scan`). On CI's runner `test:contracts` and `schema:check` have the tools and the database, but `secrets:scan` will still report the two findings in the tracked `docs/superpowers/songoskriti-evidence/port/e2e/foreign-gap-probe.json` until the owner rules on that file. That is a pre-existing condition, not something Phase 1 introduced, and Phase 1's commits do not change it.

The deploy's own artefact and rollout are owned by `ops/deploy-from-git.sh` (blue/green + canary per `DEPLOY.md:5-29`); it rewrites `ops/routing/canary-weights.conf` and `ops/routing/upstream.conf` at run time — **those files are the churn files this plan never commits**, and they must still be unstaged after the deploy.

**Post-deploy storefront verification is still blocked** and belongs to the owner of D4: no live store carries the Songoskriti theme (audit §2.1), so `/store/<slug>/pages/<pageSlug>` cannot be exercised on production until one is seeded. The Phase-1 evidence is the component-level proof plus the preview-route check in Task 5. The deployed preview route (`https://framique.qubickle.com/theme-preview/songoskriti?template=page`) keeps serving the **old** build until this branch is deployed, so it shows the old "Size guide" page until then; after the deploy it must show the demo body instead, exactly as Task 5 step 5.5 asserts on the local server.

---

*End of the Phase-1 plan. Every `file:line` above was read on `/opt/frame28` at branch `frame30`, HEAD `71271834`. The only artefacts this plan writes are the two new `docs/**` files, the three new test files, the NEW preview fixture `src/lib/preview-page-data.ts`, the one theme source file, the escalated preview frame `src/components/store/ThemePreviewFrame.tsx`, and the two frozen pins named in the Task-1 escalation.*
