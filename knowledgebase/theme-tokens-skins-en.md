---
title: "How do third-party theme tokens and skins work?"
locale: en
audience: developer
tags: [themes, tokens, skins, third-party, builder]
source: /docs/developers/themes
version: public-corpus-v1
status: published
---

**Q: I want to build a third-party theme. Where do styling and widget variants come from?**

Tokens are the only styling channel, and skins come from a closed core vocabulary. Start by copying the runnable starter theme in `examples/starter-theme/`, which demonstrates every contract below and pins five gates (brand tokens, skin defaults, token-driven CSS, studio twin parity, persist round trip) in its test suite.

**Answer**

- Set brand tokens through `ThemeTokens` (`src/lib/builder-ast.ts:6021`), parsed by `parseTokens` (`src/lib/builder-ast.ts:6143`) and emitted as CSS variables by `tokensToCss` (`src/lib/builder-ast.ts:6266`). Start from `DEFAULT_TOKENS` (`src/lib/builder-ast.ts:6076`).
- Keep bilingual EN/BN inline props on every user-facing string and BDT-first money display (symbol, Latin digits).
- Choose skins from the closed vocabulary in `WIDGET_SKINS` (`src/lib/builder-ast.ts:599`); the first option is the documented default. Unknown or empty values resolve to the widget default through `resolveSkin` (`src/lib/builder-ast.ts:638`) — never a crash, never empty. Skin values are style keys, never copy, so they carry no `_bn` twins.
- Wire theme defaults with the shared helper `withThemeWidgetDefaults` (`src/lib/builder-ast.ts:734`): defaults merge **under** authored props, so an explicit `skin` in the inspector always wins.
- Theme-side sets live in files like `src/lib/themes/songoskriti/skins.ts:35`; see the theme authoring reference (`docs/themes/creation.md`) and builder runtime guide (`docs/04-builder/README.md`) for the full path.

**Conditions**

- Skins stylesheets must stay token-only (no hard-coded colors or fonts); the package gates reject themes that bypass tokens (see `docs/themes/packages.md`).
- Skin values outside the core vocabulary are ignored by `resolveSkin`; do not rely on custom skin names rendering.
- The core lane owns the `skin` prop: every skinnable widget gains its **Skin** select via `SKIN_FIELD` (`src/lib/builder-ast.ts:648`).
