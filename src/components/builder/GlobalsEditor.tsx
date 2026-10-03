/**
 * Phase 2B — merchant-facing Globals editor.
 *
 * Edits the theme's named colours and fonts (the `globals` slice of
 * `ThemeTokens`). Every row binds to a CSS custom property —
 * `var(--fq-g-<id>)` for colours, `var(--fq-gf-<id>)` for fonts — so any
 * colour/typography control bound to a global restyles everywhere the global
 * changes, with no render-time lookup (the variables ride the theme surface
 * next to the design tokens).
 *
 * Write path: this component owns NO persistence. Every edit commits through
 * `onChange`, which the host wires to the existing tokens draft path, e.g.
 * `onChange={(globals) => editor.setTokens({ globals })}` in the builder
 * brand panel — the same autosave/version/publish pipeline `TokenEditor`
 * uses. No new RPCs, no direct store writes. Rows commit through
 * `parseGlobals`, the same sanitiser the save path runs, so the draft can
 * never hold a binding the server would reject.
 *
 * Favicon is deliberately NOT edited here: it is a site-level asset
 * (`/favicon.svg`, managed under Settings → SEO), not a per-theme global —
 * hence the note below instead of a control.
 */
import { useState } from "react";
import {
  DEFAULT_GLOBALS,
  MAX_GLOBAL_COLORS,
  MAX_GLOBAL_FONTS,
  globalColorVar,
  globalFontVar,
  globalsToCss,
  parseGlobals,
  type GlobalColor,
  type GlobalFont,
  type ThemeGlobals,
} from "@/lib/theme-globals";
import { useLang } from "@/lib/i18n";

type Props = {
  globals: ThemeGlobals;
  onChange: (next: ThemeGlobals) => void;
};

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const WEIGHTS = ["100", "200", "300", "400", "500", "600", "700", "800", "900"];

