/**
 * The preview's EXPLICIT unsupported state is REACHABLE (final-review fix
 * round, 2026-10-21).
 *
 * The archive contract (Decision **D1, Option A**) says an unsupported
 * template is an explicit state — "This template is not supported by this
 * theme", naming the key, linking back to the home tab — and **never** a
 * silent redirect to the homepage (the escalation record's §(l.1)-(l.3)).
 * The evidence record's §(B) row carried a ✅ for that, and in the shipped
 * tree the state was **unreachable**:
 *
 *   · the route's own search validation dropped every `?template=` value
 *     that is not one of the nine template keys
 *     (`validateThemePreviewSearch`, `src/lib/theme-preview-nav.ts`), so
 *     `?template=archive` never reached the preview host at all; and
 *   · the host computes its unsupported state from a **missing** key
 *     (`src/components/store/ThemePreviewFrame.tsx:575-578`, consumed at
 *     `:935-937`), so the branch could not fire while the route could only
 *     ever hand the host one of the nine keys the engine had already given
 *     a body.
 *
 * This suite pins the fix along the whole chain — the route's search
 * validation, the key reaching the host, the panel rendering, and the
 * homepage body **not** rendering in its place. It is the proof §(l.4)'s
 * scratch render never gave: that one exercised a hand-made `templates` map,
 * not the URL path.
 *
 * **The second suite (appended 2026-10-21) pins the ROUTE's canonicalisation.**
 * The first suite proved the request reaches the host *inside one process*;
 * it did not prove the **URL the server actually serves** carries it.
 * TanStack Router validates a route's search more than once per request —
 * `matchRoutesLightweight` folds `validateSearch` into the accumulated
 * search, and the SSR canonicalisation
 * (`@tanstack/router-core/dist/esm/load-server.js` — `loadServerRoute`)
 * rebuilds the URL with `_includeValidateSearch: true`, which validates the
 * ALREADY-VALIDATED search again and answers with a **307 to the canonical
 * URL** when it differs from the requested one. A validation that is not
 * **idempotent** therefore rewrites `?template=archive` to the **bare path**
 * — and the bare path renders the homepage composition. That was the live
 * defect (measured: 307 → `/theme-preview/songoskriti` → the homepage body,
 * the panel heading zero times). The second suite reproduces the router's
 * own canonicalisation headlessly (the same `createRouter` the app runs, the
 * route's own `validateSearch`) and asserts that the canonical URL carries
 * the request, that it is a fixed point (no redirect loop) and that the
 * panel renders for `?template=archive` **through the route**.
 *
 * The route module IS imported — the preview route is a public, host-gated
 * route and its `validateSearch` is the exact function under test (the
 * precedent is `src/lib/media.serve.test.ts`). The route's **wiring** into
 * the host's props is asserted against its source text as well, the same
 * pattern as `src/routes/store.$slug.search-composition.test.tsx`.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { TemplateKey } from "@/lib/builder-ast";
import { LanguageProvider } from "@/lib/i18n";

// The frame syncs the URL on every switch via useNavigate, and the store
// chrome reads the router state — this suite renders without a router.
const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  const { createElement: h } = await import("react");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useRouterState: () => ({ location: { pathname: "/" } }),
    Link: (p: Record<string, unknown>) => {
      const { to, children, ...rest } = p as {
        to?: unknown;
        children?: unknown;
        [k: string]: unknown;
      };
      return h(
        "a",
        {
          href: typeof to === "string" ? to : "/",
          ...rest,
        },
        children as never,
      );
    },
  };
});

// `StoreHeader` needs a live router and a cart provider; the preview frame's
// chrome is not what this suite is about. `MinimalCheckoutHeader` is the
// checkout tab's chrome and is mocked the same way.
vi.mock("@/components/store/StoreHeader", () => ({
  StoreHeader: ({ slug, name }: { slug: string; name: string }) => (
    <header>
      <a href="/">{name}</a>
      <a href={`/store/${slug}/checkout`}>Checkout</a>
    </header>
  ),
  MinimalCheckoutHeader: ({ slug, name }: { slug: string; name: string }) => (
    <header>
      <a href="/">{name}</a>
      <a href={`/store/${slug}/cart`}>Cart</a>
    </header>
  ),
}));

const { ThemePreviewFrame } =
  await import("@/components/store/ThemePreviewFrame");
const {
  previewSearchForSwitch,
  resolveThemePreview,
  validateThemePreviewSearch,
} = await import("@/lib/theme-preview-nav");

/** The repo root — four levels up from `src/lib/themes/songoskriti/`. */
const REPO = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
);

/**
 * The route module's source — read for the WIRING (which prop the route
 * hands the requested key to). The route's `validateSearch` itself is
 * imported and asserted behaviourally.
 */
