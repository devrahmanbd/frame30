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
  Sparkles,
  RotateCcw,
  User,
  Mail,
} from "lucide-react";
import {
  askSupportFn,
  rateSupportFn,
  createSupportTicketWidgetFn,
  requestCallbackFn,
  checkOperatorPresenceFn,
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
  const map: Record<
    Confidence,
    { label: string; className: string; Icon: typeof ShieldCheck }
  > = {
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
    <span
      className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${className}`}
    >
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
  const dueLabel = due.toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });

  return (
    <div className="mt-2 overflow-hidden rounded-fq-md border border-primary/20 bg-primary/5">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="grid size-6 place-items-center rounded-full bg-primary text-primary-foreground">
            <Ticket className="size-3.5" aria-hidden />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-primary">
              {card.ticketRef}
            </p>
            <p className="text-[10px] text-muted-foreground capitalize">
              {card.priority} • {card.status}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((s) => !s)}
          className="rounded p-0.5 text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={
            expanded
              ? t("Collapse", "সংকুচিত করুন")
              : t("Expand", "প্রসারিত করুন")
          }
        >
          {expanded ? (
            <ChevronUp className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )}
        </button>
      </div>
      {expanded && (
        <div className="border-t border-primary/10 px-3 py-2 text-[11px] text-muted-foreground">
          <p className="font-medium text-foreground">{card.subject}</p>
          <p className="mt-1 flex items-center gap-1">
            <Clock className="size-3" />
            {t("First response by:", "প্রথম সাড়া দেওয়ার সময়সীমা:")}{" "}
            <span className="font-medium text-foreground">{dueLabel}</span>
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
          <p className="text-[11px] font-semibold text-green-700 dark:text-green-400">
            {card.callbackRef}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {t("Callback", "কলব্যাক")} · {windowLabel} ·{" "}
            {card.windowDescription}
          </p>
        </div>
        <CheckCircle
          className="ml-auto size-4 shrink-0 text-green-600"
          aria-hidden
        />
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

function TicketForm({
  slug,
  conversationId,
  phone,
  orderNumber,
  lastBotMessage,
  onCancel,
  onSuccess,
}: TicketFormProps) {
  const { t } = useLang();
  const [subject, setSubject] = useState(lastBotMessage.slice(0, 120) || "");
  const [details, setDetails] = useState("");
  const [priority, setPriority] = useState<
    "low" | "normal" | "high" | "urgent"
  >("normal");
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
        setError(
          res.reply || t("Failed to create ticket.", "টিকিট তৈরি করা যায়নি।"),
        );
      }
    } catch {
      setError(
        t(
          "Something went wrong. Please try again.",
          "কিছু একটা সমস্যা হয়েছে। আবার চেষ্টা করুন।",
        ),
      );
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
        <span className="font-semibold text-foreground">
          {t("Create Support Ticket", "সাপোর্ট টিকিট তৈরি করুন")}
        </span>
      </div>

      <label className="block text-xs text-muted-foreground">
        {t("Subject *", "বিষয় *")}
        <input
          required
          maxLength={180}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="mt-0.5 w-full rounded-fq-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder={t(
            "Briefly describe your issue",
            "আপনার সমস্যা সংক্ষেপে লিখুন",
          )}
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
          placeholder={t(
            "More context helps us resolve faster",
            "বিস্তারিত বিবরণ দিলে দ্রুত সমাধান হবে",
          )}
        />
      </label>

      <label className="block text-xs text-muted-foreground">
        {t("Priority", "অগ্রাধিকার")}
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as typeof priority)}
          className="mt-0.5 w-full rounded-fq-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="low">
            {t("Low — general inquiry", "কম — সাধারণ জিজ্ঞাসা")}
          </option>
          <option value="normal">
            {t("Normal — standard issue", "স্বাভাবিক — সাধারণ সমস্যা")}
          </option>
          <option value="high">
            {t("High — urgent but stable", "বেশি — জরুরি কিন্তু স্থিতিশীল")}
          </option>
          <option value="urgent">
            {t("Urgent — critical disruption", "অত্যন্ত জরুরি — গুরুতর সমস্যা")}
          </option>
        </select>
      </label>

      {error && (
        <p
          className="flex items-center gap-1 text-[11px] text-destructive"
          role="alert"
        >
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
          {loading
            ? t("Submitting…", "জমা দেওয়া হচ্ছে…")
            : t("Submit Ticket", "টিকিট জমা দিন")}
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
  mode?: "platform" | "dashboard" | "store";
  onCancel: () => void;
  onSuccess: (card: CallbackCard, agentMsg: string) => void;
};

function CallbackForm({
  slug,
  conversationId,
  defaultPhone,
  mode = "store",
  onCancel,
  onSuccess,
}: CallbackFormProps) {
  const { t } = useLang();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState(defaultPhone);
  const [window, setWindow] = useState<"morning" | "afternoon" | "evening">(
    "morning",
  );
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPlatform = mode === "platform";

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
        setError(
          res.reply ||
            t("Failed to schedule callback.", "কলব্যাক নির্ধারণ করা যায়নি।"),
        );
      }
    } catch {
      setError(
        t(
          "Something went wrong. Please try again.",
          "কিছু একটা সমস্যা হয়েছে। আবার চেষ্টা করুন।",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-2 rounded-fq-md border border-border bg-card p-3 text-sm shadow-sm"
      aria-label={
        isPlatform
          ? t("Book a consultation call", "পরামর্শ কলের অনুরোধ করুন")
          : t("Request a callback", "কলব্যাক অনুরোধ করুন")
      }
    >
      <div className="flex items-center gap-2">
        <PhoneCall className="size-4 shrink-0 text-emerald-600" aria-hidden />
        <span className="font-semibold text-foreground">
          {isPlatform
            ? t("Book Demo / Talk to Sales", "সেলস পরামর্শ / ডেমো অনুরোধ")
            : t("Request a Callback", "কলব্যাক অনুরোধ করুন")}
        </span>
      </div>
      {isPlatform && (
        <p className="text-[11px] text-muted-foreground">
          {t(
            "Leave your contact details and our ecommerce consultant will reach out.",
            "আপনার তথ্য দিন, আমাদের প্রতিনিধি পছন্দের সময়ে আপনার সাথে যোগাযোগ করবেন।",
          )}
        </p>
      )}

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
        <span className="text-[10px] text-muted-foreground">
          {t(
            "Bangladesh number (01XXXXXXXXX)",
            "বাংলাদেশের নম্বর (01XXXXXXXXX)",
          )}
        </span>
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
        {isPlatform
          ? t(
              "Store / Business details (optional)",
              "স্টোর বা ব্যবসার বিবরণ (ঐচ্ছিক)",
            )
          : t("Note (optional)", "নোট (ঐচ্ছিক)")}
        <input
          maxLength={200}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-0.5 w-full rounded-fq-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder={
            isPlatform
              ? t(
                  "What kind of store or brand are you launching?",
                  "কী ধরনের স্টোর বা ব্র্যান্ড তৈরি করতে চান?",
                )
              : t("Brief topic for the call", "কলের বিষয় সংক্ষেপে")
          }
        />
      </label>

      {error && (
        <p
          className="flex items-center gap-1 text-[11px] text-destructive"
          role="alert"
        >
          <XCircle className="size-3 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={loading || !name.trim() || !phone.trim()}
          className="flex-1 rounded-fq-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-95 disabled:opacity-50"
        >
          {loading
            ? t("Submitting…", "জমা হচ্ছে…")
            : isPlatform
              ? t("Request Consultation", "পরামর্শ অনুরোধ পাঠান")
              : t("Schedule Callback", "কলব্যাক নির্ধারণ করুন")}
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

// ─── Pre-Chat Onboarding Form ────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

// ─── Chat session persistence (sessionStorage + localStorage, shop+mode scoped)

export type SupportChatSnapshot = {
  msgs: Msg[];
  conversationId: string | null;
  customerName: string;
  customerEmail: string;
  open: boolean;
  phone: string;
  orderNumber: string;
  staffActive: boolean;
};

function supportChatKey(slug: string, mode: string): string {
  return `fq-support-chat:${slug}:${mode}`;
}

function storageAreas(): Array<{
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}> {
  const areas: Array<{
    getItem(k: string): string | null;
    setItem(k: string, v: string): void;
    removeItem(k: string): void;
  }> = [];
  for (const name of ["sessionStorage", "localStorage"] as const) {
    const store = (globalThis as Record<string, unknown>)[name] as
      | {
          getItem(k: string): string | null;
          setItem(k: string, v: string): void;
          removeItem(k: string): void;
        }
      | undefined;
    if (store) areas.push(store);
  }
  return areas;
}

export function loadSupportChatSession(
  slug: string,
  mode: string,
): SupportChatSnapshot | null {
  for (const store of storageAreas()) {
    try {
      const raw = store.getItem(supportChatKey(slug, mode));
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Partial<SupportChatSnapshot>;
      if (!Array.isArray(parsed.msgs)) continue;
      return {
        msgs: parsed.msgs,
        conversationId:
          typeof parsed.conversationId === "string"
            ? parsed.conversationId
            : null,
        customerName:
          typeof parsed.customerName === "string" ? parsed.customerName : "",
        customerEmail:
          typeof parsed.customerEmail === "string" ? parsed.customerEmail : "",
        open: parsed.open === true,
        phone: typeof parsed.phone === "string" ? parsed.phone : "",
        orderNumber:
          typeof parsed.orderNumber === "string" ? parsed.orderNumber : "",
        staffActive: parsed.staffActive === true,
      };
    } catch {
      continue;
    }
  }
  return null;
}

export function saveSupportChatSession(
  snapshot: { slug: string; mode: string } & SupportChatSnapshot,
): void {
  const { slug, mode, ...rest } = snapshot;
  let body = "";
  try {
    body = JSON.stringify(rest);
  } catch {
    return;
  }
  for (const store of storageAreas()) {
    try {
      store.setItem(supportChatKey(slug, mode), body);
    } catch {
      /* best effort */
    }
  }
}

export function clearSupportChatSession(slug: string, mode: string): void {
  for (const store of storageAreas()) {
    try {
      store.removeItem(supportChatKey(slug, mode));
    } catch {
      /* best effort */
    }
  }
}

function PreChatForm({
  initialName = "",
  initialEmail = "",
  initialPhone = "",
  initialOrderNumber = "",
  isPlatform = false,
  isEditing = false,
  onCancel,
  onSubmit,
}: {
  initialName?: string;
  initialEmail?: string;
  initialPhone?: string;
  initialOrderNumber?: string;
  isPlatform?: boolean;
  isEditing?: boolean;
  onCancel?: () => void;
  onSubmit: (data: {
    name: string;
    email: string;
    phone: string;
    orderNumber: string;
  }) => void;
}) {
  const { t } = useLang();
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState(initialPhone);
  const [orderNumber, setOrderNumber] = useState(initialOrderNumber);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (cleanName.length < 2) {
      setError(
        t(
          "Please enter your full name (at least 2 characters).",
          "অনুগ্রহ করে আপনার পূর্ণ নাম লিখুন (কমপক্ষে ২টি অক্ষর)।",
        ),
      );
      return;
    }

    if (!EMAIL_RE.test(cleanEmail)) {
      setError(
        t(
          "Please enter a valid email address.",
          "অনুগ্রহ করে একটি সঠিক ইমেইল এড্রেস লিখুন।",
        ),
      );
      return;
    }

    setError(null);
    onSubmit({
      name: cleanName,
      email: cleanEmail,
      phone: phone.trim(),
      orderNumber: orderNumber.trim(),
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="m-3 space-y-3 rounded-fq-md border border-border bg-card p-4 shadow-sm"
    >
      <div className="flex items-start gap-2.5">
        <div className="grid size-8 place-items-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="size-4" aria-hidden />
        </div>
        <div>
          <h3 className="text-xs font-semibold text-foreground">
            {isEditing
              ? t("Update Your Information", "আপনার তথ্য আপডেট করুন")
              : t("Welcome to Support", "সাপোর্টে স্বাগতম")}
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {t(
              "Please enter your name and email. We will email you a copy of our responses.",
              "চ্যাট শুরু করতে আপনার নাম ও ইমেইল দিন। আমাদের উত্তরের একটি কপি আপনার ইমেইলে যাবে।",
            )}
          </p>
        </div>
      </div>

      <label className="block text-xs text-muted-foreground">
        {t("Full Name *", "পূর্ণ নাম *")}
        <div className="relative mt-1">
          <input
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-fq-md border border-input bg-background pl-8 pr-3 py-1.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder={t("e.g. Ayesha Rahman", "যেমন: আয়েশা রহমান")}
          />
          <User
            className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground"
            aria-hidden
          />
        </div>
      </label>

      <label className="block text-xs text-muted-foreground">
        {t("Email Address *", "ইমেইল এড্রেস *")}
        <div className="relative mt-1">
          <input
            required
            type="email"
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-fq-md border border-input bg-background pl-8 pr-3 py-1.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="name@example.com"
          />
          <Mail
            className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground"
            aria-hidden
          />
        </div>
      </label>

      {!isPlatform ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs text-muted-foreground">
            {t("Mobile (optional)", "মোবাইল (ঐচ্ছিক)")}
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full rounded-fq-md border border-input bg-background px-2.5 py-1.5 text-sm text-foreground tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="01XXXXXXXXX"
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            {t("Order # (optional)", "অর্ডার # (ঐচ্ছিক)")}
            <input
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              className="mt-1 w-full rounded-fq-md border border-input bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="#ORD-..."
            />
          </label>
        </div>
      ) : null}

      {error ? (
        <p
          className="flex items-center gap-1 text-[11px] text-destructive"
          role="alert"
        >
          <XCircle className="size-3 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          className="flex-1 rounded-fq-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
        >
          {isEditing
            ? t("Save & Continue", "সংরক্ষণ করুন ও এগিয়ে যান")
            : t("Start Chat", "চ্যাট শুরু করুন")}
        </button>
        {isEditing && onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-fq-md border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted"
          >
            {t("Cancel", "বাতিল")}
          </button>
        ) : null}
      </div>
    </form>
  );
}

// ─── Main Widget ─────────────────────────────────────────────────────────────

export function SupportWidget({
  slug,
  supportPhone,
  mode = "store",
}: {
  slug: string;
  supportPhone?: string;
  mode?: "platform" | "dashboard" | "store";
}) {
  const { t, lang } = useLang();
  const effectiveMode =
    slug === "framique" || slug === "platform" ? "platform" : mode;

  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    let initialGreeting = t(
      "Hello! Ask about order status, refunds, or delivery. Prices and stock are always shown on the product page.",
      "হ্যালো! অর্ডারের অবস্থা, রিফান্ড বা ডেলিভারি নিয়ে প্রশ্ন করতে পারেন। দাম ও স্টক সবসময় পণ্যের পাতা থেকে দেখানো হয়।",
    );
    if (effectiveMode === "platform") {
      initialGreeting = t(
        "Hello! 👋 Welcome to Framique. Ask me anything about creating an online store, pricing plans, bKash & SteadFast integration, or leave your details to talk with our team.",
        "হ্যালো! 👋 ফ্রেমিক-এ স্বাগতম। অনলাইন স্টোর শুরু করা, প্রাইসিং, বিকাশ পেমেন্ট ও স্টিডফাস্ট কুরিয়ার সংযোগ নিয়ে প্রশ্ন করুন অথবা সেলস টিমের সাথে কথা বলতে তথ্য দিন।",
      );
    } else if (effectiveMode === "dashboard") {
      initialGreeting = t(
        "Hello! I'm your Framique Merchant Copilot. How can I help you set up products, configure bKash, connect SteadFast courier, or design your storefront today?",
        "হ্যালো! আমি আপনার ফ্রেমিক স্টোর কোপাইলট। প্রোডাক্ট যুক্ত করা, বিকাশ পেমেন্ট, স্টিডফাস্ট কুরিয়ার বা স্টোর ডিজাইন নিয়ে কীভাবে সাহায্য করতে পারি?",
      );
    }
    return [{ id: uid(), role: "bot", body: initialGreeting }];
  });
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [isEditingProfile, setIsEditingProfile] = useState(false);
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
  const [adminOnline, setAdminOnline] = useState<boolean | null>(null);
  const [showCloseFeedbackModal, setShowCloseFeedbackModal] = useState(false);
  const [modalRating, setModalRating] = useState<number>(5);
  const [modalHoverRating, setModalHoverRating] = useState<number | null>(null);
  const [modalResolved, setModalResolved] = useState<boolean>(true);
  const [modalReview, setModalReview] = useState<string>("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [isRestored, setIsRestored] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const isIdentified = useMemo(() => {
    return (
      customerName.trim().length >= 2 &&
      EMAIL_RE.test(customerEmail.trim().toLowerCase())
    );
  }, [customerName, customerEmail]);

  // Restore chat session from sessionStorage / localStorage on client mount
  useEffect(() => {
    try {
      const saved = loadSupportChatSession(slug, effectiveMode);
      if (saved) {
        if (saved.msgs && saved.msgs.length > 0) setMsgs(saved.msgs);
        if (saved.conversationId) setConversationId(saved.conversationId);
        if (typeof saved.open === "boolean") setOpen(saved.open);
        if (saved.customerName) setCustomerName(saved.customerName);
        if (saved.customerEmail) setCustomerEmail(saved.customerEmail);
        if (saved.phone) setPhone(saved.phone);
        if (saved.orderNumber) setOrderNumber(saved.orderNumber);
        if (saved.staffActive) setStaffActive(saved.staffActive);
      }
    } catch {
      /* best effort */
    } finally {
      setIsRestored(true);
    }
  }, [slug, effectiveMode]);

  // Check live operator presence when widget is opened
  useEffect(() => {
    if (open) {
      checkOperatorPresenceFn({ data: { slug, conversationId } })
        .then((res) => {
          setAdminOnline(res.isOnline);
        })
        .catch(() => null);
    }
  }, [open, slug, conversationId]);

  // Persist session to sessionStorage + localStorage on any conversational change
  useEffect(() => {
    if (!isRestored) return;

    const hasInteracted =
      msgs.some((m) => m.role === "customer") ||
      msgs.length > 1 ||
      Boolean(conversationId) ||
      Boolean(customerName.trim()) ||
      Boolean(customerEmail.trim()) ||
      Boolean(phone.trim()) ||
      Boolean(orderNumber.trim());

    if (!hasInteracted) {
      clearSupportChatSession(slug, effectiveMode);
      return;
    }

    saveSupportChatSession({
      slug,
      mode: effectiveMode,
      conversationId,
      customerName,
      customerEmail,
      open,
      phone,
      orderNumber,
      staffActive,
      msgs,
    });
  }, [
    isRestored,
    msgs,
    conversationId,
    customerName,
    customerEmail,
    open,
    phone,
    orderNumber,
    staffActive,
    slug,
    effectiveMode,
  ]);

  function handleStartNewChat() {
    clearSupportChatSession(slug, effectiveMode);
    setConversationId(null);
    setStarRating(null);
    setReviewSubmitted(false);
    setShowReviewInput(false);
    setActiveForm("none");
    setStaffActive(false);
    setMsgs([{ id: uid(), role: "bot", body: getInitialGreeting() }]);
  }

  function handlePreChatSubmit(data: {
    name: string;
    email: string;
    phone: string;
    orderNumber: string;
  }) {
    setCustomerName(data.name);
    setCustomerEmail(data.email);
    if (data.phone) setPhone(data.phone);
    if (data.orderNumber) setOrderNumber(data.orderNumber);
    setIsEditingProfile(false);

    // If customer hasn't sent messages yet, provide personalized welcome
    if (!msgs.some((m) => m.role === "customer")) {
      const welcome =
        effectiveMode === "platform"
          ? t(
              `Hello ${data.name}! 👋 Welcome to Framique. Ask me anything about pricing, online store setup, or bKash & couriers.`,
              `হ্যালো ${data.name}! 👋 ফ্রেমিক-এ স্বাগতম। প্রাইসিং, অনলাইন স্টোর বা বিকাশ ও কুরিয়ার সংযোগ নিয়ে প্রশ্ন করুন।`,
            )
          : effectiveMode === "dashboard"
            ? t(
                `Hello ${data.name}! 👋 I'm your Framique Merchant Copilot. How can I help you with your store setup today?`,
                `হ্যালো ${data.name}! 👋 আমি আপনার ফ্রেমিক কোপাইলট। স্টোর সেটআপ নিয়ে আজ কীভাবে সাহায্য করতে পারি?`,
              )
            : t(
                `Hello ${data.name}! 👋 Ask about order status, refunds, or delivery. Our answers will also be sent to ${data.email}.`,
                `হ্যালো ${data.name}! 👋 অর্ডার, রিফান্ড বা ডেলিভারি নিয়ে যেকোনো প্রশ্ন করতে পারেন। উত্তর আপনার ইমেইলেও (${data.email}) পাঠানো হবে।`,
              );
      setMsgs([{ id: uid(), role: "bot", body: welcome }]);
    }
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [msgs, open, activeForm]);

  // Rate-limit cooldown counter
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const quickAsks = useMemo(() => {
    if (effectiveMode === "platform") {
      return [
        t("How do I start a store?", "অনলাইন স্টোর কীভাবে শুরু করব?"),
        t("What are the pricing plans?", "প্রাইসিং ও ফ্রি ট্রায়াল কি কি?"),
        t("How do bKash & couriers work?", "বিকাশ ও কুরিয়ার কীভাবে কাজ করে?"),
        t("Book a demo / Talk to sales", "সেলস টিমের সাথে কথা বলুন"),
      ];
    }
    if (effectiveMode === "dashboard") {
      return [
        t("How to configure SteadFast?", "স্টিডফাস্ট কীভাবে যুক্ত করব?"),
        t("How to set up bKash?", "বিকাশ কীভাবে চালু করব?"),
        t("How to connect custom domain?", "কাস্টম ডোমেন সংযোগ কীভাবে করব?"),
        t("Open a support ticket", "সাপোর্ট টিকিট তৈরি করুন"),
      ];
    }
    return [
      t("Where is my order?", "আমার অর্ডার কোথায়?"),
      t("How do refunds work?", "রিফান্ড কীভাবে হয়?"),
      t("What is the delivery charge?", "ডেলিভারি চার্জ কত?"),
    ];
  }, [t, effectiveMode]);

  function handleQuickAsk(q: string) {
    if (
      q.includes("Book a demo") ||
      q.includes("Talk to sales") ||
      q.includes("সেলস টিমের") ||
      q.includes("ডেমো")
    ) {
      setActiveForm("callback");
      return;
    }
    if (
      q.includes("Open a support ticket") ||
      q.includes("সাপোর্ট টিকিট তৈরি")
    ) {
      setActiveForm("ticket");
      return;
    }
    void send(q);
  }

  const disabled = busy || cooldown > 0;

  async function send(raw?: string) {
    const message = (raw ?? text).trim();
    if (!message || disabled) return;
    if (!isIdentified) {
      setIsEditingProfile(true);
      return;
    }
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
          customerName: customerName.trim() || undefined,
          customerEmail: customerEmail.trim() || undefined,
          conversationId,
          orderNumber: orderNumber.trim() || null,
          phone: phone.trim() || null,
          locale: lang === "bn" ? "bn" : "en",
        },
      });
      if (res.conversationId) setConversationId(res.conversationId);
      if (res.adminOnline !== undefined) setAdminOnline(res.adminOnline);
      if (res.staffActive || res.humanTakeover) {
        setStaffActive(true);
      }
      if (res.retryAfter) {
        const seconds = Math.max(
          0,
          Math.ceil((new Date(res.retryAfter).getTime() - Date.now()) / 1000),
        );
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
          ticketCard: res.ticketAction
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
          callbackCard: res.callbackAction
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

  function handleCloseClick() {
    // Intercept closing: ask for feedback if customer chatted and has not rated yet
    if (conversationId && msgs.length > 1 && !starRating) {
      setShowCloseFeedbackModal(true);
    } else {
      setOpen(false);
    }
  }

  async function handleSubmitCloseFeedback() {
    if (conversationId) {
      setSubmittingFeedback(true);
      try {
        await rateSupportFn({
          data: {
            conversationId,
            rating: modalRating,
            review: modalReview.trim() || undefined,
            isResolved: modalResolved,
          },
        });
        setStarRating(modalRating);
      } catch {
        /* best effort */
      } finally {
        setSubmittingFeedback(false);
      }
    }
    setShowCloseFeedbackModal(false);
    setOpen(false);
  }

  function handleSkipCloseFeedback() {
    setShowCloseFeedbackModal(false);
    setOpen(false);
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

  const lastBotBody =
    [...msgs].reverse().find((m) => m.role === "bot")?.body ?? "";
  const lastBot = [...msgs]
    .reverse()
    .find((m) => m.role === "bot" && m.id !== msgs[0]?.id);

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
          <span className="font-bangla-display text-sm font-semibold">
            {effectiveMode === "platform"
              ? t("Framique Assistant", "ফ্রেমিক অ্যাসিস্ট্যান্ট")
              : effectiveMode === "dashboard"
                ? t("Framique Store Copilot", "ফ্রেমিক স্টোর কোপাইলট")
                : t("Support", "সহায়তা")}
          </span>
          <p className="text-[11px] text-muted-foreground">
            {effectiveMode === "platform"
              ? t(
                  "Instant answers, pricing & sales consultation",
                  "তাৎক্ষণিক উত্তর, প্রাইসিং ও সেলস পরামর্শ",
                )
              : effectiveMode === "dashboard"
                ? t(
                    "Merchant guidance, configuration & support",
                    "মার্চেন্ট সহায়তা ও টেকনিক্যাল গাইড",
                  )
                : t(
                    "Answers come from your records and our help articles.",
                    "উত্তর আসে আপনার রেকর্ড ও সহায়তা নথি থেকে।",
                  )}
          </p>
        </div>
        <button
          type="button"
          onClick={handleCloseClick}
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
          <span>
            {t(
              "Staff active • Connected with human specialist",
              "অফিসার সক্রিয় আছেন • সাপোর্ট প্রতিনিধি যুক্ত আছেন",
            )}
          </span>
        </div>
      ) : adminOnline ? (
        <div
          id="admin-online-indicator"
          className="flex items-center gap-2 border-b border-emerald-500/20 bg-emerald-500/10 px-4 py-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span>
            {t(
              "Support specialist online • Live transfer ready",
              "সাপোর্ট স্পেশালিস্ট অনলাইন আছেন • লাইভ চ্যাট উপলব্ধ",
            )}
          </span>
        </div>
      ) : null}

      {/* Customer Identity Bar (when identified) */}
      {isIdentified && !isEditingProfile ? (
        <div className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-4 py-1.5 text-[11px]">
          <div className="flex items-center gap-1.5 truncate text-muted-foreground">
            <User className="size-3 text-primary shrink-0" aria-hidden />
            <span className="font-semibold text-foreground truncate">
              {customerName}
            </span>
            <span className="opacity-70 truncate">&lt;{customerEmail}&gt;</span>
          </div>
          <button
            type="button"
            onClick={() => setIsEditingProfile(true)}
            className="shrink-0 text-[10px] font-medium text-primary hover:underline"
          >
            {t("Edit", "পরিবর্তন")}
          </button>
        </div>
      ) : null}

      {!isIdentified || isEditingProfile ? (
        <div className="flex-1 overflow-y-auto">
          <PreChatForm
            initialName={customerName}
            initialEmail={customerEmail}
            initialPhone={phone}
            initialOrderNumber={orderNumber}
            isPlatform={effectiveMode === "platform"}
            isEditing={isEditingProfile}
            onCancel={
              isEditingProfile ? () => setIsEditingProfile(false) : undefined
            }
            onSubmit={handlePreChatSubmit}
          />
        </div>
      ) : (
        <>
          {/* Context bar / fields */}
          {effectiveMode === "platform" ? (
            <div className="flex items-center justify-between border-b border-border/70 bg-muted/40 px-4 py-2 text-xs">
              <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
                <Sparkles className="size-3.5 text-primary" aria-hidden />
                {t(
                  "Want a demo or live consultation?",
                  "ডেমো দেখতে বা কথা বলতে চান?",
                )}
              </span>
              <button
                type="button"
                onClick={() =>
                  setActiveForm((f) => (f === "callback" ? "none" : "callback"))
                }
                className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
              >
                <PhoneCall className="size-3" aria-hidden />
                {t("Book Demo / Call", "ডেমো / কল নির্ধারণ")}
              </button>
            </div>
          ) : effectiveMode === "dashboard" ? (
            <div className="flex items-center justify-between border-b border-border/70 bg-muted/40 px-4 py-2 text-xs">
              <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
                <LifeBuoy className="size-3.5 text-primary" aria-hidden />
                {t("Merchant Copilot Active", "মার্চেন্ট কোপাইলট সক্রিয়")}
              </span>
              <button
                type="button"
                onClick={() =>
                  setActiveForm((f) => (f === "ticket" ? "none" : "ticket"))
                }
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                <Ticket className="size-3" aria-hidden />
                {t("Open Ticket", "টিকিট খুলুন")}
              </button>
            </div>
          ) : (
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
          )}

          {/* Message feed */}
          <div
            aria-live="polite"
            className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm"
          >
            {msgs.map((m) => (
              <div
                key={m.id}
                className={m.role === "customer" ? "text-right" : ""}
              >
                <p
                  className={`inline-block max-w-[85%] whitespace-pre-line rounded-fq-md px-3 py-2 text-left ${
                    m.role === "customer"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
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
                {m.ticketCard ? (
                  <TicketSuccessCard card={m.ticketCard} />
                ) : null}

                {/* Phase 9.4: Callback success card */}
                {m.callbackCard ? (
                  <CallbackSuccessCard card={m.callbackCard} />
                ) : null}

                {/* Legacy CTA with manual Ticket + Callback buttons */}
                {m.cta && !m.ticketCard && !m.callbackCard ? (
                  <div className="mt-2 space-y-1.5">
                    {m.ticketId ? (
                      <p className="text-[11px] text-muted-foreground">
                        {t(
                          "A support ticket was opened for you.",
                          "আপনার জন্য একটি সাপোর্ট টিকিট খোলা হয়েছে।",
                        )}{" "}
                        <code className="font-mono">
                          #{m.ticketId.slice(0, 8)}
                        </code>
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
                        href={
                          supportPhone
                            ? `tel:${supportPhone}`
                            : `/store/${slug}`
                        }
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
                    {t(
                      "Human specialist is typing...",
                      "সাপোর্ট প্রতিনিধি লিখছেন...",
                    )}
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
                      {
                        STAR_LABELS[starRating - 1]?.[
                          lang === "bn" ? "bn" : "en"
                        ]
                      }
                    </span>
                  ) : hoverStar ? (
                    <span className="text-[10px] text-muted-foreground">
                      {
                        STAR_LABELS[hoverStar - 1]?.[
                          lang === "bn" ? "bn" : "en"
                        ]
                      }
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
                      aria-label={t(
                        `Rate ${s} star${s > 1 ? "s" : ""}`,
                        `${s} স্টার দিন`,
                      )}
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
                  <form
                    onSubmit={handleReviewSubmit}
                    className="mt-2 space-y-1.5 border-t border-border/50 pt-2"
                  >
                    <input
                      maxLength={300}
                      value={reviewText}
                      onChange={(e) => setReviewText(e.target.value)}
                      placeholder={
                        starRating && starRating <= 3
                          ? t(
                              "What could we improve?",
                              "আমরা কীভাবে আরও উন্নত করতে পারি?",
                            )
                          : t(
                              "What did you like? (optional)",
                              "আপনার কেমন লেগেছে? (ঐচ্ছিক)",
                            )
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
                    "{reviewText.trim()}" —{" "}
                    {t("Review received.", "মতামত জমা হয়েছে।")}
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
                    onClick={() => void handleQuickAsk(q)}
                    className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
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
                mode={effectiveMode}
                onCancel={() => setActiveForm("none")}
                onSuccess={handleCallbackSuccess}
              />
            )}

            <div ref={endRef} />
          </div>
        </>
      )}

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
            disabled={!isIdentified || isEditingProfile || disabled}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              !isIdentified || isEditingProfile
                ? t(
                    "Please enter your name and email above to start chatting…",
                    "চ্যাট শুরু করতে উপরে আপনার নাম ও ইমেইল লিখুন…",
                  )
                : effectiveMode === "platform"
                  ? t(
                      "Ask about features, pricing, or talk to sales…",
                      "ফিচার, প্রাইসিং বা সেলস নিয়ে জিজ্ঞাসা করুন…",
                    )
                  : effectiveMode === "dashboard"
                    ? t(
                        "Ask about store setup, bKash, couriers…",
                        "স্টোর সেটআপ, বিকাশ বা কুরিয়ার নিয়ে জিজ্ঞাসা করুন…",
                      )
                    : t("Type your question", "আপনার প্রশ্ন লিখুন")
            }
            aria-label={t("Your question", "আপনার প্রশ্ন")}
            className="min-w-0 flex-1 rounded-fq-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={
              !isIdentified || isEditingProfile || disabled || !text.trim()
            }
            aria-label={t("Send", "পাঠান")}
            className="grid size-9 shrink-0 place-items-center rounded-fq-md bg-primary text-primary-foreground disabled:opacity-50"
          >
            <Send className="size-4" aria-hidden />
          </button>
        </div>
      </form>

      {/* Pre-Close Feedback Modal */}
      {showCloseFeedbackModal ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("Feedback", "ফিডব্যাক")}
          className="absolute inset-0 z-50 flex flex-col justify-between bg-card/95 p-6 backdrop-blur-md animate-in fade-in zoom-in-95 duration-200 sm:rounded-fq-md"
        >
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Star className="size-6 fill-primary text-primary" />
            </div>
            <h3 className="text-base font-bold tracking-tight text-foreground">
              {t(
                "How was your support experience?",
                "আজকের সাপোর্ট অভিজ্ঞতা কেমন ছিল?",
              )}
            </h3>
            <p className="text-xs text-muted-foreground max-w-xs">
              {t(
                "Your feedback trains our AI agent and improves live support quality.",
                "আপনার মূল্যায়ন আমাদের এআই এজেন্টকে উন্নত করতে ও সেবার মান বাড়াতে সাহায্য করে।",
              )}
            </p>

            {/* 5-Star Rating Row */}
            <div className="flex items-center justify-center gap-1.5 pt-1">
              {[1, 2, 3, 4, 5].map((s) => {
                const active = (modalHoverRating ?? modalRating) >= s;
                return (
                  <button
                    key={s}
                    type="button"
                    onMouseEnter={() => setModalHoverRating(s)}
                    onMouseLeave={() => setModalHoverRating(null)}
                    onClick={() => setModalRating(s)}
                    className="p-1 text-muted-foreground transition-transform hover:scale-125 focus:outline-none"
                    aria-label={`${s} star`}
                  >
                    <Star
                      className={`size-7 ${active ? "fill-amber-400 text-amber-400 drop-shadow-sm" : "text-muted-foreground/30"}`}
                    />
                  </button>
                );
              })}
            </div>
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
              {modalRating === 1 && t("Needs improvement", "উন্নতি প্রয়োজন")}
              {modalRating === 2 && t("Fair", "মোটামুটি")}
              {modalRating === 3 && t("Good", "ভালো")}
              {modalRating === 4 && t("Very Good", "অনেক ভালো")}
              {modalRating === 5 && t("Excellent!", "চমৎকার!")}
            </span>

            {/* Resolution Toggle */}
            <div className="w-full pt-3 pb-1 border-t border-border/60">
              <label className="block text-xs font-semibold text-foreground mb-2">
                {t(
                  "Was your question resolved?",
                  "আপনার সমস্যার সমাধান হয়েছে কি?",
                )}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setModalResolved(true)}
                  className={`flex items-center justify-center gap-1.5 rounded-fq-md border py-2 text-xs font-medium transition-colors ${
                    modalResolved
                      ? "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  <span>👍</span>
                  <span>{t("Yes, resolved", "হ্যাঁ, সমাধান হয়েছে")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setModalResolved(false)}
                  className={`flex items-center justify-center gap-1.5 rounded-fq-md border py-2 text-xs font-medium transition-colors ${
                    !modalResolved
                      ? "border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  <span>👎</span>
                  <span>{t("Still need help", "আরও সাহায্য প্রয়োজন")}</span>
                </button>
              </div>
            </div>

            {/* Optional Review Text */}
            <div className="w-full text-left">
              <textarea
                rows={2}
                value={modalReview}
                onChange={(e) => setModalReview(e.target.value)}
                placeholder={t(
                  "Any comments or suggestions? (optional)",
                  "কোনো পরামর্শ বা মন্তব্য থাকলে লিখুন (ঐচ্ছিক)",
                )}
                className="w-full rounded-fq-md border border-input bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {/* Footer CTA Buttons */}
          <div className="flex flex-col gap-2 pt-3 border-t border-border/60">
            <button
              type="button"
              disabled={submittingFeedback}
              onClick={handleSubmitCloseFeedback}
              className="flex w-full items-center justify-center gap-2 rounded-fq-md bg-primary py-2.5 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {submittingFeedback
                ? t("Submitting...", "জমা দেওয়া হচ্ছে...")
                : t("Submit & Close", "ফিডব্যাক দিন ও চ্যাট শেষ করুন")}
            </button>
            <button
              type="button"
              onClick={handleSkipCloseFeedback}
              className="w-full py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("Skip & Close", "এড়িয়ে যান ও বন্ধ করুন")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
