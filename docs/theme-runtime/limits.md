# Theme Runtime — honest limits

Custom merchant themes (`src/components/theme-runtime/`) render the whole
storefront inside a **dedicated isolated document** (version-pinned URL on the
controlled asset origin, `sandbox="allow-scripts"`, null origin). That buys
containment, but an iframe boundary has real costs. This page states them
plainly so nobody discovers them in production.

## Activation (ThemeChrome mount)

- A theme record flagged `runtime: "custom-isolated"` mounts here through
  the `ThemeChrome` `isolatedTheme` prop (`shouldUseIsolatedTheme` in
  `src/components/store/ThemeChrome.tsx`): version-pinned identity on the
  controlled asset origin, the install's granted `theme:*` scopes (see
  `buildThemeGrants`), and the host bridge handler.
- Every other record — official/data-only themes, another runtime value, a
  missing flag, a malformed descriptor — renders the classic `ThemeSurface`
  path byte-identically. Host SEO is unchanged: route `head()`
  (`src/lib/theme-seo.ts`) plus `SiteKitSurface` stay host-rendered, and
  disabling the custom theme (prop absent again) reverts to the previous
  renderer with no stranded frame.

## SEO limits

- **Crawlers see the host page, not the frame.** The theme document is a
  separate browsing context: its content is not part of the host DOM. Any
  SEO-critical metadata — `<title>`, meta description, canonical, Open
  Graph, JSON-LD, hreflang — **must be host-rendered** (server component /
  route head). Nothing the theme sets inside its document counts.
- **No link equity flows out of the frame.** Anchors inside the theme do not
  contribute to the host page's link graph the way same-document links do.
  Treat in-theme navigation as app behavior, not as crawlable structure;
  keep a host-rendered sitemap and crawlable category/product routes.
- **Content inside the frame is at best second-class for indexing.** Assume
  product copy that exists ONLY in the theme document is weakly indexed or
  invisible. Server-render the indexable copy on the host; let the theme
  own presentation.
- **Performance signals split.** Core Web Vitals are measured on the top
  page; heavy theme bundles hurt LCP/INP through the frame without showing
  up cleanly in host-only audits. Budget the theme bundle like first-party
  code (see lazy-load rules below) and measure with the frame mounted.

## Hydration limits

- **Hydration does not apply inside the theme document.** The host framework
  (SSR → hydrate) stops at the iframe boundary. The theme bundle boots
  itself (own script, own lifecycle) — there is no shared component state,
  no resumability, no partial hydration across the boundary.
- **Two Reacts (or none).** If the theme uses its own framework copy, that
  is a second runtime with its own scheduling and memory. Do not pass
  component references, context, or stores across — only JSON-serializable
  versioned bridge envelopes (`v: 2`, ≤64 KiB).
- **State sync is eventual and explicit.** Cart, variant and navigation
  state cross the bridge as messages with per-call timeouts (default 5s).
  Design theme UI for pending/error/timeout states; never assume
  synchronous host answers.
- **SSR inside the frame is the asset server's job.** The host cannot
  server-render frame content. If first-paint inside the frame matters, the
  version-pinned theme document must ship pre-rendered HTML itself.

## Accessibility tree boundaries

- **Assistive tech sees two trees.** The iframe is a separate accessibility
  tree behind one node in the host tree. Cross-boundary focus management,
  arrow-key roving, landmarks and headings do not compose: a menu in the
  host and a menu in the theme are strangers to each other.
- **Requirements:** the frame MUST have a descriptive `title` (the
  component takes it as a required prop); focus entering/leaving the frame
  must be deliberate and announced; skip-links must exist on BOTH sides;
  live regions do not cross the boundary — confirmations (cart added,
  errors) must be surfaced in the tree where the shopper currently is.
- **Audit accordingly:** run automated a11y checks on the host page AND on
  the theme document URL directly. A host-only Lighthouse pass proves
  nothing about the frame.

## Mobile / resize behavior

- **Height is negotiated, not observed.** The frame posts `fq:theme-height`
  measurements; the host clamps to `[minHeight, maxHeight]` (defaults
  120–4000px). Content taller than the max scrolls INSIDE the frame —
  nested scroll regions are awkward on mobile, so keep theme pages within
  budget or paginate.
- **Viewport units lie (slightly).** `100vh`/dvh inside the frame track the
  frame's viewport, and mobile browser chrome (URL bar show/hide) resizes
  the frame without a host resize event. Prefer `100dvh` with a px fallback
  inside theme CSS, and re-post height on `visualViewport.resize`.
- **No host gestures cross the boundary.** Pull-to-refresh, swipe-back and
  overscroll behaviors resolve inside the frame. Keep page-level navigation
  (back/forward expectations) on host routes where possible.
- **Resize storms are contained:** the host clamps every report and ignores
  non-finite values; a theme posting heights in a tight loop burns only its
  own (throttled) frame.

## Reduced-motion + no-WebGL fallbacks (REQUIRED for theme bundles)

- **Honor `prefers-reduced-motion` inside the theme.** The host cannot reach
  into the frame to stop animation. Every theme bundle MUST gate
  animation/keyframe/auto-play loops on
  `matchMedia("(prefers-reduced-motion: reduce)")` and render the final
  state statically when set. Bundled animation that ignores this is a
  ship-blocker.
- **No-WebGL fallback is mandatory.** If a theme uses WebGL/canvas effects,
  context creation can fail (no GPU, blocked, battery saver). Every such
  theme MUST render a complete static/DOM fallback with zero WebGL calls on
  failure — content and commerce actions must work fully without it.
- **Frame-CPU honesty:** the frame-CPU census proved same-thread vs
  isolated behavior is browser-mode dependent. Assume the worst case (same
  thread): theme bundles must keep continuous animation under budget,
  pause offscreen work via `IntersectionObserver`, and never run
  synchronous infinite work (no host-side watchdog can preempt it — the
  null-origin sandbox contains reach, not CPU, until the browser steps in).

## Lazy-load rules for heavy assets

1. The theme document shell (HTML + critical CSS) is the only render-
   blocking payload. Everything else defers.
2. Below-the-fold imagery: `loading="lazy"` + explicit dimensions (no
   layout shift → no height-handshake thrash).
3. Animation/graphics libraries load on interaction or intersection, never
   upfront; a theme that needs WebGL loads it after first contentful paint
   of the DOM fallback.
4. Fonts: `font-display: swap`, subset, served from the SAME asset origin
   (the frame CSP allows font-src from the approved origin only).
5. No third-party hosts, ever: script/style/img/font allow exactly the
   approved origin; `connect-src 'none'` means analytics/tracking pixels
   inside the frame are dead by design — emit `analytics.*`-style events
   over the bridge instead (future method, currently out of scope).
6. Bridge payloads stay scalar (ids, quantities, paths) and ≤64 KiB —
   oversize envelopes are rejected host-side.

## Server-revalidation contract (normative)

Client-side bridge rejection is the tripwire, not the enforcement. The
server MUST: reprice every commerce action from its own catalog (never
trust bridge price/currency/discount fields); resolve tenant from the
session/route (a `tenant*` bridge field is a cross-tenant probe — reject
and log); read payment status only from the provider webhook/transaction
record (bridge payment fields are forgery — reject and log); re-check
navigation-triggered data loads server-side.
