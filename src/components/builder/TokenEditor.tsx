import { useState } from "react";
import {
  DEFAULT_DARK_TOKENS,
  FONT_PAIRINGS,
  applyFontPairing,
  contrastRatio,
  type DarkTokens,
  type FontPairingKey,
  type ThemeTokens,
} from "@/lib/builder-ast";
import { useLang } from "@/lib/i18n";
import { CustomFontsPanel } from "./CustomFontsPanel";

type Props = {
  tokens: ThemeTokens;
  onChange: (patch: Partial<ThemeTokens>) => void;
};

function Contrast({ label, ratio }: { label: string; ratio: number }) {
  const { t } = useLang();
  const pass = ratio >= 4.5;
  return (
    <p
      className={`flex items-center justify-between rounded-fq-md px-3 py-2 text-xs ${
        pass ? "bg-success-soft text-success-foreground" : "bg-danger-soft text-danger-foreground"
      }`}
    >
      <span>{label}</span>
      <span className="tabular-nums">
        {ratio.toFixed(2)}:1 · {pass ? t("AA pass", "AA পাস") : t("AA fail", "AA ফেল")}
      </span>
    </p>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details open className="rounded-fq-md border border-border bg-card">
      <summary className="cursor-pointer px-3 py-2 text-xs font-semibold">{title}</summary>
      <div className="space-y-3 border-t border-border px-3 py-3">{children}</div>
    </details>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

const SELECT = "w-full rounded-fq-md border border-border bg-card px-3 py-2 text-sm";

function ColourRow({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <Field id={id} label={label}>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 rounded-fq-md border border-border bg-card"
        />
        <output className="text-xs tabular-nums text-muted-foreground">{value.toUpperCase()}</output>
      </div>
    </Field>
  );
}

/**
 * Phase 3.1 token editor — grouped colour / type / shape / spacing / shadow /
 * motion / locale controls with a designed dark set. Contrast is measured live
 * for both sets because merchant-picked colours must still clear AA, and the
 * badge states pass/fail in words, never colour alone.
 */
export function TokenEditor({ tokens, onChange }: Props) {
  const { t } = useLang();
  const [scheme, setScheme] = useState<"light" | "dark">("light");
  const dark: DarkTokens = tokens.dark ?? DEFAULT_DARK_TOKENS;
  const editingDark = scheme === "dark" && Boolean(tokens.dark);

  const setDark = (patch: Partial<DarkTokens>) => onChange({ dark: { ...dark, ...patch } });

  const colours: { key: "brand" | "accent" | "surface" | "ink"; en: string; bn: string }[] = [
    { key: "brand", en: "Brand", bn: "ব্র্যান্ড" },
    { key: "accent", en: "Accent", bn: "অ্যাকসেন্ট" },
    { key: "surface", en: "Surface", bn: "সারফেস" },
    { key: "ink", en: "Text", bn: "টেক্সট" },
  ];
  const active = editingDark ? dark : tokens;

  return (
    <div className="space-y-3">
      <Group title={t("Colour", "রঙ")}>
        <div className="flex gap-2" role="tablist" aria-label={t("Colour scheme", "কালার স্কিম")}>
          {(["light", "dark"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={scheme === mode}
              onClick={() => setScheme(mode)}
              className={`rounded-fq-md border px-3 py-1 text-xs ${
                scheme === mode ? "border-primary bg-primary text-primary-foreground" : "border-border"
              }`}
            >
              {mode === "light" ? t("Light", "লাইট") : t("Dark", "ডার্ক")}
            </button>
          ))}
        </div>

        {scheme === "dark" && !tokens.dark ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {t(
                "This theme is light-only. A dark set is designed, never auto-inverted.",
                "এই থিম শুধু লাইট। ডার্ক সেট ডিজাইন করা হয়, স্বয়ংক্রিয়ভাবে উল্টানো হয় না।",
              )}
            </p>
            <button
              type="button"
              onClick={() => onChange({ dark: DEFAULT_DARK_TOKENS })}
              className="rounded-fq-md border border-border px-3 py-2 text-xs font-medium"
            >
              {t("Add a dark set", "ডার্ক সেট যোগ করুন")}
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              {colours.map((colour) => (
                <ColourRow
                  key={colour.key}
                  id={`token-${scheme}-${colour.key}`}
                  label={t(colour.en, colour.bn)}
                  value={String(active[colour.key])}
                  onChange={(next) =>
                    editingDark
                      ? setDark({ [colour.key]: next } as Partial<DarkTokens>)
                      : onChange({ [colour.key]: next } as Partial<ThemeTokens>)
                  }
                />
              ))}
            </div>
            <Contrast
              label={t("Text on surface", "সারফেসে টেক্সট")}
              ratio={contrastRatio(active.ink, active.surface)}
            />
            <Contrast
              label={t("White on brand", "ব্র্যান্ডে সাদা")}
              ratio={contrastRatio("#FFFFFF", active.brand)}
            />
            {editingDark && (
              <button
                type="button"
                onClick={() => onChange({ dark: null })}
                className="text-xs underline"
              >
                {t("Remove dark set", "ডার্ক সেট সরান")}
              </button>
            )}
          </>
        )}
      </Group>

      <Group title={t("Type", "টাইপ")}>
        <Field id="token-font-pairing" label={t("Font pairing", "ফন্ট জোড়া")}>
          <select
            id="token-font-pairing"
            value={tokens.fontPairing}
            onChange={(e) => onChange(applyFontPairing(tokens, e.target.value as FontPairingKey))}
            className={SELECT}
          >
            {(Object.keys(FONT_PAIRINGS) as FontPairingKey[]).map((key) => (
              <option key={key} value={key}>
                {key === "custom"
                  ? t("Custom", "কাস্টম")
                  : `${FONT_PAIRINGS[key].display} / ${FONT_PAIRINGS[key].body}`}
              </option>
            ))}
          </select>
          <p className="text-[0.65rem] text-muted-foreground">
            {t("Fonts are theme-level; widgets never pick their own.", "ফন্ট থিম-লেভেল; উইজেট নিজে বেছে নেয় না।")}
          </p>
        </Field>
        <Field id="token-type-scale" label={t("Typographic scale", "টাইপ স্কেল")}>
          <select
            id="token-type-scale"
            value={tokens.typeScale}
            onChange={(e) => onChange({ typeScale: e.target.value as ThemeTokens["typeScale"] })}
            className={SELECT}
          >
            <option value="compact">{t("Compact", "কমপ্যাক্ট")}</option>
            <option value="default">{t("Default", "ডিফল্ট")}</option>
            <option value="expressive">{t("Expressive", "এক্সপ্রেসিভ")}</option>
          </select>
        </Field>
        <CustomFontsPanel />
      </Group>

      <Group title={t("Shape", "আকার")}>
        <div className="grid grid-cols-2 gap-3">
          <Field id="token-radius" label={t("Corner radius", "কর্নার রেডিয়াস")}>
            <select
              id="token-radius"
              value={tokens.radius}
              onChange={(e) => onChange({ radius: e.target.value })}
              className={SELECT}
            >
              {["0px", "4px", "8px", "12px", "20px"].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </Field>
          <Field id="token-container" label={t("Content width", "কন্টেন্ট প্রস্থ")}>
            <select
              id="token-container"
              value={tokens.container}
              onChange={(e) => onChange({ container: e.target.value })}
              className={SELECT}
            >
              {["1024px", "1200px", "1360px"].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Group>

      <Group title={t("Spacing", "স্পেসিং")}>
        <div className="grid grid-cols-2 gap-3">
          <Field id="token-density" label={t("Density", "ডেনসিটি")}>
            <select
              id="token-density"
              value={tokens.density}
              onChange={(e) => onChange({ density: e.target.value as ThemeTokens["density"] })}
              className={SELECT}
            >
              <option value="dense">{t("Dense", "ঘন")}</option>
              <option value="comfortable">{t("Comfortable", "স্বাভাবিক")}</option>
              <option value="airy">{t("Airy", "খোলা")}</option>
            </select>
          </Field>
          <Field id="token-space" label={t("Spacing unit", "স্পেসিং ইউনিট")}>
            <select
              id="token-space"
              value={tokens.spaceUnit}
              onChange={(e) => onChange({ spaceUnit: e.target.value })}
              className={SELECT}
            >
              {["12px", "16px", "20px", "24px"].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="text-[0.65rem] text-muted-foreground">
          {t("Drives section rhythm across every template.", "সব টেমপ্লেটে সেকশন ছন্দ নিয়ন্ত্রণ করে।")}
        </p>
      </Group>

      <Group title={t("Shadow", "শ্যাডো")}>
        <Field id="token-shadow" label={t("Elevation", "এলিভেশন")}>
          <select
            id="token-shadow"
            value={tokens.shadow}
            onChange={(e) => onChange({ shadow: e.target.value as ThemeTokens["shadow"] })}
            className={SELECT}
          >
            <option value="none">{t("Flat", "সমতল")}</option>
            <option value="soft">{t("Soft", "নরম")}</option>
            <option value="lifted">{t("Lifted", "উঁচু")}</option>
          </select>
        </Field>
      </Group>

      <Group title={t("Motion", "মোশন")}>
        <Field id="token-motion" label={t("Entrance motion", "এন্ট্রান্স মোশন")}>
          <select
            id="token-motion"
            value={tokens.motion}
            onChange={(e) => onChange({ motion: e.target.value as ThemeTokens["motion"] })}
            className={SELECT}
          >
            <option value="none">{t("None", "নেই")}</option>
            <option value="subtle">{t("Subtle", "মৃদু")}</option>
            <option value="lively">{t("Lively", "প্রাণবন্ত")}</option>
          </select>
          <p className="text-[0.65rem] text-muted-foreground">
            {t(
              "Visitors who ask for reduced motion always get none.",
              "যারা কম মোশন চান তারা সবসময় মোশন ছাড়াই দেখবেন।",
            )}
          </p>
        </Field>
      </Group>

      <Group title={t("Locale", "লোকেল")}>
        <div className="grid grid-cols-2 gap-3">
          <Field id="token-locale" label={t("Default language", "ডিফল্ট ভাষা")}>
            <select
              id="token-locale"
              value={tokens.locale}
              onChange={(e) => onChange({ locale: e.target.value as ThemeTokens["locale"] })}
              className={SELECT}
            >
              <option value="en">English</option>
              <option value="bn">বাংলা</option>
            </select>
          </Field>
          <Field id="token-digits" label={t("Digits", "সংখ্যা")}>
            <select
              id="token-digits"
              value={tokens.digits}
              onChange={(e) => onChange({ digits: e.target.value as ThemeTokens["digits"] })}
              className={SELECT}
            >
              <option value="latin">1234</option>
              <option value="bengali">১২৩৪</option>
            </select>
          </Field>
          <Field id="token-currency-display" label={t("Currency display", "মুদ্রা প্রদর্শন")}>
            <select
              id="token-currency-display"
              value={tokens.currencyDisplay}
              onChange={(e) =>
                onChange({ currencyDisplay: e.target.value as ThemeTokens["currencyDisplay"] })
              }
              className={SELECT}
            >
              <option value="symbol">৳ 1,200</option>
              <option value="code">BDT 1,200</option>
            </select>
          </Field>
        </div>
      </Group>
    </div>
  );
}
