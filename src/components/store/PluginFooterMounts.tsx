import { useCallback, useEffect, useState, type CSSProperties } from "react";
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
  // Floating widgets (chat bubbles): the entry renders in-flow, so the
  // parent hosts the frame viewport-fixed. `position:fixed` inside the entry
  // would resolve against the tiny iframe viewport and clip — never the page.
  // Corner + pixel offsets come from plugin control (button_position,
  // offset_x/offset_y, clamped 0–48, default 16); the 88px frame matches the
  // entry's FRAME constant so bubble sizes (44/56/64) and motion stay
  // unclipped.
  const floating = widget.floating === true;
  const settings = (plugin.settings ?? {}) as Record<string, unknown>;
  const pos = String(settings.button_position ?? "bottom-right");
  const vTop = pos.startsWith("top");
  const hLeft = pos.endsWith("left");
  const clampOff = (v: unknown) => {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return 16;
    return Math.min(48, Math.max(0, n));
  };
  const frameStyle: CSSProperties | undefined = floating
    ? {
        position: "fixed",
        zIndex: 60,
        width: 88,
        height: 88,
        ...(vTop
          ? { top: clampOff(settings.offset_y) }
          : { bottom: clampOff(settings.offset_y) }),
        ...(hLeft
          ? { left: clampOff(settings.offset_x) }
          : { right: clampOff(settings.offset_x) }),
      }
    : undefined;
  if (!mounted) {
    return (
      <div
        data-plugin={plugin.manifest.id}
        data-plugin-widget={widget.key}
        style={floating ? frameStyle : { height }}
        aria-hidden="true"
      />
    );
  }
  return (
    <div
      data-plugin={plugin.manifest.id}
      data-plugin-widget={widget.key}
      style={frameStyle}
    >
      <WidgetSandbox
        title={`${plugin.manifest.name} — ${widget.label}`}
        entry={widget.entry}
        grantedScopes={plugin.grantedScopes}
        settings={plugin.settings}
        onCall={onCall}
        height={floating ? 88 : height}
        bare={floating}
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
