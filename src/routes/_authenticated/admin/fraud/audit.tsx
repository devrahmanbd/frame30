import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/AdminShell";
import { fraudAuditFn } from "@/lib/fraud.functions";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/fraud/audit")({
  loader: () => fraudAuditFn(),
  head: () => ({
    meta: [
      { title: "ফ্রড অডিট ট্রেইল — Framique admin" },
      { name: "description", content: "Append-only log of risk decisions and rule changes." },
      { property: "og:title", content: "ফ্রড অডিট ট্রেইল — Framique admin" },
      { property: "og:description", content: "Every fraud decision, rule change and blacklist edit." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuditTrail,
});

const ACTION_LABEL: Record<string, { en: string; bn: string }> = {
  "fraud.flag_created": { en: "Flag created", bn: "ফ্ল্যাগ তৈরি" },
  "fraud_review.passed": { en: "Approved", bn: "অনুমোদন" },
  "fraud_review.rejected": { en: "Rejection recommended", bn: "বাতিল সুপারিশ" },
  "fraud_review.evidence_requested": { en: "Evidence requested", bn: "প্রমাণ চাওয়া" },
  "fraud.rule_changed": { en: "Rule changed", bn: "রুল পরিবর্তন" },
  "fraud.blacklist_added": { en: "Blacklist added", bn: "ব্ল্যাকলিস্ট যোগ" },
  "fraud.blacklist_updated": { en: "Blacklist updated", bn: "ব্ল্যাকলিস্ট হালনাগাদ" },
};

function AuditTrail() {
  const rows = Route.useLoaderData();
  const { t } = useLang();
  return (
    <AdminShell>
      <div className="space-y-6 p-6">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-bangla-display text-xl font-semibold">{t("Audit trail", "অডিট ট্রেইল")}</h1>
            <p className="text-sm text-muted-foreground">
              {t(
                "Every decision, rule change and blacklist edit is stored immutably.",
                "প্রতিটি সিদ্ধান্ত, রুল পরিবর্তন ও ব্ল্যাকলিস্ট এডিট অপরিবর্তনীয়ভাবে সংরক্ষিত।",
              )}
            </p>
          </div>
          <Link
            to="/admin/fraud"
            className="min-h-11 rounded-fq-md border border-border px-3 py-2 text-sm"
          >
            {t("Back to desk", "ডেস্কে ফিরুন")}
          </Link>
        </header>

        <ul className="divide-y divide-border rounded-fq-md border border-border bg-card">
          {rows.length === 0 && (
            <li className="p-6 text-sm text-muted-foreground">{t("No events yet.", "এখনো কোনো ইভেন্ট নেই।")}</li>
          )}
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <span className="font-medium">
                {ACTION_LABEL[r.action] ? t(ACTION_LABEL[r.action].en, ACTION_LABEL[r.action].bn) : r.action}
              </span>
              <span className="text-muted-foreground">
                {JSON.stringify(r.payload)}
              </span>
              <time className="tabular-nums text-xs text-muted-foreground" dateTime={r.created_at}>
                {new Date(r.created_at).toLocaleString("en-GB")}
              </time>
            </li>
          ))}
        </ul>
      </div>
    </AdminShell>
  );
}
