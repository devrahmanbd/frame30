import { useMemo, useState } from "react";
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
  domainVerifyFn,
  domainsListFn,
} from "@/lib/domains.functions";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/settings_/domains")({
  loader: async () => domainsListFn(),
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
        content: "Guided DNS setup, live verification and automatic HTTPS for your storefront.",
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

function fmt(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function DomainsPage() {
  const { t } = useLang();
  const initial = Route.useLoaderData() as ListResult;
  const router = useRouter();
  const [data, setData] = useState<ListResult>(initial);
  const [hostname, setHostname] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(initial.domains[0]?.id ?? null);
  const [history, setHistory] = useState<Record<string, HistoryRow[]>>({});

  const add = useServerFn(domainAddFn);
  const verify = useServerFn(domainVerifyFn);
  const primary = useServerFn(domainPrimaryFn);
  const redirect = useServerFn(domainRedirectFn);
  const enabled = useServerFn(domainEnabledFn);
  const remove = useServerFn(domainRemoveFn);
  const loadHistory = useServerFn(domainHistoryFn);

  /** Error codes are stable ids from the server; the copy lives here. */
  const message = useMemo(
    () => (code: string) =>
      ({
        "domain.empty": t("Enter a domain name.", "একটি ডোমেইন লিখুন।"),
        "domain.invalid": t("That does not look like a valid domain.", "ডোমেইনটি সঠিক মনে হচ্ছে না।"),
        "domain.needs_tld": t("Include the extension, e.g. .com", "এক্সটেনশন দিন, যেমন .com"),
        "domain.too_long": t("That domain is too long.", "ডোমেইনটি অনেক বড়।"),
        "domain.ip_not_allowed": t("IP addresses cannot be used.", "আইপি ঠিকানা ব্যবহার করা যাবে না।"),
        "domain.reserved": t("That domain is reserved.", "এই ডোমেইন সংরক্ষিত।"),
        "domain.reserved_label": t("That sub-domain is reserved.", "এই সাব-ডোমেইন সংরক্ষিত।"),
        "domain.taken": t("That domain is already connected.", "ডোমেইনটি আগেই যুক্ত আছে।"),
        "domain.limit_reached": t("Domain limit reached.", "ডোমেইনের সীমা শেষ।"),
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
        "domain.not_active": t("Only a live domain can be primary.", "শুধু চালু ডোমেইন প্রাইমারি হতে পারে।"),
        "rate_limited": t("Too many attempts. Wait a moment.", "অনেকবার চেষ্টা হয়েছে। একটু অপেক্ষা করুন।"),
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

  async function run(id: string | null, action: () => Promise<ListResult>, ok?: string) {
    setBusyId(id ?? "new");
    setError(null);
    setNotice(null);
    try {
      setData(await action());
      if (ok) setNotice(ok);
      void router.invalidate();
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
      {!data.edgeConfigured && (
        <InlineNote tone="warning">
          {t(
            "TLS edge is not configured on this environment, so certificates stay pending after DNS passes.",
            "এই পরিবেশে TLS এজ কনফিগার করা নেই, তাই DNS ঠিক হলেও সার্টিফিকেট অপেক্ষায় থাকবে।",
          )}
        </InlineNote>
      )}

      <SectionCard
        title={t("Connect a domain", "ডোমেইন যুক্ত করুন")}
        hint={t(
          `Up to ${data.limit} domains. Use the apex (example.com) or a sub-domain (shop.example.com).`,
          `সর্বোচ্চ ${data.limit}টি ডোমেইন। apex (example.com) বা সাব-ডোমেইন (shop.example.com) দিন।`,
        )}
      >
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const value = hostname.trim();
            if (!value) return;
            void run(null, async () => {
              const next = await add({ data: { hostname: value } });
              setHostname("");
              return next;
            }, t("Domain added — add the DNS records below.", "ডোমেইন যুক্ত হয়েছে — নিচের DNS রেকর্ড যোগ করুন।"));
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
          <button type="submit" className={btnPrimary} disabled={busyId === "new"}>
            {busyId === "new" ? t("Adding…", "যোগ হচ্ছে…") : t("Add domain", "যোগ করুন")}
          </button>
        </form>
      </SectionCard>

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
                  <span className="rounded-full border border-primary bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    {t("Primary", "প্রাইমারি")}
                  </span>
                )}
                <DomainStatusPill status={domain.status} label={statusLabels[domain.status] ?? domain.status} />
                <CertBadge health={domain.certHealth} labels={certLabels} />
              </div>
            }
          >
            <DomainProgress status={domain.status} labels={statusLabels} />

            {domain.lastError && domain.status !== "active" && (
              <InlineNote tone={domain.status === "failed" ? "danger" : "warning"}>
                {message(domain.lastError)}
                {domain.checkAttempts > 0 &&
                  ` · ${t("attempt", "চেষ্টা")} ${domain.checkAttempts}`}
              </InlineNote>
            )}

            {domain.status !== "active" && (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {t("Add these DNS records at your registrar", "আপনার রেজিস্ট্রারে এই DNS রেকর্ডগুলো যোগ করুন")}
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
                onClick={() => void run(domain.id, () => verify({ data: { id: domain.id } }))}
              >
                {busy ? t("Checking…", "দেখা হচ্ছে…") : t("Check now", "এখনই যাচাই")}
              </button>
              {domain.status === "active" && !domain.isPrimary && (
                <button
                  type="button"
                  className="min-h-9 rounded-fq-md border border-border px-3 text-sm"
                  disabled={busy}
                  onClick={() => void run(domain.id, () => primary({ data: { id: domain.id } }))}
                >
                  {t("Make primary", "প্রাইমারি করুন")}
                </button>
              )}
              {!domain.isPrimary && (
                <button
                  type="button"
                  className="min-h-9 rounded-fq-md border border-border px-3 text-sm"
                  disabled={busy}
                  onClick={() =>
                    void run(domain.id, () =>
                      redirect({ data: { id: domain.id, redirect: !domain.redirectToPrimary } }),
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
                className="min-h-9 rounded-fq-md border border-border px-3 text-sm"
                disabled={busy}
                onClick={() =>
                  void run(domain.id, () =>
                    enabled({ data: { id: domain.id, enabled: domain.status === "disabled" } }),
                  )
                }
              >
                {domain.status === "disabled" ? t("Resume", "চালু করুন") : t("Pause", "বন্ধ করুন")}
              </button>
              <button
                type="button"
                className="min-h-9 rounded-fq-md border border-destructive px-3 text-sm text-destructive"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(t(`Remove ${domain.hostname}?`, `${domain.hostname} সরাবেন?`))) return;
                  void run(domain.id, () => remove({ data: { id: domain.id } }));
                }}
              >
                {t("Remove", "সরান")}
              </button>
              <button
                type="button"
                className="min-h-9 rounded-fq-md px-3 text-sm underline"
                onClick={() => void toggleHistory(domain.id)}
              >
                {open === domain.id ? t("Hide details", "বিস্তারিত লুকান") : t("Details", "বিস্তারিত")}
              </button>
            </div>

            {open === domain.id && (
              <div className="grid gap-4 border-t border-border pt-3 md:grid-cols-2">
                <ObservedRecords
                  observed={domain.observed}
                  labels={{
                    title: t("What we currently see", "আমরা এখন যা দেখছি"),
                    none: t("nothing found", "কিছু পাওয়া যায়নি"),
                  }}
                />
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">{t("Event history", "ইভেন্ট ইতিহাস")}</p>
                  {(history[domain.id] ?? []).length === 0 && (
                    <p>{t("No events yet.", "কোনো ইভেন্ট নেই।")}</p>
                  )}
                  {(history[domain.id] ?? []).map((row) => (
                    <p key={row.id}>
                      {fmt(row.createdAt)} — {statusLabels[row.to] ?? row.to}
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
