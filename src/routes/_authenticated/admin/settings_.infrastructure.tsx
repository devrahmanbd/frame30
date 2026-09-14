import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
  JobTable,
  Kpi,
  LoadTestTable,
  QueueTable,
  Section,
  type JobRow,
  type LoadTestRow,
  type QueueRow,
} from "@/components/admin/InfrastructureUi";
import { useLang } from "@/lib/i18n";
import {
  infraJobActionFn,
  infraOverviewFn,
  infraReindexFn,
  infraSaveSearchFn,
} from "@/lib/infra.functions";

export const Route = createFileRoute("/_authenticated/admin/settings_/infrastructure")({
  loader: () => infraOverviewFn(),
  head: () => ({
    meta: [
      { title: "ইনফ্রাস্ট্রাকচার — Framique admin" },
      {
        name: "description",
        content: "Background queues, fast search health, image delivery and load-test results for your store.",
      },
      { property: "og:title", content: "ইনফ্রাস্ট্রাকচার — Framique admin" },
      {
        property: "og:description",
        content: "Monitor job queues, search failover and load tests in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Infrastructure,
});

function Infrastructure() {
  const desk = Route.useLoaderData();
  const router = useRouter();
  const { lang } = useLang();
  const bn = lang === "bn";

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [engine, setEngine] = useState(desk.search.engine);
  const [host, setHost] = useState(desk.search.host ?? "");
  const [indexName, setIndexName] = useState(desk.search.indexName ?? "");
  const [timeoutMs, setTimeoutMs] = useState(String(desk.search.timeoutMs));
  const [apiKey, setApiKey] = useState("");

  const queues = desk.queues as QueueRow[];
  const jobs = desk.jobs as JobRow[];
  const loadTests = desk.loadTests as LoadTestRow[];

  const waiting = queues.reduce((sum, q) => sum + q.queued, 0);
  const dead = queues.reduce((sum, q) => sum + q.dead, 0);
  const breakerOpen = desk.search.breaker.openedAt !== null;

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

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    if (engine !== "postgres" && !host.trim()) {
      setErr(bn ? "সার্চ সার্ভারের ঠিকানা দিন।" : "Enter the search server address.");
      return;
    }
    void run(
      () =>
        infraSaveSearchFn({
          data: {
            engine,
            host: host.trim() || null,
            indexName: indexName.trim() || null,
            timeoutMs: Number(timeoutMs) || 400,
            ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          },
        }),
      bn ? "সার্চ সেটিংস সংরক্ষিত হয়েছে।" : "Search settings saved.",
    );
    setApiKey("");
  }

  return (
    <>
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-xl font-semibold">
            {bn ? "ইনফ্রাস্ট্রাকচার" : "Infrastructure"}
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {bn
              ? "ব্যাকগ্রাউন্ড কাজ, দ্রুত সার্চ ও ছবি ডেলিভারির স্বাস্থ্য এখানে দেখুন। কোনো কাজ আটকে গেলে এখান থেকেই আবার চালানো যায়।"
              : "Background work, fast search and image delivery in one place. Anything that gave up can be replayed from here — nothing is lost silently."}
          </p>
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
            label={bn ? "অপেক্ষমাণ কাজ" : "Jobs waiting"}
            value={String(waiting)}
            hint={bn ? "কর্মী প্রতি মিনিটে চালায়" : "Workers run every minute"}
          />
          <Kpi
            label={bn ? "হাল ছেড়ে দেওয়া কাজ" : "Jobs that gave up"}
            value={String(dead)}
            hint={bn ? "রিপ্লে করা যাবে" : "Replayable below"}
          />
          <Kpi
            label={bn ? "সার্চ ইঞ্জিন" : "Search engine"}
            value={breakerOpen ? (bn ? "ফলব্যাক" : "Fallback") : desk.search.engine}
            hint={
              breakerOpen
                ? bn
                  ? "দ্রুত সার্চ সাময়িকভাবে বন্ধ, বিল্ট-ইন সার্চ চলছে"
                  : "Fast search paused; built-in search is serving"
                : bn
                  ? "স্বাভাবিক"
                  : "Serving normally"
            }
          />
          <Kpi
            label={bn ? "ইনডেক্স করা পণ্য" : "Indexed documents"}
            value={String(desk.search.documentsIndexed)}
            hint={
              desk.search.lastIndexedAt
                ? new Date(desk.search.lastIndexedAt).toLocaleString()
                : bn
                  ? "এখনো হয়নি"
                  : "Not yet"
            }
          />
        </div>

        <Section
          title={bn ? "ব্যাকগ্রাউন্ড কিউ" : "Background queues"}
          description={
            bn
              ? "প্রতিটি কিউ নিজস্ব নিয়মে রিট্রাই করে; টাকার কাজ সবচেয়ে বেশি চেষ্টা পায়।"
              : "Each queue retries on its own policy — money work retries hardest, bulk work gives up early."
          }
        >
          <QueueTable rows={queues} emptyLabel={bn ? "কোনো কাজ নেই।" : "Nothing queued right now."} />
        </Section>

        <Section
          title={bn ? "সাম্প্রতিক কাজ" : "Recent jobs"}
          description={
            bn
              ? "ব্যর্থ কাজের কারণসহ তালিকা। সমস্যা ঠিক করে রিপ্লে দিন।"
              : "Failures are shown with the reason. Fix the cause, then replay — attempts reset."
          }
        >
          <JobTable
            rows={jobs}
            busy={busy}
            emptyLabel={bn ? "এখনো কোনো কাজ চলেনি।" : "No jobs have run yet."}
            onReplay={(id) =>
              void run(
                () => infraJobActionFn({ data: { jobId: id, action: "replay" } }),
                bn ? "কাজটি আবার সারিতে দেওয়া হয়েছে।" : "Job requeued.",
              )
            }
            onCancel={(id) =>
              void run(
                () => infraJobActionFn({ data: { jobId: id, action: "cancel" } }),
                bn ? "কাজটি বাতিল হয়েছে।" : "Job cancelled.",
              )
            }
          />
        </Section>

        <Section
          title={bn ? "দ্রুত সার্চ" : "Fast search"}
          description={
            bn
              ? "বাইরের সার্চ সার্ভার বন্ধ হলে দোকান বন্ধ হবে না — নিজে থেকেই বিল্ট-ইন সার্চে ফিরে যাবে।"
              : "If the external cluster dies, search does not: the breaker trips and built-in search takes over automatically."
          }
          action={
            <button
              type="button"
              disabled={busy || desk.search.engine === "postgres"}
              onClick={() =>
                void run(
                  () => infraReindexFn(),
                  bn ? "রি-ইনডেক্স সারিতে দেওয়া হয়েছে।" : "Re-index queued.",
                )
              }
              className="rounded-fq-sm border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
            >
              {bn ? "সব পণ্য রি-ইনডেক্স" : "Re-index all products"}
            </button>
          }
        >
          <form onSubmit={submitSearch} className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">{bn ? "ইঞ্জিন" : "Engine"}</span>
              <select
                value={engine}
                onChange={(e) => setEngine(e.target.value as typeof engine)}
                className="w-full rounded-fq-sm border border-border bg-background px-3 py-2"
              >
                <option value="postgres">Built-in (Postgres)</option>
                <option value="meilisearch">Meilisearch</option>
                <option value="typesense">Typesense</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">
                {bn ? "সার্ভার ঠিকানা" : "Server URL"}
              </span>
              <input
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="https://search.example.com"
                className="w-full rounded-fq-sm border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">
                {bn ? "ইনডেক্সের নাম" : "Index name"}
              </span>
              <input
                value={indexName}
                onChange={(e) => setIndexName(e.target.value)}
                placeholder="products"
                className="w-full rounded-fq-sm border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">
                {bn ? "টাইমআউট (ms)" : "Timeout (ms)"}
              </span>
              <input
                value={timeoutMs}
                onChange={(e) => setTimeoutMs(e.target.value)}
                inputMode="numeric"
                className="w-full rounded-fq-sm border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block text-xs text-muted-foreground">
                {bn ? "API কী" : "API key"}
                {desk.search.hasApiKey ? (bn ? " (সংরক্ষিত আছে)" : " (saved)") : ""}
              </span>
              <input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                type="password"
                autoComplete="off"
                placeholder={desk.search.hasApiKey ? "••••••••" : ""}
                className="w-full rounded-fq-sm border border-border bg-background px-3 py-2"
              />
            </label>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={busy}
                className="rounded-fq-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {bn ? "সংরক্ষণ" : "Save search settings"}
              </button>
              {desk.search.breaker.lastFailureCode ? (
                <span className="ml-3 text-xs text-muted-foreground">
                  {bn ? "শেষ সমস্যা: " : "Last failure: "}
                  {desk.search.breaker.lastFailureCode}
                </span>
              ) : null}
            </div>
          </form>
        </Section>

        <Section
          title={bn ? "লোড টেস্ট" : "Load tests"}
          description={
            bn
              ? "ঈদ বা ক্যাম্পেইনের আগে দোকান কত চাপ নিতে পারে তা এখানে রেকর্ড থাকে।"
              : "Recorded results from k6/Artillery runs, so you know the store's ceiling before a campaign finds it for you."
          }
        >
          <LoadTestTable rows={loadTests} emptyLabel={bn ? "কোনো টেস্ট রেকর্ড নেই।" : "No load tests recorded yet."} />
        </Section>
      </div>
    </>
  );
}
