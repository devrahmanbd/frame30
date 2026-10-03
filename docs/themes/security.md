# Theme Security

Last verified 2026-10-03 @ `4f64367d`. Line pins are working-tree lines; the `lintTemplate` XSS pins cover uncommitted Phase 1B additions in this change.

Themes are JSON data, never code: a theme ships `tokens` plus `templates` parsed by `parseTemplates` and `parseTokens`, and nothing else executes. This page states each enforcement point once, with a source pin per claim. For authoring flow read [the theme authoring reference](./creation.md); for package gates read [the theme package spec](./packages.md); for server functions and publish flow read [the theme SDK](./sdk.md); for the third-party path read [the third-party theme guide](../developers/themes.md).

## 1. Output escaping — no unescaped output

Widget copy is merchant-authored and untrusted. The parser strips markup from every plain-text field through `sanitiseText` (`src/lib/builder-ast.ts:6693`), which removes `script`/`style` blocks, all tags, residual angle brackets, and control characters. The renderer then prints the value as a text node, never through `dangerouslySetInnerHTML` — the full capability contract is stated in one comment block (`src/lib/builder-ast.ts:6671`). Rejections increment a counter drained by `takeSanitiserRejects` (`src/lib/builder-ast.ts:6686`), so stripping is observable in metrics instead of silent.

Publish additionally blocks on any `error`-level finding: `publishVersion` collects `lintTemplate` errors per template key (`src/lib/themes.server.ts:430`) and refuses to publish while any remain (`src/lib/themes.server.ts:455`).

## 2. Inline-script ban

Merchant markup can never introduce an executing script into the host document:

- The `html` widget keeps two separate fields (`src/lib/builder-ast.ts:1254`): `body` is plain text with markup stripped, and `markup` survives parsing only because it never touches the host document. At parse time the only two things that could leak out of the sandbox frame are removed — `script` blocks and `on*=` handlers (`src/lib/builder-ast.ts:6814`).
- At render time the markup becomes the `srcDoc` of an `iframe` with no `allow-same-origin`, so it has no access to cookies, storage, or the parent DOM (`src/lib/custom-code.ts:685`, `src/components/builder/HtmlSandbox.tsx:1`). The frame tier policy tightens further by risk tier, down to not rendering at all (`src/lib/risk-tier.ts:103`, `src/lib/risk-tier.ts:220`).
- Body snippets (`body_start` / `body_end`) strip `script` and `style` blocks and reject inline event handlers with an error finding (`src/lib/custom-code.ts:598`).
- The storefront Content Security Policy never emits `unsafe-inline` for scripts: every inline script the platform ships carries the per-request nonce (`src/lib/custom-code.ts:762`).

Editor-time, the same vectors are now publish-blocking lint errors instead of silent strips: `lintTemplate` flags `script` tags and event handlers in `markup` and in `advCss` (`src/lib/builder-ast.ts:7396`, `src/lib/builder-ast.ts:7368`), wired into the per-section loop (`src/lib/builder-ast.ts:7684`).

## 3. `javascript:` URL ban

URL-typed props accept only `https:`, `http:`, site-relative paths, `#`, `mailto:`, and `tel:` — `javascript:`, `data:`, `vbscript:`, and protocol-relative `//host` URLs are rejected to empty (`src/lib/builder-ast.ts:6704`, `src/lib/builder-ast.ts:6676`). Embed (iframe) props are stricter still: only `https` URLs on the `EMBED_HOSTS` allowlist (`src/lib/builder-ast.ts:6707`), enforced by `safeEmbedUrl` (`src/lib/builder-ast.ts:6715`).

Inside `html` widget markup, attribute-position `javascript:`, `vbscript:`, and `data:text/html` URLs survive parsing structurally, so they are caught by the lint instead (`src/lib/builder-ast.ts:7396`), as are non-`https:` frame sources. The third-party package spec applies the same ban at the package boundary (`./packages.md:30`).

## 4. External resources and SRI

There is no external-script surface to attach Subresource Integrity to, by design:

- The head snippet allowlist admits verification `meta` tags, `canonical`/`alternate` links over `https:` or site-relative URLs, and `application/ld+json` blocks only — never a script `src` (`src/lib/custom-code.ts:448`).
- Custom CSS drops every `@import`, so stylesheets cannot pull a remote dependency (`src/lib/custom-code.ts:204`). Per-node `advCss` is scoped to its node and capped (see §6).
- Fonts load from a closed catalogue (`src/lib/theme-fonts.ts:39`); the generated stylesheet URL carries no `integrity` attribute because the origins are fixed (`src/lib/theme-fonts.ts:175`, `src/lib/theme-fonts.ts:192`). Merchant-uploaded faces are same-origin woff2 with licence and budget gates (`src/lib/theme-fonts.ts:303`, `src/lib/theme-fonts.ts:364`).
- Remote frames are limited to the `EMBED_HOSTS` allowlist (see §3).

Do not add an SRI mechanism without first adding an external-script surface — there is currently nothing it could protect.

## 5. Dependency gate

Theme packages declare no dependencies: they are JSON AST plus tokens, and the package validator rejects unknown widget types and executable content (`./packages.md:23`). For first-party theme modules under `src/lib/themes/`, two enforced invariants keep the dependency surface closed:

- **No cross-theme imports.** The isolation suite fails on any prod file under `src/lib/themes/<A>/` importing from `src/lib/themes/<B>/` (`src/lib/themes/isolation.test.ts:103`).
- **One animation engine, never statically imported by themes.** The platform keeps exactly one animation engine in the dependency list (`src/lib/motion.contract.test.ts:192`), and no module outside the engine loader may import it — the test walks all of `src`, which includes every theme directory (`src/lib/motion.contract.test.ts:165`). Themes request motion through the closed `advMotion` vocabulary (`src/lib/builder-advanced.ts:54`); the engine executes it. This discrimination is intentional and stays as-is: do not add a per-theme script or animation dependency.

## 6. `advCss` and `html` sandboxing contract

Both surfaces are merchant-authored, both are sandboxed, and both are now lint-covered:

| Surface                                                          | Parse (save)                                                                 | Render (storefront)                                                                                                                                                                                                   | Lint (publish gate)                                                                                                                                            |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `html` widget `markup` (max 8000, `src/lib/builder-ast.ts:1263`) | `script` blocks and `on*=` handlers stripped (`src/lib/builder-ast.ts:6814`) | Sandboxed `iframe` without same-origin access (`src/components/builder/HtmlSandbox.tsx:1`); insecure `src` flagged (`src/lib/custom-code.ts:717`)                                                                     | `script`, handlers, `javascript:`/`vbscript:`/`data:text/html` URLs, and non-`https:` frame sources are `error`-level findings (`src/lib/builder-ast.ts:7396`) |
| `advCss` on any widget (`src/lib/builder-advanced.ts:166`)       | Coerced through the same `html`-kind stripping as markup                     | Prefix-scoped to `[data-fq-node]` with tags, `@import`, `javascript:`, `expression()`, and `data:` URLs removed (`src/lib/builder-advanced.ts:257`); total output capped at 24 KB (`src/lib/builder-advanced.ts:278`) | `script`, handlers, `javascript:` URLs, `expression()`, `@import`, `-moz-binding`, and `behavior:` are `error`-level findings (`src/lib/builder-ast.ts:7368`)  |

The `html` widget `body` field is not markup at all — it is plain text with tags stripped (`src/lib/builder-ast.ts:1261`). CSS `url(javascript:)`, `expression()`, and `-moz-binding` are additionally rejected as banned declarations with stable machine codes (`src/lib/custom-code.ts:154`).

## 7. Rejection observability

Every layer reports instead of silently dropping where the author can act: the sanitizer counts rejections for metrics (`src/lib/builder-ast.ts:6683`), the lint surfaces `error`-level findings per section in the **Builder** canvas and blocks publish (`src/lib/themes.server.ts:430`), and third-party submissions map rejections 1:1 to reviewer notes (`./packages.md:33`). When adding a new merchant-authored surface, add all three: sanitize at parse, flag in `lintTemplate`, and count the rejection.
