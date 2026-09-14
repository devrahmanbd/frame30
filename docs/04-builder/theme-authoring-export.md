# 04-builder — Theme Authoring, Fonts, Global Widgets, Export & Theme SDK

Status: **Executable TODO (Phase 11)** · Companions: `theme-runtime.md`, `theme-registry.md`, `theme-plan-apparel.md`, `publishing.md`, `../12-marketplace/themes.md`

Model to match: WordPress + Elementor. Widgets are **global**; the *theme* supplies colour, type,
spacing and per-widget default styling. Fonts are chosen **per theme, in the builder**, not in code.
Designs are **exportable** (`.json` + image folder in a `.zip`), and developers can build and export a
**fully coded theme** on our TanStack stack.

Legend: `[ ]` todo · `[x]` already true in the codebase · `[!]` publish-blocking gate

---

## 1. Per-theme Google Fonts, managed in the builder

Current state: `FONT_PAIRINGS` (5 keys incl. `custom`) in `builder-ast.ts`; `FONT_PRELOAD.stylesheet`
in `web-vitals.ts` is a **hardcoded constant** (Noto Sans Bengali + Inter); the token editor exposes
pairing only.

- [ ] Extend `ThemeTokens` with a `fonts` block: `{ display: FontSpec, body: FontSpec }` where
      `FontSpec = { family, source: "google" | "custom" | "system", weights: number[], subsets: ("latin"|"bengali")[] }`.
      `fontPairing` stays as the preset shortcut and writes into `fonts`.
- [ ] Builder font panel (`TokenEditor.tsx`, Type group): searchable Google Fonts picker per role
      (display / body), weight multi-select, live preview in EN **and** বাংলা, "reset to pairing".
- [ ] Google catalogue is a **build-time snapshot** (`src/lib/google-fonts.ts`, family + weights +
      subsets only). No runtime call to the Google API from the builder or the storefront.
- [!] Server-side validation on save: family must exist in the snapshot, ≤ 4 weights per family,
      ≤ 2 families per theme, subsets limited to `latin` + `bengali`. Reject with
      `font_spec_invalid`; never persist an unvalidated family name into a stylesheet URL.
- [ ] Derive the stylesheet per theme: `themeFontStylesheet(tokens)` builds the `css2?family=…&display=swap`
      URL from `tokens.fonts`; `FONT_PRELOAD` keeps only `origins` + `fallbackFaces` as the defaults.
      `__root.tsx` uses the platform default; storefront routes emit the **published theme's** URL.
- [!] Every theme must resolve a Bangla-capable body face — otherwise a Bangla fallback is appended
      automatically at render time (`--font-bangla` stack). Font resolver test per pairing × locale.
- [ ] Metric-matched `@font-face` fallback per newly allowed family (`size-adjust` captured once);
      missing fallback fails the vitals gate.
- [ ] Merchant custom upload: bucket `theme-fonts`, path `{merchantId}/{family}/{weight}.woff2`,
      `.woff2` only, ≤ 400KB/file, ≤ 4 files/family, magic-byte + parse validation server-side.
- [!] Licence attestation stored with the upload (`font_assets.licence_confirmed_at`); no attestation, no publish.
- [ ] CSP: `font-src`/`style-src` extended to the storage origin and `fonts.gstatic.com` only.
- [ ] Fail-safe: a 404 or invalid custom font falls back silently to the theme pairing and increments
      `framique_theme_font_fallback_total`.

---

## 2. All widgets global + per-theme default styling

- [x] `WidgetMeta` carries no `themeKey`; no renderer branches on a theme key (asserted in
      `definition-of-done.test.ts`).
- [ ] Rename the "vertical" registry comment groups (Atelier / Circuit / Rupaboti) to capability
      groups (`editorial`, `spec-heavy`, `beauty-fit`) so nothing *reads* theme-exclusive; every widget
      stays listed in the tray for every theme.
- [!] Each of the 117 widgets ships a **theme-neutral default style** driven by tokens only: no
      hardcoded colour utilities, no per-widget font pickers, no inline `transition`/`animation` in
      preset `html` blocks. Lint rule + test.
- [ ] `themeStyleOverrides`: an optional token-only style map on the theme
      (`{ [widgetType]: { surface?, ink?, radius?, density?, reveal? } }`) merged **under** section-level
      props, so a theme can restyle any widget without touching its renderer.
- [ ] Per-theme visual pass: each preset sets colour/spacing/motion + `themeStyleOverrides` so the
      same widget looks native in Bazaar, Atelier, Circuit and Rupaboti.
- [!] A widget that renders differently based on anything other than tokens/props fails review.

---

## 3. Design export — `.zip` (`design.json` + `images/`)

- [ ] `exportDesign(merchantId)` server fn produces:
      ```text
      export.zip
        design.json          # { apiVersion, theme: { tokens, fonts }, templates: {…AST}, assets: [{ id, path, alt }] }
        images/
          hero-home.webp
          product-01.webp
        README.txt           # provenance: store, theme key/version, exported_at
      ```
- [ ] Image filenames are derived from the asset's role + slug (never opaque UUIDs) and rewritten
      inside `design.json` as relative `images/…` paths.
- [ ] Zip built in-memory with a Worker-safe pure-JS zip writer (no native deps); budget ≤ 50MB,
      ≤ 500 files — overflow returns a clear error, never a truncated archive.
- [ ] `importDesign(zip)`: validates `apiVersion` against `BUILDER_API_VERSION`, parses every template
      through `parseTemplates`, uploads images tenant-scoped, then writes a **draft** version only.
- [!] Import never publishes, never overwrites the live revision, and runs the full lint +
      বাংলা-coverage gate before it can be published.
- [ ] Rate-limited (`builder.design_export`, `builder.design_import`) and audit-logged.

---

## 4. Coded theme development (TanStack stack) + full export

- [ ] `theme-sdk`: typed authoring surface (`defineTheme({ key, tokens, fonts, templates, demo })`)
      re-exporting `Section`/`ThemeTokens`/registry types so a theme is a typed TS module.
- [ ] `npx framique-theme dev|build|package` — dev runs against the local storefront preview,
      build type-checks + lints the AST, package emits the `theme.yaml` artifact of `theme-runtime.md` §1.
- [ ] `exportCodedTheme(themeKey)`: full source `.zip` — `theme.yaml`, `ast/*.json`, `tokens/*.json`,
      `fonts.json`, `demo/*.json`, `assets/`, plus a TanStack starter (`package.json`, `tsconfig.json`,
      `src/theme.ts`) so a developer can round-trip a builder design back into code.
- [!] Coded themes stay **renderer-free**: they may not ship React components for storefront render;
      interactivity goes through sandboxed widget JS (`theme-runtime.md` TR-5) and the plugin platform.
- [ ] Marketplace submission reuses the same package + review gate; `api` range checked with
      `satisfiesApiRange` against `BUILDER_API_VERSION`.
- [ ] Docs: authoring quickstart, token reference, widget catalogue, budget table, review checklist.

---

## 5. Cross-checks to keep green

- [!] Fonts: pairing × locale resolver, weight/family/subset budget, fallback faces present, per-theme
      stylesheet derived (never hardcoded on storefront routes).
- [!] Widgets: every registry type reachable in every theme, no `themeKey`, no theme branch, token-only styling.
- [!] Themes: all presets parse/lint/round-trip in EN + বাংলা, ≥ 90% বাংলা coverage, designed dark set
      where declared, export → import → export is byte-stable for the AST.
- [!] Plugins: manifest parse, permission diff, `PLUGIN_BUDGET`, sandbox attributes, kill switch,
      `api` range gate.
