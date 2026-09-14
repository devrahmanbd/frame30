/**
 * Reveal — the entrance primitive every marketing section uses.
 *
 * Contract:
 *   • SSR renders the *settled* state. If JS never runs, or the observer is
 *     missing, or the motion budget is exhausted, the content is visible and
 *     correctly laid out. Motion is additive, never load-bearing.
 *   • Off-screen nodes do no work: one shared IntersectionObserver, and the
 *     node is unobserved the moment it has revealed.
 *   • `reduced` intent keeps a short opacity fade with zero translation;
 *     `off` skips animation entirely.
 */
import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";
import {
  MOTION_TOKENS,
  allowsTransform,
  entranceDuration,
  type MotionIntent,
} from "@/lib/motion-policy";
import {
  releaseMotionBudget,
  useInView,
  useMotionId,
  useMotionIntent,
  withMotionBudget,
} from "@/lib/motion-runtime";

export type RevealProps = {
  children: ReactNode;
  /** Extra delay on top of any parent Stagger schedule, in ms. */
  delay?: number;
  /** Travel distance in px; ignored at `reduced`/`off` intent. */
  distance?: number;
  direction?: "up" | "down" | "left" | "right" | "none";
  duration?: number;
  as?: ElementType;
  className?: string;
  /** Re-run the entrance whenever the node re-enters the viewport. */
  repeat?: boolean;
};

function translate(direction: RevealProps["direction"], distance: number) {
  switch (direction) {
    case "down":
      return `translate3d(0, ${-distance}px, 0)`;
    case "left":
      return `translate3d(${distance}px, 0, 0)`;
    case "right":
      return `translate3d(${-distance}px, 0, 0)`;
    case "none":
      return "none";
    default:
      return `translate3d(0, ${distance}px, 0)`;
  }
}

export function Reveal({
  children,
  delay = 0,
  distance = MOTION_TOKENS.distance.rise as number,
  direction = "up",
  duration,
  as,
  className,
  repeat = false,
}: RevealProps) {
  const Tag = (as ?? "div") as ElementType;
  const intent: MotionIntent = useMotionIntent();
  const animated = intent !== "off";
  const id = useMotionId("reveal");
  const { ref, inView } = useInView<HTMLElement>({ once: !repeat, enabled: animated });
  const [entered, setEntered] = useState(!animated);
  const budgeted = useRef(false);

  useEffect(() => {
    if (!animated) {
      setEntered(true);
      return;
    }
    if (!inView) {
      if (repeat) setEntered(false);
      return;
    }
    // Borrow a slot; if the page is already saturated we simply appear.
    budgeted.current = withMotionBudget(id);
    setEntered(true);
    const ms = entranceDuration(intent, duration ?? (MOTION_TOKENS.duration.reveal as number)) + delay;
    const timer = setTimeout(() => {
      if (budgeted.current) {
        releaseMotionBudget(id);
        budgeted.current = false;
      }
    }, ms + 50);
    return () => {
      clearTimeout(timer);
      if (budgeted.current) {
        releaseMotionBudget(id);
        budgeted.current = false;
      }
    };
  }, [animated, delay, duration, id, intent, inView, repeat]);

  const ms = entranceDuration(intent, duration ?? (MOTION_TOKENS.duration.reveal as number));
  const useTransform = allowsTransform(intent);
  const hidden = animated && !entered;

  /**
   * The entrance publishes its own contract (Phase 10.4).
   *
   * `scripts/motion-gate.mjs` used to read the *computed* transition, which on a
   * glass card is the union of this entrance and the card's hover affordance —
   * so a legitimate `border-color 200ms` hover was reported as an illegal
   * entrance property on every card of every page. Declaring the entrance here
   * means the gate audits what this component actually animates, and a hover
   * transition stays what it is: a hover transition.
   */
  const properties = ms > 0 ? (useTransform ? "opacity,transform" : "opacity") : "";

  return (
    <Tag
      ref={ref}
      className={className}
      data-motion-state={hidden ? "pending" : "settled"}
      data-motion-duration={ms}
      data-motion-delay={delay}
      data-motion-distance={useTransform && direction !== "none" ? distance : 0}
      data-motion-properties={properties}
      style={{
        opacity: hidden ? 0 : 1,
        transform: hidden && useTransform ? translate(direction, distance) : "none",
        transition:
          ms > 0
            ? `opacity ${ms}ms ${MOTION_TOKENS.easing.entrance} ${delay}ms, transform ${ms}ms ${MOTION_TOKENS.easing.entrance} ${delay}ms`
            : undefined,
        willChange: hidden ? "opacity, transform" : undefined,
      }}
    >

      {children}
    </Tag>
  );
}
