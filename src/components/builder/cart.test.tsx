/**
 * Cart cluster — slide-over drawer, optimistic lines, sticky footer,
 * free-shipping progress and bilingual live regions.
 *
 * Renders through `SectionRenderer` with the demo cart (no provider), the
 * same path the theme-agnostic suite uses, in both locales. Money figures
 * are never asserted arithmetically — only that server values reach markup
 * and that the a11y/responsive contracts hold.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { newSection, type SectionType, type TemplateKey } from "@/lib/builder-ast";
import { SectionRenderer } from "./SectionRenderer";

// Cart widgets read the store base off the TanStack router (same as the
// storefront, which always renders inside a RouterProvider). The bare
// render path used here has none, so stub the single hook cart widgets use.
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useRouterState: () => ({ location: { pathname: "/store/demo/cart" } }),
  };
});

const CART_SRC = readFileSync("src/components/builder/cart.tsx", "utf8");
const OVERLAY_SRC = readFileSync(
  "src/components/builder/primitives/OverlayHost.tsx",
  "utf8",
);

function render(
  type: SectionType,
  locale: "en" | "bn" = "en",
  template: TemplateKey = "cart",
  storeSlug?: string,
) {
  return renderToStaticMarkup(
    <SectionRenderer
      section={newSection(type)}
      editing={false}
      locale={locale}
      template={template}
      storeSlug={storeSlug}
      // Storefront hosts declare context ownership with explicit null slots;
      // without it the renderer skips template widgets (see cart route).
      contextSlots={{ [type]: null }}
    />,
  );
}

describe("cart lines — optimistic, bilingual, 44px targets", () => {
  it("renders demo rows with stepper groups and remove actions (en)", () => {
    const html = render("cart_lines", "en");
    expect(html).toContain("Sample product");
    expect(html).toContain('role="group"');
    expect(html).toContain("Remove");
    expect(html).toContain("min-h-11");
  });

  it("renders bangla chrome (bn)", () => {
    const html = render("cart_lines", "bn");
    // Authored defaults fall back to en until the merchant translates them;
    // locale-driven chrome (stepper labels, numerals) renders bangla.
    expect(html).toContain('lang="bn"');
    expect(html).toContain("এর পরিমাণ");
    expect(html).toContain("একটি কমান");
    expect(html).toContain("৯৯০");
  });

  it("announces in-flight re-quotes instead of swapping to skeletons", () => {
    expect(CART_SRC).toContain('role="status"');
    expect(CART_SRC).toContain('aria-live="polite"');
    expect(CART_SRC).toContain("Updating your cart");
    expect(CART_SRC).toContain("কার্ট আপডেট হচ্ছে");
  });

  it("merges local quantities optimistically without money arithmetic", () => {
    // Quantity is not money: the merge may touch `quantity` but never a
    // `*Minor` value. The phase 2.5 money-arithmetic test guards the rest.
    expect(CART_SRC).toContain("Optimistic quantities");
    const merge = CART_SRC.split("\n").filter((line) =>
      /local\.variantId/.test(line),
    );
    expect(merge.length).toBeGreaterThan(0);
    for (const line of merge) expect(line).not.toMatch(/Minor/);
  });

  it("offers a bilingual way back when the cart is empty", () => {
    expect(CART_SRC).toContain("Continue shopping");
    expect(CART_SRC).toContain("কেনাকাটা চালিয়ে যান");
  });
});

describe("cart drawer — slide-over with sticky checkout footer", () => {
  it("exposes a dialog trigger with a live count (en)", () => {
    const html = render("cart_drawer", "en");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-live="polite"');
    // Catalogue default trigger copy; the dialog title renders on open.
    expect(html).toContain("Cart");
    expect(html).toContain("(3)");
  });

  it("keeps the trigger operable with a live count (bn)", () => {
    const html = render("cart_drawer", "bn");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("(3)");
    // Bilingual dialog title + dismiss label (rendered when opened).
    expect(CART_SRC).toContain("আপনার কার্ট");
    expect(CART_SRC).toContain("বন্ধ করুন");
  });

  it("pins the summary as a sticky footer inside the drawer", () => {
    expect(CART_SRC).toContain("sticky bottom-0");
    expect(CART_SRC).toContain("Pinned checkout footer");
  });

  it("stays closed until triggered — no dialog markup in SSR", () => {
    const html = render("cart_drawer", "en");
    expect(html).not.toContain('aria-modal="true"');
  });
});

describe("cart summary — server totals with live announcements", () => {
  it("renders server rows, coupon and CTA with 44px+ targets (en)", () => {
    const html = render("cart_summary", "en");
    expect(html).toContain("Order summary");
    expect(html).toContain("Subtotal");
    expect(html).toContain("Total");
    expect(html).toContain("Coupon code");
    expect(html).toContain("min-h-14");
  });

  it("announces the total to screen readers in both locales", () => {
    expect(render("cart_summary", "en")).toContain('aria-live="polite"');
    const bn = render("cart_summary", "bn");
    expect(bn).toContain('aria-live="polite"');
    // Localised numerals inside the live total announcement.
    expect(bn).toContain("২,৩৫০");
  });

  it("embeds free-shipping progress when enabled", () => {
    const html = render("cart_summary", "en");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain("more for free shipping");
  });
});

describe("free shipping bar — progress with bilingual status", () => {
  it("renders progressbar semantics with the server remainder (en)", () => {
    const html = render("free_shipping_bar", "en");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain("Free shipping progress");
    expect(html).toContain('aria-valuenow="83"');
  });

  it("renders bangla progress labelling (bn)", () => {
    const html = render("free_shipping_bar", "bn");
    expect(html).toContain("ফ্রি ডেলিভারির অগ্রগতি");
  });
});

describe("payment methods — server rails only, 44px labels", () => {
  it("renders the server-rails fieldset without invented methods", () => {
    const html = render("payment_methods", "en");
    expect(html).toContain("<fieldset");
    expect(html).toContain("Payment method");
    // Rail labels are touch-size when the server returns rails.
    expect(CART_SRC).toContain("min-h-11 cursor-pointer");
  });
});

describe("cart motion — reduced-motion respected", () => {
  it("gates pulse, progress and press motion behind motion-safe", () => {
    expect(CART_SRC).toContain("motion-safe:animate-pulse");
    expect(CART_SRC).toContain("motion-safe:transition-all");
    expect(CART_SRC).toContain("motion-safe:active:scale-");
    expect(CART_SRC).not.toMatch(/(?<!motion-safe:)animate-pulse/);
  });
});

describe("cart lane contracts — tokens, overlay ownership, no money math", () => {
  it("hardcodes no raw colour values", () => {
    expect(CART_SRC.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
  });

  it("leaves overlay ownership to OverlayHost", () => {
    expect(CART_SRC).not.toMatch(/body\.style\.overflow/);
    expect(CART_SRC).not.toMatch(/aria-modal/);
  });

  it("imports no theme module", () => {
    const imports = [...CART_SRC.matchAll(/from\s+"([^"]+)"/g)].map(
      (m) => m[1]!,
    );
    expect(
      imports.filter((s) =>
        /theme|preset|bazaar|atelier|circuit|rupaboti/i.test(s),
      ),
    ).toEqual([]);
  });
});

describe("OverlayHost — cart-adjacent primitive fixes", () => {
  it("keeps the mandated focus/Escape/scroll behaviour", () => {
    expect(OVERLAY_SRC).toContain('aria-modal="true"');
    expect(OVERLAY_SRC).toContain("document.body.style.overflow");
    expect(OVERLAY_SRC).toContain('event.key === "Escape"');
    expect(OVERLAY_SRC).toContain('event.key !== "Tab"');
    expect(OVERLAY_SRC).toContain("restoreRef.current?.focus?.()");
  });

  it("gives the dismiss button a 44px target and a localised label", () => {
    expect(OVERLAY_SRC).toContain("min-h-11 min-w-11");
    expect(OVERLAY_SRC).toContain("closeLabel");
  });

  it("goes full-bleed on mobile and docks with radius on desktop", () => {
    expect(OVERLAY_SRC).toContain("rounded-none");
    expect(OVERLAY_SRC).toContain("sm:rounded-fq-lg");
  });

  it("slides transform-only behind motion-safe (instant when reduced)", () => {
    // Right drawers travel on translate-x; every side gates behind motion-safe
    // so prefers-reduced-motion collapses to an instant appearance.
    expect(OVERLAY_SRC).toContain("motion-safe:animate-in");
    expect(OVERLAY_SRC).toContain("motion-safe:slide-in-from-right");
    expect(OVERLAY_SRC).toContain("motion-safe:slide-in-from-bottom");
    expect(OVERLAY_SRC).toContain("motion-safe:duration-200");
    // Transform-only: no opacity fade on the drawer panel.
    expect(OVERLAY_SRC).not.toContain("fade-in");
    expect(OVERLAY_SRC).not.toContain("fade-out");
    expect(OVERLAY_SRC).not.toContain("zoom-in");
    // No unguarded enter animation: every animate-in is motion-safe prefixed.
    const bare = OVERLAY_SRC.split("motion-safe:animate-in")
      .join("")
      .includes("animate-in");
    expect(bare).toBe(false);
  });

  it("keeps focus/Escape/scroll behaviour byte-identical", () => {
    expect(OVERLAY_SRC).toContain("restoreRef.current = (document.activeElement");
    expect(OVERLAY_SRC).toContain(
      'document.body.style.overflow = "hidden"',
    );
    expect(OVERLAY_SRC).toContain("event.stopPropagation()");
    expect(OVERLAY_SRC).toContain("if (!open) return null;");
  });
});
