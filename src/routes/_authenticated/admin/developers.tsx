import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Field, StatusPill, btnPrimary, inputClass } from "@/components/admin/MarketingUi";
import {
  CodeBlock,
  DeliveryBadge,
  EmptyRow,
  SectionCard,
  SecretReveal,
  Tabs,
} from "@/components/admin/DeveloperUi";
import { SCOPE_CATALOG, type Scope } from "@/lib/api-scopes";
import { WEBHOOK_EVENTS } from "@/lib/webhook-signing";
import {
  oauthClientRotateFn,
  oauthClientSaveFn,
  oauthClientStatusFn,
  oauthClientsListFn,
  oauthConsentRevokeFn,
  webhookReplayFn,
  webhookRotateFn,
  webhookSaveFn,
  webhookStatusFn,
  webhookTestFn,
  webhooksListFn,
} from "@/lib/developers.functions";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/developers")({
  loader: async () => {
    const [apps, webhooks] = await Promise.all([oauthClientsListFn(), webhooksListFn()]);
    return { apps, webhooks };
  },
  head: () => ({
    meta: [
      { title: "Developer platform — Framique admin" },
      {
        name: "description",
        content:
          "Manage OAuth apps, signed webhook endpoints, delivery retries and REST API access for your Framique store.",
      },
      { property: "og:title", content: "Developer platform — Framique admin" },
      {
        property: "og:description",
        content: "OAuth 2.1 apps, rotating webhook secrets and a live delivery log.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DevelopersPage,
});

function fmt(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function DevelopersPage() {
  const { t } = useLang();
  const { apps, webhooks } = Route.useLoaderData();
  const router = useRouter();
  const [tab, setTab] = useState("apps");
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const saveApp = useServerFn(oauthClientSaveFn);
  const rotateApp = useServerFn(oauthClientRotateFn);
  const appStatus = useServerFn(oauthClientStatusFn);
  const revokeConsent = useServerFn(oauthConsentRevokeFn);
  const saveHook = useServerFn(webhookSaveFn);
  const rotateHook = useServerFn(webhookRotateFn);
  const hookStatus = useServerFn(webhookStatusFn);
  const testHook = useServerFn(webhookTestFn);
  const replay = useServerFn(webhookReplayFn);

  const [appName, setAppName] = useState("");
  const [appType, setAppType] = useState<"public" | "confidential">("confidential");
  const [redirects, setRedirects] = useState("");
  const [appScopes, setAppScopes] = useState<Scope[]>(["orders.read"]);

  const [hookUrl, setHookUrl] = useState("");
  const [hookDesc, setHookDesc] = useState("");
  const [hookEvents, setHookEvents] = useState<string[]>(["order.paid"]);

  /** One wrapper so every mutation gets the same busy/error/refresh handling. */
  async function run(fn: () => Promise<unknown>, onSecret?: (r: unknown) => string | null) {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      const revealed = onSecret?.(res) ?? null;
      if (revealed) setSecret(revealed);
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Something went wrong", "কিছু ভুল হয়েছে"));
    } finally {
      setBusy(false);
    }
  }

  const failing = webhooks.endpoints.filter((e) => e.failure_count > 0).length;
  const queued = webhooks.deliveries.filter((d) => d.status === "pending" || d.status === "failed").length;
  const dead = webhooks.deliveries.filter((d) => d.status === "dead").length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-bangla-display text-xl font-semibold">
          {t("Developer platform", "ডেভেলপার প্ল্যাটফর্ম")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "OAuth apps, signed webhooks and the REST API — with rotation, retries and an audit trail.",
            "OAuth অ্যাপ, সাইনড ওয়েবহুক ও REST API — রোটেশন, রিট্রাই ও অডিট সহ।",
          )}
        </p>
      </header>

      <dl className="grid gap-3 sm:grid-cols-4">
        {[
          { label: t("Apps", "অ্যাপ"), value: apps.clients.length },
          { label: t("Endpoints", "এন্ডপয়েন্ট"), value: webhooks.endpoints.length },
          { label: t("Queued deliveries", "কিউতে ডেলিভারি"), value: queued },
          { label: t("Dead-lettered", "ডেড-লেটার"), value: dead },
        ].map((s) => (
          <div key={s.label} className="rounded-fq-md border border-border bg-card p-3">
            <dt className="text-xs text-muted-foreground">{s.label}</dt>
            <dd className="text-lg font-semibold">{s.value}</dd>
          </div>
        ))}
      </dl>

      {failing > 0 && (
        <p className="rounded-fq-md border border-warning bg-warning-soft px-3 py-2 text-sm">
          {t(
            `${failing} endpoint(s) are failing. Deliveries retry with backoff and pause automatically after repeated errors.`,
            `${failing}টি এন্ডপয়েন্ট ব্যর্থ হচ্ছে। ব্যাকঅফসহ রিট্রাই চলছে, বারবার ব্যর্থ হলে স্বয়ংক্রিয়ভাবে পজ হবে।`,
          )}
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-fq-md border border-danger bg-danger-soft px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {secret && (
        <SecretReveal
          secret={secret}
          note={t("Copy this now — it is never shown again.", "এখনই কপি করুন — আর কখনো দেখানো হবে না।")}
          onDismiss={() => setSecret(null)}
          copyLabel={t("Copy", "কপি")}
          closeLabel={t("Close", "বন্ধ")}
        />
      )}

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "apps", label: t("OAuth apps", "OAuth অ্যাপ") },
          { id: "webhooks", label: t("Webhooks", "ওয়েবহুক") },
          { id: "deliveries", label: t("Deliveries", "ডেলিভারি") },
          { id: "docs", label: t("REST & SDK", "REST ও SDK") },
        ]}
      />

      {tab === "apps" && (
        <>
          <SectionCard
            title={t("Register an app", "অ্যাপ রেজিস্টার")}
            hint={t(
              "Authorization code + PKCE only. Confidential apps also get a client secret.",
              "শুধুমাত্র authorization code + PKCE। কনফিডেনশিয়াল অ্যাপ ক্লায়েন্ট সিক্রেটও পাবে।",
            )}
          >
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                void run(
                  () =>
                    saveApp({
                      data: {
                        name: appName,
                        clientType: appType,
                        redirectUris: redirects.split(/\s|,/).map((s) => s.trim()).filter(Boolean),
                        scopes: appScopes,
                      },
                    }),
                  (res) => {
                    const r = res as { clientId: string | null; secret: string | null };
                    setAppName("");
                    setRedirects("");
                    return r.secret ? `client_id=${r.clientId}\nclient_secret=${r.secret}` : r.clientId;
                  },
                );
              }}
            >
              <Field label={t("App name", "অ্যাপের নাম")}>
                <input
                  className={inputClass}
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  required
                  minLength={2}
                />
              </Field>
              <Field label={t("Client type", "ক্লায়েন্ট টাইপ")}>
                <select
                  className={inputClass}
                  value={appType}
                  onChange={(e) => setAppType(e.target.value as "public" | "confidential")}
                >
                  <option value="confidential">confidential</option>
                  <option value="public">public (SPA / mobile)</option>
                </select>
              </Field>
              <Field label={t("Redirect URIs (one per line)", "রিডাইরেক্ট URI (প্রতি লাইনে একটি)")}>
                <textarea
                  className={`${inputClass} min-h-20`}
                  value={redirects}
                  onChange={(e) => setRedirects(e.target.value)}
                  placeholder="https://app.example.com/callback"
                  required
                />
              </Field>
              <fieldset className="space-y-1 text-sm">
                <legend className="font-medium">{t("Scopes", "স্কোপ")}</legend>
                <div className="grid max-h-40 gap-1 overflow-y-auto pr-1">
                  {SCOPE_CATALOG.map((s) => (
                    <label key={s.scope} className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={appScopes.includes(s.scope)}
                        onChange={(e) =>
                          setAppScopes((prev) =>
                            e.target.checked ? [...prev, s.scope] : prev.filter((x) => x !== s.scope),
                          )
                        }
                      />
                      <span>
                        <code className="font-mono text-xs">{s.scope}</code>
                        <span className="block text-xs text-muted-foreground">{t(s.en, s.bn)}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="sm:col-span-2">
                <button className={btnPrimary} disabled={busy || appScopes.length === 0}>
                  {busy ? t("Saving…", "সেভ হচ্ছে…") : t("Create app", "অ্যাপ তৈরি")}
                </button>
              </div>
            </form>
          </SectionCard>

          <SectionCard title={t("Apps", "অ্যাপসমূহ")}>
            {apps.clients.length === 0 ? (
              <EmptyRow>{t("No apps yet.", "এখনো কোনো অ্যাপ নেই।")}</EmptyRow>
            ) : (
              <ul className="space-y-2">
                {apps.clients.map((c) => (
                  <li key={c.id} className="rounded-fq-md border border-border p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">{c.name}</p>
                        <code className="font-mono text-xs text-muted-foreground">{c.client_id}</code>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill label={c.status} tone={c.status === "active" ? "success" : "neutral"} />
                        <button
                          type="button"
                          className="min-h-9 rounded-fq-md border border-border px-3 text-xs"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () => rotateApp({ data: { id: c.id } }),
                              (res) => (res as { secret: string }).secret,
                            )
                          }
                        >
                          {t("Rotate secret", "সিক্রেট রোটেট")}
                        </button>
                        <button
                          type="button"
                          className="min-h-9 rounded-fq-md border border-border px-3 text-xs"
                          disabled={busy}
                          onClick={() =>
                            void run(() =>
                              appStatus({
                                data: { id: c.id, status: c.status === "active" ? "disabled" : "active" },
                              }),
                            )
                          }
                        >
                          {c.status === "active" ? t("Disable", "বন্ধ") : t("Enable", "চালু")}
                        </button>
                      </div>
                    </div>
                    <p className="mt-2 flex flex-wrap gap-1">
                      {(c.scopes as string[]).map((s) => (
                        <code key={s} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                          {s}
                        </code>
                      ))}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("Redirects", "রিডাইরেক্ট")}: {(c.redirect_uris as string[]).join(", ")} ·{" "}
                      {t("Secret rotated", "সিক্রেট রোটেট")}: {fmt(c.secret_rotated_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            title={t("Granted consents", "প্রদত্ত সম্মতি")}
            hint={t(
              "Revoking a consent immediately kills every token in that family.",
              "সম্মতি বাতিল করলে সেই পরিবারের সব টোকেন সঙ্গে সঙ্গে বাতিল হয়।",
            )}
          >
            {apps.consents.length === 0 ? (
              <EmptyRow>{t("No app has been authorised yet.", "এখনো কোনো অ্যাপ অনুমোদিত হয়নি।")}</EmptyRow>
            ) : (
              <ul className="space-y-2 text-sm">
                {apps.consents.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-fq-md border border-border p-3">
                    <span>
                      <code className="font-mono text-xs">{(c.scopes as string[]).join(" ")}</code>
                      <span className="block text-xs text-muted-foreground">
                        {t("Granted", "অনুমোদিত")}: {fmt(c.granted_at)}
                        {c.revoked_at ? ` · ${t("revoked", "বাতিল")} ${fmt(c.revoked_at)}` : ""}
                      </span>
                    </span>
                    {!c.revoked_at && (
                      <button
                        type="button"
                        className="min-h-9 rounded-fq-md border border-border px-3 text-xs"
                        disabled={busy}
                        onClick={() => void run(() => revokeConsent({ data: { consentId: c.id } }))}
                      >
                        {t("Revoke", "বাতিল")}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </>
      )}

      {tab === "webhooks" && (
        <>
          <SectionCard
            title={t("Add an endpoint", "এন্ডপয়েন্ট যোগ")}
            hint={t(
              "HTTPS public hosts only. Payloads are signed; verify before trusting them.",
              "শুধুমাত্র HTTPS পাবলিক হোস্ট। পেলোড সাইনড — বিশ্বাসের আগে যাচাই করুন।",
            )}
          >
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                void run(
                  () => saveHook({ data: { url: hookUrl, description: hookDesc, events: hookEvents } }),
                  (res) => {
                    setHookUrl("");
                    setHookDesc("");
                    return (res as { secret: string | null }).secret;
                  },
                );
              }}
            >
              <Field label="URL">
                <input
                  className={inputClass}
                  value={hookUrl}
                  onChange={(e) => setHookUrl(e.target.value)}
                  placeholder="https://example.com/hooks/framique"
                  required
                />
              </Field>
              <Field label={t("Description", "বর্ণনা")}>
                <input className={inputClass} value={hookDesc} onChange={(e) => setHookDesc(e.target.value)} />
              </Field>
              <fieldset className="space-y-1 text-sm sm:col-span-2">
                <legend className="font-medium">{t("Events", "ইভেন্ট")}</legend>
                <div className="flex flex-wrap gap-3">
                  {WEBHOOK_EVENTS.map((ev) => (
                    <label key={ev} className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={hookEvents.includes(ev)}
                        onChange={(e) =>
                          setHookEvents((prev) => (e.target.checked ? [...prev, ev] : prev.filter((x) => x !== ev)))
                        }
                      />
                      <code className="font-mono text-xs">{ev}</code>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="sm:col-span-2">
                <button className={btnPrimary} disabled={busy || hookEvents.length === 0}>
                  {busy ? t("Saving…", "সেভ হচ্ছে…") : t("Add endpoint", "এন্ডপয়েন্ট যোগ")}
                </button>
              </div>
            </form>
          </SectionCard>

          <SectionCard title={t("Endpoints", "এন্ডপয়েন্ট")}>
            {webhooks.endpoints.length === 0 ? (
              <EmptyRow>{t("No endpoints registered.", "কোনো এন্ডপয়েন্ট নেই।")}</EmptyRow>
            ) : (
              <ul className="space-y-2 text-sm">
                {webhooks.endpoints.map((e) => (
                  <li key={e.id} className="rounded-fq-md border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{e.url}</p>
                        <p className="text-xs text-muted-foreground">
                          {e.description || "—"} · {e.secret_prefix}… ·{" "}
                          {t("last delivery", "শেষ ডেলিভারি")}: {fmt(e.last_delivery_at)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill label={e.status} tone={e.status === "active" ? "success" : e.status === "paused" ? "warning" : "neutral"} />
                        <button
                          type="button"
                          className="min-h-9 rounded-fq-md border border-border px-3 text-xs"
                          disabled={busy}
                          onClick={() => void run(() => testHook({ data: { id: e.id } }))}
                        >
                          {t("Send test", "টেস্ট পাঠান")}
                        </button>
                        <button
                          type="button"
                          className="min-h-9 rounded-fq-md border border-border px-3 text-xs"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () => rotateHook({ data: { id: e.id } }),
                              (res) => (res as { secret: string }).secret,
                            )
                          }
                        >
                          {t("Rotate secret", "সিক্রেট রোটেট")}
                        </button>
                        <button
                          type="button"
                          className="min-h-9 rounded-fq-md border border-border px-3 text-xs"
                          disabled={busy}
                          onClick={() =>
                            void run(() =>
                              hookStatus({
                                data: { id: e.id, status: e.status === "active" ? "paused" : "active" },
                              }),
                            )
                          }
                        >
                          {e.status === "active" ? t("Pause", "পজ") : t("Resume", "চালু")}
                        </button>
                      </div>
                    </div>
                    <p className="mt-2 flex flex-wrap gap-1">
                      {(e.events as string[]).map((ev) => (
                        <code key={ev} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                          {ev}
                        </code>
                      ))}
                    </p>
                    {e.last_error && (
                      <p className="mt-1 text-xs text-danger">
                        {t("Last error", "শেষ ত্রুটি")}: {e.last_error} ({e.failure_count})
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </>
      )}

      {tab === "deliveries" && (
        <SectionCard
          title={t("Delivery log", "ডেলিভারি লগ")}
          hint={t(
            "Retries use exponential backoff and dead-letter after six attempts. Replay re-queues a fresh attempt.",
            "রিট্রাই এক্সপোনেনশিয়াল ব্যাকঅফে চলে, ছয় চেষ্টার পর ডেড-লেটার হয়। রিপ্লে নতুন চেষ্টা কিউ করে।",
          )}
        >
          {webhooks.deliveries.length === 0 ? (
            <EmptyRow>{t("No deliveries yet.", "এখনো কোনো ডেলিভারি নেই।")}</EmptyRow>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">{t("Event", "ইভেন্ট")}</th>
                    <th className="py-2 pr-3">{t("Status", "স্ট্যাটাস")}</th>
                    <th className="py-2 pr-3">{t("Attempt", "চেষ্টা")}</th>
                    <th className="py-2 pr-3">HTTP</th>
                    <th className="py-2 pr-3">{t("Latency", "লেটেন্সি")}</th>
                    <th className="py-2 pr-3">{t("Next attempt", "পরবর্তী চেষ্টা")}</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {webhooks.deliveries.map((d) => (
                    <tr key={d.id} className="border-t border-border">
                      <td className="py-2 pr-3 font-mono text-xs">{d.event_type}</td>
                      <td className="py-2 pr-3">
                        <DeliveryBadge status={d.status} />
                      </td>
                      <td className="py-2 pr-3">{d.attempt}</td>
                      <td className="py-2 pr-3">{d.response_status ?? "—"}</td>
                      <td className="py-2 pr-3">{d.response_ms ? `${d.response_ms}ms` : "—"}</td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">
                        {d.status === "delivered" ? fmt(d.delivered_at) : fmt(d.next_attempt_at)}
                      </td>
                      <td className="py-2">
                        {d.status !== "delivered" && (
                          <button
                            type="button"
                            className="min-h-9 rounded-fq-md border border-border px-3 text-xs"
                            disabled={busy}
                            onClick={() => void run(() => replay({ data: { deliveryId: d.id } }))}
                          >
                            {t("Replay", "রিপ্লে")}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {tab === "docs" && (
        <>
          <SectionCard
            title={t("REST quickstart", "REST কুইকস্টার্ট")}
            hint={t(
              "Base URL /api/public/v1. Writes require an Idempotency-Key; lists are cursor paginated.",
              "বেস URL /api/public/v1। রাইটে Idempotency-Key লাগে; লিস্ট কার্সর পেজিনেটেড।",
            )}
          >
            <CodeBlock
              code={`curl https://\${YOUR_DOMAIN}/api/public/v1/orders?limit=25 \\
  -H "Authorization: Bearer \${TOKEN}"

curl -X POST https://\${YOUR_DOMAIN}/api/public/v1/exports \\
  -H "Authorization: Bearer \${TOKEN}" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -H "Content-Type: application/json" \\
  -d '{"object_type":"orders","format":"csv"}'`}
            />
          </SectionCard>

          <SectionCard title={t("OAuth 2.1 + PKCE", "OAuth 2.1 + PKCE")}>
            <CodeBlock
              code={`# 1. send the merchant to the consent screen
/oauth/authorize?client_id=...&redirect_uri=...&scope=orders.read+products.read
  &code_challenge=<S256>&code_challenge_method=S256&state=<random>

# 2. exchange the code (refresh tokens rotate on every use)
curl -X POST https://\${YOUR_DOMAIN}/api/public/oauth/token \\
  -d grant_type=authorization_code -d code=... -d redirect_uri=... \\
  -d client_id=... -d code_verifier=...`}
            />
          </SectionCard>

          <SectionCard title={t("Verify a webhook", "ওয়েবহুক যাচাই")}>
            <CodeBlock
              code={`// Framique-Signature: t=<unix>,v1=<hex>[,v1=<hex during rotation>]
const [ , ts ] = header.match(/t=(\\d+)/) ?? [];
const expected = hmacSha256(secret, \`\${ts}.\${rawBody}\`);
const fresh = Math.abs(Date.now() / 1000 - Number(ts)) < 300;
if (!fresh || !timingSafeEqual(expected, sigFromHeader)) return res.status(401).end();
res.status(200).end(); // ack fast; process async`}
            />
          </SectionCard>
        </>
      )}
    </div>
  );
}
