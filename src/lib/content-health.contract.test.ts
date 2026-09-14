/**
 * Phase 6 exit gate — the content-health contract.
 *
 * `content-health.ts` decides what we tell a merchant is wrong with their
 * site. A false positive there costs them an afternoon chasing a link that is
 * fine; a false negative leaves a broken page in the index for a quarter. So
 * this file pins the behaviour the rest of Phase 6 was built on, rather than
 * re-deriving it from whatever the implementation happens to do today:
 *
 *  - link extraction from stored markup (HTML + markdown, comments/scripts
 *    excluded, capped, deduped);
 *  - internal resolution through the tenant's redirect table: ok / redirect /
 *    chain / loop / 410-gone / missing;
 *  - the editorial findings — orphan, cannibalisation, thin, stale;
 *  - the schema audit, including required fields and duplicate graphs;
 *  - fingerprint stability, which is what makes "ignore this finding" stick
 *    across scans;
 *  - the crawl policy numbers the server runtime is required to obey.
 *
 * Everything here is pure: no database, no network, no clock. `now` is always
 * injected, so a test can never start failing in January.
 */
import { describe, expect, it } from "vitest";
import {
  CRAWL_POLICY,
  FINDING_CODES,
  FINDING_LABELS,
  FINDING_SEVERITY,
  MAX_REDIRECT_HOPS,
  STALE_AFTER_DAYS,
  STALE_GRACE_DAYS,
  SUGGESTION_LIMIT,
  THIN_CONTENT_FLOOR,
  analyseContentHealth,
  backoffMs,
  buildLinkGraph,
  cannibalisationFindings,
  classifyHref,
  classifyHttpStatus,
  countByCode,
  countBySeverity,
  extractLinks,
  fingerprintOf,
  healthScore,
  indexNodes,
  indexRedirects,
  isRetryable,
  normalisePath,
  orphanFindings,
  parseRetryAfter,
  pathKey,
  resolveInternal,
  schemaFindings,
  schemaReport,
  staleContentFindings,
  suggestInternalLinks,
  thinContentFindings,
  type ContentNode,
  type RedirectRow,
} from "./content-health";

const NOW = new Date("2026-06-01T00:00:00.000Z");
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY).toISOString();

function node(partial: Partial<ContentNode> & Pick<ContentNode, "id" | "path">): ContentNode {
  return {
    type: "article",
    slug: partial.path.split("/").pop() ?? partial.id,
    title: `Node ${partial.id}`,
    body: "",
    wordCount: 1_000,
    focusKeyword: "",
    secondaryKeywords: [],
    tags: [],
    updatedAt: daysAgo(1),
    publishedAt: daysAgo(60),
    indexable: true,
    ...partial,
  } as ContentNode;
}

/* ========================================================================== */

