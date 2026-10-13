# Theme Remediation Implementation Plan (Elementor rule)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remediate the indexed theme-independence violation on current main: generic renderers carry zero brand content, no theme overrides generic keys globally, every theme owns its catalog/data, guard enforced. Docs (`docs/themes/creation.md` §13), CHANGELOG Fixed entry, and memory record already landed — this plan is the code remediation.

**Architecture:** De-brand shared renderers to prop-driven generics (brand zones move to theme-authored sections/props); per-theme look via skins + tokens + builders only; own catalog per theme; isolation guard (test + lint).

**Tech Stack:** TypeScript ESM, React SSR tests, Vitest. No new deps.

**Spec:** `docs/themes/creation.md` §13; audit `/tmp/opencode/preview-analysis/.analysis-reports/`; prior unmerged branch `fix/theme-independence` (reference ONLY — do not merge; re-apply its pieces fresh against current main: somvabona catalog, guard test, twin deltas).

## Global Constraints

- Bun ESM, no `require()`; flat `key`/`key_bn`, bn→en fallback never blank.
- Tokens-only styling; TDD red→green; zero NEW lint/typecheck violations vs origin/main per file.
- Pixel-parity for songoskriti default-locale output on every renderer touched (pin before changing).
- No `.github/` changes. Work in `/tmp/opencode/remediate` @ `89ff250`, branch `fix/theme-remediation`, push after each task.

## Review Focus

- No songoskriti brand string renders for other themes (live-DOM proof: somvabona footer contains zero songoskriti copy).
- Generic renderer output for existing props byte-identical (pins).
- Somvabona catalog independent (identity + title-ban + resolution tests).
- Guard fails fast on cross-theme import AND on brand literals in shared renderers.

---

### Task 1: Somvabona own catalog + isolation guard (re-apply)

**Files:** Modify `src/lib/demo-catalog.ts` (SOMVABONA catalog, drop alias); new `src/lib/somvabona-catalog.test.ts`; new `src/lib/themes/isolation.test.ts`; `eslint.config.*` guard layer if config supports it cleanly (else test-only + note).
- Reference: old branch commits (catalog + guard) — re-apply semantics fresh, do not cherry-pick blindly (base moved).
- [ ] RED (alias + missing guard) → GREEN → commit `fix(catalog): somvabona own catalog; guard isolation` → push.

### Task 2: De-brand generic renderers

**Files:** `src/components/builder/songoskriti.tsx` (footer_sitemap, store_locator + any other brand-hardcoded renderer), theme builders (move brand zones to authored sections/props with `_bn` twins).
- Pin songoskriti default output BEFORE; after: generic output identical for same props, zero brand strings without brand props.
- [ ] RED → GREEN → commit → push.

### Task 3: End global key override

**Files:** widget merge (`widgets.tsx` order) → explicit per-theme resolution (theme-keyed registry/port; generic = fallback). No behavior change for songoskriti default path (pins from Task 2 hold).
- [ ] RED (two themes resolving same key to different renderers by theme key) → GREEN → commit → push.

### Task 4: Verify + twin sweep

- Full touched suites GREEN; zero-new-violations; live-DOM proof (render both previews, assert no cross-brand copy). Merge-ready report.
