# Inventory: dev-theme-runtime — executable enforcement vs policy prose

Branch verified: `frame30`. Read-only pass except this file. Every claim below was
read in current source; file:line pins are to the tree as seen on this branch.
`EXECUTABLE` = enforced by code and pinned by a test (test cited).
`POLICY-ONLY` = prose/docs/intent with no check, or a check the next phase must build.
The gap list (all POLICY-ONLY rows) is the deliverable for the executable-check phase.

## 1. Theme manifest validators (what custom themes may contain)

| Item | Status | Evidence |
|---|---|---|
| Custom themes are data-only: no `entry`/`code`/`script` field exists in the format | EXECUTABLE | `src/lib/theme-package.ts:10-16` (format comment), `validateThemeManifest` `src/lib/theme-package.ts:281-565` — the `ThemeManifest` type (`:134-166`) has tokens/templates/presentation/assets only |
| Free-text executable ban (`<script>/<iframe>/<object>/<embed>/<form>`, `javascript:`/`vbscript:`/`data:text/html`, `eval`/`import(`/`new Function`, `on*=`) | EXECUTABLE | `EXECUTABLE_RE` `src/lib/theme-package.ts:194-195`, applied to name/nameBn/author/description `src/lib/theme-package.ts:298-354` |
| Asset extensions deny executables (`js/mjs/cjs/ts/tsx/jsx/html/php/sh/py/exe/dll/so`…; SVG allowed via media pipeline) | EXECUTABLE | `EXECUTABLE_ASSET_EXTS` `src/lib/theme-package.ts:203-220`, `assetPathIssue` `src/lib/theme-package.ts:262-278`, gate `src/lib/theme-package.ts:494-508` |
| Capabilities closed to read-only subset (`read_shop/read_products/read_menus/render_storefront`; every `write_*`, `read_orders/read_customers`, `write_analytics`, `replace_menus` rejected as forbidden) | EXECUTABLE | `THEME_CAPABILITIES` `src/lib/theme-package.ts:105-111`, gate `src/lib/theme-package.ts:515-527` |
| `render_storefront` mandatory | EXECUTABLE | `src/lib/theme-package.ts:524-526` |
| Manifest no-plugin-territory content gate (payments/tracking-pixel/auth-form/seo-write refuse install) | EXECUTABLE | `src/lib/theme-package.ts:535-538` via `scanThemeTrustContent`; detectors `src/lib/package-review.ts:188-399` |
| Templates/supportedWidgets/locales/surfaces closed vocabularies; semver + API-range gate | EXECUTABLE | `src/lib/theme-package.ts:358-480`; tests `src/lib/package-conflicts.test.ts:870-894` |
| Custom-theme CSS allowed but gated (AST, not regex); custom-theme JS banned | EXECUTABLE | CSS: `gatePackageCss` `src/lib/package-css-gate.ts:347-365` wired at `src/lib/package-zip.ts:590-598` (`zip.css_rejected`); JS: any `.js/.ts` file refused at layout `src/lib/package-zip.ts:371-376,444-450` |
| Alias `validateThemePackage` (spec name) is the same gate, not a fork | EXECUTABLE | `src/lib/theme-package.ts:567-572` |

## 2. ZIP ingestion gates

