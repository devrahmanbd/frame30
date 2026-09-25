/**
 * Shared context-slot builders for the account center.
 *
 * `orders_list` / `profile_card` are context-gated widgets: SectionRenderer
 * renders the route's slot node instead of the widget, so routes (live
 * session data) and the preview frame (demo rows) both build slot nodes
 * through these helpers. Row mapping is pure and unit-tested; only the
 * sources differ.
 */
import type { Section } from "@/lib/builder-ast";
import type { Locale } from "@/lib/bitext";
import type { WidgetRow } from "@/lib/widget-data";
import { widgetReader, type WidgetCtx } from "@/components/builder/widgets";
import { formatDisplayMoney } from "@/lib/money-display";

export type OrderLike = {
  id: string;
  order_number: string;
  status: string;
  total_minor_int: number;
  currency_code: string;
  created_at: string;
};

export type ProfileLike = {
  name: string;
  email: string | null;
  phone: string | null;
};

export function mapOrdersToRows(orders: OrderLike[]): WidgetRow[] {
  return orders.map((o) => ({
    id: o.id,
    title: o.order_number,
    subtitle: o.status,
    priceMinor: o.total_minor_int,
    currency: o.currency_code,
    date: o.created_at,
  }));
}

export function mapProfileToRow(
  profile: ProfileLike | null,
): WidgetRow | undefined {
  if (!profile) return undefined;
  return {
    id: "profile",
    title: profile.name,
    subtitle: profile.email ?? "",
    body: profile.phone ?? "",
  };
}

export function accountSlotCtx(
  section: Section,
  args: {
    rows: WidgetRow[] | undefined;
    pending: boolean;
    locale: Locale;
    storeSlug: string;
  },
): WidgetCtx {
  return {
    section,
    ...widgetReader(section, undefined, args.locale),
    link: (href: string) => {
      if (
        !href ||
        href.startsWith("http") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href === "#"
      )
        return href;
      return href.startsWith("/") ? href : `/${href}`;
    },
    Heading: "h2",
    primary: false,
    editing: false,
    locale: args.locale,
    storeSlug: args.storeSlug,
    money: (minor, currency) =>
      formatDisplayMoney(minor, {
        locale: args.locale,
        ...(currency ? { currency } : {}),
      }),
    data: { rows: args.rows, pending: args.pending },
    renderChildren: () => null,
  };
}
