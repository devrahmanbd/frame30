/**
 * Phase 7.3 — one placeholder renderer for every data widget.
 *
 * The shape comes from `skeletonSpec(type)`, so the reserved box always
 * matches what the resolved rows will draw. Purely presentational and
 * `aria-hidden`: assistive tech announces the loaded content, not the box.
 */
import { skeletonSpec, type SkeletonSpec } from "@/lib/widget-skeletons";
import type { SectionType } from "@/lib/builder-ast";

function Block({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-fq-md bg-muted ${className}`} />;
}

export function WidgetSkeleton({ spec }: { spec: SkeletonSpec }) {
  if (spec.kind === "cards") {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4" aria-hidden="true">
        {Array.from({ length: spec.count }, (_, i) => (
          <div key={i} className="space-y-2">
            <Block className={spec.ratio ?? "aspect-[3/4]"} />
            <Block className="h-4 w-3/4" />
            <Block className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (spec.kind === "media") {
    return (
      <div aria-hidden="true">
        <Block className={spec.ratio ?? "aspect-square"} />
      </div>
    );
  }

  if (spec.kind === "chips") {
    return (
      <div className="flex flex-wrap gap-2" aria-hidden="true">
        {Array.from({ length: spec.count }, (_, i) => (
          <Block key={i} className="h-11 w-20" />
        ))}
      </div>
    );
  }

  if (spec.kind === "table") {
    return (
      <div className="space-y-2" aria-hidden="true">
        {Array.from({ length: spec.count }, (_, i) => (
          <div key={i} className="grid grid-cols-2 gap-3">
            <Block className="h-5 w-2/3" />
            <Block className="h-5 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: spec.count }, (_, i) => (
        <Block key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

/** Convenience wrapper for renderers that only know their own section type. */
export function NodeSkeleton({ type }: { type: SectionType }) {
  const spec = skeletonSpec(type);
  if (!spec) return null;
  return <WidgetSkeleton spec={spec} />;
}
