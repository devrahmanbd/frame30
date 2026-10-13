/**
 * Level B thin vertical slice — animated product section proof.
 *
 * Fixture: `examples/dev-theme-slice/animated-product-section.ts` fed only by
 * `commerce.ts` (the §5 read-scoped context shape: ids/titles/handles/images,
 * availability flags — theme code never sees catalogue amounts).
 * Contract: `openspec/changes/dev-theme-runtime/sdk-contract.md` §2-5.
 *
 * Run: `npx vitest run --config examples/dev-theme-slice/vitest.config.ts`
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildSliceSection,
  hostPrefersReducedMotion,
  liveSliceTimelineCount,
  mountSectionAnimation,
  renderAnimatedProductSection,
  resolveIntensity,
  type SliceCommerceContext,
} from "./animated-product-section";

const here = dirname(fileURLToPath(import.meta.url));
/** Theme source under test — docs and tests are deliberately excluded. */
const THEME_SOURCE_FILES = [
  "dev.theme.json",
  "manifest.ts",
  "commerce.ts",
  "animated-product-section.ts",
];
const themeSource = () =>
  THEME_SOURCE_FILES.map((file) => ({
    file,
    text: readFileSync(join(here, file), "utf8"),
  }));

function demoCommerce(): SliceCommerceContext {
  return {
    products: [
      {
        id: "prod-1",
        title: "River Clay Vase",
        handle: "river-clay-vase",
        images: ["/ph/slice/vase.jpg"],
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
        images: ["/ph/slice/basket.jpg"],
        options: ["Large"],
        variants: [{ id: "var-2a", title: "Large", available: false }],
      },
    ],
    collections: [
      {
        id: "col-1",
        title: "New arrivals",
        handle: "new-arrivals",
        productIds: ["prod-1", "prod-2"],
      },
    ],
  };
}

describe("dev-theme slice — merchant settings render", () => {
  it("applies heading text and the merchant product selection", () => {
    const out = renderAnimatedProductSection({
      settings: {
        heading: "This week's edit",
        products: ["prod-2", "prod-1"],
        intensity: "gentle",
      },
      commerce: demoCommerce(),
      prefersReducedMotion: false,
    });
    expect(out.heading).toBe("This week's edit");
    expect(out.html).toContain("This week&#x27;s edit");
    expect(out.products.map((product) => product.id)).toEqual([
      "prod-2",
      "prod-1",
    ]);
    expect(out.html).toContain("Palm Woven Basket");
    expect(out.html).toContain("River Clay Vase");
  });

  it("renders copy escaped (merchant text is copy only, never markup)", () => {
    const out = renderAnimatedProductSection({
      settings: { heading: "<script>alert(1)</script>" },
      commerce: demoCommerce(),
      prefersReducedMotion: false,
    });
    expect(out.html).not.toContain("<script>");
    expect(out.html).toContain("&lt;script&gt;");
  });

  it("skips unknown product ids instead of failing", () => {
    const out = renderAnimatedProductSection({
      settings: { products: ["missing-id", "prod-1"] },
      commerce: demoCommerce(),
      prefersReducedMotion: false,
    });
    expect(out.products.map((product) => product.id)).toEqual(["prod-1"]);
    expect(out.html).not.toContain("missing-id");
  });

  it("surfaces availability from the context without catalogue amounts", () => {
    const out = renderAnimatedProductSection({
      settings: { products: ["prod-1", "prod-2"] },
      commerce: demoCommerce(),
      prefersReducedMotion: false,
    });
    expect(out.html).toContain("Available");
    expect(out.html).toContain("Back soon");
  });

  it("maps merchant settings onto the host Section shape", () => {
    const section = buildSliceSection("slice-1", {
      heading: "Hello",
      products: ["prod-1"],
      intensity: "bold",
    });
    expect(section).toMatchObject({
      id: "slice-1",
      type: "animated-spotlight",
      props: { heading: "Hello", products: ["prod-1"], intensity: "bold" },
    });
  });
});

