# Plugin sandbox limits

What a third-party marketplace plugin can and cannot do. Every limit below is
enforced in code, not by convention — the referenced module is the single place
the decision is made.

## Isolation

`src/components/marketplace/WidgetSandbox.tsx` hosts every bundle in an
`<iframe sandbox="allow-scripts">`. That attribute set, with `allow-same-origin`
deliberately absent, gives the frame a null opaque origin. Consequences:

- No access to the host DOM, and no access to the host's cookies,
  `localStorage`, `sessionStorage` or IndexedDB.
- No form submission, no top-level navigation, no popups, no pointer lock.
- The frame document carries
  `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'`,
  so a bundle cannot fetch, XHR, open a WebSocket, load an image from a tracker,
  or pull in a remote script. It runs on the bytes it shipped with.

The only channel out of the frame is `postMessage` to the host.

## The bridge

Bundles call the host through `window.framique.call(method, params)`. Each
message is checked by `authorizeWidgetCall` in `src/lib/marketplace-scopes.ts`
before the host does any work. A message is rejected when it is malformed
(`v !== 1`, missing `id`/`method`), when the method is not in `WIDGET_API`, or
when the merchant did not grant the scope that method requires.

The full method surface — there is no dynamic or catch-all method:

| Method | Required scope | Writes |
| --- | --- | --- |
| `shop.info` | `read_shop` | no |
| `products.list` | `read_products` | no |
| `products.update` | `write_products` | yes |
| `orders.list` | `read_orders` | no |
| `customers.get` | `read_customers` | no |
| `cart.add` | `write_cart` | yes |
| `cart.remove` | `write_cart` | yes |
| `analytics.track` | `write_analytics` | yes |

Scopes are declared in the manifest and shown to the merchant at install time
with a risk level and a plain-language effect line in English and Bangla
(`SCOPES`). `read_customers` and `write_products` are marked `high` risk;
`read_orders`, `write_cart` and `render_storefront` are `medium`.

Payment credentials, settlement records, staff accounts, platform
administration and raw SQL are not reachable from any scope.

## Size and performance budgets

`PLUGIN_BUDGET` in `src/lib/plugin-manifest.ts`:

- `jsKb: 120` — a manifest declaring a larger JS budget fails validation with
  `budget.jsKb`.
- `mainThreadMs: 50` — likewise rejected as `budget.mainThreadMs`.

`MAX_BUNDLE_BYTES` in `src/lib/marketplace-scopes.ts` caps the uploaded bundle
at 512 KB regardless of what the manifest claims.

## Extension points

A manifest may only reference documented hooks and slots; anything else is a
validation error.

- Server hooks (`SERVER_HOOKS`): `cart.calculate`, `checkout.validate`,
  `order.created`, `product.saved`.
- Storefront block targets (`BLOCK_TARGETS`): `header`, `body`, `product`,
  `cart`, `footer`.

## Kill switches

`PluginBlock` renders a failure placeholder instead of the plugin when it is not
installed, when the merchant paused it, when the platform kill switch disabled
it for the tenant, or when it declares an incompatible builder API version. A
disabled plugin never gets an iframe, so its code does not execute at all.

## Reviewing a submission

1. Confirm the requested scopes are the minimum the described feature needs —
   a display widget asking for `read_customers` should be rejected.
2. Confirm the declared budgets are within `PLUGIN_BUDGET` and the bundle is
   within `MAX_BUNDLE_BYTES`.
3. Confirm every hook and block target is in the documented lists.
4. Install into a staging store and watch for `scope_denied` verdicts — they
   mean the manifest and the code disagree.
