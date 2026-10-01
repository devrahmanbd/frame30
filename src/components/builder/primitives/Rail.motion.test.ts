/**
 * Rail scroll-motion source invariants (mirrors motion.contract.test.ts
 * style): the rail gained a GSAP entrance batch + scrub zoom, and these
 * are the properties a well-meaning refactor would otherwise erase.
 *
 * 1. No static gsap import — the engine arrives through lazy `withEngine`.
 * 2. Motion is intent-gated (`useMotionIntent` + `resolveRevealMode`), so
 *    reduced-motion / Save-Data / SSR run zero animation.
 * 3. The scroller is resolved (`findRevealScroller`) so the theme
 *    preview's nested scroll container still fires triggers.
 * 4. A failed setup clears props — cards must never strand hidden.
 * 5. The entrance transform is horizontal (x) — the rail's ul is an
 *    overflow-x scroll box, and a vertical offset would open a phantom
 *    scroll area inside it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/components/builder/primitives/Rail.tsx"),
  "utf8",
);

describe("Rail scroll motion invariants", () => {
  it("reaches the engine only through withEngine — never a static gsap import", () => {
    expect(source).toContain("withEngine");
    expect(source).not.toMatch(/from\s+["']gsap/);
  });

  it("gates motion on the resolved intent", () => {
    expect(source).toContain("useMotionIntent");
    expect(source).toContain("resolveRevealMode");
  });

  it("resolves the real scroller (theme preview uses a nested container)", () => {
    expect(source).toContain("findRevealScroller");
  });

  it("clears props on a failed setup so cards never strand hidden", () => {
    expect(source).toMatch(/catch\s*\{[^}]*clearProps/s);
  });

  it("enters on the horizontal axis only — no vertical offset in the overflow-x box", () => {
    expect(source).toMatch(/gsap\.set\(items,\s*\{\s*x:\s*\d+/);
    expect(source).not.toMatch(/gsap\.set\(items,\s*\{[^}]*\by:\s*\d+/);
  });

  it("reverts the gsap context on cleanup (no leaked tweens on unmount)", () => {
    expect(source).toContain("ctx.revert()");
    expect(source).toContain("handle.dispose()");
  });
});
