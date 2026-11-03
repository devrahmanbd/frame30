import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  DEFAULT_PERMALINKS,
  buildPermalink,
  canonicalRedirect,
  validateSettings,
  type PermalinkSettings,
} from "./permalink";
import { normalizePath } from "./url-lifecycle";

describe("permalink canonical redirect resolution", () => {
  it("resolves default collection URLs without redirection", () => {
    const redirect = canonicalRedirect(
      DEFAULT_PERMALINKS,
      "collection",
      "festive",
      "/c/festive",
    );
    expect(redirect).toBeNull();
  });

  it("resolves custom collection base /category/festive as canonical destination", () => {
    const settings: PermalinkSettings = validateSettings({
      collectionBase: "/category",
    });
    expect(settings.collectionBase).toBe("/category");
    expect(
      buildPermalink(settings, { kind: "collection", slug: "festive" }),
    ).toBe("/category/festive");

    // Stale /c/festive request redirects to /category/festive
    const redirect = canonicalRedirect(
      settings,
      "collection",
      "festive",
      "/c/festive",
    );
    expect(redirect).toBe("/category/festive");

    // Canonical request needs no redirection
    expect(
      canonicalRedirect(settings, "collection", "festive", "/category/festive"),
    ).toBeNull();
  });

  it("resolves custom collection base /supersale/festive as canonical destination", () => {
    const settings: PermalinkSettings = validateSettings({
      collectionBase: "/supersale",
    });
    expect(settings.collectionBase).toBe("/supersale");
    expect(
      buildPermalink(settings, { kind: "collection", slug: "festive" }),
    ).toBe("/supersale/festive");

    const redirect = canonicalRedirect(
      settings,
      "collection",
      "festive",
      "/c/festive",
    );
    expect(redirect).toBe("/supersale/festive");
  });

  it("resolves root post-name collection base /festive as canonical destination", () => {
    const settings: PermalinkSettings = validateSettings({
      collectionBase: "",
    });
    expect(settings.collectionBase).toBe("");
    expect(
      buildPermalink(settings, { kind: "collection", slug: "festive" }),
    ).toBe("/festive");

    const redirect = canonicalRedirect(
      settings,
      "collection",
      "festive",
      "/c/festive",
    );
    expect(redirect).toBe("/festive");

    // Once at /festive, no redirect
    expect(
      canonicalRedirect(settings, "collection", "festive", "/festive"),
    ).toBeNull();
  });
});

describe("canonical redirects use 301 permanent redirect status in route handlers", () => {
  it("enforces statusCode 301 on canonical redirect in c.$collectionSlug.tsx", () => {
    const src = readFileSync("src/routes/c.$collectionSlug.tsx", "utf-8");
    expect(src).toMatch(
      /if\s*\(to\)\s*throw\s*redirect\(\s*\{\s*href:\s*to,\s*statusCode:\s*301/,
    );
  });

  it("enforces statusCode 301 on canonical redirect in p.$productSlug.tsx", () => {
    const src = readFileSync("src/routes/p.$productSlug.tsx", "utf-8");
    expect(src).toMatch(
      /if\s*\(to\)\s*throw\s*redirect\(\s*\{\s*href:\s*to,\s*statusCode:\s*301/,
    );
  });

  it("enforces statusCode 301 on canonical redirect in pages.$pageSlug.tsx", () => {
    const src = readFileSync("src/routes/pages.$pageSlug.tsx", "utf-8");
    expect(src).toMatch(
      /if\s*\(to\)\s*throw\s*redirect\(\s*\{\s*href:\s*to,\s*statusCode:\s*301/,
    );
  });

  it("does not use unsafe type assertions for canonicalPath in c.$collectionSlug.tsx", () => {
    const src = readFileSync("src/routes/c.$collectionSlug.tsx", "utf-8");
    expect(src).not.toContain("loaderData as unknown");
    expect(src).toContain("loaderData.canonicalPath");
  });
});

describe("URL path normalization hygiene", () => {
  it("normalizes trailing slashes and uppercase characters deterministically", () => {
    expect(normalizePath("/c/festive/")).toBe("/c/festive");
    expect(normalizePath("/c/FESTIVE")).toBe("/c/festive");
    expect(normalizePath("/c/FESTIVE/")).toBe("/c/festive");
    expect(normalizePath("//c///festive//")).toBe("/c/festive");
  });
});

describe("tenant isolation and visibility invariants", () => {
  it("ensures loadStoreCollection enforces merchant_id and is_published filters", () => {
    const src = readFileSync("src/lib/storefront.server.ts", "utf-8");
    // Collections must be filtered by merchant_id and is_published
    expect(src).toContain('.from("collections")');
    expect(src).toContain('.eq("merchant_id", merchant.id)');
    expect(src).toContain('.eq("is_published", true)');
    // Products in collection must be filtered by merchant_id and status: active
    expect(src).toContain('.from("products")');
    expect(src).toContain('.eq("status", "active")');
  });
});
