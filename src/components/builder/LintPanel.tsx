import { useMemo, useState } from "react";
import type { AstIssue } from "@/lib/builder-ast";
import {
  classifyIssues,
  isActionable,
  issueSummary,
  planFix,
  type ClassifiedIssue,
  type FixPlan,
} from "@/lib/builder-lint-fixes";
import { useLang } from "@/lib/i18n";
import type { Section } from "@/lib/builder-ast";

/**
 * Phase 2.5 — the template check list, with a fix button where a fix exists.
 *
 * The panel never guesses: a `focus` plan selects the node and opens the panel
 * that owns the field, a `props` plan writes only schema-owned defaults, and an
 * issue with no deterministic fix still renders (with its reason) so nothing
 * silently blocks publish.
 */
export function LintPanel({
  issues,
  resolve,
  onFix,
  onSelect,
}: {
  issues: readonly AstIssue[];
  /** Looks up the offending node so a fix can be computed against real props. */
  resolve: (sectionId: string) => Section | null;
  onFix: (issue: ClassifiedIssue, plan: FixPlan) => void;
  onSelect: (sectionId: string) => void;
}) {
  const { t } = useLang();
  const [showAll, setShowAll] = useState(false);
  const classified = useMemo(() => classifyIssues(issues), [issues]);
  const summary = useMemo(() => issueSummary(issues), [issues]);
  const visible = showAll ? classified : classified.slice(0, 6);

  if (classified.length === 0) {
    return (
      <p className="rounded-fq-md bg-success-soft px-3 py-2 text-sm text-success-foreground">
        {t("All template checks pass.", "সব টেমপ্লেট চেক পাস করেছে।")}
      </p>
    );
  }

  return (
    <section aria-label={t("Template checks", "টেমপ্লেট চেক")} className="space-y-1">
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {t(
          `${summary.errors} blocking, ${summary.warnings} advisory`,
          `${summary.errors} ব্লকিং, ${summary.warnings} পরামর্শ`,
        )}
      </p>
      <ul className="space-y-1">
        {visible.map((issue) => {
          const section = issue.sectionId ? resolve(issue.sectionId) : null;
          const plan = planFix(issue, section);
          const actionable = isActionable(plan);
          return (
            <li
              key={issue.key}
              className={`flex flex-wrap items-center gap-2 rounded-fq-md px-3 py-2 text-sm ${
                issue.level === "error"
                  ? "bg-danger-soft text-danger-foreground"
                  : "bg-warning-soft text-warning-foreground"
              }`}
            >
              <span className="rounded-fq-sm bg-card/60 px-1 text-[10px] font-semibold uppercase">
                {t(issue.title.en, issue.title.bn)}
              </span>
              <span className="min-w-0 flex-1">{issue.message}</span>
              {issue.sectionId && (
                <button
                  type="button"
                  onClick={() => onSelect(issue.sectionId!)}
                  className="shrink-0 text-xs underline"
                >
                  {t("Select", "সিলেক্ট")}
                </button>
              )}
              {plan && actionable && (
                <button
                  type="button"
                  onClick={() => onFix(issue, plan)}
                  className="shrink-0 rounded-fq-md border border-border bg-card px-2 py-1 text-xs text-foreground"
                >
                  {t(plan.label.en, plan.label.bn)}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {classified.length > visible.length && (
        <button type="button" onClick={() => setShowAll(true)} className="text-xs underline">
          {t(`Show ${classified.length - visible.length} more`, `আরও ${classified.length - visible.length} দেখুন`)}
        </button>
      )}
    </section>
  );
}
