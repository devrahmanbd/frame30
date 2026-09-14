/**
 * Phase 2.1 — chrome widgets.
 *
 * Bars, navigation, search and account/cart, all theme-neutral: they read
 * design tokens through semantic utility classes only and never import a theme
 * module. Navigation and search take their rows from the shared data layer or
 * the server search function — no client ranking, no client money math.
 */
import { useEffect, useRef, useState } from "react";
import type { SectionType } from "@/lib/builder-ast";
import { useCart } from "@/lib/cart";
import { openCartDrawer } from "./CartContext";
import { LanguageToggle } from "@/components/LanguageToggle";
import { searchStorefrontFn } from "@/lib/storefront-search.functions";
import type { WidgetComponent, WidgetCtx } from "./widgets";
import { OverlayHost } from "./primitives/OverlayHost";
import { MediaFrame } from "./primitives/MediaFrame";

/** `Label|/href, Label|/href` → link list. Malformed pairs are dropped. */
export function parseLinkList(raw: string): { label: string; href: string }[] {
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

const TONE_CLASS: Record<string, string> = {
  info: "bg-info-soft text-foreground",
  success: "bg-success-soft text-foreground",
  warning: "bg-warning-soft text-foreground",
  danger: "bg-destructive/10 text-foreground",
};

const TRUST_ICON: Record<string, string> = {
  delivery: "🚚",
  returns: "↩",
  secure: "🔒",
  support: "💬",
  quality: "★",
};

function AnnouncementBar({ str, bool, int }: WidgetCtx) {
  const messages = [str("m1"), str("m2"), str("m3")].filter(Boolean);
  const rotateMs = int("rotateMs", 6000, 0, 60000);
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (rotateMs < 1000 || messages.length < 2) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % messages.length), rotateMs);
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
          <a key={link.label} href={link.href || "#"} className="hover:text-foreground">
            {link.label}
          </a>
        ))}
        {bool("showLanguage") && <LanguageToggle />}
      </nav>
    </div>
  );
}

