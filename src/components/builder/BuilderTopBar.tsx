import { useState, useRef, useEffect } from "react";
import { useLang } from "@/lib/i18n";
import { DEVICE_PRESETS, type DeviceBucket } from "@/lib/responsive";
import { TEMPLATE_KEYS, type TemplateKey } from "@/lib/builder-ast";

export const TEMPLATE_META: Record<
  TemplateKey,
  { en: string; bn: string; desc: { en: string; bn: string }; icon: string }
> = {
  index: {
    en: "Home",
    bn: "হোম",
    desc: { en: "Storefront landing page", bn: "স্টোরফ্রন্ট ল্যান্ডিং পেজ" },
    icon: "home",
  },
  product: {
    en: "Product (PDP)",
    bn: "প্রোডাক্ট",
    desc: { en: "Item details & buy box", bn: "পণ্যের বিবরণ ও ক্রয় বক্স" },
    icon: "shopping-bag",
  },
  collection: {
    en: "Collection",
    bn: "কালেকশন",
    desc: {
      en: "Category grid & facet filters",
      bn: "ক্যাটাগরি গ্রিড ও ফিল্টার",
    },
    icon: "grid",
  },
  search: {
    en: "Search results",
    bn: "সার্চ ফলাফল",
    desc: {
      en: "Live queries & instant hits",
      bn: "অনুসন্ধান ও তাৎক্ষণিক ফলাফল",
    },
    icon: "search",
  },
  cart: {
    en: "Cart",
    bn: "কার্ট",
    desc: { en: "Cart summary & line items", bn: "কার্ট আইটেম ও সারাংশ" },
    icon: "shopping-cart",
  },
  checkout: {
    en: "Checkout",
    bn: "চেকআউট",
    desc: { en: "Secure delivery & payment", bn: "ডেলিভারি ও পেমেন্ট গেটওয়ে" },
    icon: "credit-card",
  },
  blog: {
    en: "Blog",
    bn: "ব্লগ",
    desc: { en: "Editorial articles & stories", bn: "প্রবন্ধ ও গল্পের তালিকা" },
    icon: "book-open",
  },
  page: {
    en: "Page",
    bn: "পেজ",
    desc: {
      en: "About, Terms & custom pages",
      bn: "সম্পর্কে, শর্তাবলী ও কাস্টম পেজ",
    },
    icon: "file-text",
  },
  account: {
    en: "Account",
    bn: "অ্যাকাউন্ট",
    desc: { en: "Shopper orders & profile", bn: "ক্রেতার অর্ডার ও প্রোফাইল" },
    icon: "file-text",
  },
};

