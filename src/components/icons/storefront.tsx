/**
 * Storefront commerce icon family (icons-motion lane).
 *
 * Hand-vendored inline React components for the preview storefront widgets —
 * no external URLs, no icon-library runtime in the storefront bundle. Geometry
 * is drawn in the repo's Tabler outline style (24px grid, stroke-only, round
 * caps/joins) so it sits at the same visual weight as `tabler.tsx` and the
 * marketing sprite built by `scripts/build-icon-sprite.mjs`.
 *
 * One family, one weight: every mark defaults to `strokeWidth={1.75}`, the
 * same width the sprite symbols use. Override per instance only for optical
 * size compensation, never per icon.
 *
 * Labelling follows `src/components/public/Icon.tsx`: marks are decorative by
 * default through `StorefrontIcon` (`aria-hidden`), and standalone marks take
 * a bilingual `label` from `STOREFRONT_ICON_LABELS` (en/bn).
 */
/* eslint-disable prettier/prettier -- single-line icon bodies, like tabler.tsx */
import type { ReactElement, SVGProps } from "react";

export type StorefrontIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  strokeWidth?: number | string;
};

/** Compatible prop type for icon slots (e.g. widget headers, rating rows). */
export type StorefrontIconComponent = (
  props: StorefrontIconProps,
) => ReactElement;

/** The single family weight — matches the marketing sprite symbols. */
export const STOREFRONT_STROKE_WIDTH = 1.75;

function base(paths: string, props: StorefrontIconProps): ReactElement {
  const { size = 24, strokeWidth = STOREFRONT_STROKE_WIDTH, ...rest } = props;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
      dangerouslySetInnerHTML={{ __html: paths }}
    />
  );
}

const SPACER = '<path stroke="none" d="M0 0h24v24H0z" fill="none" />';

export function Cart(props: StorefrontIconProps) {
  return base(
    `${SPACER}\n  <path d="M4 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />\n  <path d="M15 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />\n  <path d="M17 17h-11v-14h-2" />\n  <path d="M6 5l14 1l-1 7h-13" />`,
    props,
  );
}

export function Search(props: StorefrontIconProps) {
  return base(
    `${SPACER}\n  <path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />\n  <path d="M21 21l-6 -6" />`,
    props,
  );
}

export function Close(props: StorefrontIconProps) {
  return base(
    `${SPACER}\n  <path d="M18 6l-12 12" />\n  <path d="M6 6l12 12" />`,
    props,
  );
}

export function ChevronDown(props: StorefrontIconProps) {
  return base(`${SPACER}\n  <path d="M6 9l6 6l6 -6" />`, props);
}

export function ChevronUp(props: StorefrontIconProps) {
  return base(`${SPACER}\n  <path d="M6 15l6 -6l6 6" />`, props);
}

export function ChevronLeft(props: StorefrontIconProps) {
  return base(`${SPACER}\n  <path d="M15 6l-6 6l6 6" />`, props);
}

export function ChevronRight(props: StorefrontIconProps) {
  return base(`${SPACER}\n  <path d="M9 6l6 6l-6 6" />`, props);
}

export function ArrowLeft(props: StorefrontIconProps) {
  return base(
    `${SPACER}\n  <path d="M5 12l14 0" />\n  <path d="M5 12l6 6" />\n  <path d="M5 12l6 -6" />`,
    props,
  );
}

export function ArrowRight(props: StorefrontIconProps) {
  return base(
    `${SPACER}\n  <path d="M5 12l14 0" />\n  <path d="M13 18l6 -6" />\n  <path d="M13 6l6 6" />`,
    props,
  );
}

export function ArrowUpRight(props: StorefrontIconProps) {
  return base(
    `${SPACER}\n  <path d="M17 7l-10 10" />\n  <path d="M8 7l9 0l0 9" />`,
    props,
  );
}

export function Plus(props: StorefrontIconProps) {
  return base(
    `${SPACER}\n  <path d="M12 5l0 14" />\n  <path d="M5 12l14 0" />`,
    props,
  );
}

export function Minus(props: StorefrontIconProps) {
  return base(`${SPACER}\n  <path d="M5 12l14 0" />`, props);
}

export function Check(props: StorefrontIconProps) {
  return base(`${SPACER}\n  <path d="M5 12l5 5l10 -10" />`, props);
}

export function Star(props: StorefrontIconProps) {
  return base(
    `${SPACER}\n  <path d="M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873l-6.158 -3.245" />`,
    props,
  );
}

export function Truck(props: StorefrontIconProps) {
  return base(
    `${SPACER}\n  <path d="M5 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />\n  <path d="M15 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />\n  <path d="M5 17h-2v-11a1 1 0 0 1 1 -1h9v12m-4 0h6m4 0h2v-6h-8m0 -5h5l3 5" />`,
    props,
  );
}

