# Third-party developer docs

Start here to build on the platform. Each guide states its scope in
one line below; open the guide for the full contract.

- [Build a third-party theme](themes.md) — brand tokens, closed
  skin vocabularies, homepage composition, token-only stylesheets,
  studio twin parity, preview sources, and submission rules.
- [Build a Framique plugin](plugins.md) — manifest validation,
  sandbox limits, namespaced widgets, signed server hooks, install
  and consent lifecycle, review checklist, and monetization rails.
- [Third-Party SDK and API Guide](sdk.md) — versioned REST
  adapter, authentication, OAuth grants, envelopes and pagination,
  rate limits, idempotency, error model, webhooks, and exports;
  points at the OpenAPI contract instead of duplicating it.
- [Documentation Guidelines for Contributors](guidelines.md) —
  pinning code claims with `file:line`, labeling prose-only claims,
  language and secret rules, link and spelling style, and the
  review checklist.
- [Starter theme](../../examples/starter-theme/) — minimal
  working theme with a 5-test gate suite mirroring the shipped
  theme contracts; copy this folder to start.
- [Starter plugin](../../examples/starter-plugin/) — valid
  manifest, one widget, and a 31-test suite mirroring the real
  validation gates; run its tests before adapting it.
- [OpenAPI contract](../../openapi/openapi.yaml) — the
  machine-readable endpoint reference; normative wherever prose
  guides summarize it.
- [Getting started](getting-started.md) — path map and starter-first workflow.
- [Concepts](concepts.md) — Widget vs Theme, registries, Class A vs B, public vs internal.
- [Widget development](widget-development.md) — built-in model and theme-never-replaces-logic.
- [Community plugins](community-plugins.md) — Class A path, manifest, tray, failure modes.
- [Themeable widgets](themeable-widgets.md) — Class B contract and theme dressing.
- [Menu extensions](menu-extensions.md) — data, fill points, replacement, fail-open.
- [Global chrome](global-chrome.md) — header, announcement, footer theme presentation.
- [Security and sandbox](security-sandbox.md) — frame, bridge, bundle and scope rules.
- [Versioning and publishing](versioning-publishing.md) — semver, validation, failure behavior.
- [Examples](examples.md) — minimal snippets pinned to real APIs.

The internal counterpart is the
[internal docs index](../internal/README.md), which is staff-only
and covers review runbooks plus integrator contracts.
