/**
 * Phase 10.5 — the marketing SEO / AEO contract.
 *
 * These are not unit tests for convenience helpers; they are the assertions
 * that make the §10.5 promises enforceable. Each block below maps to one line
 * of the checklist: unique heads within SERP widths, one H1 per page, bn/en +
 * x-default alternates, a typed JSON-LD builder that emits valid graphs,
 * sitemap/robots coverage, `llms.txt`, and an internal-link map with no
 * orphans. If a marketing page is added without a registry row, or a title
 * grows past 60 characters, or a route file starts hand-writing JSON-LD, this
 * file fails the build.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import {
  MARKETING_ROUTES,
  MAX_CRAWL_DEPTH,
  SITE_NAME,
  TITLE_MAX,
  DESCRIPTION_MAX,
  absoluteUrl,
  articleNode,
  breadcrumbNode,
  buildGraph,
  buildMarketingHead,
  clampText,
  crawlDepths,
  errorsOnly,
  faqPageNode,
  inboundLinkCount,
  localBusinessNode,
  localePinned,
  marketingAllowPaths,
  marketingRoute,
  marketingRouteByPath,
  marketingSitemapEntries,
  normaliseOrigin,
  organizationNode,
  renderMarketingLlmsTxt,
  resolveOrigin,
  softwareApplicationNode,
  techArticleNode,
  validateJsonLd,
  validateRegistry,
  validateRoute,
  websiteNode,
} from "./marketing-seo";
import { ORG_NAP } from "./legal";

const ORIGIN = "https://framique.com";
const read = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : "");

/* ------------------------------------------------------------------ registry */