/** Merchant name → stable binding id (`var(--fq-g-<id>)`). */
function slugId(name: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "global";
  const rooted = /^[a-z]/.test(base) ? base : `g-${base}`;
  if (!taken.has(rooted)) return rooted;
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${rooted}-${i}`.slice(0, 24);
    if (!taken.has(candidate)) return candidate;
  }
  return `${rooted}-${Date.now().toString(36)}`.slice(0, 24);
}

export function GlobalsEditor({ globals, onChange }: Props) {
  const { t } = useLang();
  const [colorName, setColorName] = useState("");
  const [colorValue, setColorValue] = useState("#0F766E");
  const [fontName, setFontName] = useState("");
  const [fontFamily, setFontFamily] = useState("");

  const commit = (next: ThemeGlobals) => onChange(parseGlobals(next));

  const updateColor = (id: string, patch: Partial<GlobalColor>) =>
    commit({
      ...globals,
      colors: globals.colors.map((row) =>
        row.id === id ? { ...row, ...patch, id: row.id } : row,
      ),
    });

  const removeColor = (id: string) =>
    commit({ ...globals, colors: globals.colors.filter((row) => row.id !== id) });

  const addColor = () => {
    if (globals.colors.length >= MAX_GLOBAL_COLORS) return;
    const name = colorName.trim() || `Colour ${globals.colors.length + 1}`;
    const value = HEX.test(colorValue.trim()) ? colorValue.trim() : "#0F766E";
    commit({
      ...globals,
      colors: [
        ...globals.colors,
        {
          id: slugId(name, new Set(globals.colors.map((row) => row.id))),
          name,
          value,
        },
      ],
    });
    setColorName("");
  };

  const updateFont = (id: string, patch: Partial<GlobalFont>) =>
    commit({
      ...globals,
      fonts: globals.fonts.map((row) =>
        row.id === id ? { ...row, ...patch, id: row.id } : row,
      ),
    });

  const removeFont = (id: string) =>
    commit({ ...globals, fonts: globals.fonts.filter((row) => row.id !== id) });

  const addFont = () => {
    if (globals.fonts.length >= MAX_GLOBAL_FONTS) return;
    const name = fontName.trim() || `Font ${globals.fonts.length + 1}`;
    const family = fontFamily.trim() || "Inter";
    commit({
      ...globals,
      fonts: [
        ...globals.fonts,
        {
          id: slugId(name, new Set(globals.fonts.map((row) => row.id))),
          name,
          family,
          weight: "400",
        },
      ],
    });
    setFontName("");
    setFontFamily("");
  };

  // The preview strip defines the real custom properties, so every swatch
  // below resolves through the same `var(--fq-g-*)` binding the storefront
  // uses — what the merchant sees is what the shopper gets.
  const cssVars = globalsToCss(globals) as React.CSSProperties;

  return (
    <div className="space-y-3 text-sm" style={cssVars}>
      <div className="rounded-fq-lg border border-border/80 bg-card/60 p-3.5 shadow-xs space-y-1">
        <h3 className="text-xs font-semibold text-foreground">
          {t("Global colours & fonts", "গ্লোবাল রং ও ফন্ট")}
        </h3>
        <p className="text-[11px] text-muted-foreground leading-normal">
          {t(
            "Change a global once — every widget bound to it restyles. Bindings are stored as CSS variables, so published pages need no lookup.",
            "একবার গ্লোবাল বদলান — বাঁধা প্রতিটি উইজেট বদলে যাবে। বাইন্ডিং CSS ভ্যারিয়েবল হিসেবে থাকে।",
          )}
        </p>
      </div>

      {/* Colours */}
      <section aria-label={t("Global colours", "গ্লোবাল রং")} className="space-y-2">
        {globals.colors.map((color) => (
          <div
            key={color.id}
            className="rounded-fq-md border border-border/70 bg-card p-2.5 space-y-2"
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-8 shrink-0 rounded-fq-md border border-border/80 shadow-inner"
                style={{ backgroundColor: `var(${globalColorVar(color.id)})` }}
              />
              <input
                type="text"
                value={color.name}
                aria-label={t("Colour name", "রঙের নাম")}
                onChange={(event) =>
                  updateColor(color.id, { name: event.target.value.slice(0, 40) })
                }
                className="min-w-0 flex-1 rounded-fq-sm border border-border/60 bg-background px-2 py-1 text-xs text-foreground"
              />
              <button
                type="button"
                onClick={() => removeColor(color.id)}
                aria-label={t(`Remove ${color.name}`, `${color.name} সরান`)}
                className="shrink-0 rounded-fq-sm border border-border/60 px-2 py-1 text-xs text-muted-foreground hover:text-destructive cursor-pointer"
              >
                ×
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={HEX.test(color.value) ? color.value : "#0F766E"}
                aria-label={t("Colour value", "রঙের মান")}
                onChange={(event) => updateColor(color.id, { value: event.target.value })}
                className="size-8 shrink-0 cursor-pointer rounded-fq-sm border border-border/60 bg-background"
              />
              <input
                type="text"
                value={color.value}
                onChange={(event) => updateColor(color.id, { value: event.target.value })}
                spellCheck={false}
                className="w-24 shrink-0 rounded-fq-sm border border-border/60 bg-background px-2 py-1 font-mono text-xs text-foreground uppercase"
              />
              <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">
                var({globalColorVar(color.id)})
              </code>
            </div>
          </div>
        ))}
        {globals.colors.length < MAX_GLOBAL_COLORS ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={colorName}
              onChange={(event) => setColorName(event.target.value)}
              placeholder={t("New colour name", "নতুন রঙের নাম")}
              aria-label={t("New colour name", "নতুন রঙের নাম")}
              className="min-w-0 flex-1 rounded-fq-md border border-border/80 bg-background px-3 py-2 text-xs text-foreground"
            />
            <input
              type="text"
              value={colorValue}
              onChange={(event) => setColorValue(event.target.value)}
              placeholder="#0F766E"
              aria-label={t("New colour value", "নতুন রঙের মান")}
              spellCheck={false}
              className="w-24 shrink-0 rounded-fq-md border border-border/80 bg-background px-3 py-2 font-mono text-xs text-foreground uppercase"
            />
            <button
              type="button"
              onClick={addColor}
              className="shrink-0 rounded-fq-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground cursor-pointer"
            >
              {t("Add", "যোগ করুন")}
            </button>
          </div>
        ) : null}
      </section>

      {/* Fonts */}
      <section aria-label={t("Global fonts", "গ্লোবাল ফন্ট")} className="space-y-2">
        {globals.fonts.map((font) => (
          <div
            key={font.id}
            className="rounded-fq-md border border-border/70 bg-card p-2.5 space-y-2"
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="min-w-0 flex-1 truncate text-sm text-foreground"
                style={{ fontFamily: `var(${globalFontVar(font.id)})` }}
              >
                Ag
              </span>
              <input
                type="text"
                value={font.name}
                aria-label={t("Font name", "ফন্টের নাম")}
                onChange={(event) =>
                  updateFont(font.id, { name: event.target.value.slice(0, 40) })
                }
                className="w-28 shrink-0 rounded-fq-sm border border-border/60 bg-background px-2 py-1 text-xs text-foreground"
              />
              <button
                type="button"
                onClick={() => removeFont(font.id)}
                aria-label={t(`Remove ${font.name}`, `${font.name} সরান`)}
                className="shrink-0 rounded-fq-sm border border-border/60 px-2 py-1 text-xs text-muted-foreground hover:text-destructive cursor-pointer"
              >
                ×
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={font.family}
                aria-label={t("Font family", "ফন্ট ফ্যামিলি")}
                onChange={(event) => updateFont(font.id, { family: event.target.value })}
                spellCheck={false}
                className="min-w-0 flex-1 rounded-fq-sm border border-border/60 bg-background px-2 py-1 text-xs text-foreground"
              />
              <select
                value={font.weight}
                aria-label={t("Font weight", "ফন্ট ওজন")}
                onChange={(event) => updateFont(font.id, { weight: event.target.value })}
                className="shrink-0 rounded-fq-sm border border-border/60 bg-background px-2 py-1 text-xs text-foreground"
              >
                {WEIGHTS.map((weight) => (
                  <option key={weight} value={weight}>
                    {weight}
                  </option>
                ))}
              </select>
            </div>
            <code className="block truncate rounded bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">
              var({globalFontVar(font.id)})
            </code>
          </div>
        ))}
        {globals.fonts.length < MAX_GLOBAL_FONTS ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={fontName}
              onChange={(event) => setFontName(event.target.value)}
              placeholder={t("New font name", "নতুন ফন্টের নাম")}
              aria-label={t("New font name", "নতুন ফন্টের নাম")}
              className="min-w-0 flex-1 rounded-fq-md border border-border/80 bg-background px-3 py-2 text-xs text-foreground"
            />
            <input
              type="text"
              value={fontFamily}
              onChange={(event) => setFontFamily(event.target.value)}
              placeholder="Inter"
              aria-label={t("New font family", "নতুন ফন্ট ফ্যামিলি")}
              spellCheck={false}
              className="min-w-0 flex-1 rounded-fq-md border border-border/80 bg-background px-3 py-2 text-xs text-foreground"
            />
            <button
              type="button"
              onClick={addFont}
              className="shrink-0 rounded-fq-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground cursor-pointer"
            >
              {t("Add", "যোগ করুন")}
            </button>
          </div>
        ) : null}
      </section>

      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground leading-normal">
          {t(
            "Favicon is a site asset, not a theme global — manage it under Settings → SEO.",
            "ফেভিকন সাইট অ্যাসেট, থিম গ্লোবাল নয় — Settings → SEO থেকে বদলান।",
          )}
        </p>
        <button
          type="button"
          onClick={() => onChange(parseGlobals(DEFAULT_GLOBALS))}
          className="shrink-0 rounded-fq-md border border-border/80 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
        >
          {t("Reset to defaults", "ডিফল্টে ফেরান")}
        </button>
      </div>
    </div>
  );
}
