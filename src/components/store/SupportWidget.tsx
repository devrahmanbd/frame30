import { useEffect, useMemo, useRef, useState } from "react";
import {
  MessageCircle,
  X,
  Send,
  ShieldCheck,
  BookOpen,
  LifeBuoy,
  ThumbsUp,
  ThumbsDown,
  Ticket,
  PhoneCall,
  Clock,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Star,
} from "lucide-react";
import {
  askSupportFn,
  rateSupportFn,
  createSupportTicketWidgetFn,
  requestCallbackFn,
} from "@/lib/support.functions";
import { useLang } from "@/lib/i18n";

type Source = { label: string; table: string; title?: string };
type Confidence = "pinned" | "grounded" | "unsure";

type TicketCard = {
  ticketId: string;
  ticketRef: string;
  subject: string;
  priority: string;
  status: string;
  firstResponseDueAt: string;
  agentMessage: string;
};

type CallbackCard = {
  callbackId: string;
  callbackRef: string;
  customerName: string;
  window: string;
  windowDescription: string;
  agentMessage: string;
};

type Msg = {
  id: string;
  role: "customer" | "bot";
  body: string;
  sources?: Source[];
  confidence?: Confidence;
  /** legacy cta=true → show "talk to care" link */
  cta?: boolean;
  ticketId?: string | null;
  ticketCard?: TicketCard | null;
  callbackCard?: CallbackCard | null;
};

/** Mini step-form state machine for the in-chat forms */
type ActiveForm = "none" | "ticket" | "callback";

const STAR_LABELS = [
  { en: "Terrible", bn: "খুব খারাপ" },
  { en: "Poor", bn: "খারাপ" },
  { en: "Average", bn: "সাধারণ" },
  { en: "Good", bn: "ভালো" },
  { en: "Excellent", bn: "চমৎকার" },
];

const uid = () => Math.random().toString(36).slice(2);

// ─── Sub-components ──────────────────────────────────────────────────────────

