/**
 * `UiStill` — the only way a screenshot reaches the marketing surface (§10.5).
 *
 * Why a component rather than an `<img>` per route:
 *
 *  • **The contract is one place.** AVIF → WebP → PNG in that order, explicit
 *    intrinsic dimensions so the box is reserved before a byte arrives, `sizes`
 *    derived from the layout width the registry declares, eager + high priority
 *    only for a still the registry marks as above the fold. Copy that into six
 *    routes and by the third one someone omits `height` and ships CLS.
 *
 *  • **Alt text is bilingual and mandatory.** It comes from `UI_STILLS`, not
 *    from the call site, so a Bangla reader gets a Bangla description of the
 *    admin they are looking at.
 *
 *  • **A missing file must degrade, never blank out a band.** The capture
 *    script can legitimately fail (no admin session in CI, an admin route
 *    behind a migration). When the image cannot decode we render the glass
 *    frame with its caption and an `aria-label`, so the band keeps its rhythm
 *    and the reader still learns what the screenshot would have shown. In
 *    development we also log once per asset, because a silent placeholder is
 *    how a broken screenshot survives to production.
 *
 * The `data-still` / `data-asset-*` attributes exist for `scripts/asset-gate.mjs`:
 * the gate audits the declared contract instead of guessing which `<img>` on the
 * page was meant to be a product still.
 */
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";
import { uiStill, stillSources, stillSizes, STILLS } from "@/lib/marketing-assets";
import { stillCaptured } from "@/lib/still-manifest";

const warned = new Set<string>();

export type UiStillProps = {
  /** Registry id. Unknown ids throw at render time in development. */
  id: string;
  /** Caption under the frame. Also the fallback text when the file is missing. */
  caption?: ReactNode;
  /** Overrides the registry's fold assumption for a route that places it lower. */
  priority?: boolean;
  className?: string;
  frameClassName?: string;
};

export function UiStill({ id, caption, priority, className, frameClassName }: UiStillProps) {
  const { t } = useLang();
  const [failed, setFailed] = useState(false);

  // An unknown id is a programming error, and it should be loud in dev and
  // harmless in production — a thrown render on a marketing page is worse than
  // a missing screenshot.
  let spec: ReturnType<typeof uiStill> | null = null;
  try {
    spec = uiStill(id);
  } catch (error) {
    if (import.meta.env.DEV) throw error;
    return null;
  }

  /**
   * A still that was never captured must not be requested.
   *
   * `stillCaptured` comes from the generated manifest (`src/lib/still-manifest.ts`),
   * so an uncaptured id renders the fallback frame on the first paint instead of
   * firing AVIF + WebP + PNG requests that 404 and only then reach `onError`.
   * That request storm was showing up intermittently on every route carrying an
   * admin still.
   */
  const missing = !stillCaptured(spec.id);
  const showFallback = failed || missing;

  const eager = priority ?? spec.priority;
  const alt = t(spec.alt.en, spec.alt.bn);
  const sources = stillSources(spec);
  const fallback = sources.find((s) => s.fallback)!;
  const modern = sources.filter((s) => !s.fallback);

  const onError = () => {
    setFailed(true);
    if (import.meta.env.DEV && !warned.has(spec!.id)) {
      warned.add(spec!.id);
      // eslint-disable-next-line no-console
      console.warn(
        `[ui-still] "${spec!.id}" failed to load (${fallback.src}). ` +
          `Run \`bun run assets:stills --only ${spec!.id}\` to capture it.`,
      );
    }
  };

  return (
    <figure
      className={cn("m-0", className)}
      data-still={spec.id}
      data-asset-state={showFallback ? "fallback" : "ok"}
      data-asset-missing={missing ? "true" : undefined}
    >
      <div
        className={cn(
          "fq-glass relative overflow-hidden rounded-[var(--fq-radius-lg,18px)]",
          frameClassName,
        )}
        style={{ aspectRatio: `${spec.intrinsic.width} / ${spec.intrinsic.height}` }}
      >
        {showFallback ? (
          <div
            role="img"
            aria-label={alt}
            data-still-fallback={spec.id}
            className="flex h-full w-full items-center justify-center px-6 text-center"
          >
            <span data-type-role="caption" className="text-[var(--fq-muted,inherit)]">
              {caption ?? alt}
            </span>
          </div>
        ) : (
          <picture>
            {modern.map((source) => (
              <source
                key={source.format}
                type={source.type}
                srcSet={source.src}
                sizes={stillSizes(spec!)}
              />
            ))}
            <img
              src={fallback.src}
              alt={alt}
              width={spec.intrinsic.width}
              height={spec.intrinsic.height}
              sizes={stillSizes(spec)}
              loading={eager ? "eager" : "lazy"}
              decoding={eager ? "sync" : "async"}
              // eslint-disable-next-line react/no-unknown-property
              fetchPriority={eager ? "high" : "auto"}
              draggable={false}
              onError={onError}
              data-asset-dpr={STILLS.dpr}
              className="block h-full w-full object-cover object-top"
            />
          </picture>
        )}
      </div>
      {caption ? (
        <figcaption data-type-role="caption" className="mt-3 text-[var(--fq-muted,inherit)]">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
