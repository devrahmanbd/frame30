/**
 * Phase 14 — widget renderers.
 *
 * One renderer per catalogue entry, shared by the canvas and the preview. Every
 * renderer is presentational: it reads resolved settings and paints tokens, so
 * nothing here knows about selection, drag state or the panels.
 */
import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
// NOTE (perf batch 2): named imports only — the previous `import * as Icons`
// with a dynamic registry key defeated tree-shaking and pulled all of
// lucide-react (~1.1MB) into the builder chunk. The set below covers every
// icon the studio catalogue and the icon widget can produce; anything else
// falls back to Star (same as before).
import {
  AlignLeft,
  Anchor,
  BadgeCheck,
  Blocks,
  Check,
  ChevronDown,
  ChevronsUpDown,
  Clock,
  Code,
  GalleryHorizontal,
  GalleryVerticalEnd,
  Gauge,
  Hash,
  Heading,
  Heart,
  Image,
  Images,
  LayoutGrid,
  List,
  Mail,
  MapPin,
  Minus,
  MousePointerClick,
  MoveVertical,
  PanelTop,
  Phone,
  Quote,
  Rows3,
  Search,
  Share2,
  Shield,
  ShoppingCart,
  Spline,
  Square,
  Star,
  TextCursorInput,
  TriangleAlert,
  Truck,
  Type,
  Video,
} from "lucide-react";
import { HtmlSandbox } from "@/components/builder/HtmlSandbox";
import type { NodeSettings, StudioNode } from "@/lib/studio/model";
import {
  resolveResponsive,
  type DeviceKey,
  type Maybe,
} from "@/lib/studio/responsive";
import { cn } from "@/lib/utils";

const ICON_REGISTRY: Record<
  string,
  React.ComponentType<{ className?: string; size?: number }>
> = {
  alignleft: AlignLeft,
  anchor: Anchor,
  badgecheck: BadgeCheck,
  blocks: Blocks,
  check: Check,
  chevrondown: ChevronDown,
  chevronsupdown: ChevronsUpDown,
  clock: Clock,
  code: Code,
  galleryhorizontal: GalleryHorizontal,
  galleryverticalend: GalleryVerticalEnd,
  gauge: Gauge,
  hash: Hash,
  heading: Heading,
  heart: Heart,
  image: Image,
  images: Images,
  layoutgrid: LayoutGrid,
  list: List,
  mail: Mail,
  mappin: MapPin,
  minus: Minus,
  mousepointerclick: MousePointerClick,
  movevertical: MoveVertical,
  paneltop: PanelTop,
  phone: Phone,
  quote: Quote,
  rows3: Rows3,
  search: Search,
  share2: Share2,
  shield: Shield,
  shoppingcart: ShoppingCart,
  cart: ShoppingCart,
  spline: Spline,
  square: Square,
  star: Star,
  textcursorinput: TextCursorInput,
  trianglealert: TriangleAlert,
  truck: Truck,
  type: Type,
  video: Video,
};

export function LucideIcon({
  name,
  className,
  size,
}: {
  name?: unknown;
  className?: string;
  size?: number;
}) {
  const key =
    typeof name === "string" && name
      ? name.toLowerCase().replace(/[^a-z0-9]/g, "")
      : "star";
  const Cmp = ICON_REGISTRY[key] ?? Star;
  return <Cmp className={className} size={size} aria-hidden />;
}

function str(settings: NodeSettings, key: string, fallback = ""): string {
  const value = resolveResponsive(settings[key] as Maybe<string>);
  return typeof value === "string" && value !== "" ? value : fallback;
}

function num(
  settings: NodeSettings,
  key: string,
  fallback: number,
  device: DeviceKey,
): number {
  const value = resolveResponsive(settings[key] as Maybe<number>, device);
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function rows(settings: NodeSettings, key = "items"): NodeSettings[] {
  const value = settings[key];
  if (!Array.isArray(value)) return [];
  return value.map((item) =>
    typeof item === "string" ? { text: item } : ((item ?? {}) as NodeSettings),
  );
}

const alignToFlex: Record<string, string> = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
};

