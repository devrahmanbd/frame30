/**
 * Phase 7 — layout primitive pack.
 *
 * Button, icon, contact form, menu, logo and carousel. These are the pieces a
 * merchant needs to build a shop layout from scratch rather than rearranging
 * pre-baked commerce blocks. Like every widget module they read design tokens
 * through semantic classes only — no theme import, no hard-coded colour.
 */
import { useEffect, useId, useRef, useState } from "react";
import type { PropRow, PropValue, Section } from "@/lib/builder-ast";
import { submitContactFn } from "@/lib/contact.functions";
import type { WidgetComponent, WidgetCtx } from "./widgets";

/** Repeatable rows for an `array` field, defensively typed. */
function rowsOf(section: Section, key: string): PropRow[] {
  const value: PropValue | undefined = section.props[key];
  return Array.isArray(value) ? value : [];
}

const readString = (row: PropRow, key: string) =>
  typeof row[key] === "string" ? (row[key] as string) : "";

/**
 * A relative path stays on this store; anything else must be an absolute
 * http(s) URL. Everything else (javascript:, data:) collapses to no link.
 */
function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (!href) return null;
  if (href.startsWith("/") || href.startsWith("#")) return href;
  if (/^https?:\/\//i.test(href)) return href;
  return null;
}

/* --------------------------------------------------------------- icons */

const ICON_PATHS: Record<string, string> = {
  star: "M12 3l2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.4l6.1-.9z",
  cart: "M3 4h2l2.4 10.4a2 2 0 002 1.6h7.7a2 2 0 002-1.6L20.5 8H6.2M9 20a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z",
  truck: "M3 7h11v8H3zM14 10h4l3 3v2h-7zM7 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm10 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3z",
  shield: "M12 3l7 3v5c0 4.4-3 8.3-7 10-4-1.7-7-5.6-7-10V6z",
  phone: "M6 3h4l2 5-2.5 1.5a12 12 0 005 5L16 12l5 2v4a2 2 0 01-2 2A16 16 0 014 5a2 2 0 012-2z",
  mail: "M3 6h18v12H3zM3 6l9 6 9-6",
  clock: "M12 4a8 8 0 100 16 8 8 0 000-16zm0 3v5l3 2",
  check: "M4 12l5 5L20 6",
  search: "M11 4a7 7 0 100 14 7 7 0 000-14zm5.5 11.5L21 20",
  heart: "M12 20S4 14.5 4 9.5A4.5 4.5 0 0112 7a4.5 4.5 0 018 2.5C20 14.5 12 20 12 20z",
  arrow: "M5 12h13M13 6l6 6-6 6",
};

const TONE_CLASS: Record<string, string> = {
  default: "text-foreground",
  brand: "text-primary",
  muted: "text-muted-foreground",
};

function Glyph({ name, size = 20 }: { name: string; size?: number }) {
  const d = ICON_PATHS[name] ?? ICON_PATHS["star"]!;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}

/* --------------------------------------------------------------- button */

const BUTTON_VARIANT: Record<string, string> = {
  primary: "bg-primary text-primary-foreground hover:opacity-90",
  secondary: "bg-secondary text-secondary-foreground hover:opacity-90",
  outline: "border border-border bg-transparent hover:bg-muted",
  ghost: "bg-transparent hover:bg-muted",
  link: "bg-transparent underline underline-offset-4 px-0",
};
const BUTTON_SIZE: Record<string, string> = {
  sm: "min-h-9 px-3 text-sm",
  md: "min-h-11 px-5 text-sm",
  lg: "min-h-12 px-7 text-base",
};

