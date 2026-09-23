import { useCallback, useEffect, useState } from "react";
import {
  pluginWidgetKey,
  resolvePluginWidget,
  type InstalledPlugin,
} from "@/lib/plugin-manifest";
import { WIDGET_API } from "@/lib/marketplace-scopes";
import { WidgetSandbox } from "@/components/marketplace/WidgetSandbox";
import { useInstalledPlugins } from "@/components/builder/PluginContext";

/**
 * Site-wide footer mounts for installed plugin widgets.
 *
 * Footer-slot widgets (chat bubbles, popups, shields) mount on every
 * storefront page without block placement: the merchant toggles the plugin,
 * the widget appears. Resolution is the one shared resolver, failures render
 * nothing (shoppers never see merchant-facing labels), and the bundle runs
 * in the null-origin `WidgetSandbox` island exactly like canvas blocks.
 */
export function footerMountKeys(
  installed: readonly InstalledPlugin[],
): string[] {
  const out: string[] = [];
  for (const p of installed) {
    if (!p.enabled) continue;
    for (const w of p.manifest.widgets) {
      if (!w.slots.includes("footer")) continue;
      const key = pluginWidgetKey(p.manifest.id, w.key);
      // Same gate the mount itself enforces (API compat, kill switch via
      // `enabled`): keys that can never resolve are not mount points.
      if (!resolvePluginWidget(key, installed).ok) continue;
      out.push(key);
    }
  }
  return out;
}

function FooterMount({
  pluginKey,
  height,
}: {
  pluginKey: string;
  height: number;
}) {
  const plugins = useInstalledPlugins();
  // Mounted gate: the sandbox reads `window` for its origin, so the iframe
  // only renders after hydration. SSR emits the mount-point div (same shape
  // the legacy HTML renderer writes) — never a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const onCall = useCallback(async (method: string) => {
    if (!WIDGET_API[method]) throw new Error("unknown_method");
    return { ok: true };
  }, []);
  const resolved = resolvePluginWidget(pluginKey, plugins);
  if (!resolved.ok) return null;
  const { plugin, widget } = resolved;
  if (!mounted) {
    return (
      <div
        data-plugin={plugin.manifest.id}
        data-plugin-widget={widget.key}
        style={{ height }}
        aria-hidden="true"
      />
    );
  }
  return (
    <div data-plugin={plugin.manifest.id} data-plugin-widget={widget.key}>
      <WidgetSandbox
        title={`${plugin.manifest.name} — ${widget.label}`}
        entry={widget.entry}
        grantedScopes={plugin.grantedScopes}
        settings={plugin.settings}
        onCall={onCall}
        height={height}
      />
    </div>
  );
}

export function PluginFooterMounts() {
  const plugins = useInstalledPlugins();
  const keys = footerMountKeys(plugins);
  if (keys.length === 0) return null;
  return (
    <>
      {keys.map((key) => {
        const resolved = resolvePluginWidget(key, plugins);
        if (!resolved.ok) return null;
        return (
          <FooterMount
            key={key}
            pluginKey={key}
            height={resolved.widget.height || 320}
          />
        );
      })}
    </>
  );
}
