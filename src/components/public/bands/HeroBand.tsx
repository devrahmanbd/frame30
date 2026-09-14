import { PUBLIC_BANGLA_ENABLED } from "@/lib/public-locale";
/**
 * HeroBand — the first paint of every marketing route.
 *
 * The headline is the LCP element on all 11 pages, so it renders as plain SSR
 * text with no entrance animation and no gradient mask: motion or a mask on the
 * LCP node costs paint time and, on a mid-range Android over a 3G link in
 * Dhaka, that is the difference between a 1.8s and a 3s LCP. Atmosphere is the
 * aurora field *behind* the text, which is composited and free.
 *
 * Bangla variants render inside `lang="bn"` so the display tracking resets to
 * 0 and matras never clip — a latin -4.2% tracking on Bangla is unreadable.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Band, Chip } from "./Band";

export type HeroBandProps = {
  /** Small glass pill above the headline. */
  eyebrow?: ReactNode;
  title: ReactNode;
  /** Bangla headline shown under the latin one when the page ships both. */
  titleBn?: ReactNode;
  sub?: ReactNode;
  subBn?: ReactNode;
  /** Primary CTA first, low-commitment CTA second. Exactly two, by contract. */
  actions?: ReactNode;
  /** One line of checkable proof under the CTAs — never an invented number. */
  proof?: ReactNode;
  /** Optional visual (product mock, diagram) rendered to the right at ≥1024px. */
  visual?: ReactNode;
  align?: "left" | "center";
  id?: string;
  className?: string;
};

export function HeroBand({
  eyebrow,
  title,
  titleBn,
  sub,
  subBn,
  actions,
  proof,
  visual,
  align = visual ? "left" : "center",
  id = "hero-title",
  className,
}: HeroBandProps) {
  const centred = align === "center" && !visual;

  return (
    <Band
      surface="aurora"
      /* §10.4: the hero is the one drifting field on the page. The headline
         itself stays static — the atmosphere behind it moves, the LCP text
         never does. */
      drift
      labelledBy={id}
      className={cn("min-h-screen flex flex-col justify-center", className)}
      innerClassName="pt-16 pb-12 sm:pt-20 sm:pb-16 md:pt-24 md:pb-20 lg:py-28"
    >
      <div
        className={cn(
          "grid items-center gap-8 md:gap-10 lg:gap-12 w-full",
          visual
            ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"
            : "grid-cols-1",
        )}
      >
        <div className={cn(centred && "mx-auto max-w-3xl text-center")}>
          {eyebrow ? <Chip className="mb-4 sm:mb-6">{eyebrow}</Chip> : null}

          <h1 className="fq-display text-[clamp(2.15rem,5.2vw,4.25rem)] leading-[1.12] tracking-tight [overflow-wrap:anywhere]">
            <span className="bg-gradient-to-br from-foreground to-muted-foreground/60 bg-clip-text text-transparent">
              {title}
            </span>
          </h1>
          {/* The Bangla twin is governed by the one public-locale flag, like
              <Bn>, so callers can keep passing copy while the public site is
              English-only. */}
          {PUBLIC_BANGLA_ENABLED && titleBn ? (
            <p
              lang="bn"
              data-type-role="display"
              className="fq-display mt-2.5 text-[clamp(1.75rem,4.5vw,2.5rem)] leading-[1.4] text-muted-foreground [letter-spacing:0] [overflow-wrap:anywhere]"
            >
              {titleBn}
            </p>
          ) : null}

          {sub ? (
            <p
              data-type-role="lead"
              className={cn(
                "mt-4 sm:mt-6 text-base sm:text-lg text-muted-foreground leading-relaxed",
                centred ? "mx-auto max-w-2xl" : "fq-measure",
              )}
            >
              {sub}
            </p>
          ) : null}
          {PUBLIC_BANGLA_ENABLED && subBn ? (
            <p
              lang="bn"
              data-type-role="lead"
              className={cn("mt-2 text-sm sm:text-base text-muted-foreground leading-relaxed", !centred && "fq-measure")}
            >
              {subBn}
            </p>
          ) : null}

          {actions ? (
            <div
              className={cn(
                "mt-6 sm:mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 [&>*]:w-full [&>*]:sm:w-auto [&>*]:min-h-[44px] [&>*]:flex [&>*]:items-center [&>*]:justify-center [&>*]:text-center [&>*]:px-6 [&>*]:py-3",
                centred && "sm:justify-center",
              )}
            >
              {actions}
            </div>
          ) : null}

          {proof ? (
            <p
              data-type-role="caption"
              className={cn("mt-5 sm:mt-6 text-xs sm:text-sm text-muted-foreground leading-relaxed", centred && "mx-auto max-w-xl")}
            >
              {proof}
            </p>
          ) : null}
        </div>

        {visual ? <div className="w-full min-w-0 flex items-center justify-center">{visual}</div> : null}
      </div>
    </Band>
  );
}
