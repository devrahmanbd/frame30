import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, LifeBuoy, BookOpen, Plug, ShieldCheck, Timer, PhoneCall, Star } from "lucide-react";
import { useLang } from "@/lib/i18n";
import {
  getCsatAnalyticsFn,
  listCallbacksFn,
  supportAuditFn,
  supportChannelSaveFn,
  supportDeskFn,
  supportKbDeleteFn,
  supportKbSaveFn,
  supportSlaSaveFn,
  supportTicketCreateFn,
  supportTicketEventsFn,
  supportTicketUpdateFn,
  updateCallbackStatusFn,
} from "@/lib/support.functions";
import { DEFAULT_SLA, type Priority } from "@/lib/support-sla";
import { Empty, Pill, SLA_TONE, Section, Stat, minutes, ticketSla } from "@/components/admin/SupportDeskUi";

export const Route = createFileRoute("/_authenticated/admin/support")({
  head: () => ({
    meta: [
      { title: "Support desk — Framique admin" },
      {
        name: "description",
        content:
          "Tickets with SLA clocks, the AI knowledge base, WhatsApp and Messenger channels, and the guardrail audit trail in one desk.",
      },
      { property: "og:title", content: "Support desk — Framique admin" },
      {
        property: "og:description",
        content: "Tickets, SLA policies, knowledge base, channels and AI guardrail audit.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SupportDesk,
});

type Tab = "tickets" | "callbacks" | "kb" | "channels" | "sla" | "trust";
type TicketPatch = {
  ticketId: string;
  status?: (typeof STATUSES)[number];
  priority?: Priority;
  note?: string;
  firstResponse?: boolean;
};

type ChannelPatch = {
  id?: string | null;
  channel: "whatsapp" | "messenger";
  displayName: string;
  externalId: string;
  enabled: boolean;
  secret?: string | null;
};

const PRIORITIES: Priority[] = ["urgent", "high", "normal", "low"];
const STATUSES = ["open", "pending", "resolved", "closed"] as const;

const field =
  "w-full rounded-fq-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const btn =
  "inline-flex items-center gap-1 rounded-fq-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const btnGhost =
  "inline-flex items-center gap-1 inline-flex min-h-8 items-center rounded-fq-md border border-border px-2 py-1 text-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

function SupportDesk() {
  const { t } = useLang();
  const qc = useQueryClient();
  const loadDesk = useServerFn(supportDeskFn);
  const loadAudit = useServerFn(supportAuditFn);
  const [tab, setTab] = useState<Tab>("tickets");

  const desk = useQuery({ queryKey: ["support-desk"], queryFn: () => loadDesk(), staleTime: 15_000 });
  const audit = useQuery({
    queryKey: ["support-audit"],
    queryFn: () => loadAudit(),
    enabled: tab === "trust",
  });

  const refresh = () => void qc.invalidateQueries({ queryKey: ["support-desk"] });
  const summary = desk.data?.summary;

  const tabs: { key: Tab; label: string; Icon: typeof LifeBuoy }[] = [
    { key: "tickets", label: t("Tickets", "টিকিট"), Icon: LifeBuoy },
    { key: "callbacks", label: t("Callbacks", "কলব্যাক"), Icon: PhoneCall },
    { key: "kb", label: t("Knowledge base", "নলেজ বেস"), Icon: BookOpen },
    { key: "channels", label: t("Channels", "চ্যানেল"), Icon: Plug },
    { key: "sla", label: t("SLA policy", "এসএলএ নীতি"), Icon: Timer },
    { key: "trust", label: t("Trust & audit", "ট্রাস্ট ও অডিট"), Icon: ShieldCheck },
  ];

  return (
    <div className="space-y-5 p-4 md:p-6">
      <header>
        <h1 className="font-bangla-display text-xl font-semibold">{t("Support desk", "সাপোর্ট ডেস্ক")}</h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Every escalation, help article and channel the assistant relies on — with the SLA clock visible.",
            "প্রতিটি এসকেলেশন, সহায়তা নথি ও চ্যানেল — এসএলএ ঘড়িসহ।",
          )}
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("Open", "চলমান")} value={String(summary?.open ?? 0)} />
        <Stat label={t("Breached", "এসএলএ ভঙ্গ")} value={String(summary?.breached ?? 0)} />
        <Stat label={t("At risk", "ঝুঁকিতে")} value={String(summary?.atRisk ?? 0)} />
        <Stat
          label={t("Median first response", "গড় প্রথম উত্তর")}
          value={minutes(summary?.firstResponseP50Minutes ?? null)}
          hint={`${t("Resolution", "সমাধান")}: ${minutes(summary?.resolutionP50Minutes ?? null)}`}
        />
      </div>

      <nav className="flex flex-wrap gap-2" aria-label={t("Support sections", "সাপোর্ট সেকশন")}>
        {tabs.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-current={tab === key}
            className={`inline-flex items-center gap-1.5 rounded-fq-md border px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              tab === key ? "border-primary bg-info-soft text-info-foreground" : "border-border hover:bg-muted"
            }`}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        ))}
      </nav>

      {desk.isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t("Loading the desk…", "ডেস্ক লোড হচ্ছে…")}
        </p>
      ) : desk.isError ? (
        <p className="text-sm text-destructive">
          {t("The desk could not be loaded. Try again.", "ডেস্ক লোড করা যায়নি। আবার চেষ্টা করুন।")}
        </p>
      ) : (
        <>
          {tab === "tickets" ? <Tickets rows={desk.data?.tickets ?? []} onDone={refresh} /> : null}
          {tab === "callbacks" ? <CallbacksQueue /> : null}
          {tab === "kb" ? <KnowledgeBase docs={desk.data?.docs ?? []} onDone={refresh} /> : null}
          {tab === "channels" ? <Channels rows={desk.data?.channels ?? []} onDone={refresh} /> : null}
          {tab === "sla" ? <SlaPolicies rows={desk.data?.policies ?? []} onDone={refresh} /> : null}
          {tab === "trust" ? (
            <Trust guardrails={audit.data?.guardrails ?? []} tools={audit.data?.tools ?? []} />
          ) : null}
        </>
      )}
    </div>
  );
}

