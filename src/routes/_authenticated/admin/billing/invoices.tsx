import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/AdminShell";
import { CollectionDesk } from "@/components/admin/billing/CollectionDesk";
import { UsagePanel } from "@/components/admin/billing/UsagePanel";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/billing/invoices")({
  head: () => ({
    meta: [
      { title: "ইনভয়েস — Framique বিলিং" },
      {
        name: "description",
        content:
          "Framique subscription invoices with VAT breakdown, status and wallet/MFS payment in BDT.",
      },
      { property: "og:title", content: "Framique invoices" },
      {
        property: "og:description",
        content: "Subscription invoices with VAT lines, period and payment status.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InvoicesPage,
});

function InvoicesPage() {
  const { t } = useLang();
  return (
    <AdminShell>
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-bangla-display text-2xl font-semibold">{t("Invoices", "ইনভয়েস")}</h1>
            <p className="text-sm text-muted-foreground">
              {t(
                "Server-issued subscription invoices, VAT from the legal rate table, and the payment rail for settling them.",
                "সার্ভার-ইস্যু করা সাবস্ক্রিপশন ইনভয়েস, আইনি হার অনুযায়ী ভ্যাট, এবং পরিশোধের ব্যবস্থা।",
              )}
            </p>
          </div>
          <Link to="/admin/plans" className="text-sm underline">
            {t("View plans", "প্ল্যান দেখুন")}
          </Link>
        </header>

        <UsagePanel />
        <CollectionDesk />
      </div>
    </AdminShell>
  );
}
