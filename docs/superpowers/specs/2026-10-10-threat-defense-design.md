# Threat Defense for Custom Themes & Plugins — Design

**Goal:** Defense in depth across install, execution-approval, and update stages for merchant-uploaded ZIP themes/plugins, reusing existing pipeline, ledger, audit, and UI primitives. No new version system, no new sandbox, no execution redesign.

**Non-goals:** Official source themes/plugins (already source-pinned, Frame30); redesigning plugin execution, Class A/B contracts, or the builder AST.

## Architecture

Two additions on top of the current pipeline:

1. **Stronger install gates (A).** Four focused validators, each pure + unit-tested: parser strictness (duplicate entries, dotfiles/`__MACOSX`, device-node mode bits), per-merchant storage quota (computed from stored asset bytes, fail-closed over quota), external-URL inventory (sorted unique `http(s)` refs per package, surfaced in consent), theme capability declaration + gating (themes declare what plugin manifests already declare; unknown/refused capabilities fail install).
2. **Risk-based quarantine (B).** Every new package version gets a scan report (secrets, executables, SVG policy, external URLs, permission inventory → clean/flagged). Routing: first-ever install of a package key → approval required (risk report shown in `InstallConsent`); update with clean scan + identical capabilities → existing path untouched; flagged scan or widened capabilities → activation blocked until explicit re-approval, audited. Approval state rides existing inactive/active + ledger/audit rows — no new lifecycle state. Active themes and other tenants are never touched by scan, rejection, or purge.

## Components

| Unit | Does | Interface |
|---|---|---|
| `strictZipEntries` (extend `package-zip.ts`) | Reject duplicate paths, dotfile/system entries, non-regular file modes | Same `PackageZipError` codes (`zip.*`), existing tests untouched |
| `storageQuotaFor` + usage sum | `quotaBytesForPlan` + sum over `package-store` assets per merchant; install/upload entry points check before bytes land | Throws `package.over_quota` / `theme.upload_quota`; pure sum fn unit-tested |
| `inventoryExternalUrls(files)` (new pure module) | Sorted unique external URLs from package text files | `(PackageFile[]) => string[]`; feeds consent payload + scan report |
| `diffCapabilities(old, new)` (new pure module) | Added/removed permissions, scopes, external-URL hosts, custom-code presence | Returns `{ widened: boolean; details }`; widening forces re-consent |
| `scanPackage(files, manifest)` (new pure module) | Aggregates secret/CSS/SVG/external-url/permission findings → `{ verdict: clean\|flagged; findings[] }` | Pure; every finding has a fixture test |
| Approval gate | `approveVersion` / `rejectVersion` server fns (permission-gated, tenant-scoped, audited); activation refuses flagged-unapproved versions | Reuses `requirePermission`, ledger + audit rows |
| Consent UI | `InstallConsent` shows URL inventory + risk findings; pending-approval queue entry | Additive props only, existing flows keep working |

## Data flow

Upload/update → existing archive+manifest+content gates → quota check → version row (draft/inactive) + scan report → router: clean & capability-identical → current activate/publish path; else → pending approval → merchant approves (audit `approved`) or rejects (purge version, retire ledger, audit) → approved versions activate normally.

## Error handling

Every gate fails closed with a specific code before any write; scan crashes count as flagged, never clean; approval of a purged version is a no-op error; rejection never touches the active theme or other merchants; all decisions append audit rows.

## Testing

Per-validator fixture tests (malicious ZIP corpus extension), scan-report unit tests, quarantine router integration tests on `fakeDb` (clean auto-pass, flagged blocked, approve→activate, reject→purge, cross-tenant refusal), consent UI tests, full existing suites green, typecheck + lint + build.

## Open points (ruled)

- Quota values: launch/growth/business/enterprise tiers mirror domain quotas; exact bytes set at implementation, documented in code.
- Theme capabilities: minimal closed set (custom-js, external-fetch, external-form, embedded-media); unknown keys rejected.
- No new tables: approval state via existing rows; if implementation proves otherwise, smallest possible migration with a recorded ruling.
