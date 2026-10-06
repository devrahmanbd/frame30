# Examples (minimal, verified)

Last verified: 2026-10-06.

Copy-paste-concept snippets. Each uses only real APIs pinned to
implementation; adapt names, never signatures. All snippets are
conceptual illustrations — run the starter suites
([Getting Started](getting-started.md#copy-a-starter-run-its-tests))
before shipping variations.

## 1. Claim a widget presentation (theme)

```ts
import { registerThemePresentation } from "@/lib/theme-presentations";
import type { WidgetComponent } from "@/components/builder/widgets";

export const MyRail: WidgetComponent = (ctx) => {
  const heading = ctx.str("heading"); // typed prop reader on the widget context
  if (!heading) return null; // empty data collapses, never renders empty chrome
  return <section data-widget="product_rail">{heading}</section>;
};

// themeKey x widgetType. First registration wins; never throws.
registerThemePresentation("my-theme", "product_rail", MyRail);
```

Contract: `src/lib/theme-presentations.ts:35-83`. Unregistered
pairs fall back with zero behavior change
(`src/components/builder/SectionRenderer.tsx:272-275`).

## 2. Ship a Class A widget (plugin)

```json
{
  "id": "my-reviews",
  "version": "1.0.0",
  "api": "^3.0.0",
  "permissions": ["read_shop", "render_storefront"],
  "widgets": [
    {
      "key": "summary",
      "label": "Review summary",
      "slots": ["main"],
      "entry": "var box=document.createElement(\"div\");box.textContent=\"Summary.\";framique.mount(box);"
    }
  ],
  "hooks": [],
  "settings": [
    { "key": "title", "label": "Title", "kind": "text", "default": "Reviews" }
  ],
  "i18n": { "en": { "title": "Title" }, "bn": { "title": "শিরোনাম" } },
  "budget": { "jsKb": 40, "mainThreadMs": 15 }
}
```

Gate: `parseManifest` (`src/lib/plugin-manifest.ts:393-543`).
Renders at `plugin:my-reviews/summary`
(`src/lib/plugin-manifest.ts:295-306`).

## 3. Declare and dress a Class B widget (plugin + theme)

Plugin manifest widget — the `themeable` block makes it Class B:

```json
{
  "key": "stars",
  "label": "Rating stars",
  "slots": ["main"],
  "entry": "var box=document.createElement(\"div\");box.textContent=\"Rating.\";framique.mount(box);",
  "themeable": {
    "version": 1,
    "schema": "stars:v1",
    "states": ["loading", "empty", "ready"],
    "actions": ["submit"]
  }
}
```

Contract shape and normalization:
`src/lib/plugin-theme-contract.ts:44-139`. `version` must equal
`PLUGIN_THEME_CONTRACT_VERSION = 1`
(`src/lib/plugin-theme-contract.ts:36-37`).

Theme dressing — owns every pixel; receives validated settings as
`data`:

```tsx
import { registerCommunityPresentation } from "@/lib/plugin-theme-contract";
import type { CommunityPresentationProps } from "@/lib/plugin-theme-contract";

function StarsDressed({
  pluginId,
  widgetKey,
  data,
}: CommunityPresentationProps) {
  if (!data["count"]) return <p>No ratings yet.</p>;
  return (
    <section data-plugin={pluginId} data-plugin-widget={widgetKey}>
      <p>
        Rated {String(data["average"])} from {String(data["count"])} reviews.
      </p>
    </section>
  );
}

registerCommunityPresentation(
  "my-theme",
  "plugin:my-reviews/stars",
  StarsDressed,
);
```

Registry: `src/lib/plugin-theme-contract.ts:160-220`. Undressed
Class B falls back to the generic sandboxed island
(`src/lib/plugin-theme-contract.ts:266-297`).

## 4. Read menu rows from the sandbox (Shape 1 fill)

```js
// Inside the widget entry. Rows in, markup out — the engine renders the nav.
const rows = await window.framique.call("menus.list", { slot: "menu_bar" });
const box = document.createElement("div");
box.textContent = "See the menu above: " + rows.length + " items.";
framique.mount(box);
```

Bridge: `menus.list` behind `read_menus`
(`src/lib/marketplace-scopes.ts:260-279`), readable by default with
any storefront grant (`src/lib/marketplace-scopes.ts:306-317`).
Sanctioned slots only: `menu_bar`, `menu_dropdown`, `menu_drawer`
(`src/lib/marketplace-scopes.ts:291-299`).

## 5. Check a menu swap gate (engine-side, internal pattern)

```ts
import { decideMenuRenderer } from "@/lib/plugin-manifest";

// Conceptual: the engine (not your code) runs this per slot.
// A swap renders only with review approval AND the replace_menus scope.
const decision = decideMenuRenderer(claims, "menu_bar", grantedScopes);
if (decision.kind !== "plugin") {
  // Render the theme default. Never blank, never a placeholder.
}
```

Gate: `src/lib/plugin-manifest.ts:102-125`. This function is
**internal** engine machinery — plugin developers request the scope
and await approval; theme developers render the winning rows they
are given (see [Menu Extensions](menu-extensions.md#shape-2-swap-replace-a-renderer-only-when-approved)).

## 6. Validate locally before submitting

```ts
import { parseManifest } from "@/lib/plugin-manifest";

const verdict = parseManifest(manifestJson);
if (!verdict.ok) {
  console.error(verdict.errors); // e.g. ["id", "permissions:unknown_scope"]
} else if (verdict.warnings.length) {
  console.warn(verdict.warnings); // e.g. ["i18n.bn_missing:2"]
}
```

The single shared gate: `src/lib/plugin-manifest.ts:393-543`.
