import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import {
  ownerImpersonateRequestFn,
  ownerImpersonateRevokeFn,
  ownerImpersonateUseFn,
  ownerImpersonationFn,
  ownerReinstateFn,
  ownerSuspendFn,
  ownerSuspensionsFn,
} from "@/lib/owner.functions";
import { RootConfirmDialog } from "@/components/root/RootConfirmDialog";
import { OwnerHeader, OwnerTable, StatCard, StatGrid, StatePill } from "@/components/root/OwnerUi";

export const Route = createFileRoute("/root/access")({
  head: () => ({
    meta: [
      { title: "Tenant access — Framique owner console" },
      {
        name: "description",
        content:
          "Suspend or reinstate a merchant with an optional payment freeze, and request time-limited impersonation that only starts after the tenant consents.",
      },
      { property: "og:title", content: "Tenant access — Framique owner console" },
      {
        property: "og:description",
        content: "Suspension with payment freeze and consented, expiring impersonation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AccessDesk,
});

const field =
  "w-full rounded-fq-md border border-border bg-background px-3 py-2 text-sm";
const btn =
  "rounded-fq-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50";
const btnPrimary =
  "rounded-fq-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50";

const stateTone = (s: string) =>
  s === "active" ? "ok" : s === "pending_consent" ? "warn" : "bad";

function AccessDesk() {
  const { t } = useLang();
  const qc = useQueryClient();
  const loadSuspensions = useServerFn(ownerSuspensionsFn);
  const loadGrants = useServerFn(ownerImpersonationFn);
  const suspendFn = useServerFn(ownerSuspendFn);
  const reinstateFn = useServerFn(ownerReinstateFn);
  const requestFn = useServerFn(ownerImpersonateRequestFn);
  const revokeFn = useServerFn(ownerImpersonateRevokeFn);
  const useGrantFn = useServerFn(ownerImpersonateUseFn);

  const suspensions = useQuery({
    queryKey: ["owner-suspensions"],
    queryFn: () => loadSuspensions(),
  });
  const grants = useQuery({ queryKey: ["owner-grants"], queryFn: () => loadGrants() });

  const [merchantId, setMerchantId] = useState("");
  const [reason, setReason] = useState("");
  const [freeze, setFreeze] = useState(true);
  const [confirmSuspend, setConfirmSuspend] = useState(false);

  const [impMerchant, setImpMerchant] = useState("");
  const [impReason, setImpReason] = useState("");
  const [impScope, setImpScope] = useState<"read" | "write">("read");
  const [impMinutes, setImpMinutes] = useState(30);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["owner-suspensions"] });
    void qc.invalidateQueries({ queryKey: ["owner-grants"] });
  };
  const fail = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : t("Action failed", "কাজটি ব্যর্থ হয়েছে"));

  const suspend = useMutation({
    mutationFn: () => suspendFn({ data: { merchantId, reason, freezePayments: freeze } }),
    onSuccess: () => {
      toast.success(t("Merchant suspended", "মার্চেন্ট সাসপেন্ড হয়েছে"));
      setReason("");
      refresh();
    },
    onError: fail,
  });
  const reinstate = useMutation({
    mutationFn: (id: string) => reinstateFn({ data: { merchantId: id, note: null } }),
    onSuccess: () => {
      toast.success(t("Merchant reinstated", "মার্চেন্ট পুনর্বহাল হয়েছে"));
      refresh();
    },
    onError: fail,
  });
  const request = useMutation({
    mutationFn: () =>
      requestFn({
        data: {
          merchantId: impMerchant,
          reason: impReason,
          scope: impScope,
          minutes: impMinutes,
        },
      }),
    onSuccess: () => {
      toast.success(
        t("Request sent — waiting for tenant consent", "অনুরোধ পাঠানো হয়েছে — টেন্যান্টের সম্মতির অপেক্ষা"),
      );
      setImpReason("");
      refresh();
    },
    onError: fail,
  });
  const revoke = useMutation({
    mutationFn: (grantId: string) => revokeFn({ data: { grantId } }),
    onSuccess: () => {
      toast.success(t("Access revoked", "অ্যাক্সেস বাতিল"));
      refresh();
    },
    onError: fail,
  });
  const enter = useMutation({
    mutationFn: (grantId: string) => useGrantFn({ data: { grantId, action: "console.open" } }),
    onSuccess: () => {
      toast.success(t("Impersonated access recorded", "ইমপারসোনেটেড অ্যাক্সেস রেকর্ড হয়েছে"));
      refresh();
    },
    onError: fail,
  });

  const merchants = suspensions.data?.merchants ?? [];
  const rows = suspensions.data?.rows ?? [];
  const activeSuspensions = rows.filter((r) => r.active);
  const grantRows = grants.data?.rows ?? [];

  return (
    <section className="space-y-8">
      <OwnerHeader
        title={t("Tenant access", "টেন্যান্ট অ্যাক্সেস")}
        subtitle={t(
          "Suspension, payment freeze and impersonation. Every action here is written to the platform audit trail with the actor, reason and time window.",
          "সাসপেনশন, পেমেন্ট ফ্রিজ ও ইমপারসোনেশন। প্রতিটি কাজ অ্যাক্টর, কারণ ও সময়সীমাসহ অডিট ট্রেইলে লেখা হয়।",
        )}
      />

      <StatGrid>
        <StatCard label={t("Merchants", "মার্চেন্ট")} value={String(merchants.length)} />
        <StatCard label={t("Suspended now", "এখন সাসপেন্ডেড")} value={String(activeSuspensions.length)} />
        <StatCard
          label={t("Payments frozen", "পেমেন্ট ফ্রোজেন")}
          value={String(activeSuspensions.filter((r) => r.payments_frozen).length)}
        />
        <StatCard
          label={t("Live impersonation", "চলমান ইমপারসোনেশন")}
          value={String(grantRows.filter((g) => g.state === "active").length)}
        />
      </StatGrid>

      {/* ------------------------------------------------ suspend / reinstate */}
      <div className="space-y-3 rounded-fq-md border border-border p-4">
        <h3 className="text-sm font-semibold">
          {t("Suspend a merchant", "মার্চেন্ট সাসপেন্ড করুন")}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t(
            "Suspension hides the storefront immediately. With the payment freeze on, new charges and refunds are refused for the tenant until it is reinstated.",
            "সাসপেন্ড করলে স্টোরফ্রন্ট সঙ্গে সঙ্গে বন্ধ হয়। পেমেন্ট ফ্রিজ চালু থাকলে নতুন চার্জ ও রিফান্ড আটকে যায়।",
          )}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-medium">
            {t("Merchant", "মার্চেন্ট")}
            <select
              className={field}
              value={merchantId}
              onChange={(e) => setMerchantId(e.target.value)}
            >
              <option value="">{t("Select a merchant", "একটি মার্চেন্ট বাছুন")}</option>
              {merchants
                .filter((m) => m.status !== "suspended")
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium">
            {t("Reason (recorded)", "কারণ (রেকর্ড হবে)")}
            <input
              className={field}
              value={reason}
              minLength={8}
              placeholder={t("Why this tenant is being suspended", "কেন সাসপেন্ড করা হচ্ছে")}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={freeze}
            onChange={(e) => setFreeze(e.target.checked)}
            className="h-4 w-4"
          />
          {t("Freeze payments while suspended", "সাসপেন্ড থাকাকালীন পেমেন্ট ফ্রিজ করুন")}
        </label>
        <button
          type="button"
          className={btnPrimary}
          disabled={!merchantId || reason.trim().length < 8 || suspend.isPending}
          onClick={() => setConfirmSuspend(true)}
        >
          {t("Suspend merchant", "সাসপেন্ড করুন")}
        </button>
      </div>

      <OwnerTable
        head={[
          t("Merchant", "মার্চেন্ট"),
          t("State", "অবস্থা"),
          t("Payments", "পেমেন্ট"),
          t("Reason", "কারণ"),
          t("Since", "থেকে"),
          "",
        ]}
      >
        {rows.length === 0 ? (
          <tr>
            <td colSpan={6} className="px-3 py-4 text-sm text-muted-foreground">
              {t("No suspension has ever been recorded.", "কোনো সাসপেনশন রেকর্ড নেই।")}
            </td>
          </tr>
        ) : (
          rows.map((r) => (
            <tr key={r.id} className="border-t border-border align-top">
              <td className="px-3 py-2">{r.merchantName ?? r.merchant_id}</td>
              <td className="px-3 py-2">
                <StatePill tone={r.active ? "bad" : "ok"}>
                  {r.active ? t("Suspended", "সাসপেন্ডেড") : t("Reinstated", "পুনর্বহাল")}
                </StatePill>
              </td>
              <td className="px-3 py-2 text-xs">
                {r.active && r.payments_frozen
                  ? t("Frozen", "ফ্রোজেন")
                  : t("Open", "চালু")}
              </td>
              <td className="px-3 py-2 text-xs">{r.reason}</td>
              <td className="px-3 py-2 text-xs tabular-nums">
                {new Date(r.suspended_at).toLocaleString()}
              </td>
              <td className="px-3 py-2">
                {r.active ? (
                  <button
                    type="button"
                    className={btn}
                    disabled={reinstate.isPending}
                    onClick={() => reinstate.mutate(r.merchant_id)}
                  >
                    {t("Reinstate", "পুনর্বহাল")}
                  </button>
                ) : null}
              </td>
            </tr>
          ))
        )}
      </OwnerTable>

      {/* -------------------------------------------------------- impersonation */}
      <div className="space-y-3 rounded-fq-md border border-border p-4">
        <h3 className="text-sm font-semibold">
          {t("Request impersonation", "ইমপারসোনেশন অনুরোধ")}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t(
            "Access never starts on request: a tenant owner or admin must consent, the window expires on its own, and every use is audited.",
            "অনুরোধেই অ্যাক্সেস শুরু হয় না: টেন্যান্ট ওনার/অ্যাডমিনের সম্মতি লাগে, সময়সীমা নিজেই শেষ হয়, এবং প্রতিটি ব্যবহার অডিট হয়।",
          )}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-medium">
            {t("Merchant", "মার্চেন্ট")}
            <select className={field} value={impMerchant} onChange={(e) => setImpMerchant(e.target.value)}>
              <option value="">{t("Select a merchant", "একটি মার্চেন্ট বাছুন")}</option>
              {(grants.data?.merchants ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium">
            {t("Reason (shown to the tenant)", "কারণ (টেন্যান্ট দেখবে)")}
            <input
              className={field}
              value={impReason}
              onChange={(e) => setImpReason(e.target.value)}
              placeholder={t("Support ticket or incident reference", "সাপোর্ট টিকিট বা ইনসিডেন্ট রেফারেন্স")}
            />
          </label>
          <label className="space-y-1 text-xs font-medium">
            {t("Scope", "স্কোপ")}
            <select
              className={field}
              value={impScope}
              onChange={(e) => setImpScope(e.target.value === "write" ? "write" : "read")}
            >
              <option value="read">{t("Read only", "শুধু পড়া")}</option>
              <option value="write">{t("Read and write", "পড়া ও লেখা")}</option>
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium">
            {t("Window (minutes)", "সময়সীমা (মিনিট)")}
            <input
              type="number"
              min={5}
              max={240}
              className={`${field} tabular-nums`}
              value={impMinutes}
              onChange={(e) => setImpMinutes(Number(e.target.value))}
            />
          </label>
        </div>
        <button
          type="button"
          className={btnPrimary}
          disabled={!impMerchant || impReason.trim().length < 8 || request.isPending}
          onClick={() => request.mutate()}
        >
          {t("Request consent", "সম্মতি চাই")}
        </button>
      </div>

      <OwnerTable
        head={[
          t("Merchant", "মার্চেন্ট"),
          t("State", "অবস্থা"),
          t("Scope", "স্কোপ"),
          t("Expires", "মেয়াদ শেষ"),
          t("Uses", "ব্যবহার"),
          "",
        ]}
      >
        {grantRows.length === 0 ? (
          <tr>
            <td colSpan={6} className="px-3 py-4 text-sm text-muted-foreground">
              {t("No impersonation has been requested.", "কোনো ইমপারসোনেশন অনুরোধ নেই।")}
            </td>
          </tr>
        ) : (
          grantRows.map((g) => (
            <tr key={g.id} className="border-t border-border align-top">
              <td className="px-3 py-2">{g.merchantName ?? g.merchant_id}</td>
              <td className="px-3 py-2">
                <StatePill tone={stateTone(g.state)}>
                  {g.state === "active"
                    ? t("Consented", "সম্মতি দেওয়া")
                    : g.state === "pending_consent"
                      ? t("Awaiting consent", "সম্মতির অপেক্ষায়")
                      : g.state === "expired"
                        ? t("Expired", "মেয়াদ শেষ")
                        : t("Revoked", "বাতিল")}
                </StatePill>
              </td>
              <td className="px-3 py-2 text-xs">
                {g.scope === "write" ? t("Read and write", "পড়া ও লেখা") : t("Read only", "শুধু পড়া")}
              </td>
              <td className="px-3 py-2 text-xs tabular-nums">
                {new Date(g.expires_at).toLocaleString()}
              </td>
              <td className="px-3 py-2 text-xs tabular-nums">{g.use_count}</td>
              <td className="space-x-2 px-3 py-2">
                {g.state === "active" ? (
                  <button
                    type="button"
                    className={btn}
                    disabled={enter.isPending}
                    onClick={() => enter.mutate(g.id)}
                  >
                    {t("Use access", "অ্যাক্সেস ব্যবহার")}
                  </button>
                ) : null}
                {g.state === "active" || g.state === "pending_consent" ? (
                  <button
                    type="button"
                    className={btn}
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate(g.id)}
                  >
                    {t("Revoke", "বাতিল")}
                  </button>
                ) : null}
              </td>
            </tr>
          ))
        )}
      </OwnerTable>

      <RootConfirmDialog
        open={confirmSuspend}
        tone="danger"
        busy={suspend.isPending}
        onCancel={() => setConfirmSuspend(false)}
        title={t("Suspend this merchant?", "এই মার্চেন্ট সাসপেন্ড করবেন?")}
        description={
          freeze
            ? t(
                "The storefront goes offline and payments are frozen until you reinstate the tenant.",
                "স্টোরফ্রন্ট বন্ধ হবে এবং পুনর্বহাল না করা পর্যন্ত পেমেন্ট ফ্রিজ থাকবে।",
              )
            : t(
                "The storefront goes offline. Payments stay open for this tenant.",
                "স্টোরফ্রন্ট বন্ধ হবে। পেমেন্ট চালু থাকবে।",
              )
        }
        confirmLabel={t("Suspend", "সাসপেন্ড")}
        onConfirm={() => {
          setConfirmSuspend(false);
          suspend.mutate();
        }}
      />
    </section>
  );
}