| Item | Status | Evidence |
|---|---|---|
| Hand-rolled parser, stored/deflate only; encrypted/zip64/spanned/unknown-method refused | EXECUTABLE | `src/lib/package-zip.ts:1-16`, `parseZip` `src/lib/package-zip.ts:158-302`, codes `zip.encrypted/zip.unsupported_feature/zip.spanned/zip.unsupported_method` |
| Zip-slip suite (absolute/`..`/drive/backslash/null/`__MACOSX`/empty-segment refused, never sanitised) + symlink + special-file refusal + duplicate-entry refusal | EXECUTABLE | `assertSafePackagePath` `src/lib/package-zip.ts:106-146`, `src/lib/package-zip.ts:237-265`; tests `src/lib/package-install.test.ts:307-320,1641-1657` |
| Archive/entry/total/manifest caps (32MB archive, 500 files, 5MB/entry, 50MB total, 512KB manifest) | EXECUTABLE | `src/lib/package-zip.ts:30-37`; upload lane keeps wider caps `src/lib/themes/appearance.server.ts:655-661` |
| Layout gate: root manifest required, area rules (`templates/*.json`, `styles/*.css`, `assets/` images-fonts, `locales/*.json`), blocked executables anywhere, root extras allowlist | EXECUTABLE | `validatePackageLayout` `src/lib/package-zip.ts:414-477`, `BLOCKED_EXTS` `:371-376`, `IMAGE_FONT_EXTS` `:378-381` |
| Content authenticity: magic-byte checks per type, font magic, strict UTF-8 text, SVG sanitize-or-reject in place (`zip.svg_rejected` when pure payload) | EXECUTABLE | `assertPackageContentAuthentic` `src/lib/package-zip.ts:530-601` |
| Package CSS exfil gate (any `@import`, remote URLs, unsafe `data:`, banned decls → `zip.css_rejected`) | EXECUTABLE | `src/lib/package-zip.ts:590-598`, `src/lib/package-css-gate.ts:29-35,347-365`; tests `src/lib/package-css-gate.test.ts` |
| Broken asset-ref refusal (templates pointing at missing `assets/…`) | EXECUTABLE | `collectBrokenAssetRefs` `src/lib/package-zip.ts:609-636`, upload lane `src/lib/themes/appearance.server.ts:830-836` |
| Upload lane runs the same gates (shared parser/layout/manifest/authenticity/CSS/secrets/trust/quota) before replay lookup or any write | EXECUTABLE | `installUploadedTheme` `src/lib/themes/appearance.server.ts:797-899`; `.zip` name + magic + size pre-gates `:765-790` |
| Merchant storage quota (plan-tiered `package.over_quota` / `theme.upload_quota`) | EXECUTABLE | `src/lib/themes/appearance.server.ts:858-872`; tests `src/lib/package-install.test.ts:1819-1863` |
| Full CSS semantic allowlist (property-level) at install | POLICY-ONLY (partial) | The install gate is reject-only on exfil signals; property sanitising (`--theme-*` drop, `position:fixed` scoping) happens at render via `scopeCss` (`src/lib/custom-code.ts:187-341`), not at install. A stricter install-time property allowlist (proposal P0-4) does not exist as a separate gate. |

## 3. Official theme registry (source-backed)

| Item | Status | Evidence |
|---|---|---|
| Exactly two official themes, identity from source registry only | EXECUTABLE | `OFFICIAL_THEME_KEYS` `src/lib/themes/appearance.ts:71-74` + `src/lib/themes/builtin-themes.ts:15-36` (`isOfficialThemeKey`/`getBuiltinTheme`) |
| Official installs initialize from source definitions; no ZIP constructed, no `installPackage` archive path | EXECUTABLE | `installOfficialTheme`/`installCatalogTheme` `src/lib/themes/appearance.server.ts:350-580` (header `:297-310` states the retired B2 model); guard test `src/lib/themes-official-no-pipeline.test.ts:5-93` |
| Ledger provenance marker `official:<key>` distinguishes source installs | EXECUTABLE | `src/lib/themes/appearance.server.ts:436-438,521-524`, `officialPinFor` `src/lib/themes/appearance.ts:83-85` |
| Catalogue Official/Community split + upload entry | EXECUTABLE | `loadThemesWorkspace` `src/lib/themes/appearance.server.ts:201-276`, `sectionCatalogue` `src/lib/themes/appearance.ts:131-141` |
| STALE PROSE: `appearance.ts:52-56` still describes official entries as "installed through the normal `installPackage` pipeline against the internally-built artifact" | POLICY-ONLY (stale doc, code disagrees) | Superseded by `appearance.server.ts:295-310` (B2 retired) and the no-pipeline guard test. Correction for next phase: update the `CatalogTheme.provenance` comment and the `OfficialArtifactRef` contract (`appearance.ts:92-117`), which still describes checksums of pipeline ZIPs that are no longer built on this path. |

