import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Phase 8.8 — failure policy: the page always renders.
 *
 * A widget that throws (bad prop shape, a hostile data row, a browser API that
 * isn't there) is contained to its own node. Production shows a neutral
 * placeholder that reserves the same block space, the studio shows the reason so
 * the merchant can fix or remove the node, and either way the surrounding
 * template — chrome, siblings, JSON-LD — keeps rendering.
 */
type Props = {
  /** Widget type, used as the metric label and the studio message. */
  type: string;
  editing?: boolean;
  children: ReactNode;
  /** Test/telemetry seam; defaults to the shared reporter. */
  onError?: (type: string, error: unknown) => void;
};

type State = { failed: boolean; message: string };

export function reportWidgetError(type: string, error: unknown) {
  // Client-side: one console line per broken widget, tagged so the log pipeline
  // can aggregate a widget error rate without shipping a second transport.
  console.error(
    new Error(`widget_render_failed:${type}: ${(error as Error)?.message ?? String(error)}`, {
      cause: error,
    }),
  );
}

export class WidgetBoundary extends Component<Props, State> {
  override state: State = { failed: false, message: "" };

  static getDerivedStateFromError(error: unknown): State {
    return { failed: true, message: (error as Error)?.message ?? "render failed" };
  }

  override componentDidCatch(error: Error, _info: ErrorInfo) {
    (this.props.onError ?? reportWidgetError)(this.props.type, error);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.editing) {
      return (
        <div
          role="note"
          className="rounded-fq-md border border-dashed border-danger bg-danger-soft p-4 text-sm"
        >
          This “{this.props.type}” block failed to render. Check its settings or remove it.
        </div>
      );
    }
    return (
      <div
        aria-hidden="true"
        data-widget-failed={this.props.type}
        className="min-h-8 rounded-fq-md bg-muted/40"
      />
    );
  }
}
