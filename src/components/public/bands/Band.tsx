/**
 * Band — the section chassis every marketing band sits in.
 *
 * Why a chassis at all: the artboard system in `/DESIGN.md` is enforced by
 * rhythm, not by decoration. If each page hand-rolls its padding and container
 * the vertical rhythm drifts within two pages and the site reads like a
 * template again. So one component owns the container width (1200px), the
 * section rhythm (112px desktop / 72px mobile) and the three legal surfaces.
 *
 * Surfaces are semantic tokens only — no colour utility is ever written in a
 * band. `canvas` is the page background, `glass` is the blurred 4% white
 * surface with a 1px light edge, `aurora` adds the low-alpha gradient field
 * behind the content (never as a fill).
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ElementType,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { useMotionIntent } from "@/lib/motion-runtime";
import { auditSurfaceOrder, formatFinding, type RhythmSurface } from "@/lib/site-rhythm";

export type BandSurface = RhythmSurface;
export type BandWidth = "default" | "narrow" | "wide";

export type BandProps = {
  children: ReactNode;
  /** Rendered element. Sections default to `<section>`; footers can pass `div`. */
  as?: ElementType;
  surface?: BandSurface;
  width?: BandWidth;
  /** Hairline rule above the band. Use sparingly — two in a row reads as a grid. */
  divided?: boolean;
  /** Tighten the rhythm when two bands are conceptually one unit. */
  tight?: boolean;
  /**
   * Phase 10.4: opt the aurora field into the 24–38s drift loop. Only the hero
   * band asks for it, and only ever one per viewport — the drift is atmosphere,
   * and a second drifting field turns atmosphere into activity. Ignored on
   * non-aurora surfaces and resolved to off until motion intent is `full`,
   * which means it is also off during SSR and before hydration.
   */
  drift?: boolean;
  id?: string;
  /** id of the band's heading; required whenever the band has one. */
  labelledBy?: string;
  className?: string;
  innerClassName?: string;
};

/**
 * Phase 10.3: widths and paddings are CSS utilities backed by the `.fq-site`
 * rhythm tokens, not per-band Tailwind values. `src/lib/site-rhythm.ts` owns
 * the numbers and `site-rhythm.test.ts` asserts the stylesheet still matches
 * them, so a band can no longer opt out of the artboard by re-typing a class.
 */
const WIDTHS: Record<BandWidth, string> = {
  narrow: "fq-band-inner-narrow",
  default: "",
  wide: "fq-band-inner-wide",
};

/* -------------------------------------------------------------------------- */
/* Surface-order enforcement                                                  */
/* -------------------------------------------------------------------------- */

type SequenceSink = {
  register: (entry: { surface: BandSurface; label: string }) => void;
};

const SequenceCtx = createContext<SequenceSink | null>(null);

/**
 * Wraps a route's band list so the "never two glass surfaces stacked without a
 * canvas band between them" rule is checked against what actually rendered.
 *
 * Deliberately advisory: it logs coded findings in development and is inert in
 * production. A design rule must never be able to blank a marketing page for a
 * visitor, and the blocking version of this same check runs in the release gate
 * (`scripts/rhythm-gate.mjs`), which shares the auditor in `site-rhythm.ts`.
 */
export function BandSequence({ route, children }: { route: string; children: ReactNode }) {
  const entries = useRef<{ surface: BandSurface; label: string }[]>([]);
  // A fresh render pass must not append to the previous pass's list.
  entries.current = [];
  const sink = useMemo<SequenceSink>(
    () => ({ register: (entry) => entries.current.push(entry) }),
    [],
  );

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const findings = auditSurfaceOrder(entries.current, route);
    for (const f of findings) {
      // eslint-disable-next-line no-console -- development-only design gate
      console.warn(`[rhythm] ${formatFinding(f)}`);
    }
  });

  return <SequenceCtx.Provider value={sink}>{children}</SequenceCtx.Provider>;
}

export function Band({
  children,
  as: Tag = "section",
  surface = "canvas",
  width = "default",
  divided = false,
  tight = false,
  drift = false,
  id,
  labelledBy,
  className,
  innerClassName,
}: BandProps) {
  const sequence = useContext(SequenceCtx);
  sequence?.register({ surface, label: id ?? labelledBy ?? String(Tag) });

  // Intent is resolved client-side and is `off` until hydration, so the SSR
  // HTML never carries `data-band-drift="true"`: nothing above the fold moves
  // before hydration, which is TODO §10.4's fourth rule.
  const intent = useMotionIntent();
  const drifting = drift && surface === "aurora" && intent === "full";

  return (
    <Tag
      id={id}
      aria-labelledby={labelledBy}
      data-band-surface={surface}
      data-band-width={width}
      data-band-density={tight ? "tight" : "section"}
      data-band-drift={drifting ? "true" : undefined}
      className={cn(
        "relative w-full",
        surface === "aurora" && "fq-aurora",
        divided && "border-t border-border",
        className,
      )}
    >
      <div
        data-band-inner=""
        className={cn(
          "fq-band-inner",
          WIDTHS[width],
          tight ? "fq-band-tight" : "fq-band",
          innerClassName,
        )}
      >
        {children}
      </div>
    </Tag>
  );
}

/**
 * BandHeading — the h2 + sub pair that opens almost every band.
 *
 * Heading level is a prop because `/docs` and `/security` nest bands one level
 * deeper; the default stays `h2` so the one-H1-per-page rule holds by default
 * rather than by review.
 */
export type BandHeadingProps = {
  id?: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  level?: 2 | 3;
  align?: "left" | "center";
  className?: string;
};

export function BandHeading({
  id,
  eyebrow,
  title,
  sub,
  level = 2,
  align = "left",
  className,
}: BandHeadingProps) {
  const Tag = (level === 3 ? "h3" : "h2") as ElementType;
  return (
    <div className={cn(align === "center" && "mx-auto text-center", "max-w-3xl", className)}>
      {eyebrow ? (
        <p
          data-band-eyebrow=""
          className="mb-4 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
        >
          {eyebrow}
        </p>
      ) : null}
      <Tag
        id={id}
        className={cn("fq-display", level === 3 ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl")}
      >
        {title}
      </Tag>
      {sub ? (
        <p
          data-type-role="body"
          className={cn("mt-4 text-base text-muted-foreground", align === "left" && "fq-measure")}
        >
          {sub}
        </p>
      ) : null}
    </div>
  );
}

/** Glass pill used for eyebrows, proof chips and status labels. */
export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "fq-glass inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium",
        className,
      )}
    >
      {children}
    </span>
  );
}