const ButtonWidget: WidgetComponent = ({ str, bool, editing }) => {
  const label = str("label");
  const href = safeHref(str("href"));
  const variant = BUTTON_VARIANT[str("variant")] ?? BUTTON_VARIANT["primary"]!;
  const size = BUTTON_SIZE[str("size")] ?? BUTTON_SIZE["md"]!;
  const icon = str("icon");
  const newTab = bool("newTab");
  if (!label) return editing ? <p className="text-xs text-muted-foreground">Button: add a label.</p> : null;

  const className = `inline-flex items-center justify-center gap-2 rounded-fq-md font-medium transition ${variant} ${size} ${
    bool("fullWidth") ? "w-full" : ""
  }`;
  const inner = (
    <>
      <span>{label}</span>
      {icon && icon !== "none" ? <Glyph name={icon} size={18} /> : null}
    </>
  );
  // Without a link the button still renders, so a merchant can see the style
  // while they are laying the page out.
  if (!href)
    return (
      <button type="button" className={className} disabled={!editing}>
        {inner}
      </button>
    );
  return (
    <a
      href={href}
      className={className}
      {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {inner}
    </a>
  );
};

/* ----------------------------------------------------------------- icon */

const IconWidget: WidgetComponent = ({ str, int }) => {
  const size = int("size", 32, 16, 96);
  const label = str("label");
  const href = safeHref(str("href"));
  const tone = TONE_CLASS[str("tone")] ?? TONE_CLASS["default"]!;
  const body = (
    <span className={`inline-flex flex-col items-center gap-1 ${tone}`}>
      <Glyph name={str("name")} size={size} />
      {label ? <span className="text-xs text-muted-foreground">{label}</span> : null}
    </span>
  );
  return href ? (
    <a href={href} className="inline-block" aria-label={label || undefined}>
      {body}
    </a>
  ) : (
    body
  );
};

/* ----------------------------------------------------------------- menu */

const NavMenuWidget: WidgetComponent = ({ section, str, editing }) => {
  const items = rowsOf(section, "items");
  const column = str("layout") === "column";
  const align = str("align") === "center" ? "items-center text-center" : "items-start";
  const heading = str("heading");
  if (items.length === 0)
    return editing ? <p className="text-xs text-muted-foreground">Menu: add some links.</p> : null;
  return (
    <nav aria-label={heading || "Menu"} className={`flex flex-col gap-2 ${align}`}>
      {heading ? <p className="text-xs fq-caps text-muted-foreground">{heading}</p> : null}
      <ul className={`flex gap-x-5 gap-y-2 ${column ? "flex-col" : "flex-row flex-wrap"}`}>
        {items.slice(0, 12).map((row, i) => {
          const label = readString(row, "label");
          const href = safeHref(readString(row, "href"));
          if (!label) return null;
          return (
            <li key={`${label}-${i}`}>
              {href ? (
                <a href={href} className="text-sm hover:text-primary hover:underline">
                  {label}
                </a>
              ) : (
                <span className="text-sm text-muted-foreground">{label}</span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

/* ----------------------------------------------------------------- logo */

const LogoWidget: WidgetComponent = ({ str, int, editing }) => {
  const image = str("image").trim();
  const wordmark = str("text");
  const href = safeHref(str("href"));
  const height = int("height", 40, 16, 120);
  if (!image && !wordmark)
    return editing ? <p className="text-xs text-muted-foreground">Logo: add an image or a name.</p> : null;
  const body = image ? (
    <img
      src={image}
      alt={str("alt") || wordmark}
      height={height}
      style={{ height, width: "auto" }}
      loading="eager"
      decoding="async"
    />
  ) : (
    <span className="font-bangla-display text-xl font-bold tracking-tight">{wordmark}</span>
  );
  return href ? (
    <a href={href} className="inline-flex items-center">
      {body}
    </a>
  ) : (
    <span className="inline-flex items-center">{body}</span>
  );
};

/* ------------------------------------------------------------- carousel */

const CarouselWidget: WidgetComponent = ({ section, str, int, bool, Heading, primary }) => {
  const slides = rowsOf(section, "slides").filter((row) => readString(row, "image"));
  const perView = int("perView", 3, 1, 4);
  const heading = str("heading");
  const track = useRef<HTMLUListElement>(null);

  function scrollBy(direction: 1 | -1) {
    const el = track.current;
    if (!el) return;
    el.scrollBy({ left: direction * (el.clientWidth / perView), behavior: "smooth" });
  }

  if (slides.length === 0)
    return (
      <div className="rounded-fq-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Carousel: add slides in the inspector.
      </div>
    );

  return (
    <section className="space-y-3">
      {heading ? (
        <Heading className={primary ? "text-2xl font-bold" : "text-xl font-semibold"}>{heading}</Heading>
      ) : null}
      <div className="relative">
        <ul
          ref={track}
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2"
          style={{ scrollbarWidth: "thin" }}
        >
          {slides.slice(0, 12).map((row, i) => {
            const href = safeHref(readString(row, "href"));
            const caption = readString(row, "caption");
            const figure = (
              <figure className="space-y-2">
                <img
                  src={readString(row, "image")}
                  alt={readString(row, "alt") || caption}
                  className="aspect-[4/3] w-full rounded-fq-md object-cover"
                  loading="lazy"
                  decoding="async"
                />
                {caption ? <figcaption className="text-sm text-muted-foreground">{caption}</figcaption> : null}
              </figure>
            );
            return (
              <li
                key={`${i}-${caption}`}
                className="shrink-0 snap-start"
                style={{ width: `calc((100% - ${(perView - 1) * 16}px) / ${perView})`, minWidth: 180 }}
              >
                {href ? <a href={href}>{figure}</a> : figure}
              </li>
            );
          })}
        </ul>
        {bool("showArrows") && slides.length > perView ? (
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              aria-label="Previous slides"
              onClick={() => scrollBy(-1)}
              className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-fq-md border border-border"
            >
              <span aria-hidden="true">‹</span>
            </button>
            <button
              type="button"
              aria-label="Next slides"
              onClick={() => scrollBy(1)}
              className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-fq-md border border-border"
            >
              <span aria-hidden="true">›</span>
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
};

/* ----------------------------------------------------------------- form */

const FormWidget: WidgetComponent = ({ str, bool, Heading, primary, locale, editing }: WidgetCtx) => {
  const prefix = useId();
  const renderedAt = useRef(Date.now());
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [honeypot, setHoneypot] = useState("");
  useEffect(() => {
    renderedAt.current = Date.now();
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "sending" || editing) return;
    const data = new FormData(event.currentTarget);
    setState("sending");
    try {
      await submitContactFn({
        data: {
          name: String(data.get("name") ?? ""),
          email: String(data.get("email") ?? ""),
          phone: String(data.get("phone") ?? "") || null,
          topic: "support",
          message: String(data.get("message") ?? ""),
          locale,
          honeypot,
          renderedAt: renderedAt.current,
        },
      });
      setState("done");
    } catch {
      setState("error");
    }
  }

  if (state === "done")
    return (
      <p role="status" className="rounded-fq-md border border-border bg-card p-6 text-sm">
        {str("successText")}
      </p>
    );

  const field =
    "min-h-11 w-full rounded-fq-md border border-border bg-background px-3 text-sm outline-none focus:border-primary";

  return (
    <section className="space-y-3">
      {str("heading") ? (
        <Heading className={primary ? "text-2xl font-bold" : "text-xl font-semibold"}>{str("heading")}</Heading>
      ) : null}
      {str("body") ? <p className="text-sm text-muted-foreground">{str("body")}</p> : null}
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${prefix}-name`} className="text-xs font-medium">
            {str("nameLabel")}
          </label>
          <input id={`${prefix}-name`} name="name" required maxLength={80} className={field} />
        </div>
        <div>
          <label htmlFor={`${prefix}-email`} className="text-xs font-medium">
            {str("emailLabel")}
          </label>
          <input id={`${prefix}-email`} name="email" type="email" required maxLength={120} className={field} />
        </div>
        {bool("showPhone") ? (
          <div className="sm:col-span-2">
            <label htmlFor={`${prefix}-phone`} className="text-xs font-medium">
              {str("phoneLabel")}
            </label>
            <input id={`${prefix}-phone`} name="phone" maxLength={30} className={field} />
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <label htmlFor={`${prefix}-message`} className="text-xs font-medium">
            {str("messageLabel")}
          </label>
          <textarea id={`${prefix}-message`} name="message" required rows={4} maxLength={2000} className={`${field} py-2`} />
        </div>
        {/* Honeypot: never shown, never announced. */}
        <input
          type="text"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          className="hidden"
        />
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={state === "sending"}
            className="inline-flex min-h-11 items-center rounded-fq-md bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {str("buttonLabel")}
          </button>
          <span className="text-xs text-muted-foreground">{str("consentText")}</span>
        </div>
        {state === "error" ? (
          <p role="alert" className="sm:col-span-2 text-sm text-danger">
            Could not send that message. Please try again.
          </p>
        ) : null}
      </form>
    </section>
  );
};

export const BASIC_WIDGETS = {
  button: ButtonWidget,
  icon: IconWidget,
  form: FormWidget,
  nav_menu: NavMenuWidget,
  logo: LogoWidget,
  carousel: CarouselWidget,
} satisfies Record<string, WidgetComponent>;
