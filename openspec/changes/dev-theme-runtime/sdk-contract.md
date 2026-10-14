# Level B Developer Themes — SDK Contract (dev-theme-runtime)

Status: contract + first executable piece (`src/lib/dev-theme-manifest.ts`).
The runtime (sandboxed execution) and the bundle pipeline (build/ship) are
explicit follow-ups and land only after this contract is reviewed.

## 0. Where Level B sits

- **Level A (today):** merchants skin the AST/widget catalogue — tokens,
  templates, styles. No custom components. Unchanged by this contract.
- **Level B (this contract):** reviewed developer themes ship custom
  components, GSAP timelines, and Three.js scenes inside a declared,
  capability-gated manifest. Every release is reviewed before it publishes.
- **Level C (existing):** isolated plugin widgets in the null-origin iframe
  island + scoped `postMessage` bridge. Preserved by reference (§8) — Level B
  does not redesign it, and Level B components never escape into it.

## 1. Manifest shape (`dev.theme.json`)

```json
{
  "id": "aurora-lookbook",
  "version": "1.0.0",
  "runtime": "1.0.0",
  "name": "Aurora Lookbook",
  "publisher": "Studio Framique",
  "capabilities": ["presentation", "animation"],
  "dependencies": [
    {
      "name": "gsap",
      "version": "3.15.0",
      "license": "MIT",
      "integrity": "sha384-<base64-digest>"
    }
  ],
  "sections": [{ "key": "hero", "slot": "main", "component": "HeroCanvas" }],
  "settings": [{ "key": "headline", "label": "Headline", "type": "text" }]
}
```

| Field                | Rule (enforced by `parseDevThemeManifest`)                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                 | Slug: `^[a-z][a-z0-9-]{2,63}$` (lowercase start, hyphens not underscores).                                                                                                                                                                 |
| `version`            | Strict semver `x.y.z` (no `v` prefix, no ranges).                                                                                                                                                                                          |
| `runtime`            | **Exact pin**: must equal `DEV_THEME_RUNTIME_VERSION` (`"1.0.0"`). Ranges (`^1.0.0`), future pins (`2.0.0`), and unknown pins are rejected — a theme built for another runtime never installs.                                             |
| `name` / `publisher` | Required non-empty display strings (trimmed, ≤ 80 chars).                                                                                                                                                                                  |
| `capabilities`       | Array, subset of the closed allowlist (§2), no duplicates.                                                                                                                                                                                 |
| `dependencies`       | Array of `{name, version, license, integrity}` — all four required. `integrity` must match `sha(256\|384\|512)-<base64>` **shape** (no fetching at validate time; the pipeline verifies the digest against the immutable bytes at review). |
| `sections`           | Array (≤ 64) of `{key, slot, component}`; `slot` from §3.                                                                                                                                                                                  |
| `settings`           | Array (≤ 128) of `{key, label, type}`; `type` from the closed builder-field set (§4).                                                                                                                                                      |
| forbidden keys       | Presence of `server`, `hooks`, `secrets`, `network`, or `network-capability` at the top level rejects the manifest (§7).                                                                                                                   |
| size                 | Manifest JSON ≤ 64KB.                                                                                                                                                                                                                      |

## 2. Capability declarations (closed allowlist)

1. `presentation` — declarative section/component markup + design tokens only.
2. `animation` — GSAP timelines under the page motion budget; decorative
   motion is killed under `prefers-reduced-motion` (existing precedent:
   `src/lib/motion-runtime.ts`, `src/lib/motion.contract.test.ts`).
3. `webgl` — Three.js scenes in an isolated canvas with a static-image
   fallback when WebGL is unavailable.
4. `commerce-read` — read-only product/collection/variant data via the typed
   commerce context (§5); never raw store APIs.
5. `cart-write` — add/remove cart lines through the scoped cart bridge; the
   theme NEVER decides price or payment (§5).

