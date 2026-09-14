import { useMemo, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/AdminShell";
import { fmtMinor } from "@/lib/money";
import { useLang } from "@/lib/i18n";
import { SCOPES, highestRisk, validateBundle } from "@/lib/marketplace-scopes";
import {
  marketMineFn,
  marketVersionsFn,
  marketPublishVersionFn,
  marketPayoutsFn,
  marketPayoutAccrueFn,
} from "@/lib/marketplace.functions";

export const Route = createFileRoute("/_authenticated/admin/marketplace/versions")({
  loader: async () => {
    const [mine, vault, payouts] = await Promise.all([
      marketMineFn(),
      marketVersionsFn(),
      marketPayoutsFn(),
    ]);
    return { mine, vault, payouts };
  },
  head: () => ({
    meta: [
      { title: "সংস্করণ ও পেআউট — Framique marketplace" },
      {
        name: "description",
        content: "Publish immutable extension versions, declare permissions and settle creator payouts.",
      },
      { property: "og:title", content: "সংস্করণ ও পেআউট — Framique marketplace" },
      { property: "og:description", content: "Version vault, permission review and payout ledger." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VersionsPage,
});

const VERSION_STATUS: Record<string, { en: string; bn: string; tone: string }> = {
  review: { en: "In review", bn: "রিভিউতে", tone: "border-warning/50 bg-warning/10" },
  active: { en: "Published", bn: "প্রকাশিত", tone: "border-success/50 bg-success/10" },
  paused: { en: "Paused", bn: "স্থগিত", tone: "border-border" },
  archived: { en: "Archived", bn: "আর্কাইভড", tone: "border-border text-muted-foreground" },
};

const PAYOUT_STATUS: Record<string, { en: string; bn: string }> = {
  pending: { en: "Pending", bn: "অপেক্ষমাণ" },
  processing: { en: "Processing", bn: "প্রক্রিয়াধীন" },
  paid: { en: "Paid", bn: "পরিশোধিত" },
  failed: { en: "Failed", bn: "ব্যর্থ" },
};

const EMPTY_FORM = {
  listingKey: "",
  version: "1.0.0",
  changelog: "",
  scopes: [] as string[],
  entry: "export default function mount(api){ api.call('shop.info'); }",
};

function VersionsPage() {
  const { mine, vault, payouts } = Route.useLoaderData();
  const router = useRouter();
  const { t } = useLang();
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const listings = useMemo(
    () => [...mine.themes, ...mine.widgets].map((l) => ({ ...l, key: `${l.kind}:${l.id}` })),
    [mine.themes, mine.widgets],
  );

  const source = useMemo(() => ({ entry: form.entry }), [form.entry]);
  const verdict = useMemo(() => validateBundle(source, form.scopes), [source, form.scopes]);
  const bytes = new TextEncoder().encode(JSON.stringify(source)).length;

  async function publish() {
    const listing = listings.find((l) => l.key === form.listingKey);
    if (!listing) {
      setMsg(t("Pick a listing first.", "আগে একটি লিস্টিং বাছুন।"));
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await marketPublishVersionFn({
        data: {
          kind: listing.kind,
          listingId: listing.id,
          version: form.version.trim(),
          changelog: form.changelog.trim() || null,
          scopes: form.scopes,
          source,
          blocks: [],
        },
      });
      setMsg(
        res.replayed
          ? t("Identical bytes — existing version reused.", "একই বাইট — বিদ্যমান সংস্করণ ব্যবহার হয়েছে।")
          : t("Version submitted for review.", "সংস্করণ রিভিউতে জমা হয়েছে।"),
      );
      setForm({ ...EMPTY_FORM, listingKey: form.listingKey });
      await router.invalidate();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  }

  async function accrue() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await marketPayoutAccrueFn();
      setMsg(
        res.ok
          ? t("Payout drafted from unpaid earnings.", "অপরিশোধিত আয় থেকে পেআউট তৈরি হয়েছে।")
          : `${t("Nothing to accrue", "জমা করার কিছু নেই")}: ${res.reason ?? ""}`,
      );
      await router.invalidate();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Accrual failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell>
      <div className="space-y-6 p-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-bangla-display text-xl font-semibold">
              {t("Versions & payouts", "সংস্করণ ও পেআউট")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t(
                "Published bytes are frozen and content-addressed — a version can never be swapped after review.",
                "প্রকাশিত বাইট ফ্রিজ ও হ্যাশ-চিহ্নিত — রিভিউর পর সংস্করণ বদলানো যায় না।",
              )}
            </p>
          </div>
          <Link
            to="/admin/marketplace/creator"
            className="min-h-11 rounded-fq-md border border-border px-3 py-2 text-sm"
          >
            {t("Creator panel", "ক্রিয়েটর প্যানেল")}
          </Link>
        </header>

        {msg && (
          <p role="status" className="rounded-fq-md border border-border bg-muted p-3 text-sm">
            {msg}
          </p>
        )}

        <section className="grid gap-3 rounded-fq-md border border-border bg-card p-4 md:grid-cols-2">
          <h2 className="font-bangla-display text-lg font-semibold md:col-span-2">
            {t("Publish a version", "সংস্করণ প্রকাশ")}
          </h2>
          <label className="text-sm">
            {t("Listing", "লিস্টিং")}
            <select
              value={form.listingKey}
              onChange={(e) => setForm({ ...form, listingKey: e.target.value })}
              className="mt-1 min-h-11 w-full rounded-fq-md border border-border bg-background px-2 text-sm"
            >
              <option value="">{t("Select…", "বাছুন…")}</option>
              {listings.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.name} ({l.kind})
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            {t("Version (semver)", "সংস্করণ (semver)")}
            <input
              value={form.version}
              onChange={(e) => setForm({ ...form, version: e.target.value })}
              placeholder="1.2.0"
              className="mt-1 min-h-11 w-full rounded-fq-md border border-border bg-background px-3 text-sm tabular-nums"
            />
          </label>
          <label className="text-sm md:col-span-2">
            {t("Changelog", "চেঞ্জলগ")}
            <textarea
              value={form.changelog}
              onChange={(e) => setForm({ ...form, changelog: e.target.value })}
              rows={2}
              className="mt-1 w-full rounded-fq-md border border-border bg-background p-3 text-sm"
            />
          </label>

          <fieldset className="md:col-span-2">
            <legend className="text-sm">{t("Requested permissions", "চাওয়া অনুমতি")}</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {SCOPES.map((s) => {
                const on = form.scopes.includes(s.id);
                return (
                  <label key={s.id} className="flex items-start gap-2 rounded-fq-md border border-border p-2 text-sm">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        setForm({
                          ...form,
                          scopes: on ? form.scopes.filter((x) => x !== s.id) : [...form.scopes, s.id],
                        })
                      }
                      className="mt-1 size-4"
                    />
                    <span>
                      <span className="font-medium">{t(s.en, s.bn)}</span>
                      <span className="block text-xs text-muted-foreground">{t(s.effectEn, s.effectBn)}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("Risk shown to merchants:", "মার্চেন্টকে দেখানো ঝুঁকি:")}{" "}
              <span className="font-medium">{highestRisk(form.scopes)}</span>
            </p>
          </fieldset>

          <label className="text-sm md:col-span-2">
            {t("Bundle entry", "বান্ডল এন্ট্রি")}
            <textarea
              value={form.entry}
              onChange={(e) => setForm({ ...form, entry: e.target.value })}
              rows={5}
              spellCheck={false}
              className="mt-1 w-full rounded-fq-md border border-border bg-background p-3 font-mono text-xs"
            />
          </label>

          <div className="md:col-span-2 space-y-2">
            <p className="text-xs tabular-nums text-muted-foreground">
              {(bytes / 1024).toFixed(1)} KB
            </p>
            {!verdict.ok && (
              <ul className="rounded-fq-md border border-destructive/40 bg-destructive/10 p-2 text-xs">
                {verdict.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
            <button
              type="button"
              disabled={busy || !verdict.ok || !form.listingKey}
              onClick={publish}
              className="min-h-11 rounded-fq-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {t("Submit for review", "রিভিউতে জমা দিন")}
            </button>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="font-bangla-display text-lg font-semibold">{t("Version vault", "সংস্করণ ভল্ট")}</h2>
          <ul className="divide-y divide-border rounded-fq-md border border-border bg-card">
            {vault.versions.length === 0 && (
              <li className="p-4 text-sm text-muted-foreground">
                {t("No versions submitted yet.", "এখনো কোনো সংস্করণ জমা হয়নি।")}
              </li>
            )}
            {vault.versions.map((v) => {
              const s = VERSION_STATUS[v.status] ?? VERSION_STATUS["review"]!;
              return (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <span>
                    <span className="font-medium tabular-nums">v{v.version}</span>{" "}
                    <span className="text-muted-foreground">
                      · {v.kind} · {(v.size_bytes / 1024).toFixed(1)} KB · {v.content_hash.slice(0, 12)}…
                    </span>
                    {v.review_note && (
                      <span className="block text-xs text-muted-foreground">{v.review_note}</span>
                    )}
                    {(v.scopes ?? []).length > 0 && (
                      <span className="block text-xs text-muted-foreground">
                        {(v.scopes as string[]).join(", ")}
                      </span>
                    )}
                  </span>
                  <span className={`rounded-fq-sm border px-2 py-0.5 text-xs ${s.tone}`}>
                    {t(s.en, s.bn)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bangla-display text-lg font-semibold">{t("Payouts", "পেআউট")}</h2>
            <button
              type="button"
              disabled={busy || payouts.pendingNetMinor <= 0}
              onClick={accrue}
              className="min-h-11 rounded-fq-md border border-border px-3 text-sm disabled:opacity-60"
            >
              {t("Accrue", "জমা করুন")} {fmtMinor(payouts.pendingNetMinor, payouts.pendingCurrency)}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              "Accrual locks unpaid ledger entries into one payout; the platform settles it.",
              "জমা দিলে অপরিশোধিত লেজার এন্ট্রি একটি পেআউটে লক হয়; প্ল্যাটফর্ম নিষ্পত্তি করে।",
            )}
          </p>
          <ul className="divide-y divide-border rounded-fq-md border border-border bg-card">
            {payouts.payouts.length === 0 && (
              <li className="p-4 text-sm text-muted-foreground">
                {t("No payouts yet.", "এখনো কোনো পেআউট নেই।")}
              </li>
            )}
            {payouts.payouts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span className="tabular-nums font-medium">
                  {fmtMinor(p.net_minor_int, p.currency_code)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(p.created_at).toLocaleDateString("en-GB")} ·{" "}
                  {PAYOUT_STATUS[p.status] ? t(PAYOUT_STATUS[p.status]!.en, PAYOUT_STATUS[p.status]!.bn) : p.status}
                  {p.reference ? ` · ${p.reference}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AdminShell>
  );
}
