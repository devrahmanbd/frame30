# Theme Packages (third-party developer spec)

> **NOTE — validator built; spec field names mapped below.** The validator
> module now exists (`src/lib/theme-package.ts`): the canonical gate is
> `validateThemeManifest`, and the spec name `validateThemePackage` is a
> true alias of it (one implementation). Package installs flow through
> `parseTokens`/`parseTemplates`
> (`src/lib/builder-ast.ts`) at
> `marketplace-install.server.ts:415-420`. Everything below is the
> preserved design spec for that module — field rules here use the
> spec names; the enforced manifest fields are mapped under Manifest
> fields. For the live install path, see
> [the SDK registry pipeline](./sdk.md).

Third-party themes ship as JSON packages: `tokens` + `templates` + manifest.
Packages are validated by `validateThemePackage` (`src/lib/theme-package.ts`),
which reuses the in-repo guards byte-identically — no raw HTML ever executes.

Spec → manifest field mapping (enforced names): `nameEn` → `name`
(required), `nameBn` → `nameBn` (required), `summaryEn` → `description`
(optional), `summaryBn` → `descriptionBn` (optional). `category`,
`sortOrder`, and `tokens` have no manifest counterpart (curation-only
metadata). The `templates` row below is the design-spec template map; the
enforced field is the declared template-key subset (`templates`).

## Manifest fields

| Field       | Rules                                                                                                      |
| ----------- | ---------------------------------------------------------------------------------------------------------- |
| `key`       | 1–60 chars, slug (`[a-z0-9-]`). Never renamed after publish.                                               |
| `nameEn`    | English display name (required).                                                                           |
| `nameBn`    | Bengali display name (required).                                                                           |
| `summaryEn` | English one-line summary (required).                                                                       |
| `summaryBn` | Bengali one-line summary (required).                                                                       |
| `category`  | Storefront category, e.g. `fashion` (required).                                                            |
| `version`   | Semver (`1.0.0`). Bump on every resubmission.                                                              |
| `api`       | Builder API range. Must fall inside `^3.0.0` (major 3); anything else is rejected to avoid version skew.   |
| `sortOrder` | Marketplace ordering weight (default `50`).                                                                |
| `tokens`    | Token bag accepted by `parseTokens`.                                                                       |
| `templates` | Template map accepted by `parseTemplates`. Unknown route keys are dropped — packages cannot invent routes. |

## Gates (all enforced by the validator)

1. **Size cap:** serialized package ≤ 2 MB (`MAX_PACKAGE_BYTES`).
2. **Section budget:** ≤ 200 sections per template (`MAX_SECTIONS_PER_TEMPLATE`), counting header + main + footer.
3. **AST parity:** `parseTemplates` + `parseTokens` accept the payload; every `lintTemplate` error fails the package.
4. **Single-H1 rule:** exactly one primary-heading claimant per template (via `lintTemplate`).
5. **bn coverage:** `lintTemplate` locale-parity findings fail below the bn ≥ 0.9 gate.
6. **No executable content:** unknown widget types (e.g. `html`) are rejected, and any `javascript:` / `data:` / `vbscript:` URL in props is blocked.
7. **API compatibility:** `api` outside `^3.0.0` is rejected.

## Submit flow

Build in the builder → Export package → submit via the Themes screen.
Review checks the gates above plus bilingual completeness; staff approve or
reject with a note. Rejection reasons map 1:1 to validator errors.
