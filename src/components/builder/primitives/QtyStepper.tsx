/**
 * Phase 2.5 — quantity stepper.
 *
 * 44px touch targets, a real number input for keyboards and assistive tech,
 * and no money anywhere: the stepper reports a quantity and the server
 * re-prices. Stock is a hard ceiling supplied by the server row.
 */
export function QtyStepper({
  value,
  max,
  label,
  locale,
  onChange,
  disabled = false,
}: {
  value: number;
  max?: number;
  label: string;
  locale: "en" | "bn";
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  const ceiling = Math.max(1, Math.min(max ?? 99, 99));
  const set = (next: number) => {
    if (disabled) return;
    onChange(Math.max(0, Math.min(ceiling, next)));
  };
  const btn =
    "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-fq-md border border-border text-base leading-none disabled:opacity-50";
  return (
    <div className="inline-flex items-center gap-1" role="group" aria-label={label}>
      <button
        type="button"
        className={btn}
        onClick={() => set(value - 1)}
        disabled={disabled || value <= 0}
        aria-label={locale === "bn" ? "একটি কমান" : "Decrease quantity"}
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={ceiling}
        value={value}
        disabled={disabled}
        onChange={(event) => set(Number(event.target.value))}
        aria-label={label}
        className="h-11 w-14 rounded-fq-md border border-border bg-background text-center text-sm tabular-nums"
      />
      <button
        type="button"
        className={btn}
        onClick={() => set(value + 1)}
        disabled={disabled || value >= ceiling}
        aria-label={locale === "bn" ? "একটি বাড়ান" : "Increase quantity"}
      >
        +
      </button>
    </div>
  );
}