const ROUTE_SRC = readFileSync(
  join(REPO, "src", "routes", "theme-preview.$key.tsx"),
  "utf8",
);

/** The theme's REAL preview preset — the engine's own assembled templates. */
const preset = resolveThemePreview("songoskriti")!;

/**
 * The homepage's own copy, read out of the theme's assembled homepage body —
 * derived, never typed twice. It is the marker that tells the homepage
 * composition apart from the unsupported panel.
 */
const homeGrid = preset.templates.index.main.find(
  (section) => section.type === "department_grid",
);
const HOME_MARKER = String(homeGrid?.props["heading"] ?? "");

/** The demo strings Phase 1 retired from the theme's bodies. */
const RETIRED_DEMO_STRINGS = [
  "Demo page",
  "Demo search",
  "Meet the makers",
  "Sample product",
  "Demo",
];

/** Render the preview host for a REQUESTED template key. */
function render(requested: string): string {
  return renderToStaticMarkup(
    <LanguageProvider initialLang="en">
      <ThemePreviewFrame
        themeName={preset.themeName}
        author={preset.author}
        blueprintKey={preset.key}
        tokens={preset.tokens}
        templates={preset.templates}
        initialTemplate={requested as TemplateKey}
        onClose={() => {}}
      />
    </LanguageProvider>,
  );
}

/**
 * The whole URL path, in the order the browser walks it: the route's search
 * validation, then the key it hands to the host.
 */
function renderRequested(search: Record<string, unknown>): string {
  const validated = validateThemePreviewSearch(search);
  const requested = validated.template ?? validated.unsupportedTemplate;
  expect(requested, "the request must reach the host").toBeDefined();
  return render(requested!);
}

describe("the preview's unsupported template state is reachable", () => {
  it("the route's search validation carries an unknown key instead of dropping it", () => {
    const search = validateThemePreviewSearch({ template: "archive" });
    // The known-key slot keeps its meaning — a key the platform knows.
    expect(search.template).toBeUndefined();
    // The REQUEST is carried, so it can reach the host.
    expect(search.unsupportedTemplate).toBe("archive");
    // A key the platform knows is not an unsupported request.
    const known = validateThemePreviewSearch({ template: "search" });
    expect(known.template).toBe("search");
    expect(known.unsupportedTemplate).toBeUndefined();
  });

  it("bounds the requested key: only a key-shaped token is carried", () => {
    // Markup is never carried into the canvas (the host PRINTS the key).
    expect(
      validateThemePreviewSearch({ template: "<script>alert(1)</script>" })
        .unsupportedTemplate,
    ).toBeUndefined();
    // Neither is an unbounded string.
    expect(
      validateThemePreviewSearch({ template: "x".repeat(65) })
        .unsupportedTemplate,
    ).toBeUndefined();
    // Nor an empty one.
    expect(
      validateThemePreviewSearch({ template: "" }).unsupportedTemplate,
    ).toBeUndefined();
    // A key-shaped token of the allowed length is carried.
    expect(
      validateThemePreviewSearch({ template: "x".repeat(64) })
        .unsupportedTemplate,
    ).toHaveLength(64);
  });

  it("an unknown ?template= reaches the host and renders the explicit unsupported state", () => {
    const html = renderRequested({ template: "archive" });
    // The panel's own heading.
    expect(html).toContain("This template is not supported by this theme");
    // It NAMES the requested key.
    expect(html).toContain("archive");
    // It LINKS BACK to the home tab.
    expect(html).toContain('href="/"');
    expect(html).toContain("Back to the home tab");
  });

  it("the homepage composition does NOT render in place of the unsupported state", () => {
    expect(HOME_MARKER, "the homepage body must carry a marker").not.toBe("");
    const home = render("index");
    // The homepage really renders its own copy …
    expect(home).toContain(HOME_MARKER);
    // … and the unsupported state does not.
    const unsupported = renderRequested({ template: "archive" });
    expect(unsupported).not.toContain(HOME_MARKER);
  });

  it("the unsupported state carries none of the retired demo strings", () => {
    const html = renderRequested({ template: "archive" });
    for (const retired of RETIRED_DEMO_STRINGS) {
      expect(
        html,
        `the unsupported state must not carry "${retired}"`,
      ).not.toContain(retired);
    }
  });

  it("a template the theme authors still renders its own body", () => {
    const html = render("search");
    expect(html).toContain("Search the collection");
    expect(html).not.toContain("This template is not supported by this theme");
  });

  it("the assembled templates carry the nine keys and not the requested one", () => {
    // The engine synthesises a body for every key it KNOWS; an unknown key
    // is absent from the map, which is what the host turns into the panel.
    expect(Object.keys(preset.templates)).toHaveLength(9);
    expect(
      (preset.templates as Record<string, unknown>)["archive"],
    ).toBeUndefined();
  });

  it("the request ends with the visit — a switch clears it from the URL", () => {
    const next = previewSearchForSwitch("index", null, null, {
      template: undefined,
      unsupportedTemplate: "archive",
    });
    expect(next.template).toBe("index");
    expect(next.unsupportedTemplate).toBeUndefined();
  });

  it("the route hands the requested key to the preview host", async () => {
    // The ROUTE's own search validation — the exact function the browser
    // runs — carries the unknown key.
    const { Route } = await import("@/routes/theme-preview.$key");
    const validate = Route.options.validateSearch as (
      search: Record<string, unknown>,
    ) => Record<string, unknown>;
    expect(validate({ template: "archive" }).unsupportedTemplate).toBe(
      "archive",
    );
    // … and the route reads the request out of its own validated search …
    expect(ROUTE_SRC).toContain("unsupportedTemplate");
    // … and hands it to the host as the template it was asked for.
    expect(ROUTE_SRC).toContain(
      "(initialTemplate ?? unsupportedTemplate) as TemplateKey | undefined",
    );
  });
});

