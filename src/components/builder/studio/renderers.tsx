/**
 * Phase 14 — widget renderers.
 *
 * One renderer per catalogue entry, shared by the canvas and the preview. Every
 * renderer is presentational: it reads resolved settings and paints tokens, so
 * nothing here knows about selection, drag state or the panels.
 */
import type { CSSProperties } from "react";
import * as Icons from "lucide-react";
import { HtmlSandbox } from "@/components/builder/HtmlSandbox";
import type { NodeSettings, StudioNode } from "@/lib/studio/model";
import { resolveResponsive, type DeviceKey, type Maybe } from "@/lib/studio/responsive";
import { cn } from "@/lib/utils";

export function LucideIcon({ name, className, size }: { name?: unknown; className?: string; size?: number }) {
  const key = typeof name === "string" && name ? name : "Star";
  const registry = Icons as unknown as Record<string, React.ComponentType<{ className?: string; size?: number }>>;
  const Cmp = registry[key] ?? Icons.Star;
  return <Cmp className={className} size={size} aria-hidden />;
}

function str(settings: NodeSettings, key: string, fallback = ""): string {
  const value = resolveResponsive(settings[key] as Maybe<string>);
  return typeof value === "string" && value !== "" ? value : fallback;
}

function num(settings: NodeSettings, key: string, fallback: number, device: DeviceKey): number {
  const value = resolveResponsive(settings[key] as Maybe<number>, device);
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function rows(settings: NodeSettings, key = "items"): NodeSettings[] {
  const value = settings[key];
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? { text: item } : ((item ?? {}) as NodeSettings)));
}

const alignToFlex: Record<string, string> = { left: "flex-start", center: "center", right: "flex-end" };

export type RenderProps = { node: StudioNode; device: DeviceKey; editing?: boolean };

function Placeholder({ label }: { label: string }) {
  return (
    <div className="grid min-h-24 place-items-center rounded-fq-md border border-dashed border-border bg-muted/40 px-4 py-6 text-xs text-muted-foreground">
      {label}
    </div>
  );
}

