/**
 * Phase 1b — StoreHeader wishlist count contract.
 *
 * Replaces the dead wishlist <button> with a real <Link> to the account
 * wishlist tab + live count badge from the shared ["customer","wishlist"]
 * cache. Mirrors the cart badge precedent.
 *
 * Vitest env node — NO jsdom/testing-library/renderHook. Static markup
 * via renderToStaticMarkup + source asserts.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

// Router mock: hoisted pathname drives custom vs store variant; Link renders
// a plain <a> capturing to/params/search for assertions.
const mockPathname = vi.hoisted(() => ({ current: "/store/demo" }));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useRouterState: () => ({ location: { pathname: mockPathname.current } }),
    Link: ({
      to,
      params,
      search,
      children,
      ...rest
    }: {
      to: string;
      params?: unknown;
      search?: unknown;
      children?: React.ReactNode;
    }) => (
      <a
        data-link-to={to}
        data-link-params={JSON.stringify(params ?? null)}
        data-link-search={JSON.stringify(search ?? null)}
        {...rest}
      >
        {children}
      </a>
    ),
  };
});

import { StoreHeader } from "./StoreHeader";

const HEADER_SRC = () =>
  readFileSync("src/components/store/StoreHeader.tsx", "utf8");

function renderHeader({
  slug = "demo",
  wishlistItems,
  pathname = "/store/demo",
}: {
  slug?: string;
  wishlistItems?: Array<{ variantId: string }>;
  pathname?: string;
} = {}) {
  mockPathname.current = pathname;
  const client = new QueryClient();
  if (wishlistItems) {
    client.setQueryData(["customer", "wishlist"], {
      currency: "BDT",
      items: wishlistItems.map((item, i) => ({
        id: `w-${i}`,
        variantId: item.variantId,
      })),
    });
  }
  const ui: ReactElement = (
    <QueryClientProvider client={client}>
      <StoreHeader slug={slug} name="Demo" />
    </QueryClientProvider>
  );
  return renderToStaticMarkup(ui);
}

describe("StoreHeader wishlist link", () => {
  it("guest (no seed) links to the store account wishlist tab with zero count and no badge", () => {
    const html = renderHeader();
    expect(html).toContain('data-link-to="/store/$slug/account"');
    expect(html).toContain(
      'data-link-search="{&quot;tab&quot;:&quot;wishlist&quot;}"',
    );
    expect(html).toContain('aria-label="Wishlist, 0"');
    expect(html).not.toContain("fq-badge-pop");
  });

  it("seeded 2 items shows the count badge with pop animation and count in the label", () => {
    const html = renderHeader({
      wishlistItems: [{ variantId: "v1" }, { variantId: "v2" }],
    });
    expect(html).toContain('aria-label="Wishlist, 2"');
    expect(html).toContain("fq-badge-pop");
    expect(html).toContain("motion-safe");
    // Badge renders the live count.
    expect(html).toMatch(/>2</);
  });

  it("custom host links to /account wishlist tab", () => {
    const html = renderHeader({ pathname: "/" });
    expect(html).toContain('data-link-to="/account"');
    expect(html).toContain(
      'data-link-search="{&quot;tab&quot;:&quot;wishlist&quot;}"',
    );
  });

  it("sources the live count from the shared wishlist cache (no dead button)", () => {
    const src = HEADER_SRC();
    expect(src).toContain("useWishlistHeader");
    expect(src).not.toMatch(/<button[^>]*Wishlist/);
    expect(src).toContain("key={wishlistCount}");
    expect(src).toContain("motion-safe:animate-[fq-badge-pop");
    expect(src).toContain('to="/account"');
    expect(src).toContain('to="/store/$slug/account"');
    expect(src).toContain('search={{ tab: "wishlist" }}');
    expect(src).toContain('t("Wishlist","উইশলিস্ট")');
  });

  it("wishlist-card exposes a header hook gated on sign-in; styles define the pop keyframes", () => {
    const cardSrc = readFileSync("src/lib/wishlist-card.ts", "utf8");
    expect(cardSrc).toContain("useWishlistHeader");
    expect(cardSrc).toMatch(/enabled:\s*signedIn\s*===\s*true/);
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toContain("@keyframes fq-badge-pop");
  });
});
