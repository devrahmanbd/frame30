import { StudioWidget } from "@/components/builder/studio/renderers";
import type { DevThemeBinding } from "@/components/builder/SectionRenderer";
import {
  isContainerNode,
  type StudioMenuSource,
  type StudioNode,
} from "@/lib/studio/model";
import type { UnifiedRegistry } from "@/lib/unified-widget-registry";
import {
  containerInnerCss,
  isHiddenOn,
  nodeCss,
  selfCss,
} from "@/lib/studio/styles";

/**
 * Storefront Studio tree (Sept 2026 homepage program).
 *
 * Renders builder-authored page nodes with the exact same components as
 * the canvas preview, so the storefront matches the builder. Read-only:
 * editing is always false, device resolves desktop on the server (client
 * hydration keeps the SSR markup). Containers recurse (StudioWidget has
 * no container case — without this branch every layout page would render
 * Placeholder boxes), and responsive-hidden nodes stay hidden.
 *
 * Frame30 storefront twins: the server-authorized registry (plus theme key
 * and Level B binding) threads through every node into `StudioWidget`, so
 * plugin/theme twins resolve against the SAME authorized defs as the
 * editor instead of the def-less fallback (which misses every twin to
 * null). Absent keeps the legacy composition byte-identical. Twin misses
 * render the explicit fail-closed recovery (never null, never another
 * owner's widget) via the storefront surface flag.
 */
export type StudioNodesProps = {
  nodes: StudioNode[];
  /**
   * Server-authorized registry for twin resolution. Absent keeps the
   * builtin + studio + singleton fallback, so legacy callers stay
   * byte-identical; misses keep the explicit placeholder.
   */
  registry?: UnifiedRegistry;
  /** Active theme key driving per-theme resolution. Absent stays unkeyed. */
  themeKey?: string | null;
  /**
   * Server-projected Level B runtime binding for the active approved theme.
   * Absent keeps uploaded-theme rendering fail-closed (explicit
   * placeholder). Arrives from the server loader, never the client.
   */
  devThemeBinding?: DevThemeBinding;
  /** Real menus for the widget→menu binding (`settings.menuId`). */
  menus?: readonly StudioMenuSource[] | null;
};

function Node({
  node,
  registry,
  themeKey,
  devThemeBinding,
  menus,
}: {
  node: StudioNode;
  registry?: UnifiedRegistry;
  themeKey?: string | null;
  devThemeBinding?: DevThemeBinding;
  menus?: readonly StudioMenuSource[] | null;
}) {
  if (isHiddenOn(node, "desktop")) return null;
  if (isContainerNode(node)) {
    return (
      <div style={{ ...nodeCss(node, "desktop"), ...selfCss(node, "desktop") }}>
        <div style={containerInnerCss(node, "desktop")}>
          {(node.children ?? []).map((child) => (
            <Node
              key={child.id}
              node={child}
              registry={registry}
              themeKey={themeKey}
              devThemeBinding={devThemeBinding}
              menus={menus}
            />
          ))}
        </div>
      </div>
    );
  }
  return (
    <StudioWidget
      node={node}
      device="desktop"
      registry={registry}
      themeKey={themeKey}
      devThemeBinding={devThemeBinding}
      menus={menus}
      storefront
    />
  );
}

export function StudioNodes({
  nodes,
  registry,
  themeKey,
  devThemeBinding,
  menus,
}: StudioNodesProps) {
  return (
    <>
      {nodes.map((node) => (
        <Node
          key={node.id}
          node={node}
          registry={registry}
          themeKey={themeKey}
          devThemeBinding={devThemeBinding}
          menus={menus}
        />
      ))}
    </>
  );
}
