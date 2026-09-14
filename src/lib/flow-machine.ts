/**
 * Phase 1.4 — the quiz / multi-step flow primitive.
 *
 * Pure state: no React, no storage, no network. `skin_quiz`, `shade_finder`
 * and `trade_in` are all the same machine with a different step list, and the
 * result is always a shareable filter URL rather than hidden client state.
 */

export type FlowChoice = { value: string; label: string };

export type FlowStep = {
  key: string;
  /** Answers the shopper may pick. Empty = free text. */
  choices: FlowChoice[];
  /** Multi-select steps collect an array of values. */
  multiple?: boolean;
  required?: boolean;
};

export type FlowAnswers = Record<string, string[]>;

export type FlowState = {
  index: number;
  answers: FlowAnswers;
  done: boolean;
};

export function startFlow(): FlowState {
  return { index: 0, answers: {}, done: false };
}

/** True when the current step's requirement is satisfied. */
export function canAdvance(steps: FlowStep[], state: FlowState): boolean {
  const step = steps[state.index];
  if (!step) return false;
  if (!step.required) return true;
  return (state.answers[step.key] ?? []).length > 0;
}

/** 0–100, for a progress bar with an accessible value. */
export function progressOf(steps: FlowStep[], state: FlowState): number {
  if (steps.length === 0) return 100;
  const answered = steps.filter((s) => (state.answers[s.key] ?? []).length > 0).length;
  return Math.round((answered / steps.length) * 100);
}

export type FlowEvent =
  | { kind: "answer"; step: string; value: string }
  | { kind: "next" }
  | { kind: "back" }
  | { kind: "reset" };

export function flowReducer(steps: FlowStep[], state: FlowState, event: FlowEvent): FlowState {
  switch (event.kind) {
    case "answer": {
      const step = steps.find((s) => s.key === event.step);
      if (!step) return state;
      const current = state.answers[event.step] ?? [];
      const next = step.multiple
        ? current.includes(event.value)
          ? current.filter((v) => v !== event.value)
          : [...current, event.value]
        : [event.value];
      return { ...state, answers: { ...state.answers, [event.step]: next } };
    }
    case "next": {
      if (!canAdvance(steps, state)) return state;
      const index = state.index + 1;
      return index >= steps.length
        ? { ...state, index: steps.length - 1, done: true }
        : { ...state, index };
    }
    case "back":
      return { ...state, done: false, index: Math.max(0, state.index - 1) };
    case "reset":
      return startFlow();
  }
}

/**
 * Result mapping: answers become query parameters on a storefront search URL,
 * so a quiz result is linkable, indexable and back-button safe.
 */
export function flowResultUrl(base: string, answers: FlowAnswers): string {
  const params = new URLSearchParams();
  for (const key of Object.keys(answers).sort()) {
    const values = answers[key] ?? [];
    if (values.length) params.set(key, values.slice().sort().join(","));
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}