describe("crawl policy", () => {
  it("stays inside limits a guest on someone else's server may take", () => {
    // These are not decoration: the cron sweep is only polite because of them.
    expect(CRAWL_POLICY.externalConcurrency).toBeLessThanOrEqual(4);
    expect(CRAWL_POLICY.perHostDelayMs).toBeGreaterThanOrEqual(1_000);
    expect(CRAWL_POLICY.externalTimeoutMs).toBeLessThanOrEqual(10_000);
    expect(CRAWL_POLICY.maxExternalChecksPerRun).toBeLessThanOrEqual(500);
    expect(CRAWL_POLICY.runBudgetMs).toBeLessThanOrEqual(CRAWL_POLICY.sweepBudgetMs);
    expect(CRAWL_POLICY.maxAttempts).toBeGreaterThanOrEqual(2);
    expect(CRAWL_POLICY.backoffCapMs).toBeGreaterThan(CRAWL_POLICY.backoffBaseMs);
    expect(MAX_REDIRECT_HOPS).toBe(CRAWL_POLICY.maxRedirectHops);
  });

  it("classifies HTTP outcomes the way retry logic needs them", () => {
    expect(classifyHttpStatus(200)).toEqual({ kind: "ok", status: 200 });
    expect(classifyHttpStatus(301, "/moved")).toEqual({
      kind: "redirect",
      status: 301,
      location: "/moved",
    });
    expect(classifyHttpStatus(404).kind).toBe("dead");
    expect(classifyHttpStatus(410).kind).toBe("dead");
    // Being rate-limited or blocked is a statement about us, not about the
    // link, so neither may ever be reported to the merchant as broken.
    expect(classifyHttpStatus(403).kind).toBe("blocked");
    expect(classifyHttpStatus(999).kind).toBe("blocked");
    const throttled = classifyHttpStatus(429, null, "3");
    expect(throttled.kind).toBe("transient");
    expect(isRetryable(throttled)).toBe(true);
    expect(isRetryable(classifyHttpStatus(503))).toBe(true);
    expect(isRetryable(classifyHttpStatus(404))).toBe(false);
    expect(isRetryable(classifyHttpStatus(200))).toBe(false);
    expect(isRetryable(classifyHttpStatus(403))).toBe(false);
  });

  it("honours Retry-After and never waits longer than the cap", () => {
    const base = Date.parse("2026-06-01T00:00:00.000Z");
    expect(parseRetryAfter("5", base)).toBe(5_000);
    expect(parseRetryAfter(new Date(base + 30_000).toUTCString(), base)).toBeGreaterThan(0);
    expect(parseRetryAfter("not-a-number", base)).toBeNull();
    expect(parseRetryAfter(null, base)).toBeNull();

    for (let attempt = 1; attempt <= 6; attempt += 1) {
      expect(backoffMs(attempt)).toBeLessThanOrEqual(CRAWL_POLICY.backoffCapMs);
      expect(backoffMs(attempt)).toBeGreaterThan(0);
    }
    // A hostile Retry-After cannot park a worker for an hour.
    expect(backoffMs(1, 3_600_000)).toBeLessThanOrEqual(CRAWL_POLICY.backoffCapMs);
    expect(backoffMs(3)).toBeGreaterThanOrEqual(backoffMs(1));
  });
});

describe("link extraction", () => {
  it("reads both HTML anchors and markdown links, and dedupes them", () => {
    const links = extractLinks(
      `<p>See <a href="/store/x/p/one">One</a> and <a href='/store/x/p/two' rel="nofollow">Two</a>.</p>
       [One again](/store/x/p/one)
       [One](/store/x/p/one)
       <a href="https://example.com/ref">Ref</a>`,
    );
    const paths = links.map((l) => l.path);
    expect(paths).toContain("/store/x/p/one");
    expect(paths).toContain("/store/x/p/two");
    expect(links.find((l) => l.path === "/store/x/p/two")?.nofollow).toBe(true);
    expect(links.filter((l) => l.href === "/store/x/p/one" && l.anchorText === "One")).toHaveLength(1);
    expect(links.some((l) => l.kind === "external")).toBe(true);
  });

  it("ignores links inside comments, scripts and styles", () => {
    const links = extractLinks(
      `<!-- <a href="/ghost">ghost</a> -->
       <script>document.write('<a href="/script-link">x</a>')</script>
       <style>/* [css](/style-link) */</style>
       <a href="/real">real</a>`,
    );
    expect(links.map((l) => l.path)).toEqual(["/real"]);
  });

  it("caps how much work one pathological body can cause", () => {
    const body = Array.from({ length: 900 }, (_, i) => `<a href="/p/${i}">n${i}</a>`).join("");
    expect(extractLinks(body).length).toBe(CRAWL_POLICY.maxLinksPerNode);
    expect(extractLinks(body, 10)).toHaveLength(10);
    expect(extractLinks("")).toEqual([]);
  });

  it("refuses to guess at hrefs a browser could not follow", () => {
    expect(classifyHref("javascript:alert(1)").kind).toBe("invalid");
    expect(classifyHref("data:text/html;base64,AAA").kind).toBe("invalid");
    expect(classifyHref("about").kind).toBe("invalid");
    expect(classifyHref("#section").kind).toBe("anchor");
    expect(classifyHref("mailto:a@b.co").kind).toBe("mailto");
    expect(classifyHref("tel:+8801").kind).toBe("tel");
    expect(classifyHref("//cdn.example.com/x").kind).toBe("external");
    expect(classifyHref("https://other.example/x", "https://shop.example").kind).toBe("external");
    // Same host with an origin supplied is internal, and keeps its query.
    expect(classifyHref("https://shop.example/a?b=1", "https://shop.example")).toEqual({
      kind: "internal",
      path: "/a?b=1",
    });
  });

  it("normalises paths so two spellings of one URL are one node", () => {
    expect(normalisePath("/a//b/")).toBe("/a/b");
    expect(normalisePath("a/b#frag")).toBe("/a/b");
    expect(normalisePath("")).toBe("/");
    expect(pathKey("/a/b?x=1#f")).toBe("/a/b");
  });
});

