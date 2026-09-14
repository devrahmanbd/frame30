import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { btnGhost, btnPrimary, inputClass } from "@/components/admin/MarketingUi";
import { SectionCard } from "@/components/admin/DeveloperUi";
import {
  GateChecks,
  InlineAlert,
  Pill,
  ProgressBar,
  credentialTone,
} from "@/components/admin/FinanceUi";
import {
  currencyConsentFn,
  currencyModeFn,
  currencyStateFn,
  providerSaveEvidenceFn,
  providerSaveSecretsFn,
  providerSubmitFn,
  providersListFn,
} from "@/lib/finance.functions";
import { useLang } from "@/lib/i18n";
import { UNOFFICIAL_BADGE, isCommunityPlugin, pluginNotice } from "@/lib/payment-plugins";


export const Route = createFileRoute("/_authenticated/admin/settings_/providers")({
  loader: async () => ({
    providers: await providersListFn(),
    currency: await currencyStateFn(),
  }),
  head: () => ({
    meta: [
      { title: "Payment rails & sign-off — Framique admin" },
      {
        name: "description",
        content:
          "Submit live bKash, Nagad, BEFTN and card credentials for review, track sign-off status and manage the USD pilot gate.",
      },
      { property: "og:title", content: "Payment rails & sign-off — Framique admin" },
      {
        property: "og:description",
        content: "Provider evidence, sealed credentials, review status and the USD pilot gate in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProvidersPage,
});

type ProviderList = Awaited<ReturnType<typeof providersListFn>>;
type CurrencyState = Awaited<ReturnType<typeof currencyStateFn>>;
type LoaderData = { providers: ProviderList; currency: CurrencyState };
type Credential = ProviderList["credentials"][number];

function ProvidersPage() {
  const { t, lang } = useLang();
  const initial = Route.useLoaderData() as LoaderData;
  const [providers, setProviders] = useState<ProviderList>(initial.providers);
  const [currency, setCurrency] = useState<CurrencyState>(initial.currency);
  const [open, setOpen] = useState<string | null>(initial.providers.credentials[0]?.provider ?? null);
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const saveEvidence = useServerFn(providerSaveEvidenceFn);
  const saveSecrets = useServerFn(providerSaveSecretsFn);
  const submit = useServerFn(providerSubmitFn);
  const consent = useServerFn(currencyConsentFn);
  const setMode = useServerFn(currencyModeFn);

  const message = (code: string) =>
    ({
      "provider.forbidden": t("You do not have permission for this.", "আপনার অনুমতি নেই।"),
      "provider.locked_for_review": t(
        "This rail is locked while under review.",
        "রিভিউ চলাকালীন এটি সম্পাদনা করা যাবে না।",
      ),
      "provider.submission_incomplete": t(
        "Complete every evidence item and save all secrets first.",
        "সব ডকুমেন্ট ও সিক্রেট আগে সম্পূর্ণ করুন।",
      ),
      "provider.no_secrets": t("Enter at least one credential.", "অন্তত একটি ক্রেডেনশিয়াল দিন।"),
      "currency.gate_denied": t(
        "The USD pilot gate is not satisfied yet.",
        "ইউএসডি পাইলট শর্ত এখনো পূরণ হয়নি।",
      ),
    })[code] ??
    t("Something went wrong. Please try again.", "কিছু ভুল হয়েছে। আবার চেষ্টা করুন।");

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      setError(message(err instanceof Error ? err.message : ""));
    } finally {
      setBusy(null);
    }
  }

  function toggleEvidence(cred: Credential, key: string, value: boolean) {
    void run(`evidence:${cred.provider}`, async () => {
      const next = await saveEvidence({
        data: { provider: cred.provider, checklist: { [key]: value } },
      });
      setProviders(next);
      setNotice(t("Evidence saved.", "ডকুমেন্ট সংরক্ষিত হয়েছে।"));
    });
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{t("Payment rails", "পেমেন্ট রেইল")}</h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Live money rails need a signed-off credential pack. Submit evidence and secrets here — the Framique payments team reviews and activates them.",
            "লাইভ পেমেন্ট চালু করতে ডকুমেন্ট ও ক্রেডেনশিয়াল জমা দিন — ফ্রেমিক পেমেন্ট টিম রিভিউ করে চালু করবে।",
          )}
        </p>
      </header>

      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      {notice && <InlineAlert tone="success">{notice}</InlineAlert>}

      <div className="space-y-3">
        {providers.credentials.map((cred) => {
          const isOpen = open === cred.provider;
          return (
            <section key={cred.provider} className="rounded-fq-md border border-border bg-card">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : cred.provider)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-3 p-4 text-left"
              >
                <span className="space-y-1">
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{cred.label}</span>
                    <Pill tone={credentialTone(cred.state)}>{cred.state.replace(/_/g, " ")}</Pill>
                    {isCommunityPlugin(cred.provider) && (
                      <Pill tone="warning">{t(UNOFFICIAL_BADGE.en, UNOFFICIAL_BADGE.bn)}</Pill>
                    )}

                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {cred.regulatory} · {t("Settlement", "সেটেলমেন্ট")} T+{cred.settlementDays}
                  </span>
                </span>
                <span className="w-40 shrink-0">
                  <ProgressBar
                    done={cred.progress.done}
                    total={cred.progress.total}
                    label={t("Evidence", "ডকুমেন্ট")}
                  />
                </span>
              </button>

              {isOpen && (
                <div className="space-y-4 border-t border-border p-4">
                  {isCommunityPlugin(cred.provider) && (
                    <InlineAlert tone="warning">
                      {pluginNotice(cred.provider, lang === "bn" ? "bn" : "en")}
                    </InlineAlert>
                  )}

                  <SectionCard title={t("Evidence pack", "ডকুমেন্ট প্যাক")}>
                    <ul className="space-y-2">
                      {cred.requires.map((key) => (
                        <li key={key} className="flex items-center gap-2 text-sm">
                          <input
                            id={`${cred.provider}-${key}`}
                            type="checkbox"
                            className="h-4 w-4 rounded border-border"
                            checked={Boolean(cred.checklist[key])}
                            disabled={busy !== null || !["draft", "changes_requested", "rejected"].includes(cred.state)}
                            onChange={(e) => toggleEvidence(cred, key, e.target.checked)}
                          />
                          <label htmlFor={`${cred.provider}-${key}`}>
                            {key.replace(/_/g, " ")}
                          </label>
                        </li>
                      ))}
                    </ul>
                  </SectionCard>

                  <SectionCard
                    title={t("Live credentials", "লাইভ ক্রেডেনশিয়াল")}
                    hint={t(
                      "Encrypted at rest and never shown again — only the last characters are kept as a hint.",
                      "এনক্রিপ্ট করে সংরক্ষণ হয়, আর দেখানো হয় না — শুধু শেষ কয়েকটি অক্ষর দেখা যায়।",
                    )}
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      {cred.secretFields.map((field) => (
                        <label key={field} className="space-y-1 text-sm">
                          <span className="block text-xs text-muted-foreground">
                            {field}
                            {cred.secretHints[field] ? ` · ${cred.secretHints[field]}` : ""}
                          </span>
                          <input
                            type="password"
                            autoComplete="off"
                            className={inputClass}
                            value={secrets[`${cred.provider}:${field}`] ?? ""}
                            onChange={(e) =>
                              setSecrets((s) => ({ ...s, [`${cred.provider}:${field}`]: e.target.value }))
                            }
                          />
                        </label>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={btnGhost}
                        disabled={busy !== null}
                        onClick={() =>
                          void run(`secrets:${cred.provider}`, async () => {
                            const payload: Record<string, string> = {};
                            for (const field of cred.secretFields) {
                              const value = secrets[`${cred.provider}:${field}`];
                              if (value) payload[field] = value;
                            }
                            const next = await saveSecrets({
                              data: { provider: cred.provider, secrets: payload },
                            });
                            setProviders(next);
                            setSecrets({});
                            setNotice(t("Credentials sealed and saved.", "ক্রেডেনশিয়াল সংরক্ষিত হয়েছে।"));
                          })
                        }
                      >
                        {t("Save credentials", "ক্রেডেনশিয়াল সেভ")}
                      </button>
                      <button
                        type="button"
                        className={btnPrimary}
                        disabled={
                          busy !== null ||
                          !["draft", "changes_requested", "rejected"].includes(cred.state) ||
                          cred.missing.evidence.length > 0 ||
                          cred.missing.secrets.length > 0
                        }
                        onClick={() =>
                          void run(`submit:${cred.provider}`, async () => {
                            const next = await submit({ data: { provider: cred.provider } });
                            setProviders(next);
                            setNotice(t("Submitted for review.", "রিভিউয়ের জন্য জমা হয়েছে।"));
                          })
                        }
                      >
                        {t("Submit for review", "রিভিউয়ে জমা দিন")}
                      </button>
                    </div>
                    {(cred.missing.evidence.length > 0 || cred.missing.secrets.length > 0) && (
                      <p className="text-xs text-muted-foreground">
                        {t("Still needed:", "এখনো দরকার:")}{" "}
                        {[...cred.missing.evidence, ...cred.missing.secrets].join(", ")}
                      </p>
                    )}
                    {cred.decisionNote && (
                      <InlineAlert tone={cred.state === "changes_requested" ? "warning" : "info"}>
                        {cred.decisionNote}
                      </InlineAlert>
                    )}
                  </SectionCard>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <SectionCard
        title={t("USD pilot", "ইউএসডি পাইলট")}
        hint={t(
          "Selling in USD is opt-in and gated. Every check below must pass, and the gate is re-evaluated on each visit.",
          "ইউএসডিতে বিক্রি ঐচ্ছিক ও শর্তসাপেক্ষ। নিচের সব শর্ত পূরণ হতে হবে।",
        )}
        actions={<Pill tone={currency.effectiveMode === "usd_enabled" ? "success" : "neutral"}>{currency.effectiveMode.replace(/_/g, " ")}</Pill>}
      >
        <GateChecks checks={currency.verdict.checks} />
        <p className="text-xs text-muted-foreground">
          {t("FX rate", "এফএক্স রেট")}: {currency.fx.rate ? currency.fx.rate.toFixed(4) : "—"}{" "}
          {currency.fx.ageSeconds !== null
            ? `· ${Math.floor(currency.fx.ageSeconds / 3600)}h ${t("old", "পুরনো")}`
            : `· ${t("no feed", "ফিড নেই")}`}
          {currency.fx.driftAlert ? ` · ${t("drift alert", "ড্রিফট সতর্কতা")}` : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          {!currency.consentAt && (
            <button
              type="button"
              className={btnGhost}
              disabled={busy !== null}
              onClick={() =>
                void run("consent", async () => {
                  setCurrency(await consent({}));
                  setNotice(t("Consent recorded.", "সম্মতি সংরক্ষিত হয়েছে।"));
                })
              }
            >
              {t("Record owner consent", "মালিকের সম্মতি দিন")}
            </button>
          )}
          <button
            type="button"
            className={btnPrimary}
            disabled={busy !== null || !currency.verdict.allowed || currency.mode === "usd_enabled"}
            onClick={() =>
              void run("usd", async () => {
                const staged =
                  currency.mode === "bdt_locked"
                    ? await setMode({ data: { mode: "pilot_assessing" } })
                    : currency;
                setCurrency(staged);
                setCurrency(await setMode({ data: { mode: "usd_enabled" } }));
                setNotice(t("USD pilot enabled.", "ইউএসডি পাইলট চালু হয়েছে।"));
              })
            }
          >
            {t("Enable USD pilot", "ইউএসডি পাইলট চালু")}
          </button>
          {currency.mode !== "bdt_locked" && (
            <button
              type="button"
              className={btnGhost}
              disabled={busy !== null}
              onClick={() =>
                void run("lock", async () => {
                  setCurrency(await setMode({ data: { mode: "bdt_locked" } }));
                  setNotice(t("Store is BDT-locked.", "স্টোর বিডিটি-তে ফিরেছে।"));
                })
              }
            >
              {t("Return to BDT", "বিডিটিতে ফিরুন")}
            </button>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
