/**
 * Phase 2.6 — cm / in toggle for the size guide.
 *
 * Measurements are authored once in centimetres; the toggle is a pure display
 * conversion, so a merchant never maintains two tables. The control is a real
 * radio group so screen readers announce the active unit.
 */
export type SizeUnit = "cm" | "in";

/** Centimetres → the requested unit, rounded to one decimal for inches. */
export function convertCm(valueCm: number, unit: SizeUnit): number {
  if (!Number.isFinite(valueCm)) return 0;
  if (unit === "cm") return Math.round(valueCm * 10) / 10;
  return Math.round((valueCm / 2.54) * 10) / 10;
}

export function UnitToggle({
  unit,
  onChange,
  label,
}: {
  unit: SizeUnit;
  onChange: (next: SizeUnit) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-fq-md border border-border p-0.5">
      {(["cm", "in"] as SizeUnit[]).map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={unit === option}
          onClick={() => onChange(option)}
          className={[
            "min-h-11 rounded-fq-sm px-3 text-sm",
            unit === option ? "bg-primary text-primary-foreground" : "text-muted-foreground",
          ].join(" ")}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