function ConfidenceChip({ value }: { value: Confidence }) {
  const { t } = useLang();
  const map: Record<Confidence, { label: string; className: string; Icon: typeof ShieldCheck }> = {
    pinned: {
      label: t("Verified from your records", "আপনার রেকর্ড থেকে যাচাই করা"),
      className: "bg-primary/10 text-primary",
      Icon: ShieldCheck,
    },
    grounded: {
      label: t("From our help articles", "আমাদের সহায়তা নথি থেকে"),
      className: "bg-muted text-muted-foreground",
      Icon: BookOpen,
    },
    unsure: {
      label: t("A human should confirm this", "একজন মানুষ নিশ্চিত করবেন"),
      className: "bg-destructive/10 text-destructive",
      Icon: LifeBuoy,
    },
  };
  const { label, className, Icon } = map[value];
  return (
    <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${className}`}>
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  );
}

/** Phase 9.3: Inline Ticket Success Card */
function TicketSuccessCard({ card }: { card: TicketCard }) {
  const { t } = useLang();
  const [expanded, setExpanded] = useState(false);
  const due = new Date(card.firstResponseDueAt);
  const dueLabel = due.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });

  return (
    <div className="mt-2 overflow-hidden rounded-fq-md border border-primary/20 bg-primary/5">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="grid size-6 place-items-center rounded-full bg-primary text-primary-foreground">
            <Ticket className="size-3.5" aria-hidden />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-primary">{card.ticketRef}</p>
            <p className="text-[10px] text-muted-foreground capitalize">
              {card.priority} • {card.status}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((s) => !s)}
          className="rounded p-0.5 text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={expanded ? t("Collapse", "সংকুচিত করুন") : t("Expand", "প্রসারিত করুন")}
        >
          {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>
      </div>
      {expanded && (
        <div className="border-t border-primary/10 px-3 py-2 text-[11px] text-muted-foreground">
          <p className="font-medium text-foreground">{card.subject}</p>
          <p className="mt-1 flex items-center gap-1">
            <Clock className="size-3" />
            {t("First response by:", "প্রথম সাড়া দেওয়ার সময়সীমা:")} <span className="font-medium text-foreground">{dueLabel}</span>
          </p>
        </div>
      )}
    </div>
  );
}

/** Phase 9.4: Inline Callback Success Card */
function CallbackSuccessCard({ card }: { card: CallbackCard }) {
  const { t } = useLang();
  const windowLabel =
    card.window === "morning"
      ? t("Morning", "সকাল")
      : card.window === "afternoon"
        ? t("Afternoon", "দুপুর")
        : t("Evening", "সন্ধ্যা");

  return (
    <div className="mt-2 overflow-hidden rounded-fq-md border border-green-500/20 bg-green-500/5">
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="grid size-6 place-items-center rounded-full bg-green-600 text-white">
          <PhoneCall className="size-3.5" aria-hidden />
        </div>
        <div>
          <p className="text-[11px] font-semibold text-green-700 dark:text-green-400">{card.callbackRef}</p>
          <p className="text-[10px] text-muted-foreground">
            {t("Callback", "কলব্যাক")} · {windowLabel} · {card.windowDescription}
          </p>
        </div>
        <CheckCircle className="ml-auto size-4 shrink-0 text-green-600" aria-hidden />
      </div>
    </div>
  );
}

// ─── In-chat Ticket Form (Phase 9.3) ─────────────────────────────────────────

type TicketFormProps = {
  slug: string;
  conversationId: string | null;
  phone: string;
  orderNumber: string;
  lastBotMessage: string;
  onCancel: () => void;
  onSuccess: (card: TicketCard, agentMsg: string) => void;
};

function TicketForm({ slug, conversationId, phone, orderNumber, lastBotMessage, onCancel, onSuccess }: TicketFormProps) {
  const { t } = useLang();
  const [subject, setSubject] = useState(lastBotMessage.slice(0, 120) || "");
  const [details, setDetails] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await createSupportTicketWidgetFn({
        data: {
          slug,
          conversationId,
          subject: subject.trim(),
          body: details.trim() || undefined,
          priority,
          orderNumber: orderNumber.trim() || null,
          phone: phone.trim() || null,
        },
      });
      if (res.ok) {
        onSuccess(
          {
            ticketId: res.ticketId!,
            ticketRef: res.ticketRef!,
            subject: res.subject!,
            priority: res.priority!,
            status: res.status!,
            firstResponseDueAt: res.firstResponseDueAt!,
            agentMessage: res.agentMessage!,
          },
          res.agentMessage!,
        );
      } else {
        setError(res.reply || t("Failed to create ticket.", "টিকিট তৈরি করা যায়নি।"));
      }
    } catch {
      setError(t("Something went wrong. Please try again.", "কিছু একটা সমস্যা হয়েছে। আবার চেষ্টা করুন।"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-2 rounded-fq-md border border-border bg-card p-3 text-sm"
      aria-label={t("Create support ticket", "সাপোর্ট টিকিট তৈরি করুন")}
    >
      <div className="flex items-center gap-2">
        <Ticket className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="font-semibold text-foreground">{t("Create Support Ticket", "সাপোর্ট টিকিট তৈরি করুন")}</span>
      </div>

      <label className="block text-xs text-muted-foreground">
        {t("Subject *", "বিষয় *")}
        <input
          required
          maxLength={180}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="mt-0.5 w-full rounded-fq-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder={t("Briefly describe your issue", "আপনার সমস্যা সংক্ষেপে লিখুন")}
        />
      </label>

      <label className="block text-xs text-muted-foreground">
        {t("Details", "বিস্তারিত")}
        <textarea
          maxLength={1000}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={3}
          className="mt-0.5 w-full resize-none rounded-fq-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder={t("More context helps us resolve faster", "বিস্তারিত বিবরণ দিলে দ্রুত সমাধান হবে")}
        />
      </label>

      <label className="block text-xs text-muted-foreground">
        {t("Priority", "অগ্রাধিকার")}
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as typeof priority)}
          className="mt-0.5 w-full rounded-fq-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="low">{t("Low — general inquiry", "কম — সাধারণ জিজ্ঞাসা")}</option>
          <option value="normal">{t("Normal — standard issue", "স্বাভাবিক — সাধারণ সমস্যা")}</option>
          <option value="high">{t("High — urgent but stable", "বেশি — জরুরি কিন্তু স্থিতিশীল")}</option>
          <option value="urgent">{t("Urgent — critical disruption", "অত্যন্ত জরুরি — গুরুতর সমস্যা")}</option>
        </select>
      </label>

      {error && (
        <p className="flex items-center gap-1 text-[11px] text-destructive" role="alert">
          <XCircle className="size-3 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={loading || !subject.trim()}
          className="flex-1 rounded-fq-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          {loading ? t("Submitting…", "জমা দেওয়া হচ্ছে…") : t("Submit Ticket", "টিকিট জমা দিন")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-fq-md border border-border px-3 py-1.5 text-xs text-muted-foreground"
        >
          {t("Cancel", "বাতিল")}
        </button>
      </div>
    </form>
  );
}

// ─── In-chat Callback Form (Phase 9.4) ───────────────────────────────────────

type CallbackFormProps = {
  slug: string;
  conversationId: string | null;
  defaultPhone: string;
  onCancel: () => void;
  onSuccess: (card: CallbackCard, agentMsg: string) => void;
};

function CallbackForm({ slug, conversationId, defaultPhone, onCancel, onSuccess }: CallbackFormProps) {
  const { t } = useLang();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState(defaultPhone);
  const [window, setWindow] = useState<"morning" | "afternoon" | "evening">("morning");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await requestCallbackFn({
        data: {
          slug,
          conversationId,
          customerName: name.trim(),
          phone: phone.trim(),
          preferredWindow: window,
          note: note.trim() || null,
        },
      });
      if (res.ok) {
        onSuccess(
          {
            callbackId: res.callbackId!,
            callbackRef: res.callbackRef!,
            customerName: res.customerName!,
            window: res.window!,
            windowDescription: res.windowDescription!,
            agentMessage: res.agentMessage!,
          },
          res.agentMessage!,
        );
      } else {
        setError(res.reply || t("Failed to schedule callback.", "কলব্যাক নির্ধারণ করা যায়নি।"));
      }
    } catch {
      setError(t("Something went wrong. Please try again.", "কিছু একটা সমস্যা হয়েছে। আবার চেষ্টা করুন।"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-2 rounded-fq-md border border-border bg-card p-3 text-sm"
      aria-label={t("Request a callback", "কলব্যাক অনুরোধ করুন")}
    >
      <div className="flex items-center gap-2">
        <PhoneCall className="size-4 shrink-0 text-green-600" aria-hidden />
        <span className="font-semibold text-foreground">{t("Request a Callback", "কলব্যাক অনুরোধ করুন")}</span>
      </div>

      <label className="block text-xs text-muted-foreground">
        {t("Your name *", "আপনার নাম *")}
        <input
          required
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-0.5 w-full rounded-fq-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder={t("Full name", "পূর্ণ নাম")}
        />
      </label>

      <label className="block text-xs text-muted-foreground">
        {t("Mobile number *", "মোবাইল নম্বর *")}
        <input
          required
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="mt-0.5 w-full rounded-fq-md border border-input bg-background px-2 py-1.5 text-sm text-foreground tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="01XXXXXXXXX"
        />
        <span className="text-[10px] text-muted-foreground">{t("Bangladesh number (01XXXXXXXXX)", "বাংলাদেশের নম্বর (01XXXXXXXXX)")}</span>
      </label>

      <label className="block text-xs text-muted-foreground">
        {t("Preferred call time *", "পছন্দের কল সময় *")}
        <div className="mt-0.5 grid grid-cols-3 gap-1">
          {(["morning", "afternoon", "evening"] as const).map((w) => {
            const labels = {
              morning: { en: "Morning", bn: "সকাল", time: "10am–1pm" },
              afternoon: { en: "Afternoon", bn: "দুপুর", time: "2pm–5pm" },
              evening: { en: "Evening", bn: "সন্ধ্যা", time: "6pm–9pm" },
            };
            const info = labels[w];
            return (
              <button
                key={w}
                type="button"
                onClick={() => setWindow(w)}
                className={`rounded-fq-md border px-2 py-1.5 text-center text-[10px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
                  window === w
                    ? "border-primary bg-primary/10 font-semibold text-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                <div className="font-medium">{t(info.en, info.bn)}</div>
                <div className="mt-0.5 opacity-70">{info.time}</div>
              </button>
            );
          })}
        </div>
      </label>

      <label className="block text-xs text-muted-foreground">
        {t("Note (optional)", "নোট (ঐচ্ছিক)")}
        <input
          maxLength={200}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-0.5 w-full rounded-fq-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder={t("Brief topic for the call", "কলের বিষয় সংক্ষেপে")}
        />
      </label>

      {error && (
        <p className="flex items-center gap-1 text-[11px] text-destructive" role="alert">
          <XCircle className="size-3 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={loading || !name.trim() || !phone.trim()}
          className="flex-1 rounded-fq-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {loading ? t("Scheduling…", "নির্ধারণ হচ্ছে…") : t("Schedule Callback", "কলব্যাক নির্ধারণ করুন")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-fq-md border border-border px-3 py-1.5 text-xs text-muted-foreground"
        >
          {t("Cancel", "বাতিল")}
        </button>
      </div>
    </form>
  );
}

