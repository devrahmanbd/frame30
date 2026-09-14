import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { StatusPill, Field, inputClass, btnPrimary } from "@/components/admin/MarketingUi";
import { apiKeysListFn, apiKeyCreateFn, apiKeyRevokeFn } from "@/lib/exports.functions";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/settings_/api")({
  loader: () => apiKeysListFn(),
  head: () => ({
    meta: [
      { title: "API keys — Framique admin" },
      { name: "description", content: "Create, scope and revoke merchant API keys for the Framique REST SDK." },
      { property: "og:title", content: "API keys — Framique admin" },
      { property: "og:description", content: "Scoped, hashed API keys with an append-only audit log." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ApiKeysPage,
});

const SCOPES = ["orders.read", "products.write", "analytics.read"] as const;

function ApiKeysPage() {
  const { t } = useLang();
  const { keys, events } = Route.useLoaderData();
  const router = useRouter();
  const createKey = useServerFn(apiKeyCreateFn);
  const revokeKey = useServerFn(apiKeyRevokeFn);

  const [name, setName] = useState("");
  const [env, setEnv] = useState<"test" | "live">("test");
  const [scopes, setScopes] = useState<string[]>(["orders.read"]);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await createKey({
        data: { name, scopes: scopes as (typeof SCOPES)[number][], env },
      });
      setSecret(res.secret);
      setName("");
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create key");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-bangla-display text-xl font-semibold">{t("API keys", "API কী")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("Scoped keys for the SDK and CLI. The secret is shown only once.", "SDK ও CLI-এর জন্য স্কোপড কী। সিক্রেট শুধু একবারই দেখানো হয়।")}
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-fq-md border border-danger bg-danger-soft px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {secret && (
        <div className="space-y-2 rounded-fq-md border border-success bg-success-soft p-4 text-sm">
          <p className="font-medium">{t("The secret will be shown only once — copy it now.", "সিক্রেট একবারই দেখানো হবে — এখনই কপি করুন।")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-fq-md bg-background px-2 py-1 font-mono text-xs">{secret}</code>
            <button
              type="button"
              className={btnPrimary}
              onClick={() => navigator.clipboard.writeText(secret)}
            >
              {t("Copy", "কপি")}
            </button>
            <button
              type="button"
              className="min-h-10 rounded-fq-md border border-border px-3 text-sm"
              onClick={() => setSecret(null)}
            >
              {t("Close", "বন্ধ")}
            </button>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="grid gap-3 rounded-fq-md border border-border bg-card p-4 sm:grid-cols-3">
        <Field label={t("Name", "নাম")}>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
        </Field>
        <Field label={t("Environment", "এনভায়রনমেন্ট")}>
          <select className={inputClass} value={env} onChange={(e) => setEnv(e.target.value as "test" | "live")}>
            <option value="test">test</option>
            <option value="live">live</option>
          </select>
        </Field>
        <fieldset className="space-y-1 text-sm">
          <legend className="font-medium">{t("Scope", "স্কোপ")}</legend>
          {SCOPES.map((s) => (
            <label key={s} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={scopes.includes(s)}
                onChange={(e) =>
                  setScopes((prev) => (e.target.checked ? [...prev, s] : prev.filter((x) => x !== s)))
                }
              />
              <span className="font-mono text-xs">{s}</span>
            </label>
          ))}
        </fieldset>
        <div className="sm:col-span-3">
          <button type="submit" className={btnPrimary} disabled={busy || scopes.length === 0}>
            {busy ? t("Creating…", "তৈরি হচ্ছে…") : t("New key", "নতুন কী")}
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-fq-md border border-border bg-card">
        <table className="w-full text-sm">
          <caption className="sr-only">API keys</caption>
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3">{t("Name", "নাম")}</th>
              <th className="p-3">{t("Prefix", "প্রিফিক্স")}</th>
              <th className="p-3">{t("Scope", "স্কোপ")}</th>
              <th className="p-3">env</th>
              <th className="p-3">{t("Status", "অবস্থা")}</th>
              <th className="p-3">{t("Last used", "শেষ ব্যবহার")}</th>
              <th className="p-3">{t("Action", "অ্যাকশন")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {keys.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-muted-foreground">
                  {t("No keys yet.", "এখনো কোনো কী নেই।")}
                </td>
              </tr>
            )}
            {keys.map((k) => (
              <tr key={k.id}>
                <td className="p-3">{k.name}</td>
                <td className="p-3 font-mono text-xs">{k.prefix}</td>
                <td className="p-3 font-mono text-xs">{(k.scopes as string[]).join(", ")}</td>
                <td className="p-3">
                  <StatusPill label={k.env} tone={k.env === "live" ? "warning" : "neutral"} />
                </td>
                <td className="p-3">
                  <StatusPill label={k.active ? t("Active", "সক্রিয়") : t("Revoked", "বাতিল")} tone={k.active ? "success" : "danger"} />
                </td>
                <td className="p-3 tabular-nums text-xs text-muted-foreground">
                  {k.last_used_at ? new Date(k.last_used_at).toLocaleString("en-GB") : "—"}
                </td>
                <td className="p-3">
                  {k.active && (
                    <button
                      type="button"
                      className="min-h-10 rounded-fq-md border border-danger px-3 text-sm text-danger"
                      onClick={async () => {
                        if (!window.confirm("Revoke this key? It will stop working immediately.")) return;
                        await revokeKey({ data: { keyId: k.id } });
                        await router.invalidate();
                      }}
                    >
                      {t("Revoke", "বাতিল")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="space-y-2">
        <h2 className="font-bangla-display text-sm font-semibold">{t("Key audit", "কী অডিট")}</h2>
        <ul className="divide-y divide-border rounded-fq-md border border-border bg-card text-sm">
          {events.length === 0 && <li className="p-4 text-muted-foreground">{t("No events.", "কোনো ইভেন্ট নেই।")}</li>}
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <span className="font-mono text-xs">{e.action}</span>
              <time className="tabular-nums text-xs text-muted-foreground" dateTime={e.created_at}>
                {new Date(e.created_at).toLocaleString("en-GB")}
              </time>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
