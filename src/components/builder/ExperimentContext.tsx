/**
 * Phase 3.2 — experiment assignments for the per-section A/B slot.
 *
 * The storefront host supplies the visitor's assignments (from
 * `experiment_assignments`); the studio supplies a preview map. A section with
 * no assignment renders — control behaviour — so a half-configured experiment
 * never blanks a page.
 */
import { createContext, useContext, useEffect, useRef } from "react";

export type ExperimentValue = {
  /** experiment key -> assigned variant key. Null while unknown (SSR). */
  assignments: Record<string, string> | null;
  /** Records an exposure at most once per section per page view. */
  onExposure?: (experiment: string, variant: string, sectionId: string) => void;
};

const ExperimentContext = createContext<ExperimentValue>({ assignments: null });

export const ExperimentProvider = ExperimentContext.Provider;

export function useExperiments(): ExperimentValue {
  return useContext(ExperimentContext);
}

/** Fires one exposure per section per view; a repeat render is a no-op. */
export function useExposure(
  ab: { experiment: string; variant: string } | undefined,
  sectionId: string,
  active: boolean,
) {
  const { onExposure } = useExperiments();
  const fired = useRef(false);
  useEffect(() => {
    if (!active || fired.current || !ab?.experiment || !onExposure) return;
    fired.current = true;
    onExposure(ab.experiment, ab.variant, sectionId);
  }, [active, ab?.experiment, ab?.variant, sectionId, onExposure]);
}