Any other capability string is rejected. Capabilities are a review input: a
theme declaring `webgl` or `cart-write` gets the corresponding checklist
(WebGL fallback proof, forged-commerce-action proof) before approval.

## 3. Component registration + section slots model

A developer section plugs into page templates **without modifying core**:

- Templates are the closed set in `src/lib/builder-ast.ts` (`TEMPLATE_KEYS`:
  `index, product, collection, account, page, blog, cart, checkout, search`).
  Level B adds no template and edits no template file.
- A registration `{key, slot, component}` binds a developer component to an
  AST slot. Allowed slots mirror the AST layout slots plus overlay named
  zones (`builder-ast.ts`: `SLOTS` + `TEMPLATE_ZONES`): `header`, `main`,
  `footer`, `sidebar`, `drawer`, `popup`.
- Checkout-exclusive surfaces (`thank_you`, payment steps) are **not**
  bindable: a developer section can never cover a payment step, and popups
  stay off checkout (same rule as `TEMPLATE_ZONES`).
- At render, the host instantiates the registered component with the same
  `Section` shape (`{id, type, props, children?, hidden?, bp?}`) the core
  catalogue uses (`src/components/builder/widgets.tsx` section model) — the
  developer component is a new renderer for a registered key, never a fork
  of the renderer map. `Record<SectionType, WidgetComponent>` stays closed;
  Level B keys live in the manifest registry, not in core source.
- Props arriving at the component are the merchant's settings values only
  (typed by §4); host context (locale, money formatter, links) comes through
  the same reader contract core widgets use (`str`/`bool`/`int`/`money`/
  `link`), so bilingual fallback and minor-units money rules hold for
  developer sections too.

## 4. Settings schema types (closed builder-field set)

Level B settings use exactly six types, mirroring the builder's declared
fields (`src/lib/studio/controls.ts`, `src/lib/builder-ast.ts` skins/props):

| Type                | Builder mirror                                      | Notes                                                                  |
| ------------------- | --------------------------------------------------- | ---------------------------------------------------------------------- |
| `text`              | text/textarea controls                              | Copy only; rendered escaped.                                           |
| `image`             | image control                                       | Asset-library reference; upload stays platform-side, theme gets a URL. |
| `color`             | color control                                       | Token-bound; cannot redefine `--theme-*` tokens.                       |
| `spacing`           | slider/dimensions controls                          | Scale step (e.g. padding/gap), clamped by the runtime.                 |
| `product-selection` | catalogue picker                                    | Yields **ids only** — never prices, never inventory counts.            |
| `animation`         | interactions tab (entrance preset + duration/delay) | Preset name only; timelines run under the page budget.                 |

`code`, `html`, `url`, arbitrary selects, and any other kind are rejected at
the manifest gate. Richer declarative kinds arrive as reviewed contract
extensions (validator + render support ship together), never as theme-side
invention.

## 5. Commerce context contract

The platform provides typed, read-scoped context; the theme consumes it and
never replaces it:

- `product` — `{ id, title, handle, images, options, variants[] }` where
  `variant = { id, title, available: boolean }`. **No price field is exposed
  to theme code**; prices render through the host `money(minor)` formatter
  from server-quoted minor units.
- `collection` — `{ id, title, handle, productIds[] }` (paged by the host).
- `cart` — `lines[]` read model plus two scoped writes: `cart.add(variantId,
qty)` and `cart.remove(lineId)`. Writes travel the authorized bridge
  (precedent: `authorizeWidgetCall` + `WidgetSandbox.bridge`); ungranted
  calls are denied, malformed/oversize envelopes rejected.
- **Theme NEVER decides price/payment.** Totals are computed server-side from
  current catalogue prices (precedent: `quoteBundleTotal` in
  `src/lib/bundle-quote.server.ts` — "the browser never multiplies"; the
  `BundleOfferWidget` in `widgets.tsx` renders the total it is handed). Any
  client-computed total is display-only and revalidated at checkout; payment
  method widgets (`payment_methods`) and checkout steps stay core-owned and
  are not overridable by Level B sections.

