/**
 * Visual-contract guard for the Songoskriti heritage masthead.
 *
 * Behaviour is identical to the previous header; this suite pins the parts
 * the redesign owns: the wordmark lockup renders the store name, the menubar
 * renders claimed header items (rebased per host kind), and the mobile toggle
 * is wired to the slide-out disclosure.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const { getPathname, setPathname } = vi.hoisted(() => {
  let pathname = "/store/demo";
  return {
    getPathname: () => pathname,
    setPathname: (next: string) => {
      pathname = next;
    },
  };
});

// `Link`/`useRouterState` need a live router; this suite is about header
// markup, so the router is stubbed down to the anchor it would emit.
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "@tanstack/react-router",
  );
  return {
    ...actual,
    useRouterState: () => ({ location: { pathname: getPathname() } }),
    Link: ({
      to,
      params,
      children,
      ...rest
    }: Record<string, unknown> & { children?: unknown }) => {
      const path = String(to ?? "").replace(/\$(\w+)/g, (_m, key: string) =>
        String((params as Record<string, string> | undefined)?.[key] ?? ""),
      );
      return (
        <a href={path} {...(rest as Record<string, unknown>)}>
          {children as React.ReactNode}
        </a>
      );
    },
  };
});

const { StoreHeader } = await import("./StoreHeader");
import type { MenuNode } from "@/lib/menus/menu";

function node(
  overrides: Partial<MenuNode> & { id: string; label: string; url: string },
): MenuNode {
  return {
    parentId: null,
    position: 0,
    kind: "custom",
    refId: null,
    titleAttr: "",
    newTab: false,
    cssClass: "",
    depth: 0,
    children: [],
    ...overrides,
  };
}

const menus = {
  header: [
    node({
      id: "m1",
      label: "Festive",
      url: "/c/festive",
      children: [node({ id: "m1a", label: "Saree", url: "/c/saree" })],
    }),
    node({ id: "m2", label: "Journal", url: "/blog" }),
  ],
  mobile: [] as MenuNode[],
};

describe("StoreHeader visual contract", () => {
  it("renders the wordmark lockup with the store name and tagline", () => {
    setPathname("/store/demo");
    const html = renderToStaticMarkup(
      <StoreHeader slug="demo" name="Songoskriti" tagline="Heritage weave" />,
    );
    expect(html).toContain("Songoskriti");
    expect(html).toContain("Heritage weave");
    // Bespoke seal, not a generic icon button: inline SVG wordmark mark.
    expect(html).toContain("<svg");
    expect(html).toContain('viewBox="0 0 32 32"');
    // Sticky top bar is preserved.
    expect(html).toContain("sticky top-0");
  });

  it("renders the menubar with rebased hrefs on a path host", () => {
    setPathname("/store/demo");
    const html = renderToStaticMarkup(
      <StoreHeader slug="demo" name="Songoskriti" menus={menus} />,
    );
    expect(html).toContain('aria-label="Store menu"');
    expect(html).toContain("Festive");
    expect(html).toContain("Journal");
    expect(html).toContain('href="/store/demo/c/festive"');
    expect(html).toContain('href="/store/demo/c/saree"');
    // Commerce links keep the path-host branch.
    expect(html).toContain('href="/store/demo/search"');
    expect(html).toContain('href="/store/demo/checkout"');
    // Cart badge renders pre-hydration with a live region.
    expect(html).toContain('aria-live="polite"');
  });

  it("keeps root-shaped links on a custom host", () => {
    setPathname("/");
    const html = renderToStaticMarkup(
      <StoreHeader slug="demo" name="Songoskriti" menus={menus} />,
    );
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/c/festive"');
    expect(html).toContain('href="/search"');
    expect(html).toContain('href="/checkout"');
    expect(html).not.toContain("/store/demo");
  });

  it("wires the mobile toggle to the slide-out disclosure", () => {
    setPathname("/store/demo");
    const html = renderToStaticMarkup(
      <StoreHeader slug="demo" name="Songoskriti" menus={menus} />,
    );
    // Closed by default: toggle present, panel hidden.
    expect(html).toContain('aria-controls="store-mobile-menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Open menu");
    expect(html).not.toContain('id="store-mobile-menu"');
  });

  it("renders nothing extra when no menus are claimed", () => {
    setPathname("/store/demo");
    const html = renderToStaticMarkup(
      <StoreHeader slug="demo" name="Songoskriti" />,
    );
    expect(html).toContain("Songoskriti");
    expect(html).not.toContain('aria-label="Store menu"');
    expect(html).not.toContain('aria-controls="store-mobile-menu"');
  });
});
