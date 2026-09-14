import { useMemo, useState } from "react";
import { ADVANCED_FIELDS } from "@/lib/builder-advanced";
import {
  BREAKPOINTS,
  catalogEntry,
  isContextMismatch,
  type Breakpoint,
  type Field,
  type PropRow,
  type PropScalar,
  type PropValue,
  type Section,
  type TemplateKey,
} from "@/lib/builder-ast";
import { biTextState, bnKey, type Locale } from "@/lib/bitext";
import { useLang } from "@/lib/i18n";
import { inheritanceOf } from "@/lib/responsive";
import { altKey, sizesKey } from "@/lib/media";
import { taxonomyOptions } from "@/lib/taxonomy";
import { unitLabel } from "@/lib/unit-format";
import { dataEmptyState, missingBindings, widgetHelp } from "@/lib/widget-metadata";
import type { VisibilityRule } from "@/lib/visibility";
import { ArrayFieldEditor } from "./ArrayFieldEditor";
import { MediaPicker } from "./MediaPicker";
import { VisibilityRules } from "./VisibilityRules";

/**
 * Phase 1.1 — the bilingual field editor.
 *
 * English and বাংলা are two tabs over one logical field, with a coverage chip
 * so a merchant can see at a glance which strings still fall back. বাংলা is
 * typed in a `lang="bn"` box so the matra-safe stack applies while editing.
 */
