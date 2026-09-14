/**
 * Phase 2.8 — the shared multi-step flow engine.
 *
 * One pure state machine behind `shade_finder`, `skin_quiz` and any later
 * guided-selling widget. It owns steps, answers, validation and progress, and
 * nothing else: no React, no fetch, no theme.
 *
 * The result is deliberately **a URL, not a modal**. A quiz that ends in a
 * saved filter is shareable, crawlable and survives a refresh; a quiz that
 * ends in a dead-end results panel does not.
 */
import { facetHref, withFacet, type FacetKey } from "./facet-url";
import { normalizeSearchParams, type SearchParams } from "./storefront-search";

export type QuizOption = { value: string; label: string };

export type QuizStep = {
  key: string;
  /** Question text, already localised by the caller. */
  prompt: string;
  options: QuizOption[];
  /** Multi-select steps collect a set; single-select collects one value. */
  multi?: boolean;
  /** A step may be skippable; required steps block Next until answered. */
  required?: boolean;
};

export type QuizAnswers = Record<string, string[]>;

export type QuizState = {
  index: number;
  answers: QuizAnswers;
};

export const emptyQuizState: QuizState = { index: 0, answers: {} };

export function answersFor(state: QuizState, key: string): string[] {
  return state.answers[key] ?? [];
}

/** Toggles a value on the given step, honouring single vs multi select. */
export function answerStep(state: QuizState, step: QuizStep, value: string): QuizState {
  const current = answersFor(state, step.key);
  const next = step.multi
    ? current.includes(value)
      ? current.filter((entry) => entry !== value)
      : [...current, value]
    : current[0] === value
      ? []
      : [value];
  return { ...state, answers: { ...state.answers, [step.key]: next } };
}

/** A required step is satisfied once it holds at least one answer. */
export function isStepComplete(state: QuizState, step: QuizStep): boolean {
  if (step.required === false) return true;
  return answersFor(state, step.key).length > 0;
}

export function canAdvance(state: QuizState, steps: QuizStep[]): boolean {
  const step = steps[state.index];
  return !!step && isStepComplete(state, step);
}

export function goNext(state: QuizState, steps: QuizStep[]): QuizState {
  if (!canAdvance(state, steps)) return state;
  return { ...state, index: Math.min(state.index + 1, steps.length) };
}

export function goBack(state: QuizState): QuizState {
  return { ...state, index: Math.max(0, state.index - 1) };
}

/** True once the shopper has walked past the last step. */
export function isFinished(state: QuizState, steps: QuizStep[]): boolean {
  return state.index >= steps.length;
}

/** Progress as a whole percentage, for the progress bar and its aria value. */
export function quizProgress(state: QuizState, steps: QuizStep[]): number {
  if (steps.length === 0) return 100;
  const done = steps.filter((step) => isStepComplete(state, step)).length;
  return Math.round((done / steps.length) * 100);
}

/**
 * Maps answers onto search facets. Only steps declared in `mapping` reach the
 * URL, so a quiz can ask a question purely for copy without polluting the
 * result link.
 */
export function resultParams(
  state: QuizState,
  mapping: Partial<Record<string, FacetKey>>,
  base?: Partial<SearchParams>,
): SearchParams {
  let params = normalizeSearchParams(base ?? {});
  for (const [stepKey, facet] of Object.entries(mapping)) {
    if (!facet) continue;
    const value = answersFor(state, stepKey)[0];
    if (value) params = withFacet(params, facet, value);
  }
  return params;
}

/** The shareable, SSR-able link a finished quiz hands back. */
export function resultHref(
  basePath: string,
  state: QuizState,
  mapping: Partial<Record<string, FacetKey>>,
  base?: Partial<SearchParams>,
): string {
  return facetHref(basePath, resultParams(state, mapping, base));
}