## 4. Official plugin registry (source-backed)

| Item | Status | Evidence |
|---|---|---|
| Exactly three official keys (Reviews/Analytics/WhatsApp) | EXECUTABLE | `OFFICIAL_PLUGIN_KEYS` `src/lib/official-plugins.ts:39-43`, `isOfficialPluginKey` `:57-59` |
| Official installs from in-repo source; never the archive installer; fingerprint binds canonical manifest | EXECUTABLE | `installOfficialPlugin` `src/lib/official-plugins.server.ts:268-397`, `officialPluginFingerprint` `:160-163`; guard tests `src/lib/plugins-official-no-pipeline.test.ts:5-76`, `src/lib/official-plugins-frame30.test.ts`, `src/lib/official-plugins-nodownload.test.ts` |
| Registry gates re-run on every install (`gateExportManifest` = `parseManifest`+`validateBundle`, API compatibility) before replay lookup | EXECUTABLE | `src/lib/official-plugins.server.ts:280-286` |
| STALE PROSE: `official-plugins.ts:1-29` header still describes entries as "pointing at an internally-built artifact (the exact ZIP `installPackage` installs… the server builds the install bytes from these sources)" | POLICY-ONLY (stale doc, code disagrees) | The server file (`official-plugins.server.ts:1-66`) is explicit: no archive, no upload lane, no `installPackage`; the Oct 11 proposal state (P1-3: "install builds internal bytes + `installPackage`") has been replaced. Correction for next phase: rewrite the `official-plugins.ts` header and the `OfficialPluginArtifactRef` "checksum of the exact ZIP the pipeline installs" contract (`:61-73`) to the fingerprint model. |
| No downloadable official artifact (theme or plugin) | EXECUTABLE | Theme: no artifact path in `appearance.server.ts:350-580`; plugin: `official-plugins-nodownload.test.ts`; catalogue rows carry serializable refs only |

## 5. Plugin bridge (WidgetSandbox + flood guard + authorizeWidgetCall)

| Item | Status | Evidence |
|---|---|---|
| Null-origin island: `sandbox` without `allow-same-origin` (low tier `allow-scripts allow-forms allow-popups`), frame CSP `default-src 'none'` + img/connect/font `none` | EXECUTABLE | `src/components/marketplace/WidgetSandbox.tsx:181`, policy `src/lib/risk-tier.ts:95-107`; invariant pinned by `definition-of-done`-style tests (`WidgetSandbox.test.tsx`, `WidgetSandbox.bridge.test.tsx:355-356`) |
| Single authorizer per message (`authorizeWidgetCall`): well-formed envelope, 64 KiB cap, closed `WIDGET_API` method→scope map, granted-scope check | EXECUTABLE | `src/lib/marketplace-scopes.ts:269-288` (`WIDGET_API`), `:348-386` (`authorizeWidgetCall`); tests `src/lib/marketplace-scopes.test.ts:79-99` |
| Flood gate: 30 msgs/rolling-10s per frame + duplicate-`id` rejection; per-call 5s timeout retiring the id | EXECUTABLE | `src/lib/bridge-flood-guard.ts:54-105` (`checkFloodGuard`), `:107-192` (timeout race); host wiring `WidgetSandbox.tsx:132-157` (`handleSandboxMessage`) |
| `plugin.settings` served from validated values; menus fill-point validation; `replace_menus` needs scope + review flag | EXECUTABLE | `answerWidgetCall` `src/components/marketplace/WidgetSandbox.tsx:71-117`; `decideMenuRenderer` `src/lib/plugin-manifest.ts:103-126`; `menuReadGranted` `src/lib/marketplace-scopes.ts:322-326` |
| Entry JS two-stage gate: regex pre-pass + AST deep check (aliases, taint from decoders, member chains, indirect calls, static+dynamic `import`, `innerHTML`, `document.write`) — same failure code | EXECUTABLE | `MANIFEST_ENTRY_DYNAMIC_CODE_RE` `src/lib/plugin-manifest.ts:301-302` + `scanJsAst` second stage `:568-577`; `BUNDLE_ENTRY_DYNAMIC_CODE_RE` `src/lib/marketplace-scopes.ts:214-215` + `:237-243`; engine `src/lib/plugin-js-scan.ts:1-34,1497-1531`; tests `marketplace-scopes.test.ts:236-263`, `plugin-bundle-gate.test.ts` |
| Frame CPU watchdog (infinite-loop preemption) | POLICY-ONLY (documented non-goal) | `bridge-flood-guard.ts:24-48` is explicit: a synchronously spinning entry cannot be preempted host-side; containment is null-origin isolation + browser intervention. Candidate check: liveness-watchdog unmount (fail-closed island) per proposal P0-7 is not implemented. |
| `PLUGIN_BUDGET` (`jsKb:120`, `mainThreadMs:50`) runtime enforcement | POLICY-ONLY (install-side only) | Budget over-declaration refused at manifest parse (`plugin-manifest.ts:644-646`, EXECUTABLE at install), but `mainThreadMs` has no runtime measurement/enforcement. Candidate check. |
| Server-hook egress redirect/DNS-rebinding verification | POLICY-ONLY | `isAllowedHooksUrl` validates the initial URL only (`plugin-manifest.ts:415-505`); no `redirect:"manual"` + Location revalidation, no resolve-and-pin at delivery (proposal P1-1). Candidate check. |

