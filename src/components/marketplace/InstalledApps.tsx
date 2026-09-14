import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import { pluginListFn, pluginSettingsSaveFn, pluginToggleFn } from "@/lib/plugins.functions";
import { satisfiesApiRange, type SettingsValues } from "@/lib/plugin-manifest";
import { PluginSettingsForm } from "./PluginSettingsForm";

/** Phase 5 — merchant-facing app list with core-rendered settings forms. */
export function InstalledApps() {
  const { t } = useLang();
  const qc = useQueryClient();
  const list = useServerFn(pluginListFn);
  const save = useServerFn(pluginSettingsSaveFn);
  const toggle = useServerFn(pluginToggleFn);

  const plugins = useQuery({
    queryKey: ["admin", "plugins"],
    queryFn: () => list({}),
    staleTime: 30_000,
  });

  const items = plugins.data?.plugins ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "plugins"] });

  async function onSave(pluginId: string, values: SettingsValues) {
    try {
      await save({ data: { pluginId, values } });
      toast.success(t("Settings saved", "সেটিং সেভ হয়েছে"));
      refresh();
    } catch {
      toast.error(t("Could not save settings", "সেটিং সেভ করা যায়নি"));
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="font-bangla-display text-lg font-semibold">{t("Apps", "অ্যাপ")}</h2>
      {items.length === 0 && (
        <p className="rounded-fq-md border border-border bg-card p-4 text-sm text-muted-foreground">
          {t("No apps installed yet.", "এখনো কোনো অ্যাপ ইনস্টল করা হয়নি।")}
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((plugin) => {
          const compatible = satisfiesApiRange(plugin.manifest.api);
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
            </article>
          );
        })}
      </div>
    </section>
  );
}
