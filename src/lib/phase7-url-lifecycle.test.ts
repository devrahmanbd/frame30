import { describe, expect, it } from "vitest";
import {
  buildRedirectMap,
  listingPolicy,
  normalizePath,
  resolveUrl,
  slugChangeRule,
  tombstoneRule,
} from "./url-lifecycle";

const map = (rules: Parameters<typeof buildRedirectMap>[0]) => buildRedirectMap(rules);

describe("Phase 7.1 — path normalisation", () => {
  it("folds the variations that mean the same URL", () => {
    expect(normalizePath("/store/acme/p/rice/")).toBe("/store/acme/p/rice");
    expect(normalizePath("store//acme/p/Rice?utm=x#top")).toBe("/store/acme/p/rice");
    expect(normalizePath("")).toBe("/");
  });
});

describe("Phase 7.1 — redirect map", () => {
  it("serves a 301 for a renamed slug", () => {
    const m = map([{ from: "/store/a/p/old", to: "/store/a/p/new", status: 301 }]);
    expect(resolveUrl(m, "/store/a/p/old/")).toEqual({
      kind: "redirect",
      status: 301,
      location: "/store/a/p/new",
    });
  });

  it("collapses a chain instead of redirecting to a redirect", () => {
    const m = map([
      { from: "/p/a", to: "/p/b", status: 301 },
      { from: "/p/b", to: "/p/c", status: 301 },
    ]);
    expect(resolveUrl(m, "/p/a")).toMatchObject({ status: 301, location: "/p/c" });
  });

  it("degrades a loop to a plain 404", () => {
    const m = map([
      { from: "/p/a", to: "/p/b", status: 301 },
      { from: "/p/b", to: "/p/a", status: 301 },
    ]);
    expect(resolveUrl(m, "/p/a")).toEqual({ kind: "miss", status: 404 });
  });

  it("answers 410 for a tombstoned URL and 404 for an unknown one", () => {
    const m = map([{ from: "/p/dead", to: null, status: 410 }]);
    expect(resolveUrl(m, "/p/dead")).toEqual({ kind: "gone", status: 410 });
    expect(resolveUrl(m, "/p/never-existed")).toEqual({ kind: "miss", status: 404 });
  });

  it("drops a 301 with no destination", () => {
    expect(map([{ from: "/p/a", to: null, status: 301 }]).size).toBe(0);
  });
});

describe("Phase 7.1 — rule construction", () => {
  it("builds a rename rule and skips a no-op rename", () => {
    expect(slugChangeRule("/store/a/p", "old", "new")).toEqual({
      from: "/store/a/p/old",
      to: "/store/a/p/new",
      status: 301,
    });
    expect(slugChangeRule("/store/a/p", "same", "same")).toBeNull();
  });

  it("builds a tombstone with no destination", () => {
    expect(tombstoneRule("/store/a/p", "gone")).toEqual({
      from: "/store/a/p/gone",
      to: null,
      status: 410,
    });
  });
});

describe("Phase 7.1 — soft-404 discipline", () => {
  it("keeps an empty but real collection indexable at 200", () => {
    expect(listingPolicy({ total: 0 })).toMatchObject({ status: 200, robots: "index,follow" });
  });

  it("404s a fabricated facet value", () => {
    expect(listingPolicy({ total: 0, unknownFacet: true }).status).toBe(404);
  });

  it("keeps empty searches and empty filtered views out of the index", () => {
    expect(listingPolicy({ total: 0, hasQuery: true }).robots).toBe("noindex,follow");
    expect(listingPolicy({ total: 0, filtered: true }).robots).toBe("noindex,follow");
  });

  it("indexes a populated listing", () => {
    expect(listingPolicy({ total: 12, filtered: true }).robots).toBe("index,follow");
  });
});