## 6. CSP builder (exact directives, nonce usage)

| Item | Status | Evidence |
|---|---|---|
| Document CSP (single builder): `default-src 'self'; script-src 'self' 'nonce-<n>' 'strict-dynamic'` (or strict `'self'` when nonce empty); `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`; `font-src 'self' https://fonts.gstatic.com data:`; `img-src 'self' https: data: blob:`; `connect-src` tiered (`'self'` + Supabase/wss origins when `apiWrite`); `frame-src` tiered (low: self+youtube+vimeo; medium: self; high: none); `frame-ancestors 'self'`; `base-uri 'self'`; `form-action 'self'`; `object-src 'none'` | EXECUTABLE | `buildCsp` `src/lib/custom-code.ts:772-811`; policies `src/lib/risk-tier.ts:78-246` |
| Per-request 128-bit nonce, set before SSR, emitted in header + `csp-nonce` meta for client islands | EXECUTABLE | `newNonce` `src/lib/custom-code.ts:746-752`; `src/server.ts:856-864` (generate+set), `:195-200` (header), `:220-254` (meta injection); client `src/router.tsx:4,32-36` |
| Console documents hardened (`frame-ancestors 'none'`, `DENY`, noindex, private) on top of base set | EXECUTABLE | `src/lib/console-headers.ts:18-32`, applied `src/server.ts:267-284,869-878` |
| `style-src 'unsafe-inline'` is deliberate (merchant CSS is prefix-scoped + sanitised) | EXECUTABLE (documented risk acceptance) | Comment `src/lib/custom-code.ts:793-796`; scopeCss `src/lib/custom-code.ts:187-341` |
| Frame-island CSP (`default-src 'none'`, script/style `unsafe-inline`, img/connect/font `none`) + nonce-carrying frame script | EXECUTABLE | `FRAME_HTML` `src/components/marketplace/WidgetSandbox.tsx:176-204`; nonce test `WidgetSandbox.test.tsx:50-69` |
| Tests pinning all of the above | EXECUTABLE | `src/lib/platform-shell-csp.test.ts:42-94`, `src/lib/risk-tier.test.ts:217-239`, `src/lib/phase4-custom-code.test.ts:166-169`, `src/lib/server-csp.test.ts`, `src/lib/hardening.contract.test.ts:73` |

## 7. Publishing / approval gates (who approves what, Tier-0 hard blocks)

