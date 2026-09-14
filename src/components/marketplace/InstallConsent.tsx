import { useMemo, useState } from "react";
import { SCOPES, highestRisk, scopeDef } from "@/lib/marketplace-scopes";
import { useLang } from "@/lib/i18n";

/**
 * Install consent screen. Nothing is installed until the merchant grants every
 * scope the pinned version declares — the server re-checks the same rule.
 */
export type ConsentVersion = {
  id: string;
  version: string;
  scopes: string[];
  changelog: string | null;
  content_hash: string;
  size_bytes: number;
};

const RISK_STYLE: Record<string, string> = {
  low: "border-border text-muted-foreground",
  medium: "border-warning/50 bg-warning/10",
  high: "border-destructive/50 bg-destructive/10 text-destructive",
};

export function InstallConsent({
  listingName,
  version,
  trial,
  busy,
  onCancel,
  onApprove,
}: {
  listingName: string;
  version: ConsentVersion | null;
  trial: boolean;
  busy: boolean;
  onCancel: () => void;
  onApprove: (versionId: string | null, scopes: string[]) => void;
}) {
  const { t } = useLang();
  const required = version?.scopes ?? [];
  const [granted, setGranted] = useState<string[]>([]);
  const missing = useMemo(() => required.filter((s) => !granted.includes(s)), [required, granted]);
  const risk = highestRisk(required);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("Review permissions", "অনুমতি পর্যালোচনা")}
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4"
    >
      <div className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-fq-lg border border-border bg-card p-5">
        <h2 className="font-bangla-display text-lg font-semibold">
          {t("Install", "ইনস্টল")} {listingName}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {version
            ? `v${version.version} · ${(version.size_bytes / 1024).toFixed(1)} KB · ${version.content_hash.slice(0, 12)}…`
            : t("No published version pinned — legacy install.", "কোনো প্রকাশিত সংস্করণ নেই — লিগ্যাসি ইনস্টল।")}
        </p>

        {version?.changelog && (
          <p className="mt-3 rounded-fq-md border border-border bg-muted p-3 text-sm">{version.changelog}</p>
        )}

        {required.length === 0 ? (
          <p className="mt-4 text-sm">
            {t("This extension requests no permissions.", "এই এক্সটেনশন কোনো অনুমতি চায় না।")}
          </p>
        ) : (
          <>
            <p className={`mt-4 rounded-fq-md border p-2 text-xs ${RISK_STYLE[risk]}`}>
              {t("Highest risk requested:", "সর্বোচ্চ ঝুঁকি:")} {risk}
            </p>
            <ul className="mt-3 space-y-2">
              {required.map((id) => {
                const def = scopeDef(id) ?? SCOPES[0];
                const on = granted.includes(id);
                return (
                  <li key={id} className={`rounded-fq-md border p-3 text-sm ${RISK_STYLE[def.risk]}`}>
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          setGranted((g) => (on ? g.filter((s) => s !== id) : [...g, id]))
                        }
                        className="mt-1 size-4"
                      />
                      <span>
                        <span className="font-medium">{t(def.en, def.bn)}</span>
                        <span className="block text-xs opacity-80">{t(def.effectEn, def.effectBn)}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={() => setGranted(required)}
              className="mt-2 text-xs underline"
            >
              {t("Grant all", "সব অনুমতি দিন")}
            </button>
          </>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || missing.length > 0}
            onClick={() => onApprove(version?.id ?? null, granted)}
            className="min-h-11 rounded-fq-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {trial ? t("Approve & start trial", "অনুমতি দিয়ে ট্রায়াল") : t("Approve & install", "অনুমতি দিয়ে ইনস্টল")}
          </button>
          <button type="button" onClick={onCancel} className="min-h-11 rounded-fq-md border border-border px-4 text-sm">
            {t("Cancel", "বাতিল")}
          </button>
          {missing.length > 0 && (
            <span className="self-center text-xs text-muted-foreground">
              {t("Grant every permission to continue.", "চালিয়ে যেতে সব অনুমতি দিন।")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
