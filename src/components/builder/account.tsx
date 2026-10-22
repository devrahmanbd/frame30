/**
 * Phase 2.5 — account-template widgets.
 *
 * `orders_list` (the shopper's order history) and `profile_card` (the
 * shopper's details) render rows the server resolved under the shopper's own
 * session. Scoping is server-side only: a signed-out shopper resolves NO rows,
 * so dataless here means signed-out and renders a sign-in prompt linking
 * `/account` — the widget never filters, guesses, or reads identity itself.
 *
 * Row contract (shared with the server loaders and preview demo rows):
 * - orders: `title` = order number, `subtitle` = raw status, `priceMinor` =
 *   order total in minor units, `currency`, `date` = ISO creation time.
 * - profile: `title` = display name, `subtitle` = email, `body` = phone.
 *
 * Server-safe: no `window`, no `localStorage`, no subscriptions at render, so
 * these render identically in SSR, the studio canvas and static markup.
 */
import type { ReactNode } from "react";
import type { WidgetRow } from "@/lib/widget-data";
import type { WidgetComponent, WidgetCtx } from "./widgets";
import { partOrder } from "@/lib/widget-parts";

function t(locale: string, en: string, bn: string) {
  return locale === "bn" ? bn : en;
}

/**
 * The widget's row layout. `row` is today's layout — the default — and `card`
 * is the same parts stacked inside one bordered card. The choice is a class,
 * not a second renderer, so the parts stay the parts.
 */
function layoutOf(ctx: WidgetCtx): "row" | "card" {
  return ctx.str("layout") === "card" ? "card" : "row";
}

/** Signed-out state: prompt + link to the platform sign-in page. */
function SignInPrompt({ ctx, body }: { ctx: WidgetCtx; body: string }) {
  const { str, Heading, locale } = ctx;
  return (
    <section className="py-12 text-center">
      <Heading className="text-[11px] font-bold fq-caps tracking-widest text-foreground">
        {str("heading") || body}
      </Heading>
      <p className="mt-3 text-[13.5px] text-muted-foreground leading-relaxed">
        {t(locale, "Sign in to continue.", "এগিয়ে যেতে সাইন ইন করুন।")}
      </p>
      <a
        href="/account"
        className="mt-6 inline-flex min-h-12 items-center justify-center border border-border px-8 text-[11px] font-bold fq-caps tracking-widest text-foreground hover:bg-muted/50 transition-colors"
      >
        {t(locale, "Sign In", "সাইন ইন")}
      </a>
    </section>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: 3 }, (_, i) => (
        <div
          key={i}
          className="h-20 animate-pulse border-b border-border/60 bg-muted/20"
        />
      ))}
    </div>
  );
}

function formatOrderDate(date: string | undefined, locale: string): string {
  if (!date) return "";
  const time = Date.parse(date);
  if (Number.isNaN(time)) return "";
  return new Date(time).toLocaleDateString(locale === "bn" ? "bn-BD" : "en-GB");
}

/**
 * The order row's number and date share ONE block today (the order number
 * with its date under it), so the group stays together when a theme reorders
 * the row — and the group's position is the position of its FIRST part.
 */
const ORDER_TEXT_PARTS = ["number", "date"] as const;

/**
 * One order row, drawn as its parts.
 *
 * **The order is the author's.** `partOrder` returns the widget's effective
 * part order — the theme's list when it is valid, today's order otherwise —
 * and a part the theme dropped is simply not drawn. **The values are the
 * server's**: the order number, its date, its status and its total all come
 * from the shopper's own session-scoped payload.
 */
function OrderRow({ ctx, row }: { ctx: WidgetCtx; row: WidgetRow }) {
  const { str, locale, money } = ctx;
  const order = partOrder(str("parts"), "orders_list");
  const textParts = order.filter((part) =>
    (ORDER_TEXT_PARTS as readonly string[]).includes(part),
  );
  const children: ReactNode[] = [];
  let textGroupDrawn = false;
  order.forEach((part) => {
    if ((ORDER_TEXT_PARTS as readonly string[]).includes(part)) {
      if (textGroupDrawn) return;
      textGroupDrawn = true;
      children.push(
        <span key="order-text" className="min-w-0">
          {textParts.map((text) => {
            if (text === "number") {
              return (
                <span
                  key="number"
                  className="block text-[14px] font-bold text-foreground tabular-nums"
                >
                  {row.title}
                </span>
              );
            }
            const day = formatOrderDate(row.date, locale);
            if (!day) return null;
            return (
              <time
                key="date"
                dateTime={row.date}
                className="mt-1 block text-[12px] font-medium tracking-wide text-muted-foreground tabular-nums"
              >
                {day}
              </time>
            );
          })}
        </span>,
      );
      return;
    }
    if (part === "status") {
      if (!row.subtitle) return;
      children.push(
        <span
          key="status"
          className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground bg-muted/50 px-3 py-1 rounded-full"
        >
          {row.subtitle}
        </span>,
      );
      return;
    }
    if (part === "total") {
      if (typeof row.priceMinor !== "number") return;
      children.push(
        <span
          key="total"
          className="text-[14px] font-semibold text-foreground tracking-wide tabular-nums"
        >
          {money(row.priceMinor, row.currency)}
        </span>,
      );
    }
  });
  const layout = layoutOf(ctx);
  return (
    <li
      className={
        layout === "card"
          ? "flex flex-col items-start gap-3 border border-border/60 p-4"
          : "flex flex-wrap items-center justify-between gap-4 py-6"
      }
    >
      {children}
    </li>
  );
}

