# Docs Merge + Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the overlapping builder/theme guides into authoritative docs matching built code, and clean up stale links and duplicates.

**Architecture:** Consolidate 7 overlapping `04-builder` theme files and 3 `themes/` authoring files into 2 authoritative guides; mark dated specs/plans as historical; fix 7 broken internal links; sync all code-locked values.

**Tech Stack:** Markdown, prettier (`bun run prettier --write`), ripgrep verification, vitest theme gate (regression check only).

**Spec:** This plan + REPORT-THEMES.md (audited code reality: ink-black `#1a1a1a` / retired-theme maroon, 20-section homepage hero_carousel-first, studio twins at `src/lib/studio/catalog.ts:2418-2429`, persist-shape in `src/lib/builder-ast.ts`, dashboard-driven songoskriti menus, token-only CSS) + docs-write skill (audience-first, descriptive links, American spelling).

## Global Constraints

- Do NOT touch application code, migrations, deploy scripts, or `.env` — docs only (plus prettier formatting of touched md files).
- Do NOT delete dated specs/plans in `docs/superpowers/specs/` and `docs/superpowers/plans/` — mark superseded with a header note, keep as history.
- Every code-locked value in merged guides must match HEAD: brand `#1a1a1a` / `#7C2A1A`, 20-section emission opening `hero_carousel`, 6-rail skins reality, studio twin parity, token-only (`var(--theme-*)`, no hex).
- Links must be descriptive, never `here`; `**Bold**` for UI elements, backticks for code only.
- Run `bun run prettier --write` on every touched md file.

## Review Focus

- Stale token `#8A3B1F` surviving anywhere in merged guides — reader would tint a theme wrong; expect zero hits.
- Section-count drift (9/10/11 vs authored 20) — reader would build a short homepage; expect one consistent 20-type list.
- Broken relative links after moves — reader hits 404; expect link-checker zero broken.
- Deleted-file references (guides pointing at archived paths without redirect note) — reader lost; expect every archive leaves a pointer.
- Plan/spec history rewritten instead of annotated — audit trail lost; expect superseded banners, not rewrites.

---

## File Structure

- Modify: `docs/04-builder/README.md` — becomes THE builder+themes runtime guide (merges theme-runtime, theme-registry, themes-catalog, theme-authoring-export, sections-templates, app-blocks relevant parts, publishing builder sections).
- Modify: `docs/themes/creation.md` — becomes THE theme-authoring guide (absorbs sdk.md + packages.md + wordpress-handbook-index.md deltas).
- Modify: `docs/04-builder/theme-plan-apparel.md`, `theme-plan-beauty.md`, `theme-plan-electronics.md`, `theme-plan-marketplace.md` — prepend superseded banner pointing at merged guide; no content rewrites.
- Modify: `docs/superpowers/specs/2026-09-23-songoskriti-design.md`, `docs/superpowers/plans/2026-09-23-songoskriti.md` — superseded banner (stale `#8A3B1F` sources).
- Modify: `docs/13-export-sdk/README.md` — fix 7 broken relative links.
- Modify: `REPORT-THEMES.md` — append pointer to merged guides (keep as dated audit, not living doc).
- Test: link-checker script output + `grep` gates + prettier check + theme vitest gate.

---

### Task 1: Builder guide merge (04-builder authoritative README)

**Files:**

- Modify: `docs/04-builder/README.md`
- Read-only refs: `docs/04-builder/theme-runtime.md:1-409`, `theme-registry.md:1-368`, `themes-catalog.md:1-311`, `theme-authoring-export.md:1-113`, `sections-templates.md:1-185`, `app-blocks.md:1-130`, `publishing.md:1-288`
- Code refs: `src/lib/studio/catalog.ts:2418-2429`, `src/lib/builder-ast.ts` (SKIN_FIELD, BITEXT_FIELDS), `src/components/store/StoreHeader.tsx:150-200`, `src/lib/theme-preview-nav.ts`

**Interfaces:**

- Consumes: REPORT-THEMES.md sections 1-5 (code reality).
- Produces: single authoritative builder guide other tasks link to.

- [ ] **Step 1: Draft merged README from code reality**

```markdown
# Builder, themes, and studio — authoritative guide (merged 2026-09-26)

> Supersedes: theme-runtime.md, theme-registry.md, themes-catalog.md,
> theme-authoring-export.md, sections-templates.md (kept as history).
```

Sections: tokens table (both themes, 18 keys), skins + defaults, studio twin parity contract, persist-shape rule, dashboard-menu data flow, preview engine + focus links, token-only CSS gate. Every code value cited with file:line.

- [ ] **Step 2: Verify code locks**

Run: `grep -rn "#8A3B1F" docs/04-builder/README.md; grep -c "hero_carousel" docs/04-builder/README.md`
Expected: zero stale-token hits; hero_carousel present as first section.

- [ ] **Step 3: Prettier + commit**

