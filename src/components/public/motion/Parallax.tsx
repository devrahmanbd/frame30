/**
 * Parallax — the only primitive that pays for the engine.
 *
 * GSAP + ScrollTrigger is dynamically imported the first time a Parallax
 * mounts at `full` intent. If the chunk fails, times out, or the visitor is on
 * `reduced`/`off`, the section renders flat and static — no pinning, no
 * placeholder, no layout difference beyond the missing depth.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { MOTION_TOKENS, parallaxOffset } from "@/lib/motion-policy";
import { withEngine } from "@/lib/motion-engine";
import { useMotionIntent } from "@/lib/motion-runtime";

export type ParallaxProps = {
  children: ReactNode;
  /** 0 = static, 1 = maximum travel (`MOTION_TOKENS.distance.parallaxMax`). */
  depth?: number;
  className?: string;
};

export function Parallax({ children, depth = 0.2, className }: ParallaxProps) {
  const intent = useMotionIntent();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (intent !== "full") return;
    const node = ref.current;
    if (!node) return;

    const scope = withEngine(({ gsap, ScrollTrigger }) => {
      const trigger = ScrollTrigger.create({
        trigger: node,
        start: "top bottom",
        end: "bottom top",
        onUpdate: (self) => {
          // self.progress is 0…1 across the pass; map to -1…1 around centre.
          const y = parallaxOffset(self.progress * 2 - 1, depth, MOTION_TOKENS.distance.parallaxMax);
          gsap.set(node, { y, force3D: true });
        },
      });
      return () => {
        trigger.kill();
        gsap.set(node, { clearProps: "transform" });
      };
    });

    return () => scope.dispose();
  }, [depth, intent]);

  return (
    <div ref={ref} className={className} data-motion="parallax">
      {children}
    </div>
  );
}
