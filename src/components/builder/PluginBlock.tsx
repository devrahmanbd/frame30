import { useCallback, type ComponentType } from "react";
import { resolvePluginWidget } from "@/lib/plugin-manifest";
import {
  resolveCommunityPresentation,
  resolveCommunityRender,
  type CommunityPresentationProps,
} from "@/lib/plugin-theme-contract";
import { WIDGET_API, type WidgetCall } from "@/lib/marketplace-scopes";
import { useLang } from "@/lib/i18n";
import {
  validateInstanceProps,
  WidgetSandbox,
} from "@/components/marketplace/WidgetSandbox";
import { useInstalledPlugins } from "./PluginContext";

/**
 * Phase 5 — the one renderer for every plugin-contributed widget.
 *
 * The bundle never touches the host DOM: it runs inside `WidgetSandbox`
 * (null-origin iframe, `allow-scripts` only) and reaches the app solely
 * through the scoped postMessage bridge. Any resolution failure — not
 * installed, disabled by the kill switch, incompatible builder API, unknown
 * widget key — renders a labelled placeholder so the page always renders.
 *
 * Community classes: Class A (isolated, no `themeable` contract) always
 * takes the sandbox island below. Class B (themeable) renders the theme's
 * registered presentation when the active theme dresses this widget, and
 * the same generic sandboxed island otherwise — the sandbox path is
 * identical either way.
 *
 * Per-instance props (canonical extension nodes) arrive via `instanceProps`,
 * are re-validated here against the widget's own schema (hostile/unknown
 * keys stripped, never executed), and ride DISTINCT from the install's
 * global `settings`: the dressed presentation gets both `data` (global) and
 * `instanceProps` (this instance, never merged); the sandbox island gets
 * `settings` (global, over the `plugin.settings` bridge) and `instanceProps`
 * (baked into the frame document). Absent keeps the legacy path
 * byte-identical.
 */
export function PluginBlock({
  pluginKey,
  height,
  editing,
  themeKey,
  instanceProps,
}: {
  pluginKey: string;
  height: number;
  editing: boolean;
  /**
   * Active theme key for Class B dressing. Absent/null keeps the legacy
   * behavior byte-identical (sandbox island, even for themeable widgets).
   */
  themeKey?: string | null;
  /**
   * Per-instance props from the extension node. Validated at this boundary;
   * absent keeps the legacy path byte-identical (no props channel).
   */
  instanceProps?: Record<string, unknown>;
}) {
  const { t } = useLang();
  const plugins = useInstalledPlugins();
  const resolved = resolvePluginWidget(pluginKey, plugins);

  const onCall = useCallback(async (method: string, _params: unknown) => {
    // Host bridge: the sandbox may only reach allow-listed, scoped methods.
    // Data fetching is deliberately server-mediated elsewhere; unknown
    // methods reject instead of silently resolving.
    if (!WIDGET_API[method]) throw new Error("unknown_method");
    return { ok: true };
  }, []);

  if (!resolved.ok) {
    if (!editing && resolved.reason === "bad_key") return null;
    const reasons: Record<string, [string, string]> = {
      bad_key: [
        "No app widget selected",
        "কোনো অ্যাপ উইজেট নির্বাচন করা হয়নি",
      ],
      not_installed: ["This app is not installed", "এই অ্যাপটি ইনস্টল করা নেই"],
      unknown_widget: [
        "This app no longer ships this block",
        "অ্যাপে এই ব্লকটি আর নেই",
      ],
      incompatible: [
        "App not compatible with this builder version",
        "অ্যাপটি এই বিল্ডার সংস্করণে চলে না",
      ],
      disabled: [
        "Apps are switched off for this store",
        "এই স্টোরে অ্যাপ বন্ধ আছে",
      ],
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
  // Per-instance props: re-validated at this boundary against the widget's
  // own schema (fresh object every render — two instances never share
  // references). Global `plugin.settings` below is untouched and never
  // merged in either direction. `undefined` (legacy callers) skips the props
  // channel entirely, keeping the legacy path byte-identical.
  const cleanInstanceProps =
    instanceProps === undefined
      ? undefined
      : validateInstanceProps(instanceProps, widget.propsSchema);
  // Class B dressed: the theme owns every pixel — the bundle never
  // executes, so sandboxing is never weakened. Every other outcome
  // (Class A, undressed Class B, raced registry) falls through to the
  // generic sandboxed island below, unchanged.
  if (
    resolveCommunityRender(resolved, { themeKey, pluginKey }).kind === "theme"
  ) {
    const Presentation = resolveCommunityPresentation(
      themeKey ?? "",
      pluginKey,
    );
    if (Presentation) {
      // The contract type carries no instance-props member (owned by the
      // theme registry module), so the extra channel rides a local widening:
      // `data` stays the install's global settings, `instanceProps` is this
      // instance's validated props — distinct props, never merged.
      const Dressed = Presentation as ComponentType<
        CommunityPresentationProps & {
          instanceProps?: Record<string, unknown>;
        }
      >;
      return (
        <div data-plugin={plugin.manifest.id} data-plugin-widget={widget.key}>
          <Dressed
            pluginId={plugin.manifest.id}
            widgetKey={pluginKey}
            data={{ ...plugin.settings }}
            instanceProps={cleanInstanceProps ?? {}}
          />
        </div>
      );
    }
  }
  return (
    <div data-plugin={plugin.manifest.id} data-plugin-widget={widget.key}>
      <WidgetSandbox
        title={`${plugin.manifest.name} — ${widget.label}`}
        entry={widget.entry}
        grantedScopes={plugin.grantedScopes}
        settings={plugin.settings}
        instanceProps={cleanInstanceProps}
        onCall={onCall as (method: string, params: unknown) => Promise<unknown>}
        height={height || widget.height || 320}
      />
    </div>
  );
}

export type { WidgetCall };
