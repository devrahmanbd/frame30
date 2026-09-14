/**
 * Marquee — the logo wall / proof strip.
 *
 * Duration is derived from the measured content width so a 6-logo strip and a
 * 30-logo strip scroll at the same *speed*, not the same duration. The track is
 * duplicated once and translated -50%, which loops seamlessly with a single
 * composited transform (no JS per frame).
 *
 * Accessibility: the duplicate copy is `aria-hidden`, the strip pauses on hover
 * and on keyboard focus inside it, and under `reduced`/`off` intent it degrades
 * to a horizontally scrollable, non-animated row — which is also what a
 * keyboard user gets.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MOTION_TOKENS, marqueeDurationMs } from "@/lib/motion-policy";
import { onTabVisibility, useInView, useMotionIntent } from "@/lib/motion-runtime";

export type MarqueeProps = {
  children: ReactNode;
  /** Pixels per second. */
  speed?: number;
  reverse?: boolean;
  className?: string;
  label: string;
};

export function Marquee({ children, speed = MOTION_TOKENS.marquee.speedPxPerSec as number, reverse = false, className, label }: MarqueeProps) {
  const intent = useMotionIntent();
  const animated = intent === "full";
  const trackRef = useRef<HTMLDivElement | null>(null);
  const { ref: viewportRef, inView } = useInView<HTMLDivElement>({ once: false, enabled: animated, threshold: 0 });
  const [durationMs, setDurationMs] = useState<number>(MOTION_TOKENS.marquee.minMs);
  const [paused, setPaused] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);

  // Re-measure on resize and on font swap: a Bangla logo caption changes width
  // when the webfont lands, and a stale duration means a visible speed jump.
  useEffect(() => {
    if (!animated) return;
    const node = trackRef.current;
    if (!node) return;
    const measure = () => setDurationMs(marqueeDurationMs(node.scrollWidth / 2, speed));
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(node);
    void (document as Document & { fonts?: FontFaceSet }).fonts?.ready.then(measure).catch(() => {});
    return () => ro?.disconnect();
  }, [animated, speed, children]);

  useEffect(() => {
    const off = onTabVisibility(setTabVisible);
    return () => {
      off();
    };
  }, []);

  const running = animated && inView && tabVisible && !paused;

  return (
    <div
      ref={viewportRef}
      className={`group relative overflow-x-auto overflow-y-hidden ${className ?? ""}`}
      role="region"
      aria-label={label}
      tabIndex={0}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      data-motion="marquee"
      data-running={running}
    >
      <div
        ref={trackRef}
        className="flex w-max items-center gap-10"
        style={
          animated
            ? {
                animationName: "fq-marquee",
                animationDuration: `${durationMs}ms`,
                animationTimingFunction: "linear",
                animationIterationCount: "infinite",
                animationDirection: reverse ? "reverse" : "normal",
                animationPlayState: running ? "running" : "paused",
                willChange: running ? "transform" : undefined,
              }
            : undefined
        }
      >
        <div className="flex items-center gap-10">{children}</div>
        <div className="flex items-center gap-10" aria-hidden="true">
          {children}
        </div>
      </div>
    </div>
  );
}