describe("registry", () => {
  it("passes its own validation with zero errors", () => {
    const issues = errorsOnly(validateRegistry());
    expect(issues.map((i) => `${i.route} ${i.code}: ${i.message}`)).toEqual([]);
  });

  it("keeps every title inside the SERP width (<60 chars) and every description <155 chars", () => {
    for (const route of MARKETING_ROUTES) {
      for (const locale of ["en", "bn"] as const) {
        expect(route.title[locale].length, `${route.path} ${locale} title`).toBeLessThan(TITLE_MAX);
        expect(route.description[locale].length, `${route.path} ${locale} desc`).toBeLessThan(155);
        expect(route.description[locale].length, `${route.path} ${locale} desc`).toBeLessThanOrEqual(
          DESCRIPTION_MAX,
        );
      }
    }
  });

  it("has no duplicate titles or descriptions across routes (cannibalisation)", () => {
    const titles = MARKETING_ROUTES.map((r) => r.title.en.toLowerCase());
    const descriptions = MARKETING_ROUTES.map((r) => r.description.en.toLowerCase());
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it("carries real Bangla for every bn string", () => {
    for (const route of MARKETING_ROUTES) {
      expect(/[\u0980-\u09FF]/.test(route.title.bn), `${route.path} bn title`).toBe(true);
      expect(/[\u0980-\u09FF]/.test(route.description.bn), `${route.path} bn desc`).toBe(true);
    }
  });

  it("rejects an over-long title, a non-Bangla bn string and a bad lastmod", () => {
    const bad = {
      ...marketingRoute("home"),
      title: { en: "x".repeat(90), bn: "English only" },
      lastmod: "yesterday",
      priority: "9",
    };
    const codes = validateRoute(bad as never).map((i) => i.code);
    expect(codes).toContain("title:too_long");
    expect(codes).toContain("locale:bn_not_bangla");
    expect(codes).toContain("lastmod:invalid");
    expect(codes).toContain("priority:invalid");
  });

  it("resolves routes by path, ignoring trailing slash and query", () => {
    expect(marketingRouteByPath("/pricing")?.id).toBe("pricing");
    expect(marketingRouteByPath("/pricing/")?.id).toBe("pricing");
    expect(marketingRouteByPath("/pricing?lang=bn")?.id).toBe("pricing");
    expect(marketingRouteByPath("/nope")).toBeNull();
  });
});

/* -------------------------------------------------------------- url handling */

describe("absolute URLs", () => {
  it("never invents an origin", () => {
    expect(absoluteUrl(null, "/pricing")).toBeNull();
    expect(absoluteUrl("not a url", "/pricing")).toBeNull();
    expect(absoluteUrl(ORIGIN, "/pricing")).toBe(`${ORIGIN}/pricing`);
    expect(absoluteUrl(`${ORIGIN}/`, "pricing")).toBe(`${ORIGIN}/pricing`);
  });

  it("normalises trailing slashes and rejects junk", () => {
    expect(normaliseOrigin("https://a.example//")).toBe("https://a.example");
    expect(normaliseOrigin("javascript:alert(1)")).toBeNull();
    expect(normaliseOrigin("")).toBeNull();
  });

  it("falls back to the browser origin only when the loader has none", () => {
    expect(resolveOrigin(ORIGIN)).toBe(ORIGIN);
    expect(resolveOrigin(null)).toBeNull();
  });

  it("pins a locale without destroying existing query params", () => {
    expect(localePinned(`${ORIGIN}/blog?page=2`, "bn")).toBe(`${ORIGIN}/blog?page=2&lang=bn`);
  });

  it("clamps on a word boundary rather than mid-word", () => {
    expect(clampText("the quick brown fox jumps", 12)).toBe("the quick");
    expect(clampText("short", 40)).toBe("short");
  });
});

/* ----------------------------------------------------------------- head tags */

describe("buildMarketingHead", () => {
  const head = buildMarketingHead({ route: "pricing", origin: ORIGIN });
  const metaOf = (h: typeof head, key: string, value: string) =>
    h.meta.find((tag) => tag[key] === value)?.content;

  it("emits title, description, canonical and og:url", () => {
    expect(head.meta[0]?.title).toBe(marketingRoute("pricing").title.en);
    expect(metaOf(head, "name", "description")).toBe(marketingRoute("pricing").description.en);
    expect(head.links.find((l) => l.rel === "canonical")?.href).toBe(`${ORIGIN}/pricing`);
    expect(metaOf(head, "property", "og:url")).toBe(`${ORIGIN}/pricing`);
  });

  it("emits bn, en and x-default alternates that are distinct and reciprocal", () => {
    const alts = head.links.filter((l) => l.rel === "alternate");
    expect(alts.map((a) => a.hreflang).sort()).toEqual(["bn-BD", "en", "x-default"]);
    expect(new Set(alts.map((a) => a.href)).size).toBe(3);
    expect(alts.find((a) => a.hreflang === "bn-BD")?.href).toContain("lang=bn");
    expect(alts.find((a) => a.hreflang === "x-default")?.href).toBe(`${ORIGIN}/pricing`);
  });

  it("omits every absolute tag when the origin is unknown, instead of going relative", () => {
    const blind = buildMarketingHead({ route: "pricing", origin: null });
    expect(blind.links).toEqual([]);
    expect(blind.meta.find((t) => t["property"] === "og:url")).toBeUndefined();
    // Copy still renders — a missing origin must not blank the head.
    expect(blind.meta[0]?.title).toBeTruthy();
  });

  it("renders the bn head when the document is Bangla", () => {
    const bn = buildMarketingHead({ route: "pricing", origin: ORIGIN, lang: "bn" });
    expect(bn.meta[0]?.title).toBe(marketingRoute("pricing").title.bn);
    expect(bn.meta.find((t) => t["property"] === "og:locale")?.content).toBe("bn_BD");
  });

  it("drops a relative or missing og:image and downgrades the twitter card", () => {
    const relative = buildMarketingHead({ route: "home", origin: ORIGIN, ogImage: "/og.png" });
    expect(relative.meta.find((t) => t["property"] === "og:image")).toBeUndefined();
    expect(relative.meta.find((t) => t["name"] === "twitter:card")?.content).toBe("summary");
    const absolute = buildMarketingHead({
      route: "home",
      origin: ORIGIN,
      ogImage: "https://cdn.example/og.png",
    });
    expect(absolute.meta.find((t) => t["property"] === "og:image")?.content).toBe(
      "https://cdn.example/og.png",
    );
    expect(absolute.meta.find((t) => t["name"] === "twitter:card")?.content).toBe(
      "summary_large_image",
    );
  });

  it("clamps an over-long override rather than shipping a truncated snippet", () => {
    const long = buildMarketingHead({
      route: "home",
      origin: ORIGIN,
      title: "A ".repeat(80),
      description: "B ".repeat(200),
    });
    expect((long.meta[0]?.title ?? "").length).toBeLessThanOrEqual(TITLE_MAX);
    const description = long.meta.find((t) => t["name"] === "description")?.content ?? "";
    expect(description.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
  });

  it("marks non-indexable routes noindex,follow and keeps them self-canonical", () => {
    const status = buildMarketingHead({ route: "status", origin: ORIGIN });
    expect(status.meta.find((t) => t["name"] === "robots")?.content).toBe("noindex,follow");
    const home = buildMarketingHead({ route: "home", origin: ORIGIN });
    expect(home.meta.find((t) => t["name"] === "robots")).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ JSON-LD */

describe("structured data", () => {
  it("emits a valid graph for every registered route", () => {
    for (const route of MARKETING_ROUTES) {
      const graph = buildGraph({ route: route.id, origin: ORIGIN, faq: [{ question: "q", answer: "a" }] });
      if (!graph) continue;
      expect(errorsOnly(validateJsonLd(graph, route.path))).toEqual([]);
    }
  });

  it("declares every schema kind the checklist requires somewhere in the site", () => {
    const kinds = new Set<string>();
    for (const route of MARKETING_ROUTES) {
      const graph = buildGraph({
        route: route.id,
        origin: ORIGIN,
        faq: [{ question: "q", answer: "a" }],
        offers: [{ name: "Growth", price: "2900" }],
      }) as { "@graph": { "@type": string }[] } | null;
      for (const node of graph?.["@graph"] ?? []) kinds.add(node["@type"]);
    }
    kinds.add(String((articleNode({ origin: ORIGIN, path: "/blog/x", headline: "t" }) as never as { "@type": string })["@type"]));
    kinds.add(String((techArticleNode({ origin: ORIGIN, path: "/docs/x", headline: "t" }) as never as { "@type": string })["@type"]));
    for (const required of [
      "Organization",
      "WebSite",
      "SoftwareApplication",
      "FAQPage",
      "BreadcrumbList",
      "Article",
      "TechArticle",
      "LocalBusiness",
    ]) {
      expect([...kinds], `missing ${required}`).toContain(required);
    }
  });

  it("cross-references nodes by @id so publisher resolves", () => {
    const graph = buildGraph({ route: "home", origin: ORIGIN, faq: [{ question: "q", answer: "a" }] }) as {
      "@graph": Record<string, unknown>[];
    };
    const ids = new Set(graph["@graph"].map((n) => n["@id"]).filter(Boolean));
    expect(ids).toContain(`${ORIGIN}/#organization`);
    const website = graph["@graph"].find((n) => n["@type"] === "WebSite") as Record<string, any>;
    expect(website["publisher"]["@id"]).toBe(`${ORIGIN}/#organization`);
  });

  it("points SearchAction at a URL the site actually serves", () => {
    const site = websiteNode(ORIGIN) as Record<string, any>;
    expect(site["potentialAction"].target.urlTemplate).toBe(`${ORIGIN}/blog?q={search_term_string}`);
    expect(websiteNode(null)["potentialAction"]).toBeUndefined();
  });

  it("keeps Organization and LocalBusiness on the single NAP source", () => {
    const org = organizationNode(ORIGIN) as Record<string, any>;
    const local = localBusinessNode(ORIGIN) as Record<string, any>;
    expect(org["telephone"]).toBe(ORG_NAP.phone);
    expect(local["telephone"]).toBe(ORG_NAP.phone);
    expect(local["address"].postalCode).toBe(ORG_NAP.postalCode);
    expect(org["address"].streetAddress).toBe(local["address"].streetAddress);
    expect(local["name"]).toBe(ORG_NAP.legalName);
  });

  it("drops empty FAQ entries instead of emitting blank questions", () => {
    expect(faqPageNode([], ORIGIN)).toBeNull();
    expect(faqPageNode([{ question: " ", answer: "a" }], ORIGIN)).toBeNull();
    const node = faqPageNode([{ question: "q", answer: "a" }, { question: "x", answer: "" }], ORIGIN) as any;
    expect(node.mainEntity).toHaveLength(1);
  });

  it("only emits priced Offers, never an invented number", () => {
    const app = softwareApplicationNode(ORIGIN, [
      { name: "Launch", price: "0" },
      { name: "Broken", price: "contact us" },
    ]) as Record<string, any>;
    expect(app["offers"]).toHaveLength(1);
    expect(app["offers"][0].priceCurrency).toBe(ORG_NAP.currency);
    expect(softwareApplicationNode(ORIGIN)["offers"]).toBeUndefined();
  });

  it("builds a breadcrumb trail that starts at home and ends at the leaf", () => {
    const crumbs = breadcrumbNode("legal", ORIGIN, "en", { name: "Terms", path: "/legal/terms" }) as any;
    expect(crumbs.itemListElement.map((c: any) => c.name)).toEqual(["Home", "Legal", "Terms"]);
    expect(crumbs.itemListElement.map((c: any) => c.position)).toEqual([1, 2, 3]);
    expect(crumbs.itemListElement.at(-1).item).toBe(`${ORIGIN}/legal/terms`);
    expect(breadcrumbNode("home", ORIGIN)).toBeNull();
    expect(breadcrumbNode("legal", null)).toBeNull();
  });

  it("clamps an over-long article headline and falls back to a named publisher", () => {
    const node = articleNode({
      origin: ORIGIN,
      path: "/blog/x",
      headline: "H".repeat(200),
      image: "/relative.png",
    }) as Record<string, any>;
    expect(node["headline"].length).toBeLessThanOrEqual(110);
    expect(node["image"]).toBeUndefined();
    expect(node["author"]["name"]).toBe(ORG_NAP.brand);
    expect(articleNode({ origin: ORIGIN, path: "/blog/x", headline: "  " })).toBeNull();
  });

  it("flags relative URLs, missing @type and an empty graph", () => {
    expect(errorsOnly(validateJsonLd({ "@context": "https://schema.org", "@graph": [] })).map((i) => i.code)).toContain(
      "jsonld:empty_graph",
    );
    expect(
      errorsOnly(validateJsonLd({ "@context": "https://schema.org", "@type": "Thing", url: "/relative" })).map(
        (i) => i.code,
      ),
    ).toContain("jsonld:relative_url");
    expect(errorsOnly(validateJsonLd({ "@context": "https://schema.org", name: "x" })).map((i) => i.code)).toContain(
      "jsonld:type",
    );
    expect(errorsOnly(validateJsonLd("nope")).map((i) => i.code)).toContain("jsonld:not_object");
  });
});

/* ------------------------------------------------------- sitemap and robots */

describe("sitemap and robots", () => {
  it("lists every indexable marketing route with lastmod and alternates", () => {
    const entries = marketingSitemapEntries(ORIGIN);
    const indexable = MARKETING_ROUTES.filter((r) => r.indexable);
    expect(entries).toHaveLength(indexable.length);
    for (const entry of entries) {
      expect(entry.lastmod).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.alternates?.map((a) => a.hreflang).sort()).toEqual(["bn-BD", "en", "x-default"]);
    }
  });

  it("keeps non-indexable routes out of the sitemap", () => {
    const paths = marketingSitemapEntries(ORIGIN).map((e) => e.path);
    for (const route of MARKETING_ROUTES) {
      if (!route.indexable) expect(paths).not.toContain(route.path);
    }
  });

  it("wires the registry into the real sitemap and robots handlers", () => {
    const sitemap = read("src/routes/sitemap[.]xml.ts");
    expect(sitemap).toContain("marketingSitemapEntries");
    expect(sitemap).toContain("xmlns:xhtml");
    const robots = read("src/routes/robots[.]txt.ts");
    expect(robots).toContain("marketingAllowPaths");
    expect(robots).toContain("Sitemap: ${origin}/sitemap.xml");
    expect(robots).toContain("/llms.txt");
    // A marketing path must never be disallowed for crawlers.
    for (const path of marketingAllowPaths()) {
      expect(robots).not.toContain(`Disallow: ${path}"`);
    }
  });
});

/* ------------------------------------------------------------------ llms.txt */

describe("llms.txt", () => {
  const body = renderMarketingLlmsTxt({
    origin: ORIGIN,
    plans: [{ name: "Growth", price: "2900" }],
    articles: [{ slug: "cod-guide", title: "COD guide", updatedAt: "2026-07-01T00:00:00Z" }],
    paymentMethods: ["bKash", "Nagad"],
  });

  it("names the product, the operator and the contact route", () => {
    expect(body).toContain(`# ${SITE_NAME}`);
    expect(body).toContain(ORG_NAP.legalName);
    expect(body).toContain(ORG_NAP.email);
    expect(body).toContain(ORG_NAP.phone);
  });

  it("maps every indexable page with an absolute URL", () => {
    for (const route of MARKETING_ROUTES) {
      if (!route.indexable) continue;
      expect(body).toContain(`${ORIGIN}${route.path}`);
    }
  });

  it("carries plans, payments, recent guides and the legal versions", () => {
    expect(body).toContain("## Plans");
    expect(body).toContain("Growth: 2900 BDT");
    expect(body).toContain("bKash, Nagad");
    expect(body).toContain(`${ORIGIN}/blog/cod-guide`);
    expect(body).toContain(`${ORIGIN}/legal/terms`);
    expect(body).toMatch(/Canonical host: https:\/\//);
  });

  it("still renders a usable map with no backend data at all", () => {
    const bare = renderMarketingLlmsTxt({ origin: ORIGIN });
    expect(bare).toContain(`${ORIGIN}/pricing`);
    expect(bare).not.toContain("## Plans");
    expect(bare.endsWith("\n")).toBe(true);
  });

  it("is served by a real route", () => {
    const route = read("src/routes/llms[.]txt.ts");
    expect(route).toContain("renderMarketingLlmsTxt");
    expect(route).toContain("text/plain");
  });
});

/* -------------------------------------------------------- internal link map */

describe("internal link map", () => {
  it("leaves no indexable page orphaned", () => {
    for (const route of MARKETING_ROUTES) {
      if (route.id === "home" || !route.indexable) continue;
      expect(inboundLinkCount(route.id), `${route.path} has no inbound internal link`).toBeGreaterThan(0);
    }
  });

  it("keeps every page within the click-depth budget of /", () => {
    const depths = crawlDepths();
    for (const route of MARKETING_ROUTES) {
      // Non-indexable utility pages (e.g. /status) are deliberately not part of
      // the crawlable graph; only indexable pages owe a short path from /.
      if (!route.indexable) continue;
      const depth = depths.get(route.id);
      expect(depth, `${route.path} unreachable from /`).toBeDefined();
      expect(depth ?? 99, `${route.path} too deep`).toBeLessThanOrEqual(MAX_CRAWL_DEPTH);
    }
  });

  it("links every registry path from the shared public chrome or a sibling page", () => {
    const shell = read("src/components/public/PublicShell.tsx");
    const linked = MARKETING_ROUTES.filter((r) => r.indexable && r.path !== "/").filter(
      (r) => shell.includes(`"${r.path}"`) || inboundLinkCount(r.id) > 0,
    );
    expect(linked).toHaveLength(MARKETING_ROUTES.filter((r) => r.indexable && r.path !== "/").length);
  });
});

/* ------------------------------------------------------------ route sources */

describe("route files", () => {
  const FILES: Record<string, string> = {
    "/": "src/routes/index.tsx",
    "/features": "src/routes/features.tsx",
    "/pricing": "src/routes/pricing.tsx",
    "/contact": "src/routes/contact.tsx",
    "/legal": "src/routes/legal.index.tsx",
    "/status": "src/routes/status.tsx",
  };

  it("builds every marketing head through the one typed builder", () => {
    for (const [path, file] of Object.entries(FILES)) {
      const src = read(file);
      expect(src, `${file} missing`).not.toBe("");
      expect(src, `${path} does not use buildMarketingHead`).toContain("buildMarketingHead");
    }
  });

  it("never hand-writes a schema.org block in a marketing route", () => {
    for (const file of Object.values(FILES)) {
      expect(read(file), `${file} inlines JSON-LD`).not.toContain('"@context": "https://schema.org"');
    }
  });

  it("renders exactly one H1 per marketing page", () => {
    // HeroBand owns the single <h1> for any page that renders it (asserted
    // once here so a refactor of the band cannot silently drop the heading).
    const heroBandH1 = (
      read("src/components/public/bands/HeroBand.tsx").match(/<h1[\s>]/g) ?? []
    ).length;
    expect(heroBandH1, "HeroBand must render exactly one <h1>").toBe(1);

    // `/` reaches HeroBand through the HomePage section component.
    const homeUsesHero = /<HomePage[\s/>]/.test(read("src/routes/index.tsx"));
    const heroUsesHeroBand = /<HeroBand[\s/>]/.test(
      read("src/components/public/landing/HomePage.tsx"),
    );

    for (const [path, file] of Object.entries(FILES)) {
      const src = read(file);
      // Only the success render path counts: error/notFound fallbacks legitimately
      // carry their own <h1> and never render alongside the page component.
      const componentName = src.match(/component:\s*(\w+)\s*,/)?.[1];
      expect(componentName, `${file} must declare a component`).toBeTruthy();
      const start = src.indexOf(`function ${componentName}(`);
      expect(start, `${file}: cannot locate function ${componentName}`).toBeGreaterThan(-1);
      const body = src.slice(start);

      const inline = (body.match(/<h1[\s>]/g) ?? []).length;
      const viaBand =
        (/<HeroBand[\s/>]/.test(body) ? 1 : 0) +
        (path === "/" && homeUsesHero && heroUsesHeroBand ? 1 : 0);
      expect(inline + viaBand, `${path} should render exactly one <h1>`).toBe(1);
    }

  });


  it("gives every rendered image an alt attribute", () => {
    for (const file of Object.values(FILES)) {
      for (const tag of read(file).match(/<img[^>]*>/g) ?? []) {
        expect(tag, `${file}: <img> without alt`).toMatch(/alt=/);
      }
    }
  });
});