export function Shield(props: StorefrontIconProps) {
  return base(
    `${SPACER}\n  <path d="M12 3l7 2.8v5.4c0 4.6 -3 7.9 -7 9.8c-4 -1.9 -7 -5.2 -7 -9.8v-5.4l7 -2.8" />`,
    props,
  );
}

export function ShieldCheck(props: StorefrontIconProps) {
  return base(
    `${SPACER}\n  <path d="M12 3l7 2.8v5.4c0 4.6 -3 7.9 -7 9.8c-4 -1.9 -7 -5.2 -7 -9.8v-5.4l7 -2.8" />\n  <path d="M9.5 12l2 2l3.5 -4" />`,
    props,
  );
}

export function Refresh(props: StorefrontIconProps) {
  return base(
    `${SPACER}\n  <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" />\n  <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />`,
    props,
  );
}

/* ------------------------------------------------------- registry + labels */

export const STOREFRONT_ICONS = {
  cart: Cart,
  search: Search,
  close: Close,
  "chevron-down": ChevronDown,
  "chevron-up": ChevronUp,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  "arrow-up-right": ArrowUpRight,
  plus: Plus,
  minus: Minus,
  check: Check,
  star: Star,
  truck: Truck,
  shield: Shield,
  "shield-check": ShieldCheck,
  refresh: Refresh,
} as const;

export type StorefrontIconName = keyof typeof STOREFRONT_ICONS;

export type BilingualLabel = { en: string; bn: string };

/**
 * Standalone-mark labels in both storefront locales. Widgets beside visible
 * text render the mark decorative; icon-only controls (cart button, dialog
 * close, quantity steppers) resolve their `aria-label` here.
 */
export const STOREFRONT_ICON_LABELS: Record<
  StorefrontIconName,
  BilingualLabel
> = {
  cart: { en: "Cart", bn: "কার্ট" },
  search: { en: "Search", bn: "খুঁজুন" },
  close: { en: "Close", bn: "বন্ধ করুন" },
  "chevron-down": { en: "Expand", bn: "প্রসারিত করুন" },
  "chevron-up": { en: "Collapse", bn: "সংকুচিত করুন" },
  "chevron-left": { en: "Previous", bn: "আগেরটি" },
  "chevron-right": { en: "Next", bn: "পরেরটি" },
  "arrow-left": { en: "Back", bn: "পেছনে" },
  "arrow-right": { en: "Continue", bn: "এগিয়ে যান" },
  "arrow-up-right": { en: "Open", bn: "খুলুন" },
  plus: { en: "Increase quantity", bn: "পরিমাণ বাড়ান" },
  minus: { en: "Decrease quantity", bn: "পরিমাণ কমান" },
  check: { en: "Selected", bn: "নির্বাচিত" },
  star: { en: "Rating", bn: "রেটিং" },
  truck: { en: "Delivery", bn: "ডেলিভারি" },
  shield: { en: "Secure", bn: "নিরাপদ" },
  "shield-check": { en: "Verified secure", bn: "যাচাইকৃত নিরাপদ" },
  refresh: { en: "Try again", bn: "আবার চেষ্টা করুন" },
};

export function storefrontIconLabel(
  name: StorefrontIconName,
  lang: "en" | "bn" = "en",
): string {
  return STOREFRONT_ICON_LABELS[name][lang];
}

export type StorefrontIconWrapperProps = StorefrontIconProps & {
  name: StorefrontIconName;
  /** Locale for the resolved `aria-label`. Defaults to English. */
  lang?: "en" | "bn";
} & ({ label: true; decorative?: false } | { label?: false; decorative: true });

/**
 * Labelled storefront mark. Pass `label` for a standalone mark (icon-only
 * button) so it renders `role="img"` with the bilingual label, or
 * `decorative` for a mark beside visible text so it renders `aria-hidden`.
 */
export function StorefrontIcon(
  props: StorefrontIconWrapperProps,
): ReactElement {
  const { name, lang = "en", size, strokeWidth, ...rest } = props;
  const labelled = "label" in rest && rest.label === true;
  const Component = STOREFRONT_ICONS[name];
  if (labelled) {
    const { label: _omit, decorative: _omitDecorative, ...svgProps } = rest;
    void _omit;
    void _omitDecorative;
    return (
      <Component
        size={size}
        strokeWidth={strokeWidth}
        role="img"
        aria-label={storefrontIconLabel(name, lang)}
        {...svgProps}
      />
    );
  }
  return (
    <Component
      size={size}
      strokeWidth={strokeWidth}
      aria-hidden="true"
      focusable="false"
      {...rest}
    />
  );
}
