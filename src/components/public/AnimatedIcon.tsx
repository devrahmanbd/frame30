import { type ElementType, type ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

export type IconAnimationVariant =
  | "bounce"
  | "tilt"
  | "pulse"
  | "wiggle"
  | "lift"
  | "spin-slow"
  | "ping"
  | "draw"
  | "float"
  | "sparkle"
  | "magnetic"
  | "glow";

export interface AnimatedIconProps extends ComponentPropsWithoutRef<"span"> {
  icon: ElementType<{ className?: string }>;
  variant?: IconAnimationVariant;
  size?: "sm" | "md" | "lg" | "xl";
  iconClassName?: string;
}

const SIZE_MAP = {
  sm: "size-3.5",
  md: "size-4",
  lg: "size-5",
  xl: "size-6",
};

const VARIANT_MAP: Record<IconAnimationVariant, string> = {
  bounce: "motion-safe:group-hover:-translate-y-1 transition-transform duration-300 ease-out",
  tilt: "motion-safe:group-hover:rotate-12 transition-transform duration-300 ease-out",
  wiggle: "motion-safe:group-hover:rotate-6 motion-safe:group-hover:scale-110 transition-transform duration-200",
  pulse: "motion-safe:group-hover:scale-110 transition-transform duration-300",
  lift: "motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:scale-105 transition-transform duration-200",
  "spin-slow": "motion-safe:group-hover:rotate-45 transition-transform duration-500",
  ping: "motion-safe:animate-pulse motion-safe:group-hover:scale-110 transition-transform duration-300",
  draw: "motion-safe:group-hover:scale-105 motion-safe:group-hover:stroke-[2.2] transition-all duration-300",
  float: "motion-safe:group-hover:-translate-y-1 motion-safe:group-hover:rotate-2 transition-all duration-300 ease-out",
  sparkle: "motion-safe:group-hover:scale-125 motion-safe:group-hover:rotate-12 transition-all duration-300 ease-out",
  magnetic: "motion-safe:group-hover:translate-x-1 transition-transform duration-200 ease-out",
  glow: "motion-safe:group-hover:drop-shadow-[0_0_6px_var(--fq-signal)] transition-all duration-300",
};

/**
 * AnimatedIcon — micro-interaction icon wrapper.
 *
 * Inspired by itshover.com, animate-ui.com, potlabicons.com, and lucide-animated.
 * Provides accessible, subtle motion triggers that elevate UI responsiveness
 * while strictly honouring prefers-reduced-motion.
 */
export function AnimatedIcon({
  icon: Icon,
  variant = "lift",
  size = "md",
  className,
  iconClassName,
  ...props
}: AnimatedIconProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center shrink-0 transition-colors",
        variant === "ping" && "relative",
        className,
      )}
      {...props}
    >
      {variant === "ping" && (
        <span
          aria-hidden="true"
          className="absolute -inset-1 rounded-full bg-primary/20 motion-safe:animate-ping pointer-events-none"
        />
      )}
      <Icon
        className={cn(
          SIZE_MAP[size],
          VARIANT_MAP[variant],
          iconClassName,
        )}
      />
    </span>
  );
}
