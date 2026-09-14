import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { recordAuthEventFn } from "@/lib/identity.functions";

/**
 * Recovery landing page. Supabase signs the visitor in with a short-lived
 * recovery session when they follow the emailed link, so this page must exist:
 * without it the link silently logs someone in and never changes the password.
 * A recovery session is exempt from the current-password requirement, so this
 * form asks only for the new password (twice).
 */
export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Choose a new password — Framique" },
      {
        name: "description",
        content:
          "Set a new password for your Framique account after following the recovery link sent to your email.",
      },
      { property: "og:title", content: "Choose a new password — Framique" },
      { property: "og:description", content: "Finish account recovery for your Framique account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { t } = useLang();
  const navigate = useNavigate();
  const [ready, setReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // The link may arrive as a hash fragment that the client library still has
    // to exchange, so wait for the auth state to settle before judging it.
    let cancelled = false;
    const settle = (has: boolean) => {
      if (!cancelled) setReady(has);
    };
    void supabase.auth.getSession().then(({ data }) => settle(Boolean(data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) settle(true);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error(t("The two passwords do not match.", "দুই পাসওয়ার্ড মেলেনি।"));
      return;
    }
    if (password.length < 8) {
      toast.error(
        t("Use at least 8 characters.", "কমপক্ষে ৮টি অক্ষর ব্যবহার করুন।"),
      );
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      void recordAuthEventFn({ data: { event: "password.changed", outcome: "ok" } }).catch(
        () => undefined,
      );
      setDone(true);
      toast.success(t("Password updated.", "পাসওয়ার্ড বদলানো হয়েছে।"));
      // Force a fresh sign-in with the new password on every device.
      await supabase.auth.signOut();
      navigate({ to: "/auth", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-sm rounded-fq-lg border border-border bg-card p-6 shadow-sm">
        <h1 className="font-bangla-display text-xl font-semibold text-foreground">
          {t("Choose a new password", "নতুন পাসওয়ার্ড দিন")}
        </h1>

        {ready === false && !done ? (
          <>
            <p className="mt-3 text-sm text-muted-foreground">
              {t(
                "This recovery link is missing or has expired. Ask for a new one from the sign-in page.",
                "এই রিকভারি লিংকটি নেই বা সময় শেষ হয়ে গেছে। সাইন-ইন পাতা থেকে নতুন লিংক নিন।",
              )}
            </p>
            <button
              type="button"
              onClick={() => navigate({ to: "/auth" })}
              className="mt-4 min-h-11 w-full rounded-fq-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted/50"
            >
              {t("Back to sign in", "সাইন-ইনে ফিরুন")}
            </button>
          </>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-foreground">
                {t("New password", "নতুন পাসওয়ার্ড")}
              </span>
              <input
                type="password"
                value={password}
                required
                minLength={8}
                autoComplete="new-password"
                onChange={(e) => setPassword(e.target.value)}
                className="min-h-11 w-full rounded-fq-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-foreground">
                {t("Repeat new password", "নতুন পাসওয়ার্ড আবার")}
              </span>
              <input
                type="password"
                value={confirm}
                required
                minLength={8}
                autoComplete="new-password"
                onChange={(e) => setConfirm(e.target.value)}
                className="min-h-11 w-full rounded-fq-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              />
            </label>
            <button
              type="submit"
              disabled={busy || ready === null}
              aria-busy={busy}
              className="min-h-11 w-full rounded-fq-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "…" : t("Save new password", "নতুন পাসওয়ার্ড সেভ করুন")}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
