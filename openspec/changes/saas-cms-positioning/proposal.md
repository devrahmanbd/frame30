# Proposal

## Why

Framique sells against two incumbents at once: Shopify (hosted commerce SaaS)
and WordPress + WooCommerce (self-hosted CMS ideology). Local (BD) merchants
choose on fees, language, payment rails, and who owns the store when they
leave. This change analyzes the codebase as that combined alternative and
records where the claim is already true in code, where it is UI-deep only,
and what must close for the story to survive a merchant's first week.

## What Changes

Nothing in this change alters runtime behavior. It produces:

1. A scored audit of the codebase on both axes (Shopify-alternative,
   WordPress-ideology) grounded in files, tables, and tests — not marketing.
2. A ranked gap list with the exact server path or missing piece per gap.
3. Follow-up tasks, each scoped as its own future OpenSpec change.

## Capabilities

### New Capabilities

- None (analysis-only change).

### Modified Capabilities

- None (no requirement changes; deltas belong to follow-up changes).

## Impact

Docs only: `openspec/changes/saas-cms-positioning/{proposal,design,tasks}.md`.
`skip_specs: true` is set in `.openspec.yaml` because this change introduces
no requirement deltas. Reader entry points: `openspec/project.md`,
`openspec/specs/*/spec.md`, `AGENTS.md`, `BUILD.md`, `SYSTEM.md`.
