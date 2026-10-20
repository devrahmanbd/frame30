# Phase 2 — Template completeness: verification evidence

**Branch:** `frame30` · **Base commit:** `a48253c8` · **Opened:** 2026-10-21
**Plan:** `docs/superpowers/plans/2026-10-20-songoskriti-template-completeness.md`
**Binding escalation record:** `docs/superpowers/songoskriti-evidence/port/phase2-template-completeness-escalation.md`
**Governing spec:** `docs/superpowers/specs/2026-10-18-songoskriti-unified-port-design.md` §7 (Boundary) and §9 (Testing & evidence)

**This file is APPEND-ONLY and is written in two hands.** The plan's Task 11 writes
§A–§F into this same file — what shipped, the acceptance walk-through, what was
deliberately not changed, the parity impact, the deferred items and the commands to
reproduce. The Batch-B fix round (2026-10-21) appends **§G — the open items** and
**§H — the stale artifacts** below. Task 11 must not drop them, and the Batch-B round
must not overwrite Task 11's sections.

---

## (G) OPEN items — defects found, recorded, and NOT fixed

### (G.1) The platform's `payment_methods` widget renders no payment-method radios — **OPEN**

**What is broken.** The platform's `payment_methods` widget renders its fieldset and its
legend ("Payment method") and **no payment-method radios at all**. The widget reads
`const grouped = groupMethods(cart.methods)` and then indexes that value **by group
name** — `const keys = (grouped[group] ?? []) as PaymentMethodKey[]`
(`src/components/builder/cart.tsx:560`, `:584`) — but `groupMethods()` returns an
**array** of `{ layer, methods }` objects (`src/lib/payment-rails.ts:358-363`), not a
map keyed by group. `grouped[group]` is therefore **always `undefined`**, the `?? []`
fallback makes every group empty, and every group renders `null`
(`src/components/builder/cart.tsx:576-617`). The shopper is offered no way to choose a
payment method.

**Where it shows.** In the theme preview's checkout tab (the authored checkout body
grants the `payment_methods` slot, so the widget renders) **and on the live
checkout** — the live checkout renders the same widget, so the defect is not a
preview-only artefact.

**Why it is NOT fixed here.** The fix lives in `src/components/builder/cart.tsx`, which
port spec §7 **prohibits** ("everything else under `src/`"). It is out of scope for
this plan, and §7's rule is "escalate, never edit silently". It is therefore recorded
here and in the escalation record's §(j.3) — **recorded, not fixed**.

**What the preview's test asserts instead.** The preview suite asserts what actually
renders: the theme's own `payment_icons` marks (the "We accept" heading, a brand badge
— `aria-label="bKash"` — and the "Cash on delivery" text chip) and the platform
widget's own legend. It does **not** assert payment radios, because the platform
renders none, and it does **not** assert their absence either — that would pin a
defect into a test. The suite's header comment names this OPEN item so a reader
cannot mistake the marks for the rails.

**What a fix would need.** Either `groupMethods()` returns a map keyed by group name,
or `PaymentMethods` iterates the array it already receives (`grouped.map(({ layer,
methods }) => …)`). Either way the change is in `src/components/builder/cart.tsx` and
needs its own escalation.

### (G.2) The storefront's widget-data delivery is still absent — **OPEN (Decision D7, deferred by the plan)**

Not a defect this plan introduced and not fixed by it: no storefront route mounts a
`WidgetDataProvider`, so the platform's `facet_sidebar` renders nothing on a live
storefront (Decision **D7**; the escalation record's §(b.4)). The search results reach
the storefront through the route's `productSlot` instead, and the platform's own
category/kind chips stay inside the results block. Carried here so the plan's §E is
read together with it.

---

## (H) Stale artifacts — what this work made obsolete

### (H.1) `src/components/store/CheckoutMock.tsx` — **DEAD CODE**

**The artefact.** `src/components/store/CheckoutMock.tsx` (137 lines,
`export function CheckoutMock` at `:4`) was the studio's generic checkout stand-in. The
preview's checkout tab used to render it (`src/components/store/ThemePreviewFrame.tsx:36`,
`:670` at the base commit).

**Why it is stale.** The preview now renders the **theme's authored** checkout body —
the `ast.main` through `SectionRenderer`, with the five cart slots granted — so the
mock is no longer imported and no longer rendered anywhere. A repo-wide grep finds the
symbol in exactly three places: its own definition, and two comments that name it as
the thing the preview no longer uses (`src/components/store/ThemePreviewFrame.tsx:897`,
`src/components/store/songoskriti-preview-compositions.test.tsx:8`). **Nothing imports
it; nothing renders it.**

**It is NOT deleted.** The file is under `src/components/store/**`, which port spec §7
prohibits ("everything else under `src/`"). Deleting it needs its own escalation; until
then it is recorded here as dead code.

### (H.2) The 24 parity captures of the four changed templates — **STALE**

`search`, `cart`, `blog` and `checkout` × 6 widths/locales — 24 of the 60
`docs/superpowers/songoskriti-evidence/port/reference/` captures and the matching 24
machine baselines under `.e2e/songoskriti-port-parity.spec.ts-snapshots/`. The numbers
and the trigger are recorded in the escalation record's §(d): re-freezing `reference/`
rewrites all 60 `reference-manifest.json` entries and is a separate owner-approved step,
and the parity suite is in neither `e2e:critical` nor `e2e:security`, so CI is
unaffected.

**The Batch-B fix round changes the `search` captures again** (the conditional
`empty_state` grant, the demo `productSlot` and the theme's `facet_sidebar` groups all
change the search tab's markup). They were already stale; they are stale for one more
reason, and the count does not change — still 24 of the 60.

---

## Reproducing this round

```
node_modules/.bin/vitest run \
  src/components/store/songoskriti-preview-compositions.test.tsx \
  src/components/store/songoskriti-preview-page.test.tsx \
  src/lib/themes/songoskriti/search-template.test.ts \
  src/components/store/ThemePreviewFrame.test.tsx
```

```
node_modules/.bin/prettier --check \
  src/components/store/ThemePreviewFrame.tsx \
  src/lib/themes/songoskriti/preview.ts \
  src/lib/themes/songoskriti/search-template.test.ts \
  src/components/store/songoskriti-preview-page.test.tsx \
  src/components/store/songoskriti-preview-compositions.test.tsx
node_modules/.bin/eslint <the same five paths>
node_modules/.bin/tsgo --noEmit
```
