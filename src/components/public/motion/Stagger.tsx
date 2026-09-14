/**
 * Stagger — sequences the entrance of a list of children.
 *
 * The schedule is computed by `staggerSchedule`, which caps both the per-child
 * step and the total run: a 40-card grid arrives in under a second instead of
 * trailing for three. Children beyond the cap share the final delay rather than
 * disappearing off the end of the schedule.
 */
import { Children, isValidElement, type ElementType, type ReactNode } from "react";
import { MOTION_TOKENS, staggerSchedule } from "@/lib/motion-policy";
import { useMotionIntent } from "@/lib/motion-runtime";
import { Reveal, type RevealProps } from "./Reveal";

export type StaggerProps = {
  children: ReactNode;
  step?: number;
  maxTotal?: number;
  as?: ElementType;
  className?: string;
  itemAs?: ElementType;
  itemClassName?: string;
  direction?: RevealProps["direction"];
  distance?: number;
};

export function Stagger({
  children,
  step = MOTION_TOKENS.stagger.stepMs as number,
  maxTotal = MOTION_TOKENS.stagger.maxTotalMs as number,
  as,
  className,
  itemAs,
  itemClassName,
  direction = "up",
  distance,
}: StaggerProps) {
  const Tag = (as ?? "div") as ElementType;
  const intent = useMotionIntent();
  const items = Children.toArray(children).filter(
    (child) => isValidElement(child) || typeof child === "string" || typeof child === "number",
  );
  const delays = staggerSchedule(items.length, { stepMs: step, maxTotalMs: maxTotal, intent });

  return (
    <Tag className={className} data-motion="stagger">
      {items.map((child, index) => (
        <Reveal
          key={isValidElement(child) && child.key ? child.key : index}
          as={itemAs}
          className={itemClassName}
          delay={delays[index] ?? 0}
          direction={direction}
          distance={distance}
        >
          {child}
        </Reveal>
      ))}
    </Tag>
  );
}
