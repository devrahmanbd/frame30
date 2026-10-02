# Theme isolation — no shared components in themes (staff only)

Status: Normative · Enforces AGENTS.md rule 7 · Guard: `src/lib/themes/isolation.test.ts`
Companions: [theme authoring reference](../themes/creation.md) §13 (Elementor rule) ·
[builder runtime guide](../04-builder/README.md) (dashboard-menu data flow) ·
[SDK contracts](sdk-contracts.md) (integrator surface)

## 1. The rule

No production file under `src/lib/themes/<theme>/` may import from
`src/components/` — via `@/components/*` alias or relative paths alike.
Themes are **data + lib-only builders**: tokens, skins, section builders,
header-fallback data, preview sources. They call engine widgets by key;
they never pull shared components in.

The boundary runs one way only, through key-driven config (config, not
theme code — deliberately unscanned by the guard):

- `src/components/store/theme-chrome.ts` — masthead fallback menu, logo,
  announcement copy per theme key.
- `src/lib/preview-sources.ts` — preview-source registry per theme key.

Shared renderers (`src/components/store/*`, `src/components/builder/*`)
must additionally carry zero per-theme literals and zero ungated
brand-asset paths (guard checks b–d below).

## 2. What is allowed vs refused

| Import in `src/lib/themes/<theme>/`                                                                                              | Verdict                       |
| -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `@/lib/builder-ast`, `@/lib/theme-section`, `@/lib/bitext`, `@/lib/footer-copy`, `@/lib/permalink`, `@/lib/menus/*` (engine lib) | Allowed — neutral ground      |
| `./tokens`, `./skins`, `./header-fallback` (own theme dir)                                                                       | Allowed                       |
| `./skins.css` (own stylesheet, token-only)                                                                                       | Allowed                       |
| `@/components/*` or `../../components/*` (any shared component)                                                                  | **Refused — fails check (e)** |
| `../<other-theme>/*` (cross-theme import)                                                                                        | **Refused — fails check (a)** |
| Hardcoded brand literals in shared chrome (`StoreHeader.tsx`, `chrome.tsx`)                                                      | **Refused — fails check (b)** |
| Ungated `/ph/<theme>` asset literals in shared renderers                                                                         | **Refused — fails check (d)** |

Test files (`*.test.*`) are excluded from the walk: they must resolve
renderers through `@/components/builder/widgets` to assert output
(e.g. `render.test.tsx`). Exclusion is for tests only — never for
shipping theme code.

## 3. Why

Two incidents set this rule:

1. **Cross-theme brand leak (2026-09-27)** — a shared renderer hardcoded
   one theme's footer statement and printed it on another theme's page.
   Brand copy lives in theme builders and section props, never in shared
   renderers.
2. **Engine-widget orphan (2026-09-30)** — deleting a theme removed the
   only renderers for five catalog widgets. Orphaned engine widgets now
   live in the neutral `src/components/builder/discovery.tsx` layer;
   themes consume them by key and never own shared rendering.

## 4. Reviewer checklist (new theme / theme edit)

1. `bun x vitest run src/lib/themes/isolation.test.ts` — 6/6 green,
   including check (e).
2. New theme dir contains no `from "@/components` / `from "../../components`
   in prod files (`rg` both spellings).
3. No new per-theme literals in `StoreHeader.tsx` / `chrome.tsx`;
   theme-keyed needs go in `theme-chrome.ts` + `preview-sources.ts`.
4. No new `/ph/<theme>` literals outside `src/lib/themes/<theme>/`
   (demo catalogs excluded — themes own their asset paths).
5. `rg -i <retired-key>` returns zero on theme removal (no orphan refs).
