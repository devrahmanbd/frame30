import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import {
  grantStepUpFn,
  recordAuthEventFn,
  recoveryCodeStatusFn,
  regenerateRecoveryCodesFn,
  revokeOtherSessionsFn,
  securityDeskFn,
} from "@/lib/identity.functions";


export const Route = createFileRoute("/_authenticated/admin/settings_/security")({
  head: () => ({
    meta: [
      { title: "Account security — Framique admin" },
      {
        name: "description",
        content:
          "Two-factor authentication, active devices, step-up approval for refunds and payouts, and your recent sign-in activity.",
      },
      { property: "og:title", content: "Account security — Framique" },
      { property: "og:description", content: "2FA, devices and sign-in history for your Framique account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SecurityPage,
});

function SecurityPage() {
  const { t } = useLang();
  const qc = useQueryClient();
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSessionId(data.session ? data.session.access_token.slice(-32) : null);
    });
  }, []);

  const desk = useQuery({
    queryKey: ["security-desk", sessionId],
    queryFn: () => securityDeskFn({ data: { sessionId } }),
  });

  const revoke = useMutation({
    mutationFn: async () => {
      await revokeOtherSessionsFn({ data: { keepSessionId: sessionId } });
      await supabase.auth.signOut({ scope: "others" });
    },
    onSuccess: () => {
      toast.success(t("Other devices signed out.", "অন্য ডিভাইসগুলো সাইন আউট হয়েছে।"));
      void qc.invalidateQueries({ queryKey: ["security-desk"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="font-bangla-display text-xl font-semibold text-foreground">
          {t("Account security", "অ্যাকাউন্ট নিরাপত্তা")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(
            "Two-factor authentication, trusted devices and the audit trail for this account.",
            "দুই-ধাপ যাচাই, বিশ্বস্ত ডিভাইস এবং এই অ্যাকাউন্টের অডিট ট্রেইল।",
          )}
        </p>
      </header>

      <TotpCard />
      <BackupCodesCard />
      <PasswordCard />
      <StepUpCard />


      <Card title={t("Active devices", "সক্রিয় ডিভাইস")}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {t(
              "Every sign-in registers its device. Revoking signs out everywhere except here.",
              "প্রতিটি সাইন-ইন ডিভাইস নিবন্ধন করে। রিভোক করলে এই ডিভাইস ছাড়া সব সাইন আউট হবে।",
            )}
          </p>
          <button
            type="button"
            onClick={() => revoke.mutate()}
            disabled={revoke.isPending}
            aria-busy={revoke.isPending}
            className="min-h-11 shrink-0 rounded-fq-md border border-border px-3 text-sm font-medium text-foreground hover:bg-muted/50 disabled:opacity-60"
          >
            {t("Sign out other devices", "অন্য ডিভাইস সাইন আউট")}
          </button>
        </div>
        <ul className="mt-4 divide-y divide-border text-sm">
          {(desk.data?.sessions ?? []).map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2">
              <span className="text-foreground">
                {s.device ?? t("Unknown device", "অজানা ডিভাইস")}
                {s.current && (
                  <span className="ml-2 rounded-fq-sm bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    {t("this device", "এই ডিভাইস")}
                  </span>
                )}
              </span>
              <span className="tabular-nums text-xs text-muted-foreground">
                {s.revoked_at
                  ? t("revoked", "রিভোকড")
                  : new Date(s.last_seen_at).toLocaleString()}
              </span>
            </li>
          ))}
          {!desk.isPending && (desk.data?.sessions ?? []).length === 0 && (
            <li className="py-2 text-muted-foreground">
              {t("No devices recorded yet.", "এখনো কোনো ডিভাইস নেই।")}
            </li>
          )}
        </ul>
      </Card>

      <Card title={t("Recent activity", "সাম্প্রতিক কার্যক্রম")}>
        <ul className="divide-y divide-border text-sm">
          {(desk.data?.events ?? []).map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 py-2">
              <span className="text-foreground">
                {e.event}
                <span
                  className={`ml-2 text-xs ${e.outcome === "ok" ? "text-muted-foreground" : "text-destructive"}`}
                >
                  {e.outcome}
                </span>
              </span>
              <span className="tabular-nums text-xs text-muted-foreground">
                {new Date(e.created_at).toLocaleString()}
              </span>
            </li>
          ))}
          {!desk.isPending && (desk.data?.events ?? []).length === 0 && (
            <li className="py-2 text-muted-foreground">{t("Nothing logged yet.", "কিছু লগ হয়নি।")}</li>
          )}
        </ul>
      </Card>
    </div>
  );
}

/**
 * Backup codes. Shown once at generation time only — we store fingerprints, so
 * there is no way to re-display them later, and each code works a single time.
 */
function BackupCodesCard() {
  const { t } = useLang();
  const qc = useQueryClient();
  const [codes, setCodes] = useState<string[] | null>(null);

  const status = useQuery({
    queryKey: ["recovery-codes"],
    queryFn: () => recoveryCodeStatusFn(),
  });

  const regen = useMutation({
    mutationFn: () => regenerateRecoveryCodesFn(),
    onSuccess: (res) => {
      setCodes(res.codes);
      void qc.invalidateQueries({ queryKey: ["recovery-codes"] });
      void qc.invalidateQueries({ queryKey: ["security-desk"] });
    },
    onError: (err) =>
      toast.error(
        err instanceof Error && err.message.includes("step_up")
          ? t(
              "Finish the two-step check on this device first, then try again.",
              "আগে এই ডিভাইসে দুই-ধাপ যাচাই সম্পন্ন করুন, তারপর আবার চেষ্টা করুন।",
            )
          : err instanceof Error
            ? err.message
            : "Could not create backup codes",
      ),
  });

  return (
    <Card title={t("Backup codes", "ব্যাকআপ কোড")}>
      <p className="text-sm text-muted-foreground">
        {t(
          "If you lose your phone, a backup code lets you sign in once. Keep them somewhere safe and offline.",
          "ফোন হারালে একটি ব্যাকআপ কোড দিয়ে একবার সাইন ইন করা যায়। এগুলো নিরাপদ জায়গায় রাখুন।",
        )}
      </p>
      <p className="mt-3 text-sm text-foreground">
        {status.isPending
          ? t("Checking…", "দেখা হচ্ছে…")
          : `${status.data?.remaining ?? 0} / ${status.data?.total ?? 0} ${t("codes left", "কোড বাকি")}`}
      </p>
      {codes && (
        <div className="mt-4 rounded-fq-md border border-border bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">
            {t(
              "Copy these now — they will not be shown again.",
              "এখনই কপি করুন — এগুলো আর দেখানো হবে না।",
            )}
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-sm text-foreground">
            {codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(codes.join("\n"));
              toast.success(t("Copied", "কপি হয়েছে"));
            }}
            className="mt-3 min-h-11 rounded-fq-md border border-border px-3 text-sm font-medium text-foreground hover:bg-muted/50"
          >
            {t("Copy all", "সব কপি করুন")}
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => regen.mutate()}
        disabled={regen.isPending}
        aria-busy={regen.isPending}
        className="mt-4 min-h-11 rounded-fq-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
      >
        {(status.data?.total ?? 0) > 0
          ? t("Replace my backup codes", "ব্যাকআপ কোড বদলান")
          : t("Create backup codes", "ব্যাকআপ কোড তৈরি করুন")}
      </button>
    </Card>
  );
}

/** Changing a password while signed in requires the current one. */
function PasswordCard() {
  const { t } = useLang();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 8) {
      return toast.error(
        t("Use at least 8 characters.", "কমপক্ষে ৮টি অক্ষর ব্যবহার করুন।"),
      );
    }
    if (next !== confirm) {
      return toast.error(t("The two passwords do not match.", "দুটি পাসওয়ার্ড মিলছে না।"));
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: next,
        // Required for a signed-in change; omitted only on the recovery page.
        ...({ current_password: current } as { current_password: string }),
      });
      if (error) throw error;
      void recordAuthEventFn({ data: { event: "password.changed", outcome: "ok" } }).catch(
        () => undefined,
      );
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success(t("Password updated.", "পাসওয়ার্ড আপডেট হয়েছে।"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change the password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={t("Change password", "পাসওয়ার্ড বদলান")}>
      <form onSubmit={submit} className="space-y-3">
        {[
          {
            label: t("Current password", "বর্তমান পাসওয়ার্ড"),
            value: current,
            set: setCurrent,
            ac: "current-password",
          },
          {
            label: t("New password", "নতুন পাসওয়ার্ড"),
            value: next,
            set: setNext,
            ac: "new-password",
          },
          {
            label: t("Repeat new password", "নতুন পাসওয়ার্ড আবার"),
            value: confirm,
            set: setConfirm,
            ac: "new-password",
          },
        ].map((f) => (
          <label key={f.label} className="block text-sm">
            <span className="text-muted-foreground">{f.label}</span>
            <input
              type="password"
              autoComplete={f.ac}
              value={f.value}
              onChange={(e) => f.set(e.target.value)}
              required
              className="mt-1 min-h-11 w-full rounded-fq-md border border-border bg-background px-3 text-foreground"
            />
          </label>
        ))}
        <button
          type="submit"
          disabled={busy}
          aria-busy={busy}
          className="min-h-11 rounded-fq-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {t("Update password", "পাসওয়ার্ড আপডেট")}
        </button>
      </form>
    </Card>
  );
}


