import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  EMPTY_BUNDLE,
  nodeRows,
  type WidgetDataBundle,
  type WidgetDataMap,
  type WidgetRow,
} from "@/lib/widget-data";

type WidgetDataState = {
  bundle: WidgetDataBundle;
  map: WidgetDataMap | null;
  /** True while the batch is in flight — widgets show their skeleton. */
  pending: boolean;
};

const Ctx = createContext<WidgetDataState>({ bundle: EMPTY_BUNDLE, map: null, pending: false });

/**
 * Phase 0.3 SSR handoff. The server loader resolves the batch and ships the
 * keyed map inside the route payload, so the provider starts with data already
 * present and the client never refetches on hydrate.
 */
export function WidgetDataProvider({
  bundle,
  map,
  pending = false,
  children,
}: {
  bundle: WidgetDataBundle;
  map: WidgetDataMap | null;
  pending?: boolean;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ bundle, map, pending }), [bundle, map, pending]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Rows resolved for one node, plus whether the batch is still loading. */
export function useNodeData(nodeId: string): { rows: WidgetRow[] | undefined; pending: boolean } {
  const { bundle, map, pending } = useContext(Ctx);
  const rows = nodeRows(bundle, map, nodeId);
  return { rows, pending: pending && rows === undefined };
}