| Item | Status | Evidence |
|---|---|---|
| Merchant publish gate (themes): lint/translation/fonts/contrast/skeleton/perf/responsive/a11y/motion/trust composed in one function; `ok=false` refuses publish | EXECUTABLE | `composePublishGate` `src/lib/publish-gates.ts:783-903`; trust half `trustGate` `:725-730` |
| C6 reasons 1-4 mechanical detectors (payments/tracking-pixel/auth-form/seo-write, action-positions only) shared by install lane + manifest gate + publish gate | EXECUTABLE | `src/lib/package-review.ts:188-399`; wired at `package-scan.ts:122-130`, `theme-package.ts:535-538`, `publish-gates.ts:725-730` |
| Tier-0 hard block: `secret` findings are NEVER merchant-approvable (approve fns refuse with `approval_forbidden`, write no audit; activation/enable gates refuse even with legacy approval rows) | EXECUTABLE | Theme: `approveThemeVersion` `src/lib/themes/appearance.server.ts:1164-1208`, `assertVersionApproved` `:1221-1270`; plugin: `src/lib/plugins.server.ts:319-357,396-434`; probe `hasSecretFinding` `src/lib/package-scan.ts:64-66`; report binding `src/lib/package-security-report.ts:9,38,142,210`; tests `package-install.test.ts:2074-2129`, `plugin-approve-fn.test.ts:37-219`, `approval-queue.test.ts:261-353`, `lifecycle-audit.test.ts:272-330` |
| Tier-1 (svg-script, no-plugin-territory) merchant-approvable with hash/version-bound audit | EXECUTABLE | Same sites as above; `theme.approved`/`plugin.approved` rows bound to content hash / manifest version |
| Marketplace listing moderation (seller `draft→review`, `active⇄paused→archived`; only `active` installs; version pin must be `active`) | EXECUTABLE | `reviewVersion`/`listReviewQueue` `src/lib/marketplace-vault.server.ts:197-236`; `sellerTransition` `src/lib/marketplace-install.server.ts:779-816`; install gates `:67-71,224-225` |
| `reviewVersion` carries no actor/role parameter — platform-reviewer-only enforcement is not in the function | POLICY-ONLY (gap) | Signature `reviewVersion(db, versionId, status, note)` `marketplace-vault.server.ts:208-213`. Depends on route-level authZ (unverified here). Candidate check: role-gated review action with reviewer identity in audit. |
| C6 reason 5 (custom post types) has no mechanical detector | POLICY-ONLY | Detectors cover 4 codes only (`package-review.ts:202-206`). Candidate check or explicit accepted-risk record. |
| Review SLA / reviewer-identity requirements / structured rejection codes beyond `review_note` | POLICY-ONLY | Explicit TBDs `docs/developers/review-policy.md:74-75,100-101`. Candidate: SLA + identity pins. |
| P0-5 SVG decision ("only platform security reviewer clears confirmed high-risk") | POLICY-ONLY | Current code: SVG sanitised at install (`package-zip.ts:540-558`), `svg-script` stays merchant-approvable Tier-1 (`package-scan.ts:22,109-115`). The reviewer-only override does not exist. Candidate check. |
| STALE PROSE (high value): `review-policy.md:17-26` claims C6 rejections "are applied in human review, not by an automated gate. No rule in `src/lib/publish-gates.ts` checks for them" | STALE — code disagrees | `trustGate` (`publish-gates.ts:725-730`) plus the install-lane and manifest-gate wiring above implement the mechanical half. Correction for next phase: rewrite §1 to "mechanical half enforced at three gates; human judgment covers …", and enumerate what genuinely remains human (see POLICY-ONLY rows). |

## 8. Dependency controls

