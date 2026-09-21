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
  ArrowLeftRight,
  BadgeCheck,
  Blocks,
  Check,
  ChevronDown,
  ChevronsUpDown,
  CircleHelp,
  Clock,
  Code,
  Columns2,
  Compass,
  CreditCard,
  ClipboardList,
  FileText,
  Filter,
  GalleryHorizontal,
  GalleryVerticalEnd,
  Gauge,
  Gift,
  Hash,
  Heading,
  Heart,
  Image,
  Images,
  Layers,
  LayoutGrid,
  List,
  Mail,
  MapPin,
  Megaphone,
  Menu,
  MessageSquareQuote,
  Minus,
  MousePointerClick,
  MoveVertical,
  Package,
  PackagePlus,
  Palette,
  PanelTop,
  Phone,
  Quote,
  Rows3,
  Ruler,
  Search,
  Share2,
  Shield,
  ShieldCheck,
  Shirt,
  ShoppingCart,
  Spline,
  Square,
  Star,
  Store,
  Tags,
  TextCursorInput,
  TriangleAlert,
  Trophy,
  Truck,
  Type,
  Video,
  Zap,
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
  circlehelp: CircleHelp,
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
  package: Package,
  packageplus: PackagePlus,
  palette: Palette,
  paneltop: PanelTop,
  phone: Phone,
  quote: Quote,
  rows3: Rows3,
  ruler: Ruler,
  search: Search,
  share2: Share2,
  shield: Shield,
  shieldcheck: ShieldCheck,
  shirt: Shirt,
  shoppingcart: ShoppingCart,
  cart: ShoppingCart,
  store: Store,
  tags: Tags,
  trophy: Trophy,
  zap: Zap,
  gift: Gift,
  layers: Layers,
  menu: Menu,
  messagesquarequote: MessageSquareQuote,
  megaphone: Megaphone,
  filter: Filter,
  compass: Compass,
  filetext: FileText,
  clipboardlist: ClipboardList,
  creditcard: CreditCard,
  columns2: Columns2,
  arrowleftright: ArrowLeftRight,
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
    case "product_qna": {
      const fromItems = rows(s, "items")
        .map((row) => ({
          q: String(row.question ?? ""),
          a: String(row.answer ?? ""),
        }))
        .filter((row) => row.q);
      const list =
        fromItems.length > 0
          ? fromItems
          : [1, 2, 3]
              .map((i) => ({
                q: str(s, `q${i}`),
                a: str(s, `a${i}`),
              }))
              .filter((row) => row.q);
      if (list.length === 0)
        return (
          <Placeholder
            label="Live questions and answers — renders on the storefront"
          />
        );
      return (
        <section className="rounded-fq-lg border border-border bg-card p-6">
          {str(s, "heading") && (
            <h3 className="mb-3 text-lg font-semibold">{str(s, "heading")}</h3>
          )}
          <div className="divide-y divide-border">
            {list.map((row) => (
              <details key={row.q}>
                <summary className="cursor-pointer py-2 text-sm font-medium">
                  {row.q}
                </summary>
                <p className="pb-3 text-sm text-muted-foreground">{row.a}</p>
              </details>
            ))}
          </div>
          {str(s, "askLabel") && (
            <p className="mt-3">
              <span className="inline-flex min-h-11 items-center rounded-fq-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
                {str(s, "askLabel")}
              </span>
            </p>
          )}
        </section>
      );
    }

    case "product_grid":
    case "product_rail":
    case "product_media":
    case "product_meta":
    case "collection_grid":
    case "account_cart":
    case "cart_drawer":
    case "cart_lines":
    case "cart_summary":
    case "checkout_steps":
    case "search_command":
    case "facet_sidebar":
    case "pagination":
    case "result_toolbar":
    case "blog_archive":
    case "blog_pager":
    case "blog_terms":
    case "review_list":
    case "rating_summary":
    case "recently_viewed":
    case "wishlist_button":
    case "compare_tray":
    case "bundle_offer":
      return (
        <Placeholder
          label={`Live ${node.el.replace(/_/g, " ")} — renders on the storefront`}
        />
      );

    // Ported from the theme engine (same props, same look): page builders
    // get the storefront vocabulary without the theme studio.
    case "faq": {
      const fromItems = rows(s, "items")
        .map((row) => ({
          q: String(row.question ?? ""),
          a: String(row.answer ?? ""),
        }))
        .filter((row) => row.q);
      const list =
        fromItems.length > 0
          ? fromItems
          : [1, 2, 3]
              .map((i) => ({
                q: str(s, `q${i}`),
                a: str(s, `a${i}`),
              }))
              .filter((row) => row.q);
      if (list.length === 0) return <Placeholder label="Add a question" />;
      return (
        <section className="rounded-fq-lg border border-border bg-card p-6">
          {str(s, "heading") && (
            <h3 className="mb-3 text-lg font-semibold">{str(s, "heading")}</h3>
          )}
          <div className="divide-y divide-border">
            {list.map((row) => (
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

    case "feature_row": {
      const items = ["itemOne", "itemTwo", "itemThree"]
        .map((k) => str(s, k))
        .filter(Boolean);
      if (items.length === 0) return <Placeholder label="Add a feature" />;
      return (
        <ul className="grid gap-3 sm:grid-cols-3">
          {items.map((item) => (
            <li key={item} className="rounded-fq-md border border-border bg-card p-4 text-sm">
              {item}
            </li>
          ))}
        </ul>
      );
    }

    case "utility_bar": {
      const links = ["l1", "l2", "l3"]
        .map((p) => ({ label: str(s, `${p}Label`), href: str(s, `${p}Href`) }))
        .filter((l) => l.label);
      return (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted px-4 py-1.5 text-xs text-muted-foreground">
          <p className="min-w-0 truncate">{str(s, "note")}</p>
          <nav aria-label="Utility" className="flex items-center gap-3">
            {links.map((l) => (
              <a key={l.label} href={l.href || "#"} className="hover:text-foreground">{l.label}</a>
            ))}
          </nav>
        </div>
      );
    }

    case "footer_sitemap": {
      const cols = [1, 2, 3, 4]
        .map((n) => ({ title: str(s, `c${n}Title`), links: parseLinks(str(s, `c${n}Links`)) }))
        .filter((c) => c.title || c.links.length > 0);
      if (cols.length === 0) return <Placeholder label="Add a sitemap column" />;
      return (
        <nav aria-label="Footer" className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {cols.map((col) => (
            <div key={col.title}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{col.title}</p>
              <ul className="mt-2 space-y-1">
                {col.links.map((l) => (
                  <li key={`${col.title}-${l.label}`}>
                    <a href={l.href} className="text-sm hover:underline">{l.label}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      );
    }

    case "doc_links": {
      const docs = [1, 2, 3, 4]
        .map((i) => ({ label: str(s, `d${i}Label`), href: str(s, `d${i}Href`), meta: str(s, `d${i}Meta`) }))
        .filter((d) => d.label);
      if (docs.length === 0) return <Placeholder label="Add a document" />;
      return (
        <section className="rounded-fq-lg border border-border bg-card p-4">
          {str(s, "heading") && <h3 className="mb-3 text-base font-semibold">{str(s, "heading")}</h3>}
          <ul className="space-y-2">
            {docs.map((d) => (
              <li key={d.label}>
                <span className="flex min-h-11 items-center justify-between gap-3 rounded-fq-md border border-border px-3 text-sm">
                  <span className="min-w-0">{d.label}</span>
                  {d.meta && <span className="shrink-0 text-xs text-muted-foreground">{d.meta}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      );
    }

    case "claim_chips": {
      const claims = [1, 2, 3, 4, 5, 6]
        .map((i) => ({ label: str(s, `c${i}Label`), source: str(s, `c${i}Source`) }))
        .filter((c) => c.label);
      if (claims.length === 0) return <Placeholder label="Add a claim" />;
      return (
        <section className="rounded-fq-lg border border-border bg-card p-4">
          {str(s, "heading") && <h3 className="mb-3 text-base font-semibold">{str(s, "heading")}</h3>}
          <ul className="flex flex-wrap gap-2">
            {claims.map((c) => (
              <li key={c.label}>
                <span className="inline-flex min-h-8 items-center rounded-full border border-border px-3 py-1 text-sm" title={c.source || undefined}>
                  {c.label}
                </span>
              </li>
            ))}
          </ul>
        </section>
      );
    }

    case "texture_strip": {
      const tiles = [1, 2, 3, 4]
        .map((i) => ({ src: str(s, `t${i}Image`), label: str(s, `t${i}Label`), alt: str(s, `t${i}Alt`) }))
        .filter((t) => t.src);
      if (tiles.length === 0) return <Placeholder label="Add a texture image" />;
      return (
        <section>
          {str(s, "heading") && <h3 className="mb-3 text-base font-semibold">{str(s, "heading")}</h3>}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {tiles.map((t) => (
              <li key={t.src} className="min-w-0 text-center">
                <img src={t.src} alt={t.alt || t.label} loading="lazy" className="aspect-square w-full rounded-fq-md object-cover" />
                {t.label && <p className="mt-1 text-xs text-muted-foreground">{t.label}</p>}
              </li>
            ))}
          </ul>
        </section>
      );
    }

    case "split_feature": {
      const heading = str(s, "heading");
      const flip = s.flip === true;
      const visual = str(s, "imageUrl") ? (
        <img src={str(s, "imageUrl")} alt={str(s, "imageAlt") || heading} loading="lazy" className="aspect-[4/3] w-full rounded-fq-lg object-cover" />
      ) : (
        <div className="grid aspect-[4/3] place-items-center rounded-fq-lg bg-muted text-2xl font-bold text-muted-foreground">Image</div>
      );
      return (
        <section className="grid items-center gap-6 md:grid-cols-2">
          <div className={flip ? "md:order-2" : undefined}>{visual}</div>
          <div className={flip ? "md:order-1" : undefined}>
            {str(s, "eyebrow") && <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{str(s, "eyebrow")}</p>}
            <h3 className="text-2xl font-semibold">{heading || "Feature"}</h3>
            {str(s, "body") && <p className="mt-3 max-w-prose text-sm text-muted-foreground">{str(s, "body")}</p>}
            {str(s, "ctaLabel") && (
              <p className="mt-4">
                <a href={str(s, "ctaHref") || "#"} className="inline-flex min-h-11 items-center rounded-fq-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
                  {str(s, "ctaLabel")}
                </a>
              </p>
            )}
          </div>
        </section>
      );
    }

    case "notice": {
      const text = str(s, "text");
      if (!text) return <Placeholder label="Add a notice message" />;
      const tone = str(s, "tone", "info");
      const cls =
        tone === "success" ? "bg-success-soft text-success-foreground"
        : tone === "warning" ? "bg-warning-soft text-warning-foreground"
        : tone === "danger" ? "border-danger/40 bg-danger-soft text-danger-foreground"
        : "bg-info-soft text-foreground";
      return (
        <div role="status" className={cn("rounded-fq-md px-4 py-3 text-sm", cls)}>
          <p className="min-w-0">{text}</p>
        </div>
      );
    }

    case "empty_state": {
      return (
        <section aria-label="No results" className="rounded-fq-lg border border-border bg-card p-6 text-center">
          <p className="text-base font-semibold">{str(s, "heading", "Nothing matches those filters")}</p>
          {str(s, "body") && <p className="mx-auto mt-2 max-w-prose text-sm text-muted-foreground">{str(s, "body")}</p>}
          <p className="mt-4">
            <span className="inline-flex min-h-11 items-center rounded-fq-md border border-border px-4 text-sm font-medium">
              {str(s, "clearLabel", "Clear all filters")}
            </span>
          </p>
        </section>
      );
    }

    case "breadcrumb": {
      return (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>{str(s, "homeLabel", "Home")}</span>
          <span aria-hidden="true">/</span>
          <span aria-current="page" className="text-foreground">…</span>
        </nav>
      );
    }

    case "brand_strip":
      return <Placeholder label="Live brand strip — renders on the storefront" />;

    case "subbrand_bar": {
      const active = str(s, "activeBrand").trim().toLowerCase();
      const brands = [1, 2, 3, 4, 5]
        .map((n) => ({ name: str(s, `b${n}Name`), href: str(s, `b${n}Href`) || "#" }))
        .filter((b) => b.name);
      if (brands.length === 0) return <Placeholder label="Add a brand" />;
      return (
        <nav aria-label="Brand family" className="border-b border-border/40 bg-muted/30 text-xs">
          <ul className="flex items-center gap-1 overflow-x-auto py-1">
            {brands.map((b) => (
              <li key={b.name} className="shrink-0">
                <span className={cn("inline-flex items-center rounded px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest", b.name.toLowerCase() === active ? "bg-foreground font-bold text-background" : "text-muted-foreground")}>
                  {b.name}
                </span>
              </li>
            ))}
          </ul>
        </nav>
      );
    }

    case "support_strip": {
      const tiles = [1, 2, 3, 4]
        .map((i) => ({ title: str(s, `t${i}Title`), body: str(s, `t${i}Body`), href: str(s, `t${i}Href`) }))
        .filter((t) => t.title);
      if (tiles.length === 0) return <Placeholder label="Add a support tile" />;
      return (
        <section>
          {str(s, "heading") && <h3 className="mb-3 text-base font-semibold">{str(s, "heading")}</h3>}
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {tiles.map((t) => (
              <li key={t.title} className="min-w-0 rounded-fq-md border border-border bg-card p-3">
                <span className="block text-sm font-medium">{t.title}</span>
                {t.body && <span className="block text-sm text-muted-foreground">{t.body}</span>}
              </li>
            ))}
          </ul>
        </section>
      );
    }

    case "social_strip": {
      const images = [1, 2, 3, 4, 5, 6].map((n) => str(s, `i${n}Image`)).filter(Boolean);
      if (images.length === 0) return <Placeholder label="Add a social image" />;
      return (
        <section>
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">{str(s, "heading")}</p>
          <div className="flex gap-3 overflow-x-auto">
            {images.map((src) => (
              <img key={src} src={src} alt="" loading="lazy" className="aspect-square w-40 shrink-0 rounded-fq-md object-cover" />
            ))}
          </div>
        </section>
      );
    }

    case "logo": {
      const image = str(s, "image");
      const wordmark = str(s, "text");
      if (!image && !wordmark) return <Placeholder label="Add a logo" />;
      const body = image ? (
        <img src={image} alt={str(s, "alt") || wordmark} style={{ height: num(s, "height", 40, device), width: "auto" }} loading="eager" decoding="async" />
      ) : (
        <span className="text-xl font-bold tracking-tight">{wordmark}</span>
      );
      return <span className="inline-flex items-center">{body}</span>;
    }

    case "how_to_use": {
      const steps = [1, 2, 3, 4, 5]
        .map((i) => ({ title: str(s, `s${i}Title`), body: str(s, `s${i}Body`) }))
        .filter((x) => x.title);
      if (steps.length === 0) return <Placeholder label="Add a step" />;
      return (
        <section className="rounded-fq-lg border border-border bg-card p-4">
          {str(s, "heading") && <h3 className="mb-3 text-base font-semibold">{str(s, "heading")}</h3>}
          <ol className="space-y-3">
            {steps.map((x, i) => (
              <li key={x.title} className="flex gap-3">
                <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border text-xs tabular-nums">{i + 1}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{x.title}</span>
                  {x.body && <span className="block text-sm text-muted-foreground">{x.body}</span>}
                </span>
              </li>
            ))}
          </ol>
        </section>
      );
    }

    case "buying_guide": {
      const links = [1, 2, 3, 4]
        .map((i) => ({ label: str(s, `l${i}Label`), href: str(s, `l${i}Href`) }))
        .filter((l) => l.label);
      if (!str(s, "body") && links.length === 0) return <Placeholder label="Add guide text" />;
      return (
        <section className="rounded-fq-lg border border-border bg-card p-4">
          {str(s, "heading") && <h3 className="mb-2 text-base font-semibold">{str(s, "heading")}</h3>}
          {str(s, "body") && <p className="whitespace-pre-line text-sm text-muted-foreground">{str(s, "body")}</p>}
          {links.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {links.map((l) => (
                <li key={l.label}>
                  <span className="inline-flex min-h-11 items-center rounded-fq-md border border-border px-3 text-sm">{l.label}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      );
    }

    case "care_panel": {
      return (
        <section className="rounded-fq-md border border-border bg-card p-4">
          <h3 className="text-sm font-semibold">{str(s, "heading", "Material & care")}</h3>
          <dl className="mt-2 space-y-2 text-sm">
            {str(s, "composition") && (
              <div><dt className="font-medium">Composition</dt><dd className="m-0 text-muted-foreground">{str(s, "composition")}</dd></div>
            )}
            {str(s, "care") && (
              <div><dt className="font-medium">Care</dt><dd className="m-0 whitespace-pre-line text-muted-foreground">{str(s, "care")}</dd></div>
            )}
            {str(s, "origin") && (
              <div><dt className="font-medium">Made in</dt><dd className="m-0 text-muted-foreground">{str(s, "origin")}</dd></div>
            )}
          </dl>
        </section>
      );
    }

    case "safety_note": {
      const body = str(s, "body");
      if (!body) return <Placeholder label="Add safety guidance" />;
      return (
        <section className="rounded-fq-md border border-border bg-card p-4">
          {str(s, "heading") && <h3 className="text-sm font-semibold">{str(s, "heading")}</h3>}
          <p className="mt-1 text-sm">{body}</p>
          {str(s, "howTo") && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium">{str(s, "howToLabel", "How to patch test")}</summary>
              <p className="whitespace-pre-line pt-2 text-sm text-muted-foreground">{str(s, "howTo")}</p>
            </details>
          )}
        </section>
      );
    }

    case "fit_note": {
      const label = FIT_LABEL[str(s, "fit")] ?? FIT_LABEL["true"];
      return (
        <p className="rounded-fq-md border border-border bg-muted/40 p-3 text-sm">
          <span className="font-medium">{label}</span>
          {str(s, "note") && <span className="text-muted-foreground"> · {str(s, "note")}</span>}
          {(str(s, "modelHeight") || str(s, "modelSize")) && (
            <span className="block text-xs text-muted-foreground">
              Model: {str(s, "modelHeight")} {str(s, "modelSize") && `· ${str(s, "modelSize")}`}
            </span>
          )}
        </p>
      );
    }

    case "authenticity_badge": {
      const label = str(s, "label");
      if (!label) return <Placeholder label="Add a badge label" />;
      const href = str(s, "source");
      return (
        <p className="flex flex-wrap items-center gap-2 rounded-fq-md border border-border bg-card px-3 py-2 text-sm">
          <span aria-hidden="true">{s.verified ? "✓" : "•"}</span>
          <span className="font-medium">{label}</span>
          {str(s, "note") && <span className="text-muted-foreground">{str(s, "note")}</span>}
          {href && <a href={href} className="underline underline-offset-2">{href.replace(/^https?:\/\//, "")}</a>}
        </p>
      );
    }

    case "sustain_badge": {
      const claims = [1, 2, 3]
        .map((n) => ({ label: str(s, `c${n}Label`), source: str(s, `c${n}Source`) }))
        .filter((cl) => cl.label);
      if (claims.length === 0) return <Placeholder label="Add a sustainability claim" />;
      return (
        <section aria-label={str(s, "heading", "Sustainability")}>
          {str(s, "heading") && <p className="mb-2 text-sm font-medium">{str(s, "heading")}</p>}
          <ul className="flex list-none flex-wrap gap-2 p-0">
            {claims.map((cl) => (
              <li key={cl.label}>
                <span title={cl.source || undefined} className="inline-flex min-h-11 items-center rounded-full border border-border px-3 text-xs">{cl.label}</span>
              </li>
            ))}
          </ul>
        </section>
      );
    }

    case "discount_badge": {
      const price = num(s, "priceMinor", 0, device);
      const was = num(s, "compareAtMinor", 0, device);
      if (!(was > price)) return <Placeholder label="Set a was-price above the price" />;
      const pct = Math.round(((was - price) / was) * 100);
      return (
        <p className="inline-flex flex-wrap items-center gap-2">
          {str(s, "label") && <span className="text-sm text-muted-foreground">{str(s, "label")}</span>}
          <span className="rounded-fq-md bg-destructive/10 px-2 py-0.5 text-xs font-semibold tabular-nums">Save {pct}%</span>
          <span className="rounded-fq-md bg-success-soft px-2 py-0.5 text-xs font-semibold tabular-nums">{pct}% off</span>
        </p>
      );
    }

    case "batch_info": {
      const order: [string, string][] = [
        [str(s, "mfgLabel", "Manufactured"), str(s, "mfgDate")],
        [str(s, "expiryLabel", "Best before"), str(s, "expiryDate")],
        [str(s, "batchLabel", "Batch"), str(s, "batchCode")],
      ].filter(([, v]) => v) as [string, string][];
      const pao = num(s, "paoMonths", 0, device);
      if (order.length === 0 && !pao) return <Placeholder label="Add a batch date or code" />;
      return (
        <section className="rounded-fq-lg border border-border bg-card p-4">
          {str(s, "heading") && <h3 className="mb-2 text-lg font-semibold">{str(s, "heading")}</h3>}
          <dl className="text-sm">
            {order.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-border py-2 last:border-b-0">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="tabular-nums" dir="ltr">{v}</dd>
              </div>
            ))}
          </dl>
          {pao > 0 && <p className="mt-2 text-xs text-muted-foreground">Best used within {pao} months of opening.</p>}
        </section>
      );
    }

    case "delivery_promise": {
      const zones: [string, string][] = [
        [str(s, "insideLabel"), str(s, "insideDays")],
        [str(s, "outsideLabel"), str(s, "outsideDays")],
      ].filter(([l]) => l) as [string, string][];
      if (zones.length === 0) return <Placeholder label="Add a delivery zone" />;
      return (
        <section aria-label={str(s, "heading", "Delivery")} className="rounded-fq-lg border border-border bg-card p-4">
          <h3 className="mb-3 text-lg font-semibold">{str(s, "heading", "Delivery")}</h3>
          <dl className="space-y-1 text-sm">
            {zones.map(([l, d]) => (
              <div key={l} className="flex justify-between gap-3"><dt className="text-muted-foreground">{l}</dt><dd>{d}</dd></div>
            ))}
          </dl>
          {str(s, "note") && <p className="mt-2 text-xs text-muted-foreground">{str(s, "note")}</p>}
        </section>
      );
    }

    case "free_shipping_bar":
      return <Placeholder label="Live free shipping bar — renders on the storefront" />;

    case "stock_delivery":
      return <Placeholder label="Live stock and dispatch — renders on the storefront" />;

    case "rank_list":
      return <Placeholder label="Live rank list — renders on the storefront" />;

    case "seller_card": {
      const name = str(s, "name");
      if (!name) return <Placeholder label="Add a seller name" />;
      return (
        <section aria-label="Seller" className="rounded-fq-lg border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            {str(s, "logoUrl") && <img src={str(s, "logoUrl")} alt="" loading="lazy" className="h-12 w-12 rounded-fq-md border border-border object-cover" />}
            <div className="min-w-0">
              <p className="truncate font-medium">{name}</p>
              {str(s, "tagline") && <p className="truncate text-sm text-muted-foreground">{str(s, "tagline")}</p>}
              {num(s, "rating", 0, device) > 0 && <p className="text-xs tabular-nums text-muted-foreground">★ {num(s, "rating", 0, device)} / 5</p>}
            </div>
          </div>
          {str(s, "policy") && <p className="mt-2 text-xs text-muted-foreground">{str(s, "policy")}</p>}
          {str(s, "linkHref") && <a href={str(s, "linkHref")} className="mt-2 inline-block text-sm underline underline-offset-2">{str(s, "linkLabel", "Visit store")}</a>}
        </section>
      );
    }

    case "category_header": {
      const title = str(s, "heading", "All products");
      const image = str(s, "imageUrl");
      return (
        <header>
          {s.showBreadcrumb !== false && (
            <nav aria-label="Breadcrumb" className="mb-2 text-sm text-muted-foreground">
              <span className="underline">{str(s, "homeLabel", "Home")}</span>
              <span aria-hidden="true"> / </span>
              <span>{title}</span>
            </nav>
          )}
          {image ? (
            <div className="relative overflow-hidden rounded-fq-lg">
              <img src={image} alt="" loading="lazy" className="h-auto w-full object-cover" />
              {s.scrim !== false && <div aria-hidden="true" className="absolute inset-0 bg-foreground/40" />}
              <div className="absolute inset-0 flex flex-col justify-end p-4">
                <h3 className="text-2xl font-semibold text-background">{title}</h3>
                {str(s, "body") && <p className="mt-1 max-w-prose text-sm text-background/90">{str(s, "body")}</p>}
              </div>
            </div>
          ) : (
            <>
              <h3 className="text-2xl font-semibold">{title}</h3>
              {str(s, "body") && <p className="mt-1 max-w-prose text-sm text-muted-foreground">{str(s, "body")}</p>}
            </>
          )}
        </header>
      );
    }

    case "collection_story": {
      const heading = str(s, "heading");
      if (!heading && !str(s, "body")) return <Placeholder label="Add a story heading" />;
      return (
        <section className="relative overflow-hidden rounded-fq-lg">
          {str(s, "imageUrl") ? (
            <img src={str(s, "imageUrl")} alt="" loading="lazy" className="aspect-[16/9] w-full object-cover" />
          ) : (
            <div className="aspect-[16/9] w-full bg-muted" />
          )}
          {s.scrim !== false && str(s, "imageUrl") && (
            <div aria-hidden="true" className="absolute inset-0 bg-foreground/40" />
          )}
          <div className="absolute inset-0 flex items-end p-6">
            <div className="max-w-xl text-background">
              {str(s, "eyebrow") && <p className="text-xs font-semibold uppercase tracking-wider">{str(s, "eyebrow")}</p>}
              <h3 className="text-2xl font-semibold">{heading}</h3>
              {str(s, "body") && <p className="mt-2 text-sm opacity-90">{str(s, "body")}</p>}
              {str(s, "ctaLabel") && (
                <a href={str(s, "ctaHref") || "#"} className="mt-3 inline-block rounded-fq-md bg-card px-4 py-2 text-sm font-semibold text-card-foreground">
                  {str(s, "ctaLabel")}
                </a>
              )}
            </div>
          </div>
        </section>
      );
    }

    case "brand_rail":
      return <Placeholder label="Live brand rail — renders on the storefront" />;

    case "concern_rail":
      return <Placeholder label="Live concern rail — renders on the storefront" />;

    case "back_in_stock": {
      return (
        <section className="rounded-fq-md border border-border bg-card p-4">
          <p className="text-sm font-semibold">{str(s, "heading", "Notify me when it's back")}</p>
          {str(s, "body") && <p className="mt-1 text-sm text-muted-foreground">{str(s, "body")}</p>}
          <form className="mt-3 flex flex-wrap gap-2" method="post" action="#back-in-stock" onSubmit={(e) => e.preventDefault()}>
            <label className="sr-only" htmlFor="bis-email">Email address</label>
            <input id="bis-email" name="email" type="email" required placeholder="you@example.com" className="min-h-11 min-w-[14rem] flex-1 rounded-fq-md border border-border px-3 text-sm" />
            <button type="submit" className="min-h-11 rounded-fq-md bg-primary px-4 text-sm font-semibold text-primary-foreground">{str(s, "buttonLabel", "Notify me")}</button>
          </form>
          {str(s, "consentText") && <p className="mt-2 text-xs text-muted-foreground">{str(s, "consentText")}</p>}
        </section>
      );
    }

    case "price_block":
      return <Placeholder label="Live price block — renders on the storefront" />;

    case "price_sparkline":
      return <Placeholder label="Live price history — renders on the storefront" />;

    case "deal_card": {
      const ends = Date.parse(str(s, "endsAt"));
      return (
        <section className="flex flex-col gap-3 rounded-fq-lg border border-border bg-card p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold">{str(s, "heading", "Deal of the day")}</h3>
            {str(s, "badgeLabel") && (
              <span className="mt-1 inline-block rounded-fq-sm bg-success-soft px-2 py-0.5 text-xs font-semibold">{str(s, "badgeLabel")}</span>
            )}
            {!Number.isNaN(ends) && (
              <p className="mt-1 text-xs text-muted-foreground">
                <time dateTime={new Date(ends).toISOString()}>Ends {new Date(ends).toLocaleDateString("en-GB")}</time>
              </p>
            )}
          </div>
          {str(s, "ctaLabel") && (
            <a href={str(s, "ctaHref") || "#"} className="shrink-0 rounded-fq-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              {str(s, "ctaLabel")}
            </a>
          )}
        </section>
      );
    }

    case "deal_strip":
      return <Placeholder label="Live deal strip — renders on the storefront" />;

    case "sponsored_slot":
      return <Placeholder label="Live sponsored slot — renders on the storefront" />;

    case "subbrand_spotlight": {
      const brands = [1, 2, 3, 4]
        .map((n) => ({
          name: str(s, `b${n}Name`),
          tagline: str(s, `b${n}Tagline`),
          image: str(s, `b${n}Image`),
          href: str(s, `b${n}Href`) || "#",
        }))
        .filter((b) => b.name);
      if (brands.length === 0) return <Placeholder label="Add a sub-brand" />;
      return (
        <section>
          {(str(s, "heading") || str(s, "subheading")) && (
            <div className="mx-auto mb-6 max-w-xl space-y-1 text-center">
              {str(s, "heading") && <h3 className="text-2xl font-bold tracking-tight">{str(s, "heading")}</h3>}
              {str(s, "subheading") && <p className="text-xs tracking-wider text-muted-foreground">{str(s, "subheading")}</p>}
            </div>
          )}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {brands.map((b) => (
              <a key={b.name} href={b.href} className="block overflow-hidden rounded-fq-lg border border-border bg-card">
                <div className="relative aspect-[4/5] w-full overflow-hidden bg-muted">
                  {b.image ? (
                    <img src={b.image} alt={b.name} loading="lazy" className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center bg-primary/10">
                      <span className="text-2xl font-bold tracking-widest text-primary">{b.name}</span>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5 p-4">
                  <p className="text-base font-bold tracking-wide">{b.name}</p>
                  {b.tagline && <p className="line-clamp-2 text-xs text-muted-foreground">{b.tagline}</p>}
                </div>
              </a>
            ))}
          </div>
        </section>
      );
    }

    case "size_guide": {
      const cols = [1, 2, 3].map((n) => str(s, `c${n}Label`)).filter(Boolean);
      const body = [1, 2, 3, 4]
        .map((n) => ({
          label: str(s, `r${n}Label`),
          cells: [1, 2, 3].map((m) => num(s, `r${n}c${m}`, 0, device)),
        }))
        .filter((r) => r.label);
      if (cols.length === 0 || body.length === 0)
        return <Placeholder label="Add measurements and sizes" />;
      return (
        <section className="rounded-fq-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold">{str(s, "heading", "Size guide")}</h3>
            <span className="rounded-fq-sm border border-border px-2 py-1 text-xs text-muted-foreground">{str(s, "unit", "cm")}</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                {[str(s, "openLabel", "Size"), ...cols].map((h) => (
                  <th key={h} className="px-2 py-1 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r) => (
                <tr key={r.label} className="border-t border-border">
                  <td className="px-2 py-1 font-medium">{r.label}</td>
                  {r.cells.map((v, i) => (
                    <td key={i} className="px-2 py-1 tabular-nums text-muted-foreground">{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {str(s, "note") && <p className="mt-2 text-xs text-muted-foreground">{str(s, "note")}</p>}
        </section>
      );
    }

    case "routine_builder":
      return <Placeholder label="Live routine builder — renders on the storefront" />;

    case "sample_picker":
      return <Placeholder label="Live sample picker — renders on the storefront" />;

    case "shade_finder": {
      const u = str(s, "undertonePrompt", "What is your undertone?");
      const d = str(s, "depthPrompt", "How deep is your skin tone?");
      return (
        <section className="rounded-fq-lg border border-border bg-card p-6">
          <h3 className="text-lg font-semibold">{str(s, "heading", "Find your shade")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">Step 1 of 2</p>
          <fieldset className="mt-4 border-0 p-0">
            <legend className="text-sm font-medium">{u}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {["Cool", "Neutral", "Warm"].map((o, i) => (
                <span key={o} className={cn("rounded-fq-md border px-3 py-1.5 text-sm", i === 0 ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{o}</span>
              ))}
            </div>
          </fieldset>
          <p className="mt-3 text-xs text-muted-foreground">Next: {d}</p>
        </section>
      );
    }

    case "skin_quiz": {
      const first = str(s, "typePrompt", "Your skin type?");
      return (
        <section className="rounded-fq-lg border border-border bg-card p-6">
          <h3 className="text-lg font-semibold">{str(s, "heading", "Skin quiz")}</h3>
          {str(s, "body") && <p className="mt-1 text-sm text-muted-foreground">{str(s, "body")}</p>}
          <p className="mt-3 text-xs text-muted-foreground">Step 1 of 4</p>
          <fieldset className="mt-2 border-0 p-0">
            <legend className="text-sm font-medium">{first}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {["Oily", "Dry", "Combination"].map((o) => (
                <span key={o} className="rounded-fq-md border border-border px-3 py-1.5 text-sm">{o}</span>
              ))}
            </div>
          </fieldset>
        </section>
      );
    }

    case "quiz": {
      const steps = [1, 2, 3]
        .map((i) => ({
          label: str(s, `q${i}Label`),
          choices: str(s, `q${i}Choices`).split(",").map((x) => x.trim()).filter(Boolean),
        }))
        .filter((x) => x.label && x.choices.length > 0);
      if (steps.length === 0) return <Placeholder label="Add a question with choices" />;
      const first = steps[0]!;
      return (
        <section className="rounded-fq-lg border border-border bg-card p-6">
          <h3 className="text-lg font-semibold">{str(s, "heading", "Find your match")}</h3>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-fq-sm bg-muted">
            <div className="h-full bg-primary" style={{ width: `${Math.round(100 / steps.length)}%` }} />
          </div>
          <fieldset className="mt-4 border-0 p-0">
            <legend className="text-sm font-medium">{first.label}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {first.choices.map((ch) => (
                <span key={ch} className="rounded-fq-md border border-border px-3 py-1.5 text-sm">{ch}</span>
              ))}
            </div>
          </fieldset>
          <p className="mt-4">
            <span className="inline-block rounded-fq-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              {str(s, "resultLabel", "See my matches")}
            </span>
          </p>
        </section>
      );
    }

    case "consult_cta": {
      return (
        <section className="rounded-fq-lg border border-border bg-card p-6 text-center">
          <h3 className="text-lg font-semibold">{str(s, "heading", "Talk to a beauty advisor")}</h3>
          {str(s, "body") && <p className="mx-auto mt-1 max-w-prose text-sm text-muted-foreground">{str(s, "body")}</p>}
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {str(s, "whatsapp") && (
              <span className="inline-flex min-h-11 items-center rounded-fq-md border border-border px-4 text-sm">
                {str(s, "whatsappLabel", "WhatsApp")}
              </span>
            )}
            {str(s, "phone") && (
              <span className="inline-flex min-h-11 items-center rounded-fq-md border border-border px-4 text-sm">
                {str(s, "callLabel", "Call us")}
              </span>
            )}
          </div>
          <p className="mx-auto mt-3 max-w-sm">
            <span className="block text-left text-sm">
              <span className="mb-1 block">{str(s, "fieldLabel", "Your number")}</span>
              <span className="block min-h-11 rounded-fq-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground">01XXXXXXXXX</span>
            </span>
          </p>
          <p className="mt-3">
            <span className="inline-block min-h-11 rounded-fq-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">
              {str(s, "buttonLabel", "Book a consult")}
            </span>
          </p>
        </section>
      );
    }

    case "gift_builder":
      return <Placeholder label="Live gift builder — renders on the storefront" />;

    case "bundle_builder":
      return <Placeholder label="Live bundle builder — renders on the storefront" />;

    case "shoppable_image": {
      const url = str(s, "imageUrl");
      if (!url) return <Placeholder label="Choose a shoppable image" />;
      const limit = Math.min(4, Math.max(1, num(s, "limit", 4, device)));
      const pins = Array.from({ length: limit }, (_, i) => ({
        x: num(s, `p${i + 1}x`, 25 + i * 15, device),
        y: num(s, `p${i + 1}y`, 30 + i * 15, device),
      }));
      return (
        <section>
          {str(s, "heading") && <h3 className="mb-3 text-lg font-semibold">{str(s, "heading")}</h3>}
          <div className="relative overflow-hidden rounded-fq-lg">
            <img src={url} alt={str(s, "altText")} loading="lazy" className="aspect-[4/5] w-full object-cover" />
            {pins.map((p, i) => (
              <span key={i} aria-hidden className="absolute grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-border bg-card text-xs font-semibold" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
                {i + 1}
              </span>
            ))}
          </div>
        </section>
      );
    }

    case "compare_table":
      return <Placeholder label="Live compare table — renders on the storefront" />;

    case "spec_table": {
      const pairs = [1, 2, 3, 4, 5, 6]
        .map((i) => ({
          group: str(s, `r${i}Group`),
          label: str(s, `r${i}Label`),
          value: str(s, `r${i}Value`),
        }))
        .filter((r) => r.label);
      if (pairs.length === 0) return <Placeholder label="Add a spec row" />;
      return (
        <section className="rounded-fq-lg border border-border bg-card">
          {str(s, "caption") && <h3 className="px-3 pt-3 text-sm text-muted-foreground">{str(s, "caption")}</h3>}
          <dl className="m-0 p-3 pt-1">
            {pairs.map((r) => (
              <div key={r.label} className="flex items-baseline justify-between gap-3 border-b border-border py-2 last:border-b-0">
                <dt className="text-sm font-medium">
                  {r.group ? <span className="mr-2 text-xs text-muted-foreground">{r.group}</span> : null}
                  {r.label}
                </dt>
                <dd className="m-0 text-sm tabular-nums text-muted-foreground">{r.value || "—"}</dd>
              </div>
            ))}
          </dl>
        </section>
      );
    }

    case "spec_highlights": {
      const tiles = [1, 2, 3, 4, 5, 6]
        .map((i) => ({ label: str(s, `t${i}Label`), value: str(s, `t${i}Value`) }))
        .filter((t) => t.label && t.value);
      if (tiles.length === 0) return <Placeholder label="Add a spec tile" />;
      const cols = Math.min(num(s, "columns", 4, device), tiles.length);
      return (
        <section>
          {str(s, "heading") && <h3 className="mb-3 text-lg font-semibold">{str(s, "heading")}</h3>}
          <ul className="grid list-none gap-3 p-0" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {tiles.map((t) => (
              <li key={t.label} className="rounded-fq-md border border-border p-3">
                <p className="m-0 text-xs text-muted-foreground">{t.label}</p>
                <p className="m-0 text-sm font-semibold tabular-nums">{t.value}</p>
              </li>
            ))}
          </ul>
        </section>
      );
    }

    case "ingredient_glossary": {
      const terms = [1, 2, 3, 4, 5, 6]
        .map((i) => ({ term: str(s, `g${i}Term`), body: str(s, `g${i}Body`) }))
        .filter((t) => t.term);
      if (terms.length === 0) return <Placeholder label="Add a glossary term" />;
      return (
        <section className="rounded-fq-lg border border-border bg-card p-6">
          <h3 className="mb-2 text-lg font-semibold">{str(s, "heading", "Ingredient glossary")}</h3>
          <div className="divide-y divide-border border-t border-border">
            {terms.map((t) => (
              <details key={t.term}>
                <summary className="cursor-pointer py-2 text-sm font-medium">{t.term}</summary>
                <p className="pb-3 text-sm text-muted-foreground">{t.body}</p>
              </details>
            ))}
          </div>
        </section>
      );
    }

    case "ingredient_list": {
      const items = [1, 2, 3, 4, 5, 6]
        .map((i) => ({
          name: str(s, `i${i}Name`),
          amount: str(s, `i${i}Amount`),
          gloss: str(s, `i${i}Gloss`),
        }))
        .filter((x) => x.name);
      if (items.length === 0) return <Placeholder label="Add an ingredient" />;
      return (
        <section className="rounded-fq-lg border border-border bg-card p-6">
          <h3 className="mb-2 text-lg font-semibold">{str(s, "heading", "Key ingredients")}</h3>
          <dl className="m-0">
            {items.map((x) => (
              <div key={x.name} className="border-b border-border py-2 last:border-b-0">
                <dt className="text-sm font-medium">
                  {x.name}
                  {x.amount && <span className="ms-2 tabular-nums text-muted-foreground">{x.amount}</span>}
                </dt>
                {x.gloss && <dd className="m-0 text-sm text-muted-foreground">{x.gloss}</dd>}
              </div>
            ))}
          </dl>
          {str(s, "inci") && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium">{str(s, "inciLabel", "Full ingredients (INCI)")}</summary>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{str(s, "inci")}</p>
            </details>
          )}
        </section>
      );
    }

    case "ingredient_rail": {
      const chips = [1, 2, 3, 4]
        .map((i) => ({ name: str(s, `i${i}Name`), gloss: str(s, `i${i}Gloss`) }))
        .filter((x) => x.name);
      if (chips.length === 0) return <Placeholder label="Add an ingredient" />;
      return (
        <section>
          {str(s, "heading") && <h3 className="mb-3 text-lg font-semibold">{str(s, "heading")}</h3>}
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {chips.map((x) => (
              <li key={x.name} className="rounded-full border border-border px-3 py-1 text-sm">
                <span>{x.name}</span>
                {x.gloss && <span className="ms-2 text-xs text-muted-foreground">{x.gloss}</span>}
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <Placeholder label="Live ingredient products — renders on the storefront" />
          </div>
        </section>
      );
    }

    case "payment_methods":
      return <Placeholder label="Live payment methods — renders on the storefront" />;

    case "payment_icons": {
      const marks = str(s, "marks")
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean)
        .slice(0, 12);
      if (marks.length === 0) return <Placeholder label="Add a payment mark" />;
      return (
        <section className="space-y-2">
          {str(s, "heading") && (
            <h3 className="text-xs uppercase tracking-wide text-muted-foreground">{str(s, "heading")}</h3>
          )}
          <ul className="flex flex-wrap items-center gap-2">
            {marks.map((m) => (
              <li key={m} className="rounded-fq-sm border border-border bg-card px-2 py-1 text-xs text-muted-foreground">
                {m}
              </li>
            ))}
          </ul>
        </section>
      );
    }

    case "emi_calculator":
      return <Placeholder label="Live EMI calculator — renders on the storefront" />;

    case "order_tracker":
      return <Placeholder label="Live order tracker — renders on the storefront" />;

    case "add_to_cart": {
      const label = str(s, "label", "Add to cart");
      const showQty = s.showQuantity !== false;
      return (
        <div className="flex flex-col gap-3">
          {showQty && (
            <div className="flex items-center gap-3 text-sm">
              <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-fq-md border border-border">−</span>
              <span className="tabular-nums">1</span>
              <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-fq-md border border-border">+</span>
            </div>
          )}
          <span className="inline-flex min-h-11 items-center justify-center rounded-fq-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
            {label}
          </span>
        </div>
      );
    }

    case "rewards_club": {
      const tiers = [1, 2, 3]
        .map((n) => ({ name: str(s, `tier${n}Name`), points: str(s, `tier${n}Points`) }))
        .filter((t) => t.name);
      return (
        <section className="rounded-fq-lg border border-border bg-card p-6 sm:p-8">
          {str(s, "heading") && (
            <h3 className="text-2xl font-bold">{str(s, "heading")}</h3>
          )}
          {str(s, "body") && (
            <p className="mt-2 max-w-prose text-sm text-muted-foreground">{str(s, "body")}</p>
          )}
          {tiers.length > 0 && (
            <ol className="mt-5 grid gap-3 sm:grid-cols-3">
              {tiers.map((tier) => (
                <li key={tier.name} className="rounded-fq-md border border-border bg-background p-4">
                  <p className="text-sm font-semibold">{tier.name}</p>
                  {tier.points && (
                    <p className="mt-1 text-xs text-muted-foreground">{tier.points}</p>
                  )}
                </li>
              ))}
            </ol>
          )}
          {str(s, "buttonLabel") && (
            <p className="mt-5">
              <span className="inline-flex min-h-11 items-center rounded-fq-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
                {str(s, "buttonLabel")}
              </span>
            </p>
          )}
        </section>
      );
    }

    case "wedding_shop": {
      const collections = [1, 2, 3]
        .map((n) => ({ name: str(s, `c${n}Name`), href: str(s, `c${n}Href`) || "#" }))
        .filter((c) => c.name);
      return (
        <section className="rounded-fq-lg border border-border bg-card p-6 sm:p-8">
          {str(s, "heading") && (
            <h3 className="text-2xl font-bold">{str(s, "heading")}</h3>
          )}
          {str(s, "body") && (
            <p className="mt-2 max-w-prose text-sm text-muted-foreground">{str(s, "body")}</p>
          )}
          {collections.length > 0 && (
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {collections.map((c) => (
                <span key={c.name} className="rounded-fq-md border border-border bg-background p-4">
                  <p className="text-sm font-semibold">{c.name}</p>
                  <p aria-hidden="true" className="mt-2 text-primary">→</p>
                </span>
              ))}
            </div>
          )}
          {str(s, "buttonLabel") && (
            <p className="mt-5">
              <span className="inline-flex min-h-11 items-center rounded-fq-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
                {str(s, "buttonLabel")}
              </span>
            </p>
          )}
        </section>
      );
    }

    case "gift_finder": {
      const occasions = [1, 2, 3]
        .map((n) => ({ label: str(s, `o${n}Label`), query: str(s, `o${n}Query`) }))
        .filter((o) => o.label);
      return (
        <section className="rounded-fq-lg border border-border bg-card p-6 sm:p-8">
          {str(s, "heading") && (
            <h3 className="text-2xl font-bold">{str(s, "heading")}</h3>
          )}
          {str(s, "body") && (
            <p className="mt-2 max-w-prose text-sm text-muted-foreground">{str(s, "body")}</p>
          )}
          {occasions.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {occasions.map((o) => (
                <span
                  key={o.label}
                  className="inline-flex min-h-11 items-center rounded-full border border-border bg-background px-4 text-sm font-medium"
                >
                  {o.label}
                </span>
              ))}
            </div>
          )}
          {str(s, "buttonLabel") && (
            <p className="mt-5">
              <span className="inline-flex min-h-11 items-center rounded-fq-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
                {str(s, "buttonLabel")}
              </span>
            </p>
          )}
        </section>
      );
    }

    case "rich_text": {
      return (
        <section className="rounded-fq-lg border border-border bg-card p-6">
          {str(s, "heading") && (
            <h3 className="text-lg font-semibold">{str(s, "heading")}</h3>
          )}
          <p className="mt-2 block whitespace-pre-line text-sm text-muted-foreground">
            {str(s, "body", "Tell customers about your store.")}
          </p>
        </section>
      );
    }

    case "form": {
      const showPhone = s.showPhone !== false;
      return (
        <section className="space-y-3 rounded-fq-lg border border-border bg-card p-6">
          {str(s, "heading") && (
            <h3 className="text-xl font-semibold">{str(s, "heading", "Send us a message")}</h3>
          )}
          {str(s, "body") && (
            <p className="text-sm text-muted-foreground">{str(s, "body")}</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium">{str(s, "nameLabel", "Your name")}</p>
              <div className="mt-1 min-h-11 rounded-fq-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
                Name
              </div>
            </div>
            <div>
              <p className="text-xs font-medium">{str(s, "emailLabel", "Email")}</p>
              <div className="mt-1 min-h-11 rounded-fq-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
                you@example.com
              </div>
            </div>
            {showPhone && (
              <div className="sm:col-span-2">
                <p className="text-xs font-medium">{str(s, "phoneLabel", "Phone")}</p>
                <div className="mt-1 min-h-11 rounded-fq-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
                  01XXXXXXXXX
                </div>
              </div>
            )}
            <div className="sm:col-span-2">
              <p className="text-xs font-medium">{str(s, "messageLabel", "How can we help?")}</p>
              <div className="mt-1 min-h-24 rounded-fq-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
                Your message
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex min-h-11 items-center rounded-fq-md bg-primary px-5 text-sm font-medium text-primary-foreground">
              {str(s, "buttonLabel", "Send")}
            </span>
            {str(s, "consentText") && (
              <span className="text-xs text-muted-foreground">{str(s, "consentText")}</span>
            )}
          </div>
        </section>
      );
    }

    case "nav_menu": {
      const items = rows(s, "items").filter(
        (item) => typeof item.label === "string" && item.label !== "",
      );
      if (items.length === 0) return <Placeholder label="Add a menu item" />;
      const column = str(s, "layout", "row") === "column";
      const align = str(s, "align", "left");
      return (
        <nav
          aria-label={str(s, "heading") || "Menu"}
          className={`flex flex-col gap-2 ${align === "center" ? "items-center text-center" : "items-start"}`}
        >
          {str(s, "heading") && (
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{str(s, "heading")}</p>
          )}
          <ul className={`flex gap-x-5 gap-y-2 ${column ? "flex-col" : "flex-row flex-wrap"}`}>
            {items.slice(0, 12).map((item, i) => (
              <li key={`${String(item.label)}-${i}`}>
                <span className="text-sm text-muted-foreground">{String(item.label)}</span>
              </li>
            ))}
          </ul>
        </nav>
      );
    }

    case "newsletter": {
      return (
        <section className="rounded-fq-lg border border-border bg-card p-6">
          <h3 className="text-lg font-semibold">{str(s, "heading", "Stay in touch")}</h3>
          {str(s, "body") && (
            <p className="mt-1 text-sm text-muted-foreground">{str(s, "body")}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <div className="min-h-11 min-w-40 flex-1 rounded-fq-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
              you@example.com
            </div>
            <span className="inline-flex min-h-11 items-center rounded-fq-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
              {str(s, "buttonLabel", "Subscribe")}
            </span>
          </div>
          {str(s, "consentText") && (
            <p className="mt-2 text-xs text-muted-foreground">{str(s, "consentText")}</p>
          )}
        </section>
      );
    }

    case "sticky_bar": {
      if (!str(s, "text") && !str(s, "ctaLabel"))
        return <Placeholder label="Add a sticky bar message" />;
      const top = str(s, "position", "bottom") === "top";
      return (
        <div
          className={`sticky z-30 flex flex-wrap items-center justify-between gap-3 rounded-fq-md border border-border bg-card px-4 py-2 text-sm ${
            top ? "top-0" : "bottom-0"
          }`}
        >
          <span className="min-w-0">{str(s, "text")}</span>
          {str(s, "ctaLabel") && (
            <span className="rounded-fq-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">
              {str(s, "ctaLabel")}
            </span>
          )}
        </div>
      );
    }

    case "mega_menu":
      return <Placeholder label="Live mega menu — renders on the storefront" />;

    case "buy_box":
      return <Placeholder label="Live buy box — renders on the storefront" />;

    case "variant_picker":
      return <Placeholder label="Live variant picker — renders on the storefront" />;

    case "sticky_buy_bar":
      return <Placeholder label="Live sticky buy bar — renders on the storefront" />;

    case "filter_chips":
      return <Placeholder label="Live filter chips — renders on the storefront" />;

    case "size_selector":
      return <Placeholder label="Live size selector — renders on the storefront" />;

    case "complete_the_look":
      return <Placeholder label="Live complete the look — renders on the storefront" />;

    case "circle_categories":
      return <Placeholder label="Live circle categories — renders on the storefront" />;

    case "quick_view":
      return <Placeholder label="Live quick view — renders on the storefront" />;

    case "refill_widget":
      return <Placeholder label="Live refill widget — renders on the storefront" />;

    case "combo_card":
      return <Placeholder label="Live combo card — renders on the storefront" />;

    case "loyalty_strip":
      return <Placeholder label="Live loyalty strip — renders on the storefront" />;

    case "department_strip":
      return <Placeholder label="Live department strip — renders on the storefront" />;

    case "ugc_gallery": {
      const limit = Math.min(12, Math.max(2, num(s, "limit", 6, device)));
      return (
        <section>
          {str(s, "heading") && (
            <h3 className="mb-3 text-lg font-semibold">{str(s, "heading")}</h3>
          )}
          <ul className="grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3">
            {Array.from({ length: limit }).map((_, index) => (
              <li
                key={index}
                aria-hidden
                className="aspect-square rounded-fq-md bg-muted"
              />
            ))}
          </ul>
          {str(s, "note") && (
            <p className="mt-2 text-xs text-muted-foreground">{str(s, "note")}</p>
          )}
        </section>
      );
    }

    case "before_after": {
      const before = str(s, "beforeImage");
      const after = str(s, "afterImage");
      if (!before || !after)
        return <Placeholder label="Add before and after images" />;
      return (
        <section>
          {str(s, "heading") && (
            <h3 className="mb-3 text-lg font-semibold">{str(s, "heading")}</h3>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <figure className="m-0">
              <img
                src={before}
                alt={str(s, "beforeAlt")}
                loading="lazy"
                className="aspect-square w-full rounded-fq-md object-cover"
              />
              <figcaption className="mt-1 text-xs text-muted-foreground">
                {str(s, "beforeLabel", "Before")}
              </figcaption>
            </figure>
            <figure className="m-0">
              <img
                src={after}
                alt={str(s, "afterAlt")}
                loading="lazy"
                className="aspect-square w-full rounded-fq-md object-cover"
              />
              <figcaption className="mt-1 text-xs text-muted-foreground">
                {str(s, "afterLabel", "After")}
              </figcaption>
            </figure>
          </div>
          {str(s, "disclaimer") && (
            <p className="mt-3 text-xs text-muted-foreground">
              {str(s, "disclaimer")}
            </p>
          )}
        </section>
      );
    }

    case "store_locator": {
      const stores = [1, 2, 3]
        .map((n) => ({
          name: str(s, `s${n}Name`),
          address: str(s, `s${n}Address`),
          hours: str(s, `s${n}Hours`),
          phone: str(s, `s${n}Phone`),
        }))
        .filter((store) => store.name);
      if (stores.length === 0) return <Placeholder label="Add a store" />;
      return (
        <section>
          {str(s, "heading") && (
            <h3 className="mb-3 text-lg font-semibold">{str(s, "heading")}</h3>
          )}
          <ul className="grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {stores.map((store) => (
              <li
                key={store.name}
                className="rounded-fq-md border border-border bg-card p-4"
              >
                <p className="text-sm font-semibold">{store.name}</p>
                {store.address && (
                  <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                    {store.address}
                  </p>
                )}
                {store.hours && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {store.hours}
                  </p>
                )}
                {store.phone && (
                  <p className="mt-2 text-sm underline underline-offset-2">
                    {store.phone}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      );
    }

    case "trade_in": {
      return (
        <section className="rounded-fq-lg border border-border bg-card p-6">
          <h3 className="text-lg font-semibold">
            {str(s, "heading", "Trade in your old device")}
          </h3>
          {str(s, "body") && (
            <p className="mt-1 text-sm text-muted-foreground">{str(s, "body")}</p>
          )}
          <div className="mt-3 space-y-2">
            <span className="block min-h-11 rounded-fq-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
              Device details…
            </span>
            <span className="inline-flex min-h-11 items-center rounded-fq-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
              {str(s, "buttonLabel", "Get a quote")}
            </span>
          </div>
          {str(s, "consentText") && (
            <p className="mt-2 text-xs text-muted-foreground">
              {str(s, "consentText")}
            </p>
          )}
        </section>
      );
    }

    case "warranty_panel": {
      const centres = [1, 2, 3]
        .map((i) => ({
          key: `s${i}`,
          name: str(s, `s${i}Name`),
          address: str(s, `s${i}Address`),
        }))
        .filter((centre) => centre.name);
      const official = s.official !== false;
      return (
        <section className="rounded-fq-lg border border-border bg-card p-4">
          <h3 className="text-base font-semibold">
            {str(s, "heading", "Warranty")}
          </h3>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-fq-sm border border-border px-2 py-1 font-medium tabular-nums">
              {num(s, "months", 12, device)}
            </span>
            <span className="rounded-fq-sm bg-muted px-2 py-1 text-xs">
              {official ? str(s, "officialLabel") : str(s, "parallelLabel")}
            </span>
          </p>
          {str(s, "coverage") && (
            <p className="mt-2 text-sm text-muted-foreground">
              {str(s, "coverage")}
            </p>
          )}
          {centres.length > 0 && (
            <dl className="mt-3 rounded-fq-md border border-border">
              {centres.map((centre) => (
                <div
                  key={centre.key}
                  className="flex items-baseline justify-between gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0"
                >
                  <dt className="font-medium">{centre.name}</dt>
                  <dd className="m-0 text-muted-foreground">{centre.address}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      );
    }

    default:
      return <Placeholder label={node.el} />;
  }
}

/** "Label|/href, …" link-list parser shared by footer-style widgets. */
function parseLinks(raw: string): { label: string; href: string }[] {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [label, href] = part.split("|");
      return { label: (label ?? "").trim(), href: (href ?? "").trim() || "#" };
    })
    .filter((link) => link.label.length > 0)
    .slice(0, 8);
}

const FIT_LABEL: Record<string, string> = {
  small: "Runs small — consider sizing up",
  true: "True to size",
  large: "Runs large — consider sizing down",
};

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
