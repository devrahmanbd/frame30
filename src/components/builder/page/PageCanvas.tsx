/**
 * Canvas renderer shared by the page-builder editor and its live preview.
 *
 * In preview mode the tree is inert. In edit mode every section, column and
 * widget is selectable and drop-aware, which is what makes the Elementor-style
 * direct-manipulation feel possible without a second render path.
 */
import type { CSSProperties } from "react";
import type { BuilderDoc, Column, Section, Widget } from "@/lib/page-builder";
import { HtmlSandbox } from "../HtmlSandbox";

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
  onDropWidget?: (target: {
    sectionId: string;
    columnId: string;
    index: number;
  }) => void;
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
      const Tag = `h${s.level ?? 2}` as "h1" | "h2" | "h3" | "h4";
      return (
        <Tag
          style={{
            ...base,
            fontSize: s.size ?? 32,
            fontWeight: s.weight ?? 700,
            lineHeight: 1.15,
          }}
        >
          {s.text || "Heading"}
        </Tag>
      );
    }
    case "text":
      return (
        <p style={{ ...base, fontSize: s.size ?? 16, lineHeight: 1.6 }}>
          {s.text || "Text"}
        </p>
      );
    case "image":
      return s.url ? (
        <figure style={base}>
          <img
            src={s.url}
            alt={s.alt ?? ""}
            loading="lazy"
            style={{
              maxWidth: "100%",
              borderRadius: s.radius ?? 12,
              display: "inline-block",
            }}
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
    case "whatsapp_button": {
      // This file's `s` is untyped legacy (46 pre-existing errors) — alias
      // locally so this case adds zero new ones.
      const w = (s ?? {}) as {
        phone_number?: unknown;
        size?: unknown;
        style?: unknown;
        label?: unknown;
      };
      const phone = String(w.phone_number ?? "").replace(/[^0-9]/g, "");
      if (!phone) {
        return (
          <p style={base}>
            <span className="inline-flex min-h-11 items-center rounded-fq-md border border-dashed border-border px-4 text-sm text-muted-foreground">
              Add a WhatsApp number
            </span>
          </p>
        );
      }
      const dim = w.size === "sm" ? 44 : w.size === "lg" ? 64 : 56;
      const glyph = (
        <svg
          width={dim - 16}
          height={dim - 16}
          viewBox="0 0 512 512"
          fill="none"
          aria-hidden
        >
          <path
            fill="#fff"
            d="M1.1 509.4L37 378.6C14.8 340.2 3.2 296.7 3.3 252.4C3.3 113.2 116.6 0 255.8 0c67.5 0 130.9 26.3 178.6 74s73.9 111.1 73.9 178.6C508.2 391.8 394.9 505 255.8 505h-.1c-42.3 0-83.8-10.6-120.7-30.7z"
          />
          <path
            fill="#25D366"
            d="M255.8 42.6c-115.8 0-209.9 94.1-210 209.8c0 39.5 11.2 78.2 32.2 111.7l5 7.9l-21.2 77.4l79.4-20.8l7.7 4.5c32.2 19.1 69.2 29.2 106.8 29.2h.1c115.7 0 209.8-94.1 209.9-209.8c.2-55.7-21.9-109.1-61.4-148.4c-39.3-39.4-92.8-61.6-148.5-61.5"
          />
          <path
            fill="#fff"
            fillRule="evenodd"
            d="M192.7 146.9c-4.7-10.5-9.7-10.7-14.2-10.9l-12.1-.1c-4.2 0-11 1.6-16.8 7.9s-22.1 21.6-22.1 52.6s22.6 61 25.8 65.2s43.6 69.9 107.8 95.2c53.3 21 64.1 16.8 75.7 15.8c11.6-1.1 37.3-15.3 42.6-30s5.3-27.4 3.7-30s-5.8-4.2-12.1-7.4s-37.3-18.4-43.1-20.5s-10-3.2-14.2 3.2c-4.2 6.3-16.3 20.5-20 24.7s-7.4 4.7-13.7 1.6c-6.3-3.2-26.6-9.8-50.7-31.3c-18.8-16.7-31.4-37.4-35.1-43.7s-.4-9.7 2.8-12.9c2.8-2.8 6.3-7.4 9.5-11.1s4.2-6.3 6.3-10.5s1.1-7.9-.5-11.1c-1.8-3-14-34.2-19.6-46.7"
          />
        </svg>
      );
      return (
        <p style={base}>
          <span
            className="inline-flex items-center justify-center rounded-full bg-[#25D366] text-sm font-semibold text-white"
            style={
              w.style === "bar"
                ? { padding: "11px 20px", gap: 10 }
                : { width: dim, height: dim }
            }
          >
            {glyph}
            {w.style === "bar" ? (
              <span>{String(w.label ?? "") || "Chat on WhatsApp"}</span>
            ) : null}
          </span>
        </p>
      );
    }
    case "divider":
      return <hr style={base} className="border-border" />;
    case "spacer":
      return <div style={{ height: s.height ?? 32 }} />;
    case "list":
      return (
        <ul
          style={{ ...base, fontSize: s.size ?? 16 }}
          className="list-disc space-y-1 pl-5"
        >
          {(s.items ?? []).map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
    case "quote":
      return (
        <blockquote
          style={base}
          className="border-l-4 border-primary pl-4 italic"
        >
          {s.text}
          {s.author ? (
            <footer className="mt-1 text-xs not-italic text-muted-foreground">
              — {s.author}
            </footer>
          ) : null}
        </blockquote>
      );
    case "video":
      return s.url ? (
        <div style={base}>
          <iframe
            src={s.url}
            title="video"
            className="aspect-video w-full rounded-fq-md border-0"
            loading="lazy"
          />
        </div>
      ) : (
        <div
          style={base}
          className="grid h-40 place-items-center rounded-fq-md border border-dashed border-border text-xs text-muted-foreground"
        >
          Video URL required
        </div>
      );
    case "html":
      return (
        <HtmlSandbox
          markup={s.html ?? ""}
          title="Custom HTML"
          className="w-full border-0"
        />
      );
    case "products": {
      const count = Math.min(Math.max(s.limit ?? 4, 1), 24);
      const perRow = Math.min(Math.max(s.perRow ?? 4, 1), 6);
      return (
        <div style={base}>
          {s.heading ? (
            <h2 className="mb-3 text-xl font-semibold">{s.heading}</h2>
          ) : null}
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: count }).map((_, i) => (
              <div
                key={i}
                className="rounded-fq-md border border-dashed border-border p-2"
              >
                <div className="aspect-square rounded-fq-sm bg-muted" />
                <div className="mt-2 h-3 w-3/4 rounded bg-muted" />
                {s.showPrice !== false && (
                  <div className="mt-1 h-3 w-1/3 rounded bg-muted" />
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {s.category ? `Category: ${s.category}` : "All products"} · live on
            the storefront
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
  const selected =
    selection?.kind === "column" && selection.columnId === column.id;
  return (
    <div
      style={{
        flex: `${column.span} 1 0`,
        minWidth: column.span >= 6 ? 240 : 160,
        padding: column.padding,
        background: column.background,
      }}
      className={
        editable
          ? `rounded-fq-sm outline-offset-2 ${selected ? "outline-2 outline-primary" : "outline-1 outline-dashed outline-border/60"}`
          : undefined
      }
      onClick={
        editable
          ? (e) => {
              e.stopPropagation();
              onSelect?.({
                kind: "column",
                sectionId: section.id,
                columnId: column.id,
              });
            }
          : undefined
      }
      onDragOver={editable ? (e) => e.preventDefault() : undefined}
      onDrop={
        editable
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onDropWidget?.({
                sectionId: section.id,
                columnId: column.id,
                index: column.widgets.length,
              });
            }
          : undefined
      }
    >
      {column.widgets.length === 0 && editable && (
        <p className="grid min-h-20 place-items-center text-xs text-muted-foreground">
          Drop a widget here
        </p>
      )}
      {column.widgets.map((w, i) => {
        const isSel =
          selection?.kind === "widget" && selection.widgetId === w.id;
        return (
          <div
            key={w.id}
            className={
              editable
                ? `relative rounded-fq-sm ${isSel ? "outline-2 outline-primary" : "hover:outline-1 hover:outline-dashed hover:outline-primary/50"} outline-offset-2`
                : undefined
            }
            onClick={
              editable
                ? (e) => {
                    e.stopPropagation();
                    onSelect?.({
                      kind: "widget",
                      sectionId: section.id,
                      columnId: column.id,
                      widgetId: w.id,
                    });
                  }
                : undefined
            }
            onDragOver={editable ? (e) => e.preventDefault() : undefined}
            onDrop={
              editable
                ? (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDropWidget?.({
                      sectionId: section.id,
                      columnId: column.id,
                      index: i,
                    });
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

export function PageCanvas({
  doc,
  editable = false,
  selection = null,
  onSelect,
  onDropWidget,
}: Props) {
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
        const selected =
          selection?.kind === "section" && selection.sectionId === section.id;
        return (
          <section
            key={section.id}
            style={{
              background: section.background,
              padding: `${section.paddingY ?? 40}px ${section.paddingX ?? 16}px`,
            }}
            className={
              editable
                ? `relative ${selected ? "outline-2 outline-primary" : "outline-1 outline-dashed outline-border"} outline-offset-[-2px]`
                : undefined
            }
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
                alignItems:
                  section.align === "center"
                    ? "center"
                    : section.align === "start"
                      ? "flex-start"
                      : "stretch",
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
