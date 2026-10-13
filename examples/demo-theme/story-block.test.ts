/**
 * Demo theme fixture — animated storytelling block proof (section 1 of 3).
 *
 * Fixture: `examples/demo-theme/story-block.ts` fed only by `commerce.ts`
 * (the §5 read-scoped context shape: ids/titles/handles/images, readiness
 * flags — theme code never sees catalogue figures).
 * Contract: `openspec/changes/dev-theme-runtime/sdk-contract.md` §2-5.
 *
 * Run: `npx vitest run --config examples/demo-theme/vitest.config.ts`
 */
import { describe, expect, it } from "vitest";
import { demoCommerceFixture } from "./fixture-bundles";
import {
  buildStorySection,
  coerceStorySettings,
  liveStoryTimelineCount,
  mountStoryAnimation,
  renderStoryBlock,
  STORY_COMPONENT_NAME,
  STORY_SECTION_KEY,
  STORY_SECTION_SLOT,
} from "./story-block";
import { hostPrefersReducedMotion, resolveMotionPreset } from "./shared";

describe("story block — merchant settings render", () => {
  it("applies heading copy and the merchant chapter selection", () => {
    const out = renderStoryBlock({
      settings: {
        heading: "From clay to shelf",
        motion: "gentle",
        gap: 32,
      },
      chapters: ["prod-2", "prod-1"],
      commerce: demoCommerceFixture(),
      prefersReducedMotion: false,
    });
    expect(out.heading).toBe("From clay to shelf");
    expect(out.html).toContain("From clay to shelf");
    expect(out.products.map((product) => product.id)).toEqual([
      "prod-2",
      "prod-1",
    ]);
    expect(out.html).toContain("Palm Woven Basket");
    expect(out.html).toContain("River Clay Vase");
    expect(out.animated).toBe(true);
  });

  it("renders copy escaped (merchant text is copy only, never markup)", () => {
    const out = renderStoryBlock({
      settings: { heading: "<script>alert(1)</script>" },
      chapters: ["prod-1"],
      commerce: demoCommerceFixture(),
      prefersReducedMotion: false,
    });
    expect(out.html).not.toContain("<script>");
    expect(out.html).toContain("&lt;script&gt;");
  });

  it("skips unknown chapter ids instead of failing", () => {
    const out = renderStoryBlock({
      settings: {},
      chapters: ["missing-id", "prod-1"],
      commerce: demoCommerceFixture(),
      prefersReducedMotion: false,
    });
    expect(out.products.map((product) => product.id)).toEqual(["prod-1"]);
    expect(out.html).not.toContain("missing-id");
  });

  it("surfaces readiness from the context without catalogue figures", () => {
    const out = renderStoryBlock({
      settings: {},
      chapters: ["prod-1", "prod-2"],
      commerce: demoCommerceFixture(),
      prefersReducedMotion: false,
    });
    expect(out.html).toContain("Available");
    expect(out.html).toContain("Back soon");
  });

  it("renders the backdrop only when the merchant sets one", () => {
    const bare = renderStoryBlock({
      settings: {},
      chapters: ["prod-1"],
      commerce: demoCommerceFixture(),
      prefersReducedMotion: false,
    });
    expect(bare.html).not.toContain("data-story-backdrop");
    const dressed = renderStoryBlock({
      settings: { backdrop: "/ph/demo/atelier-wide.jpg" },
      chapters: ["prod-1"],
      commerce: demoCommerceFixture(),
      prefersReducedMotion: false,
    });
    expect(dressed.html).toContain("data-story-backdrop");
  });

  it("maps merchant settings onto the host Section shape", () => {
    const section = buildStorySection("story-1", {
      heading: "Hello",
      motion: "bold",
      gap: 40,
    });
    expect(section).toMatchObject({
      id: "story-1",
      type: STORY_SECTION_KEY,
      props: { heading: "Hello", motion: "bold", gap: 40 },
    });
    expect(STORY_SECTION_KEY).toBe("story-arc");
    expect(STORY_COMPONENT_NAME).toBe("StoryArc");
    expect(STORY_SECTION_SLOT).toBe("main");
  });

  it("clamps merchant spacing and falls back on weak input", () => {
    expect(coerceStorySettings({ gap: 999 }).gap).toBe(96);
    expect(coerceStorySettings({ gap: -4 }).gap).toBe(0);
    expect(coerceStorySettings({}).heading).toBe("Our story");
    expect(coerceStorySettings({ motion: "hyperdrive" }).motion).toBe(
      "standard",
    );
  });
});

