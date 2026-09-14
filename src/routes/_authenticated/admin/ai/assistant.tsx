import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  supportInboxFn,
  supportThreadFn,
  supportReplyFn,
  supportStatusFn,
} from "@/lib/ai-support.functions";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/ai/assistant")({
  loader: () => supportInboxFn(),
  head: () => ({
    meta: [
      { title: "AI সহায়তা — Framique admin" },
      { name: "description", content: "Buyer chat log, suggested replies and agent escalations." },
      { property: "og:title", content: "AI সহায়তা — Framique admin" },
      { property: "og:description", content: "Buyer chat log, suggested replies and escalations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AssistantPanel,
});

type Msg = { id: string; role: string; body: string; created_at: string };

function useStatusLabel() {
  const { t } = useLang();
  const STATUS_LABEL: Record<string, string> = {
    open: t("Open", "চলমান"),
    needs_agent: t("Needs agent", "এজেন্ট দরকার"),
    resolved: t("Resolved", "সমাধান হয়েছে"),
    closed: t("Closed", "বন্ধ"),
  };
  return STATUS_LABEL;
}

function AssistantPanel() {
  const initial = Route.useLoaderData();
  const router = useRouter();
  const { t } = useLang();
  const STATUS_LABEL = useStatusLabel();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [thread, setThread] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const { conversations, stats, suggestions } = initial;

  async function openThread(id: string) {
    setActiveId(id);
    setThread(await supportThreadFn({ data: { conversationId: id } }));
  }

  async function send() {
    if (!activeId || !draft.trim()) return;
    await supportReplyFn({ data: { conversationId: activeId, body: draft.trim() } });
    setDraft("");
    await openThread(activeId);
    await router.invalidate();
  }

  async function mark(status: "resolved" | "needs_agent") {
    if (!activeId) return;
    await supportStatusFn({ data: { conversationId: activeId, status } });
    await router.invalidate();
  }

  return (
    <AdminShell>
      <div className="space-y-6 p-6">
        <header>
          <h1 className="font-bangla-display text-xl font-semibold">{t("AI support", "AI সহায়তা")}</h1>
          <p className="text-sm text-muted-foreground">
            {t(
              "The assistant only suggests replies — it never changes orders, payments or stock itself.",
              "সহকারী কেবল পরামর্শ দেয় — অর্ডার, পেমেন্ট বা স্টক নিজে বদলায় না।",
            )}
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label={t("Total conversations", "মোট কথোপকথন")} value={String(stats.total)} />
          <Stat label={t("Last hour", "শেষ ১ ঘণ্টায়")} value={t(`${stats.lastHour}`, `${stats.lastHour}টি`)} />
          <Stat label={t("Needs agent", "এজেন্ট দরকার")} value={String(stats.needsAgent)} />
          <Stat
            label={t("Rating", "রেটিং")}
            value={stats.ratingAvg ? `${stats.ratingAvg.toFixed(1)} / 5 (${stats.ratingCount})` : "—"}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
          <ul className="divide-y divide-border rounded-fq-md border border-border bg-card">
            {conversations.length === 0 && (
              <li className="p-4 text-sm text-muted-foreground">{t("No conversations yet.", "এখনো কোনো কথোপকথন নেই।")}</li>
            )}
            {conversations.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => void openThread(c.id)}
                  className={`w-full px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    activeId === c.id ? "bg-muted" : ""
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm tabular-nums">{c.order_number ?? "—"}</span>
                    <span className="rounded-full border border-border px-2 py-0.5 text-xs">
                      {STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {new Date(c.last_message_at).toLocaleString("en-GB")}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <section className="rounded-fq-md border border-border bg-card p-4">
            {!activeId ? (
              <p className="text-sm text-muted-foreground">{t("Select a conversation.", "একটি কথোপকথন বেছে নিন।")}</p>
            ) : (
              <div className="space-y-4">
                <div className="max-h-80 space-y-2 overflow-y-auto text-sm">
                  {thread.map((m) => (
                    <p key={m.id} className={m.role === "customer" ? "" : "text-muted-foreground"}>
                      <span className="font-medium">{m.role}:</span> {m.body}
                    </p>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s.intent}
                      type="button"
                      onClick={() => setDraft(s.body)}
                      className="rounded-full border border-border px-3 py-1 text-xs"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={3}
                  aria-label={t("Type a reply", "উত্তর লিখুন")}
                  className="w-full rounded-fq-md border border-input bg-background p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void send()}
                    className="rounded-fq-md bg-primary px-3 py-2 text-sm text-primary-foreground"
                  >
                    Insert &amp; send
                  </button>
                  <button
                    type="button"
                    onClick={() => void mark("resolved")}
                    className="rounded-fq-md border border-border px-3 py-2 text-sm"
                  >
                    {t("Resolved", "সমাধান হয়েছে")}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </AdminShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-fq-md border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
