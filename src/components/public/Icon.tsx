/**
 * `Icon` — the marketing surface's only icon primitive (§10.5 bullet 2).
 *
 * The rule is "single local lucide sprite, `aria-label` per standalone mark",
 * and both halves matter:
 *
 *  • **Single sprite.** Importing `lucide-react` into a public page ships a
 *    React component per mark and re-renders SVG paths the browser could have
 *    cached once. `<use href="/media/icons/sprite.svg#truck">` is one cached
 *    request for the whole site, and it keeps the public bundle free of an icon
 *    library. `scripts/build-icon-sprite.mjs` builds the file from `ICON_NAMES`.
 *
 *  • **Labelling is explicit, not accidental.** A mark that carries meaning on
 *    its own (an icon-only link) must be labelled; a mark beside a text label
 *    must be hidden, or a screen reader announces the concept twice. So the API
 *    forces the choice: pass `label`, or pass `decorative`. Passing neither is a
 *    development-time console error rather than a silent a11y regression, and
 *    the icon still renders hidden so the page does not break.
 *
 * `data-icon` / `data-icon-standalone` are read by `scripts/asset-gate.mjs`.
 */
import { cn } from "@/lib/utils";
import { iconHref, isIconName, type IconName } from "@/lib/marketing-assets";

type Base = {
  name: IconName;
  /** Rendered size in px, both axes. The sprite is on a 24px grid. */
  size?: number;
  className?: string;
  strokeWidth?: number;
};

export type IconProps = Base &
  (
    | { label: string; decorative?: false }
    | { decorative: true; label?: never }
  );

export function Icon({ name, size = 20, className, strokeWidth, ...rest }: IconProps) {
  const label = "label" in rest ? rest.label : undefined;
  const decorative = "decorative" in rest ? rest.decorative === true : false;
  const standalone = Boolean(label) && !decorative;

  if (import.meta.env.DEV) {
    if (!isIconName(name)) {
      // eslint-disable-next-line no-console
      console.error(
        `[icon] "${name}" is not in ICON_NAMES, so the sprite has no symbol for it. ` +
          `Add it to src/lib/marketing-assets.ts and re-run \`bun run assets:icons\`.`,
      );
    }
    if (!standalone && !decorative) {
      // eslint-disable-next-line no-console
      console.error(
        `[icon] "${name}" was rendered without \`label\` or \`decorative\`. ` +
          `Standalone marks need a label; marks beside text need decorative.`,
      );
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={cn("shrink-0", className)}
      data-icon={name}
      data-icon-standalone={standalone ? "true" : "false"}
      {...(standalone ? { role: "img", "aria-label": label } : { "aria-hidden": true, focusable: false })}
      {...(strokeWidth ? { style: { strokeWidth } } : {})}
    >
      <use href={iconHref(name)} />
    </svg>
  );
}
