/**
 * Phase 2.1 — chrome widgets.
 *
 * Bars, navigation, search and account/cart, all theme-neutral: they read
 * design tokens through semantic utility classes only and never import a theme
 * module. Navigation and search take their rows from the shared data layer or
 * the server search function — no client ranking, no client money math.
 */
import { useEffect, useId, useRef, useState } from "react";
import {
  ChevronDown,
  Search,
  Truck,
  RotateCcw,
  ShieldCheck,
  Headset,
  Star,
  X,
  ArrowRight,
} from "@/components/icons/tabler";
import { useRouterState } from "@tanstack/react-router";
import { textOf } from "@/lib/bitext";
import { PaymentMark } from "@/components/store/PaymentMarks";
import { isCustomHostPath } from "@/lib/storefront-url";
import type { SectionType } from "@/lib/builder-ast";
import { useCart } from "@/lib/cart";
import { openCartDrawer } from "./CartContext";
import { LanguageToggle } from "@/components/LanguageToggle";
import { searchStorefrontFn } from "@/lib/storefront-search.functions";
import type { WidgetComponent, WidgetCtx } from "./widgets";
import { OverlayHost } from "./primitives/OverlayHost";
import { MediaFrame } from "./primitives/MediaFrame";

/**
 * `Label|/href` link list. Accepts legacy comma-separated AND newline
 * row format (repeater rows store one link per line); bare labels get
 * href "#". Malformed pairs are dropped, capped at 8.
 */
export function parseLinkList(raw: string): { label: string; href: string }[] {
  return raw
    .split(/[\r\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [label, href] = part.split("|");
      return { label: (label ?? "").trim(), href: (href ?? "").trim() || "#" };
    })
    .filter((link) => link.label.length > 0)
    .slice(0, 8);
}

const TONE_CLASS: Record<string, string> = {
  info: "bg-info-soft text-foreground",
  success: "bg-success-soft text-foreground",
  warning: "bg-warning-soft text-foreground",
  danger: "bg-destructive/10 text-foreground",
};

const TRUST_ICON = {
  delivery: Truck,
  returns: RotateCcw,
  secure: ShieldCheck,
  support: Headset,
  quality: Star,
} as const;

