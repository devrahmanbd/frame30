# Phase 4 — the evidence record: dynamic themes (composable widgets, one pipeline, and the proof the lanes could produce)

**Branch:** `frame30` · **Base commit:** `109e2d3d` · **Tip at the time of writing:** the tip of the docs batch (this record, the escalation record's closing statements, the plan's shipped state and `report.md`'s update — the four commits `2eba4db1`, `210a2228`, `3753eaf3` precede it)
**Recorded:** 2026-10-22
**Plan:** `docs/superpowers/plans/2026-10-22-frame30-dynamic-themes.md` — Tasks 1–7, with the shipped state and the three gate rulings recorded at the plan's own "The shipped state" section
**Escalation record (every §7 relaxation, with the exact diffs):** `docs/superpowers/songoskriti-evidence/port/phase4-dynamic-themes-escalation.md` — §(a)–§(m)
**Obsolete-path record (O1–O8, with citations):** `docs/superpowers/songoskriti-evidence/port/phase4-dynamic-themes-obsolete-paths.md`

---

## 0. How to read this record

This record states **what shipped, how it was verified, and what is still
open**. It is deliberately conservative: where a number is a measurement, the
command that produced it is named; where something was **not** verified here,
it says so and says why. One finding is **reported, not absorbed** — the
publish refusal (§2.7). The two things this programme could not prove are
stated in §3, not hidden.

---

## 1. What shipped

**Thirty commits** on `frame30`, from `109e2d3d` to `3753eaf3` —
**twelve** that carry the code, and the **eighteen** record commits of the
append-only escalation record — plus the **docs batch** (this record, the
escalation record's closing statements, the plan's shipped state and
`report.md`'s update) at the tip. Every subject, in order:

| #     | commit                                         | what it landed                                                                                                                                                                                                                                                                                                |
| ----- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `3ca5e8ad`                                     | **feat(widgets)** — the composable `parts` contract (`src/lib/widget-parts.ts`), the four `account_*` catalogue rows, the `parseSection`-declared `parts`/`layout` fields, the part order in the six renderers, the account provider and its four panels, the dashboard as the provider's default composition |
| 2     | `4b522b93`                                     | **feat(theme)** — the cart, checkout and account compositions rebuilt on the composable pieces; the presentation claims extended to the ten commerce/account types; the account route's provider mount and grants; the G2 grant on the search route                                                           |
| 3     | `21907047`                                     | **feat(studio)** — one resolution pipeline (`src/lib/pipeline-resolver.ts`): the editor canvas, the preview and the storefront agree; the synthesis deleted; D1/D2/D3/D5 closed                                                                                                                               |
| 4–5   | `246f6634`, `8d8e6b89`                         | the escalation record's §7.1 corrections and the theme-path compatibility measurement (docs only)                                                                                                                                                                                                             |
| 6     | `5f283eb1`                                     | **fix(theme)** — the review must-fixes closed, preview safety pinned by behaviour (`src/lib/preview-safety.contract.test.ts`), the shared "no rail" state, the disabled action, the anonymous-account explicit state, D8's shared constant                                                                    |
| 7–8   | `ecbadffb`, `4886fae8`                         | the full-programme boundary statement and its arithmetic correction, the re-measured compatibility (docs only)                                                                                                                                                                                                |
| 9     | `0ebaaa5b`                                     | **fix(storefront)** — the declined-template regression the review found (a `null` payload loses the whole theme) fixed at the pure payload seam; the pins pinned by behaviour                                                                                                                                 |
| 10–13 | `eb2fca23`, `f1df5135`, `8b688890`, `ab432e0e` | the proof lane's records: every beyond-G1 file one line per file, the marker's final clause form, the `.e2e` edits named before the edit (docs only)                                                                                                                                                          |
| 14    | `d9e4774e`                                     | **test(e2e)** — the cart, account and checkout journeys strengthened to prove the **storefront matches** (+1 183 lines across the helper, the specs and the distinctness-dynamic suite)                                                                                                                       |
| 15    | `7a237c8e`                                     | the proof lane's applied diffstat and commit names (docs only)                                                                                                                                                                                                                                                |
| 16    | `c0f4059f`                                     | the seven-template lane's measured corrections, recorded **before** the edit (docs only)                                                                                                                                                                                                                      |
| 17    | `34d2fa1c`                                     | **fix(e2e)** — the journey reads the served storefront, not the editor canvas                                                                                                                                                                                                                                 |
| 18    | `9e41c496`                                     | the second live run's lane corrections, recorded **before** the edit (docs only)                                                                                                                                                                                                                              |
| 19    | `25e5e494`                                     | **fix(e2e)** — the layer navigator and the product buy box hydration                                                                                                                                                                                                                                          |
| 20    | `fc262b79`                                     | the §(k.4) record's commit naming (docs only)                                                                                                                                                                                                                                                                 |
| 21    | `fb0dad77`                                     | the storefront-surfaces lane corrections, recorded **before** the edit (docs only)                                                                                                                                                                                                                            |
| 22    | `64199757`                                     | **fix(e2e)** — the facet heading selection and the checkout total's precondition                                                                                                                                                                                                                              |
| 23    | `7085eb27`                                     | the §(k.6) record's commit naming (docs only)                                                                                                                                                                                                                                                                 |
| 24    | `45b5c900`                                     | the parity stills classified and the re-freeze authorised (docs only)                                                                                                                                                                                                                                         |
| 25    | `c565f0d0`                                     | **chore(songoskriti)** — the parity baselines **re-frozen** for the rebuilt theme compositions (before-stills preserved in git history and `/tmp/opencode/e2e-auth/parity-before/`)                                                                                                                           |
| 26    | `9f6b52ab`                                     | **docs(evidence)** — the parity freeze and its clean re-run recorded (§(k.7))                                                                                                                                                                                                                                 |
| 27    | `a19e25b5`                                     | **docs(record)** — the search route's build-blocker fix named **before** the edit (§(k.8))                                                                                                                                                                                                                    |
| 28    | `4eef8f5c`                                     | **fix(search)** — the build blocker resolved: the widget batch resolved through the existing `createServerFn` RPC, **not** a `.server` import (the record §(k.8), `a19e25b5`, preceded it)                                                                                                                    |
| 29    | `2eba4db1`                                     | **docs(record)** — the Task-6 stale-comment re-word in the compositions test named **before** the edit (§(l))                                                                                                                                                                                                 |
| 30    | `3753eaf3`                                     | **chore(cleanup)** — the checkout mock removed, proven unused; the obsolete-path dispositions recorded                                                                                                                                                                                                        |

**The measured size of the change:** `git diff --shortstat 109e2d3d..3753eaf3` →
**153 files changed, 15 750 insertions(+), 1 794 deletions(-)** — of which the
phase-4 escalation record (~5 000+ lines) is the single largest file.

**No new npm dependency, no lockfile change, no migration, no DDL, no new
environment variable.** `THEME_API_RANGE` stays `^3.0.0`,
`BUILDER_API_VERSION` stays `3.1.0`; the only per-key rule remains
`templates.archive_requires_api` (the escalation record's §(m.1) states the
package contract verbatim).

### 1.1 The three surfaces, and what each one now is

| surface    | what shipped                                                                                                                                                                           | the platform's authority, unchanged                                                                                                                   |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cart`     | the theme's composition places `cart_lines` / `cart_summary` with **authored parts orders** over the closed vocabulary; the preview shows the authored body over labelled demo data    | the lines, the totals, the rails, the server quote's minor units (`ctx.money`)                                                                        |
| `checkout` | the theme's body composes the progress trail, the payment block and the order summary; the route supplies its own picker and summary when the theme carries neither (D8's shared copy) | the form, the customer fields, the server quote, the stock hold, the order write, the payment rails — the route's disabled action when no rail exists |
| `account`  | the four `account_*` panels are placeable through the provider (`AccountDashboardContext`); the dashboard is the provider's default composition; the anonymous state is explicit       | the session, the `customer_overview` RPC, every write; a panel with no provider renders nothing and fetches nothing                                   |

And **the engine's hosts agree**: the editor canvas, the preview and the
storefront resolve **one** pipeline (`draft` / `published` / `source`, each
labelled); a template the theme does not author is an **explicit absent
state** on every host — the preview's named panel, the storefront's platform
surface inside the **named** declined frame (`data-fq-theme-state="declined-template"`),
the publish gate's warning text told **by name**.

---

## 2. How it was verified

### 2.1 The unit and contract suites

`node_modules/.bin/vitest run` — **633 test files: 630 passed, 1 skipped, 2
failed. 8 975 tests: 8 969 passed, 3 skipped, 3 failed** (the programme's own
docs-batch run, 2026-10-22).

The three failures are **pre-existing and environment-bound**, and they are
**not** this programme's — they are the same three the prior programme
recorded, failing at this programme's base commit too:

- `src/lib/analytics-live-shape.test.ts` (2) — the fake warehouse rows do not
  match this box's warehouse shape.
- `src/lib/site.server.test.ts` (1) — the "missing-env" guard needs the local
  `.env`.

**The count is read from the run, not assumed** — identical headline counts to
the Task 5b run (`…/task-5b-report.md`: 633 files / 8 975 tests), i.e. the
cleanup commit and the docs batch moved no test count.

### 2.2 The browser lanes (the throwaway stack — never the configured database)

| lane                    | outcome, reported as measured                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **seven-templates**     | **8/8 passed, 0 retries, 8.3 m.** The authenticated editor journey changes a real inspector property, saves, reloads, publishes, and then asserts the **changed composition on the served storefront** — the lane's own first version asserted on the editor canvas (§(k.1)); the correction is recorded before the edit and the assertion now targets the served route.                                                                                                                                                                                                                                                                                                                                                                                      |
| **storefront-surfaces** | **9 passed, 1 skipped, 1 flaky, 6.7 m.** The **skip is honest**: _the disposable store offers no payment rail, so the checkout's permitted interaction cannot be proven._ The **flake** is the auth stack's own login throttle — `Locked · Retry in 44s` after ~11 real logins in one run; the retry passed and the case is reported as a flake, not a pass. The permitted-interaction cases added by this programme (the facet heading, the cart-line precondition) are the ones that exposed the lane's own two defects (§(k.6)), both fixed after being recorded.                                                                                                                                                                                          |
| **dynamic-themes**      | **1 passed, 3 skipped, 3.1 m.** The single passing case is the session-proof case (_no session is ever faked_). **Two skips are the platform's publish refusal** — _বাংলা translation coverage is 63% — publishing needs at least 90%_ — reported as skips, never converted into passes. The app log carries **three** `theme.publish_blocked codes=translation` events during the run (19:19:39, 19:20:41, 19:21:32 UTC), i.e. all three journeys reached the real publish modal and the platform refused. The published pointer was read before and after and asserted **unchanged** (`1dde62b3-614a-4f7e-8a0b-752551b6aeaf`, version 1). The checkout's case skips earlier on its rail precondition; its publish attempt was the third refusal in the log. |

### 2.3 The distinctness gate, re-run over the new compositions

`vitest run` over the three gate suites —

- `src/lib/themes/songoskriti/template-distinctness.archive.test.ts` (9)
- `src/lib/themes/songoskriti/distinctness-dynamic.test.ts` (5, the +249-line suite)
- `src/lib/themes/songoskriti/template-distinctness.test.ts` (9)

→ **Test Files 3 passed (3) · Tests 23 passed (23)**. The `cart`, `checkout`
and `account` rows follow the new compositions, and the _"every template a
theme does not author is rejected as generic"_ loop is re-run over the
resolver — which is now **trivially true the other way**: a template the theme
does not author stays absent, and the gate measures `genericDemoMain` as the
reference body the theme must out-differ.

### 2.4 The parity lane — classified, then re-frozen on the throwaway stack

- **First run** (`--retries=0`): **39 passed, 27 failed, 1 skipped** — the run
  was **rejected**. Each of the 27 failures was classified **still-by-still**
  as exactly the ratified theme-path change: 21 stale ratios (0.03–0.12) plus
  six missing `archive-{1440,768,375}-{en,bn}` stills. The classification and
  its report are `…/parity-report.md` + `…/classification.md`; the record's
  §(k.7) carries the decision.
- **The re-freeze** happened on the **throwaway stack** (never the configured
  database), with the **before-stills preserved** in git history and at
  `/tmp/opencode/e2e-auth/parity-before/`. One discipline was enforced: the
  first throwaway run overwrote **25 tracked `reference/` stills**, restored
  from git before the freeze; the freeze then ran clean.
- **Freeze run: 66 passed, 1 skipped, 0 failed (8.3 m). Verification run (no
  `--update-snapshots`): 66 passed, 1 skipped, 0 failed (8.1 m).** The one
  skip is the suite's own pre-existing documented bn-drawer case.
- The committed manifest carries the freeze stamp; the freeze commit is
  `c565f0d0`.

### 2.5 The compatibility measurement — the platform path is byte-identical

The rule: _a change is compatible when a stored AST written before it renders
byte-identically after it._ Measured across the programme (the generated id is
normalised; the harness reconstructs the earlier captures byte for byte):

| surface  | platform path at `109e2d3d` | at the programme's tip | verdict            |
| -------- | --------------------------: | ---------------------: | ------------------ |
| cart     |                     1 847 B |                1 847 B | **byte-identical** |
| checkout |                    33 157 B |               33 157 B | **byte-identical** |
| account  |                       718 B |                  718 B | **byte-identical** |

The **theme presentation path is the ratified visual change** (§(h.7)): the
theme's own compositions replace the platform's generic renders on the theme
path — cart **1 847 → 1 492 B** (25 → 22 tags), checkout **33 157 → 33 120 B**
(tag count and char-count rows unchanged), account **8 936 → 9 047 B** (83 →
86 tags). And the **declined-template** storefront surface's total diff is
**one insertion** — the named frame's `data-fq-theme-state` attribute.

### 2.6 The local gates and the build

| gate                                            | measured outcome                                                                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `node_modules/.bin/tsgo --noEmit`               | exit 0, no output (run after Task 6's edits and again for the docs batch)                                                                                    |
| `node_modules/.bin/eslint src scripts`          | exit 0 — **0 errors**, 325 pre-existing warnings (the same count at the Task 5b tip)                                                                         |
| `node scripts/doc-gate.mjs`                     | **0 findings**, exit 0                                                                                                                                       |
| the asset gate (`songoskriti-assets-check.mjs`) | **GREEN** — 0 findings, 11 advisory notes, 21 assets                                                                                                         |
| `node_modules/.bin/vite build` (at `4eef8f5c`)  | **exit 0** — `.output/` **56 MB**, **1 341** files: client JS **5.59 MB**, server **14.61 MB**                                                               |
| Task 6's neighbouring suites (4 files)          | **Test Files 4 passed (4) · Tests 115 passed (115)** (`songoskriti-preview-compositions`, `ThemePreviewFrame`, `template-distinctness`, `theme-preview-nav`) |

### 2.7 The boundary the platform itself drew — the publish refusal, reported not absorbed

The dynamic lane's **edit → save → reload → server-truth → publish-modal**
chain is proven. The **next step is the platform's own refusal, and the lane
stops there on purpose**: `theme.publish_blocked codes=translation` —
**63 %** বাংলা coverage against the **90 %** floor
(`TRANSLATION_PUBLISH_FLOOR = 90`, `src/lib/builder-guardrails.ts:148`).
The refusal is the **intended behaviour**; the short proofs:

- the reason surfaces **verbatim** in the modal and in the lane's skip message;
- the app log carries the `theme.publish_blocked` event for every attempt;
- the published pointer was asserted **unchanged** before and after;
- the lane **never converts the refusal into a pass**, and the suite is not
  weakened for it.

Therefore: **"the merchant's edit is visible on the storefront after a
publish" is NOT PROVEN in this programme.** The coverage number is
**63 %**, **lower** than the 76 % the prior evidence measured for the same
theme — this programme's own added copy moved it — and it is an **owner
action** (§3). The floor was not lowered and the translations were not
touched. The checkout's third attempt was also refused, but its case skips
earlier on its rail precondition.

---

## 3. The open items, named

1. **The post-publish storefront proof is owed (owner decision).** The
   platform refuses at 63 % vs the 90 % floor (§2.7). A green dynamic lane on
   the throwaway stack after the owner closes the translation gap (or rules a
   source-installed official theme exempt) is the acceptance evidence this
   programme could not produce.
2. **The auth-throttle flake.** The surfaces lane logs in through the real
   form in every test (11 logins per run); the platform's login lock makes the
   last case intermittently flaky. Session reuse across tests would fix it but
   changes helper semantics; left as a **reported flake**.
3. **The route comment's stale line numbers.** The search route's comment
   cites `widget-data.functions.ts:43-74` (pre-fix numbering; the
   `createServerFn` now sits at `:69`). Correcting it means a third commit
   cycle on a §7-pinned file for a doc nit — **deferred**.
4. **The remote CI run is UNVERIFIED-FROM-HERE.** Nothing is pushed:
   `origin/frame30` and `origin/main` still sit at `109e2d3d`. Every gate CI
   runs was run locally (§2.6); no claim of a green remote run is made.
5. **Carried from the prior programme, and unchanged here:** the
   merchant-scoped archive route is still deferred (§5.3 #5 of `report.md`);
   the distinctness gate's expectation table is still Songoskriti's (D3 stands
   in substance — the gate's _machinery_ was re-verified across the new
   compositions in §2.3).
