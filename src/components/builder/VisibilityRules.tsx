/**
 * Phase 3.2 — the "Only show when…" rule builder.
 *
 * Rules are AND-combined and stored on the node, so the same evaluation runs
 * in the studio preview and on the storefront.
 */
import { VISIBILITY_OPS, type VisibilityKind, type VisibilityRule } from "@/lib/visibility";
import { useLang } from "@/lib/i18n";

const KIND_LABEL: Record<VisibilityKind, { en: string; bn: string }> = {
  auth: { en: "Sign-in", bn: "লগইন" },
  cart: { en: "Cart", bn: "কার্ট" },
  locale: { en: "Language", bn: "ভাষা" },
  date: { en: "Date", bn: "তারিখ" },
  segment: { en: "Segment", bn: "সেগমেন্ট" },
};

const KINDS = Object.keys(VISIBILITY_OPS) as VisibilityKind[];

function defaultRule(kind: VisibilityKind): VisibilityRule {
  const op = VISIBILITY_OPS[kind][0]!;
  if (kind === "auth") return { kind, op, value: "in" };
  if (kind === "locale") return { kind, op, value: "bn" };
  if (kind === "date") return { kind, op, value: new Date().toISOString().slice(0, 10) };
  if (kind === "cart") return { kind, op, value: 0 };
  return { kind, op, value: "" };
}

export function VisibilityRules({
  rules,
  onChange,
}: {
  rules: VisibilityRule[];
  onChange: (rules: VisibilityRule[]) => void;
}) {
  const { t } = useLang();
  const patch = (index: number, next: Partial<VisibilityRule>) =>
    onChange(rules.map((rule, i) => (i === index ? { ...rule, ...next } : rule)));
  const input = "rounded-fq-md border border-border bg-card px-2 py-1 text-xs";

  return (
    <fieldset className="space-y-2 rounded-fq-md border border-border p-3">
      <legend className="px-1 text-xs font-medium">{t("Only show when…", "যখন দেখাবে…")}</legend>

      {rules.length === 0 && (
        <p className="text-[0.65rem] text-muted-foreground">
          {t("Always visible.", "সবসময় দেখাবে।")}
        </p>
      )}

      {rules.map((rule, index) => (
        <div key={index} className="flex flex-wrap items-center gap-1">
          <select
            aria-label={t("Condition", "শর্ত")}
            value={rule.kind}
            onChange={(e) => patch(index, defaultRule(e.target.value as VisibilityKind))}
            className={input}
          >
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t(KIND_LABEL[kind].en, KIND_LABEL[kind].bn)}
              </option>
            ))}
          </select>

          <select
            aria-label={t("Operator", "অপারেটর")}
            value={rule.op}
            onChange={(e) => patch(index, { op: e.target.value })}
            className={input}
          >
            {VISIBILITY_OPS[rule.kind].map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>

          {rule.op !== "empty" && rule.op !== "not_empty" && (
            <input
              aria-label={t("Value", "মান")}
              type={rule.kind === "cart" ? "number" : rule.kind === "date" ? "date" : "text"}
              value={String(rule.value)}
              onChange={(e) =>
                patch(index, {
                  value: rule.kind === "cart" ? Number(e.target.value) : e.target.value,
                })
              }
              className={`${input} w-28`}
            />
          )}

          <button
            type="button"
            aria-label={t("Remove rule", "শর্ত মুছুন")}
            onClick={() => onChange(rules.filter((_, i) => i !== index))}
            className="rounded-fq-sm border border-danger px-1.5 text-[0.65rem] text-danger-foreground"
          >
            ✕
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...rules, defaultRule("auth")])}
        className="inline-flex min-h-8 items-center rounded-fq-md border border-border px-2 py-1 text-xs hover:bg-muted"
      >
        {t("Add condition", "শর্ত যোগ করুন")}
      </button>

      {rules.length > 1 && (
        <p className="text-[0.65rem] text-muted-foreground">
          {t("All conditions must match.", "সব শর্ত মিললে দেখাবে।")}
        </p>
      )}
    </fieldset>
  );
}
