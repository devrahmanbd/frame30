import { useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import { pluginListFn, pluginSettingsSaveFn, pluginToggleFn } from "@/lib/plugins.functions";
import { marketUninstallWidgetFn } from "@/lib/marketplace.functions";
import { satisfiesApiRange, type SettingsValues } from "@/lib/plugin-manifest";
import { PluginSettingsForm } from "./PluginSettingsForm";
import { ConfirmDialog } from "@/components/console/kit";

type InstallRef = { id: string; listing_slug: string; status: string };

/** Phase 5 — merchant-facing app list with core-rendered settings forms. */
export function InstalledApps({ installs = [] }: { installs?: InstallRef[] }) {
  const { t } = useLang();
  const qc = useQueryClient();
  const router = useRouter();
  const list = useServerFn(pluginListFn);
  const save = useServerFn(pluginSettingsSaveFn);
  const toggle = useServerFn(pluginToggleFn);
  const uninstall = useServerFn(marketUninstallWidgetFn);
  const [pendingDelete, setPendingDelete] = useState<{ installId: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const plugins = useQuery({
    queryKey: ["admin", "plugins"],
    queryFn: () => list({}),
    staleTime: 30_000,
  });

  const items = plugins.data?.plugins ?? [];
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin", "plugins"] });
    void router.invalidate();
  };
  const liveInstallFor = (pluginId: string) =>
    installs.find((i) => i.listing_slug === pluginId && isLiveStatus(i.status));

  async function onSave(pluginId: string, values: SettingsValues) {
    try {
      await save({ data: { pluginId, values } });
      toast.success(t("Settings saved", "সেটিং সেভ হয়েছে"));
      refresh();
    } catch {
      toast.error(t("Could not save settings", "সেটিং সেভ করা যায়নি"));
    }
  }

  async function onDelete() {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await uninstall({ data: { installId: pendingDelete.installId } });
      toast.success(t("App deleted", "অ্যাপ মুছে ফেলা হয়েছে"));
      setPendingDelete(null);
      refresh();
    } catch {
      toast.error(t("Could not delete app", "অ্যাপ মোছা যায়নি"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bangla-display text-lg font-semibold">{t("Apps", "অ্যাপ")}</h2>
        <Link
          to="/dashboard/marketplace"
          search={{ tab: "widget" }}
          className="min-h-11 rounded-fq-md border border-border px-3 text-sm inline-flex items-center"
        >
          {t("Add new", "নতুন যোগ করুন")}
        </Link>
      </div>
      {items.length === 0 && (
        <p className="rounded-fq-md border border-border bg-card p-4 text-sm text-muted-foreground">
          {t("No apps installed yet.", "এখনো কোনো অ্যাপ ইনস্টল করা হয়নি।")}
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((plugin) => {
          const compatible = satisfiesApiRange(plugin.manifest.api);
          const install = liveInstallFor(plugin.manifest.id);
          return (
            <article
              key={plugin.manifest.id}
              className="rounded-fq-lg border border-border bg-card p-4"
            >
              {!compatible && (
                <p className="mb-3 rounded-fq-md bg-muted p-2 text-xs text-muted-foreground">
                  {t(
                    "This app needs an update before its blocks will render.",
                    "এই অ্যাপ আপডেট না করলে এর ব্লক দেখাবে না।",
                  )}
                </p>
              )}
              <PluginSettingsForm
                plugin={plugin}
                onSave={(values) => onSave(plugin.manifest.id, values)}
                onToggle={async (enabled) => {
                  await toggle({ data: { pluginId: plugin.manifest.id, enabled } });
                  refresh();
                }}
              />
              {install && (
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      setPendingDelete({ installId: install.id, name: plugin.manifest.name })
                    }
                    className="min-h-11 rounded-fq-md border border-destructive/40 px-3 text-sm text-destructive disabled:opacity-60"
                  >
                    {t("Delete", "মুছুন")}
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("Delete app", "অ্যাপ মুছুন")}
        description={t(
          "Remove this app and its settings? This cannot be undone.",
          "এই অ্যাপ ও এর সেটিংস সরিয়ে ফেলুন? এটি ফেরানো যাবে না।",
        )}
        confirmLabel={t("Delete", "মুছুন")}
        destructive
        onConfirm={() => onDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  );
}

function isLiveStatus(status: string) {
  return status === "installed" || status === "trial" || status === "paused";
}
