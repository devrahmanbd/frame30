import { useState } from "react";
import { useLang } from "@/lib/i18n";

type PopupType =
  "modal" | "slide_in" | "notification_bar" | "fullscreen_overlay";
type Position =
  "bottom-left" | "bottom-right" | "top-left" | "top-right" | "center";

interface TriggerRules {
  onPageLoad: boolean;
  pageLoadDelay: number;
  onScroll: boolean;
  scrollThreshold: number;
  onClick: boolean;
  clickSelector: string;
  onInactivity: boolean;
  inactivitySeconds: number;
  exitIntent: boolean;
}

interface DisplayConditions {
  oncePerSession: boolean;
  afterPageviews: boolean;
  pageviewCount: number;
  afterSessions: boolean;
  sessionCount: number;
  frequencyCap: boolean;
  frequencyDays: number;
  referrerContains: string;
  referrerExcludes: string;
  roleIncludes: string;
  roleExcludes: string;
  deviceIs: string[];
  scheduleStart: string;
  scheduleEnd: string;
}

interface CloseBehavior {
  showXButton: boolean;
  clickOutside: boolean;
  escKey: boolean;
  autoClose: boolean;
  autoCloseSeconds: number;
}

const POPUP_TYPES: { value: PopupType; label: string; labelBn: string }[] = [
  { value: "modal", label: "Modal", labelBn: "মডাল" },
  { value: "slide_in", label: "Slide-in", labelBn: "স্লাইড-ইন" },
  {
    value: "notification_bar",
    label: "Notification bar",
    labelBn: "নোটিফিকেশন বার",
  },
  {
    value: "fullscreen_overlay",
    label: "Full-screen overlay",
    labelBn: "ফুল-স্ক্রিন ওভারলে",
  },
];

const POSITIONS: { value: Position; label: string; labelBn: string }[] = [
  { value: "bottom-left", label: "Bottom-left", labelBn: "নিচে-বাম" },
  { value: "bottom-right", label: "Bottom-right", labelBn: "নিচে-ডান" },
  { value: "top-left", label: "Top-left", labelBn: "উপরে-বাম" },
  { value: "top-right", label: "Top-right", labelBn: "উপরে-ডান" },
  { value: "center", label: "Center", labelBn: "কেন্দ্র" },
];

const DEVICES = ["mobile", "tablet", "desktop"] as const;

const defaultTriggers: TriggerRules = {
  onPageLoad: false,
  pageLoadDelay: 3,
  onScroll: false,
  scrollThreshold: 50,
  onClick: false,
  clickSelector: "",
  onInactivity: false,
  inactivitySeconds: 60,
  exitIntent: false,
};

const defaultConditions: DisplayConditions = {
  oncePerSession: false,
  afterPageviews: false,
  pageviewCount: 3,
  afterSessions: false,
  sessionCount: 2,
  frequencyCap: false,
  frequencyDays: 7,
  referrerContains: "",
  referrerExcludes: "",
  roleIncludes: "",
  roleExcludes: "",
  deviceIs: [],
  scheduleStart: "",
  scheduleEnd: "",
};

const defaultClose: CloseBehavior = {
  showXButton: true,
  clickOutside: true,
  escKey: true,
  autoClose: false,
  autoCloseSeconds: 5,
};

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? "bg-primary" : "bg-muted"
        }`}
      >
        <span
          className={`inline-block size-4 rounded-full bg-white transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  unit,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  unit?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-16 rounded-fq-md border border-border bg-card px-2 py-1 text-xs text-right"
        />
        {unit && (
          <span className="text-[10px] text-muted-foreground">{unit}</span>
        )}
      </div>
    </div>
  );
}