/* ------------------------------------------------------------------------- *
 * The ROUTE's canonicalisation — the URL the server actually serves.
 *
 * The suite above proves the request reaches the host INSIDE one process.
 * It does not prove the URL THE SERVER SERVES carries it: TanStack Router
 * validates the search more than once per request, and the SSR
 * canonicalisation answers with a **307 to the canonical URL** when the
 * canonical URL differs from the requested one. A non-idempotent validation
 * silently rewrote `?template=archive` to the bare path, and the bare path
 * renders the homepage composition — the live defect.
 * ------------------------------------------------------------------------- */

/**
 * The canonical URL the router serves for a request — reproduced with the
 * REAL router (the same `createRouter` the app runs) and the ROUTE's own
 * `validateSearch`, so it is the same decision the server makes.
 *
 * `loadServerRoute` (`@tanstack/router-core/dist/esm/load-server.js`)
 * builds it exactly like this: the current pathname, the current search
 * (`search: true`), the params, the hash and the state, with
 * `_includeValidateSearch: true` so the route's `validateSearch` runs over
 * the already-validated search.
 */
async function canonicalPreviewHref(entry: string): Promise<string> {
  const { Route } = await import("@/routes/theme-preview.$key");
  const rootRoute = createRootRoute();
  const previewRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/theme-preview/$key",
    validateSearch: Route.options.validateSearch as never,
  });
  const router = createRouter({
    // The synthetic tree mirrors the app's shape (root + the preview route);
    // the route's OWN `validateSearch` is what the server runs.
    routeTree: rootRoute.addChildren([previewRoute as never]),
    history: createMemoryHistory({ initialEntries: [entry] }),
  });
  router.updateLatestLocation();
  const canonical = router.buildLocation({
    to: router.latestLocation.pathname,
    search: true,
    params: true,
    hash: true,
    state: true,
    _includeValidateSearch: true,
  } as never);
  return canonical.publicHref;
}

/** The search of a canonical URL, as the router parses it back. */
function searchOf(href: string): Record<string, unknown> {
  const params = new URL(href, "http://preview.test").searchParams;
  return Object.fromEntries(params.entries());
}