function TotpCard() {
  const { t } = useLang();
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [enrolled, setEnrolled] = useState<boolean | null>(null);

  async function refresh() {
    const { data } = await supabase.auth.mfa.listFactors();
    setEnrolled((data?.totp?.length ?? 0) > 0);
  }
  useEffect(() => {
    void refresh();
  }, []);

  async function startEnroll() {
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    if (error) return toast.error(error.message);
    setFactorId(data.id);
    setQr(data.totp.qr_code);
    setSecret(data.totp.secret);
  }

  async function confirmEnroll() {
    if (!factorId) return;
    const challenge = await supabase.auth.mfa.challenge({ factorId });
    if (challenge.error) return toast.error(challenge.error.message);
    const verify = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.data.id,
      code: code.trim(),
    });
    if (verify.error) return toast.error(verify.error.message);
    void recordAuthEventFn({ data: { event: "mfa.enrolled", outcome: "ok" } }).catch(() => undefined);
    toast.success(t("Two-factor is on.", "দুই-ধাপ যাচাই চালু হয়েছে।"));
    setQr(null);
    setSecret(null);
    setFactorId(null);
    setCode("");
    void refresh();
  }

  async function disable() {
    const { data } = await supabase.auth.mfa.listFactors();
    const totp = data?.totp?.[0];
    if (!totp) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: totp.id });
    if (error) return toast.error(error.message);
    void recordAuthEventFn({ data: { event: "mfa.unenrolled", outcome: "ok" } }).catch(
      () => undefined,
    );
    toast.success(t("Two-factor removed.", "দুই-ধাপ যাচাই বন্ধ হয়েছে।"));
    void refresh();
  }

  return (
    <Card title={t("Two-factor authentication (TOTP)", "দুই-ধাপ যাচাই (TOTP)")}>
      <p className="text-sm text-muted-foreground">
        {t(
          "Required for refunds, payouts and store deletion. Use any authenticator app.",
          "রিফান্ড, পেআউট ও স্টোর মুছে ফেলার জন্য বাধ্যতামূলক। যেকোনো অথেনটিকেটর অ্যাপ ব্যবহার করুন।",
        )}
      </p>
      {enrolled ? (
        <button
          type="button"
          onClick={disable}
          className="mt-4 min-h-11 rounded-fq-md border border-destructive/40 px-3 text-sm font-medium text-destructive hover:bg-destructive/10"
        >
          {t("Turn off two-factor", "দুই-ধাপ যাচাই বন্ধ")}
        </button>
      ) : qr ? (
        <div className="mt-4 space-y-3">
          <img src={qr} alt={t("Two-factor QR code", "দুই-ধাপ যাচাইয়ের QR কোড")} className="h-40 w-40" />
          <p className="break-all text-xs tabular-nums text-muted-foreground">{secret}</p>
          <input
            value={code}
            inputMode="numeric"
            autoComplete="one-time-code"
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            aria-label={t("Authenticator code", "অথেনটিকেটর কোড")}
            className="min-h-11 w-40 rounded-fq-md border border-border bg-background px-3 text-sm tabular-nums text-foreground"
          />
          <button
            type="button"
            onClick={confirmEnroll}
            className="ml-2 min-h-11 rounded-fq-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {t("Confirm", "নিশ্চিত করুন")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={startEnroll}
          className="mt-4 min-h-11 rounded-fq-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {t("Set up two-factor", "দুই-ধাপ যাচাই সেট আপ")}
        </button>
      )}
    </Card>
  );
}

