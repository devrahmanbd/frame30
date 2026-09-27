# Theme Independence + Dynamics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each theme fully dynamic, self-contained, and independent — no theme imports or shares template code/functions with another theme; all user strings twinned; shared chrome contains zero per-theme branches.

**Architecture:** Twin-gap fill in theme builders; own catalog per theme (drop alias); theme-chrome port (per-key header config with generic default) replacing slug conditionals; shared account-tab URL sync primitive reused by both account routes.

**Tech Stack:** TypeScript ESM, React SSR tests, Vitest. No new deps.

**Spec:** REPORT.md Part 2 §§A–D + user ruling 2026-09-26: "a theme should not use or share any template code or function from another theme."

## Global Constraints

- Bun ESM, no `require()`; pure client-safe nav/lib untouched unless needed.
- Bilingual flat `key`/`key_bn`; bn→en fallback, never blank.
- Tokens-only styling (SYSTEM.md §7): no `bg-[#...]`, no `text-white`, no raw hex in components. Skins raw-hex: leave stylesheets alone (policy undecided), but NO new raw hex.
- TDD red→green per task; zero NEW lint/typecheck violations vs origin/main per file.
- No `.github/` changes. Work in `/tmp/opencode/theme-independence` @ `0b7d4eb`, branch `fix/theme-independence`, push after each task.
- Isolation invariant: no file under `src/lib/themes/<A>/` may import from `src/lib/themes/<B>/` (prod code; tests may cross-reference). Guard with a committed test.

## Review Focus

- Somvabona preview/catalog rows read as everyday-cotton, never heritage-silk titles.
- Songoskriti BN renders zero EN user strings in hero/menus/badges/promises/testimonials/journal/footer (brand literals like "Cash on Delivery" exempt if documented in-test).
- Shared StoreHeader output byte-identical for non-theme paths (existing tests + new regression pins).
- Account `?tab=` deep link + back/forward switch tabs on both account routes.
- `?focus=` preview contract untouched; generic fallback intact.

---

### Task 1: Songoskriti twin gaps (new 7f419d4 content)

**Files:** Modify `src/lib/themes/songoskriti/homepage.ts`, `footer.ts`, `header.ts` (wherever EN-only menu/badge/promise/testimonial/journal/eyebrow strings live); Test: extend `src/lib/themes/songoskriti/wiring.test.ts` (or new `locale-parity` test asserting every user-facing string prop in emitted sections has a non-empty `_bn` twin, exempting documented brand literals).

- [ ] Step 1: Write failing test enumerating emitted sections' string props missing `_bn` twins.
- [ ] Step 2: Run — RED with the list.
- [ ] Step 3: Author `_bn` twins for every flagged user string (menus, badges, promises, testimonials incl. names/roles Ajax? names are proper nouns — twin roles/quotes only where real Bangla exists; quote bodies need translation — author them).
- [ ] Step 4: GREEN. Step 5: commit `fix(i18n): songoskriti twin gaps` + push.

### Task 2: Somvabona own catalog (drop SONGOSKRITI alias)

**Files:** Modify `src/lib/demo-catalog.ts` (add `SOMVABONA` catalog, everyday-cotton positioning: cotton panjabi/kurta/saree/baby lines, collections new-in/festive/wedding/gifting + categories women/men/kids/living); register in `DEMO_CATALOGS` replacing alias. Test: extend catalog/preview tests asserting somvabona rows carry no heritage-silk titles and resolve women/festive/wedding.

- [ ] Step 1: Failing test (somvabona rows ≠ songoskriti titles; women category resolves).
- [ ] Step 2: RED. Step 3: catalog with ≥8 products across women/men/kids/living, BDT minor units, `/ph/somvabona/*` art paths. Step 4: GREEN (incl. existing preview suites). Step 5: commit + push.

### Task 3: De-gate shared StoreHeader + tokenize badge

**Files:** Modify `src/components/store/StoreHeader.tsx`, new `src/components/store/theme-chrome.ts` (per-key header config: logo node kind, mega-menu source, toggle placement, text-logo color token — generic default; songoskriti registers its config, no other theme may). Fold badge tokenization + dedup (one component, token classes) into this task.

- [ ] Step 1: Failing/pinning tests — rendered output for generic + songoskriti paths pinned BEFORE refactor (snapshot key strings), badge token classes asserted (no `bg-[#`, no `text-white`).
- [ ] Step 2: Run — RED on token assertions.
- [ ] Step 3: Move `isSongoskriti` branches behind config port; single badge component with token classes.
- [ ] Step 4: GREEN, output identical except badge classes. Step 5: commit + push.

### Task 3b: Songoskriti renderer i18n switch (NEW — from Task 1 review)

**Files:** Modify `src/components/builder/songoskriti.tsx` (`SongoskritiCollectionStory` title/subtitle → `readBn`; hardcoded `"OUR STORES"` → eyebrow prop with `_bn`; `NAV_ITEMS`/`MEGA_MENU_DEFS` labels → `_bn`-capable; wishlist aria-label → locale-pick). Test: extend BN-render proof to `collection_story`/`store_locator`.

- [ ] Steps 1-5 standard (RED/GREEN/commit `fix(i18n): songoskriti renderer reads twins` + push).

### Task 4: Account tab URL sync (both routes)

**Files:** Modify `src/routes/account.tsx`, `src/routes/store.$slug.account.tsx` (sync tab state from `search.tab`, same effect pattern as preview frame). Test: extend `account-tab.test.ts` or route-level test asserting tab follows search change.

- [ ] Steps 1-5 standard (RED/GREEN/commit `fix(account): tab state syncs from URL` + push).

### Task 5: Isolation guard + verify

**Files:** New `src/lib/themes/isolation.test.ts`: (a) walk theme dirs, fail on any prod import of another theme dir; (b) assert somvabona catalog object identity ≠ songoskriti; (c) assert no `songoskriti`/`somvabona` string literals in shared `StoreHeader.tsx`/`chrome.tsx` — REQUIRED: repoint `CollectionView.tsx` import to `./theme-chrome` and drop the `SONGOSKRITI_MEGA_MENU` re-export (deferred from Task 3); (d) assert `?focus=` contract + generic fallback intact via existing suites.
- [ ] Steps 1-5 standard. Then final: full touched suites GREEN, zero-new-violations, branch pushed == HEAD.
