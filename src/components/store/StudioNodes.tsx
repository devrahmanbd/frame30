import { StudioWidget } from "@/components/builder/studio/renderers";
import { isContainerNode, type StudioNode } from "@/lib/studio/model";
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
 */
function Node({ node }: { node: StudioNode }) {
  if (isHiddenOn(node, "desktop")) return null;
  if (isContainerNode(node)) {
    return (
      <div
        style={{ ...nodeCss(node, "desktop"), ...selfCss(node, "desktop") }}
      >
        <div style={containerInnerCss(node, "desktop")}>
          {(node.children ?? []).map((child) => (
            <Node key={child.id} node={child} />
          ))}
        </div>
      </div>
    );
  }
  return <StudioWidget node={node} device="desktop" />;
}

export function StudioNodes({ nodes }: { nodes: StudioNode[] }) {
  return (
    <>
      {nodes.map((node) => (
        <Node key={node.id} node={node} />
      ))}
    </>
  );
}
