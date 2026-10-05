/**
 * MENU RUNTIME — plugin nav renderer registry.
 *
 * A plugin with an approved full-renderer swap (`decideMenuRenderer` in
 * `plugin-manifest.ts`: review-approved claim AND the `replace_menus`
 * scope) may replace a slot's nav presentation — not just its rows. The
 * renderer is a host-side Component registered here; mount points
 * (`StoreHeader`, the builder `MegaMenu`) resolve it through
 * `selectPluginMenuRenderer` and render it with the winning rows
 * (`resolveMenuSwapRows`, which stays fail-open on rows), falling back to
 * the theme default markup whenever no renderer is registered or the
 * decision is not `plugin`.
 *
 * Registry contracts (mirroring `theme-presentations.ts`):
 * - Registration is first-wins: a duplicate warns and keeps the first.
 *   Registration never throws.
 * - Resolution never throws: unknown / null / missing keys return the
 *   caller-supplied fallback (usually the theme default markup), or
 *   undefined when none is given. An unapproved or scope-denied slot NEVER
 *   resolves to a plugin renderer (`selectPluginMenuRenderer` returns
 *   undefined unless the decision is `plugin`).
 * - This module names no theme and no plugin and branches on neither:
 *   lookup is an opaque two-level Map keyed by plugin id then menu slot.
 */

import type { ComponentType } from "react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { isMenuSlot, type MenuSlot } from "./marketplace-scopes";
import type { MenuRendererDecision } from "./plugin-manifest";

/** Props an approved plugin nav renderer receives: winning rows, never chrome. */
export type PluginMenuRendererProps<T = unknown> = {
  /** Winning rows for the slot (theme rows unless the swap carried rows). */
  rows: readonly T[];
  slot: MenuSlot;
  pluginId: string;
};

export type PluginMenuRendererComponent<T = unknown> = ComponentType<
  PluginMenuRendererProps<T>
>;

/** pluginId → (slot → renderer Component). */
const RENDERERS = new Map<string, Map<MenuSlot, PluginMenuRendererComponent<any>>>();

/**
 * Claim one pluginId × slot pair for a nav renderer Component.
 * First registration wins; duplicates warn and are ignored. Never throws
 * (invalid input warns and returns).
 */
export function registerMenuRenderer(
  pluginId: string,
  slot: MenuSlot,
  Component: PluginMenuRendererComponent<any>,
): void {
  if (typeof pluginId !== "string" || pluginId.length === 0) {
    console.warn(
      `[menu-renderers] ignoring registration for empty plugin id (${String(slot)}).`,
    );
    return;
  }
  if (!isMenuSlot(slot)) {
    console.warn(
      `[menu-renderers] ignoring registration for ${pluginId}/${String(slot)}: not a menu slot.`,
    );
    return;
  }
  if (typeof Component !== "function") {
    console.warn(
      `[menu-renderers] ignoring registration for ${pluginId}/${String(slot)}: not a component.`,
    );
    return;
  }
  let bySlot = RENDERERS.get(pluginId);
  if (!bySlot) {
    bySlot = new Map<MenuSlot, PluginMenuRendererComponent<any>>();
    RENDERERS.set(pluginId, bySlot);
  }
  if (bySlot.has(slot)) {
    console.warn(
      `[menu-renderers] duplicate registration for ${pluginId}/${String(slot)} ignored; keeping the first.`,
    );
    return;
  }
  bySlot.set(slot, Component);
}

/**
 * Resolve the registered renderer for a pluginId × slot pair, or the
 * caller-supplied fallback when nothing is registered. Never throws —
 * unknown plugins, null keys and missing slots all fall back instead of
 * leaking another plugin's renderer.
 */
export function resolveMenuRenderer(
  pluginId: string | null | undefined,
  slot: MenuSlot,
  fallback?: PluginMenuRendererComponent<any> | undefined,
): PluginMenuRendererComponent<any> | undefined {
  try {
    const hit = RENDERERS.get(pluginId ?? "")?.get(slot);
    return hit ?? fallback;
  } catch {
    return fallback;
  }
}

/** Test-only reset: drops every registration (isolates suites). */
export function clearMenuRenderers(): void {
  RENDERERS.clear();
}

/**
 * Renderer half of the swap gate: returns the registered Component only
 * when the review gate already approved this slot for this plugin
 * (`decision.kind === "plugin"`). Every other outcome — unapproved,
 * scope-denied, unclaimed, malformed — is undefined, so the caller renders
 * the theme default (fail-open). Never throws.
 */
export function selectPluginMenuRenderer(
  decision: MenuRendererDecision | null | undefined,
  slot: MenuSlot,
): PluginMenuRendererComponent<any> | undefined {
  try {
    if (!decision || typeof decision !== "object") return undefined;
    if (decision.kind !== "plugin") return undefined;
    if (!isMenuSlot(slot)) return undefined;
    return RENDERERS.get(decision.pluginId)?.get(slot);
  } catch {
    return undefined;
  }
}

/**
 * Tagged client-side report for a failed plugin nav renderer. Mirrors the
 * `menu_renderer_failed:<pluginId>` line `renderMenuWithFallback` emits for
 * sync failures, so the log pipeline aggregates both halves of the swap.
 */
export function reportMenuRendererError(
  pluginId: string,
  error: unknown,
): void {
  if (typeof console === "undefined") return;
  console.error(
    new Error(
      `menu_renderer_failed:${pluginId}: ${(error as Error)?.message ?? String(error)}`,
      { cause: error },
    ),
  );
}

export type PluginMenuBoundaryProps = {
  pluginId: string;
  slot: MenuSlot;
  /**
   * Theme default markup — rendered whenever the plugin renderer throws.
   * The shopper keeps navigation; the failure is reported, never silent.
   */
  fallback: ReactNode;
  /** Test/telemetry seam; defaults to the shared tagged reporter. */
  onError?: (error: unknown) => void;
  children: ReactNode;
};

type PluginMenuBoundaryState = { failed: boolean };

/**
 * MENU RUNTIME fail-open for approved renderer swaps. Selection
 * (`selectPluginMenuRenderer`) and row resolution (`resolveMenuSwapRows`)
 * already fail open synchronously; this boundary covers the remaining half
 * — a registered plugin renderer that throws during React render. The
 * fallback is the theme default markup supplied by the mount point (never a
 * placeholder, never a blank nav). Reporting never throws: a throwing
 * `onError` is swallowed so navigation still renders.
 */
export class PluginMenuBoundary extends Component<
  PluginMenuBoundaryProps,
  PluginMenuBoundaryState
> {
  override state: PluginMenuBoundaryState = { failed: false };

  static getDerivedStateFromError(_error: unknown): PluginMenuBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, _info: ErrorInfo): void {
    try {
      (this.props.onError ?? ((cause: unknown) =>
        reportMenuRendererError(this.props.pluginId, cause)))(error);
    } catch {
      // Reporting never breaks navigation.
    }
  }

  override render(): ReactNode {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}