| Item | Status | Evidence |
|---|---|---|
| Blocking dep audit: `npm audit --omit=dev --json`, fail on high/critical without reviewed exception; exceptions require module+reason+owner+`expires`; expired/malformed/ownerless entries fail the run; stale entries warn | EXECUTABLE | `scripts/dep-audit.mjs:1-256`; exceptions `scripts/dep-exceptions.json:1-14` (1 live entry: `source-map-js`/`GHSA-68fv-2mgg-jv7q`, owner `@devrahmanbd`, expires `2027-01-09`) |
| CI runs dep audit blocking (+ secret scan blocking, SAST blocking) in the `scan` job; attribution report explicitly non-blocking | EXECUTABLE | `.circleci/config.yml:81-169` (secret `:82-83`, SAST `:84-152`, deps `:153-155`, attribution `|| true` `:156-167`) |
| SAST suspicious-diff gate (diff-scoped by default, full-tree nightly; fail-closed base resolution; `sast-allow:` with mandatory reason) | EXECUTABLE | `.circleci/config.yml:84-152,259-273`; engine `scripts/sast-scan.mjs:1-56` (rules `dynamic-exec/dynamic-import/html-sink/network-egress/shell-exec/secret-access/csp-sandbox/tainted-*`) |
| Dependency-DENY module (forbidden packages / new-dependency approval) | POLICY-ONLY (does not exist) | Verified: repo-wide search for `dep-deny|deny-list.*depend|bannedModules|BANNED_DEPS|FORBIDDEN_DEPS` finds only the Oct 3 changelog sentence. The SAST rule table has no new-dependency rule. Candidate check. |
| E2E harness-missing must fail, not pass | EXECUTABLE | `e2e:required` gate `.circleci/config.yml:191-193,228-229` (`scripts/e2e-required.mjs`) |

## 9. SRI / subresource integrity

| Item | Status | Evidence |
|---|---|---|
| Any `integrity=` attribute, SRI generation script, or SRI CI rule | NONE — POLICY-ONLY (does not exist) | Repo search: zero `integrity=` matches in `src/`; zero `integrity|sri| SRI` matches in `scripts/` (only prose "integrity" hits: observability/ad-fraud/backup contexts). Oct 3 changelog correction ("No dep-deny module or SRI rule exist", `CHANGELOG.md:438`) is still accurate for SRI. Candidate check: SRI hashes for first-party bundles / CDN assets (fonts) or a recorded decision not to (single-origin + nonce-CSP rationale). |

## 10. GSAP policy (single engine)

| Item | Status | Evidence |
|---|---|---|
| Exactly one animation engine in `dependencies` (`gsap ^3.15.0`); no static `gsap` import outside `motion-engine.ts`; engine reached only via dynamic import | EXECUTABLE | Tests `src/lib/motion.contract.test.ts:165-203`; dep `package.json:112`; loader `src/lib/motion-engine.ts` (asserted `await Promise.all([import("gsap")…`) at `:188`) |
| STALE PREMISE: Oct 3 changelog "gsap is the required single engine (policy sentence only)" (`CHANGELOG.md:438`) | STALE — now test-enforced | The `motion.contract.test.ts` weight-discipline suite runs in the blocking `unit-contract` CI job (`.circleci/config.yml:58-68`). Correction: single-engine is executable, not policy-only. Residual gap (POLICY-ONLY): nothing stops a second engine being added together with a test edit — a dependency-DENY/allowlist check (see §8) would close that loop. |

## 11. Origin / session boundaries (is there any split today?)

