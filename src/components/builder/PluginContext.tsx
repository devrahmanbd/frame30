import { createContext, useContext, useMemo } from "react";
import type { InstalledPlugin } from "@/lib/plugin-manifest";

/**
 * Phase 5 — the host's view of installed plugins.
 *
 * The studio and the storefront both provide it; anything rendered without a
 * provider simply sees zero plugins and every app block degrades to a
 * placeholder, which is the required failure mode.
 */
const PluginContext = createContext<InstalledPlugin[]>([]);

export function PluginProvider({
  plugins,
  children,
}: {
  plugins: InstalledPlugin[];
  children: React.ReactNode;
}) {
  const value = useMemo(() => plugins ?? [], [plugins]);
  return <PluginContext.Provider value={value}>{children}</PluginContext.Provider>;
}

export function useInstalledPlugins() {
  return useContext(PluginContext);
}
