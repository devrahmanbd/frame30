---
title: "How do I declare a plugin manifest reviewers will accept?"
locale: en
audience: developer
tags: [plugins, manifest, scopes, review, marketplace]
source: /docs/developers/plugins
version: public-corpus-v1
status: published
---

**Q: What does a valid Framique plugin manifest look like?**

Write the manifest and run it through `parseManifest` (`src/lib/plugin-manifest.ts:191`) before submitting — that function is the single gate the review pipeline, the install flow, and the host all share. Start from the runnable example in `examples/starter-plugin/` and run its vitest suite first.

**Answer**

- `id`: lowercase, starts with a letter, 3–40 chars (`src/lib/plugin-manifest.ts:90`).
- `version`: strict semver `major.minor.patch`, digits only (`src/lib/plugin-manifest.ts:201`).
- `api`: `^3.0.0` or `>=3.0.0 <4.0.0`; `latest` or `*` is rejected (`src/lib/plugin-manifest.ts:109`). The running builder version is `BUILDER_API_VERSION 3.1.0` (`src/lib/plugin-manifest.ts:18`).
- `permissions`: only the 8 catalog scopes — `read_shop`, `read_products`, `write_analytics`, `read_orders`, `write_cart`, `render_storefront`, `read_customers`, `write_products` (`src/lib/marketplace-scopes.ts:24`). A manifest with widgets must request `render_storefront` (`src/lib/plugin-manifest.ts:265`).
- `widgets[].key`: namespaced shape `plugin:{pluginId}/{widget}`, lowercase (`src/lib/plugin-manifest.ts:93`); slots must include at least one of `header`, `main`, `footer`.
- `hooks`: only `cart.calculate`, `checkout.validate`, `order.created`, `product.saved` (`src/lib/plugin-manifest.ts:24`); `hooksUrl` is required when hooks are non-empty and must be HTTPS.
- `budget`: entry JS `jsKb` at most 120 and `mainThreadMs` at most 50 (`src/lib/plugin-manifest.ts:302`).
- Request the minimum scopes the feature needs — display widgets asking for `read_customers` are rejected, and every extra scope costs conversion on the consent screen.

**Conditions**

- Consent grants must be a subset of the manifest permissions; unknown or superset scopes fail with `plugin_consent_required` and write nothing. Widening permissions later needs a fresh consent screen.
- Every widget renders inside a null-origin sandboxed iframe with no host DOM, cookies, or same-origin storage; the only channel out is `window.framique.call`, authorized per call by `authorizeWidgetCall` (`src/lib/marketplace-scopes.ts:267`).
- The entry bundle must stay free of `eval(`, `import(`, `new Function`, `document.write(`, and `.innerHTML =` assignments, and under 512 KB total.
