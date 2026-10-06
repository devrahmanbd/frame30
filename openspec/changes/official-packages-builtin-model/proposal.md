# Proposal: WordPress-like official built-in package model

## Why

Framique needs the WordPress product experience — official themes/plugins
discoverable on day one, installable through the normal installer — without
giving up the package boundary that makes Framique safer than WordPress.
The current state executes official themes directly from core source, which
means two incompatible systems: hardcoded TypeScript for official packages,
ZIP pipeline for everything else.

## Definition of complete (revised)

The goal is **not** "remove all themes/plugins from the repository."
Official Framique themes/plugins ship with Framique, exactly like
WordPress ships default themes/plugins. The distinction that matters:

> **Shipped with core ≠ executed directly from core source.**

Official packages are **bundled/distributed by core, but installed and
executed through the same package/artifact pipeline as third-party
packages.** Official theme/plugin source stays private inside the
Framique repository, packaged and built internally for the runtime —
**never exposed to merchants**. There are no downloadable official ZIPs.
Custom themes/plugins arrive only as merchant dashboard uploads
(validate → install → activate).

## What changes

1. **Official artifact build (internal).** Songoskriti and Somvabona
   (the only two that exist — no OceanBlue source exists, so the
   catalogue starts with two) are exported to versioned package
   artifacts at deploy time from private source, stored server-side.
   No distributable files, no download surface.
2. **Official catalogue semantics.** Appearance → Themes shows Official
   (Install buttons) + Community + Upload Theme. Clicking Install runs
   the normal `installPackage` path — same validators, same ledger,
   same version rows. No separate official path anywhere.
3. **Source-fallback removal.** Preview, publish, and gallery resolve
   installed-or-bundled artifacts only. Source imports
   (`preview-sources.ts` statics, `registryPackage`-from-source) retreat
   to build tooling. Gated on proof passing.
4. **Plugin parity.** Official plugin catalogue entries point at
   internally-built artifacts and install through the normal lifecycle.
   No ZIP download surface.
5. **Parity proof.** Official artifacts through the normal installer →
   activate → preview → publish → render, indistinguishable from
   today's source-rendered output. Same for one official plugin.

## What does not change

AST, builder, widget catalog, presentation registries (themeKey ×
widgetType, themeKey × pluginKey, themeKey × chrome surface), Class A/B
contracts, plugin sandbox/scopes, menu system, header/announcement/footer
runtime, versioning/publish/rollback/last-good machinery.

## Status inputs (verified)

- Package pipeline real: strict manifest validation default, exact-ZIP
  marketplace distribution, builder/preview on installed artifacts.
- Open gaps driving this proposal: source fallback still present in
  publish/gallery; manifest default flip, marketplace/builder/preview
  switchover land as separate lanes.
- OceanBlue: no source exists; excluded until built.

## Acceptance

```text
Frame30 core
+
songoskriti artifact (internally built)
+
merchant-uploaded custom.zip
+
community-plugin artifact
```

with zero theme/plugin source imports required by the core runtime —
manifest + validated package + installed version + runtime contract only.