export function StudioWidget({ node, device, editing }: RenderProps) {
  const s = node.settings;
  const align = str(s, "textAlign", "left");

  switch (node.el) {
    case "heading": {
      const level = Math.min(6, Math.max(1, num(s, "level", 2, device)));
      const Tag = `h${level}` as "h1";
      return <Tag className="leading-tight">{str(s, "text", "Add your heading text")}</Tag>;
    }

    case "text":
      return <p className="leading-relaxed">{str(s, "text", "Write something your customers need to know.")}</p>;

    case "text-editor":
      return (
        <div className="fq-prose leading-relaxed">
          {str(s, "text")
            .split(/\n{2,}/)
            .map((para, index) => (
              <p key={index}>{para}</p>
            ))}
        </div>
      );

    case "image": {
      const url = str(s, "url");
      if (!url) return <Placeholder label="Choose an image" />;
      return (
        <img
          src={url}
          alt={str(s, "alt")}
          loading="lazy"
          style={{ borderRadius: num(s, "radius", 12, device), width: `${num(s, "width", 100, device)}%` }}
          className="h-auto max-w-full"
        />
      );
    }

    case "video": {
      const url = str(s, "url");
      if (!url) return <Placeholder label="Paste a video link" />;
      const ratio = str(s, "ratio", "16:9").replace(":", "/");
      return (
        <iframe
          src={url}
          title={str(s, "title", "Video")}
          loading="lazy"
          style={{ aspectRatio: ratio }}
          className="w-full rounded-fq-md border-0"
        />
      );
    }

    case "button": {
      const size = str(s, "size", "md");
      const variant = str(s, "variant", "primary");
      return (
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-fq-md font-semibold transition-colors",
            size === "sm" ? "min-h-9 px-3 text-sm" : size === "lg" ? "min-h-12 px-6 text-base" : "min-h-11 px-4 text-sm",
            variant === "outline"
              ? "border border-primary text-primary"
              : variant === "ghost"
                ? "text-primary underline"
                : "bg-primary text-primary-foreground",
          )}
        >
          {str(s, "label", "Button")}
        </span>
      );
    }

    case "divider":
      return (
        <hr
          className="mx-auto border-border"
          style={{
            borderTopStyle: str(s, "style", "solid") as CSSProperties["borderTopStyle"],
            borderTopWidth: num(s, "weight", 1, device),
            width: `${num(s, "width", 100, device)}%`,
          }}
        />
      );

    case "spacer":
      return <div aria-hidden style={{ height: num(s, "height", 40, device) }} />;

    case "map": {
      const query = str(s, "query", "Dhaka");
      return (
        <iframe
          title={`Map of ${query}`}
          loading="lazy"
          className="w-full rounded-fq-md border-0"
          style={{ height: num(s, "height", 320, device) }}
          src={`https://www.google.com/maps?q=${encodeURIComponent(query)}&z=${num(s, "zoom", 12, device)}&output=embed`}
        />
      );
    }

    case "icon":
      return (
        <span className="inline-flex" style={{ justifyContent: alignToFlex[align] }}>
          <LucideIcon name={s.icon} size={num(s, "size", 40, device)} />
        </span>
      );

    case "tabs": {
      const items = rows(s);
      return (
        <div className="rounded-fq-md border border-border">
          <div className="flex flex-wrap gap-1 border-b border-border p-1">
            {items.map((item, index) => (
              <span
                key={index}
                className={cn(
                  "rounded-fq-sm px-3 py-2 text-sm font-medium",
                  index === 0 ? "bg-primary/10 text-primary" : "text-muted-foreground",
                )}
              >
                {typeof item.title === "string" ? item.title : `Tab ${index + 1}`}
              </span>
            ))}
          </div>
          <div className="p-4 text-sm">{typeof items[0]?.content === "string" ? items[0].content : ""}</div>
        </div>
      );
    }

    case "accordion":
    case "toggle": {
      const items = rows(s);
      return (
        <div className="divide-y divide-border rounded-fq-md border border-border">
          {items.map((item, index) => (
            <details key={index} open={index === 0} className="group px-4 py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium">
                {typeof item.title === "string" ? item.title : "Item"}
                <Icons.ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <p className="pt-2 text-sm text-muted-foreground">
                {typeof item.content === "string" ? item.content : ""}
              </p>
            </details>
          ))}
        </div>
      );
    }

    case "image-box":
    case "icon-box":
      return (
        <div className="flex flex-col gap-2" style={{ alignItems: alignToFlex[align] ?? "flex-start" }}>
          {node.el === "icon-box" ? (
            <LucideIcon name={s.icon} size={36} className="text-primary" />
          ) : str(s, "url") ? (
            <img src={str(s, "url")} alt={str(s, "alt")} loading="lazy" className="h-auto max-w-full rounded-fq-md" />
          ) : (
            <Placeholder label="Choose an image" />
          )}
          <h3 className="text-lg font-semibold">{str(s, "title", "Title")}</h3>
          <p className="text-sm text-muted-foreground">{str(s, "text")}</p>
        </div>
      );

    case "carousel": {
      const items = rows(s);
      if (items.length === 0) return <Placeholder label="Add slides" />;
      return (
        <div className="flex overflow-x-auto" style={{ gap: num(s, "gap", 16, device) }}>
          {items.map((item, index) => (
            <img
              key={index}
              src={typeof item.url === "string" ? item.url : ""}
              alt={typeof item.alt === "string" ? item.alt : ""}
              loading="lazy"
              className="h-40 w-auto shrink-0 rounded-fq-md object-cover"
            />
          ))}
        </div>
      );
    }

    case "gallery": {
      const items = rows(s);
      if (items.length === 0) return <Placeholder label="Add images" />;
      return (
        <div
          className="grid"
          style={{
            gap: num(s, "gap", 12, device),
            gridTemplateColumns: `repeat(${num(s, "columns", 3, device)}, minmax(0, 1fr))`,
          }}
        >
          {items.map((item, index) => (
            <img
              key={index}
              src={typeof item.url === "string" ? item.url : ""}
              alt={typeof item.alt === "string" ? item.alt : ""}
              loading="lazy"
              className="aspect-square w-full rounded-fq-md object-cover"
            />
          ))}
        </div>
      );
    }

    case "icon-list":
      return (
        <ul className="flex flex-col gap-2">
          {rows(s).map((item, index) => (
            <li key={index} className="flex items-center gap-2 text-sm">
              <LucideIcon name={s.icon ?? "Check"} size={16} className="text-primary" />
              <span>{typeof item.text === "string" ? item.text : ""}</span>
            </li>
          ))}
        </ul>
      );

    case "counter":
      return (
        <div className="flex flex-col gap-1" style={{ alignItems: alignToFlex[align] ?? "flex-start" }}>
          <span className="text-4xl font-bold tabular-nums">
            {str(s, "prefix")}
            {num(s, "end", 100, device)}
            {str(s, "suffix")}
          </span>
          <span className="text-sm text-muted-foreground">{str(s, "title")}</span>
        </div>
      );

    case "progress": {
      const percent = Math.min(100, Math.max(0, num(s, "percent", 50, device)));
      return (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-sm">
            <span>{str(s, "title")}</span>
            {s.showPercent !== false && <span className="tabular-nums text-muted-foreground">{percent}%</span>}
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={str(s, "title", "Progress")}
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
          </div>
        </div>
      );
    }

    case "testimonial":
      return (
        <figure className="flex flex-col gap-3">
          <blockquote className="text-lg leading-relaxed">“{str(s, "text")}”</blockquote>
          <figcaption className="flex items-center gap-3 text-sm">
            {str(s, "url") ? (
              <img src={str(s, "url")} alt="" loading="lazy" className="size-10 rounded-full object-cover" />
            ) : null}
            <span>
              <strong className="block font-semibold">{str(s, "author", "Customer")}</strong>
              <span className="text-muted-foreground">{str(s, "role")}</span>
            </span>
          </figcaption>
        </figure>
      );

    case "social":
      return (
        <div className="flex gap-2" style={{ justifyContent: alignToFlex[align] ?? "flex-start" }}>
          {rows(s).map((item, index) => (
            <span
              key={index}
              className="grid size-10 place-items-center rounded-full border border-border text-muted-foreground"
            >
              <LucideIcon
                name={
                  { facebook: "Facebook", instagram: "Instagram", youtube: "Youtube", linkedin: "Linkedin", x: "Twitter", whatsapp: "MessageCircle" }[
                    String(item.network ?? "")
                  ] ?? "Link"
                }
                size={18}
              />
            </span>
          ))}
        </div>
      );

    case "alert": {
      const tone = str(s, "tone", "info");
      const toneClass =
        tone === "success"
          ? "border-success/40 bg-success-soft text-success-foreground"
          : tone === "warning"
            ? "border-warning/40 bg-warning-soft text-warning-foreground"
            : tone === "danger"
              ? "border-danger/40 bg-danger-soft text-danger-foreground"
              : "border-info/40 bg-info-soft text-foreground";
      return (
        <div role="note" className={cn("rounded-fq-md border px-4 py-3 text-sm", toneClass)}>
          <strong className="block font-semibold">{str(s, "title", "Notice")}</strong>
          <span>{str(s, "text")}</span>
        </div>
      );
    }

    case "html":
      return editing ? (
        <pre className="overflow-x-auto rounded-fq-md border border-border bg-muted/40 p-3 text-xs">
          {str(s, "html", "<p>Custom markup</p>")}
        </pre>
      ) : (
        <HtmlSandbox markup={str(s, "html")} title="Custom HTML block" />
      );

    case "app-block":
      return <Placeholder label={`App block: ${str(s, "block", "choose a block")}`} />;

    case "anchor":
      return <span id={str(s, "anchorId", "section")} className="block h-0 w-0" aria-hidden />;

    case "read-more":
      return (
        <p className="border-t border-dashed border-border pt-2 text-xs uppercase tracking-wide text-muted-foreground">
          {str(s, "label", "Read more cut")}
        </p>
      );

    case "rating": {
      const value = num(s, "value", 4.5, device);
      const max = num(s, "max", 5, device);
      return (
        <div className="flex gap-1" style={{ justifyContent: alignToFlex[align] ?? "flex-start" }} aria-label={`${value} out of ${max}`}>
          {Array.from({ length: max }).map((_, index) => (
            <Icons.Star
              key={index}
              size={18}
              aria-hidden
              className={index < Math.round(value) ? "fill-warning text-warning" : "text-muted-foreground"}
            />
          ))}
        </div>
      );
    }

    case "text-path":
      return (
        <p className="text-center text-sm uppercase tracking-[0.35em] text-muted-foreground">
          {str(s, "text", "Text path")}
        </p>
      );

    case "products":
    case "product-categories":
    case "reviews": {
      const columns = num(s, "columns", 4, device);
      const limit = Math.min(num(s, "limit", 8, device), 12);
      return (
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: limit }).map((_, index) => (
            <div key={index} className="rounded-fq-md border border-border p-3">
              <div className="mb-2 aspect-square rounded-fq-sm bg-muted" />
              <p className="text-sm font-medium">Product {index + 1}</p>
              <p className="text-sm text-muted-foreground">৳1,250</p>
            </div>
          ))}
        </div>
      );
    }

    case "add-to-cart":
    case "cart":
    case "checkout":
    case "menu-cart":
      return <Placeholder label={`Live ${node.el.replace("-", " ")} — renders on the storefront`} />;

    default:
      return <Placeholder label={node.el} />;
  }
}