export function PopupSettings() {
  const { t } = useLang();
  const [enabled, setEnabled] = useState(false);
  const [popupType, setPopupType] = useState<PopupType>("modal");
  const [position, setPosition] = useState<Position>("bottom-right");
  const [triggers, setTriggers] = useState<TriggerRules>(defaultTriggers);
  const [conditions, setConditions] =
    useState<DisplayConditions>(defaultConditions);
  const [closeBehavior, setCloseBehavior] =
    useState<CloseBehavior>(defaultClose);

  const updateTrigger = <K extends keyof TriggerRules>(
    key: K,
    value: TriggerRules[K],
  ) => {
    setTriggers((prev) => ({ ...prev, [key]: value }));
  };

  const updateCondition = <K extends keyof DisplayConditions>(
    key: K,
    value: DisplayConditions[K],
  ) => {
    setConditions((prev) => ({ ...prev, [key]: value }));
  };

  const updateClose = <K extends keyof CloseBehavior>(
    key: K,
    value: CloseBehavior[K],
  ) => {
    setCloseBehavior((prev) => ({ ...prev, [key]: value }));
  };

  const toggleDevice = (device: string) => {
    setConditions((prev) => ({
      ...prev,
      deviceIs: prev.deviceIs.includes(device)
        ? prev.deviceIs.filter((d) => d !== device)
        : [...prev.deviceIs, device],
    }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">
          {t("Popup builder", "পপআপ বিল্ডার")}
        </label>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled(!enabled)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            enabled ? "bg-primary" : "bg-muted"
          }`}
        >
          <span
            className={`inline-block size-4 rounded-full bg-white transition-transform ${
              enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {enabled && (
        <>
          {/* Popup type */}
          <div className="space-y-1">
            <label className="text-xs font-medium">
              {t("Popup type", "পপআপ ধরন")}
            </label>
            <div className="grid grid-cols-2 gap-1">
              {POPUP_TYPES.map((pt) => (
                <button
                  key={pt.value}
                  type="button"
                  onClick={() => setPopupType(pt.value)}
                  className={`rounded-fq-md px-2 py-1.5 text-xs ${
                    popupType === pt.value
                      ? "bg-primary text-primary-foreground"
                      : "border border-border"
                  }`}
                >
                  {t(pt.label, pt.labelBn)}
                </button>
              ))}
            </div>
          </div>

          {/* Trigger rules */}
          <div className="space-y-2 rounded-fq-md border border-border p-3">
            <p className="text-xs font-medium">
              {t("Trigger rules", "ট্রিগার নিয়ম")}
            </p>
            <Toggle
              checked={triggers.onPageLoad}
              onChange={(v) => updateTrigger("onPageLoad", v)}
              label={t("On page load", "পেজ লোডে")}
            />
            {triggers.onPageLoad && (
              <NumberField
                label={t("Delay (seconds)", "বিলম্বে (সেকেন্ড)")}
                value={triggers.pageLoadDelay}
                onChange={(v) => updateTrigger("pageLoadDelay", v)}
                min={0}
                max={60}
                unit="s"
              />
            )}
            <Toggle
              checked={triggers.onScroll}
              onChange={(v) => updateTrigger("onScroll", v)}
              label={t("On scroll", "স্ক্রলে")}
            />
            {triggers.onScroll && (
              <NumberField
                label={t("Scroll threshold (%)", "স্ক্রল থ্রেশহোল্ড (%)")}
                value={triggers.scrollThreshold}
                onChange={(v) => updateTrigger("scrollThreshold", v)}
                min={1}
                max={100}
                unit="%"
              />
            )}
            <Toggle
              checked={triggers.onClick}
              onChange={(v) => updateTrigger("onClick", v)}
              label={t("On click", "ক্লিকে")}
            />
            {triggers.onClick && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs shrink-0">
                  {t("CSS selector", "CSS সিলেক্টর")}
                </span>
                <input
                  type="text"
                  value={triggers.clickSelector}
                  onChange={(e) =>
                    updateTrigger("clickSelector", e.target.value)
                  }
                  placeholder=".cta-button"
                  className="min-w-0 flex-1 rounded-fq-md border border-border bg-card px-2 py-1 text-xs"
                />
              </div>
            )}
            <Toggle
              checked={triggers.onInactivity}
              onChange={(v) => updateTrigger("onInactivity", v)}
              label={t("After inactivity", "নিষ্ক্রিয়তার পর")}
            />
            {triggers.onInactivity && (
              <NumberField
                label={t("Inactivity (seconds)", "নিষ্ক্রিয়তা (সেকেন্ড)")}
                value={triggers.inactivitySeconds}
                onChange={(v) => updateTrigger("inactivitySeconds", v)}
                min={5}
                max={3600}
                unit="s"
              />
            )}
            <Toggle
              checked={triggers.exitIntent}
              onChange={(v) => updateTrigger("exitIntent", v)}
              label={t(
                "Exit intent (desktop only)",
                "এক্সিট ইন্টেন্ট (শুধু ডেস্কটপ)",
              )}
            />
          </div>

          {/* Display conditions */}
          <div className="space-y-2 rounded-fq-md border border-border p-3">
            <p className="text-xs font-medium">
              {t("Display conditions", "প্রদর্শন শর্ত")}
            </p>
            <Toggle
              checked={conditions.oncePerSession}
              onChange={(v) => updateCondition("oncePerSession", v)}
              label={t("Show once per session", "প্রতি সেশনে একবার দেখান")}
            />
            <Toggle
              checked={conditions.afterPageviews}
              onChange={(v) => updateCondition("afterPageviews", v)}
              label={t("Show after X pageviews", "X পেজভিউ-এর পর দেখান")}
            />
            {conditions.afterPageviews && (
              <NumberField
                label={t("Pageviews", "পেজভিউ")}
                value={conditions.pageviewCount}
                onChange={(v) => updateCondition("pageviewCount", v)}
                min={1}
              />
            )}
            <Toggle
              checked={conditions.afterSessions}
              onChange={(v) => updateCondition("afterSessions", v)}
              label={t("Show after X sessions", "X সেশনের পর দেখান")}
            />
            {conditions.afterSessions && (
              <NumberField
                label={t("Sessions", "সেশন")}
                value={conditions.sessionCount}
                onChange={(v) => updateCondition("sessionCount", v)}
                min={1}
              />
            )}
            <Toggle
              checked={conditions.frequencyCap}
              onChange={(v) => updateCondition("frequencyCap", v)}
              label={t("Frequency cap", "ফ্রিকোয়েন্সি ক্যাপ")}
            />
            {conditions.frequencyCap && (
              <NumberField
                label={t("Every X days", "প্রতি X দিন")}
                value={conditions.frequencyDays}
                onChange={(v) => updateCondition("frequencyDays", v)}
                min={1}
              />
            )}

            <div className="space-y-1">
              <span className="text-xs">
                {t("Referrer contains", "রেফারার অন্তর্ভুক্ত")}
              </span>
              <input
                type="text"
                value={conditions.referrerContains}
                onChange={(e) =>
                  updateCondition("referrerContains", e.target.value)
                }
                placeholder="example.com"
                className="w-full rounded-fq-md border border-border bg-card px-2 py-1 text-xs"
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs">
                {t("Referrer excludes", "রেফারার বাদ দেয়")}
              </span>
              <input
                type="text"
                value={conditions.referrerExcludes}
                onChange={(e) =>
                  updateCondition("referrerExcludes", e.target.value)
                }
                placeholder="example.com"
                className="w-full rounded-fq-md border border-border bg-card px-2 py-1 text-xs"
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs">
                {t("User role includes", "ব্যবহারকারী ভূমিকা অন্তর্ভুক্ত")}
              </span>
              <input
                type="text"
                value={conditions.roleIncludes}
                onChange={(e) =>
                  updateCondition("roleIncludes", e.target.value)
                }
                placeholder="admin, editor"
                className="w-full rounded-fq-md border border-border bg-card px-2 py-1 text-xs"
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs">
                {t("User role excludes", "ব্যবহারকারী ভূমিকা বাদ দেয়")}
              </span>
              <input
                type="text"
                value={conditions.roleExcludes}
                onChange={(e) =>
                  updateCondition("roleExcludes", e.target.value)
                }
                placeholder="admin"
                className="w-full rounded-fq-md border border-border bg-card px-2 py-1 text-xs"
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs">{t("Devices", "ডিভাইস")}</span>
              <div className="flex gap-1">
                {DEVICES.map((device) => (
                  <button
                    key={device}
                    type="button"
                    onClick={() => toggleDevice(device)}
                    className={`rounded-fq-md px-2 py-1 text-[11px] ${
                      conditions.deviceIs.includes(device)
                        ? "bg-primary text-primary-foreground"
                        : "border border-border"
                    }`}
                  >
                    {device}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <span className="text-xs">
                  {t("Schedule start", "শিডিউল শুরু")}
                </span>
                <input
                  type="datetime-local"
                  value={conditions.scheduleStart}
                  onChange={(e) =>
                    updateCondition("scheduleStart", e.target.value)
                  }
                  className="w-full rounded-fq-md border border-border bg-card px-2 py-1 text-xs"
                />
              </div>
              <div className="flex-1 space-y-1">
                <span className="text-xs">
                  {t("Schedule end", "শিডিউল শেষ")}
                </span>
                <input
                  type="datetime-local"
                  value={conditions.scheduleEnd}
                  onChange={(e) =>
                    updateCondition("scheduleEnd", e.target.value)
                  }
                  className="w-full rounded-fq-md border border-border bg-card px-2 py-1 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Position */}
          <div className="space-y-1">
            <label className="text-xs font-medium">
              {t("Position", "অবস্থান")}
            </label>
            <div className="grid grid-cols-3 gap-1">
              {POSITIONS.map((pos) => (
                <button
                  key={pos.value}
                  type="button"
                  onClick={() => setPosition(pos.value)}
                  className={`rounded-fq-md px-2 py-1.5 text-xs ${
                    position === pos.value
                      ? "bg-primary text-primary-foreground"
                      : "border border-border"
                  }`}
                >
                  {t(pos.label, pos.labelBn)}
                </button>
              ))}
            </div>
          </div>

          {/* Close behavior */}
          <div className="space-y-2 rounded-fq-md border border-border p-3">
            <p className="text-xs font-medium">
              {t("Close behavior", "বন্ধ আচরণ")}
            </p>
            <Toggle
              checked={closeBehavior.showXButton}
              onChange={(v) => updateClose("showXButton", v)}
              label={t("X button", "X বোতাম")}
            />
            <Toggle
              checked={closeBehavior.clickOutside}
              onChange={(v) => updateClose("clickOutside", v)}
              label={t("Click outside", "বাইরে ক্লিক")}
            />
            <Toggle
              checked={closeBehavior.escKey}
              onChange={(v) => updateClose("escKey", v)}
              label={t("ESC key", "ESC কী")}
            />
            <Toggle
              checked={closeBehavior.autoClose}
              onChange={(v) => updateClose("autoClose", v)}
              label={t("Auto-close", "অটো-ক্লোজ")}
            />
            {closeBehavior.autoClose && (
              <NumberField
                label={t("Auto-close after", "অটো-ক্লোজ পরে")}
                value={closeBehavior.autoCloseSeconds}
                onChange={(v) => updateClose("autoCloseSeconds", v)}
                min={1}
                max={120}
                unit="s"
              />
            )}
          </div>

          {/* Preview */}
          <div className="rounded-fq-md border border-border p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">
              {t("Preview", "প্রিভিউ")}
            </p>
            <p className="mt-1">
              {t("Type:", "ধরন:")}{" "}
              {POPUP_TYPES.find((p) => p.value === popupType)?.label ??
                popupType}{" "}
              · {t("Position:", "অবস্থান:")} {position.replace("-", " ")}
            </p>
            <p className="mt-1">
              {t("Triggers:", "ট্রিগার:")}{" "}
              {[
                triggers.onPageLoad && t("page load", "পেজ লোড"),
                triggers.onScroll &&
                  `${t("scroll", "স্ক্রল")} ${triggers.scrollThreshold}%`,
                triggers.onClick && t("click", "ক্লিক"),
                triggers.onInactivity &&
                  `${t("inactivity", "নিষ্ক্রিয়তা")} ${triggers.inactivitySeconds}s`,
                triggers.exitIntent && t("exit intent", "এক্সিট ইন্টেন্ট"),
              ]
                .filter(Boolean)
                .join(", ") || t("none", "নেই")}
            </p>
            <p className="mt-1">
              {t("Close:", "বন্ধ:")}{" "}
              {[
                closeBehavior.showXButton && "X",
                closeBehavior.clickOutside && t("outside", "বাইরে"),
                closeBehavior.escKey && "ESC",
                closeBehavior.autoClose && `${closeBehavior.autoCloseSeconds}s`,
              ]
                .filter(Boolean)
                .join(", ") || t("none", "নেই")}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