```bash
bun run prettier --write docs/04-builder/README.md
git add docs/04-builder/README.md
git commit -m "docs: merge 04-builder theme guides into authoritative README"
```

---

### Task 2: Theme-authoring guide merge (themes/creation authoritative)

**Files:**

- Modify: `docs/themes/creation.md`
- Read-only refs: `docs/themes/sdk.md:1-267`, `docs/themes/packages.md:1-37`, `docs/themes/wordpress-handbook-index.md:1-190`
- Code refs: `src/lib/themes/songoskriti/tokens.ts:1-34`, `src/lib/themes/oceanblue/tokens.ts`, `src/lib/themes/songoskriti/skins.ts`, `src/lib/plugin-manifest.ts:18-70`

**Interfaces:**

- Consumes: Task 1 README (link, do not duplicate runtime contract).
- Produces: single authoring guide (tokens → skins → homepage builders → skins.css → tests).

- [ ] **Step 1: Fold sdk/packages/handbook deltas into creation.md**

Keep: token table, skin vocab + defaults, skins.css token-only rule, homepage builder pattern, preview-source wiring, test files to update (wiring/skins/preview). Delete-or-link duplicated runtime theory (link to Task 1 README instead).

- [ ] **Step 2: Verify no stale values**

Run: `grep -rn "#8A3B1F\|10 sections" docs/themes/creation.md`
Expected: zero hits.

- [ ] **Step 3: Prettier + commit**

```bash
bun run prettier --write docs/themes/creation.md
git add docs/themes/creation.md
git commit -m "docs: merge themes authoring guides into creation.md"
```

---

### Task 3: Archive banners (plans + theme-plan-* + dated spec)

**Files:**

- Modify: `docs/04-builder/theme-plan-apparel.md`, `theme-plan-beauty.md`, `theme-plan-electronics.md`, `theme-plan-marketplace.md`, `docs/superpowers/specs/2026-09-23-songoskriti-design.md`, `docs/superpowers/plans/2026-09-23-songoskriti.md`

**Interfaces:**

- Consumes: Task 1 + 2 paths.
- Produces: history preserved with pointers.

- [ ] **Step 1: Prepend superseded banner to each file**

```markdown
> **Superseded (2026-09-26):** authoritative guides are
> [Builder README](../04-builder/README.md) and
> [Theme authoring](../themes/creation.md). Kept as history; do not edit.
```

- [ ] **Step 2: Verify banners present**

Run: `grep -L "Superseded (2026-09-26)" docs/04-builder/theme-plan-*.md`
Expected: no output (all contain banner).

- [ ] **Step 3: Prettier + commit**

```bash
bun run prettier --write docs/04-builder/theme-plan-*.md docs/superpowers/specs/2026-09-23-songoskriti-design.md docs/superpowers/plans/2026-09-23-songoskriti.md
git add docs/04-builder/theme-plan-*.md docs/superpowers/specs/2026-09-23-songoskriti-design.md docs/superpowers/plans/2026-09-23-songoskriti.md
git commit -m "docs: mark superseded plans/specs with pointers"
```

---

### Task 4: Link repair + REPORT pointer + final gates

**Files:**

- Modify: `docs/13-export-sdk/README.md` (7 broken links), `REPORT-THEMES.md` (append pointer)

**Interfaces:**

- Consumes: Tasks 1-3 outputs.
- Produces: zero-broken-link tree, prettier-clean, code gate still green.

- [ ] **Step 1: Fix 7 broken links in 13-export-sdk/README.md**

Current broken (verified 2026-09-26): `00-meta/design-system.md`, `00-meta/audit-verdict.md`, `15-e2e/README.md`, `09-analytics/README.md`, `02-merchant/README.md`, `06-payments/README.md`, `12-marketplace/README.md`. Resolve each to its real path or drop with a pointer note.

- [ ] **Step 2: Append pointer to REPORT-THEMES.md**

```markdown
---

**Living guides (2026-09-26):** [Builder README](docs/04-builder/README.md),
[Theme authoring](docs/themes/creation.md). This report stays a dated audit.
```

- [ ] **Step 3: Run final gates**

Run: `python3 <link-checker from audit> ` (zero broken), `grep -rn "#8A3B1F" docs/04-builder/README.md docs/themes/creation.md` (zero hits), `bun run prettier --check docs/04-builder/README.md docs/themes/creation.md docs/13-export-sdk/README.md`, `bun x vitest run src/lib/themes/songoskriti/ src/lib/themes/oceanblue/ src/lib/theme-preview-nav.test.ts` (all pass — proves docs edit broke no code).
Expected: all green.

- [ ] **Step 4: Commit + push**

```bash
git add docs/13-export-sdk/README.md REPORT-THEMES.md
git commit -m "docs: repair links, point REPORT to living guides"
git fetch origin && git merge origin/main -m "merge: latest before docs push" && git push origin HEAD:main
```
