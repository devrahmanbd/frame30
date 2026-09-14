/**
 * §3 — `/dashboard` identity middleware.
 *
 * A shopper never asserts who they are: the bearer session gives `auth.uid()`,
 * and the `customers` row behind it gives both the customer id and the tenant.
 * Every dashboard query is scoped by that pair, so an order id belonging to
 * another shopper (or another store) simply does not match.
 *
 * `customer` is nullable on purpose — a signed-in user without a shopper row
 * has an unfinished signup, not a permission failure. Mutations use
 * `assertCustomer()` and refuse.
 */
import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CustomerScope = {
  id: string;
  merchantId: string;
  name: string;
  email: string | null;
  phone: string | null;
  locale: string;
  storeName: string | null;
  storeSlug: string | null;
  currencyCode: string;
};

export const requireCustomerScope = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context, data }) => {
    const { resolveCustomerScope } = await import("./customer.server");
    const scoped = data as { merchantId?: string } | undefined;
    const customer = await resolveCustomerScope(context.userId, scoped?.merchantId ?? null);
    return next({ context: { customer } });
  });

export function assertCustomer(customer: CustomerScope | null): CustomerScope {
  if (!customer) throw new Error("customer_profile_missing");
  return customer;
}
