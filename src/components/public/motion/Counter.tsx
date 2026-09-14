/**
 * Counter — count-up for the numbers band.
 *
 * Rules learned the hard way:
 *   • the *final* value is in the DOM for SSR and for screen readers
 *     (`aria-live="off"`, the animated text is aria-hidden), so a crawler and
 *     a screen reader never see "0";
 *   • the in-flight string is padded to the width of the final string, so the
 *     surrounding layout cannot shift on every frame (CLS budget is 0.02);
 *   • it runs once, on entry, on the shared rAF ticker, and stops the moment
 *     it lands or the tab is hidden.
 */
import { useEffect, useRef, useState } from "react";
import {
  MOTION_TOKENS,
  counterValueAt,
  formatCounterValue,
} from "@/lib/motion-policy";
import {
  addTicker,
  releaseMotionBudget,
  useInView,
  useMotionId,
  useMotionIntent,
  withMotionBudget,
} from "@/lib/motion-runtime";

export type CounterProps = {
  to: number;
  from?: number;
  duration?: number;
  locale?: string;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  /** Accessible label for the whole figure, e.g. "1,240 merchants". */
  label?: string;
};

export function Counter({
  to,
  from = 0,
  duration = MOTION_TOKENS.duration.counter as number,
  locale = "en-US",
  decimals = 0,
  prefix = "",
  suffix = "",
  className,
  label,
}: CounterProps) {
  const intent = useMotionIntent();
  const animated = intent === "full";
  const id = useMotionId("counter");
  const { ref, inView } = useInView<HTMLSpanElement>({ once: true, enabled: animated });
  const [value, setValue] = useState(animated ? from : to);
  const started = useRef(false);

  useEffect(() => {
    if (!animated) {
      setValue(to);
      return;
    }
    if (!inView || started.current) return;
    if (!withMotionBudget(id)) {
      setValue(to);
      return;
    }
    started.current = true;
    const startedAt = performance.now();
    const stop = addTicker((now) => {
      const elapsed = now - startedAt;
      const next = counterValueAt(elapsed, duration, from, to, "full");
      setValue(next);
      if (elapsed >= duration) {
        setValue(to);
        stop();
        releaseMotionBudget(id);
      }
    });
    return () => {
      stop();
      releaseMotionBudget(id);
    };
  }, [animated, duration, from, id, inView, to]);

  const text = formatCounterValue(value, to, { locale, maximumFractionDigits: decimals });
  const settled = formatCounterValue(to, to, { locale, maximumFractionDigits: decimals });

  return (
    <span
      ref={ref}
      className={className}
      data-motion="counter"
      /* The settled figure, published for scripts/motion-gate.mjs: under
         reduced motion the rendered text must already equal this. */
      data-motion-settled={`${prefix}${settled}${suffix}`}
    >
      {/* The settled figure is what assistive tech and crawlers read. */}
      <span className="sr-only">{label ?? `${prefix}${settled}${suffix}`}</span>
      {/* Space reservation, not padding (§10.6 CLS).
       *
       * `formatCounterValue` pads the in-flight string, but padding is only
       * width-stable in a tabular face — `tabular` was not a utility in this
       * build, so proportional digits made the stat row breathe by a few px on
       * every frame and the shift landed on the sibling copy (the `span, span,
       * p` attribution on /payments). The settled figure is rendered invisibly
       * in the same grid cell, so the box is sized for the final value from the
       * first frame and the animated text can never resize it. */}
      <span aria-hidden="true" className="inline-grid tabular-nums">
        <span className="invisible col-start-1 row-start-1 whitespace-pre">
          {prefix}
          {settled}
          {suffix}
        </span>
        <span className="col-start-1 row-start-1 whitespace-pre">
          {prefix}
          {text}
          {suffix}
        </span>
      </span>
    </span>
  );
}