export const SOCIAL_LINKS = [
  {
    name: "YouTube",
    href: "#",
    icon: (
      <svg className="size-4 shrink-0 fill-current" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
  },
  {
    name: "X",
    href: "#",
    icon: (
      <svg className="size-4 shrink-0 fill-current" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z" />
      </svg>
    ),
  },
  {
    name: "Instagram",
    href: "#",
    icon: (
      <svg className="size-4 shrink-0 fill-current" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077" />
      </svg>
    ),
  },
  {
    name: "Facebook",
    href: "#",
    icon: (
      <svg className="size-4 shrink-0 fill-current" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z" />
      </svg>
    ),
  },
] as const;

function AnnouncementBar({ str, bool, int, section, locale }: WidgetCtx) {
  // Repeater-first (faq/trust_bar precedent): studio `items` text rows win
  // when present, scalar m1/m2/m3 remain as the fallback for
  // theme-authored sections. Rotation/dismiss below apply to both.
  const itemRows = Array.isArray(section.props.items)
    ? section.props.items
        .map((row) => textOf(row, "text", locale).trim())
        .filter(Boolean)
    : [];
  const messages =
    itemRows.length > 0
      ? itemRows
      : [str("m1"), str("m2"), str("m3")].filter(Boolean);
  const rotateMs = int("rotateMs", 6000, 0, 60000);
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
  const href = str("href");
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
      {bool("dismissible") && (
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

function UtilityBar({ str, bool }: WidgetCtx) {
  const links = [
    { label: str("l1Label"), href: str("l1Href") },
    { label: str("l2Label"), href: str("l2Href") },
    { label: str("l3Label"), href: str("l3Href") },
  ].filter((link) => link.label);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted px-4 py-1.5 text-xs text-muted-foreground">
      <p className="min-w-0 truncate">{str("note")}</p>
      <nav aria-label="Utility" className="flex items-center gap-3">
        {links.map((link) => (
          <a
            key={link.label}
            href={link.href || "#"}
            className="hover:text-foreground"
          >
            {link.label}
          </a>
        ))}
        {bool("showLanguage") && <LanguageToggle />}
      </nav>
    </div>
  );
}

function TrustBar({ str, section, locale }: WidgetCtx) {
  // Repeater-first (faq precedent in widgets.tsx): studio `items` rows win
  // when present, scalar i1/i2/i3/i4 triples remain as the fallback for
  // theme-authored sections.
  const itemRows = Array.isArray(section.props.items)
    ? section.props.items
        .map((row) => ({
          icon: typeof row.icon === "string" ? row.icon : "",
          title: textOf(row, "title", locale),
          body: textOf(row, "body", locale),
        }))
        .filter((row) => row.title)
    : [];
  const items =
    itemRows.length > 0
      ? itemRows
      : [1, 2, 3, 4]
          .map((n) => ({
            icon: str(`i${n}Icon`),
            title: str(`i${n}Title`),
            body: str(`i${n}Body`),
          }))
          .filter((item) => item.title);
  if (items.length === 0) return null;
  return (
    <ul className="grid grid-cols-2 gap-4 rounded-fq-lg border border-border bg-card p-4 sm:grid-cols-4">
      {items.map((item) => {
        const Icon = TRUST_ICON[item.icon] ?? Star;
        return (
          <li key={item.title} className="flex items-start gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-fq-md bg-primary/10 text-primary">
              <Icon className="size-4" aria-hidden />
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
        );
      })}
    </ul>
  );
}

function PaymentIcons({ str, Heading }: WidgetCtx) {
  const marks = str("marks")
    .split(/[,\n]+/)
    .map((m) => m.trim())
    .filter(Boolean)
    .slice(0, 12);
  if (marks.length === 0) return null;
  return (
    <section className="space-y-2">
      {str("heading") && (
        <Heading className="text-xs fq-caps text-muted-foreground">
          {str("heading")}
        </Heading>
      )}
      <ul className="flex flex-wrap items-center gap-2">
        {marks.map((mark) => (
          <li key={mark}>
            <PaymentMark mark={mark} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Notice({ str, bool }: WidgetCtx) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || !str("text")) return null;
  const tone = TONE_CLASS[str("tone")] ?? TONE_CLASS.info;
  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-fq-md px-4 py-3 text-sm ${tone}`}
    >
      <p className="min-w-0 flex-1">{str("text")}</p>
      {bool("dismissible") && (
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss notice"
          className="shrink-0"
        >
          ×
        </button>
      )}
    </div>
  );
}

function MegaMenu({ str, int, data, link }: WidgetCtx) {
  const [open, setOpen] = useState(false);
  const rows = data?.rows ?? [];
  const label = str("label") || "Shop";
  const visible = rows.slice(0, int("limit", 8, 1, 24));

  if (data?.pending) {
    return (
      <div
        className="h-9 w-24 animate-pulse rounded-fq-md bg-muted"
        aria-hidden="true"
      />
    );
  }
  // No rows, no debris: a lone dropdown button with an empty menu is
  // worse than no menubar at all.
  if (visible.length === 0) return null;
  const inline = visible.slice(0, 6);
  const overflow = visible.slice(6);
  return (
    <div className="bg-background">
      <nav
        aria-label={label}
        className="mx-auto flex max-w-[var(--fq-container,1280px)] items-center gap-4 overflow-x-auto px-4 sm:px-6 py-2"
      >
        {inline.map((row) => (
          <a
            key={row.id}
            href={row.href ? link(row.href) : "#"}
            className="inline-flex min-h-10 shrink-0 items-center whitespace-nowrap px-1 text-[13px] font-semibold tracking-wide fq-caps text-foreground/80 transition-colors hover:text-primary relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-primary after:transition-all hover:after:w-full"
          >
            {row.title}
          </a>
        ))}
        {overflow.length > 0 && (
          <div
            className="relative hidden shrink-0 sm:block"
            onMouseLeave={() => setOpen(false)}
          >
            <button
              type="button"
              aria-expanded={open}
              aria-haspopup="true"
              onClick={() => setOpen((v) => !v)}
              onMouseEnter={() => setOpen(true)}
              className="inline-flex min-h-11 items-center gap-1 whitespace-nowrap px-3 text-sm font-medium text-foreground/80 hover:text-primary"
            >
              {label}
              <ChevronDown className="size-3.5" aria-hidden />
            </button>
            {open && (
              <div className="absolute left-0 top-full z-30 mt-1 w-60 rounded-fq-lg border border-border bg-card p-2 shadow-md">
                <ul className="grid gap-0.5">
                  {overflow.map((row) => (
                    <li key={row.id}>
                      <a
                        href={row.href ? link(row.href) : "#"}
                        className="block rounded-fq-md px-3 py-2 text-sm hover:bg-muted hover:text-primary"
                      >
                        {row.title}
                        {row.subtitle && (
                          <span className="block text-xs text-muted-foreground">
                            {row.subtitle}
                          </span>
                        )}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </nav>
    </div>
  );
}

function DepartmentStrip({ str, int, data, Heading }: WidgetCtx) {
  const rows = data?.rows;
  const limit = int("limit", 12, 1, 24);
  return (
    <section className="space-y-2">
      {str("heading") && (
        <Heading className="text-lg font-semibold">{str("heading")}</Heading>
      )}
      {data?.pending || rows === undefined ? (
        <ul className="flex gap-3 overflow-hidden" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <li
              key={i}
              className="h-9 w-28 shrink-0 animate-pulse rounded-fq-md bg-muted"
            />
          ))}
        </ul>
      ) : (
        <ul className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1">
          {rows.slice(0, limit).map((row) => (
            <li key={row.id} className="snap-start">
              <a
                href={row.href ?? "#"}
                className="inline-flex min-h-9 items-center rounded-fq-md border border-border bg-card px-3 text-sm"
              >
                {row.title}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FooterSitemap({ str, section, link, locale }: WidgetCtx) {
  // Repeater-first (faq/trust_bar precedent): studio `items` rows win when
  // present, scalar c1..c4 pairs remain as the fallback for
  // theme-authored sections. parseLinkList reads both the legacy
  // "Label|/href, …" and the newline row format. Items rows carry the same
  // `_bn` twins as scalars so menu-claimed footers switch locale too.
  const itemRows = Array.isArray(section.props.items)
    ? section.props.items
        .map((row) => {
          const r = row as Record<string, unknown>;
          const title = typeof r.title === "string" ? r.title : "";
          const titleBn = typeof r.title_bn === "string" ? r.title_bn : "";
          const links = parseLinkList(
            typeof r.links === "string" ? r.links : "",
          );
          const linksBn = parseLinkList(
            typeof r.links_bn === "string" ? r.links_bn : "",
          );
          return {
            title: locale === "bn" && titleBn ? titleBn : title,
            links: locale === "bn" && linksBn.length > 0 ? linksBn : links,
          };
        })
        .filter((col) => col.title || col.links.length > 0)
    : [];
  const columns =
    itemRows.length > 0
      ? itemRows
      : [1, 2, 3, 4]
          .map((n) => ({
            title: str(`c${n}Title`),
            links: parseLinkList(str(`c${n}Links`)),
          }))
          .filter((col) => col.title || col.links.length > 0);
  if (columns.length === 0) return null;
  return (
    <div className="w-full">
      {/* Top Row: 4 Social Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y divide-[var(--theme-border)] sm:divide-y-0 sm:divide-x border-b border-[var(--theme-border)] mb-10 sm:mb-12">
        {SOCIAL_LINKS.map((item) => (
          <a
            key={item.name}
            href={item.href}
            onClick={(e) => {
              if (item.href === "#") e.preventDefault();
            }}
            className="group flex min-h-[58px] items-center justify-between px-6 py-4 text-sm font-medium text-[var(--theme-ink)]/80 transition-colors hover:bg-[var(--theme-ink)]/5 hover:text-[var(--theme-ink)] cursor-pointer"
          >
            <span className="flex items-center gap-3">
              <span className="text-[var(--theme-ink)]/70 transition-colors group-hover:text-[var(--theme-ink)]">
                {item.icon}
              </span>
              <span className="tracking-tight">{item.name}</span>
            </span>
            <ArrowRight className="size-4 text-[var(--theme-ink)]/50 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-[var(--theme-ink)]" />
          </a>
        ))}
      </div>

      <nav
        aria-label="Footer"
        className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4 lg:gap-12 px-4 sm:px-6 py-4"
      >
        {columns.map((col) => (
          <div key={col.title}>
            <p className="text-[11px] font-medium tracking-[0.2em] text-[var(--theme-ink)] mb-6 fq-caps">
              {col.title}
            </p>
            <ul className="space-y-4">
              {col.links.map((linkItem) => (
                <li key={`${col.title}-${linkItem.label}`}>
                  <a
                    href={link(linkItem.href)}
                    className="font-serif text-[15px] font-light text-[var(--theme-ink)]/70 hover:text-[var(--theme-ink)] transition-colors"
                  >
                    {linkItem.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}

function storeBase(
  storeSlug: string | null | undefined,
  pathname: string | undefined,
): string {
  if (pathname !== undefined && isCustomHostPath(pathname)) return "";
  return storeSlug ? `/store/${storeSlug}` : "";
}

type Suggestion = {
  id: string;
  title: string;
  slug: string;
  imageUrl: string | null;
};

function SearchCommand({ str, int, storeSlug, locale }: WidgetCtx) {
  const [open, setOpen] = useState(false);
  const { location } = useRouterState();
  const base = storeBase(storeSlug, location.pathname);
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<Suggestion[] | null>(null);
  const [pending, setPending] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const seq = useRef(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rawId = useId();
  const listId = `search-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const inputId = `${listId}-input`;
  const limit = int("limit", 6, 1, 10);
  const isBn = locale === "bn";

  const q = term.trim();
  const placeholder =
    str("placeholder") || (isBn ? "পণ্য খুঁজুন" : "Search products");
  const dialogTitle = str("buttonLabel") || (isBn ? "খুঁজুন" : "Search");
  const searchingText = isBn ? "খোঁজা হচ্ছে…" : "Searching…";
  const hintText = isBn
    ? "খুঁজতে কমপক্ষে ২ অক্ষর লিখুন।"
    : "Type at least 2 characters to search.";
  const unavailableText = isBn
    ? "প্রিভিউতে সার্চ অনুপলব্ধ।"
    : "Search is unavailable in preview.";
  const clearLabel = isBn ? "সার্চ মুছুন" : "Clear search";
  const suggestionsLabel = isBn ? "সাজেশন" : "Suggestions";
  const kbdHint = isBn
    ? "বন্ধ করতে Esc · ঘুরতে ↑↓"
    : "Esc to close · ↑↓ to navigate";
  const tryOther = isBn ? "অন্য শব্দ চেষ্টা করুন।" : "Try another keyword.";
  const viewAllLabel = isBn ? "সব ফল দেখুন" : "View all results";

  const hasList = hits !== null && hits.length > 0;
  const safeActive =
    hasList && activeIndex >= 0 && activeIndex < hits.length ? activeIndex : -1;
  const activeId =
    safeActive >= 0 && hits
      ? `${listId}-opt-${hits[safeActive]!.id}`
      : undefined;
  const viewAllHref = `${base}/search?q=${encodeURIComponent(q)}`;

  useEffect(() => {
    setActiveIndex(-1);
  }, [term, open]);

  useEffect(() => {
    if (!open || !storeSlug) return;
    if (q.length < 2) {
      setHits(null);
      return;
    }
    const ticket = ++seq.current;
    setPending(true);
    const id = window.setTimeout(() => {
      void searchStorefrontFn({
        data: { slug: storeSlug, q, page: 1, sort: "relevance", stock: false },
      })
        .then((result) => {
          if (ticket !== seq.current) return;
          const list = result?.status === "ok" ? result.result.items : [];
          const rows = list.slice(0, limit).map((hit) => ({
            id: hit.id,
            title: hit.title,
            slug: hit.slug,
            imageUrl: hit.image_url ?? null,
          }));
          setHits(rows);
        })
        .catch(() => {
          if (ticket === seq.current) setHits([]);
        })
        .finally(() => {
          if (ticket === seq.current) setPending(false);
        });
    }, 250);
    return () => window.clearTimeout(id);
  }, [term, open, storeSlug, limit, q]);

  const clearTerm = () => {
    setTerm("");
    setHits(null);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const goTo = (href: string) => {
    window.location.assign(href);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (q.length < 2) return;
    if (hasList && safeActive >= 0 && hits) {
      const hit = hits[safeActive]!;
      goTo(storeSlug ? `${base}/p/${hit.slug}` : "#");
      return;
    }
    goTo(viewAllHref);
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && hasList && hits) {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % hits.length);
    } else if (event.key === "ArrowUp" && hasList && hits) {
      event.preventDefault();
      setActiveIndex((prev) => (prev - 1 + hits.length) % hits.length);
    } else if (event.key === "Home" && hasList) {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End" && hasList && hits) {
      event.preventDefault();
      setActiveIndex(hits.length - 1);
    } else if (event.key === "Enter" && hasList && safeActive >= 0 && hits) {
      event.preventDefault();
      const hit = hits[safeActive]!;
      goTo(storeSlug ? `${base}/p/${hit.slug}` : "#");
    } else if (event.key === "Escape" && term.length > 0) {
      // First Escape clears the query; the host closes on the next one.
      event.stopPropagation();
      setTerm("");
      setHits(null);
      setActiveIndex(-1);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={placeholder}
        className="inline-flex min-h-11 w-full items-center gap-2.5 rounded-full border border-border bg-muted px-4 text-sm text-muted-foreground transition-colors motion-safe:transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-72"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-left">{placeholder}</span>
      </button>
      <OverlayHost
        open={open}
        onClose={() => setOpen(false)}
        title={dialogTitle}
        side="center"
      >
        <form role="search" onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <label htmlFor={inputId} className="sr-only">
              {placeholder}
            </label>
            <input
              ref={inputRef}
              id={inputId}
              type="search"
              role="combobox"
              aria-expanded={hasList}
              aria-controls={listId}
              aria-activedescendant={activeId}
              aria-autocomplete="list"
              value={term}
              autoComplete="off"
              onChange={(event) => setTerm(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder={placeholder}
              className="min-h-11 w-full rounded-fq-md border border-border bg-muted/50 py-3 pl-10 pr-11 text-base outline-none transition-colors motion-safe:transition-colors placeholder:text-muted-foreground focus:border-primary focus-visible:ring-2 focus-visible:ring-primary"
            />
            {term.length > 0 && (
              <button
                type="button"
                onClick={clearTerm}
                aria-label={clearLabel}
                className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-fq-md text-muted-foreground transition-colors motion-safe:transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <X className="size-4" aria-hidden />
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{kbdHint}</p>
          <div aria-live="polite" className="min-h-24">
            {pending && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{searchingText}</p>
                <ul aria-hidden="true" className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <li
                      key={i}
                      className="flex min-h-11 items-center gap-3 rounded-fq-md px-3 py-2"
                    >
                      <span className="size-10 shrink-0 animate-pulse rounded-fq-md bg-muted motion-reduce:animate-none" />
                      <span className="h-4 flex-1 animate-pulse rounded-fq-sm bg-muted motion-reduce:animate-none" />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!pending && hits !== null && hits.length === 0 && (
              <div
                role="status"
                className="rounded-fq-md border border-border bg-muted/40 px-4 py-6 text-center"
              >
                <p className="text-sm font-medium">
                  {isBn
                    ? `“${q}” এর জন্য কিছু পাওয়া যায়নি।`
                    : `No matches for “${q}”.`}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{tryOther}</p>
              </div>
            )}
            {!pending && hasList && hits && (
              <div className="overflow-hidden rounded-fq-md border border-border">
                <ul
                  id={listId}
                  role="listbox"
                  aria-label={suggestionsLabel}
                  className="max-h-[min(50vh,20rem)] divide-y divide-border overflow-auto"
                >
                  {hits.map((hit, index) => {
                    const href = storeSlug ? `${base}/p/${hit.slug}` : "#";
                    const selected = index === safeActive;
                    return (
                      <li key={hit.id} role="presentation">
                        <a
                          href={href}
                          role="option"
                          id={`${listId}-opt-${hit.id}`}
                          aria-selected={selected}
                          tabIndex={-1}
                          onMouseEnter={() => setActiveIndex(index)}
                          onMouseLeave={() => setActiveIndex(-1)}
                          className={`flex min-h-11 items-center gap-3 px-3 py-2 text-sm transition-colors motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${selected ? "bg-muted" : ""}`}
                        >
                          <MediaFrame
                            src={hit.imageUrl}
                            alt={hit.title}
                            ratio="square"
                            className="w-10 shrink-0"
                            artSeed={hit.id}
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {hit.title}
                          </span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
                <a
                  href={viewAllHref}
                  className="flex min-h-11 items-center justify-center border-t border-border bg-muted/50 px-3 text-sm font-medium transition-colors motion-safe:transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                >
                  {viewAllLabel}
                  <span className="sr-only">{q ? ` — ${q}` : ""}</span>
                </a>
              </div>
            )}
            {!pending && hits === null && (
              <p className="text-sm text-muted-foreground">
                {storeSlug ? hintText : unavailableText}
              </p>
            )}
          </div>
        </form>
      </OverlayHost>
    </>
  );
}

function AccountCart({ str, bool, storeSlug }: WidgetCtx) {
  const cart = useCart(storeSlug ?? "");
  const count = cart.count;
  const { location } = useRouterState();
  const base = storeBase(storeSlug, location.pathname);
  return (
    <nav aria-label="Account and cart" className="flex items-center gap-2">
      <a
        href={`${base}/account`}
        className="min-h-9 rounded-fq-md px-3 text-sm leading-9"
      >
        {str("accountLabel") || "Account"}
      </a>
      {/* Stays a real link: the drawer only intercepts when one is mounted. */}
      <a
        href={`${base}/cart`}
        onClick={(event) => {
          if (openCartDrawer()) event.preventDefault();
        }}
        className="inline-flex min-h-9 items-center gap-2 rounded-fq-md border border-border bg-card px-3 text-sm"
      >
        {str("cartLabel") || "Cart"}
        {bool("showCount") && (
          <span
            className="min-w-5 rounded-full bg-primary px-1.5 text-center text-xs text-primary-foreground tabular-nums"
            aria-label={`${count} items in cart`}
          >
            {count}
          </span>
        )}
      </a>
    </nav>
  );
}

function SubbrandBar(_ctx: WidgetCtx) {
  // Removed per user request: "The top bar is not needed"
  return null;
}

/** Phase 2.1 renderers, merged into the closed widget map. */
export const CHROME_WIDGETS: Record<
  Extract<
    SectionType,
    | "subbrand_bar"
    | "announcement_bar"
    | "utility_bar"
    | "trust_bar"
    | "payment_icons"
    | "notice"
    | "mega_menu"
    | "department_strip"
    | "footer_sitemap"
    | "search_command"
    | "account_cart"
  >,
  WidgetComponent
> = {
  subbrand_bar: SubbrandBar,
  announcement_bar: AnnouncementBar,
  utility_bar: UtilityBar,
  trust_bar: TrustBar,
  payment_icons: PaymentIcons,
  notice: Notice,
  mega_menu: MegaMenu,
  department_strip: DepartmentStrip,
  footer_sitemap: FooterSitemap,
  search_command: SearchCommand,
  account_cart: AccountCart,
};