describe("internal resolution", () => {
  const nodes = indexNodes([node({ id: "a", path: "/store/s/p/a" }), node({ id: "b", path: "/store/s/p/b" })]);

  const resolve = (path: string, rows: RedirectRow[]) =>
    resolveInternal(path, nodes, indexRedirects(rows));

  it("reports a direct hit, a single redirect and a chain distinctly", () => {
    expect(resolve("/store/s/p/a", []).status).toBe("ok");

    const one = resolve("/old", [{ from: "/old", to: "/store/s/p/a", status: 301 }]);
    expect(one.status).toBe("redirect");
    expect(one.hops).toBe(1);
    expect(one.entity?.id).toBe("a");

    const chain = resolve("/x", [
      { from: "/x", to: "/y", status: 301 },
      { from: "/y", to: "/store/s/p/b", status: 301 },
    ]);
    expect(chain.status).toBe("chain");
    expect(chain.hops).toBe(2);
    expect(chain.entity?.id).toBe("b");
  });

  it("detects loops instead of spinning", () => {
    const loop = resolve("/a", [
      { from: "/a", to: "/b", status: 301 },
      { from: "/b", to: "/a", status: 301 },
    ]);
    expect(loop.status).toBe("loop");
    expect(loop.hops).toBeLessThanOrEqual(MAX_REDIRECT_HOPS + 1);
  });

  it("stops after the hop budget on a long chain", () => {
    const rows: RedirectRow[] = Array.from({ length: 12 }, (_, i) => ({
      from: `/h${i}`,
      to: `/h${i + 1}`,
      status: 301,
    }));
    expect(resolve("/h0", rows).status).toBe("loop");
  });

  it("treats a 410 as deliberately gone, not as a typo", () => {
    const gone = resolve("/dead", [{ from: "/dead", to: null, status: 410 }]);
    expect(gone.status).toBe("missing");
    expect(gone.gone).toBe(true);
  });

  it("does not call route-backed paths broken", () => {
    expect(resolve("/cart", []).status).toBe("ok");
    expect(resolve("/nowhere", []).status).toBe("missing");
  });
});