## 6. Lifecycle: install → review → approve → publish → rollback

1. **Install (draft):** manifest gate (`parseDevThemeManifest`) + existing
   package pipeline gates (archive parser, layout, secret/CSS policy — same
   gates `installUploadedTheme` runs in
   `src/lib/themes/appearance.server.ts`) run **before any write**. Failure
   = no row, no replay key consumed.
2. **Review:** quarantine scan of the exact immutable bytes (SHA-256 pinned);
   capability-gated checklists (§2); human review for judgment calls
   (existing moderation-queue precedent). Scanner version recorded per scan.
3. **Approve:** explicit approval binds to the version's content hash (not
   its row id — precedent: `approveThemeVersion` /
   `theme.approved` content-hash binding in `appearance.server.ts`); secret
   (Tier-0) findings are never merchant-approvable.
4. **Publish:** only the reviewed `published_version_id` goes live; drafts
   are never auto-published and activation never resolves `MAX(version)`
   (precedent: `resolvePublishedVersionId`).
5. **Rollback:** the previous known-good version is retained; rollback mints
   a NEW version row carrying the target's content with an explicit
   rollback link (`rollback_of` + audit row — precedent: `rollbackPackage` /
   `rollbackPluginPackage` in `src/lib/package-install.test.ts` K3), never
   an enable-flip. Every disable/revoke records package/version identity +
   reason code.

## 7. Explicit non-goals (v1)

- No server-side code (`server` rejected).
- No hooks/webhook egress (`hooks` rejected; merchant webhooks stay on the
  existing `isAllowedHooksUrl` delivery-guarded path).
- No secrets in the package (`secrets` rejected; Tier-0, never approvable).
- No filesystem/shell access.
- No raw network imports in v1 (`network`, `network-capability` rejected;
  dependencies resolve from the platform-pinned registry with
  license + integrity, never from theme-declared URLs).
- No payment logic, no price authority, no checkout overrides (§5).

## 8. Preserved by reference (not redesigned)

- **AST path:** `src/lib/builder-ast.ts` — `Section`/`SectionType`,
  `TEMPLATE_KEYS`, `SLOTS`/`TEMPLATE_ZONES`, `MAX_TREE_DEPTH`,
  `MAX_NODES_PER_TEMPLATE`. This contract adds renderers-by-registration; it
  does not change the AST.
- **Level C iframe contracts:** `src/components/builder/HtmlSandbox.tsx`
  (authored markup sandbox), `src/components/builder/PluginBlock.tsx`
  (plugin island mount), `src/components/marketplace/WidgetSandbox.tsx` +
  `WidgetSandbox.bridge` (null-origin frame, `authorizeWidgetCall` scoped
  bridge, 64 KiB message cap, flood/duplicate/oversize guards),
  `src/lib/marketplace-scopes.ts` (scope vocabulary), `src/lib/plugin-manifest.ts`
  (Class A/B contracts), `src/lib/package-css-gate.ts` (package stylesheet
  gate derived from `scopeCss`).
- **Install/review/rollback precedents:** `installOfficialTheme` /
  `installCatalogTheme` / `installUploadedTheme`
  (`src/lib/themes/appearance.server.ts`), `src/lib/package-install.server.ts`,
  `src/lib/package-scan.ts`.

## 9. First executable piece (this change)

`src/lib/dev-theme-manifest.ts` — pure `parseDevThemeManifest(input:
unknown)` returning `{ok, manifest | errors[]}`. Enforces every §1 row
(id slug, semver, exact runtime pin, closed capabilities, dependency
`{name, version, license, integrity}` with `sha(256|384|512)-base64` shape
check, closed settings types, forbidden-key rejection, 64KB / 64-section /
128-setting caps). Tested by `src/lib/dev-theme-manifest.test.ts` (37
vectors: valid minimal/full, each rejection class, near-miss allows).
Runtime + bundle pipeline follow after review.
