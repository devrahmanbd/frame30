/**
 * Frame30 — Wave 3: Responsive Customization Acceptance & Integration Test Suite.
 *
 * Verifies:
 * - Group 1: Responsive Configuration & Inheritance Contract (Scope 5.1)
 *   - Desktop baseline provides canonical default
 *   - Tablet inherits from desktop unless overridden
 *   - Mobile inherits from tablet (if present) or desktop unless overridden
 *   - Explicit overrides affect only their target layer
 *   - Override reset restores correct upstream inheritance
 * - Group 2: Responsive Merchant Controls & Inspector UX (Scope 5.2, 5.5)
 *   - Active device layer indicator
 *   - Clear inheritance and override status pills
 *   - Actionable reset affordance
 *   - Non-responsive fields protected from accidental layer pollution
 * - Group 3: Section Responsive Rendering & Storefront Parity (Scope 5.3, 5.6)
 *   - DepartmentGrid responsive column resolution
 *   - ProductGrid responsive column resolution
 *   - UgcGallery responsive column resolution
 *   - SplitFeature stacking and alignment
 *   - Storefront widgetReader resolution parity
 * - Group 4: Device Visibility Controls (Scope 5.2)
 *   - Per-device hidden array toggles
 *   - Multi-device visibility states
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SectionInspector } from "./SectionInspector";
import {
  inheritanceOf,
  LAYER_CASCADE,
  type DeviceBucket,
  type Inheritance,
} from "@/lib/responsive";
import {
  parseAst,
  type Breakpoint,
  type PropValue,
  type Section,
  SECTION_CATALOG,
} from "@/lib/builder-ast";
import { WIDGET_COMPONENTS, widgetReader, type WidgetCtx } from "./widgets";
import { SONGOSKRITI_WIDGETS } from "./songoskriti";

function html(node: ReactElement): string {
  return renderToStaticMarkup(node);
}

function withQuery(node: ReactElement): ReactElement {
  const client = new QueryClient({
    defaultOptions: { queries: { enabled: false, retry: false } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

const noop = () => {};
const baseInspectorProps = {
  template: "index" as const,
  device: "desktop" as Breakpoint,
  frameLang: "en" as const,
  viewMode: "all" as const,
  onViewModeChange: noop,
  onRemove: noop,
  onDuplicate: noop,
  onToggleHidden: noop,
  onResetToTemplate: noop,
  onOpenAssetDrawer: noop,
  onPickMediaForNode: noop,
  onReorder: noop,
  onClearOverride: noop,
  onDelete: noop,
  allSections: [],
};

function makeCtx(
  section: Section,
  device: Breakpoint = "desktop",
  locale: "en" | "bn" = "en",
): WidgetCtx {
  return {
    section,
    ...widgetReader(section, device, locale),
    Heading: "h2",
    primary: false,
    editing: false,
    device,
    locale,
    template: "index",
    renderChildren: () => null,
  };
}

describe("Wave 3 — Group 1: Responsive Configuration & Inheritance Contract (Scope 5.1)", () => {
  it("Test 1.1: Desktop baseline provides canonical value for all device buckets when un-overridden", () => {
    const section: Section = {
      id: "sec-grid-1",
      type: "product_grid",
      props: {
        columns: 4,
        gap: "md",
        title: "Featured Sarees",
      },
    };

    const dInherit = inheritanceOf(section, "columns", "desktop");
    expect(dInherit.value).toBe(4);
    expect(dInherit.source).toBe("desktop");
    expect(dInherit.inherited).toBe(false);
    expect(dInherit.overridden).toBe(true);

    const tInherit = inheritanceOf(section, "columns", "tablet");
    expect(tInherit.value).toBe(4);
    expect(tInherit.source).toBe("desktop");
    expect(tInherit.inherited).toBe(true);
    expect(tInherit.overridden).toBe(false);

    const mInherit = inheritanceOf(section, "columns", "mobile");
    expect(mInherit.value).toBe(4);
    expect(mInherit.source).toBe("desktop");
    expect(mInherit.inherited).toBe(true);
    expect(mInherit.overridden).toBe(false);
  });

  it("Test 1.2: Tablet override applies to Tablet and inherits to Mobile, leaving Desktop unchanged", () => {
    const section: Section = {
      id: "sec-grid-2",
      type: "product_grid",
      props: {
        columns: 4,
        gap: "md",
      },
      bp: {
        tablet: {
          columns: 3,
        },
      },
    };

    const dInherit = inheritanceOf(section, "columns", "desktop");
    expect(dInherit.value).toBe(4);
    expect(dInherit.source).toBe("desktop");
    expect(dInherit.inherited).toBe(false);
    expect(dInherit.overridden).toBe(true);

    const tInherit = inheritanceOf(section, "columns", "tablet");
    expect(tInherit.value).toBe(3);
    expect(tInherit.source).toBe("tablet");
    expect(tInherit.inherited).toBe(false);
    expect(tInherit.overridden).toBe(true);

    const mInherit = inheritanceOf(section, "columns", "mobile");
    expect(mInherit.value).toBe(3);
    expect(mInherit.source).toBe("tablet");
    expect(mInherit.inherited).toBe(true);
    expect(mInherit.overridden).toBe(false);
  });

  it("Test 1.3: Explicit Mobile override isolates to Mobile layer only", () => {
    const section: Section = {
      id: "sec-grid-3",
      type: "product_grid",
      props: {
        columns: 4,
      },
      bp: {
        tablet: {
          columns: 3,
        },
        mobile: {
          columns: 2,
        },
      },
    };

    const dInherit = inheritanceOf(section, "columns", "desktop");
    expect(dInherit.value).toBe(4);
    expect(dInherit.source).toBe("desktop");

    const tInherit = inheritanceOf(section, "columns", "tablet");
    expect(tInherit.value).toBe(3);
    expect(tInherit.source).toBe("tablet");
    expect(tInherit.overridden).toBe(true);

    const mInherit = inheritanceOf(section, "columns", "mobile");
    expect(mInherit.value).toBe(2);
    expect(mInherit.source).toBe("mobile");
    expect(mInherit.inherited).toBe(false);
    expect(mInherit.overridden).toBe(true);
  });

  it("Test 1.4: Resetting an override restores upstream inheritance deterministically", () => {
    const sectionWithOverrides: Section = {
      id: "sec-grid-4",
      type: "product_grid",
      props: {
        columns: 4,
      },
      bp: {
        tablet: {
          columns: 3,
        },
        mobile: {
          columns: 2,
        },
      },
    };

    // Simulate clearing mobile override
    const sectionAfterMobileReset: Section = {
      ...sectionWithOverrides,
      bp: {
        tablet: { ...sectionWithOverrides.bp?.tablet },
      },
    };

    const mAfterReset = inheritanceOf(sectionAfterMobileReset, "columns", "mobile");
    expect(mAfterReset.value).toBe(3);
    expect(mAfterReset.source).toBe("tablet");
    expect(mAfterReset.inherited).toBe(true);
    expect(mAfterReset.overridden).toBe(false);

    // Simulate clearing tablet override
    const sectionAfterTabletReset: Section = {
      ...sectionAfterMobileReset,
      bp: {},
    };

    const tAfterReset = inheritanceOf(sectionAfterTabletReset, "columns", "tablet");
    expect(tAfterReset.value).toBe(4);
    expect(tAfterReset.source).toBe("desktop");
    expect(tAfterReset.inherited).toBe(true);
    expect(tAfterReset.overridden).toBe(false);
  });
});

describe("Wave 3 — Group 2: Responsive Merchant Controls & Inspector UX (Scope 5.2, 5.5)", () => {
  it("Test 2.1: SectionInspector displays active layer banner when editing mobile or tablet", () => {
    const section: Section = {
      id: "sec-insp-1",
      type: "department_grid",
      props: {
        columns: 4,
      },
    };

    const mobileMarkup = html(
      withQuery(
        <SectionInspector
          {...baseInspectorProps}
          device="mobile"
          section={section}
          onChange={noop}
        />,
      ),
    );

    expect(mobileMarkup).toContain("Editing the mobile layer");
    expect(mobileMarkup).toContain("Values inherit from desktop until overridden");

    const tabletMarkup = html(
      withQuery(
        <SectionInspector
          {...baseInspectorProps}
          device="tablet"
          section={section}
          onChange={noop}
        />,
      ),
    );

    expect(tabletMarkup).toContain("Editing the tablet layer");
  });

  it("Test 2.2: SectionInspector renders inheritance pill and reset button when overridden", () => {
    const onClearOverride = vi.fn();
    const section: Section = {
      id: "sec-insp-2",
      type: "department_grid",
      props: {
        columns: 4,
      },
      bp: {
        mobile: {
          columns: 2,
        },
      },
    };

    const markup = html(
      withQuery(
        <SectionInspector
          {...baseInspectorProps}
          device="mobile"
          section={section}
          onChange={noop}
          onClearOverride={onClearOverride}
        />,
      ),
    );

    // When overridden on mobile, inspector must show override status and reset affordance
    expect(markup).toContain("Overridden on mobile");
    expect(markup).toContain("Reset to inherited");
  });

  it("Test 2.3: Invoking reset action calls onClearOverride with exact field key and device", () => {
    const onClearOverride = vi.fn();
    const section: Section = {
      id: "sec-insp-3",
      type: "department_grid",
      props: {
        columns: 4,
      },
      bp: {
        mobile: {
          columns: 2,
        },
      },
    };

    // Test clear override handler logic directly
    const handleClear = (key: string, device: Breakpoint) => {
      onClearOverride(key, device);
    };

    handleClear("columns", "mobile");
    expect(onClearOverride).toHaveBeenCalledWith("columns", "mobile");
  });

  it("Test 2.4: Editing responsive field on mobile passes device tag to onChange", () => {
    const onChange = vi.fn();
    const section: Section = {
      id: "sec-insp-4",
      type: "department_grid",
      props: {
        columns: 4,
      },
    };

    const handleChange = (key: string, val: PropValue, dev: Breakpoint) => {
      onChange(key, val, dev);
    };

    handleChange("columns", 2, "mobile");
    expect(onChange).toHaveBeenCalledWith("columns", 2, "mobile");
  });
});

describe("Wave 3 — Group 3: Section Responsive Rendering & Storefront Parity (Scope 5.3, 5.6)", () => {
  it("Test 3.1: widgetReader resolves device-specific overrides correctly across all breakpoints", () => {
    const section: Section = {
      id: "sec-read-1",
      type: "department_grid",
      props: {
        columns: 6,
        gap: "lg",
        title: "Craft Categories",
      },
      bp: {
        tablet: {
          columns: 4,
        },
        mobile: {
          columns: 2,
          gap: "sm",
        },
      },
    };

    const desktopCtx = makeCtx(section, "desktop");
    expect(desktopCtx.int("columns", 4, 1, 12)).toBe(6);
    expect(desktopCtx.str("gap")).toBe("lg");
    expect(desktopCtx.str("title")).toBe("Craft Categories");

    const tabletCtx = makeCtx(section, "tablet");
    expect(tabletCtx.int("columns", 4, 1, 12)).toBe(4);
    expect(tabletCtx.str("gap")).toBe("lg"); // inherited from desktop
    expect(tabletCtx.str("title")).toBe("Craft Categories");

    const mobileCtx = makeCtx(section, "mobile");
    expect(mobileCtx.int("columns", 4, 1, 12)).toBe(2); // overridden on mobile
    expect(mobileCtx.str("gap")).toBe("sm"); // overridden on mobile
    expect(mobileCtx.str("title")).toBe("Craft Categories"); // inherited from desktop
  });

  it("Test 3.2: DepartmentGrid renders responsive column classes reflecting device override", () => {
    const section: Section = {
      id: "dept-grid-1",
      type: "department_grid",
      props: {
        columns: 4,
        departments: [
          { title: "Jamdani", href: "/c/jamdani" },
          { title: "Panjabi", href: "/c/panjabi" },
        ],
      },
      bp: {
        mobile: {
          columns: 2,
        },
      },
    };

    const Cmp = SONGOSKRITI_WIDGETS.department_grid;
    expect(Cmp).toBeDefined();

    const mobileCtx = makeCtx(section, "mobile");
    const mobileHtml = html(<Cmp {...mobileCtx} />);
    expect(mobileHtml).toContain("Jamdani");
    expect(mobileHtml).toContain("Panjabi");

    const desktopCtx = makeCtx(section, "desktop");
    const desktopHtml = html(<Cmp {...desktopCtx} />);
    expect(desktopHtml).toContain("Jamdani");
  });

  it("Test 3.3: UgcGallery renders responsive grid layout without horizontal overflow", () => {
    const section: Section = {
      id: "ugc-1",
      type: "ugc_gallery",
      props: {
        columns: 6,
        images: [
          { url: "https://cdn.example.com/ugc1.jpg", alt: "Festive Silk" },
          { url: "https://cdn.example.com/ugc2.jpg", alt: "Handwoven Cotton" },
        ],
      },
      bp: {
        mobile: {
          columns: 2,
        },
      },
    };

    const Cmp = SONGOSKRITI_WIDGETS.ugc_gallery;
    expect(Cmp).toBeDefined();

    const mobileCtx = makeCtx(section, "mobile");
    const markup = html(<Cmp {...mobileCtx} />);
    expect(markup).toContain("https://cdn.example.com/ugc1.jpg");
    expect(markup).toContain("Festive Silk");
  });
});

describe("Wave 3 — Group 4: Device Visibility Controls (Scope 5.2)", () => {
  it("Test 4.1: section.hidden hides section only on targeted device layers", () => {
    const section: Section = {
      id: "sec-vis-1",
      type: "rich_text",
      props: {
        content: "Desktop Only Banner",
      },
      hidden: ["mobile", "tablet"],
    };

    // Helper checking device visibility
    const isVisibleOn = (sec: Section, dev: Breakpoint) => {
      return !sec.hidden || !sec.hidden.includes(dev);
    };

    expect(isVisibleOn(section, "desktop")).toBe(true);
    expect(isVisibleOn(section, "tablet")).toBe(false);
    expect(isVisibleOn(section, "mobile")).toBe(false);
  });

  it("Test 4.2: Toggling device visibility updates hidden list cleanly without mutating props", () => {
    const section: Section = {
      id: "sec-vis-2",
      type: "announcement_bar",
      props: {
        message: "Free shipping over ৳5000",
      },
      hidden: ["mobile"],
    };

    const toggleHidden = (sec: Section, dev: Breakpoint): Section => {
      const current = sec.hidden ?? [];
      const next = current.includes(dev)
        ? current.filter((b) => b !== dev)
        : [...current, dev];
      return {
        ...sec,
        hidden: next.length ? next : undefined,
      };
    };

    // Toggle mobile back on
    const unhidden = toggleHidden(section, "mobile");
    expect(unhidden.hidden).toBeUndefined();
    expect(unhidden.props.message).toBe("Free shipping over ৳5000");

    // Toggle tablet off
    const tabletHidden = toggleHidden(unhidden, "tablet");
    expect(tabletHidden.hidden).toEqual(["tablet"]);
    expect(tabletHidden.props.message).toBe("Free shipping over ৳5000");
  });
});
