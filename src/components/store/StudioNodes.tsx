import { StudioWidget } from "@/components/builder/studio/renderers";
import type { StudioNode } from "@/lib/studio/model";

/**
 * Storefront Studio tree (Sept 2026 homepage program).
 *
 * Renders builder-authored page nodes with the exact same StudioWidget
 * components as the canvas preview, so the storefront matches the
 * builder. Read-only: editing is always false, device resolves desktop
 * on the server (client hydration keeps the SSR markup).
 */
export function StudioNodes({ nodes }: { nodes: StudioNode[] }) {
  return (
    <>
      {nodes.map((node) => (
        <StudioWidget key={node.id} node={node} device="desktop" />
      ))}
    </>
  );
}
