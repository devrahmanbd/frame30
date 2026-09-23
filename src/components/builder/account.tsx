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
  return (
    <section className="rounded-fq-lg border border-border bg-card p-6 text-center">
      <Heading className="text-lg font-semibold">
        {str("heading") || body}
      </Heading>
      <p className="mt-1 text-sm text-muted-foreground">
        {t(
          locale,
          "Sign in to continue.",
          "এগিয়ে যেতে সাইন ইন করুন।",
        )}
      </p>
      <a
        href="/account"
        className="mt-4 inline-block min-h-11 rounded-fq-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
      >
        {t(locale, "Sign in", "সাইন ইন")}
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
          className="h-16 animate-pulse rounded-fq-lg border border-border bg-card"
        />
      ))}
    </div>
  );
}

function formatOrderDate(date: string | undefined, locale: string): string {
  if (!date) return "";
  const time = Date.parse(date);
  if (Number.isNaN(time)) return "";
  return new Date(time).toLocaleDateString(
    locale === "bn" ? "bn-BD" : "en-GB",
  );
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
    return (
      <section className="rounded-fq-lg border border-border bg-card p-6">
        <Heading className="text-lg font-semibold">{heading}</Heading>
        <p className="mt-1 text-sm text-muted-foreground">
          {str("emptyText") ||
            t(locale, "No orders yet.", "এখনও কোনো অর্ডার নেই।")}
        </p>
      </section>
    );
  }
  return (
    <section>
      <Heading className="mb-3 text-lg font-semibold">{heading}</Heading>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-fq-lg border border-border bg-card p-4"
          >
            <span>
              <span className="block text-sm font-semibold tabular-nums">
                {row.title}
              </span>
              {formatOrderDate(row.date, locale) && (
                <time
                  dateTime={row.date}
                  className="text-xs text-muted-foreground tabular-nums"
                >
                  {formatOrderDate(row.date, locale)}
                </time>
              )}
            </span>
            {row.subtitle && (
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {row.subtitle}
              </span>
            )}
            {typeof row.priceMinor === "number" && (
              <span className="text-sm font-semibold tabular-nums">
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
        body={
          str("heading") || t(ctx.locale, "Your profile", "আপনার প্রোফাইল")
        }
      />
    );
  }
  const heading = str("heading") || t(ctx.locale, "Your profile", "আপনার প্রোফাইল");
  return (
    <section className="rounded-fq-lg border border-border bg-card p-6">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary"
        >
          {(row.title || "?").trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <Heading className="truncate text-lg font-semibold">
            {row.title || heading}
          </Heading>
          {row.subtitle && (
            <p className="truncate text-sm text-muted-foreground">
              {row.subtitle}
            </p>
          )}
        </div>
      </div>
      {row.body && (
        <p className="mt-3 text-sm tabular-nums text-muted-foreground">
          {row.body}
        </p>
      )}
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
