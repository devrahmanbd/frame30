# 06 — Payments: Licensing & compliance skeleton

> Companion to `06-payments/README.md` §9. Owns the named-`TBD` inventory for
> BD payment-market entry per `00-meta/README.md` §2 ("no invented numbers;
> named `TBD` with an owner"). Every field below is a **named TBD** until
> platform legal fills it from actual advice — nothing here is a commitment.

## 1. Purpose

- Centralizes every licensing/compliance artifact the corpus deliberately does
  **not** design blind (`audit-verdict.md`: "licensing intentionally
  design-blind"). The one honest "no" in the capability audit.
- When a funding ask or launch gate needs a compliance statement, this file is
  the source; if any field is still `TBD`, that is the answer.

## 2. Decision status

| Field                               | Status          | Owner          |
| ----------------------------------- | --------------- | -------------- |
| `payments.authentication.licensing` | **TBD** (named) | platform legal |

- Status flips per field only with a source: statute/regulation cite, partner
  term sheet, or legal opinion — recorded inline as `source:` on each row.

## 3. Instrument inventory (named TBDs)

| Instrument                             | What it gates                                                     | Status | Owner          |
| -------------------------------------- | ----------------------------------------------------------------- | ------ | -------------- |
| Merchant aggregator / PG licence (BD)  | accepting merchant payments as aggregator                         | `TBD`  | platform legal |
| bKash / Nagad partner-program terms    | wallet payment rails (`mock-mfs` mirror)                          | `TBD`  | platform legal |
| Bank card-scheme rights (card network) | card present/absent acceptance                                    | `TBD`  | platform legal |
| Product-pricing gating                 | how offers/pricing interact with fees (`docs/16-product-pricing`) | `TBD`  | platform legal |

- Each row must carry a `source:` line once filled (e.g. `source: Bangladesh
Bank — Payment Systems, 2026`). Placeholder rows are written as `source: TBD
— not yet in docs` and never invented.

## 4. Sign-off gate (never inferred)

- Live MFS/card join is **sign-off gated**: explicit human approval recorded
  in this file before any production adapter is enabled.
- Until then the signed mock sandbox (`mock-mfs`) is the only wired payment
  rail — see `06-payments/README.md` §4.
- OTP/SMS providers follow the same gate (`03-storefront/accounts.md`).

## 5. Owner & cadence

- Owner: platform legal (single named owner recorded in `00-meta` decision
  log when assigned).
- Re-verify: before every launch-stage funding ask and at the live-sign-off
  gate; `audit-verdict.md` §"Real gaps inventory" item 2 points here.

## 6. Definition of done

- Every row in §3 carries a real `source:` and a status other than `TBD`.
- `audit-verdict.md` flips from "only honest no" to a green compliance line.
- Sign-off gate entry logged (who, when, which instruments).