describe("link graph findings", () => {
  const home = node({ id: "home", type: "page", path: "/", body: "" });

  it("raises broken, chain, loop and invalid findings with useful targets", () => {
    const source = node({
      id: "src",
      path: "/store/s/blog/src",
      body: `<a href="/store/s/p/missing">gone</a>
             <a href="/chain-start">chain</a>
             <a href="/loop-a">loop</a>
             <a href="javascript:void(0)">bad</a>`,
    });
    const target = node({ id: "t", type: "product", path: "/store/s/p/real" });
    const graph = buildLinkGraph([home, source, target], [
      { from: "/chain-start", to: "/chain-mid", status: 301 },
      { from: "/chain-mid", to: "/store/s/p/real", status: 301 },
      { from: "/loop-a", to: "/loop-b", status: 301 },
      { from: "/loop-b", to: "/loop-a", status: 301 },
    ]);

    const codes = graph.findings.map((f) => f.code);
    expect(codes).toContain("link.broken");
    expect(codes).toContain("link.chain");
    expect(codes).toContain("link.loop");
    expect(codes).toContain("link.invalid");
    expect(graph.edges).toHaveLength(4);
    expect(graph.truncated).toBe(false);
  });

  it("collects external hosts and caps how many URLs a run will fetch", () => {
    const many = node({
      id: "ext",
      path: "/store/s/blog/ext",
      body: Array.from({ length: 400 }, (_, i) => `<a href="https://h${i % 7}.example/p${i}">x</a>`).join(""),
    });
    const graph = buildLinkGraph([many], []);
    expect(graph.externalTargets.length).toBeLessThanOrEqual(CRAWL_POLICY.maxExternalChecksPerRun);
    expect(new Set(graph.externalTargets).size).toBe(graph.externalTargets.length);
    expect(graph.externalHosts[0]!.count).toBeGreaterThan(0);
    // Hosts come back most-linked first so the desk shows the real dependency.
    const counts = graph.externalHosts.map((h) => h.count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });

  it("marks the run truncated instead of building an unbounded graph", () => {
    const big = node({
      id: "big",
      path: "/store/s/blog/big",
      body: Array.from({ length: 50 }, (_, i) => `<a href="/p/${i}">n</a>`).join(""),
    });
    const graph = buildLinkGraph([big], [], { maxEdges: 10 });
    expect(graph.edges).toHaveLength(10);
    expect(graph.truncated).toBe(true);
  });
});

describe("orphans", () => {
  it("flags only published, indexable, unlinked pages — and never the home page", () => {
    const home = node({ id: "home", type: "page", path: "/", body: `<a href="/store/s/p/linked">go</a>` });
    const linked = node({ id: "linked", type: "product", path: "/store/s/p/linked" });
    const orphan = node({ id: "orphan", type: "product", path: "/store/s/p/orphan" });
    const draft = node({ id: "draft", type: "article", path: "/store/s/blog/draft", publishedAt: null });
    const hidden = node({ id: "hidden", type: "page", path: "/store/s/pages/hidden", indexable: false });

    const nodes = [home, linked, orphan, draft, hidden];
    const { edges } = buildLinkGraph(nodes, []);
    const ids = orphanFindings(nodes, edges).map((f) => f.entityId);

    expect(ids).toEqual(["orphan"]);
  });

  it("does not let a self-link or a nofollow link rescue a page", () => {
    const selfLinked = node({
      id: "self",
      path: "/store/s/blog/self",
      body: `<a href="/store/s/blog/self">me</a>`,
    });
    const nofollowed = node({ id: "nf", type: "product", path: "/store/s/p/nf" });
    const linker = node({
      id: "linker",
      path: "/store/s/blog/linker",
      body: `<a href="/store/s/p/nf" rel="nofollow">nf</a><a href="/store/s/blog/self">self</a>`,
    });
    // `linker` is linked by nobody, so it is an orphan too — that is correct.
    const nodes = [selfLinked, nofollowed, linker];
    const { edges } = buildLinkGraph(nodes, []);
    const ids = orphanFindings(nodes, edges).map((f) => f.entityId).sort();
    expect(ids).toEqual(["linker", "nf"]);
  });
});

describe("cannibalisation, thin and stale", () => {
  it("groups competing pages into one finding per keyword", () => {
    const nodes = [
      node({ id: "1", path: "/store/s/blog/a", focusKeyword: "Eid Panjabi" }),
      node({ id: "2", path: "/store/s/blog/b", focusKeyword: "eid  panjabi!" }),
      node({ id: "3", path: "/store/s/blog/c", focusKeyword: "winter shawl" }),
      node({ id: "4", path: "/store/s/blog/d", focusKeyword: "Eid Panjabi", publishedAt: null }),
    ];
    const findings = cannibalisationFindings(nodes);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.target).toBe("eid panjabi");
    expect((findings[0]!.detail["entities"] as unknown[]).length).toBe(2);
  });

  it("applies a per-kind word floor", () => {
    const nodes = [
      node({ id: "a", type: "article", path: "/store/s/blog/a", wordCount: THIN_CONTENT_FLOOR.article - 1 }),
      node({ id: "p", type: "product", path: "/store/s/p/p", wordCount: THIN_CONTENT_FLOOR.product + 1 }),
      node({ id: "c", type: "collection", path: "/store/s/c/c", wordCount: 0 }),
    ];
    expect(thinContentFindings(nodes).map((f) => f.entityId).sort()).toEqual(["a", "c"]);
  });

  it("only calls content stale once it is old enough to judge", () => {
    const fresh = node({ id: "fresh", path: "/f", updatedAt: daysAgo(10), publishedAt: daysAgo(400) });
    const newborn = node({
      id: "new",
      path: "/n",
      updatedAt: daysAgo(STALE_AFTER_DAYS + 10),
      publishedAt: daysAgo(STALE_GRACE_DAYS - 1),
    });
    const stale = node({
      id: "stale",
      path: "/s",
      updatedAt: daysAgo(STALE_AFTER_DAYS + 1),
      publishedAt: daysAgo(STALE_AFTER_DAYS + 1),
    });
    const ids = staleContentFindings([fresh, newborn, stale], NOW).map((f) => f.entityId);
    expect(ids).toEqual(["stale"]);
  });
});