| Item | Status | Evidence |
|---|---|---|
| Verdict: SINGLE-ORIGIN. No storefront-vs-admin-vs-platform origin split exists. Separation is path-based under one router/documents pipeline. | EXECUTABLE (proven by construction) | One header pipeline for all HTML `src/server.ts:161-261,866-879`; console hardening is a path predicate (`isConsolePath`: `/dashboard//dashboard//root//onboarding//auth`, `src/lib/console-headers.ts:10-22`), not an origin; single TanStack router (`src/routes/__root.tsx`, `store/$slug/*`, `_authenticated/*`) |
| Cookies are host-scoped (`Path=/`, no `Domain=` anywhere; `SameSite=Lax`) | EXECUTABLE | `document.cookie = …; path=/; … SameSite=Lax` `src/hooks/use-merchant.ts:47`; `Path=/; … SameSite=Lax` `src/lib/lang-boot.ts:95`; repo grep for `Domain=` returns zero; marketing copy confirms httpOnly/Secure/Lax refresh-cookie intent `src/lib/marketing/security.content.ts:124` |
| CSRF is same-host + merchant-custom-domain allowlist + payment-path exceptions, not an origin split | EXECUTABLE | `src/server.ts:641-725` (tenant-aware CSRF via `isTrustedCsrfOrigin`); spoofed `x-forwarded-host` ignored (`resolveEffectiveHost`) |
| CORS exists only on public API lanes, echoing allowlisted origins (`.framique.store/.framique.com`, platform host, localhost) | EXECUTABLE with a smell | `src/routes/api/public/v1/$.ts:8-36`, `oauth/token.ts`, `oauth/revoke.ts`. Smell (candidate check): `getAllowedOrigin` falls back to `"*"` while also sending `access-control-allow-credentials: true` (`v1/$.ts:24,34`) — credentialed wildcard CORS. Verify intent and either fail-closed on unknown origins or drop the credentials header on `*`. |
| Any admin/storefront cookie scoping, `__Host-` prefixing, or cross-origin session isolation | POLICY-ONLY (does not exist) | No `__Host`/`__Secure` prefixes found; no per-surface cookie scopes. Candidate checks for the trust-level phase. |

## 12. Backend commerce authorization (prices/orders independent of theme input)

| Item | Status | Evidence |
|---|---|---|
| `priceCart` recomputes everything server-side: merchant by slug, live payment rails, variants by id from service-role read, unit prices from `product_variants.price_amount_minor_int`, stock checks, shipping/VAT/coupons server-side. Client cart supplies only `variantId+quantity` — there is no client-price field in the pricing path. | EXECUTABLE | `src/lib/pricing.server.ts:88-181` (DB price at `:175-177`, stock `:168-169`); `createOrder` consumes `priceCart` totals and writes them (`src/lib/orders.server.ts:100-106,337-361`) — order/line/payment rows carry `totals.*`, never theme-supplied amounts |
| Coupon validation + atomic slot reservation server-side; recording failure voids the order | EXECUTABLE | `validateCoupons` + `redeem_coupon_slot`/`release_coupon_slot` `src/lib/orders.server.ts:165-217,434-478`; `coupons.server.ts:51` caps discount at subtotal |
| Stock holds merchant-scoped, fail-closed; consume requires live holds under the order's merchant | EXECUTABLE | `reserveStock`/`consumeStock`/`releaseStock` `src/lib/checkout.server.ts:82-268,286-415` (merchant mismatch ≡ missing hold, `:184-186,320-328`) |
| Plugin hooks (`cart.calculate`, `checkout.validate`, `order.created`) are advisory emissions that can never change totals/stock/orders | EXECUTABLE | `carts.server.ts:65-88`, `checkout.server.ts:237-263`, `orders.server.ts:651-674` (each: "advisory hook — never affects the core result"; checkout token/cart token withheld from vendors) |
| Marketplace listing prices re-read by slug at install; term prices validated (`market_listing_terms_invalid`) | EXECUTABLE | `validateListingTermPrice`/`loadListingPricing` `src/lib/marketplace-install.server.ts:854-861,1554-1619` |

## 13. Trust levels A/B/C (grounded definitions)

- **Level A — official source-backed code.** What it is today: the two source-owned
  themes (`songoskriti`, `somvabona` via `builtin-themes.ts:15-36`, installed by
  `appearance.server.ts:350-580`) and the three source-registered official plugins
  (`official-plugins.ts:39-43`, installed by `official-plugins.server.ts:268-397`).
  This code ships in the repo, renders in the main document with no sandbox frame
  and no install consent, and is gated by the repo-side controls only: typecheck,
  unit/contract tests, secret scan, SAST suspicious-diff, blocking dep audit
  (`.circleci/config.yml:36-169`). Nothing about Level A executes from merchant bytes.