/* ------------------------------- tickets -------------------------------- */

type Ticket = NonNullable<Awaited<ReturnType<typeof supportDeskFn>>>["tickets"][number];

function Tickets({ rows, onDone }: { rows: Ticket[]; onDone: () => void }) {
  const { t } = useLang();
  const update = useServerFn(supportTicketUpdateFn);
  const create = useServerFn(supportTicketCreateFn);
  const events = useServerFn(supportTicketEventsFn);
  const [filter, setFilter] = useState<"all" | (typeof STATUSES)[number]>("open");
  const [openId, setOpenId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [note, setNote] = useState("");

  const shown = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter],
  );

  const timeline = useQuery({
    queryKey: ["support-ticket-events", openId],
    queryFn: () => events({ data: { ticketId: openId as string } }),
    enabled: Boolean(openId),
  });

  const patch = useMutation({
    mutationFn: (input: TicketPatch) => update({ data: input }),
    onSuccess: () => {
      toast.success(t("Ticket updated", "টিকিট আপডেট হয়েছে"));
      setNote("");
      onDone();
    },
    onError: () => toast.error(t("Could not update the ticket", "টিকিট আপডেট করা যায়নি")),
  });

  const open = useMutation({
    mutationFn: () => create({ data: { subject: subject.trim(), priority: "normal" } }),
    onSuccess: () => {
      toast.success(t("Ticket created", "টিকিট তৈরি হয়েছে"));
      setSubject("");
      onDone();
    },
    onError: () => toast.error(t("Could not create the ticket", "টিকিট তৈরি করা যায়নি")),
  });

  const active = rows.find((r) => r.id === openId) ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Section
        title={t("Queue", "সারি")}
        description={t("Sorted newest first. SLA state is computed live.", "নতুন আগে। এসএলএ অবস্থা লাইভ।")}
        action={
          <div className="flex flex-wrap gap-1">
            {(["all", ...STATUSES] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFilter(s)}
                className={`${btnGhost} ${filter === s ? "border-primary text-primary" : ""}`}
              >
                {s}
              </button>
            ))}
          </div>
        }
      >
        <form
          className="mb-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (subject.trim().length >= 3) open.mutate();
          }}
        >
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t("New ticket subject", "নতুন টিকিটের বিষয়")}
            className={field}
            aria-label={t("New ticket subject", "নতুন টিকিটের বিষয়")}
          />
          <button type="submit" className={btn} disabled={open.isPending || subject.trim().length < 3}>
            {open.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {t("Open", "খুলুন")}
          </button>
        </form>

        {shown.length === 0 ? (
          <Empty>{t("Nothing in this queue.", "এই সারিতে কিছু নেই।")}</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((ticket) => {
              const state = ticketSla({
                status: ticket.status,
                priority: ticket.priority as Priority,
                first_response_at: ticket.first_response_at,
                resolved_at: ticket.resolved_at,
                first_response_due_at: ticket.first_response_due_at,
                resolution_due_at: ticket.resolution_due_at,
                created_at: ticket.created_at,
              });
              return (
                <li key={ticket.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(ticket.id)}
                    className={`w-full px-1 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      openId === ticket.id ? "bg-muted/60" : ""
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{ticket.subject}</span>
                      <Pill tone={SLA_TONE[state]}>{state.replace("_", " ")}</Pill>
                      <Pill>{ticket.priority}</Pill>
                      <Pill>{ticket.channel}</Pill>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {ticket.status} · {new Date(ticket.created_at).toLocaleString()}
                      {ticket.order_number ? ` · #${ticket.order_number}` : ""}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section
        title={t("Ticket", "টিকিট")}
        description={t("Actions are audited with your note.", "প্রতিটি পদক্ষেপ নোটসহ অডিট হয়।")}
      >
        {!active ? (
          <Empty>{t("Select a ticket to work on it.", "কাজ করতে একটি টিকিট বেছে নিন।")}</Empty>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">{active.subject}</p>
              {active.body ? (
                <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{String(active.body ?? "")}</p>
              ) : null}
            </div>

            <label className="block text-xs text-muted-foreground">
              {t("Note (stored in the audit trail)", "নোট (অডিট ট্রেইলে সংরক্ষিত)")}
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 500))}
                rows={2}
                className={`mt-1 ${field}`}
              />
            </label>

            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                className={btnGhost}
                disabled={patch.isPending || Boolean(active.first_response_at)}
                onClick={() =>
                  patch.mutate({ ticketId: active.id, firstResponse: true, note: note || undefined })
                }
              >
                {t("Mark first response", "প্রথম উত্তর দেওয়া হয়েছে")}
              </button>
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={btnGhost}
                  disabled={patch.isPending || active.status === s}
                  onClick={() => patch.mutate({ ticketId: active.id, status: s, note: note || undefined })}
                >
                  {s}
                </button>
              ))}
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={btnGhost}
                  disabled={patch.isPending || active.priority === p}
                  onClick={() => patch.mutate({ ticketId: active.id, priority: p, note: note || undefined })}
                >
                  {p}
                </button>
              ))}
            </div>

            <div>
              <p className="text-xs font-medium">{t("History", "ইতিহাস")}</p>
              {timeline.isPending ? (
                <p className="text-xs text-muted-foreground">{t("Loading…", "লোড হচ্ছে…")}</p>
              ) : (timeline.data ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("No events yet.", "এখনও কোনো ইভেন্ট নেই।")}</p>
              ) : (
                <ol className="mt-1 space-y-1 text-xs text-muted-foreground">
                  {(timeline.data ?? []).map((e) => (
                    <li key={e.id}>
                      <span className="font-mono">{e.action}</span> ·{" "}
                      {new Date(e.created_at).toLocaleString()}
                      {e.reason ? ` — ${e.reason}` : ""}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}

/* ----------------------------- knowledge base ---------------------------- */

type Doc = NonNullable<Awaited<ReturnType<typeof supportDeskFn>>>["docs"][number];
type AuditData = NonNullable<Awaited<ReturnType<typeof supportAuditFn>>>;

function KnowledgeBase({ docs, onDone }: { docs: Doc[]; onDone: () => void }) {
  const { t } = useLang();
  const save = useServerFn(supportKbSaveFn);
  const remove = useServerFn(supportKbDeleteFn);
  const [draft, setDraft] = useState<{
    id: string | null;
    title: string;
    body: string;
    locale: "bn" | "en";
    status: "draft" | "published";
  }>({ id: null, title: "", body: "", locale: "bn", status: "published" });

  const write = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: draft.id,
          title: draft.title.trim(),
          body: draft.body.trim(),
          locale: draft.locale,
          status: draft.status,
          tags: [],
        },
      }),
    onSuccess: () => {
      toast.success(t("Saved · Knowledge base updated", "সংরক্ষিত · নলেজ বেস আপডেট হয়েছে"));
      setDraft({ id: null, title: "", body: "", locale: draft.locale, status: "published" });
      onDone();
    },
    onError: () => toast.error(t("Could not save the article", "নথি সংরক্ষণ করা যায়নি")),
  });

  const del = useMutation({
    mutationFn: (docId: string) => remove({ data: { docId } }),
    onSuccess: () => {
      toast.success(t("Article removed from retrieval", "নথি রিট্রিভাল থেকে সরানো হয়েছে"));
      onDone();
    },
    onError: () => toast.error(t("Could not remove the article", "নথি সরানো যায়নি")),
  });

  const valid = draft.title.trim().length >= 3 && draft.body.trim().length >= 10;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section
        title={draft.id ? t("Edit article", "নথি সম্পাদনা") : t("New article", "নতুন নথি")}
        description={t(
          "Published articles are what the assistant is allowed to quote.",
          "প্রকাশিত নথি থেকেই সহকারী উদ্ধৃতি দিতে পারে।",
        )}
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) write.mutate();
          }}
        >
          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder={t("Title", "শিরোনাম")}
            aria-label={t("Title", "শিরোনাম")}
            className={field}
          />
          <textarea
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            rows={8}
            placeholder={t("Answer body", "উত্তরের বিবরণ")}
            aria-label={t("Answer body", "উত্তরের বিবরণ")}
            className={field}
          />
          <div className="flex gap-2">
            <select
              value={draft.locale}
              onChange={(e) => setDraft({ ...draft, locale: e.target.value as "bn" | "en" })}
              aria-label={t("Language", "ভাষা")}
              className={field}
            >
              <option value="bn">বাংলা</option>
              <option value="en">English</option>
            </select>
            <select
              value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value as "draft" | "published" })}
              aria-label={t("Status", "অবস্থা")}
              className={field}
            >
              <option value="published">{t("Published", "প্রকাশিত")}</option>
              <option value="draft">{t("Draft", "খসড়া")}</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" className={btn} disabled={!valid || write.isPending}>
              {write.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {t("Save", "সংরক্ষণ")}
            </button>
            {draft.id ? (
              <button
                type="button"
                className={btnGhost}
                onClick={() =>
                  setDraft({ id: null, title: "", body: "", locale: draft.locale, status: "published" })
                }
              >
                {t("Cancel", "বাতিল")}
              </button>
            ) : null}
          </div>
        </form>
      </Section>

      <Section title={t("Articles", "নথিসমূহ")} description={`${docs.length}`}>
        {docs.length === 0 ? (
          <Empty>{t("No articles yet.", "এখনও কোনো নথি নেই।")}</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {docs.map((doc) => (
              <li key={doc.id} className="flex items-start justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{doc.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {doc.locale} · {doc.status} · {new Date(doc.updated_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    className={btnGhost}
                    onClick={() =>
                      setDraft({
                        id: doc.id,
                        title: doc.title,
                        body: String(doc.body ?? ""),
                        locale: doc.locale as "bn" | "en",
                        status: doc.status as "draft" | "published",
                      })
                    }
                  >
                    {t("Edit", "সম্পাদনা")}
                  </button>
                  <button
                    type="button"
                    className={btnGhost}
                    disabled={del.isPending}
                    onClick={() => del.mutate(doc.id)}
                  >
                    {t("Delete", "মুছুন")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

/* -------------------------------- channels ------------------------------- */

type ChannelRow = NonNullable<Awaited<ReturnType<typeof supportDeskFn>>>["channels"][number];

function Channels({ rows, onDone }: { rows: ChannelRow[]; onDone: () => void }) {
  const { t } = useLang();
  const save = useServerFn(supportChannelSaveFn);
  const [form, setForm] = useState<{
    id: string | null;
    channel: "whatsapp" | "messenger";
    displayName: string;
    externalId: string;
    enabled: boolean;
    secret: string;
  }>({ id: null, channel: "whatsapp", displayName: "", externalId: "", enabled: true, secret: "" });

  const write = useMutation({
    mutationFn: (input: ChannelPatch) => save({ data: input }),
    onSuccess: () => {
      toast.success(t("Channel saved", "চ্যানেল সংরক্ষিত"));
      setForm({ id: null, channel: form.channel, displayName: "", externalId: "", enabled: true, secret: "" });
      onDone();
    },
    onError: () => toast.error(t("Could not save the channel", "চ্যানেল সংরক্ষণ করা যায়নি")),
  });

  const valid = form.displayName.trim().length >= 2 && form.externalId.trim().length >= 3;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section
        title={t("Connect a channel", "চ্যানেল যুক্ত করুন")}
        description={t(
          "Point the provider webhook at /api/public/channels/whatsapp or /messenger. Signatures are verified before intake.",
          "প্রোভাইডার ওয়েবহুক /api/public/channels/whatsapp বা /messenger এ দিন। সিগনেচার যাচাই করেই গ্রহণ করা হয়।",
        )}
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            write.mutate({
              id: form.id,
              channel: form.channel,
              displayName: form.displayName.trim(),
              externalId: form.externalId.trim(),
              enabled: form.enabled,
              secret: form.secret.trim() ? form.secret.trim() : null,
            });
          }}
        >
          <select
            value={form.channel}
            onChange={(e) => setForm({ ...form, channel: e.target.value as "whatsapp" | "messenger" })}
            aria-label={t("Channel", "চ্যানেল")}
            className={field}
          >
            <option value="whatsapp">WhatsApp</option>
            <option value="messenger">Messenger</option>
          </select>
          <input
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            placeholder={t("Display name", "প্রদর্শন নাম")}
            aria-label={t("Display name", "প্রদর্শন নাম")}
            className={field}
          />
          <input
            value={form.externalId}
            onChange={(e) => setForm({ ...form, externalId: e.target.value })}
            placeholder={t("Provider ID (phone number id / page id)", "প্রোভাইডার আইডি")}
            aria-label={t("Provider ID", "প্রোভাইডার আইডি")}
            className={`${field} font-mono`}
          />
          <input
            value={form.secret}
            onChange={(e) => setForm({ ...form, secret: e.target.value })}
            type="password"
            placeholder={t("Shared secret (stored hashed)", "শেয়ার্ড সিক্রেট (হ্যাশ করে রাখা হয়)")}
            aria-label={t("Shared secret", "শেয়ার্ড সিক্রেট")}
            className={field}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
            {t("Accept inbound messages", "ইনবাউন্ড বার্তা গ্রহণ করুন")}
          </label>
          <button type="submit" className={btn} disabled={!valid || write.isPending}>
            {write.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {t("Save channel", "চ্যানেল সংরক্ষণ")}
          </button>
        </form>
      </Section>

      <Section title={t("Connected", "যুক্ত")} description={`${rows.length}`}>
        {rows.length === 0 ? (
          <Empty>{t("No channels connected.", "কোনো চ্যানেল যুক্ত নেই।")}</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                <div>
                  <p className="text-sm font-medium">
                    {c.display_name} <Pill tone={c.enabled ? "ok" : "muted"}>{c.status}</Pill>
                  </p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {c.channel} · {c.external_id}
                    {c.last_event_at ? ` · ${new Date(c.last_event_at).toLocaleString()}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className={btnGhost}
                  disabled={write.isPending}
                  onClick={() =>
                    write.mutate({
                      id: c.id,
                      channel: c.channel as "whatsapp" | "messenger",
                      displayName: c.display_name ?? "",
                      externalId: c.external_id ?? "",
                      enabled: !c.enabled,
                    })
                  }
                >
                  {c.enabled ? t("Pause", "থামান") : t("Resume", "চালু")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

/* ---------------------------------- SLA ---------------------------------- */

type PolicyRow = { priority: string; first_response_minutes: number; resolution_minutes: number };

function SlaPolicies({ rows, onDone }: { rows: PolicyRow[]; onDone: () => void }) {
  const { t } = useLang();
  const save = useServerFn(supportSlaSaveFn);
  const [draft, setDraft] = useState<Record<string, { first: number; resolution: number }>>({});

  const value = (p: Priority) => {
    const row = rows.find((r) => r.priority === p);
    return (
      draft[p] ?? {
        first: row?.first_response_minutes ?? DEFAULT_SLA[p].first,
        resolution: row?.resolution_minutes ?? DEFAULT_SLA[p].resolution,
      }
    );
  };

  const write = useMutation({
    mutationFn: (p: Priority) =>
      save({
        data: {
          priority: p,
          first_response_minutes: value(p).first,
          resolution_minutes: value(p).resolution,
        },
      }),
    onSuccess: () => {
      toast.success(t("SLA policy saved", "এসএলএ নীতি সংরক্ষিত"));
      onDone();
    },
    onError: () => toast.error(t("Could not save the policy", "নীতি সংরক্ষণ করা যায়নি")),
  });

  return (
    <Section
      title={t("Response targets", "উত্তরের লক্ষ্য")}
      description={t(
        "Deadlines are stamped when a ticket is created, so editing a policy never re-dates history.",
        "টিকিট তৈরির সময়েই সময়সীমা নির্ধারিত হয়, তাই নীতি বদলালে পুরোনো টিকিট বদলায় না।",
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-2">{t("Priority", "অগ্রাধিকার")}</th>
              <th className="py-2">{t("First response (min)", "প্রথম উত্তর (মিনিট)")}</th>
              <th className="py-2">{t("Resolution (min)", "সমাধান (মিনিট)")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {PRIORITIES.map((p) => {
              const v = value(p);
              return (
                <tr key={p} className="border-t border-border">
                  <td className="py-2 font-medium">{p}</td>
                  <td className="py-2">
                    <input
                      type="number"
                      min={5}
                      max={10080}
                      value={v.first}
                      aria-label={`${p} first response minutes`}
                      onChange={(e) =>
                        setDraft({ ...draft, [p]: { ...v, first: Number(e.target.value) || 0 } })
                      }
                      className={`${field} w-28 tabular-nums`}
                    />
                  </td>
                  <td className="py-2">
                    <input
                      type="number"
                      min={15}
                      max={43200}
                      value={v.resolution}
                      aria-label={`${p} resolution minutes`}
                      onChange={(e) =>
                        setDraft({ ...draft, [p]: { ...v, resolution: Number(e.target.value) || 0 } })
                      }
                      className={`${field} w-28 tabular-nums`}
                    />
                  </td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      className={btnGhost}
                      disabled={write.isPending}
                      onClick={() => write.mutate(p)}
                    >
                      {t("Save", "সংরক্ষণ")}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

/* --------------------------------- trust --------------------------------- */

function Trust({ guardrails, tools }: { guardrails: AuditData["guardrails"]; tools: AuditData["tools"] }) {
  const { t } = useLang();
  const getCsat = useServerFn(getCsatAnalyticsFn);
  const csat = useQuery({
    queryKey: ["support-csat-analytics"],
    queryFn: () => getCsat(),
    staleTime: 15_000,
  });

  const csatData = csat.data ?? {
    averageRating: 5.0,
    totalRatings: 0,
    distribution: { stars5: 0, stars4: 0, stars3: 0, stars2: 0, stars1: 0 },
    recentReviews: [],
  };

  const total = Math.max(1, csatData.totalRatings);

  return (
    <div className="space-y-4">
      {/* CSAT Analytics & Satisfaction Breakdown */}
      <Section
        title={t("Chat Satisfaction & CSAT Analytics", "চ্যাট সন্তুষ্টি ও সি-স্যাট অ্যানালিটিক্স")}
        description={t(
          "Customer 5-star ratings and qualitative reviews submitted directly through the storefront widget.",
          "স্টোরফ্রন্ট উইজেটের মাধ্যমে গ্রাহকদের দেওয়া ৫-স্টার রেটিং ও মতামত।",
        )}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col items-center justify-center rounded-fq-md border border-border bg-muted/20 p-4 text-center">
            <div className="flex items-center gap-1 text-2xl font-bold text-foreground">
              <Star className="size-6 fill-amber-400 text-amber-400" />
              <span>{csatData.averageRating.toFixed(1)}</span>
              <span className="text-sm font-normal text-muted-foreground">/ 5.0</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(`Based on ${csatData.totalRatings} ratings`, `${csatData.totalRatings}টি রেটিংয়ের ভিত্তিতে`)}
            </p>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            {[5, 4, 3, 2, 1].map((stars) => {
              const count =
                stars === 5
                  ? csatData.distribution.stars5
                  : stars === 4
                    ? csatData.distribution.stars4
                    : stars === 3
                      ? csatData.distribution.stars3
                      : stars === 2
                        ? csatData.distribution.stars2
                        : csatData.distribution.stars1;
              const pct = Math.round((count / total) * 100);

              return (
                <div key={stars} className="flex items-center gap-2 text-xs">
                  <span className="w-8 font-medium text-foreground">{stars} ★</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-amber-400 transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-8 text-right tabular-nums text-muted-foreground">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {csatData.recentReviews.length > 0 && (
          <div className="mt-4 border-t border-border pt-3">
            <h4 className="text-xs font-semibold text-foreground mb-2">
              {t("Recent Customer Reviews", "সাম্প্রতিক গ্রাহক মতামত")}
            </h4>
            <div className="space-y-2">
              {csatData.recentReviews.map((rev) => (
                <div key={rev.id} className="rounded-fq-md border border-border/60 bg-card p-2.5 text-xs">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`size-3 ${
                            i < rev.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"
                          }`}
                        />
                      ))}
                    </div>
                    <span>{new Date(rev.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-foreground italic">"{rev.review}"</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title={t("Guardrail events", "গার্ডরেল ইভেন্ট")}
          description={t(
            "Blocked injections, authority claims and PII redactions.",
            "ব্লক করা ইনজেকশন, কর্তৃত্ব দাবি ও পিআইআই রিড্যাকশন।",
          )}
        >
          {guardrails.length === 0 ? (
            <Empty>{t("Nothing blocked recently.", "সম্প্রতি কিছু ব্লক হয়নি।")}</Empty>
          ) : (
            <ul className="space-y-1 text-xs">
              {guardrails.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-2">
                  <span>
                    <Pill tone="bad">{g.kind}</Pill> <span className="font-mono">{g.rule}</span>
                  </span>
                  <span className="text-muted-foreground">{new Date(g.created_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title={t("Pinned tool calls", "পিন করা টুল কল")}
          description={t(
            "Every figure the assistant quoted came from one of these.",
            "সহকারীর বলা প্রতিটি সংখ্যা এখান থেকেই এসেছে।",
          )}
        >
          {tools.length === 0 ? (
            <Empty>{t("No lookups yet.", "এখনও কোনো লুকআপ হয়নি।")}</Empty>
          ) : (
            <ul className="space-y-1 text-xs">
              {tools.map((tool) => (
                <li key={tool.id} className="flex items-center justify-between gap-2">
                  <span>
                    <Pill tone={tool.ok ? "ok" : "bad"}>{tool.tool}</Pill>{" "}
                    <span className="font-mono text-muted-foreground">{tool.source_table}</span>
                  </span>
                  <span className="tabular-nums text-muted-foreground">{tool.latency_ms}ms</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

/* ------------------------------- callbacks queue ------------------------- */

function CallbacksQueue() {
  const { t } = useLang();
  const qc = useQueryClient();
  const getCallbacks = useServerFn(listCallbacksFn);
  const updateStatus = useServerFn(updateCallbackStatusFn);

  const query = useQuery({
    queryKey: ["support-callbacks"],
    queryFn: () => getCallbacks(),
    staleTime: 10_000,
  });

  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleStatus(callbackId: string, status: "contacted" | "failed" | "cancelled") {
    setBusyId(callbackId);
    try {
      const res = await updateStatus({ data: { callbackId, status } });
      if (res.ok) {
        toast.success(t(`Callback marked as ${status}`, `কলব্যাক স্ট্যাটাস ${status} করা হয়েছে`));
        void qc.invalidateQueries({ queryKey: ["support-callbacks"] });
      } else {
        toast.error(t("Failed to update status", "স্ট্যাটাস আপডেট করা যায়নি"));
      }
    } catch {
      toast.error(t("Error updating callback", "কলব্যাক আপডেট করতে ত্রুটি"));
    } finally {
      setBusyId(null);
    }
  }

  const rows = (query.data ?? []) as Array<{
    id: string;
    customer_name: string;
    phone_e164: string;
    preferred_window: string;
    status: string;
    note?: string | null;
    created_at: string;
  }>;
  const pendingCount = rows.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-4">
      <Section
        title={t("In-Chat Callback Requests", "ইন-চ্যাট কলব্যাক অনুরোধ")}
        description={t(
          "Customer phone call requests captured directly by the assistant in the storefront chat.",
          "স্টোরফ্রন্ট চ্যাট থেকে সহকারী দ্বারা সরাসরি রেকর্ড করা ফোন কল অনুরোধ।",
        )}
      >
        <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {t("Pending calls:", "অপেক্ষমাণ কল:")}{" "}
            <strong className="text-foreground">{pendingCount}</strong>
          </span>
          <button
            type="button"
            onClick={() => void qc.invalidateQueries({ queryKey: ["support-callbacks"] })}
            className={btnGhost}
          >
            {t("Refresh", "রিফ্রেশ")}
          </button>
        </div>

        {query.isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t("Loading callbacks…", "কলব্যাক লোড হচ্ছে…")}
          </p>
        ) : rows.length === 0 ? (
          <Empty>{t("No callback requests found.", "কোনো কলব্যাক অনুরোধ পাওয়া যায়নি।")}</Empty>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-fq-md border border-border bg-card">
            {rows.map((cb) => {
              const windowLabels: Record<string, { en: string; bn: string; time: string }> = {
                morning: { en: "Morning", bn: "সকাল", time: "10am–1pm" },
                afternoon: { en: "Afternoon", bn: "দুপুর", time: "2pm–5pm" },
                evening: { en: "Evening", bn: "সন্ধ্যা", time: "6pm–9pm" },
              };
              const w = windowLabels[cb.preferred_window] ?? {
                en: cb.preferred_window,
                bn: cb.preferred_window,
                time: "",
              };

              const tone =
                cb.status === "contacted"
                  ? "ok"
                  : cb.status === "failed" || cb.status === "cancelled"
                    ? "bad"
                    : "warn";

              return (
                <div key={cb.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground text-sm">{cb.customer_name}</span>
                      <Pill tone={tone}>{cb.status}</Pill>
                      <span className="text-xs font-mono text-muted-foreground">
                        #CB-{cb.id.slice(-6).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <a
                        href={`tel:${cb.phone_e164}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {cb.phone_e164}
                      </a>
                      <span>•</span>
                      <span>
                        {t(w.en, w.bn)} ({w.time})
                      </span>
                      <span>•</span>
                      <span>{new Date(cb.created_at).toLocaleString()}</span>
                    </div>
                    {cb.note ? (
                      <p className="text-xs text-foreground/80 italic mt-0.5">"{cb.note}"</p>
                    ) : null}
                  </div>

                  {cb.status === "pending" ? (
                    <div className="flex items-center gap-1.5 pt-2 sm:pt-0">
                      <button
                        type="button"
                        disabled={busyId === cb.id}
                        onClick={() => handleStatus(cb.id, "contacted")}
                        className="inline-flex items-center gap-1 rounded-fq-md bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        {t("Mark Contacted", "যোগাযোগ সম্পন্ন")}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === cb.id}
                        onClick={() => handleStatus(cb.id, "failed")}
                        className={btnGhost}
                      >
                        {t("Failed", "ব্যর্থ")}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === cb.id}
                        onClick={() => handleStatus(cb.id, "cancelled")}
                        className={btnGhost}
                      >
                        {t("Cancel", "বাতিল")}
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}