describe("schema audit", () => {
  const article = node({
    id: "art",
    type: "article",
    path: "/store/s/blog/art",
    hasImage: false,
    hasAuthor: true,
  });

  it("reports the exact missing required fields", () => {
    const rows = schemaReport(article);
    const articleRow = rows.find((r) => r.type === "Article")!;
    expect(articleRow.missing).toContain("image");
    expect(articleRow.missing).not.toContain("author");
    expect(rows.map((r) => r.type)).toContain("BreadcrumbList");
  });

  it("audits products against Google's offer requirements", () => {
    const product = node({
      id: "prod",
      type: "product",
      path: "/store/s/p/prod",
      hasImage: true,
      hasDescription: true,
      hasPrice: false,
      hasAvailability: false,
      hasSku: false,
    });
    const missing = schemaReport(product).find((r) => r.type === "Product")!.missing;
    expect(missing).toEqual(expect.arrayContaining(["offers.price", "offers.availability", "sku"]));
  });

  it("treats a duplicated graph as an error, not a warning", () => {
    const dup = node({
      id: "dup",
      type: "article",
      path: "/store/s/blog/dup",
      hasImage: true,
      hasAuthor: true,
      schemaTypes: ["Article", "Article"],
    });
    const codes = schemaFindings([dup]).map((f) => f.code);
    expect(codes).toContain("schema.duplicate_graph");
    expect(FINDING_SEVERITY["schema.duplicate_graph"]).toBe("error");
  });

  it("skips drafts and noindex pages entirely", () => {
    const draft = node({ id: "d", type: "article", path: "/d", publishedAt: null, hasImage: false });
    const hidden = node({ id: "h", type: "article", path: "/h", indexable: false, hasImage: false });
    expect(schemaFindings([draft, hidden])).toEqual([]);
  });
});

describe("finding identity", () => {
  it("every code has a severity and a bilingual label", () => {
    for (const code of FINDING_CODES) {
      expect(FINDING_SEVERITY[code], code).toBeTruthy();
      expect(FINDING_LABELS[code]?.en, code).toBeTruthy();
      expect(FINDING_LABELS[code]?.bn, code).toBeTruthy();
    }
  });

  it("fingerprints are stable, case-insensitive and code-scoped", () => {
    expect(fingerprintOf("link.broken", ["Article", "ID-1", "/A"])).toBe(
      fingerprintOf("link.broken", ["article", "id-1", "/a"]),
    );
    expect(fingerprintOf("link.broken", ["a"])).not.toBe(fingerprintOf("link.chain", ["a"]));
    expect(fingerprintOf("content.thin", ["a", null, undefined])).toBe(
      fingerprintOf("content.thin", ["a", "", ""]),
    );
  });

  it("survives a rescan unchanged, so an ignored finding stays ignored", () => {
    const nodes = [
      node({ id: "src", path: "/store/s/blog/src", body: `<a href="/gone">x</a>`, wordCount: 10 }),
      node({ id: "orph", type: "product", path: "/store/s/p/orph", wordCount: 5 }),
    ];
    const first = analyseContentHealth(nodes, [], { now: NOW });
    // Word counts and timestamps move between scans; identities must not.
    const later = analyseContentHealth(
      nodes.map((n) => ({ ...n, wordCount: n.wordCount + 25 })),
      [],
      { now: new Date(NOW.getTime() + 3 * DAY) },
    );
    expect(later.findings.map((f) => f.fingerprint)).toEqual(first.findings.map((f) => f.fingerprint));
  });
});

