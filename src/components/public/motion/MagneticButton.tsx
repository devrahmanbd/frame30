/**
 * MagneticButton — pointer-attracted CTA.
 *
 * Only ever a *visual* offset: the element's hit area, focus ring and keyboard
 * behaviour are untouched, and the pull is capped at 10px so the target never
 * runs away from the cursor (Fitts's law beats delight). Touch and coarse
 * pointers get nothing — a magnet with no cursor is just jitter.
 */
import { useEffect, useRef, useState, type ComponentPropsWithoutRef, type ElementType } from "react";
import { MOTION_TOKENS, allowsMagnetic, magneticOffset } from "@/lib/motion-policy";
import { useMotionIntent } from "@/lib/motion-runtime";

type MagneticButtonProps<T extends ElementType> = {
  as?: T;
  strength?: number;
  className?: string;
} & Omit<ComponentPropsWithoutRef<T>, "as">;

export function MagneticButton<T extends ElementType = "button">({
  as,
  strength = MOTION_TOKENS.distance.magneticMax as number,
  className,
  children,
  ...rest
}: MagneticButtonProps<T>) {
  const Tag = (as ?? "button") as ElementType;
  const intent = useMotionIntent();
  const ref = useRef<HTMLElement | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  /**
   * TODO §10.4: "magnetic primary CTA at >=1024px only". Both conditions are
   * *live* media queries, not one-shot reads: a visitor who rotates a tablet or
   * drags a window from a 1440px monitor onto a 900px laptop screen must lose
   * the magnet at the moment they cross the breakpoint, not on the next
   * navigation. A one-shot read on mount is the classic version of this bug.
   */
  const [eligible, setEligible] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia?.(
      `(pointer: fine) and (min-width: ${MOTION_TOKENS.magnetic.minViewportPx}px)`,
    );
    if (!mq) {
      setEligible(false);
      return;
    }
    const sync = () => setEligible(mq.matches);
    sync();
    // Safari < 14 has no addEventListener on MediaQueryList; the deprecated
    // addListener is the only way to stay live there, so support both.
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", sync);
      return () => mq.removeEventListener("change", sync);
    }
    mq.addListener?.(sync);
    return () => mq.removeListener?.(sync);
  }, []);

  const enabled = allowsMagnetic(
    intent,
    // `eligible` already encodes the width query; passing the live width keeps
    // the pure policy function the single arbiter of the decision.
    eligible ? MOTION_TOKENS.magnetic.minViewportPx : 0,
    eligible,
  );

  useEffect(() => {
    if (!enabled) setOffset({ x: 0, y: 0 });
  }, [enabled]);

  return (
    <Tag
      {...rest}
      ref={ref}
      className={className}
      data-motion="magnetic"
      /* Read by scripts/motion-gate.mjs: the gate asserts the *resolved*
         decision, so a regression in the media queries is a hard failure
         rather than something a reviewer has to notice by hovering. */
      data-motion-magnetic={enabled ? "on" : "off"}
      data-motion-offset={enabled ? `${offset.x},${offset.y}` : "0,0"}
      onPointerMove={(event: React.PointerEvent<HTMLElement>) => {
        rest.onPointerMove?.(event);
        if (!enabled) return;
        const rect = event.currentTarget.getBoundingClientRect();
        setOffset(
          magneticOffset(
            event.clientX - (rect.left + rect.width / 2),
            event.clientY - (rect.top + rect.height / 2),
            rect,
            strength,
          ),
        );
      }}
      onPointerLeave={(event: React.PointerEvent<HTMLElement>) => {
        rest.onPointerLeave?.(event);
        setOffset({ x: 0, y: 0 });
      }}
      onBlur={(event: React.FocusEvent<HTMLElement>) => {
        rest.onBlur?.(event);
        setOffset({ x: 0, y: 0 });
      }}
      style={{
        ...(rest.style ?? {}),
        transform: enabled ? `translate3d(${offset.x}px, ${offset.y}px, 0)` : undefined,
        transition: `transform ${MOTION_TOKENS.duration.fast}ms ${MOTION_TOKENS.easing.out}`,
      }}
    >
      {children}
    </Tag>
  );
}
