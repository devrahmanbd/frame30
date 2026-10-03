# Marketplace review policy

Last verified: 2026-10-03 @ d95316b6

This guide covers the two trust halves of a marketplace submission: what gets
rejected on sight ([no-plugin-territory](#1-no-plugin-territory-rule-c6)) and
how a submission moves through review ([review process](#2-review-process-c8)).
For the build path read [the plugin guide](plugins.md) or
[the third-party theme guide](themes.md); for package gates read
[the theme package spec](../themes/packages.md); for the API surface read
[the SDK guide](sdk.md).

## 1. No-plugin-territory rule (C6)

Themes present the storefront; platform rails and scoped plugins behave in
it. A theme submission must not take over work that belongs to another
layer. The following five rejections are locked policy: they are applied in
human review, not by an automated gate. No rule in
`src/lib/publish-gates.ts` checks for them — that module covers contrast,
skeleton parity, interactive naming, status signaling, and motion budgets
only (for example `contrastGate` in `src/lib/publish-gates.ts:161`,
`skeletonParityGate` in `src/lib/publish-gates.ts:181`,
`interactiveGate` in `src/lib/publish-gates.ts:419`,
`statusGate` in `src/lib/publish-gates.ts:536`,
`reducedMotionGate` in `src/lib/publish-gates.ts:629`, and
`motionBudgetGate` in `src/lib/publish-gates.ts:680`).

| #   | Locked rejection reason | Why it is rejected                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Payments logic          | Pricing, charging, discount math, and payment credentials belong to the platform and to explicitly consented plugin scopes. A theme that prices or charges can skim, double-bill, or bypass the consent ledger, and no theme gate audits money flow. Monetization rules for plugins are documented in [the plugin guide](plugins.md#charge-for-plugins-with-the-one-time-and-trial-rails). |
| 2   | SEO meta injection      | Per-page search metadata is merchant-owned data: seeding never overwrites merchant-authored copy (`src/lib/themes.server.ts:742-743`). A theme that writes `seo_meta` rows would silently replace copy the merchant already approved and published.                                                                                                                                        |
| 3   | Tracking pixels         | Third-party scripts need explicit merchant consent and a contained failure surface. Unreviewed pixels exfiltrate shopper data and break the consent story, so they are rejected at review instead of auto-detected.                                                                                                                                                                        |
| 4   | Auth forms              | Sign-in, account, and credential handling are platform-owned surfaces with their own threat model. A theme that collects credentials inherits phishing and storage liability the review gate cannot verify.                                                                                                                                                                                |
| 5   | Custom post types       | Content shape is a closed, catalogue-known vocabulary so every node stays editable, validated, and round-trippable. Bespoke types break the persist contract and the studio twin, so they are rejected rather than partially supported.                                                                                                                                                    |

## 2. Review process (C8)

### Per-gate checklist output

Publishing assembles one composed gate. `composePublishGate` in
`src/lib/publish-gates.ts:766` returns `{ ok, failures, warnings, perf,
responsive, a11y, motion }` (`src/lib/publish-gates.ts:858-862`), and every
failure is a `GateFailure` with a stable machine code
(`src/lib/publish-gates.ts:52-56`) that CI prints and tests assert on. The
merchant publish path feeds it lint errors per template
(`src/lib/themes.server.ts:430-434`), translation coverage
(`src/lib/themes.server.ts:437-439`), and font licence plus budget findings
(`src/lib/themes.server.ts:443-452`); when the gate is not `ok`, the publish
is refused with the first five blocking messages
(`src/lib/themes.server.ts:455-467`).

Browser-side gates cannot run inside a server function, so they block the
release instead of the publish and are declared in the same module so the
two lists cannot drift (`src/lib/publish-gates.ts:715-720`).

### Human scope

Automated gates decide what the theme contains; humans decide what the
listing promises. Submitted marketplace versions wait in the review queue
(`src/lib/marketplace-vault.server.ts:197-205`); moderation sets `active`,
`paused`, or `archived` with a `review_note`, and activating a version moves
the listing pointer to the newest approved one
(`src/lib/marketplace-vault.server.ts:208-236`). Sellers move their own
listings only along `draft → review` and `active ⇄ paused → archived`
(`src/lib/marketplace-install.server.ts:771-777`), enforced in
`sellerTransition` (`src/lib/marketplace-install.server.ts:779-816`).

Only `active` listings install
(`src/lib/marketplace-install.server.ts:67-71`), and a pinned install
version must itself have `status = "active"`
(`src/lib/marketplace-install.server.ts:224-225`) — moving the pin re-runs
review.

TBD: reviewer identity requirements, review SLA, and whether rejections
carry structured codes beyond `review_note` are not pinned in code.

### Resubmission and semver

Versioning lives in `src/lib/marketplace-scopes.ts` (`parseSemver` in
`src/lib/marketplace-scopes.ts:155-159`,
`isForwardVersion` in `src/lib/marketplace-scopes.ts:168-173`): a new
submission must move strictly forward from the latest known version, and
breaking scope additions belong on a major bump
(`src/lib/marketplace-scopes.ts:175-181`). The vault enforces it —
non-forward versions throw `market_version_not_forward`
(`src/lib/marketplace-vault.server.ts:123-125`) — while resubmitting
identical bytes returns the existing row instead of a duplicate
(`src/lib/marketplace-vault.server.ts:108-121`). New rows land on
`status = "review"` (`src/lib/marketplace-vault.server.ts:139`). For theme
resubmissions specifically, follow
[the theme update checklist](themes.md#submit-updates-without-breaking-stores),
which requires a semver bump on every resubmission, rejections included.

### Appeal path

Platform enforcement appeals run in the same ticket thread and are reviewed
by someone who did not make the original decision
(`src/lib/legal.ts:366-367`; full section in `src/lib/legal.ts:361-373`).

TBD: whether marketplace listing rejections share that ticket thread or a
dedicated appeal queue is not pinned in code — do not assume either.
