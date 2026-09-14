/**
 * Canvas renderer shared by the page-builder editor and its live preview.
 *
 * In preview mode the tree is inert. In edit mode every section, column and
 * widget is selectable and drop-aware, which is what makes the Elementor-style
 * direct-manipulation feel possible without a second render path.
 */
import type { CSSProperties } from "react";
import type { BuilderDoc, Column, Section, Widget } from "@/lib/page-builder";

export type Selection =
  | { kind: "section"; sectionId: string }
  | { kind: "column"; sectionId: string; columnId: string }
  | { kind: "widget"; sectionId: string; columnId: string; widgetId: string }
  | null;

type Props = {
  doc: BuilderDoc;
  editable?: boolean;
  selection?: Selection;
  onSelect?: (s: Selection) => void;
  onDropWidget?: (target: { sectionId: string; columnId: string; index: number }) => void;
};

export function WidgetView({ widget }: { widget: Widget }) {
  const s = widget.settings;
  const base: CSSProperties = {
    textAlign: s.align,
    color: s.color,
    marginTop: s.marginTop ?? 0,
    marginBottom: s.marginBottom ?? 12,
  };
  switch (widget.type) {
    case "heading": {
      const Tag = (`h${s.level ?? 2}`) as "h1" | "h2" | "h3" | "h4";
      return (
        <Tag style={{ ...base, fontSize: s.size ?? 32, fontWeight: s.weight ?? 700, lineHeight: 1.15 }}>
          {s.text || "Heading"}
        </Tag>
      );
    }
    case "text":
      return <p style={{ ...base, fontSize: s.size ?? 16, lineHeight: 1.6 }}>{s.text || "Text"}</p>;
    case "image":
      return s.url ? (
        <figure style={base}>
          <img
            src={s.url}
            alt={s.alt ?? ""}
            loading="lazy"
            style={{ maxWidth: "100%", borderRadius: s.radius ?? 12, display: "inline-block" }}
          />
        </figure>
      ) : (
        <div
          style={base}
          className="grid h-32 place-items-center rounded-fq-md border border-dashed border-border text-xs text-muted-foreground"
        >
          Image
        </div>
      );
    case "button":
      return (
        <p style={base}>
          <span
            className={
              s.variant === "outline"
                ? "inline-flex min-h-11 items-center rounded-fq-md border border-primary px-4 text-sm font-semibold text-primary"
                : s.variant === "ghost"
                  ? "inline-flex min-h-11 items-center rounded-fq-md px-4 text-sm font-semibold text-primary underline"
                  : "inline-flex min-h-11 items-center rounded-fq-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
            }
          >
            {s.label || "Button"}
          </span>
        </p>
      );
    case "divider":
      return <hr style={base} className="border-border" />;
    case "spacer":
      return <div style={{ height: s.height ?? 32 }} />;
    case "list":
      return (
        <ul style={{ ...base, fontSize: s.size ?? 16 }} className="list-disc space-y-1 pl-5">
          {(s.items ?? []).map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
    case "quote":
      return (
        <blockquote style={base} className="border-l-4 border-primary pl-4 italic">
          {s.text}
          {s.author ? <footer className="mt-1 text-xs not-italic text-muted-foreground">— {s.author}</footer> : null}
        </blockquote>
      );
    case "video":
      return s.url ? (
        <div style={base}>
          <iframe src={s.url} title="video" className="aspect-video w-full rounded-fq-md border-0" loading="lazy" />
        </div>
      ) : (
        <div style={base} className="grid h-40 place-items-center rounded-fq-md border border-dashed border-border text-xs text-muted-foreground">
          Video URL required
        </div>
      );
    case "html":
      return <div style={base} dangerouslySetInnerHTML={{ __html: s.html ?? "" }} />;
    case "products": {
      const count = Math.min(Math.max(s.limit ?? 4, 1), 24);
      const perRow = Math.min(Math.max(s.perRow ?? 4, 1), 6);
      return (
        <div style={base}>
          {s.heading ? <h2 className="mb-3 text-xl font-semibold">{s.heading}</h2> : null}
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: count }).map((_, i) => (
              <div key={i} className="rounded-fq-md border border-dashed border-border p-2">
                <div className="aspect-square rounded-fq-sm bg-muted" />
                <div className="mt-2 h-3 w-3/4 rounded bg-muted" />
                {s.showPrice !== false && <div className="mt-1 h-3 w-1/3 rounded bg-muted" />}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {s.category ? `Category: ${s.category}` : "All products"} · live on the storefront
          </p>
        </div>
      );
    }
    default:
      return null;
  }
}

function ColumnView({
  section,
  column,
  editable,
  selection,
  onSelect,
  onDropWidget,
}: Props & { section: Section; column: Column }) {
  const selected = selection?.kind === "column" && selection.columnId === column.id;
  return (
    <div
      style={{
        flex: `${column.span} 1 0`,
        minWidth: column.span >= 6 ? 240 : 160,
        padding: column.padding,
        background: column.background,
      }}
      className={editable ? `rounded-fq-sm outline-offset-2 ${selected ? "outline-2 outline-primary" : "outline-1 outline-dashed outline-border/60"}` : undefined}
      onClick={
        editable
          ? (e) => {
              e.stopPropagation();
              onSelect?.({ kind: "column", sectionId: section.id, columnId: column.id });
            }
          : undefined
      }
      onDragOver={editable ? (e) => e.preventDefault() : undefined}
      onDrop={
        editable
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onDropWidget?.({ sectionId: section.id, columnId: column.id, index: column.widgets.length });
            }
          : undefined
      }
    >
      {column.widgets.length === 0 && editable && (
        <p className="grid min-h-20 place-items-center text-xs text-muted-foreground">Drop a widget here</p>
      )}
      {column.widgets.map((w, i) => {
        const isSel = selection?.kind === "widget" && selection.widgetId === w.id;
        return (
          <div
            key={w.id}
            className={editable ? `relative rounded-fq-sm ${isSel ? "outline-2 outline-primary" : "hover:outline-1 hover:outline-dashed hover:outline-primary/50"} outline-offset-2` : undefined}
            onClick={
              editable
                ? (e) => {
                    e.stopPropagation();
                    onSelect?.({ kind: "widget", sectionId: section.id, columnId: column.id, widgetId: w.id });
                  }
                : undefined
            }
            onDragOver={editable ? (e) => e.preventDefault() : undefined}
            onDrop={
              editable
                ? (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDropWidget?.({ sectionId: section.id, columnId: column.id, index: i });
                  }
                : undefined
            }
          >
            <WidgetView widget={w} />
          </div>
        );
      })}
    </div>
  );
}

export function PageCanvas({ doc, editable = false, selection = null, onSelect, onDropWidget }: Props) {
  if (doc.sections.length === 0) {
    return (
      <div className="grid min-h-48 place-items-center rounded-fq-md border border-dashed border-border p-8 text-sm text-muted-foreground">
        No sections yet — add one to start building.
      </div>
    );
  }
  return (
    <div className="bg-background text-foreground">
      {doc.sections.map((section) => {
        const selected = selection?.kind === "section" && selection.sectionId === section.id;
        return (
          <section
            key={section.id}
            style={{
              background: section.background,
              padding: `${section.paddingY ?? 40}px ${section.paddingX ?? 16}px`,
            }}
            className={editable ? `relative ${selected ? "outline-2 outline-primary" : "outline-1 outline-dashed outline-border"} outline-offset-[-2px]` : undefined}
            onClick={
              editable
                ? (e) => {
                    e.stopPropagation();
                    onSelect?.({ kind: "section", sectionId: section.id });
                  }
                : undefined
            }
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: section.gap ?? 24,
                maxWidth: section.width === "full" ? "none" : 1120,
                margin: "0 auto",
                alignItems: section.align === "center" ? "center" : section.align === "start" ? "flex-start" : "stretch",
              }}
            >
              {section.columns.map((column) => (
                <ColumnView
                  key={column.id}
                  doc={doc}
                  section={section}
                  column={column}
                  editable={editable}
                  selection={selection}
                  onSelect={onSelect}
                  onDropWidget={onDropWidget}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