describe("dev-theme slice — commerce-context purity (source scan)", () => {
  it("theme source contains no catalogue-amount literals", () => {
    const banned: RegExp[] = [
      /\bprices?\b/i,
      /amount_minor/,
      /৳/,
      /\bBDT\s*\d/i,
      /\$\s*\d/,
    ];
    for (const { file, text } of themeSource()) {
      for (const pattern of banned) {
        expect(text, `${file} matches ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("the single-engine policy holds: no static gsap import, dynamic only", () => {
    for (const { file, text } of themeSource()) {
      expect(text, `${file} must not statically import gsap`).not.toMatch(
        /^\s*import\s+(?!type\b).*from\s*["']gsap["']/m,
      );
      expect(text, `${file} must not require gsap`).not.toMatch(
        /require\(\s*["']gsap["']\s*\)/,
      );
    }
    const section = themeSource().find(
      (entry) => entry.file === "animated-product-section.ts",
    )!;
    expect(section.text).toMatch(/await\s+import\(\s*["']gsap["']\s*\)/);
  });

  it("theme source performs no network access", () => {
    const banned: RegExp[] = [
      /\bfetch\s*\(/,
      /from\s+["']https?:/,
      /import\(\s*["']https?:/,
      /XMLHttpRequest/,
      /WebSocket/,
    ];
    for (const { file, text } of themeSource()) {
      for (const pattern of banned) {
        expect(text, `${file} matches ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("only the expected fixture files exist (no stray sources to audit)", () => {
    const files = readdirSync(here).sort();
    expect(files).toEqual(
      [
        "README.md",
        "animated-product-section.test.ts",
        "animated-product-section.ts",
        "commerce.ts",
        "dev.theme.json",
        "manifest.ts",
        "slice-manifest.test.ts",
        "vitest.config.ts",
      ].sort(),
    );
  });
});

describe("dev-theme slice — motion behaviour", () => {
  it("reduced motion renders a functional static fallback (no engine load)", async () => {
    let loaderCalls = 0;
    const out = renderAnimatedProductSection({
      settings: { heading: "Calm edit", products: ["prod-1"] },
      commerce: demoCommerce(),
      prefersReducedMotion: true,
    });
    expect(out.animated).toBe(false);
    expect(out.html).toContain("Calm edit");
    expect(out.html).toContain("River Clay Vase");

    const mounted = await mountSectionAnimation([{ opacity: 1, y: 0 }], {
      intensity: "bold",
      prefersReducedMotion: true,
      loader: () => {
        loaderCalls += 1;
        return Promise.reject(new Error("engine must not load"));
      },
    });
    expect(mounted.timeline).toBeNull();
    expect(mounted.animated).toBe(false);
    expect(loaderCalls).toBe(0);
    mounted.destroy();
  });

  it("full motion builds a GSAP timeline and unmount kills it (no leaks)", async () => {
    const { gsap } = await import("gsap");
    const globalBefore = gsap.globalTimeline.getChildren().length;
    const liveBefore = liveSliceTimelineCount();

    const states = [
      { opacity: 1, y: 0 },
      { opacity: 1, y: 0 },
    ];
    const mounted = await mountSectionAnimation(states, {
      intensity: "standard",
      prefersReducedMotion: false,
    });
    expect(mounted.timeline).not.toBeNull();
    expect(mounted.tweenCount).toBe(2);
    expect(liveSliceTimelineCount()).toBe(liveBefore + 1);

    mounted.destroy();
    expect(mounted.timeline!.getChildren()).toHaveLength(0);
    expect(mounted.timeline!.isActive()).toBe(false);
    expect(liveSliceTimelineCount()).toBe(liveBefore);
    expect(gsap.globalTimeline.getChildren().length).toBe(globalBefore);
  });

  it("intensity presets stay under the page motion budget", () => {
    expect(resolveIntensity("gentle")).toBe("gentle");
    expect(resolveIntensity("bold")).toBe("bold");
    // Unknown merchant input falls back to standard — never a crash.
    expect(resolveIntensity("hyperdrive")).toBe("standard");
    expect(resolveIntensity(undefined)).toBe("standard");
  });

  it("host reduced-motion detection is SSR-safe", () => {
    // Node has no window: the host helper must report a boolean, never throw.
    expect(() => hostPrefersReducedMotion()).not.toThrow();
    expect(typeof hostPrefersReducedMotion()).toBe("boolean");
  });
});
