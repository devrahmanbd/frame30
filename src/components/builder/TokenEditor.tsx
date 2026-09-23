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
import { COMMON_TIMEZONES, DEFAULT_MERCHANT_TIMEZONE } from "@/lib/timezone";
import { CustomFontsPanel } from "./CustomFontsPanel";

type Props = {
  tokens: ThemeTokens;
  onChange: (patch: Partial<ThemeTokens>) => void;
};

// Curated color palettes for 1-click styling (storefront-owned, not theme presets)
const PALETTE_PRESETS: Array<{
  nameEn: string;
  nameBn: string;
  brand: string;
  accent: string;
  surface: string;
  ink: string;
}> = [
  {
    nameEn: "Nordic Minimalist",
    nameBn: "নর্ডিক মিনিমালিস্ট",
    brand: "#0F172A",
    accent: "#0D9488",
    surface: "#FFFFFF",
    ink: "#0F172A",
  },
  {
    nameEn: "Botanical Forest",
    nameBn: "বোটানিক্যাল ফরেস্ট",
    brand: "#0F5132",
    accent: "#198754",
    surface: "#F8FBF9",
    ink: "#132E20",
  },
  {
    nameEn: "Rosewater & Clay",
    nameBn: "রোজওয়াটার ও ক্লে",
    brand: "#8A3D4D",
    accent: "#D47A88",
    surface: "#FFFBF8",
    ink: "#241E1C",
  },
  {
    nameEn: "Midnight Sapphire",
    nameBn: "মিডনাইট স্যাফায়ার",
    brand: "#1E3A8A",
    accent: "#2563EB",
    surface: "#F8FAFC",
    ink: "#0F172A",
  },
];

function ContrastBadge({ label, ratio }: { label: string; ratio: number }) {
  const { t } = useLang();
  const pass = ratio >= 4.5;
  const tripleA = ratio >= 7.0;

  return (
    <div
      className={`flex items-center justify-between rounded-fq-md px-3 py-2 text-xs border ${
        pass
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-destructive/30 bg-destructive/10 text-destructive dark:text-destructive-foreground"
      }`}
    >
      <div className="flex items-center gap-1.5 font-medium">
        <span
          className={`size-2 rounded-full ${
            pass ? "bg-emerald-500" : "bg-destructive animate-pulse"
          }`}
        />
        <span>{label}</span>
      </div>
      <div className="flex items-center gap-2 font-mono tabular-nums">
        <span className="font-semibold">{ratio.toFixed(2)}:1</span>
        <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-background/80 shadow-xs">
          {tripleA ? "AAA" : pass ? t("AA Pass", "AA পাস") : t("Fail", "ফেল")}
        </span>
      </div>
    </div>
  );
}

function SectionGroup({
  title,
  subtitle,
  children,
  defaultOpen = true,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-fq-lg border border-border/80 bg-card/60 shadow-xs transition-colors hover:border-border"
    >
      <summary className="flex cursor-pointer items-center justify-between px-3.5 py-2.5 text-xs font-semibold text-foreground select-none">
        <div>
          <span className="text-xs font-semibold">{title}</span>
          {subtitle && (
            <span className="block text-[10px] font-normal text-muted-foreground mt-0.5">
              {subtitle}
            </span>
          )}
        </div>
        <svg
          className="size-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="border-t border-border/60 px-3.5 py-3.5 space-y-4">
        {children}
      </div>
    </details>
  );
}

function SwatchCard({
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
    <div className="flex flex-col gap-1.5 rounded-fq-md border border-border/70 bg-background/60 p-2.5 shadow-xs transition-colors hover:border-border">
      <div className="flex items-center justify-between text-xs">
        <label htmlFor={id} className="font-medium text-foreground cursor-pointer">
          {label}
        </label>
        <span className="font-mono text-[10px] font-semibold text-muted-foreground tabular-nums uppercase">
          {value}
        </span>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <div
          className="relative size-8 shrink-0 overflow-hidden rounded-fq-md border border-border/80 shadow-inner cursor-pointer"
          style={{ backgroundColor: value }}
        >
          <input
            id={id}
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 size-full opacity-0 cursor-pointer"
          />
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-fq-sm border border-border/60 bg-background px-2 py-1 text-xs font-mono tabular-nums text-foreground uppercase shadow-inner"
        />
      </div>
    </div>
  );
}