function TrustBar({ str }: WidgetCtx) {
  const items = [1, 2, 3, 4]
    .map((n) => ({
      icon: str(`i${n}Icon`),
      title: str(`i${n}Title`),
      body: str(`i${n}Body`),
    }))
    .filter((item) => item.title);
  if (items.length === 0) return null;
  return (
    <ul className="grid grid-cols-2 gap-4 rounded-fq-lg border border-border bg-card p-4 sm:grid-cols-4">
      {items.map((item) => (
        <li key={item.title} className="flex items-start gap-2">
          <span aria-hidden="true" className="text-lg leading-none">
            {TRUST_ICON[item.icon] ?? "•"}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium">{item.title}</span>
            {item.body && <span className="block text-xs text-muted-foreground">{item.body}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function PaymentIcons({ str, Heading }: WidgetCtx) {
  const marks = str("marks")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean)
    .slice(0, 12);
  if (marks.length === 0) return null;
  return (
    <section className="space-y-2">
      {str("heading") && <Heading className="text-xs fq-caps text-muted-foreground">{str("heading")}</Heading>}
      <ul className="flex flex-wrap items-center gap-2">
        {marks.map((mark) => (
          <li
            key={mark}
            className="rounded-fq-sm border border-border bg-card px-2 py-1 text-xs text-muted-foreground"
          >
            {mark}
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
    <div role="status" className={`flex items-start gap-3 rounded-fq-md px-4 py-3 text-sm ${tone}`}>
      <p className="min-w-0 flex-1">{str("text")}</p>
      {bool("dismissible") && (
        <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss notice" className="shrink-0">
          ×
        </button>
      )}
    </div>
  );
}

function MegaMenu({ str, int, data }: WidgetCtx) {
  const [open, setOpen] = useState(false);
  const rows = data?.rows ?? [];
  const columns = int("columns", 4, 1, 4);
  const label = str("label") || "Shop";
  const gridClass =
    columns === 1 ? "grid-cols-1" : columns === 2 ? "sm:grid-cols-2" : columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-4";

  if (data?.pending) {
    return <div className="h-9 w-24 animate-pulse rounded-fq-md bg-muted" aria-hidden="true" />;
  }
  return (
    <div className="relative" onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        className="min-h-9 rounded-fq-md px-3 text-sm font-medium"
      >
        {label}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-[min(90vw,48rem)] rounded-fq-lg border border-border bg-card p-4 shadow-md">
          <nav aria-label={label} className={`grid grid-cols-1 gap-4 ${gridClass}`}>
            {rows.slice(0, int("limit", 8, 1, 24)).map((row) => (
              <div key={row.id}>
                <a href={row.href ?? "#"} className="block text-sm font-semibold hover:underline">
                  {row.title}
                </a>
                {row.subtitle && <p className="mt-1 text-xs text-muted-foreground">{row.subtitle}</p>}
                {typeof row.count === "number" && (
                  <p className="mt-1 text-xs text-muted-foreground">{row.count}</p>
                )}
              </div>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}

function DepartmentStrip({ str, int, data, Heading }: WidgetCtx) {
  const rows = data?.rows;
  const limit = int("limit", 12, 1, 24);
  return (
    <section className="space-y-2">
      {str("heading") && <Heading className="text-lg font-semibold">{str("heading")}</Heading>}
      {data?.pending || rows === undefined ? (
        <ul className="flex gap-3 overflow-hidden" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="h-9 w-28 shrink-0 animate-pulse rounded-fq-md bg-muted" />
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

function FooterSitemap({ str }: WidgetCtx) {
  const columns = [1, 2, 3, 4]
    .map((n) => ({ title: str(`c${n}Title`), links: parseLinkList(str(`c${n}Links`)) }))
    .filter((col) => col.title || col.links.length > 0);
  if (columns.length === 0) return null;
  return (
    <nav aria-label="Footer" className="grid grid-cols-2 gap-6 sm:grid-cols-4">
      {columns.map((col) => (
        <div key={col.title}>
          <p className="text-xs font-semibold fq-caps text-muted-foreground">{col.title}</p>
          <ul className="mt-2 space-y-1">
            {col.links.map((link) => (
              <li key={`${col.title}-${link.label}`}>
                <a href={link.href} className="text-sm hover:underline">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

type Suggestion = { id: string; title: string; slug: string; imageUrl: string | null };

function SearchCommand({ str, int, storeSlug, money }: WidgetCtx) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<Suggestion[] | null>(null);
  const [pending, setPending] = useState(false);
  const seq = useRef(0);
  const limit = int("limit", 6, 1, 10);

  useEffect(() => {
    if (!open || !storeSlug) return;
    const q = term.trim();
    if (q.length < 2) {
      setHits(null);
      return;
    }
    const ticket = ++seq.current;
    setPending(true);
    const id = window.setTimeout(() => {
      void searchStorefrontFn({ data: { slug: storeSlug, q, page: 1, sort: "relevance", stock: false } })
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
  }, [term, open, storeSlug, limit]);

  void money;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-9 items-center gap-2 rounded-fq-md border border-border bg-card px-3 text-sm text-muted-foreground"
      >
        <span aria-hidden="true">⌕</span>
        {str("placeholder") || "Search"}
      </button>
      <OverlayHost open={open} onClose={() => setOpen(false)} title={str("buttonLabel") || "Search"} side="center">
        <div className="space-y-3">
          <label className="block">
            <span className="sr-only">{str("placeholder") || "Search products"}</span>
            <input
              type="search"
              value={term}
              autoComplete="off"
              onChange={(event) => setTerm(event.target.value)}
              placeholder={str("placeholder") || "Search products"}
              className="w-full rounded-fq-md border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <div aria-live="polite" className="min-h-24">
            {pending && <p className="text-sm text-muted-foreground">Searching…</p>}
            {!pending && hits !== null && hits.length === 0 && (
              <p className="text-sm text-muted-foreground">No matches.</p>
            )}
            {!pending && hits && hits.length > 0 && (
              <ul className="divide-y divide-border">
                {hits.map((hit) => (
                  <li key={hit.id}>
                    <a
                      href={storeSlug ? `/store/${storeSlug}/p/${hit.slug}` : "#"}
                      className="flex items-center gap-3 py-2 text-sm hover:underline"
                    >
                      <MediaFrame src={hit.imageUrl} alt={hit.title} ratio="square" className="w-10 shrink-0" />
                      <span className="min-w-0 truncate">{hit.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </OverlayHost>
    </>
  );
}

function AccountCart({ str, bool, storeSlug }: WidgetCtx) {
  const cart = useCart(storeSlug ?? "");
  const count = cart.count;
  const base = storeSlug ? `/store/${storeSlug}` : "";
  return (
    <nav aria-label="Account and cart" className="flex items-center gap-2">
      <a href={`${base}/account`} className="min-h-9 rounded-fq-md px-3 text-sm leading-9">
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

/** Phase 2.1 renderers, merged into the closed widget map. */
export const CHROME_WIDGETS: Record<
  Extract<
    SectionType,
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
