import { useMemo, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  CampaignTable,
  Kpi,
  Section,
  SignalList,
  TrafficSplit,
  VerdictPill,
} from "@/components/admin/AdDefenseUi";
import { fmtMinor } from "@/lib/money";
import { useLang } from "@/lib/i18n";
import {
  adFraudBlockFn,
  adFraudDeskFn,
  adFraudRecomputeFn,
  adFraudSaveSpendFn,
  adFraudToggleBlockFn,
} from "@/lib/ad-fraud.functions";

export const Route = createFileRoute("/_authenticated/admin/fraud/ad-defense")({
  loader: () => adFraudDeskFn(),
  head: () => ({
    meta: [
      { title: "বিজ্ঞাপন সুরক্ষা — Framique admin" },
      {
        name: "description",
        content: "See which ad clicks were fake, how much budget they burned and block the sources.",
      },
      { property: "og:title", content: "বিজ্ঞাপন সুরক্ষা — Framique admin" },
      {
        property: "og:description",
        content: "Ad-fraud defense: click integrity, wasted spend and blocklist controls.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdDefense,
});

const today = () => new Date().toISOString().slice(0, 10);

function AdDefense() {
  const desk = Route.useLoaderData();
  const router = useRouter();
  const { lang } = useLang();
  const bn = lang === "bn";

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openClick, setOpenClick] = useState<string | null>(null);
  const [network, setNetwork] = useState("facebook");
  const [campaign, setCampaign] = useState("");
  const [day, setDay] = useState(today());
  const [spend, setSpend] = useState("");

  const summary = desk.summary;
  const currency = desk.campaigns[0]?.currencyCode ?? "BDT";

  const campaigns = useMemo(
    () => [...desk.campaigns].sort((a, b) => b.wastedSpendMinorInt - a.wastedSpendMinorInt),
    [desk.campaigns],
  );

  async function run(action: () => Promise<unknown>, done: string) {
    if (busy) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await action();
      setMsg(done);
      await router.invalidate();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function submitSpend(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(spend);
    if (!campaign.trim() || !Number.isFinite(amount) || amount < 0) {
      setErr(bn ? "ক্যাম্পেইন ও খরচ ঠিকভাবে দিন।" : "Enter a campaign and a valid spend amount.");
      return;
    }
    void run(
      () =>
        adFraudSaveSpendFn({
          data: {
            network,
            campaign: campaign.trim(),
            day,
            spendMinorInt: Math.round(amount * 100),
            currencyCode: currency,
          },
        }),
      bn ? "খরচ সংরক্ষিত হয়েছে।" : "Spend saved.",
    );
  }

  return (
    <AdminShell>
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-xl font-semibold">
            {bn ? "বিজ্ঞাপন সুরক্ষা ও অ্যাট্রিবিউশন" : "Ad defense & attribution integrity"}
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {bn ? desk.adviceBn : desk.adviceEn}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(
                  () => adFraudRecomputeFn({ data: { days: 7 } }),
                  bn ? "পুনঃগণনা সম্পন্ন।" : "Recomputed the last 7 days.",
                )
              }
              className="rounded-fq-sm border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
            >
              {bn ? "৭ দিন পুনঃগণনা" : "Recompute 7 days"}
            </button>
            <span className="text-xs text-muted-foreground">
              {bn ? `গত ${desk.windowDays} দিন` : `Last ${desk.windowDays} days`}
            </span>
          </div>
          {msg ? (
            <p role="status" className="text-sm text-success-strong">
              {msg}
            </p>
          ) : null}
          {err ? (
            <p role="alert" className="text-sm text-destructive">
              {err}
            </p>
          ) : null}
        </header>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label={bn ? "ইন্টিগ্রিটি স্কোর" : "Integrity score"}
            value={`${summary.integrityScore}/100`}
            hint={bn ? "১০০ মানে সব ক্লিক আসল" : "100 means every click looked real"}
          />
          <Kpi label={bn ? "মোট ক্লিক" : "Total clicks"} value={String(summary.clicks)} />
          <Kpi
            label={bn ? "বাতিল ক্লিক" : "Refused clicks"}
            value={`${summary.invalidClicks} (${summary.invalidRate}%)`}
            tone="danger"
          />
          <Kpi
            label={bn ? "নষ্ট বাজেট" : "Wasted budget"}
            value={fmtMinor(summary.wastedSpendMinorInt, currency)}
            hint={
              summary.worstCampaign
                ? `${bn ? "সবচেয়ে খারাপ" : "Worst"}: ${summary.worstCampaign.campaign}`
                : undefined
            }
            tone="danger"
          />
        </div>

        <Section
          title={bn ? "ট্রাফিকের ভাগ" : "Traffic split"}
          description={
            bn
              ? "সবুজ = আসল, হলুদ = সন্দেহজনক, লাল = বাতিল"
              : "Green = genuine, amber = suspicious, red = refused"
          }
        >
          <TrafficSplit summary={summary} />
        </Section>

        <Section
          title={bn ? "ক্যাম্পেইন ইন্টিগ্রিটি" : "Campaign integrity"}
          description={
            bn
              ? "রিপোর্ট করা CPC-র পাশে আসল CPC — পার্থক্যটাই আপনার ক্ষতি।"
              : "Reported CPC next to true CPC — the gap is what you actually lost."
          }
        >
          <CampaignTable
            rows={campaigns}
            emptyLabel={bn ? "এখনো কোনো ক্যাম্পেইন ডেটা নেই।" : "No campaign data yet."}
            onBlock={(name) =>
              void run(
                () =>
                  adFraudBlockFn({
                    data: { kind: "campaign", value: name, reason: "Blocked from integrity table" },
                  }),
                bn ? "ক্যাম্পেইন ব্লক করা হয়েছে।" : "Campaign blocked.",
              )
            }
          />
        </Section>

        <Section
          title={bn ? "বিজ্ঞাপন খরচ যোগ করুন" : "Record ad spend"}
          description={
            bn
              ? "নেটওয়ার্ক থেকে খরচ বসান, আমরা নষ্ট টাকার হিসাব করব।"
              : "Enter what the network charged you and we compute the wasted share."
          }
        >
          <form onSubmit={submitSpend} className="grid gap-3 sm:grid-cols-5">
            <label className="text-xs text-muted-foreground">
              {bn ? "নেটওয়ার্ক" : "Network"}
              <select
                value={network}
                onChange={(e) => setNetwork(e.target.value)}
                className="mt-1 w-full rounded-fq-sm border border-border bg-background px-2 py-1.5 text-sm text-foreground"
              >
                {["facebook", "google", "tiktok", "other"].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground sm:col-span-2">
              {bn ? "ক্যাম্পেইন" : "Campaign"}
              <input
                value={campaign}
                onChange={(e) => setCampaign(e.target.value)}
                className="mt-1 w-full rounded-fq-sm border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                placeholder="eid-sale"
              />
            </label>
            <label className="text-xs text-muted-foreground">
              {bn ? "তারিখ" : "Day"}
              <input
                type="date"
                value={day}
                max={today()}
                onChange={(e) => setDay(e.target.value)}
                className="mt-1 w-full rounded-fq-sm border border-border bg-background px-2 py-1.5 text-sm text-foreground"
              />
            </label>
            <label className="text-xs text-muted-foreground">
              {bn ? `খরচ (${currency})` : `Spend (${currency})`}
              <input
                inputMode="decimal"
                value={spend}
                onChange={(e) => setSpend(e.target.value)}
                className="mt-1 w-full rounded-fq-sm border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                placeholder="5000"
              />
            </label>
            <div className="sm:col-span-5">
              <button
                type="submit"
                disabled={busy}
                className="rounded-fq-sm bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {bn ? "সংরক্ষণ" : "Save spend"}
              </button>
            </div>
          </form>
        </Section>

        <Section
          title={bn ? "সাম্প্রতিক ক্লিক" : "Recent clicks"}
          description={
            bn ? "প্রতিটি রায়ের কারণ দেখতে ক্লিক করুন।" : "Open a row to see why we judged it that way."
          }
        >
          {desk.recentClicks.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {bn ? "এখনো কোনো ক্লিক আসেনি।" : "No ad clicks recorded yet."}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {desk.recentClicks.map((c) => (
                <li key={c.id} className="py-2">
                  <button
                    type="button"
                    aria-expanded={openClick === c.id}
                    onClick={() => setOpenClick(openClick === c.id ? null : c.id)}
                    className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
                  >
                    <span className="text-sm">
                      <span className="font-medium">{c.campaign ?? "—"}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {c.network} · {c.ipClass ?? "unknown"} · {c.country ?? "??"}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs tabular-nums text-muted-foreground">{c.score}</span>
                      <VerdictPill verdict={c.verdict} />
                    </span>
                  </button>
                  {openClick === c.id ? (
                    <div className="mt-2 rounded-fq-sm bg-muted/50 p-3">
                      <SignalList signals={bn ? c.explainedBn : c.explainedEn} />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title={bn ? "ব্লকলিস্ট" : "Blocklist"}
          description={
            bn
              ? "স্বয়ংক্রিয় ব্লক মেয়াদ শেষে খুলে যায়; ম্যানুয়াল ব্লক থেকে যায়।"
              : "Automatic blocks expire on their own; manual blocks stay until you lift them."
          }
        >
          {desk.blocklist.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {bn ? "কেউ ব্লক করা নেই।" : "Nothing is blocked right now."}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {desk.blocklist.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="text-sm">
                    <span className="font-medium">{b.label ?? b.kind}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {b.kind} · {b.auto ? (bn ? "স্বয়ংক্রিয়" : "auto") : bn ? "ম্যানুয়াল" : "manual"}
                      {b.reason ? ` · ${b.reason}` : ""}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => adFraudToggleBlockFn({ data: { id: b.id, active: !b.active } }),
                        b.active
                          ? bn
                            ? "ব্লক তুলে নেওয়া হয়েছে।"
                            : "Block lifted."
                          : bn
                            ? "আবার ব্লক করা হয়েছে।"
                            : "Block restored.",
                      )
                    }
                    className="rounded-fq-sm border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                  >
                    {b.active ? (bn ? "তুলে নিন" : "Unblock") : bn ? "ব্লক করুন" : "Block"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={bn ? "অডিট লগ" : "Audit log"}>
          {desk.audit.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {bn ? "কোনো কার্যক্রম নেই।" : "No actions recorded yet."}
            </p>
          ) : (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {desk.audit.map((a) => (
                <li key={a.id}>
                  <span className="tabular-nums">{new Date(a.created_at).toLocaleString()}</span>
                  <span className="ml-2 font-medium text-foreground">{a.action}</span>
                  {a.reason ? <span className="ml-2">{a.reason}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </AdminShell>
  );
}
