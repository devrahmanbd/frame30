/**
 * Phase 2B — the `global_ref` renderer branch.
 *
 * Renders through `SectionRenderer`, the same path the storefront uses:
 * an expanded node renders its grafted children, an unexpanded node shows
 * the invalid placeholder in the editor and nothing on the storefront —
 * never a crash, whatever the stored pointer holds.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  GLOBAL_REF_MISSING,
  newSection,
  type Section,
} from "@/lib/builder-ast";
import { SectionRenderer } from "./SectionRenderer";

// Widgets read the store base off the TanStack router (same as the
// storefront, which always renders inside a RouterProvider). The bare
// render path used here has none, so stub the single hook widgets use.
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useRouterState: () => ({ location: { pathname: "/store/demo" } }),
  };
});

function render(section: Section, editing: boolean): string {
  return renderToStaticMarkup(
    <SectionRenderer section={section} editing={editing} locale="en" />,
  );
}

const placement = (ref: unknown): Section => ({
  ...newSection("global_ref"),
  props: { ...newSection("global_ref").props, ref: ref as never },
});

describe("global_ref renderer branch", () => {
  it("renders nothing visible on the storefront for a missing block", () => {
    const html = render(placement("gone"), false);
    expect(html).not.toContain("Global block");
    expect(html).not.toContain("gone");
  });

  it("shows the invalid placeholder in the editor, naming the pointer", () => {
    const html = render(placement("gone"), true);
    expect(html).toContain("Global block");
    expect(html).toContain("gone");
  });

  it("prompts for a pick when the pointer is blank", () => {
    const html = render(placement(""), true);
    expect(html).toContain("Pick a global block");
    expect(render(placement(""), false)).not.toContain("Pick a global block");
  });

  it("never crashes on a non-string pointer", () => {
    for (const ref of [42, null, undefined, { id: "b1" }]) {
      expect(() => render(placement(ref), true)).not.toThrow();
      expect(() => render(placement(ref), false)).not.toThrow();
    }
    expect(render(placement(42), true)).toContain("Pick a global block");
  });

  it("surfaces the resolver invalid marker through the invalid path", () => {
    const section: Section = { ...placement("gone"), invalid: GLOBAL_REF_MISSING };
    const html = render(section, true);
    expect(html).toContain(GLOBAL_REF_MISSING);
    expect(render(section, false)).toBe("");
  });

  it("renders grafted children from an upstream expansion", () => {
    const section: Section = {
      ...placement("block-1"),
      children: [
        {
          ...newSection("heading"),
          id: "g1~n1",
          props: { ...newSection("heading").props, text: "Hi" },
        },
      ],
    };
    const html = render(section, false);
    expect(html).toContain("Hi");
  });
});
