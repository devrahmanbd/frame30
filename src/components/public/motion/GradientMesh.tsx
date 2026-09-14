/**
 * GradientMesh — the hero backdrop.
 *
 * Deliberately *not* a shader, a canvas or a 3D scene: three blurred radial
 * gradients on composited layers cost one paint and zero JS, which is the only
 * way a hero backdrop fits the LCP budget on a 3G Android in Dhaka. The heavy
 * options (Rive/Spline/shader) stay behind the media policy in 10.1 and must
 * be poster-first and `ClientOnly`.
 *
 * Under `reduced`/`off` intent the drift animation is dropped and the mesh
 * renders as a static wash. It is `aria-hidden` and never carries content.
 */
import { useMotionIntent } from "@/lib/motion-runtime";

export type GradientMeshProps = {
  className?: string;
  /** 0…1 — how strongly the mesh reads against the page background. */
  intensity?: number;
};

export function GradientMesh({ className, intensity = 0.6 }: GradientMeshProps) {
  const intent = useMotionIntent();
  const drifting = intent === "full";
  const alpha = Math.min(Math.max(intensity, 0), 1);

  return (
    <div
      aria-hidden="true"
      data-motion="gradient-mesh"
      data-drifting={drifting}
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className ?? ""}`}
      style={{ opacity: alpha }}
    >
      <div className="fq-mesh-blob fq-mesh-blob-a" data-drifting={drifting} />
      <div className="fq-mesh-blob fq-mesh-blob-b" data-drifting={drifting} />
      <div className="fq-mesh-blob fq-mesh-blob-c" data-drifting={drifting} />
    </div>
  );
}
