# Browser support policy

The storefront supports the last two releases of Chrome, Edge, Firefox,
Chrome for Android and Samsung Internet, plus Safari and iOS Safari 16.4 or
newer. `package.json#browserslist` is the machine-readable source of truth.
Vite converts that policy to its JavaScript syntax target at build time with
`browserslist-to-esbuild`; there is no separately maintained target list.

## Progressive enhancement

- Storefront content and product links are server rendered. The browser smoke
  gate reruns the storefront with JavaScript disabled.
- Container queries, dynamic viewport units and subgrid have baseline CSS
  fallbacks and are enabled only in matching `@supports` blocks.
- Native View Transitions and Popover APIs are not required by the storefront.
  Components use ordinary navigation and Radix overlays, so unsupported APIs
  do not remove functionality.
- The theme editor intentionally requires a viewport at least 1024px wide.
  Narrower screens receive a supported-viewport notice instead of mounting the
  data-heavy editor and its canvas.

## Release verification

Run `E2E_STORE_SLUG=<seeded-store> bun run e2e:browsers`. The selected fixture
must contain at least one in-stock product. The gate exercises home, collection
filtering, product detail, add-to-cart and checkout in Chromium, Firefox and
WebKit, then verifies that the same storefront remains readable and navigable
with JavaScript disabled. Network navigation gets one bounded retry; failures
are emitted as structured JSON and the command exits non-zero.
