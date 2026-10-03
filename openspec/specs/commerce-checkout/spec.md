# Spec Delta

## Purpose

Zero-fee commerce engine: BDT-first catalog → cart → stepped checkout →
orders → fulfilment, with VAT, promos, COD-abuse fraud gates, and wallet
payouts — all money math server-side in integer minor units.

## Requirements

### Requirement: Integer minor-unit money

Prices, discounts, taxes, and payouts SHALL be stored, transmitted, and
computed as integer minor units with a currency code; floats are forbidden.

#### Scenario: Checkout total

- **WHEN** a buyer checks out with discount + VAT + shipping
- **THEN** the charged total equals the server-computed minor-unit sum and
  the client-submitted total is ignored

### Requirement: Server-side fraud gates

COD orders SHALL pass the server-side abuse rule engine (blacklist,
honeypot, risk review) before confirmation.

#### Scenario: Blacklisted buyer blocked

- **WHEN** a blacklisted phone/identity places a COD order
- **THEN** the order is held or refused with per-method failure copy and an
  audit row

### Requirement: Honest checkout UX

Checkout SHALL show stepped progress, inline validation, per-method failure
copy, and real thresholds (free-ship, stock pills); scarcity microcopy SHALL
use real stock counts only.

#### Scenario: Per-size scarcity

- **WHEN** a size has 1 unit left
- **THEN** only that size shows the low-stock cue and checkout enforces it
