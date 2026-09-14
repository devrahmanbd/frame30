/**
 * Phase 2.8 — swatch on skin.
 *
 * A lipstick swatch on white lies. This shows the same colour against three
 * skin-tone backdrops so a shopper can judge it against something close to
 * their own. Tones come from tokens, never hardcoded hex, and each panel is
 * labelled — the colour is never the only carrier of meaning.
 */
import { swatchStyle, type SwatchValue } from "./SwatchDot";

export const SKIN_TONES = [
  { key: "tone-1", token: "--fq-skin-tone-1", en: "Fair", bn: "ফর্সা" },
  { key: "tone-2", token: "--fq-skin-tone-2", en: "Medium", bn: "মাঝারি" },
  { key: "tone-3", token: "--fq-skin-tone-3", en: "Deep", bn: "গাঢ়" },
] as const;

export function SkinToneBackdrop({
  value,
  label,
  toneLabels,
}: {
  value: SwatchValue;
  label: string;
  /** Localised tone names, in the order of SKIN_TONES. */
  toneLabels: string[];
}) {
  return (
    <ul className="m-0 flex list-none gap-2 p-0" aria-label={label}>
      {SKIN_TONES.map((tone, index) => (
        <li key={tone.key} className="min-w-0 flex-1 text-center">
          <span
            className="flex h-12 items-center justify-center rounded-fq-md border border-border"
            style={{ backgroundColor: `var(${tone.token}, hsl(var(--muted)))` }}
          >
            <span
              className="h-7 w-7 rounded-full border border-border"
              style={swatchStyle(value)}
              aria-hidden="true"
            />
          </span>
          <span className="mt-1 block text-[11px] text-muted-foreground">
            {toneLabels[index] ?? tone.en}
          </span>
        </li>
      ))}
    </ul>
  );
}
