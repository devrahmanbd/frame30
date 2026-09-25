import { useState, useRef, useEffect } from "react";
import { Globe, Clock, Check, RotateCcw } from "@/components/icons/tabler";
import { useLang } from "@/lib/i18n";
import {
  COMMON_TIMEZONES,
  DEFAULT_MERCHANT_TIMEZONE,
  detectBrowserTimezone,
  useCustomerTimezone,
} from "@/lib/timezone";

interface TimezoneToggleProps {
  storeTimezone?: string;
  allowCustomerTimezone?: boolean;
  className?: string;
}

export function TimezoneToggle({
  storeTimezone = DEFAULT_MERCHANT_TIMEZONE,
  allowCustomerTimezone = false,
  className = "",
}: TimezoneToggleProps) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const {
    effectiveTimezone,
    customerTimezone,
    setTimezone,
    resetToStoreDefault,
  } = useCustomerTimezone(storeTimezone, allowCustomerTimezone);

  // Close dropdown on outside click or Esc
  useEffect(() => {
    if (!open) return;
    const handleDown = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key === "Escape") {
        setOpen(false);
      } else if (
        e instanceof MouseEvent &&
        menuRef.current &&
        !menuRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handleDown);
    window.addEventListener("keydown", handleDown);
    return () => {
      window.removeEventListener("mousedown", handleDown);
      window.removeEventListener("keydown", handleDown);
    };
  }, [open]);

  // If merchant has disabled customer timezone selection, render nothing
  if (!allowCustomerTimezone) {
    return null;
  }

  // Find matching option for label or derive city name
  const currentOption = COMMON_TIMEZONES.find(
    (tz) => tz.value === effectiveTimezone,
  );
  const displayLabel = currentOption
    ? currentOption.offset
    : (effectiveTimezone.split("/").pop()?.replace(/_/g, " ") ??
      effectiveTimezone);

  const handleAutoDetect = () => {
    const detected = detectBrowserTimezone();
    setTimezone(detected);
    setOpen(false);
  };

  return (
    <div
      ref={menuRef}
      className={`relative inline-block text-left ${className}`}
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={t("Select timezone", "টাইমজোন পরিবর্তন")}
        title={`${t("Active timezone:", "সক্রিয় টাইমজোন:")} ${effectiveTimezone}`}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-fq-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50 transition-colors focus-visible:ring-2 focus-visible:ring-primary outline-none"
      >
        <Globe className="size-3.5 text-primary shrink-0" aria-hidden />
        <span className="tabular-nums font-mono">{displayLabel}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t("Timezone settings", "টাইমজোন সেটিংস")}
          className="absolute right-0 mt-2 w-72 max-h-96 overflow-y-auto rounded-fq-lg border border-border bg-popover p-2 text-popover-foreground shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="border-b border-border/70 pb-2 px-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Clock className="size-3.5 text-primary" />
                {t("Display Timezone", "প্রদর্শিত টাইমজোন")}
              </span>
              {customerTimezone && (
                <button
                  type="button"
                  onClick={() => {
                    resetToStoreDefault();
                    setOpen(false);
                  }}
                  className="flex items-center gap-1 text-[0.65rem] text-muted-foreground hover:text-foreground transition-colors"
                  title={t(
                    "Reset to store timezone",
                    "স্টোর টাইমজোনে রিসেট করুন",
                  )}
                >
                  <RotateCcw className="size-3" />
                  {t("Store default", "স্টোর ডিফল্ট")}
                </button>
              )}
            </div>
            <p className="mt-0.5 text-[0.65rem] text-muted-foreground">
              {t(
                "Timestamps across the storefront will format in this timezone.",
                "স্টোরফ্রন্টের সব সময় এই টাইমজোনে দেখানো হবে।",
              )}
            </p>
          </div>

          <div className="pt-2 pb-1 px-1">
            <button
              type="button"
              onClick={handleAutoDetect}
              className="w-full flex items-center justify-between rounded-fq-sm px-2 py-1.5 text-xs text-primary font-medium hover:bg-muted transition-colors text-left"
            >
              <span>
                {t(
                  "Auto-detect my device timezone",
                  "আমার ডিভাইসের টাইমজোন দিন",
                )}
              </span>
              <span className="text-[0.65rem] font-mono text-muted-foreground">
                {detectBrowserTimezone()}
              </span>
            </button>
          </div>

          <div className="mt-1 max-h-60 overflow-y-auto divide-y divide-border/40 space-y-1">
            {Array.from(new Set(COMMON_TIMEZONES.map((tz) => tz.region))).map(
              (region) => (
                <div key={region} className="pt-1.5 first:pt-0">
                  <span className="px-2 block text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                    {region}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {COMMON_TIMEZONES.filter((tz) => tz.region === region).map(
                      (tz) => {
                        const isSelected = effectiveTimezone === tz.value;
                        return (
                          <button
                            key={tz.value}
                            type="button"
                            onClick={() => {
                              setTimezone(tz.value);
                              setOpen(false);
                            }}
                            className={`w-full flex items-center justify-between rounded-fq-sm px-2 py-1.5 text-xs transition-colors text-left ${
                              isSelected
                                ? "bg-primary/10 text-primary font-medium"
                                : "text-foreground hover:bg-muted"
                            }`}
                          >
                            <div className="truncate pr-2">
                              <span className="block truncate">{tz.label}</span>
                              <span className="block text-[0.65rem] font-mono text-muted-foreground">
                                {tz.offset}
                              </span>
                            </div>
                            {isSelected && (
                              <Check className="size-3.5 text-primary shrink-0" />
                            )}
                          </button>
                        );
                      },
                    )}
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}
