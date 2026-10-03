# Spec Delta

## Purpose

Headless storefront runtime: token-driven section rendering for catalog,
product, collection, cart, checkout, search, account, page, and blog
templates with demo-data preview, SEO/JSON-LD, and responsive gates.

## Requirements

### Requirement: Token-driven rendering

Storefront presentation SHALL derive from published `ThemeTokens` via CSS
variables; renderers SHALL NOT hardcode brand literals or per-theme
conditionals outside key-driven config.

#### Scenario: Cross-theme leak fails

- **WHEN** a shared renderer names a theme brand
- **THEN** `isolation.test.ts` fails the suite

### Requirement: Imageless-first defaults

Theme-authored sections SHALL render complete with copy only; media slots
degrade to neutral placeholders and merchant photography drops in 1:1.

#### Scenario: Fresh install renders

- **WHEN** a theme installs with no merchant images
- **THEN** every homepage section renders copy-complete with placeholders
  and zero broken image requests

### Requirement: Performance and responsiveness gates

Storefront routes SHALL pass perf budgets, responsive sweeps (320/375/414/
768px, no horizontal scroll), and console-error gates before release claims.

#### Scenario: Mobile viewport clean

- **WHEN** the homepage renders at 390px
- **THEN** there is no horizontal overflow, targets are ≥44px, and images
  use `minmax(0,1fr)` tracks
