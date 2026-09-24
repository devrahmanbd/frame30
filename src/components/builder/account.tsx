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
import type { WidgetComponent, WidgetCtx } from "./widgets";

function t(locale: string, en: string, bn: string) {
  return locale === "bn" ? bn : en;
}

/** Signed-out state: prompt + link to the platform sign-in page. */
function SignInPrompt({ ctx, body }: { ctx: WidgetCtx; body: string }) {
  const { str, Heading, locale } = ctx;
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
 * The shopper's order history. Dataless (signed-out) renders the sign-in
 * prompt; an empty row set (signed in, nothing bought) renders the empty
 * state; otherwise one row per order with the server-priced total.
 */
export const OrdersList: WidgetComponent = (ctx) => {
  const { str, Heading, locale, data, money, int } = ctx;
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
      <section className="py-8 text-center border-t border-border/60 mt-4">
        <Heading className="text-[11px] font-bold fq-caps tracking-widest text-foreground mb-4">{heading}</Heading>
        <p className="mt-2 text-[13.5px] text-muted-foreground">
          {str("emptyText") ||
            t(locale, "No orders yet.", "এখনও কোনো অর্ডার নেই।")}
        </p>
      </section>
  }
  return (
    <section>
      <Heading className="mb-6 text-[11px] font-bold fq-caps tracking-widest text-muted-foreground border-b border-border/60 pb-3">{heading}</Heading>
      <ul className="divide-y divide-border/60">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-4 py-6"
          >
            <span className="min-w-0">
              <span className="block text-[14px] font-bold text-foreground tabular-nums">
                {row.title}
              </span>
              {formatOrderDate(row.date, locale) && (
                <time
                  dateTime={row.date}
                  className="mt-1 block text-[12px] font-medium tracking-wide text-muted-foreground tabular-nums"
                >
                  {formatOrderDate(row.date, locale)}
                </time>
              )}
            </span>
            {row.subtitle && (
              <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
                {row.subtitle}
              </span>
            )}
            {typeof row.priceMinor === "number" && (
              <span className="text-[14px] font-semibold text-foreground tracking-wide tabular-nums">
                {money(row.priceMinor, row.currency)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};

/**
 * The shopper's details card. Dataless renders the sign-in prompt (never an
 * empty card, never a crash); otherwise name, email and phone from the row.
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
    <section className="border border-border/60 p-6 bg-transparent">
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-[16px] font-bold text-foreground"
        >
          {(row.title || "?").trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 pt-1">
          <Heading className="truncate text-[13.5px] font-bold text-foreground">
            {row.title || heading}
          </Heading>
          {row.subtitle && (
            <p className="mt-1 truncate text-[13px] text-muted-foreground">
              {row.subtitle}
            </p>
          )}
          {row.body && (
            <p className="mt-2 text-[13px] font-medium tracking-wide tabular-nums text-foreground/80">
              {row.body}
            </p>
          )}
        </div>
      </div>
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