// ─── Main Widget ─────────────────────────────────────────────────────────────

export function SupportWidget({ slug, supportPhone }: { slug: string; supportPhone?: string }) {
  const { t, lang } = useLang();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      id: uid(),
      role: "bot",
      body: t(
        "Hello! Ask about order status, refunds, or delivery. Prices and stock are always shown on the product page.",
        "হ্যালো! অর্ডারের অবস্থা, রিফান্ড বা ডেলিভারি নিয়ে প্রশ্ন করতে পারেন। দাম ও স্টক সবসময় পণ্যের পাতা থেকে দেখানো হয়।",
      ),
    },
  ]);
  const [text, setText] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [starRating, setStarRating] = useState<number | null>(null);
  const [hoverStar, setHoverStar] = useState<number | null>(null);
  const [reviewText, setReviewText] = useState("");
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [showReviewInput, setShowReviewInput] = useState(false);
  const [activeForm, setActiveForm] = useState<ActiveForm>("none");
  const [staffActive, setStaffActive] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [msgs, open, activeForm]);

  // Rate-limit cooldown counter
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const quickAsks = useMemo(
    () => [
      t("Where is my order?", "আমার অর্ডার কোথায়?"),
      t("How do refunds work?", "রিফান্ড কীভাবে হয়?"),
      t("What is the delivery charge?", "ডেলিভারি চার্জ কত?"),
    ],
    [t],
  );

  const disabled = busy || cooldown > 0;

  async function send(raw?: string) {
    const message = (raw ?? text).trim();
    if (!message || disabled) return;
    setText("");
    setStarRating(null);
    setShowReviewInput(false);
    setReviewSubmitted(false);
    setReviewText("");
    setActiveForm("none");
    setMsgs((m) => [...m, { id: uid(), role: "customer", body: message }]);
    setBusy(true);
    try {
      const res = await askSupportFn({
        data: {
          slug,
          message,
          conversationId,
          orderNumber: orderNumber.trim() || null,
          phone: phone.trim() || null,
          locale: lang === "bn" ? "bn" : "en",
        },
      });
      if (res.conversationId) setConversationId(res.conversationId);
      if (res.staffActive || res.humanTakeover) {
        setStaffActive(true);
      }
      if (res.retryAfter) {
        const seconds = Math.max(0, Math.ceil((new Date(res.retryAfter).getTime() - Date.now()) / 1000));
        setCooldown(Math.min(seconds, 300));
      }
      if (res.cta === "callback" && !res.callbackAction) {
        setActiveForm("callback");
      }
      setMsgs((m) => [
        ...m,
        {
          id: uid(),
          role: "bot",
          body: res.reply,
          sources: res.sources ?? [],
          confidence: res.confidence,
          // Phase 9.3: ticket card from agent auto-creation
          ticketCard:
            res.ticketAction
              ? {
                  ticketId: res.ticketAction.ticketId,
                  ticketRef: `#TKT-${res.ticketAction.ticketId.slice(-8).toUpperCase()}`,
                  subject: res.ticketAction.subject,
                  priority: res.ticketAction.priority,
                  status: res.ticketAction.status,
                  firstResponseDueAt: res.ticketAction.firstResponseDueAt,
                  agentMessage: res.reply,
                }
              : null,
          // Phase 9.4: callback card from agent auto-creation
          callbackCard:
            res.callbackAction
              ? {
                  callbackId: res.callbackAction.callbackId,
                  callbackRef: `#CB-${res.callbackAction.callbackId.slice(-6).toUpperCase()}`,
                  customerName: res.callbackAction.customerName,
                  window: res.callbackAction.window,
                  windowDescription: res.callbackAction.windowDescription,
                  agentMessage: res.callbackAction.agentMessage,
                }
              : null,
          // Legacy CTA: show manual create ticket/callback buttons when needsAgent=true
          cta: res.cta !== "none" && !res.ticketAction && !res.callbackAction,
          ticketId: res.ticketId ?? null,
        },
      ]);
    } catch {
      setMsgs((m) => [
        ...m,
        {
          id: uid(),
          role: "bot",
          body: t(
            "I could not reach our systems just now. Please try again in a moment or contact customer care.",
            "এই মুহূর্তে সিস্টেমে পৌঁছানো যায়নি। একটু পরে আবার চেষ্টা করুন বা কাস্টমার কেয়ারে যোগাযোগ করুন।",
          ),
          confidence: "unsure",
          cta: true,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function handleStarClick(stars: number) {
    if (!conversationId) return;
    setStarRating(stars);
    setShowReviewInput(true);
    try {
      await rateSupportFn({ data: { conversationId, rating: stars } });
    } catch {
      /* best-effort */
    }
  }

  async function handleReviewSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!conversationId || !starRating) return;
    setReviewSubmitted(true);
    try {
      await rateSupportFn({
        data: {
          conversationId,
          rating: starRating,
          review: reviewText.trim() || undefined,
        },
      });
    } catch {
      /* best-effort */
    }
  }

  /** Called when user manually creates a ticket from the CTA */
  function handleTicketSuccess(card: TicketCard, agentMsg: string) {
    setActiveForm("none");
    setMsgs((m) => [
      ...m,
      {
        id: uid(),
        role: "bot",
        body: agentMsg,
        ticketCard: card,
      },
    ]);
  }

  /** Called when user submits a callback form */
  function handleCallbackSuccess(card: CallbackCard, agentMsg: string) {
    setActiveForm("none");
    setMsgs((m) => [
      ...m,
      {
        id: uid(),
        role: "bot",
        body: agentMsg,
        callbackCard: card,
      },
    ]);
  }

  const lastBotBody = [...msgs].reverse().find((m) => m.role === "bot")?.body ?? "";
  const lastBot = [...msgs].reverse().find((m) => m.role === "bot" && m.id !== msgs[0]?.id);

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("Support chat", "সহায়তা চ্যাট")}
        className="fixed bottom-5 right-5 z-50 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <MessageCircle className="size-6" aria-hidden />
      </button>
    );

  return (
    <div
      role="dialog"
      aria-label={t("Support chat", "সহায়তা চ্যাট")}
      className="fixed inset-0 z-50 flex flex-col bg-card sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[38rem] sm:w-[25rem] sm:rounded-fq-md sm:border sm:border-border sm:shadow-xl"
    >
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <span className="font-bangla-display text-sm font-semibold">{t("Support", "সহায়তা")}</span>
          <p className="text-[11px] text-muted-foreground">
            {t("Answers come from your records and our help articles.", "উত্তর আসে আপনার রেকর্ড ও সহায়তা নথি থেকে।")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t("Close", "বন্ধ করুন")}
          className="rounded-fq-md p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden />
        </button>
      </header>

      {staffActive ? (
        <div
          id="staff-active-indicator"
          className="flex items-center gap-2 border-b border-emerald-500/20 bg-emerald-500/10 px-4 py-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span>{t("Staff active • Connected with human specialist", "অফিসার সক্রিয় আছেন • সাপোর্ট প্রতিনিধি যুক্ত আছেন")}</span>
        </div>
      ) : null}

      {/* Context fields */}
      <div className="grid grid-cols-2 gap-2 border-b border-border px-4 py-3">
        <label className="text-xs text-muted-foreground">
          {t("Order number", "অর্ডার নম্বর")}
          <input
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            className="mt-1 w-full rounded-fq-md border border-input bg-background px-2 py-1 text-sm tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          {t("Phone (last 4 digits match)", "ফোন (শেষ ৪ ডিজিট মিলবে)")}
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            className="mt-1 w-full rounded-fq-md border border-input bg-background px-2 py-1 text-sm tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      </div>

      {/* Message feed */}
      <div aria-live="polite" className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        {msgs.map((m) => (
          <div key={m.id} className={m.role === "customer" ? "text-right" : ""}>
            <p
              className={`inline-block max-w-[85%] whitespace-pre-line rounded-fq-md px-3 py-2 text-left ${
                m.role === "customer" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
              }`}
            >
              {m.body}
            </p>

            {m.confidence ? (
              <div>
                <ConfidenceChip value={m.confidence} />
              </div>
            ) : null}

            {m.sources?.length ? (
              <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                {m.sources.map((s, i) => (
                  <li key={`${m.id}-${i}`}>
                    {s.label}
                    {s.title ? ` — ${s.title}` : ""}
                  </li>
                ))}
              </ul>
            ) : null}

            {/* Phase 9.3: Ticket success card */}
            {m.ticketCard ? <TicketSuccessCard card={m.ticketCard} /> : null}

            {/* Phase 9.4: Callback success card */}
            {m.callbackCard ? <CallbackSuccessCard card={m.callbackCard} /> : null}

            {/* Legacy CTA with manual Ticket + Callback buttons */}
            {m.cta && !m.ticketCard && !m.callbackCard ? (
              <div className="mt-2 space-y-1.5">
                {m.ticketId ? (
                  <p className="text-[11px] text-muted-foreground">
                    {t("A support ticket was opened for you.", "আপনার জন্য একটি সাপোর্ট টিকিট খোলা হয়েছে।")}{" "}
                    <code className="font-mono">#{m.ticketId.slice(0, 8)}</code>
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-1.5">
                  {!m.ticketId && (
                    <button
                      type="button"
                      onClick={() => setActiveForm("ticket")}
                      className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Ticket className="size-3" aria-hidden />
                      {t("Create Ticket", "টিকিট তৈরি করুন")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveForm("callback")}
                    className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/5 px-2.5 py-1 text-[11px] font-medium text-green-700 outline-none hover:bg-green-500/10 focus-visible:ring-2 focus-visible:ring-ring dark:text-green-400"
                  >
                    <PhoneCall className="size-3" aria-hidden />
                    {t("Request Callback", "কলব্যাক অনুরোধ করুন")}
                  </button>
                  <a
                    className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                    href={supportPhone ? `tel:${supportPhone}` : `/store/${slug}`}
                  >
                    {t("Talk to Care", "কেয়ারে কথা বলুন")}
                  </a>
                </div>
              </div>
            ) : null}
          </div>
        ))}

        {busy ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {staffActive ? (
              <>
                <span className="inline-block size-1.5 rounded-full bg-emerald-500 animate-ping" />
                {t("Human specialist is typing...", "সাপোর্ট প্রতিনিধি লিখছেন...")}
              </>
            ) : (
              t("Preparing reply…", "উত্তর তৈরি হচ্ছে…")
            )}
          </p>
        ) : null}

        {/* Phase 9.5: 5-Star CSAT Rating & Review Component */}
        {!busy && lastBot && conversationId ? (
          <div className="rounded-fq-md border border-border bg-muted/30 p-2.5 text-xs text-muted-foreground">
            <div className="flex items-center justify-between">
              <span className="font-medium text-foreground text-[11px]">
                {t("Rate this response:", "এই উত্তরটি মূল্যায়ন করুন:")}
              </span>
              {starRating ? (
                <span className="text-[10px] font-medium text-primary">
                  {STAR_LABELS[starRating - 1]?.[lang === "bn" ? "bn" : "en"]}
                </span>
              ) : hoverStar ? (
                <span className="text-[10px] text-muted-foreground">
                  {STAR_LABELS[hoverStar - 1]?.[lang === "bn" ? "bn" : "en"]}
                </span>
              ) : null}
            </div>

            <div className="mt-1.5 flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void handleStarClick(s)}
                  onMouseEnter={() => setHoverStar(s)}
                  onMouseLeave={() => setHoverStar(null)}
                  aria-label={t(`Rate ${s} star${s > 1 ? "s" : ""}`, `${s} স্টার দিন`)}
                  className="rounded p-0.5 outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Star
                    className={`size-4 transition-colors ${
                      (hoverStar ?? starRating ?? 0) >= s
                        ? "fill-amber-400 text-amber-400"
                        : "text-muted-foreground/40 hover:text-amber-400"
                    }`}
                    aria-hidden
                  />
                </button>
              ))}
              {starRating && (
                <span className="ml-2 text-[10px] font-medium text-green-600 dark:text-green-400">
                  {t("Thanks for rating!", "মূল্যায়নের জন্য ধন্যবাদ!")}
                </span>
              )}
            </div>

            {/* Optional qualitative review input */}
            {showReviewInput && !reviewSubmitted && (
              <form onSubmit={handleReviewSubmit} className="mt-2 space-y-1.5 border-t border-border/50 pt-2">
                <input
                  maxLength={300}
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  placeholder={
                    starRating && starRating <= 3
                      ? t("What could we improve?", "আমরা কীভাবে আরও উন্নত করতে পারি?")
                      : t("What did you like? (optional)", "আপনার কেমন লেগেছে? (ঐচ্ছিক)")
                  }
                  className="w-full rounded-fq-md border border-input bg-background px-2 py-1 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowReviewInput(false)}
                    className="rounded px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
                  >
                    {t("Skip", "বাদ দিন")}
                  </button>
                  <button
                    type="submit"
                    className="rounded bg-primary px-2.5 py-0.5 text-[10px] font-semibold text-primary-foreground hover:opacity-90"
                  >
                    {t("Send Feedback", "মতামত পাঠান")}
                  </button>
                </div>
              </form>
            )}

            {reviewSubmitted && reviewText.trim() && (
              <p className="mt-1.5 text-[10px] text-foreground/80 italic">
                "{reviewText.trim()}" — {t("Review received.", "মতামত জমা হয়েছে।")}
              </p>
            )}
          </div>
        ) : null}

        {msgs.length <= 1 ? (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {quickAsks.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => void send(q)}
                className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              >
                {q}
              </button>
            ))}
          </div>
        ) : null}

        {/* Phase 9.3: Inline Ticket Form */}
        {activeForm === "ticket" && (
          <TicketForm
            slug={slug}
            conversationId={conversationId}
            phone={phone}
            orderNumber={orderNumber}
            lastBotMessage={lastBotBody}
            onCancel={() => setActiveForm("none")}
            onSuccess={handleTicketSuccess}
          />
        )}

        {/* Phase 9.4: Inline Callback Form */}
        {activeForm === "callback" && (
          <CallbackForm
            slug={slug}
            conversationId={conversationId}
            defaultPhone={phone}
            onCancel={() => setActiveForm("none")}
            onSuccess={handleCallbackSuccess}
          />
        )}

        <div ref={endRef} />
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="border-t border-border p-3"
      >
        {cooldown > 0 ? (
          <p className="mb-2 text-[11px] text-destructive" role="status">
            {t(
              `Too many messages. Try again in ${cooldown}s.`,
              `অনেক বেশি বার্তা। ${cooldown} সেকেন্ড পরে চেষ্টা করুন।`,
            )}
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <input
            value={text}
            maxLength={1000}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("Type your question", "আপনার প্রশ্ন লিখুন")}
            aria-label={t("Your question", "আপনার প্রশ্ন")}
            className="min-w-0 flex-1 rounded-fq-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="submit"
            disabled={disabled}
            aria-label={t("Send", "পাঠান")}
            className="grid size-9 shrink-0 place-items-center rounded-fq-md bg-primary text-primary-foreground disabled:opacity-50"
          >
            <Send className="size-4" aria-hidden />
          </button>
        </div>
      </form>
    </div>
  );
}
