# Spec Delta

## Purpose

Design and motion system: FB Blue + calm pink tokens, Inter + Noto Sans
Bengali, 8pt grid, 44px targets (DESIGN.md is token truth), with Hallmark
anti-slop discipline and a budgeted, reduced-motion-safe motion layer.

## Requirements

### Requirement: Token truth

Colours, fonts, spacing, and shadows SHALL come from named tokens; inline
hex/OKLCH values and mid-render font declarations are forbidden in new
storefront CSS.

#### Scenario: Token gate

- **WHEN** a theme ships `skins.css`
- **THEN** every value references a token variable and the suite's
  hex-literal check passes

### Requirement: Honest motion budget

Motion SHALL animate `transform`/`opacity` only, cap at three primitives
per page, use exponential easings, and collapse under
`prefers-reduced-motion` (shared observer + rAF ticker + page budget
in `motion-runtime.ts`).

#### Scenario: Reduced motion honored

- **WHEN** the OS requests reduced motion
- **THEN** spatial motion collapses to ≤150ms crossfades and functional
  state changes are preserved

### Requirement: No fabricated content

Stat-led layouts, testimonials, counts, and contact rows SHALL use real
numbers, labelled placeholders, or omission — never invented metrics.

#### Scenario: Illustrative review labelled

- **WHEN** a theme ships sample testimonial copy
- **THEN** it is labelled illustrative, never "Verified buyer"
