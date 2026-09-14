/**
 * Phase 2.3 — variant swatch primitive.
 *
 * Renders a hex, gradient or image swatch with an always-present text label
 * for screen readers, so a colour is never the only carrier of meaning.
 */
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export type SwatchValue = { hex?: string; gradient?: string; image?: string };

/** Only safe, self-authored swatch values reach inline styles. */
export function swatchStyle(value: SwatchValue): React.CSSProperties {
  if (value.image) return { backgroundImage: `url(${JSON.stringify(value.image)})`, backgroundSize: "cover" };
  if (value.gradient && /^linear-gradient\([^;"']*\)$/.test(value.gradient)) {
    return { backgroundImage: value.gradient };
  }
  if (value.hex && HEX.test(value.hex)) return { backgroundColor: value.hex };
  return { backgroundColor: "hsl(var(--muted))" };
}

export function SwatchDot({
  value,
  label,
  selected = false,
  disabled = false,
  onSelect,
}: {
  value: SwatchValue;
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      disabled={disabled}
      onClick={onSelect}
      className={`flex items-center gap-2 rounded-fq-md border px-2 py-1 text-xs ${
        selected ? "border-primary ring-1 ring-primary" : "border-border"
      } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
    >
      <span className="h-4 w-4 rounded-full border border-border" style={swatchStyle(value)} aria-hidden="true" />
      <span className="truncate">{label}</span>
    </button>
  );
}