- **Level B — reviewed developer themes (does not exist yet).** What it would be:
  today's custom-theme lane minus the data-only restriction — i.e. the gap rows in
  §§1-2/7/11 (install-time property allowlist, origin/session split, reviewer-only
  SVG override, C6-reason-5 detector, structured review identity/SLA). Today custom
  themes **cannot** execute in the main document: manifests carry no code fields
  (§1), ZIPs refuse all executables (§2), stylesheets are scoped/sanitised
  (`custom-code.ts:187-341`), and publish is gated (`composePublishGate`). Any Level B
  proposal must name which of these bans it lifts and which executable check replaces
  each one — the POLICY-ONLY rows above are that checklist.
- **Level C — isolated iframe plugins (exists today).** What it is: every
  `plugin:{id}/{widget}` bundle, official or community, runs only inside the
  null-origin `WidgetSandbox` island (`WidgetSandbox.tsx:206-324`) and touches the
  app solely through the scoped bridge (`authorizeWidgetCall`,
  `marketplace-scopes.ts:359-386`) under install-time scopes, flood/timeout budgets
  (`bridge-flood-guard.ts`), entry AST gates (`plugin-js-scan.ts`), and Tier-0/approval
  gates (`plugins.server.ts:319-434`). **Nothing that runs in the main document today
  comes from a plugin bundle; only iframes do.**

## 14. Stale-premise corrections (changelog/prose vs current code)

1. `CHANGELOG.md:438` (Oct 3) "gsap is the required single engine (policy sentence
   only)" — STALE: now enforced by `motion.contract.test.ts:165-203` in blocking CI.
2. `CHANGELOG.md:438` "No dep-deny module or SRI rule exist" — STILL TRUE for both
   (verified: no deny module, zero `integrity=` in `src/`/`scripts/`).
3. `docs/developers/review-policy.md:17-26` "C6 applied in human review, not by an
   automated gate; no rule in publish-gates.ts checks for them" — STALE: `trustGate`
   (`publish-gates.ts:725-730`) + install/manifest wiring enforce the 4 mechanical
   detectors. Rewrite §1 around the mechanical/human split.
4. `src/lib/themes/appearance.ts:52-56,92-117` (official themes via `installPackage`
   artifact pipeline) — STALE: retired by `appearance.server.ts:295-310`; installs
   are source-initialised, no artifact exists.
5. `src/lib/official-plugins.ts:1-29,61-73` (official plugins as internally-built
   ZIP artifacts installed by `installPackage`) — STALE: server path
   (`official-plugins.server.ts:1-66,268-397`) is source-direct with fingerprint
   identity; no archive is built.
6. Oct 11 proposal state inputs (§Status inputs, `custom-theme-components/proposal.md:101-108`):
   `scan:deps … || true` and "E2E skip-when-harness-missing" are FIXED (blocking dep
   audit `.circleci/config.yml:153-155`; fail-closed `e2e:required` gates). The
   "official-plugin builds internal bytes + installPackage" input is superseded (see 5).

## 15. Deviations

- None from the task constraints: no branch switch (stayed on `frame30`), no commits,
  no pushes, no deploys, no modifications to existing files. `ops/routing/*.conf`
  modifications pre-existed in the working tree and were not touched.
- Scope note: "dependency-DENY module" was checked repo-wide (code + scripts + CI +
  changelog); only the changelog sentence references it. "SRI rule" was checked via
  `integrity=` (zero hits in `src/`) and `integrity|sri` in `scripts/` (zero hits) —
  not via a full build-output audit; if the release pipeline injects SRI post-build,
  that lives outside this tree and should be confirmed from deploy config.
- `reviewVersion` role enforcement was judged from the function signature and
  call-site shape only; route-level authZ around the moderation queue was not traced
  end-to-end — flagged POLICY-ONLY pending that trace, not asserted broken.