function BiTextField({
  field,
  id,
  en,
  bn,
  editable,
  onChange,
  className,
}: {
  field: Field;
  id: string;
  en: string;
  bn: string;
  editable: boolean;
  onChange: (key: string, value: string) => void;
  className: string;
}) {
  const [tab, setTab] = useState<Locale>("en");
  const state = biTextState({ en, bn });
  const long = (field.max ?? 200) > 200;
  const value = tab === "en" ? en : bn;
  const key = tab === "en" ? field.key : bnKey(field.key);
  const commonProps = {
    id,
    disabled: !editable,
    maxLength: field.max ?? 200,
    value,
    className,
    lang: tab === "bn" ? "bn" : undefined,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(key, event.target.value),
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="block text-xs font-medium">
          {field.label}
        </label>
        <span
          className={`rounded-fq-sm px-1.5 py-0.5 text-[0.6rem] ${
            state === "ok"
              ? "bg-success-soft text-success-foreground"
              : state === "fallback"
                ? "bg-warning-soft text-warning-foreground"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {state === "ok" ? "EN + বাংলা" : state === "fallback" ? "EN only" : "empty"}
        </span>
      </div>

      <div role="tablist" aria-label={field.label} className="flex gap-1">
        {(["en", "bn"] as const).map((locale) => (
          <button
            key={locale}
            type="button"
            role="tab"
            aria-selected={tab === locale}
            onClick={() => setTab(locale)}
            className={`rounded-fq-sm px-2 py-1 text-[0.65rem] ${
              tab === locale ? "bg-primary text-primary-foreground" : "border border-border"
            }`}
          >
            {locale === "en" ? "English" : "বাংলা"}
          </button>
        ))}
      </div>

      {long ? <textarea rows={4} {...commonProps} /> : <input type="text" {...commonProps} />}

      {tab === "bn" && !bn.trim() && en.trim() && (
        <p className="text-[0.65rem] text-muted-foreground">
          বাংলা অনুবাদ নেই — বাংলা পেজে ইংরেজি দেখানো হবে।
        </p>
      )}
    </div>
  );
}


type PanelKey = "content" | "layout" | "style" | "advanced";

type Props = {
  section: Section | null;
  template: TemplateKey;
  /** Breakpoint currently previewed; drives which layer edits are written to. */
  device: Breakpoint;
  onChange: (key: string, value: PropValue, device: Breakpoint) => void;
  onClearOverride: (key: string, device: Breakpoint) => void;
  onToggleHidden: (breakpoint: Breakpoint) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  /** Phase 3.2: conditional visibility rules for this node. */
  onWhenChange?: (rules: VisibilityRule[]) => void;
  /** Phase 3.2: bind this node to an experiment variant. */
  onAbChange?: (ab: Section["ab"]) => void;
};

const BP_LABEL: Record<Breakpoint, { en: string; bn: string }> = {
  desktop: { en: "Desktop", bn: "ডেস্কটপ" },
  tablet: { en: "Tablet", bn: "ট্যাবলেট" },
  mobile: { en: "Mobile", bn: "মোবাইল" },
};

const PANEL_ORDER: PanelKey[] = ["content", "layout", "style", "advanced"];
const PANEL_LABEL: Record<PanelKey, { en: string; bn: string }> = {
  content: { en: "Content", bn: "কন্টেন্ট" },
  layout: { en: "Layout", bn: "লেআউট" },
  style: { en: "Style", bn: "স্টাইল" },
  advanced: { en: "Advanced", bn: "অ্যাডভান্সড" },
};

/** Client-side field validation; the server re-validates every value on save. */
function fieldError(field: Field, value: PropValue | undefined): string | null {
  if (field.kind === "url" && typeof value === "string" && value.trim()) {
    if (!/^(https?:\/\/|\/)/i.test(value.trim())) return "Use an https:// or /relative URL";
  }
  if (field.kind === "number" && value !== undefined && Number.isNaN(Number(value))) {
    return "Enter a number";
  }
  if (typeof value === "string" && field.max && value.length > field.max) {
    return `Maximum ${field.max} characters`;
  }
  return null;
}

/** Field editor for the selected widget, driven entirely by the AST catalog. */
export function SectionInspector({
  section,
  template,
  device,
  onChange,
  onClearOverride,
  onToggleHidden,
  onDelete,
  onDuplicate,
  onWhenChange,
  onAbChange,
}: Props) {
  const { t } = useLang();
  const [panel, setPanel] = useState<PanelKey>("content");
  const entry = section ? catalogEntry(section.type) : undefined;

  const grouped = useMemo(() => {
    const out: Record<PanelKey, Field[]> = { content: [], layout: [], style: [], advanced: [] };
    const fields = entry?.fields ?? [];
    // Phase 3.3: alt text and the sizes preset are rendered inside their image
    // field's block, so they are skipped here.
    const owned = new Set(
      fields.filter((f) => f.kind === "image").flatMap((f) => [altKey(f.key), sizesKey(f.key)]),
    );
    for (const field of fields) {
      if (owned.has(field.key)) continue;
      out[field.panel ?? "content"].push(field);
    }
    // Elementor parity: the Advanced controls exist on every widget, so they
    // are appended here rather than repeated across the catalog.
    out.advanced.push(...ADVANCED_FIELDS);
    return out;
  }, [entry]);


  if (!section) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("Select a section to edit its content.", "কন্টেন্ট এডিট করতে একটি সেকশন বাছুন।")}
      </p>
    );
  }

  if (!entry) {
    return (
      <div className="space-y-3">
        <p className="rounded-fq-md border border-danger bg-danger-soft p-3 text-sm text-danger-foreground">
          {t("This widget is not supported by the current theme engine.", "বর্তমান থিম ইঞ্জিন এই উইজেট সাপোর্ট করে না।")}
        </p>
        <button type="button" onClick={onDelete} className="text-sm text-danger-foreground underline">
          {t("Remove section", "সেকশন মুছুন")}
        </button>
      </div>
    );
  }

  const hidden = section.hidden ?? [];
  const mismatch = isContextMismatch(section.type, template);
  const activePanels = PANEL_ORDER.filter((key) => grouped[key].length > 0);
  const current = activePanels.includes(panel) ? panel : (activePanels[0] ?? "content");

  const renderField = (field: Field) => {
    const id = `${section.id}-${field.key}-${device}`;
    // Phase 5: the value shown is the one the device actually renders with,
    // resolved through the same mobile ← tablet ← desktop cascade the
    // storefront compiles. `inherited` drives the "coming from a wider layer"
    // hint; `overridden` decides whether a reset is even meaningful here.
    const inheritance = inheritanceOf<PropValue>(section, field.key, device);
    const overridden = inheritance.overridden && device !== "desktop";
    const editable = device === "desktop" || field.responsive;
    const value = inheritance.value;
    const error = fieldError(field, value);
    const errorId = `${id}-error`;
    const shared = `w-full rounded-fq-md border bg-card px-3 py-2 text-sm ${
      error ? "border-danger" : "border-border"
    }`;

    // Phase 3.2: a titled cluster of sub-fields, stored flat.
    if (field.kind === "group") {
      return (
        <fieldset key={field.key} className="space-y-3 rounded-fq-md border border-border p-3">
          <legend className="px-1 text-xs font-medium">{field.label}</legend>
          {(field.fields ?? []).map(renderField)}
        </fieldset>
      );
    }

    // Phase 3.2: repeatable rows (spec groups, FAQ, hotspots, quiz steps…).
    if (field.kind === "array") {
      const rows = Array.isArray(section.props[field.key])
        ? (section.props[field.key] as PropRow[])
        : [];
      return (
        <ArrayFieldEditor
          key={field.key}
          field={field}
          rows={rows}
          onChange={(next) => onChange(field.key, next, "desktop")}
          renderRowField={(sub, row, set) => (
            <div key={sub.key} className="space-y-1">
              <label className="block text-xs font-medium">{sub.label}</label>
              {sub.kind === "boolean" ? (
                <input
                  type="checkbox"
                  checked={row[sub.key] === true}
                  onChange={(e) => set(sub.key, e.target.checked)}
                  className="size-4 rounded border-border"
                />
              ) : sub.kind === "select" || sub.kind === "taxonomy" ? (
                <select
                  value={String(row[sub.key] ?? "")}
                  onChange={(e) => set(sub.key, e.target.value)}
                  className={shared}
                >
                  <option value="">—</option>
                  {(sub.kind === "taxonomy"
                    ? taxonomyOptions(sub.source ?? "category").map((o) => ({
                        value: o.value,
                        label: t(o.en, o.bn),
                      }))
                    : (sub.options ?? [])
                  ).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : sub.kind === "textarea" ? (
                <textarea
                  rows={3}
                  value={String(row[sub.key] ?? "")}
                  onChange={(e) => set(sub.key, e.target.value)}
                  className={shared}
                />
              ) : (
                <input
                  type={
                    sub.kind === "number" || sub.kind === "range" || sub.kind === "unit"
                      ? "number"
                      : sub.kind === "color"
                        ? "color"
                        : "text"
                  }
                  value={String(row[sub.key] ?? "")}
                  onChange={(e) =>
                    set(
                      sub.key,
                      sub.kind === "number" || sub.kind === "range" || sub.kind === "unit"
                        ? Number(e.target.value)
                        : (e.target.value as PropScalar),
                    )
                  }
                  className={shared}
                />
              )}
            </div>
          )}
        />
      );
    }

    // Phase 1.1: bilingual prose gets an EN / বাংলা tab pair instead of one box.
    if (field.kind === "bitext") {
      return (
        <BiTextField
          key={field.key}
          field={field}
          id={id}
          editable={editable === true}
          en={typeof section.props[field.key] === "string" ? (section.props[field.key] as string) : ""}
          bn={
            typeof section.props[bnKey(field.key)] === "string"
              ? (section.props[bnKey(field.key)] as string)
              : ""
          }
          onChange={(key, next) => onChange(key, next, "desktop")}
          className={shared}
        />
      );
    }

    // Phase 3.3: image props get the media picker, alt text and a sizes preset.
    if (field.kind === "image") {
      const altField: Field = { ...field, key: altKey(field.key), label: `${field.label} — alt`, kind: "bitext", max: 200 };
      return (
        <div key={field.key} className="space-y-2">
          <span className="block text-xs font-medium">{field.label}</span>
          <MediaPicker
            value={typeof value === "string" ? value : ""}
            sizesPreset={String(section.props[sizesKey(field.key)] ?? "full")}
            disabled={!editable}
            onPick={(url, meta) => {
              onChange(field.key, url, "desktop");
              /* Inherit the library's alt text, but never over an author's. */
              const existing = section.props[altKey(field.key)];
              if (meta?.altText && !(typeof existing === "string" && existing.trim())) {
                onChange(altKey(field.key), meta.altText, "desktop");
              }
            }}

            onSizes={(preset) => onChange(sizesKey(field.key), preset, "desktop")}
          />
          <BiTextField
            field={altField}
            id={`${id}-alt`}
            editable={editable === true}
            en={typeof section.props[altKey(field.key)] === "string" ? (section.props[altKey(field.key)] as string) : ""}
            bn={
              typeof section.props[bnKey(altKey(field.key))] === "string"
                ? (section.props[bnKey(altKey(field.key))] as string)
                : ""
            }
            onChange={(key, next) => onChange(key, next, "desktop")}
            className={shared}
          />
        </div>
      );
    }



    return (

      <div key={field.key} className="space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={id} className="block text-xs font-medium">
            {field.label}
          </label>
          {device !== "desktop" && field.responsive && (
            <span className="text-[0.65rem] text-muted-foreground">
              {overridden
                ? t(`${BP_LABEL[device].en} override`, `${BP_LABEL[device].bn} ওভাররাইড`)
                : t("Inherited", "উত্তরাধিকারী")}
            </span>
          )}
        </div>

        {field.kind === "html" ? (
          <div className="space-y-1">
            <textarea
              id={id}
              rows={8}
              spellCheck={false}
              maxLength={field.max ?? 8000}
              disabled={!editable}
              value={typeof value === "string" ? value : ""}
              onChange={(e) => onChange(field.key, e.target.value, device)}
              className={`${shared} font-mono text-xs`}
            />
            <p className="text-[0.65rem] text-muted-foreground">
              {t(
                "Rendered in a sandboxed frame — scripts and inline handlers are removed.",
                "স্যান্ডবক্স ফ্রেমে দেখানো হয় — স্ক্রিপ্ট ও ইনলাইন হ্যান্ডলার সরানো হয়।",
              )}
            </p>
          </div>
        ) : field.kind === "textarea" ? (
          <textarea
            id={id}
            rows={4}
            maxLength={field.max ?? 2000}
            disabled={!editable}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(field.key, e.target.value, device)}
            className={shared}
          />
        ) : field.kind === "select" ? (
          <select
            id={id}
            disabled={!editable}
            value={typeof value === "string" ? value : (field.options?.[0]?.value ?? "")}
            onChange={(e) => onChange(field.key, e.target.value, device)}
            className={shared}
          >
            {(field.options ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : field.kind === "taxonomy" ? (
          <select
            id={id}
            disabled={!editable}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(field.key, e.target.value, device)}
            className={shared}
          >
            <option value="">—</option>
            {taxonomyOptions(field.source ?? "category").map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.en, option.bn)}
              </option>
            ))}
          </select>
        ) : field.kind === "color" ? (
          <input
            id={id}
            type="color"
            disabled={!editable}
            value={typeof value === "string" && value ? value : "#000000"}
            onChange={(e) => onChange(field.key, e.target.value, device)}
            className="h-9 w-full rounded-fq-md border border-border bg-card"
          />
        ) : field.kind === "range" || field.kind === "unit" ? (
          <div className="flex items-center gap-2">
            <input
              id={id}
              type={field.kind === "range" ? "range" : "number"}
              disabled={!editable}
              min={field.min ?? 0}
              max={typeof field.max === "number" ? field.max : 100}
              step={field.step ?? 1}
              value={typeof value === "number" ? value : Number(value ?? 0) || 0}
              onChange={(e) => onChange(field.key, Number(e.target.value), device)}
              className={field.kind === "range" ? "w-full" : shared}
            />
            <span className="w-16 shrink-0 text-[0.65rem] text-muted-foreground">
              {typeof value === "number" ? value : 0}
              {field.unit ? ` ${unitLabel(field.unit, "en")}` : ""}
            </span>
          </div>
        ) : field.kind === "boolean" ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              id={id}
              type="checkbox"
              disabled={!editable}
              checked={value === true || value === "true"}
              onChange={(e) => onChange(field.key, e.target.checked, device)}
              className="size-4 rounded border-border"
            />
            {t("Enabled", "চালু")}
          </label>
        ) : (
          <input
            id={id}
            type={field.kind === "number" ? "number" : field.kind === "url" ? "url" : "text"}
            maxLength={field.max ?? 200}
            disabled={!editable}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            value={typeof value === "number" || typeof value === "string" ? String(value) : ""}
            onChange={(e) =>
              onChange(
                field.key,
                field.kind === "number" ? Number(e.target.value) : e.target.value,
                device,
              )
            }
            className={shared}
          />
        )}

        <div className="flex items-center justify-between gap-2">
          <p id={errorId} className="text-[0.65rem] text-danger-foreground">
            {error ? t(error, error) : ""}
          </p>
          <div className="flex items-center gap-2">
            {device !== "desktop" && field.responsive && (
              <span
                className={`rounded-full px-2 py-0.5 text-[0.6rem] ${
                  overridden ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                }`}
                title={
                  overridden
                    ? t("Set on this device layer.", "এই ডিভাইস লেয়ারে সেট করা।")
                    : t("Value comes from a wider layer.", "মান বড় লেয়ার থেকে আসছে।")
                }
              >
                {overridden
                  ? t(`Overridden on ${device}`, `${BP_LABEL[device].bn}-এ ওভাররাইড`)
                  : t(
                      `Inherited from ${inheritance.source === "default" ? "default" : inheritance.source}`,
                      `${
                        inheritance.source === "default"
                          ? "ডিফল্ট"
                          : BP_LABEL[inheritance.source as Breakpoint].bn
                      } থেকে ইনহেরিটেড`,
                    )}
              </span>
            )}
            {overridden && (
              <button
                type="button"
                onClick={() => onClearOverride(field.key, device)}
                className="text-[0.65rem] text-muted-foreground underline"
              >
                {t("Reset to inherited", "ইনহেরিটেডে ফিরুন")}
              </button>
            )}
          </div>
        </div>

        {!editable && (
          <p className="text-[0.65rem] text-muted-foreground">
            {t(
              "Edit this field on desktop; it applies to every breakpoint.",
              "এই ফিল্ড ডেস্কটপে এডিট করুন; এটি সব ব্রেকপয়েন্টে প্রযোজ্য।",
            )}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-bangla-display text-sm font-semibold">{entry.label}</h3>
        <p className="text-xs text-muted-foreground">{section.id}</p>
      </div>

      {mismatch && (
        <p className="rounded-fq-md border border-warning bg-warning-soft p-2 text-xs text-warning-foreground">
          {t(
            "This widget has no live data on this template and renders a placeholder.",
            "এই টেমপ্লেটে এই উইজেটের লাইভ ডেটা নেই, প্লেসহোল্ডার দেখাবে।",
          )}
        </p>
      )}

      {device !== "desktop" && (
        <p className="rounded-fq-md border border-border bg-muted p-2 text-xs text-muted-foreground">
          {t(
            `Editing the ${BP_LABEL[device].en.toLowerCase()} layer. Values inherit from desktop until overridden.`,
            `${BP_LABEL[device].bn} লেয়ার এডিট করছেন। ওভাররাইড না করলে ডেস্কটপ থেকে মান আসবে।`,
          )}
        </p>
      )}

      <p className="rounded-fq-md border border-border bg-card p-2 text-xs text-muted-foreground">
        {t(widgetHelp(section.type).en, widgetHelp(section.type).bn)}
      </p>

      {(() => {
        const empty = dataEmptyState(section.type);
        const missing = missingBindings(section.type, section.props);
        if (!empty || missing.length === 0) return null;
        return (
          <p className="rounded-fq-md border border-warning bg-warning-soft p-2 text-xs text-warning-foreground">
            {t(empty.en, empty.bn)}
          </p>
        );
      })()}

      {activePanels.length > 1 && (
        <div role="tablist" aria-label={t("Field groups", "ফিল্ড গ্রুপ")} className="flex flex-wrap gap-1">
          {activePanels.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={current === key}
              onClick={() => setPanel(key)}
              className={`rounded-fq-md px-2 py-1.5 text-xs ${
                current === key ? "bg-primary text-primary-foreground" : "border border-border"
              }`}
            >
              {t(PANEL_LABEL[key].en, PANEL_LABEL[key].bn)}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-4">{grouped[current].map(renderField)}</div>

      {onWhenChange && (
        <VisibilityRules rules={section.when ?? []} onChange={onWhenChange} />
      )}

      {onAbChange && (
        <fieldset className="space-y-2 rounded-fq-md border border-border p-3">
          <legend className="px-1 text-xs font-medium">{t("A/B variant", "A/B ভ্যারিয়েন্ট")}</legend>
          <input
            type="text"
            placeholder={t("Experiment key", "এক্সপেরিমেন্ট কী")}
            value={section.ab?.experiment ?? ""}
            onChange={(e) =>
              onAbChange({ experiment: e.target.value, variant: section.ab?.variant ?? "" })
            }
            className="w-full rounded-fq-md border border-border bg-card px-2 py-1 text-xs"
          />
          <input
            type="text"
            placeholder={t("Variant key", "ভ্যারিয়েন্ট কী")}
            value={section.ab?.variant ?? ""}
            onChange={(e) =>
              onAbChange({ experiment: section.ab?.experiment ?? "", variant: e.target.value })
            }
            className="w-full rounded-fq-md border border-border bg-card px-2 py-1 text-xs"
          />
          <p className="text-[0.65rem] text-muted-foreground">
            {t(
              "Unassigned visitors always see this section.",
              "অ্যাসাইন না হওয়া ভিজিটর সবসময় এটি দেখবে।",
            )}
          </p>
        </fieldset>
      )}

      <fieldset className="space-y-2 rounded-fq-md border border-border p-3">
        <legend className="px-1 text-xs font-medium">{t("Visible on", "যেখানে দেখাবে")}</legend>
        {BREAKPOINTS.map((bp) => (
          <label key={bp} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!hidden.includes(bp)}
              onChange={() => onToggleHidden(bp)}
              className="size-4 rounded border-border"
            />
            {t(BP_LABEL[bp].en, BP_LABEL[bp].bn)}
          </label>
        ))}
        {hidden.length === BREAKPOINTS.length && (
          <p className="text-xs text-warning-foreground">
            {t("Hidden everywhere — shoppers will never see this section.", "সব জায়গায় লুকানো — ক্রেতারা এটি দেখবে না।")}
          </p>
        )}
      </fieldset>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onDuplicate}
          className="rounded-fq-md border border-border px-3 py-2 text-sm hover:bg-muted"
        >
          {t("Duplicate", "কপি")}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-fq-md border border-danger px-3 py-2 text-sm text-danger-foreground hover:bg-danger-soft"
        >
          {t("Delete", "মুছুন")}
        </button>
      </div>
    </div>
  );
}