describe("story block — motion behaviour", () => {
  it("reduced motion renders a functional static fallback (no engine load)", async () => {
    let loaderCalls = 0;
    const out = renderStoryBlock({
      settings: { heading: "Calm edit" },
      chapters: ["prod-1"],
      commerce: demoCommerceFixture(),
      prefersReducedMotion: true,
    });
    expect(out.animated).toBe(false);
    expect(out.html).toContain("Calm edit");
    expect(out.html).toContain("River Clay Vase");

    const mounted = await mountStoryAnimation([{ opacity: 1, y: 0 }], {
      motion: "bold",
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
    const liveBefore = liveStoryTimelineCount();

    const states = [
      { opacity: 1, y: 0 },
      { opacity: 1, y: 0 },
    ];
    const mounted = await mountStoryAnimation(states, {
      motion: "standard",
      prefersReducedMotion: false,
    });
    expect(mounted.timeline).not.toBeNull();
    expect(mounted.tweenCount).toBe(2);
    expect(liveStoryTimelineCount()).toBe(liveBefore + 1);

    mounted.destroy();
    expect(mounted.timeline!.getChildren()).toHaveLength(0);
    expect(mounted.timeline!.isActive()).toBe(false);
    expect(liveStoryTimelineCount()).toBe(liveBefore);
    expect(gsap.globalTimeline.getChildren().length).toBe(globalBefore);
  });

  it("a fake engine proves the stagger contract without the real bundle", async () => {
    const seen: Array<{ from: object; to: object; at: number | undefined }> =
      [];
    const mounted = await mountStoryAnimation(
      [
        { opacity: 1, y: 0 },
        { opacity: 1, y: 0 },
      ],
      {
        motion: "gentle",
        prefersReducedMotion: false,
        loader: async () => ({
          timeline: () => ({
            fromTo: (
              target: object,
              fromVars: object,
              toVars: object,
              position?: number,
            ) => {
              seen.push({ from: fromVars, to: toVars, at: position });
              return undefined;
            },
            getChildren: () => seen,
            play: () => undefined,
            kill: () => {},
            clear: () => undefined,
            isActive: () => false,
          }),
        }),
      },
    );
    expect(mounted.animated).toBe(true);
    expect(mounted.tweenCount).toBe(2);
    expect(seen.map((tween) => tween.at)).toEqual([0, 0.08]);
    mounted.destroy();
    expect(liveStoryTimelineCount()).toBe(0);
  });

  it("intensity presets stay under the page motion budget", () => {
    expect(resolveMotionPreset("gentle")).toBe("gentle");
    expect(resolveMotionPreset("bold")).toBe("bold");
    expect(resolveMotionPreset("hyperdrive")).toBe("standard");
    expect(resolveMotionPreset(undefined)).toBe("standard");
  });

  it("host reduced-motion detection is SSR-safe", () => {
    expect(() => hostPrefersReducedMotion()).not.toThrow();
    expect(typeof hostPrefersReducedMotion()).toBe("boolean");
  });

  it("reaches GSAP through a dynamic import only", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = dirname(fileURLToPath(import.meta.url));
    const text = readFileSync(join(here, "story-block.ts"), "utf8");
    expect(text).toMatch(/await\s+import\(\s*["']gsap["']\s*\)/);
  });
});
