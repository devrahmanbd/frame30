import { describe, expect, it } from "vitest";
import { ADMIN_NAV } from "./console-nav";

describe("CMS & Dashboard Navigation Hierarchy", () => {
  it("Marketplace is the dedicated installation hub for plugins only (no theme tab)", () => {
    const marketplace = ADMIN_NAV.find((g) => g.key === "marketplace");
    expect(marketplace).toBeDefined();
    expect(marketplace!.items).toHaveLength(1);

    const [pluginsItem] = marketplace!.items;
    expect(pluginsItem.en).toBe("Plugins");
    expect(pluginsItem.search).toEqual({ tab: "plugin" });

    // No theme menus or legacy installed tabs in marketplace
    for (const item of marketplace!.items) {
      expect(item.en.toLowerCase()).not.toContain("theme");
      expect(item.en.toLowerCase()).not.toBe("installed");
    }
  });

  it("Categories menu is named Category (not Organisation)", () => {
    const products = ADMIN_NAV.find((g) => g.key === "products");
    expect(products).toBeDefined();
    const catItem = products!.items.find((i) => i.to === "/dashboard/categories");
    expect(catItem).toBeDefined();
    expect(catItem!.en).toBe("Category");
  });

  it("Appearance contains Menus and Custom CSS, JS (themes retired)", () => {
    const appearance = ADMIN_NAV.find((g) => g.key === "appearance");
    expect(appearance).toBeDefined();

    const targets = appearance!.items.map((i) => i.to);
    expect(targets).not.toContain("/dashboard/content/themes");
    expect(targets).toContain("/dashboard/content/menus");
    expect(targets).toContain("/dashboard/content/custom-code");

    const labels = appearance!.items.map((i) => i.en);
    expect(labels).not.toContain("Themes");
    expect(labels).toContain("Menus");
    expect(labels).toContain("Custom CSS, JS");
  });

  it("Plugins is a single parent top-level menu with Installed Plugins and Add New", () => {
    const plugins = ADMIN_NAV.find((g) => g.key === "plugins");
    expect(plugins).toBeDefined();
    expect(plugins!.to).toBe("/dashboard/plugins");

    const labels = plugins!.items.map((i) => i.en);
    expect(labels).toEqual(["Installed Plugins", "Add New"]);

    expect(plugins!.items[0].to).toBe("/dashboard/plugins");
    expect(plugins!.items[1].to).toBe("/dashboard/plugins/new");
  });

  it("Marketing contains SEO and Settings excludes SEO and dangerous Infrastructure", () => {
    const marketing = ADMIN_NAV.find((g) => g.key === "marketing");
    expect(marketing).toBeDefined();
    const marketingTargets = marketing!.items.map((i) => i.to);
    expect(marketingTargets).toContain("/dashboard/settings/seo");

    const settings = ADMIN_NAV.find((g) => g.key === "settings");
    expect(settings).toBeDefined();
    const settingsItems = settings!.items.map((i) => i.to);
    const settingsMore = (settings!.more ?? []).map((i) => i.to);

    // SEO is moved to Marketing
    expect(settingsItems).not.toContain("/dashboard/settings/seo");
    expect(settingsMore).not.toContain("/dashboard/settings/seo");

    // Dangerous host-SSRF/queue-cancel infrastructure is removed from merchant console nav
    expect(settingsItems).not.toContain("/dashboard/settings/infrastructure");
    expect(settingsMore).not.toContain("/dashboard/settings/infrastructure");
  });
});
