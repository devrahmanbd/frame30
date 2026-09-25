import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { btnPrimary, inputClass } from "@/components/admin/MarketingUi";
import { SectionCard } from "@/components/admin/DeveloperUi";
import {
  CertBadge,
  DnsRecordTable,
  DomainProgress,
  DomainStatusPill,
  InlineNote,
  ObservedRecords,
} from "@/components/admin/DomainManager";
import type { DomainView } from "@/lib/domains.server";
import {
  domainAddFn,
  domainEnabledFn,
  domainHistoryFn,
  domainPrimaryFn,
  domainRedirectFn,
  domainRemoveFn,
  domainRenameFn,
  domainVerifyFn,
  domainsListFn,
} from "@/lib/domains.functions";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute(
  "/_authenticated/dashboard/settings_/domains",
)({
  // A tripped rate-limit bucket degrades to a notice, never to the error
  // boundary: SSR succeeding while the client gets a 429 is exactly the
  // divergence that surfaces as React hydration error #418 (Sept 2026).
  loader: async () => {
    try {
      return { ...(await domainsListFn()), rateLimited: false as const };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err ?? "");
      if (/rate_limit|429|too many requests/i.test(message)) {
        return { ...EMPTY_LIST, rateLimited: true as const };
      }
      throw err;
    }
  },
  pendingComponent: DomainsPending,
  errorComponent: DomainsError,
  head: () => ({
    meta: [
      { title: "Custom domains — Framique admin" },
      {
        name: "description",
        content:
          "Connect your own domain to your Framique storefront: guided DNS setup, live verification and automatic HTTPS certificates.",
      },
      { property: "og:title", content: "Custom domains — Framique admin" },
      {
        property: "og:description",
        content:
          "Guided DNS setup, live verification and automatic HTTPS for your storefront.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DomainsPage,
});

type ListResult = Awaited<ReturnType<typeof domainsListFn>>;
type HistoryRow = Awaited<ReturnType<typeof domainHistoryFn>>[number];
/** Loader data plus the degraded-429 flag (absent on older cached payloads). */
type ViewList = ListResult & { rateLimited?: boolean };

function fmt(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function DomainsPending() {
  return (
    <div
      className="space-y-5 p-4 md:p-6"
      aria-busy="true"
      aria-label="Loading custom domains"
    >
      <div className="space-y-2">
        <div className="h-6 w-48 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded-md bg-muted" />
      </div>
      <div className="h-32 animate-pulse rounded-fq-md border border-border bg-muted/40" />
      <div className="h-48 animate-pulse rounded-fq-md border border-border bg-muted/40" />
    </div>
  );
}

function DomainsError({ error }: { error: Error }) {
  const router = useRouter();
  return (
    <div className="space-y-3 p-4 md:p-6" role="alert">
      <h1 className="font-bangla-display text-xl font-semibold">
        Custom domains
      </h1>
      <p className="text-sm text-muted-foreground">
        Could not load your domains{error?.message ? `: ${error.message}` : "."}
      </p>
      <button
        type="button"
        className={btnPrimary}
        onClick={() => void router.invalidate()}
      >
        Retry
      </button>
    </div>
  );
}

const EMPTY_LIST: ViewList = {
  domains: [],
  target: { cname: "", ips: [] },
  edgeConfigured: false,
  limit: 10,
  rateLimited: false,
};

/** Shown instead of the error boundary when the loader was rate-limited. */
function RateLimitedBanner({ onRetry }: { onRetry: () => void }) {
  const { t } = useLang();
  const [secs, setSecs] = useState(15);
  useEffect(() => {
    if (secs <= 0) {
      onRetry();
      return;
    }
    const id = setTimeout(() => setSecs((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [secs, onRetry]);
  return (
    <InlineNote tone="warning">
      {t(
        `Too many requests — retrying automatically in ${secs}s.`,
        `অনেক অনুরোধ — ${secs} সেকেন্ডে স্বয়ংক্রিয়ভাবে আবার চেষ্টা করা হবে।`,
      )}
    </InlineNote>
  );
}

const btnSecondary =
  "inline-flex min-h-9 items-center justify-center rounded-fq-md border border-border/80 bg-background px-3 text-xs font-medium text-foreground shadow-2xs transition-colors hover:bg-muted hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50";

const btnDanger =
  "inline-flex min-h-9 items-center justify-center rounded-fq-md border border-danger/40 bg-background px-3 text-xs font-medium text-danger shadow-2xs transition-colors hover:bg-danger-soft hover:border-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger disabled:opacity-50";

function DomainsPage() {
  const { t } = useLang();
  const loaded = Route.useLoaderData() as ViewList | undefined;
  const initial: ViewList = loaded ?? EMPTY_LIST;
  const router = useRouter();
  const [data, setData] = useState<ViewList>(initial);
  const [hostname, setHostname] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(
    initial.domains[0]?.id ?? null,
  );
  const [history, setHistory] = useState<Record<string, HistoryRow[]>>({});
  // Inline two-step delete confirmation. The native window.confirm used to
  // leak across navigations (a stale dialog followed the user to checkout),
  // so removal now arms inline and executes only on explicit confirm.
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHostname, setEditHostname] = useState("");
  const rename = useServerFn(domainRenameFn);

  const add = useServerFn(domainAddFn);
  const verify = useServerFn(domainVerifyFn);
  const primary = useServerFn(domainPrimaryFn);
  const redirect = useServerFn(domainRedirectFn);
  const enabled = useServerFn(domainEnabledFn);
  const remove = useServerFn(domainRemoveFn);
  const loadHistory = useServerFn(domainHistoryFn);
  const list = useServerFn(domainsListFn);
  const retryList = useCallback(() => void router.invalidate(), [router]);

  /** Error codes are stable ids from the server; the copy lives here. */
  const message = useMemo(
    () => (code: string) =>
      ({
        "domain.empty": t("Enter a domain name.", "একটি ডোমেইন লিখুন।"),
        "domain.invalid": t(
          "That does not look like a valid domain.",
          "ডোমেইনটি সঠিক মনে হচ্ছে না।",
        ),
        "domain.needs_tld": t(
          "Include the extension, e.g. .com",
          "এক্সটেনশন দিন, যেমন .com",
        ),
        "domain.too_long": t("That domain is too long.", "ডোমেইনটি অনেক বড়।"),
        "domain.ip_not_allowed": t(
          "IP addresses cannot be used.",
          "আইপি ঠিকানা ব্যবহার করা যাবে না।",
        ),
        "domain.reserved": t("That domain is reserved.", "এই ডোমেইন সংরক্ষিত।"),
        "domain.reserved_label": t(
          "That sub-domain is reserved.",
          "এই সাব-ডোমেইন সংরক্ষিত।",
        ),
        "domain.taken": t(
          "That domain is already connected.",
          "ডোমেইনটি আগেই যুক্ত আছে।",
        ),
        "domain.limit_reached": t(
          "Domain limit reached.",
          "ডোমেইনের সীমা শেষ।",
        ),
        "domain.txt_missing": t(
          "TXT verification record not found yet.",
          "TXT যাচাই রেকর্ড এখনও পাওয়া যায়নি।",
        ),
        "domain.routing_missing": t(
          "Routing record not pointing here yet.",
          "রাউটিং রেকর্ড এখনও এখানে আসেনি।",
        ),
        "domain.dns_unavailable": t(
          "DNS lookup failed — we will retry shortly.",
          "DNS দেখা যায়নি — আমরা আবার চেষ্টা করব।",
        ),
        "domain.not_active": t(
          "Only a live domain can be primary.",
          "শুধু চালু ডোমেইন প্রাইমারি হতে পারে।",
        ),
        rate_limited: t(
          "Too many attempts. Wait a moment.",
          "অনেকবার চেষ্টা হয়েছে। একটু অপেক্ষা করুন।",
        ),
      })[code] ?? code,
    [t],
  );

  const statusLabels: Record<string, string> = {
    pending_dns: t("DNS pending", "DNS বাকি"),
    verifying: t("Verifying", "যাচাই চলছে"),
    dns_verified: t("DNS verified", "DNS যাচাই হয়েছে"),
    issuing_cert: t("Issuing HTTPS", "HTTPS ইস্যু হচ্ছে"),
    active: t("Live", "চালু"),
    failed: t("Needs attention", "মনোযোগ দরকার"),
    disabled: t("Paused", "বন্ধ"),
    progress: t("Setup progress", "সেটআপ অগ্রগতি"),
  };

  const certLabels: Record<string, string> = {
    none: t("No certificate", "সার্টিফিকেট নেই"),
    ok: t("HTTPS valid", "HTTPS ঠিক আছে"),
    renew_soon: t("Renews soon", "শীঘ্রই নবায়ন"),
    expiring: t("Expiring", "মেয়াদ শেষ হচ্ছে"),
    expired: t("Expired", "মেয়াদ শেষ"),
    days: t("d left", " দিন"),
  };

  async function run(
    id: string | null,
    action: () => Promise<unknown>,
    ok?: string,
  ) {
    setBusyId(id ?? "new");
    setError(null);
    setNotice(null);
    try {
      // Actions return heterogeneous shapes (verify returns a single view,
      // the rest return the list), so ignore the return and refresh from
      // the list endpoint directly. Do NOT router.invalidate() here: that
      // refires every active route loader and fans out into a request
      // storm (Sept 2026 429 incident).
      await action();
      setData({ ...(await list()), rateLimited: false });
      if (ok) setNotice(ok);
    } catch (err) {
      const code = err instanceof Error ? err.message : "error";
      setError(message(code.replace(/^Error:\s*/, "")));
    } finally {
      setBusyId(null);
    }
  }

  async function toggleHistory(id: string) {
    setOpen(open === id ? null : id);
    if (!history[id]) {
      try {
        setHistory((h) => ({ ...h, [id]: [] }));
        const rows = await loadHistory({ data: { id } });
        setHistory((h) => ({ ...h, [id]: rows }));
      } catch {
        /* history is non-critical */
      }
    }
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="font-bangla-display text-xl font-semibold">
          {t("Custom domains", "কাস্টম ডোমেইন")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Point your own domain at your storefront. We verify DNS, issue HTTPS automatically and keep it renewed.",
            "আপনার নিজের ডোমেইন স্টোরের সাথে যুক্ত করুন। আমরা DNS যাচাই করে স্বয়ংক্রিয়ভাবে HTTPS দেব এবং নবায়ন করব।",
          )}
        </p>
      </header>

      {error && <InlineNote tone="danger">{error}</InlineNote>}
      {notice && <InlineNote tone="success">{notice}</InlineNote>}
      {data.rateLimited && <RateLimitedBanner onRetry={retryList} />}
      {!data.edgeConfigured && (
        <InlineNote tone="warning">
          <div className="flex items-start gap-1.5">
            <span className="font-semibold">
              {t("Environment notice:", "পরিবেশ বিজ্ঞপ্তি:")}
            </span>
            <span>
              {t(
                "TLS edge has no push hook here (DOMAIN_EDGE_HOOK_URL unset) — this is expected, not an error. DNS verification still runs automatically; once DNS passes, the edge operator issues the certificate and the domain flips Live on the next check. Your storefront keeps serving on the platform path meanwhile.",
                "এই পরিবেশে TLS এজের পুশ হুক নেই (DOMAIN_EDGE_HOOK_URL সেট নেই) — এটি প্রত্যাশিত, কোনো ত্রুটি নয়। DNS যাচাই স্বয়ংক্রিয়ভাবে চলবে; DNS ঠিক হলে এজ অপারেটর সার্টিফিকেট ইস্যু করবেন এবং পরের চেকেই ডোমেইন চালু হবে। এর মধ্যে প্ল্যাটফর্ম পাথে আপনার স্টোর চলতে থাকবে।",
              )}
            </span>
          </div>
        </InlineNote>
      )}

      {(() => {
        const atCap = data.domains.length >= (data.limit ?? 1);
        if (atCap) {
          return null;
        }
        return (
          <SectionCard
            title={t("Connect a domain", "ডোমেইন যুক্ত করুন")}
            hint={t(
              "Use your apex domain (example.com) or a sub-domain (shop.example.com).",
              "আপনার apex ডোমেইন (example.com) বা সাব-ডোমেইন (shop.example.com) দিন।",
            )}
          >
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const value = hostname.trim();
                if (!value) return;
                void run(
                  null,
                  async () => {
                    const next = await add({ data: { hostname: value } });
                    setHostname("");
                    return next;
                  },
                  t(
                    "Domain added — add the DNS records below.",
                    "ডোমেইন যুক্ত হয়েছে — নিচের DNS রেকর্ড যোগ করুন।",
                  ),
                );
              }}
            >
              <label className="sr-only" htmlFor="hostname">
                {t("Domain", "ডোমেইন")}
              </label>
              <input
                id="hostname"
                className={`${inputClass} max-w-sm flex-1`}
                placeholder="shop.example.com"
                autoComplete="off"
                spellCheck={false}
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
              />
              <button
                type="submit"
                className={btnPrimary}
                disabled={busyId === "new"}
              >
                {busyId === "new"
                  ? t("Adding…", "যোগ হচ্ছে…")
                  : t("Add domain", "যোগ করুন")}
              </button>
            </form>
          </SectionCard>
        );
      })()}

      {data.domains.length === 0 && (
        <p className="rounded-fq-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t("No custom domains yet.", "এখনও কোনো কাস্টম ডোমেইন নেই।")}
        </p>
      )}

      {data.domains.map((domain: DomainView) => {
        const busy = busyId === domain.id;
        return (
          <SectionCard
            key={domain.id}
            title={domain.hostname}
            hint={t(
              `Added ${fmt(domain.createdAt)} · last checked ${fmt(domain.lastCheckedAt)}`,
              `যোগ ${fmt(domain.createdAt)} · সর্বশেষ যাচাই ${fmt(domain.lastCheckedAt)}`,
            )}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                {domain.isPrimary && (
                  <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary shadow-2xs">
                    {t("Primary", "প্রাইমারি")}
                  </span>
                )}
                <DomainStatusPill
                  status={domain.status}
                  label={statusLabels[domain.status] ?? domain.status}
                />
                <CertBadge health={domain.certHealth} labels={certLabels} />
              </div>
            }
          >
            <DomainProgress status={domain.status} labels={statusLabels} />

            {domain.lastError && domain.status !== "active" && (
              <InlineNote
                tone={domain.status === "failed" ? "danger" : "warning"}
              >
                {message(domain.lastError)}
                {domain.checkAttempts > 0 &&
                  ` · ${t("attempt", "চেষ্টা")} ${domain.checkAttempts}`}
              </InlineNote>
            )}

            {domain.status !== "active" && (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {t(
                    "Add these DNS records at your registrar",
                    "আপনার রেজিস্ট্রারে এই DNS রেকর্ডগুলো যোগ করুন",
                  )}
                </p>
                <DnsRecordTable
                  records={domain.records}
                  labels={{
                    type: t("Type", "ধরন"),
                    name: t("Name", "নাম"),
                    value: t("Value", "মান"),
                    copy: t("Copy", "কপি"),
                    optional: t("optional", "ঐচ্ছিক"),
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  {t(
                    `DNS changes can take up to an hour. We re-check automatically; next check ${fmt(domain.nextCheckAt)}.`,
                    `DNS পরিবর্তনে এক ঘণ্টা পর্যন্ত লাগতে পারে। আমরা নিজে থেকেই আবার দেখব; পরের যাচাই ${fmt(domain.nextCheckAt)}।`,
                  )}
                </p>
              </div>
            )}

            {domain.status === "active" && (
              <InlineNote tone="success">
                {t(
                  `Live over HTTPS since ${fmt(domain.activatedAt)}.`,
                  `${fmt(domain.activatedAt)} থেকে HTTPS-এ চালু আছে।`,
                )}
              </InlineNote>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={btnPrimary}
                disabled={busy || domain.status === "disabled"}
                onClick={() =>
                  void run(domain.id, () => verify({ data: { id: domain.id } }))
                }
              >
                {busy
                  ? t("Checking…", "দেখা হচ্ছে…")
                  : t("Check now", "এখনই যাচাই")}
              </button>
              {domain.status === "active" && !domain.isPrimary && (
                <button
                  type="button"
                  className={btnSecondary}
                  disabled={busy}
                  onClick={() =>
                    void run(domain.id, () =>
                      primary({ data: { id: domain.id } }),
                    )
                  }
                >
                  {t("Make primary", "প্রাইমারি করুন")}
                </button>
              )}
              {!domain.isPrimary && (
                <button
                  type="button"
                  className={btnSecondary}
                  disabled={busy}
                  onClick={() =>
                    void run(domain.id, () =>
                      redirect({
                        data: {
                          id: domain.id,
                          redirect: !domain.redirectToPrimary,
                        },
                      }),
                    )
                  }
                >
                  {domain.redirectToPrimary
                    ? t("Stop redirecting", "রিডাইরেক্ট বন্ধ")
                    : t("Redirect to primary", "প্রাইমারিতে রিডাইরেক্ট")}
                </button>
              )}
              <button
                type="button"
                className={btnSecondary}
                disabled={busy}
                onClick={() =>
                  void run(domain.id, () =>
                    enabled({
                      data: {
                        id: domain.id,
                        enabled: domain.status === "disabled",
                      },
                    }),
                  )
                }
              >
                {domain.status === "disabled"
                  ? t("Resume", "চালু করুন")
                  : t("Pause", "বন্ধ করুন")}
              </button>
              {editingId === domain.id ? (
                <span className="inline-flex min-h-9 flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor={`rename-${domain.id}`}>
                    {t("Domain hostname", "ডোমেইন হোস্টনেম")}
                  </label>
                  <input
                    id={`rename-${domain.id}`}
                    className={`${inputClass} max-w-xs`}
                    defaultValue={domain.hostname}
                    autoComplete="off"
                    spellCheck={false}
                    disabled={busy}
                    onChange={(e) => setEditHostname(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                  <button
                    type="button"
                    className={btnPrimary}
                    disabled={busy}
                    onClick={() => {
                      setEditingId(null);
                      void run(domain.id, () =>
                        rename({
                          data: { id: domain.id, hostname: editHostname },
                        }),
                      );
                    }}
                  >
                    {t("Save", "সংরক্ষণ")}
                  </button>
                  <button
                    type="button"
                    className={btnSecondary}
                    onClick={() => setEditingId(null)}
                  >
                    {t("Cancel", "বাতিল")}
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className={btnSecondary}
                  disabled={busy}
                  onClick={() => {
                    setEditHostname(domain.hostname);
                    setEditingId(domain.id);
                  }}
                >
                  {t("Edit", "সম্পাদনা")}
                </button>
              )}
              {confirmRemoveId === domain.id ? (
                <span
                  className="inline-flex min-h-9 flex-wrap items-center gap-2 rounded-fq-md border border-danger/50 bg-danger-soft/40 px-3 py-1 text-xs font-medium text-danger-foreground shadow-2xs"
                  role="alert"
                >
                  <span>
                    {t(
                      `Remove ${domain.hostname}?`,
                      `${domain.hostname} সরাবেন?`,
                    )}
                  </span>
                  <button
                    type="button"
                    className="rounded-fq-md bg-danger px-2.5 py-1 text-xs font-semibold text-white shadow-2xs transition-colors hover:opacity-90"
                    disabled={busy}
                    onClick={() => {
                      setConfirmRemoveId(null);
                      void run(domain.id, () =>
                        remove({ data: { id: domain.id } }),
                      );
                    }}
                  >
                    {t("Confirm", "নিশ্চিত করুন")}
                  </button>
                  <button
                    type="button"
                    className="rounded-fq-md px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground underline"
                    onClick={() => setConfirmRemoveId(null)}
                  >
                    {t("Cancel", "বাতিল")}
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className={btnDanger}
                  disabled={busy}
                  onClick={() => setConfirmRemoveId(domain.id)}
                >
                  {t("Remove", "সরান")}
                </button>
              )}
              <button
                type="button"
                className="inline-flex min-h-9 items-center justify-center rounded-fq-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground underline"
                onClick={() => void toggleHistory(domain.id)}
              >
                {open === domain.id
                  ? t("Hide details", "বিস্তারিত লুকান")
                  : t("Details", "বিস্তারিত")}
              </button>
            </div>

            {open === domain.id && (
              <div className="grid gap-4 border-t border-border/80 pt-4 md:grid-cols-2">
                <ObservedRecords
                  observed={domain.observed}
                  labels={{
                    title: t("What we currently see", "আমরা এখন যা দেখছি"),
                    none: t("nothing found", "কিছু পাওয়া যায়নি"),
                  }}
                />
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <p className="font-semibold text-foreground">
                    {t("Event history", "ইভেন্ট ইতিহাস")}
                  </p>
                  {(history[domain.id] ?? []).length === 0 && (
                    <p>{t("No events yet.", "কোনো ইভেন্ট নেই।")}</p>
                  )}
                  {(history[domain.id] ?? []).map((row) => (
                    <p key={row.id} className="text-foreground/90">
                      <span className="font-medium text-foreground">
                        {fmt(row.createdAt)}
                      </span>{" "}
                      —{" "}
                      <span className="font-semibold">
                        {statusLabels[row.to] ?? row.to}
                      </span>
                      {row.reason ? ` (${row.reason})` : ""}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </SectionCard>
        );
      })}
    </div>
  );
}
