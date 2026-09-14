/**
 * Phase 3.3 — বাংলা coverage at a glance.
 *
 * Shows how much of the theme's copy is translated and lets the merchant jump
 * straight to whatever is missing.
 */
import type { CoverageReport } from "@/lib/translation-coverage";
import type { TemplateKey } from "@/lib/builder-ast";
import { useLang } from "@/lib/i18n";

export function TranslationMeter({
  report,
  onJump,
}: {
  report: CoverageReport;
  onJump: (template: TemplateKey, sectionId: string) => void;
}) {
  const { t } = useLang();
  if (report.total === 0) return null;

  const tone =
    report.empty > 0 ? "text-danger-foreground" : report.fallback > 0 ? "text-muted-foreground" : "text-primary";

  return (
    <section className="space-y-2 rounded-fq-md border border-border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-xs font-medium">{t("বাংলা coverage", "বাংলা কভারেজ")}</h4>
        <span className={`text-xs font-semibold ${tone}`}>{report.percent}%</span>
      </div>

      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={report.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t("Translation completeness", "অনুবাদ সম্পূর্ণতা")}
      >
        <div className="h-full bg-primary" style={{ width: `${report.percent}%` }} />
      </div>

      <ul className="space-y-0.5 text-[0.65rem] text-muted-foreground">
        {Object.entries(report.byTemplate).map(([template, stats]) => (
          <li key={template} className="flex justify-between gap-2">
            <span className="truncate">{template}</span>
            <span>
              {stats.ok}/{stats.total}
            </span>
          </li>
        ))}
      </ul>

      {report.worst.length > 0 && (
        <ul className="space-y-1">
          {report.worst.slice(0, 6).map((ref) => (
            <li key={`${ref.template}-${ref.sectionId}-${ref.fieldKey}`}>
              <button
                type="button"
                onClick={() => onJump(ref.template, ref.sectionId)}
                className="w-full truncate rounded-fq-sm px-1 py-0.5 text-left text-[0.65rem] hover:bg-muted"
              >
                <span className={ref.state === "empty" ? "text-danger-foreground" : ""}>
                  {ref.state === "empty" ? "✕" : "⚠"}
                </span>{" "}
                {ref.sectionLabel} · {ref.fieldLabel}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
