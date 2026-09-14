/**
 * Phase 2.5 — step trail.
 *
 * One implementation for the checkout progress bar and the order status
 * timeline: an ordered list with `aria-current="step"` on the active node and
 * a text status for every state, so nothing depends on an icon or a colour.
 */
export type TrailStep = {
  key: string;
  label: string;
  href?: string;
  /** Optional per-step detail (e.g. a courier reference or a timestamp). */
  detail?: string;
};

export function StepTrail({
  steps,
  activeIndex,
  orientation = "horizontal",
  numbered = true,
  locale,
}: {
  steps: TrailStep[];
  activeIndex: number;
  orientation?: "horizontal" | "vertical";
  numbered?: boolean;
  locale: "en" | "bn";
}) {
  const done = locale === "bn" ? "সম্পন্ন" : "Completed";
  const current = locale === "bn" ? "চলমান" : "Current step";
  const upcoming = locale === "bn" ? "বাকি" : "Upcoming";
  return (
    <ol
      className={
        orientation === "vertical"
          ? "m-0 list-none space-y-4 p-0"
          : "m-0 flex list-none flex-wrap items-center gap-x-4 gap-y-2 p-0"
      }
    >
      {steps.map((step, index) => {
        const state = index < activeIndex ? "done" : index === activeIndex ? "current" : "todo";
        const label = (
          <span className="flex items-center gap-2">
            {numbered && (
              <span
                aria-hidden="true"
                className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs tabular-nums ${
                  state === "todo"
                    ? "border-border text-muted-foreground"
                    : "border-primary bg-primary text-primary-foreground"
                }`}
              >
                {index + 1}
              </span>
            )}
            <span className="min-w-0 break-words">
              <span className={state === "todo" ? "text-muted-foreground" : "font-medium"}>{step.label}</span>
              {step.detail && <span className="block text-xs text-muted-foreground">{step.detail}</span>}
            </span>
            <span className="sr-only">
              {state === "done" ? done : state === "current" ? current : upcoming}
            </span>
          </span>
        );
        return (
          <li key={step.key} aria-current={state === "current" ? "step" : undefined} className="min-w-0">
            {/* Only completed steps link backwards; the future is not navigable. */}
            {step.href && state === "done" ? (
              <a href={step.href} className="inline-flex min-h-11 items-center underline-offset-2 hover:underline">
                {label}
              </a>
            ) : (
              <span className="inline-flex min-h-11 items-center">{label}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