describe("the unsupported request survives the route's canonicalisation", () => {
  it("the search validation is idempotent — the request survives a second pass", () => {
    const first = validateThemePreviewSearch({ template: "archive" });
    expect(first.unsupportedTemplate).toBe("archive");
    // The SECOND pass is what the router's canonicalisation runs over the
    // already-validated search. A validation that drops the request here
    // is what rewrote the URL to the bare path.
    const second = validateThemePreviewSearch(
      first as unknown as Record<string, unknown>,
    );
    expect(second.unsupportedTemplate).toBe("archive");
    expect(second.template).toBeUndefined();
    // … and it is a fixed point, so the canonical URL never drifts.
    const third = validateThemePreviewSearch(
      second as unknown as Record<string, unknown>,
    );
    expect(third.unsupportedTemplate).toBe("archive");
  });

  it("the canonical URL carries the request — it is NOT the bare path", async () => {
    const canonical = await canonicalPreviewHref(
      "/theme-preview/songoskriti?template=archive",
    );
    // The bare path is the homepage composition — the defect.
    expect(canonical).not.toBe("/theme-preview/songoskriti");
    // The canonical URL carries the request, so the panel can be served.
    expect(canonical).toContain("unsupportedTemplate=archive");
  });

  it("the canonical URL is a fixed point — the request is answered, not looped", async () => {
    const canonical = await canonicalPreviewHref(
      "/theme-preview/songoskriti?template=archive",
    );
    // Asking for the canonical URL must not redirect again.
    expect(await canonicalPreviewHref(canonical)).toBe(canonical);
  });

  it("a template the theme authors is not canonicalised at all", async () => {
    // The nine known keys keep their URL exactly — no new redirect.
    for (const key of ["search", "index", "product", "collection"]) {
      expect(
        await canonicalPreviewHref(
          `/theme-preview/songoskriti?template=${key}`,
        ),
      ).toBe(`/theme-preview/songoskriti?template=${key}`);
    }
  });

  it("?template=archive renders the unsupported panel THROUGH the route", async () => {
    const { Route } = await import("@/routes/theme-preview.$key");
    const validate = Route.options.validateSearch as (
      search: Record<string, unknown>,
    ) => Record<string, unknown>;
    // The URL the router serves for the natural request …
    const canonical = await canonicalPreviewHref(
      "/theme-preview/songoskriti?template=archive",
    );
    // … the route's OWN validation of that URL still carries the request …
    const validated = validate(searchOf(canonical));
    expect(validated.unsupportedTemplate).toBe("archive");
    expect(validated.template).toBeUndefined();
    // … the route hands it to the host (its own wiring, read from source) …
    expect(ROUTE_SRC).toContain(
      "(initialTemplate ?? unsupportedTemplate) as TemplateKey | undefined",
    );
    const requested = (validated.template ??
      validated.unsupportedTemplate) as string;
    expect(requested).toBe("archive");
    // … and the host renders the explicit unsupported state, NOT the
    // homepage composition.
    const html = render(requested);
    expect(html).toContain("This template is not supported by this theme");
    expect(html).toContain("archive");
    expect(html).toContain('href="/"');
    expect(
      html,
      "the homepage body must not render in its place",
    ).not.toContain(HOME_MARKER);
  });

  it("the homepage body is what the BARE path serves — the state that was live", () => {
    // The defect, stated as a fact the fix must keep true: the bare path
    // (the canonical URL the OLD validation produced) renders the homepage
    // composition, NOT the panel. If this ever changes, the redirect the
    // fix replaced was pointing somewhere else.
    const home = render("index");
    expect(home).toContain(HOME_MARKER);
    expect(home).not.toContain("This template is not supported by this theme");
  });
});

/* ------------------------------------------------------------------------- *
 * The `?max=` quirk — KNOWN and PINNED (2026-10-21).
 *
 * The escalation record's §(n.6) measured this quirk and deliberately left
 * it UNPINNED: pinning a defect would freeze it, and the quirk is a
 * different contract (the preserved search keys) from the unsupported state
 * the round closed. The closing wave pins it deliberately instead, so that a
 * future change to the behaviour FLIPS A TEST rather than silently changing
 * what the server serves.
 *
 * The quirk: the router's default `parseSearch`
 * (`@tanstack/router-core/dist/esm/searchParams.js`, `parseSearchWith`)
 * parses `max=99900` as the NUMBER `99900` (`toValue`, `qss.js`), and
 * `validateThemePreviewSearch` accepts `max` only when it is a STRING
 * (`src/lib/theme-preview-nav.ts:354-357`) — so the second validation (the
 * canonicalisation's) drops it and the canonical URL loses the key. The
 * route's own comment promises the key survives
 * (`src/routes/theme-preview.$key.tsx:161-163`); it does not.
 *
 * The three cases below pin the CURRENT behaviour, measured on the tree at
 * `2f46c634`:
 *   · `/theme-preview/songoskriti?template=search&max=99900`
 *     → `/theme-preview/songoskriti?template=search`  (the key is DROPPED)
 *   · `/theme-preview/songoskriti?template=search&q=jamdani`
 *     → `/theme-preview/songoskriti?template=search&q=jamdani`  (kept)
 * ------------------------------------------------------------------------- */

describe("the ?max= quirk is KNOWN and PINNED — the current behaviour", () => {
  it("the validator accepts max as a STRING and drops it as a NUMBER", () => {
    // The quirk's mechanism, pinned at the unit.
    expect(validateThemePreviewSearch({ max: "99900" }).max).toBe("99900");
    expect(validateThemePreviewSearch({ max: 99900 }).max).toBeUndefined();
  });

  it("the canonical URL DROPS ?max= — the quirk's effect, pinned at the URL", async () => {
    const canonical = await canonicalPreviewHref(
      "/theme-preview/songoskriti?template=search&max=99900",
    );
    // The route's own comment promises the key survives; it does not. This
    // assertion is the PIN: a fix flips it.
    expect(canonical).toBe("/theme-preview/songoskriti?template=search");
    expect(canonical).not.toContain("max=");
  });

  it("?q= survives the same canonicalisation — only ?max= is dropped", async () => {
    const canonical = await canonicalPreviewHref(
      "/theme-preview/songoskriti?template=search&q=jamdani",
    );
    expect(canonical).toContain("q=jamdani");
  });
});
