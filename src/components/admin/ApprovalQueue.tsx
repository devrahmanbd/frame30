/**
 * Threat-defense — security approvals queue (presentational).
 *
 * Lists flagged theme drafts + flagged plugin manifests with no matching
 * approval audit (the `approvalQueueFn` shape). Each row names the item, its
 * version and the finding codes; Approve records explicit merchant approval
 * through the existing `themeApproveFn` / `pluginApproveFn` (wired by the
 * `security-approvals` route, so this file stays server-fn free and
 * static-markup testable). Bilingual via `useLang`, following the
 * InstalledApps / PluginApprovalBadge convention.
 */
import { btnPrimary } from "@/components/admin/MarketingUi";
import { useLang } from "@/lib/i18n";

export type SecurityApprovalTheme = {
  themeId: string;
  themeName: string;
  versionId: string;
  findings: { code: string }[];
};

export type SecurityApprovalPlugin = {
  pluginId: string;
  name: string;
  manifestVersion: string;
  findings: { code: string }[];
};

function FindingCodes({ findings }: { findings: { code: string }[] }) {
  const { t } = useLang();
  if (findings.length === 0) return null;
  return (
    <span className="text-xs text-muted-foreground">
      {t("Findings", "ফাইন্ডিংস")}:{" "}
      {findings.map((finding) => finding.code).join(", ")}
    </span>
  );
}

export function ApprovalQueue({
  themes,
  plugins,
  busy,
  onApproveTheme,
  onApprovePlugin,
}: {
  themes: SecurityApprovalTheme[];
  plugins: SecurityApprovalPlugin[];
  /** Row key (`themeId` / `pluginId`) of the in-flight approval, if any. */
  busy?: string | null;
  onApproveTheme: (themeId: string, versionId: string) => void;
  onApprovePlugin: (pluginId: string, manifestVersion: string) => void;
}) {
  const { t } = useLang();

  if (themes.length === 0 && plugins.length === 0) {
    return (
      <p className="rounded-fq-md border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
        {t(
          "No pending approvals. Flagged themes and plugins will appear here.",
          "কোনো অপেক্ষমাণ অনুমোদন নেই। ফ্ল্যাগ করা থিম ও প্লাগইন এখানে দেখা যাবে।",
        )}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {themes.length > 0 ? (
        <section className="rounded-fq-md border border-border bg-card">
          <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">
            {t("Themes waiting for approval", "অনুমোদনের অপেক্ষায় থাকা থিম")} (
            {themes.length})
          </h2>
          <ul className="divide-y divide-border">
            {themes.map((theme) => (
              <li
                key={theme.themeId}
                className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm"
              >
                <span className="font-medium">{theme.themeName}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {t("Version", "সংস্করণ")} {theme.versionId}
                </span>
                <FindingCodes findings={theme.findings} />
                <button
                  type="button"
                  className={`${btnPrimary} ml-auto`}
                  disabled={busy === theme.themeId}
                  onClick={() => onApproveTheme(theme.themeId, theme.versionId)}
                >
                  {busy === theme.themeId
                    ? t("Approving…", "অনুমোদন হচ্ছে…")
                    : t("Approve", "অনুমোদন করুন")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {plugins.length > 0 ? (
        <section className="rounded-fq-md border border-border bg-card">
          <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">
            {t(
              "Plugins waiting for approval",
              "অনুমোদনের অপেক্ষায় থাকা প্লাগইন",
            )}{" "}
            ({plugins.length})
          </h2>
          <ul className="divide-y divide-border">
            {plugins.map((plugin) => (
              <li
                key={plugin.pluginId}
                className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm"
              >
                <span className="font-medium">{plugin.name}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {t("Version", "সংস্করণ")} {plugin.manifestVersion}
                </span>
                <FindingCodes findings={plugin.findings} />
                <button
                  type="button"
                  className={`${btnPrimary} ml-auto`}
                  disabled={busy === plugin.pluginId}
                  onClick={() =>
                    onApprovePlugin(plugin.pluginId, plugin.manifestVersion)
                  }
                >
                  {busy === plugin.pluginId
                    ? t("Approving…", "অনুমোদন হচ্ছে…")
                    : t("Approve", "অনুমোদন করুন")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
