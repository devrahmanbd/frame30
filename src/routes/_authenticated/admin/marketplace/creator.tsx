import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/AdminShell";
import { fmtMinor } from "@/lib/money";
import { useLang } from "@/lib/i18n";
import {
  marketMineFn,
  marketSaveListingFn,
  marketListingStatusFn,
} from "@/lib/marketplace.functions";

export const Route = createFileRoute("/_authenticated/admin/marketplace/creator")({
  loader: () => marketMineFn(),
  head: () => ({
    meta: [
      { title: "ক্রিয়েটর প্যানেল — Framique marketplace" },
      { name: "description", content: "Publish themes and widgets, set pricing and track earnings." },
      { property: "og:title", content: "ক্রিয়েটর প্যানেল — Framique marketplace" },
      { property: "og:description", content: "Listing lifecycle, pricing and payout ledger." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CreatorPanel,
});

const STATUS_LABEL: Record<string, { en: string; bn: string }> = {
  draft: { en: "Draft", bn: "ড্রাফট" },
  review: { en: "In review", bn: "রিভিউতে" },
  active: { en: "Active", bn: "সক্রিয়" },
  paused: { en: "Paused", bn: "স্থগিত" },
  archived: { en: "Archived", bn: "আর্কাইভড" },
};

const EMPTY = {
  kind: "theme" as "theme" | "widget",
  name: "",
  slug: "",
  description: "",
  category: "general",
  version: "1.0.0",
  priceTaka: 0,
  trialAllowed: false,
  manifestText: '{"breaking_nodes": []}',
};

function CreatorPanel() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const { t } = useLang();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const listings = [...data.themes, ...data.widgets];

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      const manifest = JSON.parse(form.manifestText || "{}") as Record<string, unknown>;
      await marketSaveListingFn({
        data: {
          kind: form.kind,
          name: form.name.trim(),
          slug: form.slug.trim(),
          description: form.description.trim() || null,
          category: form.category.trim(),
          version: form.version.trim(),
          priceMinor: Math.round(Number(form.priceTaka) * 100),
          trialAllowed: form.trialAllowed,
          manifest,
        },
      });
      setForm(EMPTY);
      setMsg(t("Listing saved (draft).", "লিস্টিং সংরক্ষিত (ড্রাফট)।"));
      await router.invalidate();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Invalid manifest or form");
    } finally {
      setBusy(false);
    }
  }

  async function transition(
    kind: "theme" | "widget",
    id: string,
    status: "review" | "active" | "paused" | "archived",
  ) {
    setBusy(true);
    setMsg(null);
    try {
      await marketListingStatusFn({ data: { kind, id, status } });
      await router.invalidate();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Transition failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell>
      <div className="space-y-6 p-6">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-bangla-display text-xl font-semibold">{t("Creator panel", "ক্রিয়েটর প্যানেল")}</h1>
            <p className="text-sm text-muted-foreground">
              {t(
                "Listings under review cannot be archived or published.",
                "রিভিউতে থাকা লিস্টিং আর্কাইভ বা প্রকাশ করা যায় না।",
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              to="/admin/marketplace/versions"
              className="min-h-11 rounded-fq-md border border-border px-3 py-2 text-sm"
            >
              {t("Versions & payouts", "সংস্করণ ও পেআউট")}
            </Link>
            <Link
              to="/admin/marketplace"
              className="min-h-11 rounded-fq-md border border-border px-3 py-2 text-sm"
            >
              {t("Marketplace", "মার্কেটপ্লেস")}
            </Link>
          </div>
        </header>

        {msg && (
          <p role="status" className="rounded-fq-md border border-border bg-muted p-3 text-sm">
            {msg}
          </p>
        )}

        <section className="grid gap-3 rounded-fq-md border border-border bg-card p-4 md:grid-cols-2">
          <label className="text-sm">
            {t("Type", "ধরন")}
            <select
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as "theme" | "widget" })}
              className="mt-1 min-h-11 w-full rounded-fq-md border border-border bg-background px-2 text-sm"
            >
              <option value="theme">{t("Theme", "থিম")}</option>
              <option value="widget">{t("Widget", "উইজেট")}</option>
            </select>
          </label>
          <label className="text-sm">
            {t("Name", "নাম")}
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1 min-h-11 w-full rounded-fq-md border border-border bg-background px-3 text-sm"
            />
          </label>
          <label className="text-sm">
            {t("Slug", "স্লাগ")}
            <input
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              placeholder="bazaar-minimal"
              className="mt-1 min-h-11 w-full rounded-fq-md border border-border bg-background px-3 text-sm"
            />
          </label>
          <label className="text-sm">
            {t("Category", "ক্যাটাগরি")}
            <input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="mt-1 min-h-11 w-full rounded-fq-md border border-border bg-background px-3 text-sm"
            />
          </label>
          <label className="text-sm">
            {t("Version", "সংস্করণ")}
            <input
              value={form.version}
              onChange={(e) => setForm({ ...form, version: e.target.value })}
              className="mt-1 min-h-11 w-full rounded-fq-md border border-border bg-background px-3 text-sm"
            />
          </label>
          <label className="text-sm">
            {t("Price (৳)", "দাম (৳)")}
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.priceTaka}
              onChange={(e) => setForm({ ...form, priceTaka: Number(e.target.value) })}
              className="mt-1 min-h-11 w-full rounded-fq-md border border-border bg-background px-3 text-sm tabular-nums"
            />
          </label>
          <label className="text-sm md:col-span-2">
            {t("Description", "বর্ণনা")}
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="mt-1 w-full rounded-fq-md border border-border bg-background p-3 text-sm"
            />
          </label>
          <label className="text-sm md:col-span-2">
            {t("Manifest (JSON)", "ম্যানিফেস্ট (JSON)")}
            <textarea
              value={form.manifestText}
              onChange={(e) => setForm({ ...form, manifestText: e.target.value })}
              rows={3}
              className="mt-1 w-full rounded-fq-md border border-border bg-background p-3 font-mono text-xs"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.trialAllowed}
              onChange={(e) => setForm({ ...form, trialAllowed: e.target.checked })}
            />
            {t("14-day trial allowed", "১৪ দিনের ট্রায়াল অনুমোদিত")}
          </label>
          <div className="md:col-span-2">
            <button
              type="button"
              disabled={busy || form.name.trim().length < 2 || form.slug.trim().length < 2}
              onClick={submit}
              className="min-h-11 rounded-fq-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {t("Save", "সংরক্ষণ করুন")}
            </button>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="font-bangla-display text-lg font-semibold">{t("My listings", "আমার লিস্টিং")}</h2>
          <ul className="divide-y divide-border rounded-fq-md border border-border bg-card">
            {listings.length === 0 && (
              <li className="p-4 text-sm text-muted-foreground">{t("No listings.", "কোনো লিস্টিং নেই।")}</li>
            )}
            {listings.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span>
                  <span className="font-medium">{l.name}</span>{" "}
                  <span className="text-muted-foreground">
                    · {l.kind} · v{l.version} · {STATUS_LABEL[l.status] ? t(STATUS_LABEL[l.status].en, STATUS_LABEL[l.status].bn) : l.status} ·{" "}
                    <span className="tabular-nums">
                      {fmtMinor(l.price_minor_int, l.currency_code)}
                    </span>{" "}
                    · {l.install_count} {t("installs", "ইনস্টল")}
                  </span>
                </span>
                <span className="flex gap-2">
                  {l.status === "draft" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => transition(l.kind, l.id, "review")}
                      className="min-h-11 rounded-fq-md border border-border px-3 disabled:opacity-60"
                    >
                      {t("Send to review", "রিভিউতে পাঠান")}
                    </button>
                  )}
                  {(l.status === "active" || l.status === "paused") && (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          transition(l.kind, l.id, l.status === "active" ? "paused" : "active")
                        }
                        className="min-h-11 rounded-fq-md border border-border px-3 disabled:opacity-60"
                      >
                        {l.status === "active" ? t("Pause", "স্থগিত") : t("Activate", "সক্রিয়")}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => transition(l.kind, l.id, "archived")}
                        className="min-h-11 rounded-fq-md border border-border px-3 disabled:opacity-60"
                      >
                        {t("Archive", "আর্কাইভ")}
                      </button>
                    </>
                  )}
                  {l.status === "review" && (
                    <span className="text-xs text-muted-foreground">{t("Awaiting platform review", "প্ল্যাটফর্ম রিভিউর অপেক্ষায়")}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-bangla-display text-lg font-semibold">{t("Earnings (payout ledger)", "আয় (পেআউট লেজার)")}</h2>
          <ul className="divide-y divide-border rounded-fq-md border border-border bg-card">
            {data.ledger.length === 0 && (
              <li className="p-4 text-sm text-muted-foreground">{t("No earnings yet.", "এখনো কোনো আয় নেই।")}</li>
            )}
            {data.ledger.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span>{e.memo ?? e.source}</span>
                <span className="tabular-nums">
                  {fmtMinor(e.seller_minor_int, e.currency_code)}{" "}
                  <span className="text-muted-foreground">
                    / {t("total", "মোট")} {fmtMinor(e.gross_minor_int, e.currency_code)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AdminShell>
  );
}
