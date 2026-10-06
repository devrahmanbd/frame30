# Themeable widgets (Class B)

Last verified: 2026-10-06.

Audience: plugin developers who want every theme to dress their
widget, and theme developers dressing a community widget. Class B
means the widget declares the versioned theme-safe contract
(`themeable`) in its manifest: schema, data, actions, slots, states.
The theme owns every pixel; the bundle never executes on the dressed
path, so sandboxing is never weakened
(`src/lib/plugin-theme-contract.ts:1-30`).

## Class A vs Class B, one glance

```text
Class A (isolated)                    Class B (themeable)
no `themeable` field                  valid `themeable` contract (version 1)
bundle owns UI in frame               theme owns every pixel via registry 2
theme cannot restyle inside           undressed -> generic sandboxed island
`resolveCommunityRender -> sandbox`   `resolveCommunityRender -> theme | island`
```

The class is a presence check: `pluginWidgetClass`
(`src/lib/plugin-theme-contract.ts:66-70`). A malformed `themeable`
declaration fails manifest validation (`widgets[i].themeable`)
instead of silently rendering as Class A
(`src/lib/plugin-manifest.ts:455-466`).

## Declare the contract (plugin side)

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
    "slots": ["header", "footer"],
    "actions": ["submit"]
  }
}
```

Contract rules (`src/lib/plugin-theme-contract.ts:44-139`):

- `version` must equal `PLUGIN_THEME_CONTRACT_VERSION = 1`
  (`src/lib/plugin-theme-contract.ts:36-37`). No other version
  validates today.
- `schema` is a required non-empty ref (max 500 chars); `data`
  defaults to `schema` when absent.
- `actions`, `slots`, `states` are optional name lists (max 32
  names, 64 chars each). Name the integration points the theme may
  implement — loading, empty, and ready states at minimum.
- Data rule (v1): the contract carries no live rows. The theme
  presentation receives the install's validated settings values as
  `data` — the same values the sandbox serves over
  `plugin.settings` (`src/lib/plugin-theme-contract.ts:16-20`).

## Dress the widget (theme side)

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

// themeKey x namespaced pluginKey. First wins; never throws.
registerCommunityPresentation(
  "my-theme",
  "plugin:my-reviews/stars",
  StarsDressed,
);
```

Registry rules mirror the widget registry: first registration wins,
resolution never throws, unknown themes never resolve to another
theme's presentation
(`src/lib/plugin-theme-contract.ts:160-220`).

## How the dressed path renders

The single decision point is `resolveCommunityRender` (**internal**,
`src/lib/plugin-theme-contract.ts:266-297`):

| Decision  | Meaning                                              |
| --------- | ---------------------------------------------------- |
| `blocked` | One of the five labeled failures; placeholder        |
| `sandbox` | Class A; the iframe island, unchanged                |
| `island`  | Class B but undressed; generic sandboxed island      |
| `theme`   | Class B dressed; theme presentation owns every pixel |

`PluginBlock` renders the dressed path only when the decision is
`theme` **and** a presentation resolves; every other outcome falls
through to the identical sandboxed island
(`src/components/builder/PluginBlock.tsx:86-122`).

## Sandbox boundary note

On the dressed path the bundle never executes, so sandboxing is
never weakened; on every other path the frame, CSP, and bridge rules
apply unchanged. See [Security / Sandbox](security-sandbox.md).

Next: [Menu Extensions](menu-extensions.md).
