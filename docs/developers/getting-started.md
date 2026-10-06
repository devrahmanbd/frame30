# Getting started as a third-party developer

Last verified: 2026-10-06.

You are an independent developer building themes, widgets, plugins,
themeable community widgets, or menu extensions on the platform. This
page is the start of the path; each step links to the next.

```text
Getting Started (this page)
  -> Concepts ............ concepts.md — Widget vs Theme, the three registries
  -> Theme Development ... themes.md — tokens, skins, presentations, publish
  -> Widget Development .. widget-development.md — built-in model, theme never replaces logic
  -> Community Plugins ... community-plugins.md — Class A sandboxed widgets
  -> Themeable Widgets ... themeable-widgets.md — Class B dressed widgets
  -> Menu Extensions ..... menu-extensions.md — fill rows vs swap renderers
  -> Global Chrome ........ global-chrome.md — header, announcement, footer
  -> Security / Sandbox .. security-sandbox.md — the boundary you build against
  -> Versioning/Publish .. versioning-publishing.md — compat, validation, failure behavior
  -> Examples ............ examples.md — minimal snippets using only real APIs
```

## Pick your starting point

| I want to ...                  | Start at                                                         |
| ------------------------------ | ---------------------------------------------------------------- |
| Restyle the storefront         | [Theme guide](themes.md), then [Global Chrome](global-chrome.md) |
| Add functionality in a sandbox | [Community Plugins](community-plugins.md)                        |
| Let themes dress my widget     | [Themeable Widgets](themeable-widgets.md)                        |
| Extend navigation              | [Menu Extensions](menu-extensions.md)                            |
| Understand the trust model     | [Security / Sandbox](security-sandbox.md)                        |
| Ship and version safely        | [Versioning / Publishing](versioning-publishing.md)              |

## Copy a starter, run its tests

Two runnable starters mirror the real validation gates. Copy one before
writing anything from scratch.

- Theme: `examples/starter-theme/` — tokens, skins, homepage, preview,
  plus a 5-test gate suite (see [Theme guide](themes.md#copy-the-starter-theme-first)).
- Plugin: `examples/starter-plugin/` — valid manifest
  (`examples/starter-plugin/manifest.json:1-32`), one widget whose entry
  string is the single source of truth
  (`examples/starter-plugin/src/widget.ts:13-20`), and a vitest suite
  that mirrors the real gates (see [Plugin guide](plugins.md#declare-a-manifest-the-validator-accepts)).

```bash
# Plugin starter: proves the manifest passes the shared gate first.
npx vitest run --config examples/starter-plugin/vitest.config.ts
```

## Rules for every step

1. No invented APIs. Every example in these guides compiles
   conceptually against the implementation it pins with `file:line`.
2. Small examples over essays. Each guide shows the smallest snippet
   that exercises the real contract.
3. Public API vs internal detail are labeled. Anything marked
   **internal** is not an extension point, even if you can read it.
4. Unverifiable claims are marked **TBD**, never filled in.

## What you never touch

Core platform code, the core widget enum, other themes' registrations,
and the review pipeline are not extension points. Your surface is:
manifest fields, the bridge allow-list, the three registries, theme
tokens and skins, and the themeable contract. See
[Concepts](concepts.md#what-is-public-api-and-what-is-internal) for the
exact boundary.
