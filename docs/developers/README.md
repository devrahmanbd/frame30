# Third-party developer docs

Start here to build on the platform. Each guide states its scope in
one line below; open the guide for the full contract.

- [Build a third-party theme](themes.md) — brand tokens, closed
  skin vocabularies, homepage composition, token-only stylesheets,
  studio twin parity, preview sources, and submission rules.
- [Build a Framique plugin](plugins.md) — manifest validation,
  sandbox limits, namespaced widgets, signed server hooks, install
  and consent lifecycle, review checklist, and monetization rails.
- [Use the editor with your extension](editor.md) — the real developer
  journey: install and activate, find widgets in the tray, insert, edit
  schema-generated settings, responsive views, preview, save, publish,
  plus troubleshooting for schemas, compatibility, disabled packages,
  and fallbacks.
- [Third-Party SDK and API Guide](sdk.md) — versioned REST
  adapter, authentication, OAuth grants, envelopes and pagination,
  rate limits, idempotency, error model, webhooks, and exports;
  points at the OpenAPI contract instead of duplicating it.
- [Documentation Guidelines for Contributors](guidelines.md) —
  pinning code claims with `file:line`, labeling prose-only claims,
  language and secret rules, link and spelling style, and the
  review checklist.
- [Shipped theme](../../src/lib/themes/songoskriti/) — the official
  Songoskriti source, a working reference for the theme contracts.
- [Starter plugin](../../examples/starter-plugin/) — valid
  manifest, one widget, and a 36-test suite mirroring the real
  validation gates; run its tests before adapting it.
- [OpenAPI contract](../../openapi/openapi.yaml) — the
  machine-readable endpoint reference; normative wherever prose
  guides summarize it.
- [Getting started](getting-started.md) — path map and starter-first workflow.
- [Concepts](concepts.md) — Widget vs Theme, registries, Class A vs B, public vs internal.
- [Widget development](widget-development.md) — built-in model and theme-never-replaces-logic.
- [Community plugins](community-plugins.md) — Class A path, manifest, tray, failure modes.
- [Themeable widgets](themeable-widgets.md) — Class B contract and theme dressing; base contract: [app blocks](../04-builder/app-blocks.md).
- [Menu extensions](menu-extensions.md) — data, fill points, replacement, fail-open.
- [Global chrome](global-chrome.md) — header, announcement, footer theme presentation; see [theme authoring](../themes/creation.md).
- [Security and sandbox](security-sandbox.md) — frame, bridge, bundle and scope rules.
- [Versioning and publishing](versioning-publishing.md) — semver, validation, failure behavior.
- [Examples](examples.md) — minimal snippets pinned to real APIs.

The internal counterpart is the
[internal docs index](../internal/README.md), which is staff-only
and covers review runbooks plus integrator contracts.
