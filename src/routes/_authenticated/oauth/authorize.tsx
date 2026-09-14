import { useEffect, useState } from "react";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { btnPrimary } from "@/components/admin/MarketingUi";
import { oauthAuthorizeDescribeFn, oauthAuthorizeGrantFn } from "@/lib/developers.functions";
import { parseScopes } from "@/lib/api-scopes";
import { useLang } from "@/lib/i18n";

/**
 * OAuth consent screen. Sits under `_authenticated`, so an unauthenticated
 * merchant is sent to sign in first and returns here. The grant only happens on
 * an explicit click — never on page load.
 */
export const Route = createFileRoute("/_authenticated/oauth/authorize")({
  validateSearch: (search: Record<string, unknown>) => ({
    client_id: String(search["client_id"] ?? ""),
    redirect_uri: String(search["redirect_uri"] ?? ""),
    scope: String(search["scope"] ?? ""),
    code_challenge: String(search["code_challenge"] ?? ""),
    code_challenge_method: String(search["code_challenge_method"] ?? "S256"),
    state: search["state"] ? String(search["state"]) : null,
  }),
  head: () => ({
    meta: [
      { title: "Authorize app — Framique" },
      { name: "description", content: "Review the data an app is requesting before granting access to your store." },
      { property: "og:title", content: "Authorize app — Framique" },
      { property: "og:description", content: "Explicit, scope-by-scope consent for third-party apps." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthorizePage,
});

function AuthorizePage() {
  const { t } = useLang();
  const search = useSearch({ from: "/_authenticated/oauth/authorize" });
  const describe = useServerFn(oauthAuthorizeDescribeFn);
  const grant = useServerFn(oauthAuthorizeGrantFn);
  const [info, setInfo] = useState<{ appName: string; granted: string[]; refused: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const payload = {
    clientId: search.client_id,
    redirectUri: search.redirect_uri,
    scopes: parseScopes(search.scope.split(/[\s+]+/)),
    codeChallenge: search.code_challenge,
    codeChallengeMethod: search.code_challenge_method,
    state: search.state,
  };

  useEffect(() => {
    let cancelled = false;
    describe({ data: payload })
      .then((res) => {
        if (!cancelled) setInfo(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "invalid_request");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.client_id, search.scope, search.redirect_uri]);

  async function allow() {
    setBusy(true);
    setError(null);
    try {
      const res = await grant({ data: payload });
      window.location.assign(res.redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "grant_failed");
      setBusy(false);
    }
  }

  function deny() {
    const url = new URL(search.redirect_uri);
    url.searchParams.set("error", "access_denied");
    if (search.state) url.searchParams.set("state", search.state);
    window.location.assign(url.toString());
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-lg items-center px-4 py-10">
      <div className="w-full space-y-4 rounded-fq-md border border-border bg-card p-6">
        <h1 className="font-bangla-display text-lg font-semibold">
          {t("Authorize application", "অ্যাপ অনুমোদন")}
        </h1>

        {error && (
          <p role="alert" className="rounded-fq-md border border-danger bg-danger-soft px-3 py-2 text-sm">
            {error}
          </p>
        )}

        {!info && !error && <p className="text-sm text-muted-foreground">{t("Loading…", "লোড হচ্ছে…")}</p>}

        {info && (
          <>
            <p className="text-sm">
              <strong>{info.appName}</strong>{" "}
              {t("is requesting access to your store data:", "আপনার স্টোর ডেটায় অ্যাক্সেস চাইছে:")}
            </p>
            <ul className="space-y-1 text-sm">
              {info.granted.map((s) => (
                <li key={s} className="rounded-fq-md border border-border px-3 py-2 font-mono text-xs">
                  {s}
                </li>
              ))}
            </ul>
            {info.refused.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("Not granted (outside the app's allowlist):", "অনুমোদিত নয় (অ্যাপের তালিকার বাইরে):")}{" "}
                {info.refused.join(", ")}
              </p>
            )}
            <div className="flex gap-2 pt-2">
              <button type="button" className={btnPrimary} disabled={busy} onClick={() => void allow()}>
                {busy ? t("Authorizing…", "অনুমোদন হচ্ছে…") : t("Allow", "অনুমতি দিন")}
              </button>
              <button
                type="button"
                className="min-h-10 rounded-fq-md border border-border px-3 text-sm"
                onClick={deny}
              >
                {t("Deny", "প্রত্যাখ্যান")}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                "You can revoke this access any time from Admin → Developer platform.",
                "যেকোনো সময় অ্যাডমিন → ডেভেলপার প্ল্যাটফর্ম থেকে অ্যাক্সেস বাতিল করতে পারবেন।",
              )}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
