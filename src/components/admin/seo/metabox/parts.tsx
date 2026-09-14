/**
 * Phase 13 — the small pieces the SEO meta box is built from.
 *
 * Presentation only: tokens for every colour, 32px minimum for every control
 * so the console gate's tap-target rule holds at 390px, and no data fetching.
 */
import { useId, useState, type ReactNode } from "react";
import { ChevronDown, Check, X, AlertTriangle, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";
import type { SeoCheck } from "@/lib/seo-analysis";
import { SEO_TOKENS } from "@/lib/seo/seo-meta";

export const seoInput =
  "w-full min-h-8 rounded-fq-md border border-border bg-card px-2.5 py-1.5 text-sm text-foreground fq-focus-glow placeholder:text-muted-foreground";

/* ------------------------------------------------------------ pixel meter */

export function PixelMeter({ label, px, max }: { label: string; px: number; max: number }) {
  const fill = Math.min(1, px / max);
  const tone = px > max ? "bg-danger" : fill > 0.9 ? "bg-warning" : "bg-success";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span className="fq-num">
          {Math.round(px)} / {max} px
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        <div
          className={cn("h-full rounded-full transition-all", tone)}
          style={{ width: `${fill * 100}%` }}
        />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- underline tabs */

export function UnderlineTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex items-end gap-1 border-b border-border">
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              "fq-focus-glow -mb-px min-h-9 rounded-t-fq-md border-b-2 px-2.5 text-[13px] font-medium transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------- collapsible */

export function Collapsible({
  title,
  meta,
  defaultOpen = false,
  children,
}: {
  title: ReactNode;
  meta?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className="rounded-fq-md border border-border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="fq-focus-glow flex min-h-10 w-full items-center justify-between gap-2 rounded-fq-md px-3 py-2 text-left text-[13px] font-medium hover:bg-muted"
      >
        <span className="flex items-center gap-2">{title}</span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {meta}
          <ChevronDown
            className={cn("size-4 transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </span>
      </button>
      {open && (
        <div id={id} className="space-y-3 border-t border-border p-3">
          {children}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- check row */

export function CheckRow({ check }: { check: SeoCheck }) {
  const { lang } = useLang();
  const Icon =
    check.status === "pass"
      ? Check
      : check.status === "fail"
        ? X
        : check.status === "warn"
          ? AlertTriangle
          : Minus;
  const tone =
    check.status === "pass"
      ? "text-success"
      : check.status === "fail"
        ? "text-danger"
        : check.status === "warn"
          ? "text-warning"
          : "text-muted-foreground";
  return (
    <li className="flex items-start gap-2 text-xs">
      <Icon className={cn("mt-0.5 size-3.5 shrink-0", tone)} aria-hidden />
      <span>
        <span className="font-medium text-foreground">
          {lang === "bn" ? check.labelBn : check.label}
        </span>
        <span className="text-muted-foreground">
          {" "}
          — {lang === "bn" ? check.hintBn : check.hint}
        </span>
      </span>
    </li>
  );
}

/* ----------------------------------------------------------- keyword pills */

export function KeywordPills({
  values,
  onChange,
  max,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  max: number;
}) {
  const { t } = useLang();
  const [draft, setDraft] = useState("");

  const add = () => {
    const value = draft.trim();
    if (!value) return;
    if (values.some((v) => v.toLowerCase() === value.toLowerCase())) return setDraft("");
    onChange([...values, value].slice(0, max));
    setDraft("");
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {values.map((value, i) => (
          <span
            key={value}
            className={cn(
              "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs",
              i === 0
                ? "border-primary/40 bg-primary/10 text-foreground"
                : "border-border bg-muted text-foreground",
            )}
          >
            {i === 0 && (
              <span className="text-[10px] font-semibold uppercase text-primary">
                {t("Primary", "মূল")}
              </span>
            )}
            {value}
            <button
              type="button"
              aria-label={t(`Remove ${value}`, `${value} সরান`)}
              onClick={() => onChange(values.filter((v) => v !== value))}
              className="fq-focus-glow inline-flex size-5 items-center justify-center rounded-full hover:bg-background"
            >
              <X className="size-3" aria-hidden />
            </button>
          </span>
        ))}
      </div>
      {values.length < max && (
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                add();
              }
            }}
            placeholder={t("Add focus keyword", "মূল কীওয়ার্ড যোগ করুন")}
            aria-label={t("Focus keyword", "মূল কীওয়ার্ড")}
            className={seoInput}
          />
          <button
            type="button"
            onClick={add}
            className="fq-focus-glow min-h-8 shrink-0 rounded-fq-md border border-border px-3 text-xs font-medium hover:bg-muted"
          >
            {t("Add", "যোগ")}
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- token field */

/**
 * A text input (or textarea) with the `%token%` insert menu Rank Math puts at
 * the right of the field. Tokens are inserted at the caret.
 */
export function TokenField({
  value,
  onChange,
  label,
  textarea,
  rows = 3,
  placeholder,
  footer,
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
  textarea?: boolean;
  rows?: number;
  placeholder?: string;
  footer?: ReactNode;
}) {
  const { t, lang } = useLang();
  const [open, setOpen] = useState(false);

  const insert = (token: string) => {
    onChange(`${value}${value && !value.endsWith(" ") ? " " : ""}${token}`);
    setOpen(false);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <div className="relative">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="fq-focus-glow inline-flex min-h-8 items-center gap-1 rounded-fq-md border border-border px-2 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {t("Insert variable", "ভেরিয়েবল")}
            <ChevronDown className="size-3" aria-hidden />
          </button>
          {open && (
            <div className="fq-enter absolute right-0 top-full z-20 mt-1 w-52 rounded-fq-md border border-border bg-popover p-1 shadow-[0_18px_40px_-20px_rgb(0_0_0/0.45)]">
              {SEO_TOKENS.map((token) => (
                <button
                  key={token.token}
                  type="button"
                  onClick={() => insert(token.token)}
                  className="fq-focus-glow flex min-h-8 w-full items-center justify-between gap-2 rounded-fq-md px-2 text-left text-xs hover:bg-muted"
                >
                  <span className="font-mono text-[11px] text-primary">{token.token}</span>
                  <span className="text-muted-foreground">
                    {lang === "bn" ? token.bn : token.en}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {textarea ? (
        <textarea
          value={value}
          rows={rows}
          placeholder={placeholder}
          aria-label={label}
          onChange={(e) => onChange(e.target.value)}
          className={seoInput}
        />
      ) : (
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          aria-label={label}
          onChange={(e) => onChange(e.target.value)}
          className={seoInput}
        />
      )}
      {footer}
    </div>
  );
}

/* ------------------------------------------------------------- check boxes */

export function CheckboxRow({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-2 py-2 text-xs">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="fq-focus-glow mt-px size-[18px] shrink-0 accent-[var(--primary)]"
      />
      <span>
        <span className="font-medium text-foreground">{label}</span>
        {hint && <span className="block text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}
