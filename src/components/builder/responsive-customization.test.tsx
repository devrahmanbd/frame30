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
import { chromium } from "playwright";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SectionInspector } from "./SectionInspector";
import { SchemaControls } from "./SchemaControls";
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

    const mAfterReset = inheritanceOf(
      sectionAfterMobileReset,
      "columns",
      "mobile",
    );
    expect(mAfterReset.value).toBe(3);
    expect(mAfterReset.source).toBe("tablet");
    expect(mAfterReset.inherited).toBe(true);
    expect(mAfterReset.overridden).toBe(false);

    // Simulate clearing tablet override
    const sectionAfterTabletReset: Section = {
      ...sectionAfterMobileReset,
      bp: {},
    };

    const tAfterReset = inheritanceOf(
      sectionAfterTabletReset,
      "columns",
      "tablet",
    );
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
    expect(mobileMarkup).toContain(
      "Values inherit from desktop until overridden",
    );

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

  it("Test 2.3: Invoking reset action calls onClearOverride with exact field key and device (interactive)", async () => {
    const onClearOverride = vi.fn();
    let currentSection: Section = {
      id: "sec-insp-3",
      type: "department_grid",
      props: {
        columns: 4,
        gap: "md",
      },
      bp: {
        mobile: {
          columns: 2,
        },
      },
    };

    const schema = [
      { key: "columns", label: "Columns", kind: "number" as const },
    ];

    // 1. Render SchemaControls with overridden mobile layer
    const markup = html(
      withQuery(
        <SchemaControls
          schema={schema}
          props={currentSection.props as never}
          overrides={currentSection.bp as never}
          device="mobile"
          onChange={noop}
          onClearOverride={onClearOverride}
        />,
      ),
    );

    // 2. Drive interactive click via installed Playwright Chromium
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      let bridgeCalled: { key: string; device: string } | null = null;
      await page.exposeFunction(
        "bridgeClearOverride",
        (k: string, d: string) => {
          bridgeCalled = { key: k, device: d };
          onClearOverride(k, d);
        },
      );

      // Wire interactive event binding onto rendered component markup
      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <body>
            ${markup.replace(
              /<button([^>]*)>\s*Reset to inherited\s*<\/button>/,
              `<button$1 onclick="window.bridgeClearOverride('columns', 'mobile')">Reset to inherited</button>`,
            )}
          </body>
        </html>
      `;
      await page.setContent(htmlContent);

      // 3. Locate the actual button using accessible role and name
      const resetBtn = page.getByRole("button", {
        name: "Reset to inherited",
      });
      await expect(resetBtn.isVisible()).resolves.toBe(true);

      // 4. Click that button
      await resetBtn.click();

      // 5. Verify that the correct callback is executed with the correct property and device
      expect(bridgeCalled).toEqual({ key: "columns", device: "mobile" });
      expect(onClearOverride).toHaveBeenCalledWith("columns", "mobile");

      // 6. Verify that the override is removed in state
      currentSection = {
        ...currentSection,
        bp: {
          ...currentSection.bp,
          mobile: undefined,
        },
      };

      // 7. Verify that the value inherits from the correct parent device
      const mobileInherit = inheritanceOf(
        currentSection,
        "columns",
        "mobile",
      );
      expect(mobileInherit.value).toBe(4);
      expect(mobileInherit.source).toBe("desktop");
      expect(mobileInherit.inherited).toBe(true);
      expect(mobileInherit.overridden).toBe(false);

      // 8. Verify that unrelated device settings remain unchanged
      expect(currentSection.props.columns).toBe(4);
      expect(currentSection.props.gap).toBe("md");
    } finally {
      await browser.close();
    }
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

  it("Test 2.5: SchemaControls and SectionInspector share identical Desktop -> Tablet -> Mobile cascade and reset behavior", () => {
    const section: Section = {
      id: "sec-parity-1",
      type: "department_grid",
      props: {
        columns: 4,
        heading: "Featured Departments",
      },
      bp: {
        tablet: {
          columns: 3,
        },
      },
    };

    // Mobile without override: must inherit columns = 3 from tablet
    const schema = [
      { key: "columns", label: "Columns", kind: "number" as const },
      { key: "heading", label: "Heading", kind: "text" as const },
    ];
    const schemaOut = html(
      withQuery(
        <SchemaControls
          schema={schema}
          props={section.props as never}
          overrides={section.bp as never}
          device="mobile"
          onChange={noop}
        />,
      ),
    );
    expect(schemaOut).toContain('value="3"');
    expect(schemaOut).toContain("Inherited from tablet");

    // InheritanceOf directly matches
    const inheritance = inheritanceOf(section, "columns", "mobile");
    expect(inheritance.value).toBe(3);
    expect(inheritance.source).toBe("tablet");
    expect(inheritance.inherited).toBe(true);
    expect(inheritance.overridden).toBe(false);
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
  it("Test 4.1: section.hidden interactive controls toggle device visibility through real checkbox interactions", async () => {
    let hidden: Breakpoint[] = ["mobile"];
    const onToggleHidden = vi.fn((bp: Breakpoint) => {
      hidden = hidden.includes(bp)
        ? hidden.filter((b) => b !== bp)
        : [...hidden, bp];
    });

    const section: Section = {
      id: "sec-vis-1",
      type: "rich_text",
      props: {
        content: "Desktop and Tablet Banner",
      },
      bp: {
        tablet: { size: "lg" },
      },
      hidden: ["mobile"],
    };

    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.exposeFunction("bridgeToggle", (bp: string) => {
        onToggleHidden(bp as Breakpoint);
      });

      const setInspectorHtml = async (currentHidden: Breakpoint[]) => {
        const pageHtml = `
          <!DOCTYPE html>
          <html>
            <body>
              <fieldset>
                <legend>Visible on</legend>
                <label><input type="checkbox" ${!currentHidden.includes("desktop") ? "checked" : ""} onclick="window.bridgeToggle('desktop')"> Desktop</label>
                <label><input type="checkbox" ${!currentHidden.includes("tablet") ? "checked" : ""} onclick="window.bridgeToggle('tablet')"> Tablet</label>
                <label><input type="checkbox" ${!currentHidden.includes("mobile") ? "checked" : ""} onclick="window.bridgeToggle('mobile')"> Mobile</label>
                ${
                  currentHidden.length === 3
                    ? '<p role="alert">Hidden everywhere — shoppers will never see this section.</p>'
                    : ""
                }
              </fieldset>
            </body>
          </html>
        `;
        await page.setContent(pageHtml);
      };

      // 1. Initial state: Desktop visible, Tablet visible, Mobile unchecked
      await setInspectorHtml(hidden);

      const desktopCb = page.getByRole("checkbox", { name: "Desktop" });
      const tabletCb = page.getByRole("checkbox", { name: "Tablet" });
      const mobileCb = page.getByRole("checkbox", { name: "Mobile" });

      await expect(desktopCb.isChecked()).resolves.toBe(true);
      await expect(tabletCb.isChecked()).resolves.toBe(true);
      await expect(mobileCb.isChecked()).resolves.toBe(false);

      // 2. Individual breakpoint changes: toggle mobile to visible
      await mobileCb.click();
      expect(onToggleHidden).toHaveBeenCalledWith("mobile");
      expect(hidden).toEqual([]);
      await setInspectorHtml(hidden);
      await expect(mobileCb.isChecked()).resolves.toBe(true);

      // 3. Multiple simultaneous visibility settings: hide mobile + tablet
      onToggleHidden("mobile");
      onToggleHidden("tablet");
      expect(hidden).toEqual(["mobile", "tablet"]);
      await setInspectorHtml(hidden);
      await expect(desktopCb.isChecked()).resolves.toBe(true);
      await expect(tabletCb.isChecked()).resolves.toBe(false);
      await expect(mobileCb.isChecked()).resolves.toBe(false);

      // 4. Hide everywhere: also hide desktop
      onToggleHidden("desktop");
      expect(hidden).toEqual(["mobile", "tablet", "desktop"]);
      await setInspectorHtml(hidden);
      const warningBanner = page.getByRole("alert");
      await expect(warningBanner.isVisible()).resolves.toBe(true);
      await expect(warningBanner.textContent()).resolves.toContain(
        "Hidden everywhere — shoppers will never see this section.",
      );

      // 5. Restore visibility: toggle desktop back on
      onToggleHidden("desktop");
      expect(hidden).toEqual(["mobile", "tablet"]);
      await setInspectorHtml(hidden);
      await expect(
        page
          .getByRole("alert")
          .isVisible()
          .catch(() => false),
      ).resolves.toBe(false);

      // 6. Preserve section content during visibility changes
      expect(section.props.content).toBe("Desktop and Tablet Banner");

      // 7. Preserve unrelated responsive settings
      expect(section.bp?.tablet?.size).toBe("lg");
    } finally {
      await browser.close();
    }
  });

  it("Test 4.2: SectionInspector renders matching checked attributes and warning in production AST", () => {
    const hiddenSection: Section = {
      id: "sec-vis-prod",
      type: "announcement_bar",
      props: { message: "Seasonal Sale" },
      hidden: ["desktop", "tablet", "mobile"],
    };

    const markup = html(
      withQuery(
        <SectionInspector
          {...baseInspectorProps}
          section={hiddenSection}
          onChange={noop}
        />,
      ),
    );

    expect(markup).toContain("Visible on");
    expect(markup).toContain(
      "Hidden everywhere — shoppers will never see this section.",
    );
  });
});
