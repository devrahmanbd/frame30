/**
 * Phase 4 — merchant-facing custom code panel.
 *
 * Every keystroke is reviewed by the same pure module the server uses, so the
 * merchant sees findings (secrets, XSS patterns, disallowed head tags) before
 * saving. The server re-runs the identical review on save and on publish; the
 * client copy is convenience, never the gate.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import { CUSTOM_CODE_LIMITS, compileCustomCode, type CustomCode, type Finding } from "@/lib/custom-code";
import { customCodeSaveFn, customCodeWorkspaceFn } from "@/lib/custom-code.functions";

type Tab = "css" | "js" | "head" | "bodyStart" | "bodyEnd";

const TABS: Array<{ key: Tab; en: string; bn: string; limitKey: keyof typeof CUSTOM_CODE_LIMITS }> = [
  { key: "css", en: "CSS", bn: "সিএসএস", limitKey: "css" },
  { key: "js", en: "JavaScript", bn: "জাভাস্ক্রিপ্ট", limitKey: "js" },
  { key: "head", en: "Head", bn: "হেড", limitKey: "head" },
  { key: "bodyStart", en: "Body start", bn: "বডি শুরু", limitKey: "body" },
  { key: "bodyEnd", en: "Body end", bn: "বডি শেষ", limitKey: "body" },
];

const EMPTY: CustomCode = {
  css: "",
  js: "",
  head: "",
  bodyStart: "",
  bodyEnd: "",
  jsRequiresConsent: true,
  enabled: false,
};

export function CustomCodeEditor({ themeId }: { themeId: string | null }) {
  const { lang } = useLang();
  const t = (en: string, bn: string) => (lang === "bn" ? bn : en);
  const qc = useQueryClient();
  const load = useServerFn(customCodeWorkspaceFn);
  const save = useServerFn(customCodeSaveFn);

  const [tab, setTab] = useState<Tab>("css");
  const [draft, setDraft] = useState<CustomCode>(EMPTY);
  const [dirty, setDirty] = useState(false);

  const workspace = useQuery({
    queryKey: ["custom-code", themeId],
    queryFn: () => load({ data: { themeId: themeId as string } }),
    enabled: !!themeId,
  });

  useEffect(() => {
    if (workspace.data?.code && !dirty) setDraft(workspace.data.code);
  }, [workspace.data, dirty]);

  const compiled = useMemo(() => compileCustomCode(draft), [draft]);
  const findings: Finding[] = compiled.findings;
  const blocking = findings.some((f) => f.level === "error");

  const mutation = useMutation({
    mutationFn: () => save({ data: { themeId: themeId as string, ...draft } }),
    onSuccess: (result) => {
      setDirty(false);
      void qc.invalidateQueries({ queryKey: ["custom-code", themeId] });
      if (result.blocked) toast.error(t("Saved as draft — fix the errors before publishing.", "খসড়া সংরক্ষিত — প্রকাশের আগে ত্রুটি ঠিক করুন।"));
      else toast.success(t("Custom code saved", "কাস্টম কোড সংরক্ষিত"));
    },
    onError: () => toast.error(t("Could not save custom code", "কাস্টম কোড সংরক্ষণ করা যায়নি")),
  });

  if (!themeId) return null;

  const active = TABS.find((x) => x.key === tab)!;
  const value = String(draft[tab] ?? "");
  const limit = CUSTOM_CODE_LIMITS[active.limitKey];

  const set = <K extends keyof CustomCode>(key: K, next: CustomCode[K]) => {
    setDirty(true);
    setDraft((prev) => ({ ...prev, [key]: next }));
  };

  return (
    <section className="space-y-3 rounded-fq-lg border border-border bg-card p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{t("Custom code", "কাস্টম কোড")}</h2>
          <p className="text-xs text-muted-foreground">
            {t(
              "CSS is scoped to your theme. JavaScript runs after the page loads.",
              "সিএসএস শুধু আপনার থিমে প্রযোজ্য। জাভাস্ক্রিপ্ট পেজ লোডের পরে চলে।",
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={draft.enabled} onChange={(e) => set("enabled", e.target.checked)} />
            {t("Enabled", "সক্রিয়")}
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={draft.jsRequiresConsent}
              onChange={(e) => set("jsRequiresConsent", e.target.checked)}
            />
            {t("JS needs consent", "জেএস-এর সম্মতি লাগবে")}
          </label>
          <button
            type="button"
            disabled={mutation.isPending || !dirty}
            onClick={() => mutation.mutate()}
            className="rounded-fq-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
          >
            {mutation.isPending ? t("Saving…", "সংরক্ষণ হচ্ছে…") : t("Save", "সংরক্ষণ")}
          </button>
        </div>
      </header>

      <div role="tablist" aria-label={t("Custom code slots", "কাস্টম কোড স্লট")} className="flex flex-wrap gap-1">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={`rounded-fq-md px-2 py-1 text-xs ${
              tab === item.key ? "bg-primary text-primary-foreground" : "border border-border"
            }`}
          >
            {t(item.en, item.bn)}
          </button>
        ))}
      </div>

      <textarea
        aria-label={t(active.en, active.bn)}
        rows={14}
        spellCheck={false}
        maxLength={limit}
        value={value}
        onChange={(e) => set(tab, e.target.value as never)}
        className="w-full rounded-fq-md border border-border bg-background p-2 font-mono text-xs"
      />
      <p className="text-[0.65rem] text-muted-foreground">
        {value.length} / {limit}
      </p>

      {findings.length > 0 && (
        <ul className="space-y-1">
          {findings.map((f, i) => (
            <li
              key={`${f.code}-${i}`}
              className={`rounded-fq-md px-3 py-2 text-xs ${
                f.level === "error" ? "bg-danger-soft text-danger-foreground" : "bg-warning-soft text-warning-foreground"
              }`}
            >
              {f.field}: {f.message}
            </li>
          ))}
        </ul>
      )}
      {blocking && (
        <p className="text-xs text-danger-foreground">
          {t("Publishing is blocked until these errors are resolved.", "এই ত্রুটিগুলো ঠিক না হলে প্রকাশ করা যাবে না।")}
        </p>
      )}

      {(workspace.data?.history?.length ?? 0) > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">{t("Published history", "প্রকাশের ইতিহাস")}</summary>
          <ul className="mt-2 space-y-1">
            {workspace.data?.history.map((h) => (
              <li key={h.versionId} className="flex justify-between gap-2 text-muted-foreground">
                <span>{h.publishedAt ? new Date(h.publishedAt).toLocaleString() : "—"}</span>
                <span>v{h.version}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
