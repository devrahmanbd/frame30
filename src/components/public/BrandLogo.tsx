import { cn } from "@/lib/utils";

export interface BrandLogoProps {
  className?: string;
  size?: number | string;
}

/**
 * BrandLogo — Official vector logo component based on frame.svg.
 * Renders the signature brand icon directly from /favicon.svg.
 */
export function BrandLogo({ className, size = 32 }: BrandLogoProps) {
  return (
    <svg
      viewBox="0 0 832 832"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      data-icon-standalone="false"
      className={cn("shrink-0 transition-transform duration-200", className)}
    >
      <path
        className="fill-foreground transition-colors duration-150"
        d="m277.11 429.41c-25.41-63.36 2.37-109.93 36.09-133.4 60.24-41.97 147-79.18 262.5-101.91 273.72-53.93 128.8-216.15-82.74-180.87-54.75 9.14-105.77 31.64-152.27 57.94-142.54 80.59-226.47 255.14-64.1 358.76-53.93 53.92-73.09 125.6 3.41 226.99-21.02-44.34-2-91.81 36.03-110.08 51.47-24.81 125.53-41.52 183.83-67 141.73-61.8 158.74-253.58-43.89-158.28-59.35 27.93-132.07 61.28-178.86 107.85z"
      />
      <path
        fill="#33cc99" /* design-exit-allow: color */
        d="m381.32 616.96c-57.05 0-103.25 46.2-103.25 103.25 0 56.97 46.2 103.24 103.25 103.24 57.04 0 103.24-46.27 103.24-103.24 0-57.05-46.2-103.25-103.24-103.25z"
      />
    </svg>
  );
}
