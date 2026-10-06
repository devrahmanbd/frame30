# Design: official built-in package model

## Model

```text
Framique distribution
│
├── Official Package Catalogue (metadata only — NOT downloadable)
│   ├── Songoskriti
│   ├── Somvabona
│   └── Official Plugins
│
├── Internally-built artifacts (server-side, never exposed)
│   ├── songoskriti-1.0.0 (package record)
│   ├── somvabona-1.0.0 (package record)
│   └── ...
│
└── Package Runtime
        ├── Validate
        ├── Install
        ├── Verify
        ├── Activate
        ├── Update
        └── Rollback
```

New installation shows `Appearance → Themes → Official (Install) /
Community / Upload Theme`. After Install, even an official theme is an
ordinary merchant installed version served by the normal runtime.

## Status (revised per private-source model)

| Area | Status | Note |
|---|---|---|
| Official built-in themes | 🔴 | Source exists; internal build-to-artifact missing |
| Official built-in plugins | 🟠 | Lifecycle exists; catalogue-artifact lane missing |
| Official package parity | 🔴 | Source fallback still present |
| Theme registry | 🟠 | Installed + source keys coexist |
| Plugin registry | 🟠 | Unify artifact/version identity |
| Official catalogue | 🟠 | Bundled-vs-installed semantics missing |
| Built-in installation | 🔴 | Day-one discoverable, install-via-pipeline missing |
| Theme/plugin artifacts + identity | ✅ | Keep |
| Rollback (theme + plugin) | ✅/🟠 | Theme model reuse; plugin last-good missing |
| Asset isolation | ✅/🟠 | Namespaces exist; GC/orphan tests open |
| Sandbox / security / capabilities | ✅/🟠 | Keep; no weakening |
| Dependencies / conflicts | 🟠 | Solver + namespace checks open |
| Preview (installed artifact) | ✅/🟠 | Remove source fallback |
| Marketplace artifact | ✅ | Keep |
| Custom upload | 🟠 | Backend exists; verify end-to-end UI |
| Dev workflow | 🟠 | Source → build/export → ZIP → local install |
| Deployment independence | 🔴 | Final proof |
| E2E lifecycle | 🟠 | Unit suites exist; browser proof open |
| Documentation authority | 🟠 | One canonical contract |

Deliberately out: downloadable official ZIPs, third official theme
(no OceanBlue source exists), executable theme code, OS-level plugin
sandbox, public SDK freeze.
