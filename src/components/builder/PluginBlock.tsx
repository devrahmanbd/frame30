import { useCallback } from "react";
import { resolvePluginWidget } from "@/lib/plugin-manifest";
import { WIDGET_API, type WidgetCall } from "@/lib/marketplace-scopes";
import { useLang } from "@/lib/i18n";
import { WidgetSandbox } from "@/components/marketplace/WidgetSandbox";
import { useInstalledPlugins } from "./PluginContext";

/**
 * Phase 5 — the one renderer for every plugin-contributed widget.
 *
 * The bundle never touches the host DOM: it runs inside `WidgetSandbox`
 * (null-origin iframe, `allow-scripts` only) and reaches the app solely
 * through the scoped postMessage bridge. Any resolution failure — not
 * installed, disabled by the kill switch, incompatible builder API, unknown
 * widget key — renders a labelled placeholder so the page always renders.
 */
export function PluginBlock({
  pluginKey,
  height,
  editing,
}: {
  pluginKey: string;
  height: number;
  editing: boolean;
}) {
  const { t } = useLang();
  const plugins = useInstalledPlugins();
  const resolved = resolvePluginWidget(pluginKey, plugins);

  const onCall = useCallback(
    async (method: string, _params: unknown) => {
      // Host bridge: the sandbox may only reach allow-listed, scoped methods.
      // Data fetching is deliberately server-mediated elsewhere; unknown
      // methods reject instead of silently resolving.
      if (!WIDGET_API[method]) throw new Error("unknown_method");
      return { ok: true };
    },
    [],
  );

  if (!resolved.ok) {
    if (!editing && resolved.reason === "bad_key") return null;
    const reasons: Record<string, [string, string]> = {
      bad_key: ["No app widget selected", "কোনো অ্যাপ উইজেট নির্বাচন করা হয়নি"],
      not_installed: ["This app is not installed", "এই অ্যাপটি ইনস্টল করা নেই"],
      unknown_widget: ["This app no longer ships this block", "অ্যাপে এই ব্লকটি আর নেই"],
      incompatible: ["App not compatible with this builder version", "অ্যাপটি এই বিল্ডার সংস্করণে চলে না"],
      disabled: ["Apps are switched off for this store", "এই স্টোরে অ্যাপ বন্ধ আছে"],
    };
    const [en, bn] = reasons[resolved.reason] ?? reasons.bad_key;
    return (
      <div
        role="note"
        className="rounded-fq-md border border-dashed border-border bg-muted/40 px-3 py-4 text-xs text-muted-foreground"
      >
        {t(en, bn)}
      </div>
    );
  }

  const { plugin, widget } = resolved;
  return (
    <div data-plugin={plugin.manifest.id} data-plugin-widget={widget.key}>
      <WidgetSandbox
        title={`${plugin.manifest.name} — ${widget.label}`}
        entry={widget.entry}
        grantedScopes={plugin.grantedScopes}
        onCall={onCall as (method: string, params: unknown) => Promise<unknown>}
        height={height || widget.height || 320}
      />
    </div>
  );
}

export type { WidgetCall };