export type BuilderTopBarProps = {
  title: string;
  status: string;
  device: DeviceBucket;
  previewWidth: number;
  onWidthChange: (w: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onPreview: () => void;
  isPreview: boolean;
  onSave: () => void;
  onPublish: () => void;
  saveDisabled?: boolean;
  publishDisabled?: boolean;
  onFinderOpen?: () => void;
  onStructureToggle?: () => void;
  structureVisible?: boolean;
  onChecklistOpen?: () => void;
  issueCount?: number;
  contentOnly?: boolean;
  // Studio enhancements:
  template?: TemplateKey;
  onTemplateChange?: (t: TemplateKey) => void;
  zoom?: number;
  onZoomChange?: (z: number) => void;
  coveragePercent?: number;
  onOpenTranslation?: () => void;
  onOpenLint?: () => void;
  errorCount?: number;
  warningCount?: number;
};

function TemplateIcon({ icon }: { icon: string }) {
  switch (icon) {
    case "home":
      return (
        <svg
          className="size-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      );
    case "shopping-bag":
      return (
        <svg
          className="size-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
          <path d="M3 6h18" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
      );
    case "grid":
      return (
        <svg
          className="size-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect width="7" height="7" x="3" y="3" rx="1" />
          <rect width="7" height="7" x="14" y="3" rx="1" />
          <rect width="7" height="7" x="14" y="14" rx="1" />
          <rect width="7" height="7" x="3" y="14" rx="1" />
        </svg>
      );
    case "search":
      return (
        <svg
          className="size-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      );
    case "shopping-cart":
      return (
        <svg
          className="size-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="8" cy="21" r="1" />
          <circle cx="19" cy="21" r="1" />
          <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
        </svg>
      );
    case "credit-card":
      return (
        <svg
          className="size-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect width="20" height="14" x="2" y="5" rx="2" />
          <line x1="2" x2="22" y1="10" y2="10" />
        </svg>
      );
    case "book-open":
      return (
        <svg
          className="size-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
      );
    default:
      return (
        <svg
          className="size-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
  }
}

function DeviceIcon({ width }: { width: number }) {
  if (width <= 480) {
    return (
      <svg
        className="size-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
        <path d="M12 18h.01" />
      </svg>
    );
  }
  if (width <= 900) {
    return (
      <svg
        className="size-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <rect width="16" height="20" x="4" y="2" rx="2" ry="2" />
        <line x1="12" x2="12.01" y1="18" y2="18" />
      </svg>
    );
  }
  return (
    <svg
      className="size-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <line x1="8" x2="16" y1="21" y2="21" />
      <line x1="12" x2="12" y1="17" y2="21" />
    </svg>
  );
}

export function BuilderTopBar({
  title,
  status,
  device,
  previewWidth,
  onWidthChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onPreview,
  isPreview,
  onSave,
  onPublish,
  saveDisabled,
  publishDisabled,
  onFinderOpen,
  onStructureToggle,
  structureVisible,
  onChecklistOpen,
  issueCount = 0,
  contentOnly,
  template = "index",
  onTemplateChange,
  zoom = 1,
  onZoomChange,
  coveragePercent,
  onOpenTranslation,
  onOpenLint,
  errorCount,
  warningCount,
}: BuilderTopBarProps) {
  const { t } = useLang();
  const [templateOpen, setTemplateOpen] = useState(false);
  const templateMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        templateMenuRef.current &&
        !templateMenuRef.current.contains(event.target as Node)
      ) {
        setTemplateOpen(false);
      }
    }
    if (templateOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [templateOpen]);

  const activeMeta = TEMPLATE_META[template] ?? TEMPLATE_META.index;
  const effectiveErrorCount = errorCount ?? issueCount;

  return (
    <header
      className="flex h-13 items-center justify-between border-b border-border bg-card/95 px-3 py-1.5 text-sm backdrop-blur-md z-30 select-none"
      role="toolbar"
      aria-label={t("Builder toolbar", "বিল্ডার টুলবার")}
    >
      {/* LEFT SECTION: Brand, Storefront Title, Template Selector */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-fq-md bg-primary text-primary-foreground font-bold shadow-xs">
            <span className="font-serif text-sm">F</span>
          </div>
          <div className="hidden flex-col sm:flex">
            <div className="flex items-center gap-1.5">
              <span className="font-bangla-display text-xs font-semibold tracking-tight">
                {t("Builder Studio", "বিল্ডার স্টুডিও")}
              </span>
              <span className="text-[10px] text-muted-foreground">/</span>
              <span className="max-w-[130px] truncate text-xs font-medium text-foreground">
                {title}
              </span>
            </div>
            <p
              aria-live="polite"
              className="text-[10px] text-muted-foreground flex items-center gap-1"
            >
              <span className="inline-block size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {status}
            </p>
          </div>
        </div>

        {contentOnly && (
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[0.65rem] font-medium text-amber-600 dark:text-amber-400">
            {t("Content only", "শুধু কন্টেন্ট")}
          </span>
        )}

        <div className="mx-1 h-5 w-px bg-border/80" role="separator" />

        {/* Template Selector Dropdown */}
        {onTemplateChange && (
          <div className="relative" ref={templateMenuRef}>
            <button
              type="button"
              id="template-switcher-button"
              aria-haspopup="listbox"
              aria-expanded={templateOpen}
              onClick={() => setTemplateOpen((o) => !o)}
              className="flex items-center gap-2 rounded-fq-md border border-border bg-background/80 hover:bg-accent px-2.5 py-1.5 text-xs font-medium text-foreground shadow-xs transition-colors cursor-pointer"
            >
              <TemplateIcon icon={activeMeta.icon} />
              <span className="font-medium">
                {t(activeMeta.en, activeMeta.bn)}
              </span>
              <svg
                className={`size-3 text-muted-foreground transition-transform ${templateOpen ? "rotate-180" : ""}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {templateOpen && (
              <div
                role="listbox"
                aria-label={t("Select template", "টেমপ্লেট নির্বাচন করুন")}
                className="absolute left-0 mt-1.5 w-64 rounded-fq-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-xl ring-1 ring-border/50 z-50 animate-in fade-in zoom-in-95 duration-100"
              >
                <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("Storefront Templates", "স্টোরফ্রন্ট টেমপ্লেট")}
                </div>
                <div className="space-y-0.5">
                  {TEMPLATE_KEYS.map((key) => {
                    const meta = TEMPLATE_META[key];
                    const isSelected = template === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          onTemplateChange(key);
                          setTemplateOpen(false);
                        }}
                        className={`flex w-full items-start gap-2.5 rounded-fq-md px-2.5 py-2 text-left transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted text-foreground"
                        }`}
                      >
                        <div
                          className={`mt-0.5 shrink-0 ${isSelected ? "text-primary-foreground" : "text-muted-foreground"}`}
                        >
                          <TemplateIcon icon={meta.icon} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium leading-none">
                              {t(meta.en, meta.bn)}
                            </span>
                            {isSelected && (
                              <span className="text-[10px] font-bold uppercase tracking-wider opacity-90">
                                {t("Active", "সক্রিয়")}
                              </span>
                            )}
                          </div>
                          <p
                            className={`mt-1 truncate text-[10px] ${isSelected ? "text-primary-foreground/80" : "text-muted-foreground"}`}
                          >
                            {t(meta.desc.en, meta.desc.bn)}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CENTER SECTION: Responsive Device Viewport & Zoom Controls */}
      <div className="flex items-center gap-2">
        <div
          role="tablist"
          aria-label={t("Device", "ডিভাইস")}
          className="flex items-center gap-1 rounded-fq-lg border border-border/80 bg-muted/60 p-1 shadow-inner"
        >
          {DEVICE_PRESETS.map((preset) => {
            const isSelected = previewWidth === preset.width;
            return (
              <button
                key={preset.width}
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-label={`${preset.label}px — ${preset.bp}`}
                onClick={() => onWidthChange(preset.width)}
                className={`flex items-center gap-1.5 rounded-fq-md px-2.5 py-1 text-xs font-medium tabular-nums transition-all cursor-pointer ${
                  isSelected
                    ? "bg-background text-foreground shadow-xs ring-1 ring-border/50 font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/40"
                }`}
              >
                <DeviceIcon width={preset.width} />
                <span>{preset.label}</span>
              </button>
            );
          })}
        </div>

        {/* Zoom Fit Controls */}
        {onZoomChange && (
          <div className="hidden lg:flex items-center gap-1 rounded-fq-lg border border-border/60 bg-muted/40 p-0.5 text-xs text-muted-foreground">
            <button
              type="button"
              title={t("Zoom Out", "জুম আউট")}
              onClick={() => onZoomChange(Math.max(0.5, zoom - 0.1))}
              className="rounded px-1.5 py-0.5 hover:bg-background hover:text-foreground cursor-pointer"
            >
              −
            </button>
            <span className="w-10 text-center tabular-nums text-[11px] font-medium text-foreground">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              title={t("Zoom In", "জুম ইন")}
              onClick={() => onZoomChange(Math.min(1.5, zoom + 0.1))}
              className="rounded px-1.5 py-0.5 hover:bg-background hover:text-foreground cursor-pointer"
            >
              +
            </button>
            <button
              type="button"
              title={t("Reset Zoom to 100%", "১০০% জুমে ফিরুন")}
              onClick={() => onZoomChange(1)}
              className="rounded px-1.5 py-0.5 text-[10px] hover:bg-background hover:text-foreground cursor-pointer"
            >
              Fit
            </button>
          </div>
        )}
      </div>

      {/* RIGHT SECTION: Quick Audits, Undo/Redo, Save & Publish */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Bengali Coverage Badge */}
        {typeof coveragePercent === "number" && (
          <button
            type="button"
            onClick={onOpenTranslation}
            title={t(
              "Bilingual translation coverage",
              "দ্বিভাষিক অনুবাদ সম্পূর্ণতা",
            )}
            className="hidden md:inline-flex items-center gap-1.5 rounded-fq-md border border-border/70 bg-background/80 hover:bg-accent px-2 py-1 text-xs font-medium cursor-pointer shadow-xs transition-colors"
          >
            <span className="font-bangla text-[11px] font-bold text-primary">
              বাং
            </span>
            <span className="text-[11px] font-semibold tabular-nums text-foreground">
              {coveragePercent}%
            </span>
          </button>
        )}

        {/* Lint / Checklist Button */}
        {(onChecklistOpen || onOpenLint) && (
          <button
            type="button"
            onClick={onOpenLint ?? onChecklistOpen}
            aria-label={t("Checklist", "চেকলিস্ট")}
            className={`inline-flex h-8 items-center gap-1.5 rounded-fq-md border px-2.5 text-xs font-medium shadow-xs transition-colors cursor-pointer ${
              effectiveErrorCount > 0
                ? "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20"
                : (warningCount ?? 0) > 0
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
                  : "border-border/70 bg-background/80 text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            {effectiveErrorCount > 0 ? (
              <>
                <svg
                  className="size-3.5 text-destructive"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span className="font-semibold tabular-nums">
                  {effectiveErrorCount}
                </span>
                <span className="hidden sm:inline text-[11px]">
                  {t("Errors", "ত্রুটি")}
                </span>
              </>
            ) : (warningCount ?? 0) > 0 ? (
              <>
                <svg
                  className="size-3.5 text-amber-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span className="font-semibold tabular-nums">
                  {warningCount}
                </span>
                <span className="hidden sm:inline text-[11px]">
                  {t("Checks", "চেক")}
                </span>
              </>
            ) : (
              <>
                <svg
                  className="size-3.5 text-emerald-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span className="hidden sm:inline text-[11px] text-foreground font-medium">
                  {t("Checks Pass", "চেক পাস")}
                </span>
              </>
            )}
          </button>
        )}

        <div className="mx-0.5 h-4 w-px bg-border/70" role="separator" />

        {/* Finder (Command Palette) */}
        {onFinderOpen && (
          <button
            type="button"
            onClick={onFinderOpen}
            aria-label={t("Finder (⌘K)", "ফাইন্ডার (⌘K)")}
            title="⌘K"
            className="inline-flex h-8 items-center gap-1 rounded-fq-md border border-border/70 bg-background/80 px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer shadow-xs transition-colors"
          >
            <svg
              className="size-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <kbd className="hidden lg:inline text-[10px] text-muted-foreground/80 font-mono bg-muted px-1 rounded">
              ⌘K
            </kbd>
          </button>
        )}

        {/* Structure / Layers Toggle */}
        {onStructureToggle && (
          <button
            type="button"
            onClick={onStructureToggle}
            aria-label={t("Toggle navigator", "নেভিগেটর টগল")}
            aria-pressed={structureVisible}
            title={t("Toggle layer navigator", "লেয়ার নেভিগেটর")}
            className={`inline-flex size-8 items-center justify-center rounded-fq-md border transition-colors cursor-pointer shadow-xs ${
              structureVisible
                ? "border-primary/50 bg-primary/10 text-primary font-medium"
                : "border-border/70 bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <svg
              className="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </button>
        )}

        {/* Undo / Redo */}
        <div className="flex items-center gap-0.5 rounded-fq-md border border-border/70 bg-background/80 p-0.5 shadow-xs">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label={t("Undo", "আনডু")}
            title="⌘Z"
            className="inline-flex size-7 items-center justify-center rounded-fq-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed transition-colors"
          >
            <svg
              className="size-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 10h10a5 5 0 0 1 0 10H9" />
              <path d="m7 6-4 4 4 4" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            aria-label={t("Redo", "রিডু")}
            title="⇧⌘Z"
            className="inline-flex size-7 items-center justify-center rounded-fq-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed transition-colors"
          >
            <svg
              className="size-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 10H11a5 5 0 0 0 0 10h4" />
              <path d="m17 6 4 4-4 4" />
            </svg>
          </button>
        </div>

        {/* Live Preview Toggle */}
        <button
          type="button"
          onClick={onPreview}
          aria-label={
            isPreview
              ? t("Exit preview", "প্রিভিউ বন্ধ")
              : t("Preview changes", "পরিবর্তন প্রিভিউ")
          }
          title={
            isPreview
              ? t("Exit preview mode", "প্রিভিউ মোড বন্ধ")
              : t("Preview storefront", "স্টোরফ্রন্ট প্রিভিউ")
          }
          className={`inline-flex size-8 items-center justify-center rounded-fq-md border transition-colors cursor-pointer shadow-xs ${
            isPreview
              ? "border-primary bg-primary text-primary-foreground shadow-xs"
              : "border-border/70 bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          {isPreview ? (
            <svg
              className="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          ) : (
            <svg
              className="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>

        <div className="mx-0.5 h-4 w-px bg-border/70" role="separator" />

        {/* Save Draft */}
        <button
          type="button"
          onClick={onSave}
          disabled={saveDisabled}
          className="hidden rounded-fq-md border border-border/80 bg-background/90 hover:bg-muted px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-40 sm:inline-flex sm:items-center cursor-pointer disabled:cursor-not-allowed shadow-xs transition-colors"
        >
          {t("Save", "সেভ")}
        </button>

        {/* Publish */}
        <button
          type="button"
          onClick={onPublish}
          disabled={publishDisabled}
          className="inline-flex items-center gap-1.5 rounded-fq-md bg-primary hover:bg-primary/90 px-3.5 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed shadow-sm transition-all"
        >
          <svg
            className="size-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{t("Publish", "পাবলিশ")}</span>
        </button>
      </div>
    </header>
  );
}
