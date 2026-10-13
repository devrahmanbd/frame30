/**
 * Demo theme fixture — fixture bundles for the runtime + bridge tests.
 *
 * No app mount is needed: tests render the ThemeRuntime SSR shell for the
 * fixture identity below and validate the section envelope builders against
 * the real bridge v2 validators (`authorizeThemeCall`, `answerThemeCall`,
 * `handleThemeMessage`) plus the real grant constructor
 * (`buildThemeGrants`). The catalogue fixture honours the §5 read shape —
 * ids, titles, handles, images, options, readiness flags — and the carousel
 * fixture mixes image and video slides. This file is test support, not
 * shipped theme code, so it is excluded from the executable bundle mapping
 * in `commerce-bridge.test.ts`.
 */

import { buildThemeGrants } from "../../src/components/theme-runtime/capabilities";
import type { DemoCommerceContext } from "./commerce";
import type { CarouselSlideInput } from "./media-carousel";

export const DEMO_ASSET_ORIGIN = "https://themes.example-cdn.com";

export const DEMO_THEME_IDENTITY = {
  name: "demo-atelier",
  version: "0.1.0",
} as const;

/** Least-privilege install grants for the demo story (default-deny base). */
export function demoThemeGrants() {
  return buildThemeGrants({
    storefrontRead: true,
    variantSelect: true,
    cartAdd: true,
    navigate: true,
    navigateAllowlist: [],
  });
}

export function demoCommerceFixture(): DemoCommerceContext {
  return {
    products: [
      {
        id: "prod-1",
        title: "River Clay Vase",
        handle: "river-clay-vase",
        images: ["/ph/demo/vase.jpg"],
        options: ["Natural", "Charcoal"],
        variants: [
          { id: "var-1a", title: "Natural", available: true },
          { id: "var-1b", title: "Charcoal", available: false },
        ],
      },
      {
        id: "prod-2",
        title: "Palm Woven Basket",
        handle: "palm-woven-basket",
        images: ["/ph/demo/basket.jpg"],
        options: ["Large"],
        variants: [{ id: "var-2a", title: "Large", available: false }],
      },
      {
        id: "prod-3",
        title: "Hill Tea Set",
        handle: "hill-tea-set",
        images: ["/ph/demo/tea.jpg", "/ph/demo/tea-alt.jpg"],
        options: ["Four piece", "Six piece"],
        variants: [
          { id: "var-3a", title: "Four piece", available: true },
          { id: "var-3b", title: "Six piece", available: true },
        ],
      },
    ],
    collections: [
      {
        id: "col-1",
        title: "New arrivals",
        handle: "new-arrivals",
        productIds: ["prod-1", "prod-2", "prod-3"],
      },
    ],
  };
}

export function demoCarouselSlidesFixture(): CarouselSlideInput[] {
  return [
    { kind: "image", src: "/ph/demo/look-1.jpg", alt: "Morning shelf" },
    {
      kind: "video",
      src: "/ph/demo/atelier.mp4",
      poster: "/ph/demo/atelier-poster.jpg",
      alt: "Hands at the wheel",
    },
    { kind: "image", src: "/ph/demo/look-2.jpg", alt: "Kiln room" },
  ];
}
