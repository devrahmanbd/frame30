import type { ReactNode } from "react";
import { PluginProvider } from "@/components/builder/PluginContext";
import { PluginFooterMounts } from "@/components/store/PluginFooterMounts";
import type { InstalledPlugin } from "@/lib/plugin-manifest";

/**
 * Decoupled plugin layer — the plugin architecture's single entry point on
 * the storefront, independent of every theme.
 *
 * Routes render page content (any theme chrome, or none) inside it. It owns
 * the installed-plugin provider (placed app-blocks resolve through context)
 * and the site-wide footer mounts (chat bubbles, popups, shields). No theme
 * file imports this module, so theme rewrites can never affect plugin
 * rendering — and every theme is automatically plugin-capable.
 */
export function PluginLayer({
  plugins,
  children,
}: {
  plugins: readonly InstalledPlugin[];
  children: ReactNode;
}) {
  return (
    <PluginProvider plugins={[...(plugins ?? [])]}>
      {children}
      <PluginFooterMounts />
    </PluginProvider>
  );
}
