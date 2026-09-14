/**
 * Phase 2.8 — the quiz shell.
 *
 * Renders whatever `quiz-flow.ts` says the current step is: prompt, options as
 * real radios/checkboxes, progress, and back/next. Keyboard-complete by
 * construction because every control is a native input or button — no
 * div-with-onClick anywhere in a guided-selling flow.
 */
import type { QuizState, QuizStep } from "@/lib/quiz-flow";
import { answersFor, canAdvance, quizProgress } from "@/lib/quiz-flow";

export function StepFlow({
  steps,
  state,
  onAnswer,
  onBack,
  onNext,
  labels,
  children,
}: {
  steps: QuizStep[];
  state: QuizState;
  onAnswer: (step: QuizStep, value: string) => void;
  onBack: () => void;
  onNext: () => void;
  labels: { back: string; next: string; finish: string; progress: string };
  /** Rendered instead of a step once the flow is finished. */
  children?: React.ReactNode;
}) {
  const step = steps[state.index];
  const progress = quizProgress(state, steps);

  return (
    <div>
      <div
        role="progressbar"
        aria-label={labels.progress}
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1 w-full overflow-hidden rounded-full bg-muted"
      >
        <span className="block h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
      </div>

      {step ? (
        <fieldset className="mt-4 border-0 p-0">
          <legend className="mb-2 text-sm font-medium">{step.prompt}</legend>
          <div className="flex flex-wrap gap-2">
            {step.options.map((option) => {
              const chosen = answersFor(state, step.key).includes(option.value);
              return (
                <label
                  key={option.value}
                  className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full border px-3 text-sm ${
                    chosen ? "border-primary ring-1 ring-primary" : "border-border"
                  }`}
                >
                  <input
                    type={step.multi ? "checkbox" : "radio"}
                    name={step.key}
                    value={option.value}
                    checked={chosen}
                    onChange={() => onAnswer(step, option.value)}
                    className="h-4 w-4"
                  />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              disabled={state.index === 0}
              className="min-h-[44px] rounded-full border border-border px-4 text-sm disabled:opacity-40"
            >
              {labels.back}
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!canAdvance(state, steps)}
              className="min-h-[44px] rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-40"
            >
              {state.index === steps.length - 1 ? labels.finish : labels.next}
            </button>
          </div>
        </fieldset>
      ) : (
        <div className="mt-4">{children}</div>
      )}
    </div>
  );
}