function StepUpCard() {
  const { t } = useLang();
  const [code, setCode] = useState("");
  const [until, setUntil] = useState<string | null>(null);

  const approve = useMutation({
    mutationFn: async (action: "refund" | "payout") => {
      const { data } = await supabase.auth.mfa.listFactors();
      const totp = data?.totp?.[0];
      if (!totp) throw new Error(t("Enable two-factor first.", "প্রথমে দুই-ধাপ যাচাই চালু করুন।"));
      const challenge = await supabase.auth.mfa.challenge({ factorId: totp.id });
      if (challenge.error) throw challenge.error;
      const verify = await supabase.auth.mfa.verify({
        factorId: totp.id,
        challengeId: challenge.data.id,
        code: code.trim(),
      });
      if (verify.error) throw verify.error;
      return grantStepUpFn({ data: { action } });
    },
    onSuccess: (res) => {
      setUntil(res.expiresAt);
      setCode("");
      toast.success(t("Approval window open.", "অনুমোদনের সময় চালু হয়েছে।"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card title={t("Step-up approval for money actions", "টাকা সংক্রান্ত কাজের অতিরিক্ত অনুমোদন")}>
      <p className="text-sm text-muted-foreground">
        {t(
          "Refunds and payouts each consume one single-use approval, valid for 5 minutes.",
          "প্রতিটি রিফান্ড ও পেআউট একবার ব্যবহারযোগ্য অনুমোদন খরচ করে, ৫ মিনিট বৈধ।",
        )}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={code}
          inputMode="numeric"
          autoComplete="one-time-code"
          onChange={(e) => setCode(e.target.value)}
          placeholder="123456"
          aria-label={t("Authenticator code", "অথেনটিকেটর কোড")}
          className="min-h-11 w-40 rounded-fq-md border border-border bg-background px-3 text-sm tabular-nums text-foreground"
        />
        <button
          type="button"
          onClick={() => approve.mutate("refund")}
          disabled={approve.isPending}
          className="min-h-11 rounded-fq-md border border-border px-3 text-sm font-medium text-foreground hover:bg-muted/50 disabled:opacity-60"
        >
          {t("Approve refunds", "রিফান্ড অনুমোদন")}
        </button>
        <button
          type="button"
          onClick={() => approve.mutate("payout")}
          disabled={approve.isPending}
          className="min-h-11 rounded-fq-md border border-border px-3 text-sm font-medium text-foreground hover:bg-muted/50 disabled:opacity-60"
        >
          {t("Approve payouts", "পেআউট অনুমোদন")}
        </button>
      </div>
      {until && (
        <p role="status" aria-live="polite" className="mt-3 text-sm text-foreground">
          {t("Valid until", "বৈধ")} <span className="tabular-nums">{new Date(until).toLocaleTimeString()}</span>
        </p>
      )}
    </Card>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-fq-lg border border-border bg-card p-5">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}