export type RenderProps = {
  node: StudioNode;
  device: DeviceKey;
  editing?: boolean;
};

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
      return (
        <Tag className="leading-tight">
          {str(s, "text", "Add your heading text")}
        </Tag>
      );
    }

    case "text":
      return (
        <p className="leading-relaxed">
          {str(s, "text", "Write something your customers need to know.")}
        </p>
      );

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
          style={{
            borderRadius: num(s, "radius", 12, device),
            width: `${num(s, "width", 100, device)}%`,
          }}
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
            size === "sm"
              ? "min-h-9 px-3 text-sm"
              : size === "lg"
                ? "min-h-12 px-6 text-base"
                : "min-h-11 px-4 text-sm",
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
            borderTopStyle: str(
              s,
              "style",
              "solid",
            ) as CSSProperties["borderTopStyle"],
            borderTopWidth: num(s, "weight", 1, device),
            width: `${num(s, "width", 100, device)}%`,
          }}
        />
      );

    case "spacer":
      return (
        <div aria-hidden style={{ height: num(s, "height", 40, device) }} />
      );

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
        <span
          className="inline-flex"
          style={{ justifyContent: alignToFlex[align] }}
        >
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
                  index === 0
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground",
                )}
              >
                {typeof item.title === "string"
                  ? item.title
                  : `Tab ${index + 1}`}
              </span>
            ))}
          </div>
          <div className="p-4 text-sm">
            {typeof items[0]?.content === "string" ? items[0].content : ""}
          </div>
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
                <ChevronDown
                  className="size-4 shrink-0 transition-transform group-open:rotate-180"
                  aria-hidden
                />
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
        <div
          className="flex flex-col gap-2"
          style={{ alignItems: alignToFlex[align] ?? "flex-start" }}
        >
          {node.el === "icon-box" ? (
            <LucideIcon name={s.icon} size={36} className="text-primary" />
          ) : str(s, "url") ? (
            <img
              src={str(s, "url")}
              alt={str(s, "alt")}
              loading="lazy"
              className="h-auto max-w-full rounded-fq-md"
            />
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
        <div
          className="flex overflow-x-auto"
          style={{ gap: num(s, "gap", 16, device) }}
        >
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
              <LucideIcon
                name={s.icon ?? "Check"}
                size={16}
                className="text-primary"
              />
              <span>{typeof item.text === "string" ? item.text : ""}</span>
            </li>
          ))}
        </ul>
      );

    case "counter":
      return (
        <div
          className="flex flex-col gap-1"
          style={{ alignItems: alignToFlex[align] ?? "flex-start" }}
        >
          <span className="text-4xl font-bold tabular-nums">
            {str(s, "prefix")}
            {num(s, "end", 100, device)}
            {str(s, "suffix")}
          </span>
          <span className="text-sm text-muted-foreground">
            {str(s, "title")}
          </span>
        </div>
      );

    case "progress": {
      const percent = Math.min(100, Math.max(0, num(s, "percent", 50, device)));
      return (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-sm">
            <span>{str(s, "title")}</span>
            {s.showPercent !== false && (
              <span className="tabular-nums text-muted-foreground">
                {percent}%
              </span>
            )}
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={str(s, "title", "Progress")}
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      );
    }

    case "testimonial":
      return (
        <figure className="flex flex-col gap-3">
          <blockquote className="text-lg leading-relaxed">
            “{str(s, "text")}”
          </blockquote>
          <figcaption className="flex items-center gap-3 text-sm">
            {str(s, "url") ? (
              <img
                src={str(s, "url")}
                alt=""
                loading="lazy"
                className="size-10 rounded-full object-cover"
              />
            ) : null}
            <span>
              <strong className="block font-semibold">
                {str(s, "author", "Customer")}
              </strong>
              <span className="text-muted-foreground">{str(s, "role")}</span>
            </span>
          </figcaption>
        </figure>
      );

    case "social":
      return (
        <div
          className="flex gap-2"
          style={{ justifyContent: alignToFlex[align] ?? "flex-start" }}
        >
          {rows(s).map((item, index) => (
            <span
              key={index}
              className="grid size-10 place-items-center rounded-full border border-border text-muted-foreground"
            >
              <LucideIcon
                name={
                  {
                    facebook: "Facebook",
                    instagram: "Instagram",
                    youtube: "Youtube",
                    linkedin: "Linkedin",
                    x: "Twitter",
                    whatsapp: "MessageCircle",
                  }[String(item.network ?? "")] ?? "Link"
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
        <div
          role="note"
          className={cn("rounded-fq-md border px-4 py-3 text-sm", toneClass)}
        >
          <strong className="block font-semibold">
            {str(s, "title", "Notice")}
          </strong>
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
      return (
        <Placeholder
          label={`App block: ${str(s, "block", "choose a block")}`}
        />
      );

    case "anchor":
      return (
        <span
          id={str(s, "anchorId", "section")}
          className="block h-0 w-0"
          aria-hidden
        />
      );

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
        <div
          className="flex gap-1"
          style={{ justifyContent: alignToFlex[align] ?? "flex-start" }}
          aria-label={`${value} out of ${max}`}
        >
          {Array.from({ length: max }).map((_, index) => (
            <Star
              key={index}
              size={18}
              aria-hidden
              className={
                index < Math.round(value)
                  ? "fill-warning text-warning"
                  : "text-muted-foreground"
              }
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
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
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
      return (
        <Placeholder
          label={`Live ${node.el.replace("-", " ")} — renders on the storefront`}
        />
      );

    // Ported from the theme engine (same props, same look): page builders
    // get the storefront vocabulary without the theme studio.
    case "faq": {
      const rows = [1, 2, 3]
        .map((i) => ({
          q: str(s, `q${i}`),
          a: str(s, `a${i}`),
        }))
        .filter((row) => row.q);
      if (rows.length === 0) return <Placeholder label="Add a question" />;
      return (
        <section className="rounded-fq-lg border border-border bg-card p-6">
          {str(s, "heading") && (
            <h3 className="mb-3 text-lg font-semibold">{str(s, "heading")}</h3>
          )}
          <div className="divide-y divide-border">
            {rows.map((row) => (
              <details key={row.q}>
                <summary className="cursor-pointer py-2 text-sm font-medium">
                  {row.q}
                </summary>
                <p className="pb-3 text-sm text-muted-foreground">{row.a}</p>
              </details>
            ))}
          </div>
        </section>
      );
    }

    case "marquee": {
      const text = str(s, "text", "New arrivals every week");
      const speed = num(s, "speed", 30, device);
      const paused = s.pauseOnHover ? "group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused]" : "";
      return (
        <div className="group overflow-hidden rounded-fq-md border border-border bg-card">
          <p
            className={`whitespace-nowrap px-4 py-2 text-sm motion-safe:animate-[fq-marquee_var(--fq-marquee)_linear_infinite] ${paused}`}
            style={{ ["--fq-marquee" as string]: `${Math.min(120, Math.max(5, speed))}s` }}
          >
            {text}
          </p>
        </div>
      );
    }

    case "countdown":
      return <StudioCountdown label={str(s, "label")} endsAt={str(s, "endsAt")} />;

    case "banner": {
      const tone = str(s, "tone", "info");
      const cls =
        tone === "warn"
          ? "bg-warning-soft text-warning-foreground"
          : tone === "success"
            ? "bg-success-soft text-success-foreground"
            : "bg-info-soft text-foreground";
      return (
        <div className={`rounded-fq-md px-4 py-2 text-sm ${cls}`}>
          {str(s, "text", "Free delivery over BDT 2,000")}
        </div>
      );
    }

    case "trust_bar": {
      const items = [1, 2, 3, 4]
        .map((n) => ({
          icon: str(s, `i${n}Icon`),
          title: str(s, `i${n}Title`),
          body: str(s, `i${n}Body`),
        }))
        .filter((item) => item.title);
      if (items.length === 0)
        return <Placeholder label="Add a trust badge" />;
      return (
        <ul className="grid grid-cols-2 gap-4 rounded-fq-lg border border-border bg-card p-4 sm:grid-cols-4">
          {items.map((item) => (
            <li key={item.title} className="flex items-start gap-2">
              <span aria-hidden="true" className="text-lg leading-none">
                {STUDIO_TRUST_ICON[item.icon] ?? "•"}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{item.title}</span>
                {item.body && (
                  <span className="block text-xs text-muted-foreground">
                    {item.body}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      );
    }

    case "announcement_bar":
      return (
        <StudioAnnouncement
          messages={[str(s, "m1"), str(s, "m2"), str(s, "m3")].filter(Boolean)}
          href={str(s, "href")}
          dismissible={s.dismissible !== false}
          rotateMs={num(s, "rotateMs", 6000, device)}
        />
      );

    // Heritage + hero batch ported from the theme engine: same props, same
    // look, so merchants author once and see it everywhere.
    case "heritage_story": {
      const headline = str(s, "headline");
      const body = str(s, "body");
      if (!headline && !body)
        return <Placeholder label="Add a headline" />;
      const image = str(s, "image");
      const imageBlock = (
        <div className="relative overflow-hidden rounded-fq-sm">
          <div className="flex aspect-[4/5] items-center justify-center bg-gradient-to-br from-amber-900/15 to-rose-900/10">
            {image ? (
              <img src={image} alt={headline} className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <span aria-hidden="true" className="text-[6rem] font-bold text-foreground/10 select-none">
                {headline?.charAt(0) || "H"}
              </span>
            )}
          </div>
        </div>
      );
      const textBlock = (
        <div className="flex flex-col justify-center">
          <h3 className="text-2xl font-bold leading-tight sm:text-3xl">{headline}</h3>
          {body && <p className="mt-4 max-w-prose text-sm leading-relaxed text-muted-foreground">{body}</p>}
          {str(s, "ctaLabel") && (
            <p className="mt-6">
              <a href={str(s, "ctaUrl") || "#"} className="inline-flex min-h-11 items-center rounded-fq-sm bg-primary px-6 text-sm font-semibold text-primary-foreground">
                {str(s, "ctaLabel")}
              </a>
            </p>
          )}
        </div>
      );
      const layout = str(s, "layout", "image-left");
      return (
        <section className="grid items-center gap-8 md:grid-cols-2">
          {layout === "image-right" ? (<>{textBlock}{imageBlock}</>) : (<>{imageBlock}{textBlock}</>)}
        </section>
      );
    }

    case "editorial_banner": {
      const headline = str(s, "headline");
      if (!headline) return <Placeholder label="Add a headline" />;
      const image = str(s, "image");
      return (
        <section className="relative overflow-hidden rounded-fq-sm">
          <div className="relative aspect-[3/1] min-h-[200px] w-full">
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-amber-900/20 via-rose-900/10 to-amber-800/20">
              <span aria-hidden="true" className="text-[10rem] font-bold text-foreground/10 select-none">
                {headline?.charAt(0) || "E"}
              </span>
            </div>
            {image && (
              <img src={image} alt={headline} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
            )}
            <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-foreground/70 via-foreground/30 to-transparent p-6 text-background">
              <h3 className="text-2xl font-bold sm:text-3xl">{headline}</h3>
              {str(s, "subhead") && <p className="mt-1 text-sm opacity-90">{str(s, "subhead")}</p>}
              {str(s, "ctaLabel") && (
                <p className="mt-3">
                  <a href={str(s, "ctaUrl") || "#"} className="inline-flex min-h-10 items-center rounded-fq-sm bg-card px-5 text-sm font-semibold text-card-foreground">
                    {str(s, "ctaLabel")}
                  </a>
                </p>
              )}
            </div>
          </div>
        </section>
      );
    }

    case "editorial_hero": {
      const image = str(s, "imageUrl");
      const split = str(s, "layout", "stacked") === "split";
      const copy = (
        <div className={split ? "" : "rounded-fq-lg border border-border bg-card p-6 shadow-fq-sm"}>
          {str(s, "eyebrow") && (
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{str(s, "eyebrow")}</p>
          )}
          <h3 className="mt-1 text-3xl font-semibold leading-tight md:text-5xl">{str(s, "heading", "The new season")}</h3>
          {str(s, "body") && <p className="mt-3 max-w-prose text-sm text-muted-foreground">{str(s, "body")}</p>}
          {str(s, "ctaLabel") && (
            <p className="mt-4">
              <a href={str(s, "ctaHref") || "#"} className="inline-flex min-h-11 items-center rounded-fq-md bg-primary px-5 text-sm font-semibold text-primary-foreground">
                {str(s, "ctaLabel")}
              </a>
            </p>
          )}
        </div>
      );
      const visual = (
        <div className="relative overflow-hidden rounded-fq-lg">
          <div className="flex aspect-[4/3] items-center justify-center bg-gradient-to-br from-amber-900/15 to-rose-900/10">
            {image ? (
              <img src={image} alt={str(s, "heading")} className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <span aria-hidden="true" className="text-[5rem] font-bold text-foreground/10 select-none">E</span>
            )}
          </div>
          {s.scrim !== false && image && (
            <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
          )}
        </div>
      );
      return split ? (
        <section className="grid items-center gap-6 md:grid-cols-2">{visual}{copy}</section>
      ) : (
        <section className="space-y-6">{visual}{copy}</section>
      );
    }

    case "lookbook": {
      const tiles = [1, 2, 3, 4]
        .map((n) => ({
          src: str(s, `i${n}Image`),
          alt: str(s, `i${n}Alt`),
          href: str(s, `i${n}Href`),
        }))
        .filter((tile) => tile.src);
      if (tiles.length === 0) return <Placeholder label="Add a lookbook image" />;
      const offset = s.offset !== false;
      return (
        <section>
          {str(s, "heading") && <h3 className="mb-4 text-lg font-semibold">{str(s, "heading")}</h3>}
          <div className="grid gap-4 sm:grid-cols-2">
            {tiles.map((tile, index) => {
              const body = tile.src ? (
                <img src={tile.src} alt={tile.alt} loading="lazy" className={`w-full rounded-fq-md object-cover ${index % 2 === 0 ? "aspect-[3/4]" : "aspect-square"}`} />
              ) : null;
              return (
                <div key={index} className={offset && index % 2 === 1 ? "sm:mt-12" : undefined}>
                  {tile.href ? <a href={tile.href}>{body}</a> : body}
                </div>
              );
            })}
          </div>
        </section>
      );
    }

    case "hero": {
      const slides = [
        { heading: str(s, "heading"), image: str(s, "image") },
        { heading: str(s, "s2Heading"), image: str(s, "s2Image") },
        { heading: str(s, "s3Heading"), image: str(s, "s3Image") },
      ].filter((slide, index) => index === 0 || slide.heading || slide.image);
      const [index, setIndex] = useState(0);
      const active = slides[Math.min(index, slides.length - 1)]!;
      const center = str(s, "align", "left") === "center";
      return (
        <section className={`overflow-hidden rounded-fq-lg border border-border bg-info-soft ${center ? "text-center" : ""}`}>
          {active.image && (
            <img src={active.image} alt={active.heading} loading="lazy" className="aspect-[21/9] w-full object-cover" />
          )}
          <div className="p-8">
            <h3 className="font-bangla-display text-3xl font-bold sm:text-4xl">{active.heading || "Welcome to our store"}</h3>
            {index === 0 && str(s, "subheading") && (
              <p className="mt-2 max-w-xl text-muted-foreground">{str(s, "subheading")}</p>
            )}
            {str(s, "ctaLabel") && (
              <p className="mt-4">
                <a href={str(s, "ctaHref") || "#"} className="inline-block rounded-fq-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                  {str(s, "ctaLabel")}
                </a>
              </p>
            )}
            {slides.length > 1 && (
              <div className="mt-4 flex gap-2" role="group" aria-label="Slides">
                {slides.map((slide, i) => (
                  <button key={i} type="button" onClick={() => setIndex(i)} aria-current={i === index} aria-label={`Slide ${i + 1}`}
                    className={`h-11 w-11 rounded-fq-md border border-border text-xs tabular-nums ${i === index ? "bg-primary text-primary-foreground" : "bg-card"}`}>
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      );
    }

    case "textile_showcase": {
      const items = rows(s, "items");
      if (items.length === 0) return <Placeholder label="Add showcase items" />;
      return (
        <section>
          {str(s, "headline") && <h3 className="mb-6 text-2xl font-bold">{str(s, "headline")}</h3>}
          <div className="grid gap-6 sm:grid-cols-2">
            {items.map((item, i) => (
              <div key={i} className="overflow-hidden rounded-fq-sm border border-border bg-card">
                <div className="flex aspect-[4/3] items-center justify-center bg-gradient-to-br from-amber-100 to-rose-50">
                  {rstr(item, "image") ? (
                    <img src={rstr(item, "image")} alt={rstr(item, "title")} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <span aria-hidden="true" className="text-5xl font-bold text-foreground/10 select-none">
                      {rstr(item, "title")?.charAt(0) || "T"}
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <p className="text-sm font-medium">{rstr(item, "title")}</p>
                  {rstr(item, "subtitle") && (
                    <p className="mt-1 text-xs text-muted-foreground">{rstr(item, "subtitle")}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      );
    }

    case "department_grid": {
      const departments = rows(s, "departments");
      if (departments.length === 0) return <Placeholder label="Add departments" />;
      const columns = num(s, "columns", 4, device);
      const gridCols =
        columns <= 2 ? "sm:grid-cols-2" : columns <= 3 ? "sm:grid-cols-3" : columns <= 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3 lg:grid-cols-5";
      return (
        <section>
          <div className={`grid gap-4 ${gridCols}`}>
            {departments.map((dept, i) => {
              const title = rstr(dept, "title") || rstr(dept, "name");
              return (
                <a key={i} href={rstr(dept, "href") || "#"} className="group relative overflow-hidden rounded-fq-sm border border-border bg-card">
                  <div className="flex aspect-[3/4] items-center justify-center bg-gradient-to-br from-amber-100 to-rose-50">
                    {rstr(dept, "image") ? (
                      <img src={rstr(dept, "image")} alt={title} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <span aria-hidden="true" className="text-4xl font-bold text-foreground/15 select-none">
                        {title?.charAt(0) || "D"}
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-medium">{title}</p>
                  </div>
                </a>
              );
            })}
          </div>
        </section>
      );
    }

    case "story_trunk": {
      const items = rows(s, "items");
      if (items.length === 0) return <Placeholder label="Add timeline items" />;
      return (
        <section>
          {str(s, "headline") && <h3 className="mb-6 text-2xl font-bold">{str(s, "headline")}</h3>}
          <ol className="relative space-y-8 border-l-2 border-border pl-6">
            {items.map((item, i) => (
              <li key={i} className="relative">
                <span aria-hidden="true" className="absolute -left-[31px] top-1 size-3 rounded-full bg-primary" />
                {rstr(item, "year") && (
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{rstr(item, "year")}</p>
                )}
                <p className="mt-1 text-base font-semibold">{rstr(item, "title")}</p>
                {rstr(item, "body") && <p className="mt-1 text-sm text-muted-foreground">{rstr(item, "body")}</p>}
                {rstr(item, "image") && (
                  <img src={rstr(item, "image")} alt={rstr(item, "title")} loading="lazy" className="mt-3 max-w-sm rounded-fq-md object-cover" />
                )}
              </li>
            ))}
          </ol>
        </section>
      );
    }

    case "marquee_strip": {
      const items = rows(s, "items");
      if (items.length === 0) return <Placeholder label="Add strip items" />;
      const speed = str(s, "speed", "normal");
      const duration = speed === "slow" ? "40s" : speed === "fast" ? "15s" : "25s";
      const content = items
        .map((item) => `${rstr(item, "icon") ? rstr(item, "icon") + " " : ""}${rstr(item, "text")}`)
        .join("  •  ");
      return (
        <div className="group overflow-hidden rounded-fq-md border border-border bg-card">
          <p className="whitespace-nowrap px-4 py-2 text-sm motion-safe:animate-[fq-marquee_var(--fq-marquee)_linear_infinite] group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused]"
            style={{ ["--fq-marquee" as string]: duration }}>
            {content}
          </p>
        </div>
      );
    }

    case "hero_carousel": {
      const slides = rows(s, "slides");
      if (slides.length === 0) return <Placeholder label="Add carousel slides" />;
      return (
        <StudioCarousel
          count={slides.length}
          autoAdvanceMs={num(s, "autoAdvanceMs", 5000, device)}
          render={(index) => {
            const slide = slides[index]!;
            return (
              <div className="relative aspect-[16/9] w-full sm:aspect-[21/9]">
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-amber-900/20 via-rose-900/10 to-amber-800/20">
                  <span aria-hidden="true" className="text-[8rem] font-bold text-foreground/10 select-none">
                    {rstr(slide, "headline")?.charAt(0) || "H"}
                  </span>
                </div>
                {rstr(slide, "image") && (
                  <img src={rstr(slide, "image")} alt={rstr(slide, "headline")} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                )}
                <div className="absolute inset-0 flex flex-col items-start justify-end bg-gradient-to-t from-black/60 via-black/20 to-transparent p-6 sm:p-12">
                  <div className="max-w-2xl">
                    <p className="text-3xl font-bold leading-tight text-primary-foreground sm:text-5xl">{rstr(slide, "headline")}</p>
                    {rstr(slide, "subhead") && (
                      <p className="mt-3 max-w-lg text-base text-primary-foreground/80 sm:text-lg">{rstr(slide, "subhead")}</p>
                    )}
                    {rstr(slide, "ctaLabel") && (
                      <a href={rstr(slide, "ctaUrl") || "#"} className="mt-6 inline-flex min-h-12 items-center rounded-fq-sm bg-card px-6 text-sm font-semibold text-card-foreground">
                        {rstr(slide, "ctaLabel")}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          }}
        />
      );
    }

    case "testimonial_carousel": {
      const testimonials = rows(s, "testimonials");
      if (testimonials.length === 0) return <Placeholder label="Add testimonials" />;
      return (
        <StudioCarousel
          count={testimonials.length}
          autoAdvanceMs={num(s, "autoAdvanceMs", 6000, device)}
          render={(index) => {
            const t = testimonials[index]!;
            return (
              <figure className="rounded-fq-lg border border-border bg-card p-6 text-center">
                <blockquote className="text-base italic leading-relaxed">“{rstr(t, "quote") || "Share a customer story."}”</blockquote>
                <figcaption className="mt-3 flex items-center justify-center gap-2 text-sm">
                  {rstr(t, "avatar") && (
                    <img src={rstr(t, "avatar")} alt="" loading="lazy" className="size-8 rounded-full object-cover" />
                  )}
                  <span>
                    <strong className="font-semibold">{rstr(t, "author") || "Customer"}</strong>
                    {rstr(t, "role") && <span className="text-muted-foreground"> · {rstr(t, "role")}</span>}
                  </span>
                </figcaption>
              </figure>
            );
          }}
        />
      );
    }

    default:
      return <Placeholder label={node.el} />;
  }
}

/** Row-string reader for repeater items (mirrors str() for row maps). */
function rstr(row: NodeSettings, key: string, fallback = ""): string {
  const value = row[key];
  return typeof value === "string" && value !== "" ? value : fallback;
}

/** Shared rotating carousel shell: dots, hover pause, auto-advance. */
function StudioCarousel({
  count,
  autoAdvanceMs,
  render,
}: {
  count: number;
  autoAdvanceMs: number;
  render: (index: number) => ReactNode;
}) {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const safeMs = Math.min(15000, Math.max(1000, autoAdvanceMs));
  useEffect(() => {
    if (paused || count <= 1) return;
    const id = window.setInterval(
      () => setCurrent((i) => (i + 1) % count),
      safeMs,
    );
    return () => window.clearInterval(id);
  }, [paused, count, safeMs]);
  const index = Math.min(current, count - 1);
  return (
    <section
      className="relative overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {render(index)}
      {count > 1 && (
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
          {Array.from({ length: count }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setCurrent(i)}
              aria-label={`Slide ${i + 1}`}
              className={`h-2 rounded-full transition ${i === index ? "w-6 bg-primary-foreground" : "w-2 bg-primary-foreground/50"}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

const STUDIO_TRUST_ICON: Record<string, string> = {
  delivery: "🚚",
  returns: "↩",
  secure: "🔒",
  support: "💬",
  quality: "★",
};

/** Self-contained countdown: ticks client-side, static text once passed. */
function StudioCountdown({ label, endsAt }: { label: string; endsAt: string }) {
  const target = Date.parse(endsAt);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (Number.isNaN(target)) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [target]);
  if (Number.isNaN(target))
    return <Placeholder label="Set an end date for the countdown" />;
  const diff = Math.max(0, target - now);
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const sec = Math.floor((diff % 60_000) / 1000);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  parts.push(`${h}h`, `${m}m`, `${sec}s`);
  return (
    <div
      className="rounded-fq-md border border-border bg-card px-4 py-3 text-center"
      role="timer"
      aria-live="off"
    >
      {label && (
        <p className="text-xs text-muted-foreground">
          {label}
        </p>
      )}
      <p className="font-bangla-display text-2xl font-bold tabular-nums">
        {diff > 0 ? parts.join(" ") : "Ended"}
      </p>
    </div>
  );
}

/** Rotating announcement with dismiss; static first message without JS motion. */
function StudioAnnouncement({
  messages,
  href,
  dismissible,
  rotateMs,
}: {
  messages: string[];
  href: string;
  dismissible: boolean;
  rotateMs: number;
}) {
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (rotateMs < 1000 || messages.length < 2) return;
    const id = window.setInterval(
      () => setIndex((i) => (i + 1) % messages.length),
      rotateMs,
    );
    return () => window.clearInterval(id);
  }, [rotateMs, messages.length]);
  if (dismissed || messages.length === 0) return null;
  const message = messages[Math.min(index, messages.length - 1)] as string;
  return (
    <div className="flex items-center justify-center gap-3 bg-primary px-4 py-2 text-center text-xs font-medium text-primary-foreground">
      <p aria-live="polite" className="min-w-0 truncate">
        {href ? (
          <a href={href} className="underline underline-offset-2">
            {message}
          </a>
        ) : (
          message
        )}
      </p>
      {dismissible && (
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss announcement"
          className="shrink-0 rounded-fq-sm px-1 leading-none"
        >
          ×
        </button>
      )}
    </div>
  );
}
