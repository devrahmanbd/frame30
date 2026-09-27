# Theme Separation Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Map + enforce theme/editor separation the Elementor way (themes call engine widgets, never patch shared editor files for theme purposes); (2) finish account-tab URL behavior so back/forward is coherent; (3) harden the independence guard beyond a test.

**Architecture:** Audit-first for separation (proposal, no refactor yet); behavior fix + runtime tests for account tabs; layered guard (ESLint `no-restricted-imports` + committed semantic tests).

**Tech Stack:** TypeScript ESM, Vitest, ESLint flat config. No new deps.

**Spec:** User rulings 2026-09-26 (this plan): themes self-contained + editor-editable via widget guidelines; account taboligations fixed properly; guard kept, hardened if a better mechanism exists.

## Global Constraints

- Bun ESM, no `require()`; flat `key`/`key_bn`; bn→en fallback never blank.
- Tokens-only styling; TDD red→green; zero NEW lint/typecheck violations vs origin/main per file.
- No `.github/` changes. Work in `/tmp/opencode/theme-separation` @ `0257a5e`.
- WS2 branch: `fix/account-tab-final`. WS3 branch: `fix/guard-hardening`. Push branches (no main merge — user approves merge/deploy separately).

## Review Focus

- WS1 proposal: concrete file map (what theme-specific code lives in shared files today), Elementor-like target with file-level moves, effort/risk per move, what NOT to move.
- WS2: back button after tab click restores prior tab OR documented replace-semantics with test proving the chosen behavior; direct `?tab=` paints correct tab; no history spam; invalid tab → orders.
- WS3: forbidden import fails fast with a clear message at lint AND test level; zero false positives on engine→theme direction (engine importing theme registry is allowed) and test files.

---

### WS1: Theme/editor separation audit (read-only, report)

**Files:** NONE modified. Report to `/tmp/opencode/theme-separation/.ws-reports/separation-audit.md` (create dir).

- [ ] Map every theme-specific symbol in shared files (`components/builder/*.tsx`, `components/store/*`, `lib/builder-ast.ts`): songoskriti/somvabona branches, renderers, skins hooks.
- [ ] Map theme-owned dirs (`lib/themes/<name>/`, skins, tokens, preview sources) and what they already override cleanly (defaults, skins, builders).
- [ ] Propose Elementor-like target: engine widget registry + base widgets; per-theme renderer registration; what moves file-by-file; effort/risk; explicit DO-NOT-MOVE list.
- [ ] Report only. No commits.

### WS2: Account tab behavior, finished

**Files:** Modify `src/routes/account.tsx`, `src/routes/store.$slug.account.tsx`, `src/lib/account-tab.ts` (+ tests). Branch `fix/account-tab-final`.

- [ ] Step 1: Failing runtime test first — memory-history render (or maximal honest slice): `?tab=wishlist` paints wishlist; tab click writes URL; back restores. RED.
- [ ] Step 2: Implement coherent behavior (click writes `?tab=`, pop re-syncs; decide push-vs-replace with written rationale — no history spam AND back works; both can hold via replace:true + pop-sync only if clicks also keep prior entries... think, then choose and document).
- [ ] Step 3: GREEN. Zero-new-violations. Step 4: commit + push branch.

### WS3: Guard hardening (lint + semantic tests)

**Files:** Modify `eslint.config.ts` (add `no-restricted-imports` patterns banning `src/lib/themes/<A>` imports from `src/lib/themes/<B>` and theme-name literals in shared chrome — precise patterns, no false positives), extend `src/lib/themes/isolation.test.ts` ( ban `parseSection`-dropped twins? no — keep: cross-import walk + catalog identity + chrome literals). Branch `fix/guard-hardening`.

- [ ] Step 1: Failing proof first (temporary violating import in a scratch test? No — assert the rule triggers: add a temporary fixture file violating the pattern, run eslint, observe error, delete fixture).
- [ ] Step 2: Implement rule + extend tests. Step 3: GREEN (eslint + vitest). Step 4: commit + push branch.