const SELECT_CLASS =
  "w-full rounded-fq-md border border-border/80 bg-background px-3 py-2 text-xs font-medium text-foreground shadow-xs transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

export function TokenEditor({ tokens, onChange }: Props) {
  const { t } = useLang();
  const [scheme, setScheme] = useState<"light" | "dark">("light");
  const dark: DarkTokens = tokens.dark ?? DEFAULT_DARK_TOKENS;
  const editingDark = scheme === "dark" && Boolean(tokens.dark);

  const setDark = (patch: Partial<DarkTokens>) =>
    onChange({ dark: { ...dark, ...patch } });

  const active = editingDark ? dark : tokens;

  return (
    <div className="space-y-3 text-sm">
      {/* 1. COLOR & BRAND PALETTE */}
      <SectionGroup
        title={t("Color Palette", "কালার প্যালেট")}
        subtitle={t("Brand identity, accents, surface & ink tokens", "ব্র্যান্ড পরিচিতি, অ্যাকসেন্ট, সারফেস ও টেক্সট")}
      >
        {/* Light / Dark Mode Segmented Switch */}
        <div className="flex items-center justify-between gap-2">
          <div
            className="flex rounded-fq-md border border-border bg-muted/60 p-0.5"
            role="tablist"
            aria-label={t("Colour scheme", "কালার স্কিম")}
          >
            {(["light", "dark"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={scheme === mode}
                onClick={() => setScheme(mode)}
                className={`flex items-center gap-1.5 rounded-fq-sm px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                  scheme === mode
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {mode === "light" ? (
                  <>
                    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="4" />
                      <path d="M12 2v2" />
                      <path d="M12 20v2" />
                      <path d="m4.93 4.93 1.41 1.41" />
                      <path d="m17.66 17.66 1.41 1.41" />
                      <path d="M2 12h2" />
                      <path d="M20 12h2" />
                      <path d="m6.34 17.66-1.41 1.41" />
                      <path d="m19.07 4.93-1.41 1.41" />
                    </svg>
                    <span>{t("Light", "লাইট")}</span>
                  </>
                ) : (
                  <>
                    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                    </svg>
                    <span>{t("Dark", "ডার্ক")}</span>
                  </>
                )}
              </button>
            ))}
          </div>

          {editingDark && (
            <button
              type="button"
              onClick={() => onChange({ dark: null })}
              className="text-xs text-destructive hover:underline cursor-pointer font-medium"
            >
              {t("Remove dark set", "ডার্ক সেট সরান")}
            </button>
          )}
        </div>

        {scheme === "dark" && !tokens.dark ? (
          <div className="rounded-fq-md border border-dashed border-border p-4 text-center space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t(
                "This storefront is currently light-only. Create a curated dark set tailored for high-contrast evening shopping.",
                "এই স্টোরফ্রন্ট বর্তমানে শুধু লাইট মোডে। উচ্চ কন্ট্রাস্টের আরামদায়ক অভিজ্ঞতার জন্য ডার্ক সেট তৈরি করুন।",
              )}
            </p>
            <button
              type="button"
              onClick={() => onChange({ dark: DEFAULT_DARK_TOKENS })}
              className="inline-flex items-center gap-1.5 rounded-fq-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 cursor-pointer"
            >
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
              </svg>
              <span>{t("Enable Dark Mode Tokens", "ডার্ক মোড টোকেন যোগ করুন")}</span>
            </button>
          </div>
        ) : (
          <>
            {/* 1-Click Curated Palette Cards */}
            {!editingDark && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("Curated Palettes", "নির্বাচিত প্যালেট")}
                </label>
                <div className="grid grid-cols-1 gap-1.5">
                  {PALETTE_PRESETS.map((p) => {
                    const isCurrent =
                      active.brand.toUpperCase() === p.brand.toUpperCase() &&
                      active.accent.toUpperCase() === p.accent.toUpperCase();
                    return (
                      <button
                        key={p.nameEn}
                        type="button"
                        onClick={() =>
                          onChange({
                            brand: p.brand,
                            accent: p.accent,
                            surface: p.surface,
                            ink: p.ink,
                          })
                        }
                        className={`flex items-center justify-between rounded-fq-md border p-2 text-left transition-all cursor-pointer ${
                          isCurrent
                            ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40"
                            : "border-border/70 bg-card hover:bg-accent/60"
                        }`}
                      >
                        <div className="min-w-0">
                          <span className="block text-xs font-semibold text-foreground truncate">
                            {t(p.nameEn, p.nameBn)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <span className="size-4 rounded-full border border-border shadow-xs" style={{ backgroundColor: p.brand }} />
                          <span className="size-4 rounded-full border border-border shadow-xs" style={{ backgroundColor: p.accent }} />
                          <span className="size-4 rounded-full border border-border shadow-xs" style={{ backgroundColor: p.surface }} />
                          <span className="size-4 rounded-full border border-border shadow-xs" style={{ backgroundColor: p.ink }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Custom Color Swatches */}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <SwatchCard
                id={`token-${scheme}-brand`}
                label={t("Brand Color", "ব্র্যান্ড কালার")}
                value={String(active.brand)}
                onChange={(next) =>
                  editingDark
                    ? setDark({ brand: next })
                    : onChange({ brand: next })
                }
              />
              <SwatchCard
                id={`token-${scheme}-accent`}
                label={t("Accent Color", "অ্যাকসেন্ট")}
                value={String(active.accent)}
                onChange={(next) =>
                  editingDark
                    ? setDark({ accent: next })
                    : onChange({ accent: next })
                }
              />
              <SwatchCard
                id={`token-${scheme}-surface`}
                label={t("Surface / Canvas", "সারফেস")}
                value={String(active.surface)}
                onChange={(next) =>
                  editingDark
                    ? setDark({ surface: next })
                    : onChange({ surface: next })
                }
              />
              <SwatchCard
                id={`token-${scheme}-ink`}
                label={t("Text / Ink", "টেক্সট")}
                value={String(active.ink)}
                onChange={(next) =>
                  editingDark
                    ? setDark({ ink: next })
                    : onChange({ ink: next })
                }
              />
            </div>

            {/* Live WCAG Accessibility Contrast Ratios */}
            <div className="space-y-1.5 pt-1">
              <ContrastBadge
                label={t("Text on surface", "সারফেসে টেক্সট")}
                ratio={contrastRatio(active.ink, active.surface)}
              />
              <ContrastBadge
                label={t("White on brand", "ব্র্যান্ডে সাদা")}
                ratio={contrastRatio("#FFFFFF", active.brand)}
              />
            </div>
          </>
        )}
      </SectionGroup>

      {/* 2. TYPOGRAPHY STUDIO */}
      <SectionGroup
        title={t("Typography & Font Studio", "টাইপোগ্রাফি ও ফন্ট স্টুডিও")}
        subtitle={t("Display headings, body text, and typographic scale", "হেডিং, বডি ফন্ট ও টাইপ স্কেল")}
      >
        <div className="space-y-2">
          <label htmlFor="token-font-pairing" className="block text-xs font-semibold text-foreground">
            {t("Curated Font Pairings", "ফন্ট পেয়ারিং")}
          </label>

          {/* Visual Specimen Cards */}
          <div className="grid grid-cols-1 gap-1.5">
            {(Object.keys(FONT_PAIRINGS) as FontPairingKey[]).map((key) => {
              const pair = FONT_PAIRINGS[key];
              const isSelected = tokens.fontPairing === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onChange(applyFontPairing(tokens, key))}
                  className={`flex flex-col gap-1 rounded-fq-md border p-2.5 text-left transition-all cursor-pointer ${
                    isSelected
                      ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40"
                      : "border-border/70 bg-card hover:bg-accent/60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground">
                      {key === "custom"
                        ? t("Custom Google Fonts", "কাস্টম গুগল ফন্ট")
                        : `${pair.display} / ${pair.body}`}
                    </span>
                    {isSelected && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                        {t("Selected", "বাছাই")}
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline justify-between text-muted-foreground text-xs pt-1 border-t border-border/40">
                    <span style={{ fontFamily: pair.display }} className="font-semibold text-foreground">
                      Aa Bb Gg 123
                    </span>
                    <span className="font-bangla text-xs">
                      বাংলা নমুনা হরফ
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Native select preserved for contract and testing parity */}
          <div className="pt-1">
            <select
              id="token-font-pairing"
              value={tokens.fontPairing}
              onChange={(e) =>
                onChange(
                  applyFontPairing(tokens, e.target.value as FontPairingKey),
                )
              }
              className={SELECT_CLASS}
            >
              {(Object.keys(FONT_PAIRINGS) as FontPairingKey[]).map((key) => (
                <option key={key} value={key}>
                  {key === "custom"
                    ? t("Custom", "কাস্টম")
                    : `${FONT_PAIRINGS[key].display} / ${FONT_PAIRINGS[key].body}`}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Typographic Scale */}
        <div className="space-y-1.5 pt-2 border-t border-border/60">
          <label htmlFor="token-type-scale" className="block text-xs font-semibold text-foreground">
            {t("Typographic Scale", "টাইপ স্কেল")}
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { key: "compact", labelEn: "Compact", labelBn: "কমপ্যাক্ট", desc: "1.125 Major 2nd" },
              { key: "default", labelEn: "Default", labelBn: "ডিফল্ট", desc: "1.200 Minor 3rd" },
              { key: "expressive", labelEn: "Expressive", labelBn: "এক্সপ্রেসিভ", desc: "1.250 Major 3rd" },
            ].map((scale) => {
              const isSelected = tokens.typeScale === scale.key;
              return (
                <button
                  key={scale.key}
                  type="button"
                  onClick={() =>
                    onChange({ typeScale: scale.key as ThemeTokens["typeScale"] })
                  }
                  className={`flex flex-col items-center rounded-fq-md border p-2 text-center transition-all cursor-pointer ${
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground font-semibold shadow-xs"
                      : "border-border/70 bg-card text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                >
                  <span className="text-xs">{t(scale.labelEn, scale.labelBn)}</span>
                  <span className={`text-[9px] mt-0.5 ${isSelected ? "opacity-90" : "text-muted-foreground"}`}>
                    {scale.desc}
                  </span>
                </button>
              );
            })}
          </div>
          {/* Accessible Select */}
          <select
            id="token-type-scale"
            value={tokens.typeScale}
            onChange={(e) =>
              onChange({
                typeScale: e.target.value as ThemeTokens["typeScale"],
              })
            }
            className="sr-only"
          >
            <option value="compact">{t("Compact", "কমপ্যাক্ট")}</option>
            <option value="default">{t("Default", "ডিফল্ট")}</option>
            <option value="expressive">{t("Expressive", "এক্সপ্রেসিভ")}</option>
          </select>
        </div>

        <CustomFontsPanel />
      </SectionGroup>

      {/* 3. SHAPE & GEOMETRY */}
      <SectionGroup
        title={t("Shape & Layout Geometry", "আকার ও লেআউট জ্যামিতি")}
        subtitle={t("Corner radius curves and max container width", "কর্নার রেডিয়াস ও কন্টেন্ট প্রস্থ")}
      >
        {/* Corner Radius Visual Cards */}
        <div className="space-y-1.5">
          <label htmlFor="token-radius" className="block text-xs font-semibold text-foreground">
            {t("Corner Radius Curve", "কর্নার রেডিয়াস")}
          </label>
          <div className="grid grid-cols-5 gap-1">
            {[
              { val: "0px", label: "0px", radiusClass: "rounded-none" },
              { val: "4px", label: "4px", radiusClass: "rounded-xs" },
              { val: "8px", label: "8px", radiusClass: "rounded-sm" },
              { val: "12px", label: "12px", radiusClass: "rounded-md" },
              { val: "20px", label: "20px", radiusClass: "rounded-xl" },
            ].map((r) => {
              const isSelected = tokens.radius === r.val;
              return (
                <button
                  key={r.val}
                  type="button"
                  onClick={() => onChange({ radius: r.val })}
                  className={`flex flex-col items-center gap-1.5 rounded-fq-md border p-2 text-center transition-all cursor-pointer ${
                    isSelected
                      ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40 font-semibold"
                      : "border-border/70 bg-card hover:bg-accent text-muted-foreground"
                  }`}
                >
                  <div
                    className={`size-6 border-2 border-primary ${r.radiusClass} bg-background`}
                  />
                  <span className="text-[10px] tabular-nums font-mono">{r.label}</span>
                </button>
              );
            })}
          </div>
          {/* Accessible Select */}
          <select
            id="token-radius"
            value={tokens.radius}
            onChange={(e) => onChange({ radius: e.target.value })}
            className="sr-only"
          >
            {["0px", "4px", "8px", "12px", "20px"].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        {/* Content Width Cards */}
        <div className="space-y-1.5 pt-2 border-t border-border/60">
          <label htmlFor="token-container" className="block text-xs font-semibold text-foreground">
            {t("Content Max Width", "কন্টেন্ট প্রস্থ")}
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { val: "1024px", labelEn: "Compact", labelBn: "কমপ্যাক্ট", px: "1024px" },
              { val: "1200px", labelEn: "Standard", labelBn: "স্ট্যান্ডার্ড", px: "1200px" },
              { val: "1360px", labelEn: "Wide Canvas", labelBn: "ওয়াইড", px: "1360px" },
            ].map((c) => {
              const isSelected = tokens.container === c.val;
              return (
                <button
                  key={c.val}
                  type="button"
                  onClick={() => onChange({ container: c.val })}
                  className={`flex flex-col items-center rounded-fq-md border p-2 text-center transition-all cursor-pointer ${
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground font-semibold shadow-xs"
                      : "border-border/70 bg-card text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                >
                  <span className="text-xs">{t(c.labelEn, c.labelBn)}</span>
                  <span className="text-[10px] font-mono opacity-80 mt-0.5">{c.px}</span>
                </button>
              );
            })}
          </div>
          {/* Accessible Select */}
          <select
            id="token-container"
            value={tokens.container}
            onChange={(e) => onChange({ container: e.target.value })}
            className="sr-only"
          >
            {["1024px", "1200px", "1360px"].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </SectionGroup>

      {/* 4. SPACING & DENSITY */}
      <SectionGroup
        title={t("Spacing & Density", "স্পেসিং ও ডেনসিটি")}
        subtitle={t("Vertical rhythm and section padding units", "ভার্টিক্যাল রিদম ও প্যাডিং ইউনিট")}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="token-density" className="block text-xs font-semibold text-foreground">
              {t("Density", "ডেনসিটি")}
            </label>
            <select
              id="token-density"
              value={tokens.density}
              onChange={(e) =>
                onChange({ density: e.target.value as ThemeTokens["density"] })
              }
              className={SELECT_CLASS}
            >
              <option value="dense">{t("Dense", "ঘন (Dense)")}</option>
              <option value="comfortable">{t("Comfortable", "স্বাভাবিক (Comfortable)")}</option>
              <option value="airy">{t("Airy", "খোলামেলা (Airy)")}</option>
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="token-space" className="block text-xs font-semibold text-foreground">
              {t("Base Spacing Unit", "স্পেসিং ইউনিট")}
            </label>
            <select
              id="token-space"
              value={tokens.spaceUnit}
              onChange={(e) => onChange({ spaceUnit: e.target.value })}
              className={SELECT_CLASS}
            >
              {["12px", "16px", "20px", "24px"].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground leading-normal">
          {t(
            "Controls section rhythm and white-space harmony across every storefront template.",
            "সব স্টোরফ্রন্ট টেমপ্লেটে সেকশন মার্জিন ও প্যাডিং ছন্দ নিয়ন্ত্রণ করে।",
          )}
        </p>
      </SectionGroup>

      {/* 5. ELEVATION & SHADOWS */}
      <SectionGroup
        title={t("Elevation & Depth Shadows", "এলিভেশন ও শ্যাডো")}
        subtitle={t("Card depth, floating buttons & modal shadows", "কার্ড ডেপথ ও ফ্লোটিং শ্যাডো")}
      >
        <div className="grid grid-cols-3 gap-2">
          {[
            { key: "none", labelEn: "Flat", labelBn: "সমতল", shadowStyle: "none" },
            {
              key: "soft",
              labelEn: "Soft Glow",
              labelBn: "নরম শ্যাডো",
              shadowStyle: "0 4px 14px 0 rgba(0, 0, 0, 0.08)",
            },
            {
              key: "lifted",
              labelEn: "Lifted",
              labelBn: "উঁচু ডেপথ",
              shadowStyle: "0 10px 30px -4px rgba(0, 0, 0, 0.18)",
            },
          ].map((sh) => {
            const isSelected = tokens.shadow === sh.key;
            return (
              <button
                key={sh.key}
                type="button"
                onClick={() =>
                  onChange({ shadow: sh.key as ThemeTokens["shadow"] })
                }
                className={`flex flex-col items-center gap-2 rounded-fq-md border p-3 text-center transition-all cursor-pointer ${
                  isSelected
                    ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40 font-semibold"
                    : "border-border/70 bg-card hover:bg-accent text-muted-foreground"
                }`}
              >
                <div
                  className="size-8 rounded-fq-sm border border-border/80 bg-background"
                  style={{ boxShadow: sh.shadowStyle }}
                />
                <span className="text-xs text-foreground">{t(sh.labelEn, sh.labelBn)}</span>
              </button>
            );
          })}
        </div>
        {/* Accessible Select */}
        <select
          id="token-shadow"
          value={tokens.shadow}
          onChange={(e) =>
            onChange({ shadow: e.target.value as ThemeTokens["shadow"] })
          }
          className="sr-only"
        >
          <option value="none">{t("Flat", "সমতল")}</option>
          <option value="soft">{t("Soft", "নরম")}</option>
          <option value="lifted">{t("Lifted", "উঁচু")}</option>
        </select>
      </SectionGroup>

      {/* 6. MOTION & ENTRANCE ANIMATIONS */}
      <SectionGroup
        title={t("Micro-Interactions & Motion", "মাইক্রো-ইন্টারেকশন ও মোশন")}
        subtitle={t("Page transition speeds and reveal dynamics", "পেজ ট্রানজিশন গতি ও প্রকাশ শৈলী")}
      >
        <div className="space-y-2">
          <label htmlFor="token-motion" className="block text-xs font-semibold text-foreground">
            {t("Entrance Motion Dynamics", "এন্ট্রান্স মোশন")}
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { key: "none", labelEn: "None (Static)", labelBn: "নেই (স্থির)" },
              { key: "subtle", labelEn: "Subtle (180ms)", labelBn: "মৃদু (১৮০ms)" },
              { key: "lively", labelEn: "Lively (300ms)", labelBn: "প্রাণবন্ত (৩০০ms)" },
            ].map((m) => {
              const isSelected = tokens.motion === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() =>
                    onChange({ motion: m.key as ThemeTokens["motion"] })
                  }
                  className={`rounded-fq-md border p-2 text-center text-xs transition-all cursor-pointer ${
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground font-semibold shadow-xs"
                      : "border-border/70 bg-card text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                >
                  {t(m.labelEn, m.labelBn)}
                </button>
              );
            })}
          </div>
          {/* Accessible Select */}
          <select
            id="token-motion"
            value={tokens.motion}
            onChange={(e) =>
              onChange({ motion: e.target.value as ThemeTokens["motion"] })
            }
            className="sr-only"
          >
            <option value="none">{t("None", "নেই")}</option>
            <option value="subtle">{t("Subtle", "মৃদু")}</option>
            <option value="lively">{t("Lively", "প্রাণবন্ত")}</option>
          </select>
          <p className="text-[11px] text-muted-foreground">
            {t(
              "Shoppers requesting reduced motion via browser preferences always get static animations.",
              "ব্রাউজারে কম মোশন পছন্দকারী ক্রেতারা সর্বদা অতিরিক্ত মোশন ছাড়াই দেখবেন।",
            )}
          </p>
        </div>
      </SectionGroup>

      {/* 7. COMMERCE & LOCALE */}
      <SectionGroup
        title={t("Storefront Locale & Currency", "লোকেল ও মুদ্রা সেটিংস")}
        subtitle={t("Default language, numerals format, timezone & currency", "ডিফল্ট ভাষা, সংখ্যা বিন্যাস, টাইমজোন ও মুদ্রা")}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="token-locale" className="block text-xs font-semibold text-foreground">
              {t("Default Language", "ডিফল্ট ভাষা")}
            </label>
            <select
              id="token-locale"
              value={tokens.locale}
              onChange={(e) =>
                onChange({ locale: e.target.value as ThemeTokens["locale"] })
              }
              className={SELECT_CLASS}
            >
              <option value="en">English (US)</option>
              <option value="bn">বাংলা (Bengali)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="token-digits" className="block text-xs font-semibold text-foreground">
              {t("Numeral Digits", "সংখ্যা বিন্যাস")}
            </label>
            <select
              id="token-digits"
              value={tokens.digits}
              onChange={(e) =>
                onChange({ digits: e.target.value as ThemeTokens["digits"] })
              }
              className={SELECT_CLASS}
            >
              <option value="latin">1234 (Latin)</option>
              <option value="bengali">১২৩৪ (বাংলা)</option>
            </select>
          </div>

          <div className="col-span-2 space-y-1">
            <label htmlFor="token-currency-display" className="block text-xs font-semibold text-foreground">
              {t("Currency Display Format", "মুদ্রা প্রদর্শন")}
            </label>
            <select
              id="token-currency-display"
              value={tokens.currencyDisplay}
              onChange={(e) =>
                onChange({
                  currencyDisplay: e.target
                    .value as ThemeTokens["currencyDisplay"],
                })
              }
              className={SELECT_CLASS}
            >
              <option value="symbol">৳ 1,200 (Currency Symbol)</option>
              <option value="code">BDT 1,200 (ISO Code)</option>
            </select>
          </div>

          <div className="col-span-2 space-y-2 pt-2 border-t border-border/60">
            <label htmlFor="token-timezone" className="block text-xs font-semibold text-foreground">
              {t("Store Timezone", "স্টোর টাইমজোন")}
            </label>
            <select
              id="token-timezone"
              value={tokens.timezone ?? DEFAULT_MERCHANT_TIMEZONE}
              onChange={(e) => onChange({ timezone: e.target.value })}
              className={SELECT_CLASS}
            >
              {Array.from(
                new Set(COMMON_TIMEZONES.map((tz) => tz.region)),
              ).map((region) => (
                <optgroup key={region} label={region}>
                  {COMMON_TIMEZONES.filter((tz) => tz.region === region).map(
                    (tz) => (
                      <option key={tz.value} value={tz.value}>
                        {tz.offset} — {tz.label}
                      </option>
                    ),
                  )}
                </optgroup>
              ))}
            </select>

            <label className="flex items-start gap-2.5 pt-1 cursor-pointer text-xs">
              <input
                type="checkbox"
                checked={Boolean(tokens.allowCustomerTimezone)}
                onChange={(e) =>
                  onChange({ allowCustomerTimezone: e.target.checked })
                }
                className="mt-0.5 size-4 rounded-fq-sm border-border text-primary cursor-pointer"
              />
              <div>
                <span className="font-medium text-foreground">
                  {t(
                    "Allow shoppers to pick their timezone",
                    "ক্রেতাদের টাইমজোন পছন্দের অনুমতি দিন",
                  )}
                </span>
                <span className="block text-[11px] text-muted-foreground mt-0.5 leading-normal">
                  {t(
                    "Adds a timezone selector in the storefront and adapts order timestamps to customer location.",
                    "স্টোরফ্রন্টে টাইমজোন সিলেক্টর যোগ করে এবং ক্রেতার অবস্থান অনুযায়ী সময় প্রদর্শন করে।",
                  )}
                </span>
              </div>
            </label>
          </div>
        </div>
      </SectionGroup>
    </div>
  );
}