/**
 * The shopper's order history. Dataless (signed-out) renders the sign-in
 * prompt; an empty row set (signed in, nothing bought) renders the empty
 * state; otherwise one row per order with the server-priced total.
 */
export const OrdersList: WidgetComponent = (ctx) => {
  const { str, Heading, locale, data, int } = ctx;
  if (data?.pending) return <ListSkeleton />;
  const rows = data?.rows?.slice(0, int("limit", 5, 1, 20));
  if (rows === undefined) {
    return (
      <SignInPrompt
        ctx={ctx}
        body={str("heading") || t(locale, "Your orders", "আপনার অর্ডার")}
      />
    );
  }
  const heading = str("heading") || t(locale, "Your orders", "আপনার অর্ডার");
  if (rows.length === 0) {
    return (
      <section className="py-8 text-center border-t border-border/60 mt-4">
        <Heading className="text-[11px] font-bold fq-caps tracking-widest text-foreground mb-4">
          {heading}
        </Heading>
        <p className="mt-2 text-[13.5px] text-muted-foreground">
          {str("emptyText") ||
            t(locale, "No orders yet.", "এখনও কোনো অর্ডার নেই।")}
        </p>
      </section>
    );
  }
  return (
    <section>
      <Heading className="mb-6 text-[11px] font-bold fq-caps tracking-widest text-muted-foreground border-b border-border/60 pb-3">
        {heading}
      </Heading>
      <ul className="divide-y divide-border/60">
        {rows.map((row) => (
          <OrderRow key={row.id} ctx={ctx} row={row} />
        ))}
      </ul>
    </section>
  );
};

/**
 * The profile card's text parts — the name, the email and the phone. They
 * share ONE block today (the name with the email and the phone under it), so
 * the group stays together when a theme reorders the card.
 */
const PROFILE_TEXT_PARTS = ["name", "email", "phone"] as const;

/**
 * The shopper's details card. Dataless renders the sign-in prompt (never an
 * empty card, never a crash); otherwise name, email and phone from the row.
 *
 * **The order is the author's** — the card's parts are drawn in the order
 * `partOrder` returns, and a part the theme dropped is not drawn. **The
 * values are the server's**: they come from the shopper's own row.
 */
export const ProfileCard: WidgetComponent = (ctx) => {
  const { str, Heading, data } = ctx;
  if (data?.pending) return <ListSkeleton />;
  const row = data?.rows?.[0];
  if (!row) {
    return (
      <SignInPrompt
        ctx={ctx}
        body={str("heading") || t(ctx.locale, "Your profile", "আপনার প্রোফাইল")}
      />
    );
  }
  const heading =
    str("heading") || t(ctx.locale, "Your profile", "আপনার প্রোফাইল");
  const order = partOrder(str("parts"), "profile_card");
  const textParts = order.filter((part) =>
    (PROFILE_TEXT_PARTS as readonly string[]).includes(part),
  );
  const children: ReactNode[] = [];
  let textGroupDrawn = false;
  order.forEach((part) => {
    if ((PROFILE_TEXT_PARTS as readonly string[]).includes(part)) {
      if (textGroupDrawn) return;
      textGroupDrawn = true;
      children.push(
        <div key="profile-text" className="min-w-0 pt-1">
          {textParts.map((text) => {
            if (text === "name") {
              return (
                <Heading
                  key="name"
                  className="truncate text-[13.5px] font-bold text-foreground"
                >
                  {row.title || heading}
                </Heading>
              );
            }
            if (text === "email") {
              if (!row.subtitle) return null;
              return (
                <p
                  key="email"
                  className="mt-1 truncate text-[13px] text-muted-foreground"
                >
                  {row.subtitle}
                </p>
              );
            }
            if (!row.body) return null;
            return (
              <p
                key="phone"
                className="mt-2 text-[13px] font-medium tracking-wide tabular-nums text-foreground/80"
              >
                {row.body}
              </p>
            );
          })}
        </div>,
      );
      return;
    }
    if (part === "avatar") {
      children.push(
        <span
          key="avatar"
          aria-hidden="true"
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-[16px] font-bold text-foreground"
        >
          {(row.title || "?").trim().charAt(0).toUpperCase()}
        </span>,
      );
    }
  });
  // (Repair 2026-09-24: a parallel edit dropped the `return (` leaving a
  // dangling JSX block that broke the production build. Restored verbatim —
  // ProfileCard with row data returns the details section.)
  return (
    <section className="border border-border/60 p-6 bg-transparent">
      <div className="flex items-start gap-4">{children}</div>
    </section>
  );
};

// NOTE: keyed by the account-template widget types. The `satisfies
// Partial<Record<SectionType, WidgetComponent>>` assertion the other groups
// carry lands at integration, when `SectionType` (builder-ast, parallel
// track) grows `orders_list` / `profile_card` — spreading this map into
// `WIDGET_COMPONENTS` needs no excess-key check either way.
export const ACCOUNT_WIDGETS: Record<
  "orders_list" | "profile_card",
  WidgetComponent
> = {
  orders_list: OrdersList,
  profile_card: ProfileCard,
};
