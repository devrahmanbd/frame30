# Starter theme

A minimal working theme that demonstrates the third-party theme contract.
Copy this folder, rename the `STARTER_*` exports, and follow the
[theme development guide](../../docs/developers/themes.md).

- `tokens.ts` — brand tokens (`STARTER_TOKENS`).
- `skins.ts` — closed skin vocabularies, theme defaults, and the
  defaults-under-authored-props merge.
- `homepage.ts` — header, homepage, and footer builders (hero first,
  every string twinned in বাংলা).
- `preview.ts` — the `PreviewThemeSource` implementation (`null` for
  unauthored templates).
- `skins.css` — token-only skin stylesheet (no hex literals).
- `starter-theme.test.ts` — the five gates every theme must keep green:
  brand tokens, skin defaults, token-driven CSS, studio twin parity, and
  persist round trip.

Run the gates with `npx vitest run` using a config that includes this
folder (the repo default only matches `src/**`). This starter is not
registered in `src/lib/preview-sources.ts`, so it never affects the
shipped preview.
