/**
 * Frame30 swap-in 4 — SectionInspector DynamicTagPicker mounts (TDD).
 *
 * - New path engages: text (bilingual), link(url), image and
 *   repeater-textarea controls render a `data-dynamic-tag-picker` trigger
 *   (insert-only, plain-text splice, never HTML).
 * - Old path preserved: bespoke labels, values, validation and bottom chrome
 *   stay identical (existing inspector suites are the legacy proof — this
 *   file only adds the picker presence + contract checks).
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SectionInspector } from "./SectionInspector";
import { clearRegistry } from "@/lib/unified-widget-registry";
import type { Breakpoint, Section } from "@/lib/builder-ast";

function html(node: ReactElement): string {
  return renderToStaticMarkup(node);
}

function withQuery(node: ReactElement): ReactElement {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

const noop = () => {};
const base = {
  template: "index" as const,
  device: "desktop" as Breakpoint,
  onChange: noop as never,
  onClearOverride: noop as never,
  onToggleHidden: noop as never,
  onDelete: noop,
  onDuplicate: noop,
};

function section(type: string, props: Record<string, never | string | number | object> = {}): Section {
  return { id: "s1", type: type as never, props: props as never } as Section;
}

beforeEach(() => clearRegistry());
afterEach(() => clearRegistry());

describe("SectionInspector dynamic-tag mounts", () => {
  it("mounts a picker on text (bilingual) controls", () => {
    const out = html(
      <SectionInspector {...base} section={section("banner", { text: "Sale" })} />,
    );
    expect(out).toContain("Announcement banner");
    expect(out).toContain("data-dynamic-tag-picker");
  });

  it("mounts a picker on link(url) controls", () => {
    // `hero.ctaHref` stays kind=url (not bilingual, not an image lookalike).
    const out = html(
      withQuery(
        <SectionInspector
          {...base}
          section={section("hero", { heading: "Hi", ctaHref: "/sale" })}
        />,
      ),
    );
    expect(out).toContain("/sale");
    expect(out).toContain("data-dynamic-tag-picker");
  });

  it("mounts a picker on image controls", () => {
    const out = html(
      withQuery(
        <SectionInspector
          {...base}
          section={section("image", { image: "/a.jpg" })}
        />,
      ),
    );
    expect(out).toContain("data-dynamic-tag-picker");
  });

  it("mounts a picker on repeater textarea rows", () => {
    const out = html(
      <SectionInspector
        {...base}
        section={section("faq", {
          items: [{ question: "Q?", answer: "A." }],
        })}
      />,
    );
    expect(out).toContain("Q?");
    expect(out).toContain("data-dynamic-tag-picker");
  });

  it("keeps bespoke values and chrome intact", () => {
    const out = html(
      <SectionInspector {...base} section={section("banner", { text: "Sale" })} />,
    );
    expect(out).toContain("Sale");
    expect(out).toContain("Visible on");
    expect(out).toContain("Duplicate");
    expect(out).toContain("Delete");
  });
});
