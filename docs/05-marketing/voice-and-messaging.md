# Voice, messaging and bilingual copy (§10.3)

The prose half of the copy system. The enforced half is `src/lib/brand-voice.ts`
plus `src/lib/copy-quality.contract.test.ts`, which runs on every build through
`bun run test:contracts`. If a rule below is not checkable there, treat it as
advice; if it is, treat it as a build gate.

## Message hierarchy

1. **Promise** — Run a real online store in Bangladesh without stitching four
   tools together.
2. **Proof** — bKash, Nagad, Rocket, bank transfer and cash on delivery;
   bilingual storefront; catalog, orders and POS in one admin; prices in BDT.
3. **Objection handling** — no lock-in (CSV export at any time), no invented
   numbers on the marketing site, status and incident history in public.
4. **Ask** — start a trial, or open the demo store.

Every marketing page answers 1→4 in that order. A section that does not serve
one of the four is cut.

## Voice rules

- **Say the fact, not the feeling.** "Settles bKash payouts on the next
  business day", not "seamless payments".
- **Numbers or nothing.** A comparative ("faster", "cheaper") needs a figure in
  the same sentence. This is enforced (`voice.unquantified`).
- **No hype vocabulary.** The banned list lives in `BANNED_HYPE`. Additions are
  welcome; removals need a reason in the PR.
- **No promises we cannot evidence.** "Guaranteed", "unlimited", "100% uptime"
  and friends are blocked (`voice.unsupported-claim`).
- **No exclamation marks.** Anywhere, in either locale.
- **Short sentences.** 28 words maximum; the auditor warns past that.
- **Money always carries a currency.** `৳1,200` or `BDT 1,200` — never `Tk`,
  never a bare number in pricing copy.
- **Second person for the merchant, third person for the shopper.** "Your
  store", "a shopper who abandons a cart".

## Bangla is not a translation layer

- Every dictionary key ships `bn`. An empty Bangla string fails the build.
- Bangla identical to English fails unless the string is a brand or protocol
  noun on `LOCALE_IDENTICAL_ALLOWLIST` (Framique, bKash, POS, CSV…).
- Placeholders (`{count}`) must match between locales, or interpolation silently
  drops a value in one language.
- Prefer Bangla words over transliteration: ব্যবহারকারী not ইউজার, সমাধান not
  সলিউশন. Warned by `bangla.transliteration`.
- Bangla copy is written, not machine-translated, and reviewed by a Bangla
  speaker before it ships.

## Legal documents and NAP

- `src/lib/legal.ts` is the only place the business Name, Address and Phone
  exist. The footer, the contact page, the legal pages and the Organization
  JSON-LD all read that object, so they cannot disagree — a mismatch is the
  most common local-SEO defect and is asserted against in the contract test.
- Five documents ship bilingually: terms, privacy, refund, cookies,
  acceptable-use. Each carries a `version` and an `effective` date because
  consent records store the version a merchant agreed to.
- Legal text is a static module, not a database row: it must diff in review and
  must render when every backend read is failing.
- Unknown `/legal/:doc` slugs render the current index with `noindex` rather
  than a dead end.

## Microcopy

Shared strings live under `common.*`: `common.error.generic`,
`common.error.rate_limited`, `common.offline`, `common.nothing_yet`,
`common.try_again`, `common.saved`. Rules:

- An error says what failed **and** what happened to the user's data
  ("Nothing was saved").
- A rate-limit message names the wait in seconds.
- An empty state names the next action, never just "No data".