describe("report composition", () => {
  const nodes = [
    node({
      id: "home",
      type: "page",
      path: "/",
      body: `<a href="/store/s/blog/one">one</a>`,
      wordCount: 400,
    }),
    node({
      id: "one",
      path: "/store/s/blog/one",
      body: `<a href="/store/s/p/missing">nope</a> <a href="javascript:x">bad</a>`,
      focusKeyword: "eid panjabi",
      wordCount: 50,
    }),
    node({
      id: "two",
      path: "/store/s/blog/two",
      focusKeyword: "eid panjabi",
      wordCount: 900,
      updatedAt: daysAgo(STALE_AFTER_DAYS + 5),
      publishedAt: daysAgo(STALE_AFTER_DAYS + 5),
      hasImage: true,
      hasAuthor: true,
    }),
  ];

  it("is deterministic and internally consistent", () => {
    const a = analyseContentHealth(nodes, [], { now: NOW });
    const b = analyseContentHealth([...nodes].reverse(), [], { now: NOW });

    // Row order out of the database must not change the report.
    expect(b.findings.map((f) => f.fingerprint)).toEqual(a.findings.map((f) => f.fingerprint));
    expect(a.counts).toEqual(countByCode(a.findings));
    expect(a.bySeverity).toEqual(countBySeverity(a.findings));
    expect(Object.values(a.counts).reduce((x, y) => x + y, 0)).toBe(a.findings.length);
    expect(a.scanned.article + a.scanned.page).toBe(nodes.length);

    const codes = new Set(a.findings.map((f) => f.code));
    expect(codes).toContain("link.broken");
    expect(codes).toContain("link.invalid");
    expect(codes).toContain("keyword.cannibalisation");
    expect(codes).toContain("content.thin");
    expect(codes).toContain("content.stale");
  });

  it("scores a clean small site 100 and a broken one lower", () => {
    const clean = analyseContentHealth(
      [node({ id: "h", type: "page", path: "/", wordCount: 500 })],
      [],
      { now: NOW },
    );
    const broken = analyseContentHealth(nodes, [], { now: NOW });
    expect(healthScore({ bySeverity: clean.bySeverity, scanned: clean.scanned })).toBeGreaterThan(
      healthScore({ bySeverity: broken.bySeverity, scanned: broken.scanned }),
    );
    expect(healthScore({ bySeverity: { error: 0, warning: 0, notice: 0 }, scanned: clean.scanned })).toBe(100);
    // An empty site is not a failing site.
    expect(
      healthScore({
        bySeverity: { error: 0, warning: 0, notice: 0 },
        scanned: { article: 0, page: 0, product: 0, collection: 0 },
      }),
    ).toBe(100);
  });
});

describe("internal link suggestions", () => {
  const candidates = [
    node({
      id: "panjabi",
      type: "product",
      path: "/store/s/p/eid-panjabi",
      title: "Eid Panjabi",
      focusKeyword: "eid panjabi",
      tags: ["eid"],
    }),
    node({ id: "shawl", type: "product", path: "/store/s/p/shawl", title: "Winter Shawl", tags: ["winter"] }),
    node({ id: "self", path: "/store/s/blog/draft", title: "Draft" }),
  ];

  it("ranks a focus-keyword match above a weak term match, deterministically", () => {
    const out = suggestInternalLinks(
      { id: "self", title: "Best Eid Panjabi picks", body: "<p>A guide to winter styles.</p>", tags: ["eid"] },
      candidates,
      { now: NOW },
    );
    expect(out[0]!.id).toBe("panjabi");
    expect(out[0]!.reason).toBe("focus_keyword");
    expect(out.map((s) => s.id)).not.toContain("self");
    expect(out.length).toBeLessThanOrEqual(SUGGESTION_LIMIT);
    expect(out.every((s) => s.score > 0 && s.score <= 100)).toBe(true);
  });

  it("never suggests a link the draft already has", () => {
    const out = suggestInternalLinks(
      {
        id: "self",
        title: "Eid Panjabi",
        body: `<a href="/store/s/p/eid-panjabi">already linked</a>`,
        tags: ["eid"],
      },
      candidates,
      { now: NOW },
    );
    expect(out.map((s) => s.id)).not.toContain("panjabi");
  });
});
