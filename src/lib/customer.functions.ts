/**
 * §3 — `/dashboard` RPC surface.
 *
 * Identity and tenancy come from `requireCustomerScope` (bearer session →
 * `customers` row); the client never sends a customer id, merchant id or store
 * slug, so there is nothing to tamper with. Writes are rate limited and only
 * ever touch rows the scope already matched.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCustomer, requireCustomerScope } from "./customer-scope";

const uuid = z.string().uuid();

async function limit(bucket: "storefront.account" | "order.lookup", key: string) {
  const { enforceRateLimit } = await import("./rate-limit.server");
  await enforceRateLimit(bucket, key);
}

/* --------------------------------------------------------------------- reads */

export const customerAccountFn = createServerFn({ method: "GET" })
  .middleware([requireCustomerScope])
  .inputValidator((d: unknown) => z.object({ merchantId: uuid.optional() }).optional().parse(d ?? {}))
  .handler(async ({ context }) => context.customer);

export const customerAccountsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { resolveCustomerAccounts } = await import("./customer.server");
    return resolveCustomerAccounts(context.userId);
  });

export const customerHomeFn = createServerFn({ method: "GET" })
  .middleware([requireCustomerScope])
  .handler(async ({ context }) => {
    const scope = assertCustomer(context.customer);
    const { loadCustomerHome } = await import("./customer.server");
    return loadCustomerHome(scope);
  });

export const customerOrdersFn = createServerFn({ method: "GET" })
  .middleware([requireCustomerScope])
  .inputValidator((d: unknown) => z.object({ page: z.number().int().min(0).max(200).default(0) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const scope = assertCustomer(context.customer);
    const { loadCustomerOrders } = await import("./customer.server");
    return loadCustomerOrders(scope, data.page);
  });

export const customerOrderFn = createServerFn({ method: "GET" })
  .middleware([requireCustomerScope])
  .inputValidator((d: unknown) => z.object({ orderId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const scope = assertCustomer(context.customer);
    await limit("order.lookup", `${scope.id}`);
    const { loadCustomerOrder } = await import("./customer.server");
    return loadCustomerOrder(scope, data.orderId);
  });

export const customerTrackingFn = createServerFn({ method: "GET" })
  .middleware([requireCustomerScope])
  .handler(async ({ context }) => {
    const scope = assertCustomer(context.customer);
    const { loadCustomerTracking } = await import("./customer.server");
    return loadCustomerTracking(scope);
  });

export const customerWishlistFn = createServerFn({ method: "GET" })
  .middleware([requireCustomerScope])
  .handler(async ({ context }) => {
    const scope = assertCustomer(context.customer);
    const { loadCustomerWishlist } = await import("./customer.server");
    return loadCustomerWishlist(scope);
  });

export const customerProfileFn = createServerFn({ method: "GET" })
  .middleware([requireCustomerScope])
  .handler(async ({ context }) => {
    const scope = assertCustomer(context.customer);
    const { loadCustomerProfile } = await import("./customer.server");
    return loadCustomerProfile(scope);
  });

/* -------------------------------------------------------------------- writes */

export const customerSaveProfileFn = createServerFn({ method: "POST" })
  .middleware([requireCustomerScope])
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().min(2).max(120),
        email: z.string().email().max(200).nullish(),
        phone: z.string().min(6).max(24).nullish(),
        locale: z.enum(["en", "bn"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const scope = assertCustomer(context.customer);
    await limit("storefront.account", scope.id);
    const { saveCustomerProfile } = await import("./customer.server");
    return saveCustomerProfile(scope, {
      name: data.name,
      email: data.email ?? null,
      phone: data.phone ?? null,
      locale: data.locale,
    });
  });

export const customerSaveAddressFn = createServerFn({ method: "POST" })
  .middleware([requireCustomerScope])
  .inputValidator((d: unknown) =>
    z
      .object({
        addressId: uuid.nullish(),
        addressType: z.enum(["shipping", "billing"]).default("shipping"),
        label: z.string().min(1).max(40),
        fullName: z.string().min(2).max(120),
        phone: z.string().min(6).max(24),
        line1: z.string().min(4).max(200),
        line2: z.string().max(200).default(""),
        city: z.string().min(2).max(80),
        district: z.string().min(2).max(80),
        postcode: z.string().max(16).default(""),
        isDefault: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const scope = assertCustomer(context.customer);
    await limit("storefront.account", scope.id);
    const { saveCustomerAddress } = await import("./customer.server");
    return saveCustomerAddress(scope, { ...data, addressId: data.addressId ?? null });
  });

export const customerDeleteAddressFn = createServerFn({ method: "POST" })
  .middleware([requireCustomerScope])
  .inputValidator((d: unknown) => z.object({ addressId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const scope = assertCustomer(context.customer);
    await limit("storefront.account", scope.id);
    const { deleteCustomerAddress } = await import("./customer.server");
    return deleteCustomerAddress(scope, data.addressId);
  });

export const customerSetConsentFn = createServerFn({ method: "POST" })
  .middleware([requireCustomerScope])
  .inputValidator((d: unknown) =>
    z
      .object({
        channel: z.enum(["email", "sms", "push"]),
        purpose: z.enum(["marketing", "cart_recovery", "stock_alerts"]),
        granted: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const scope = assertCustomer(context.customer);
    await limit("storefront.account", scope.id);
    const { setCustomerConsent } = await import("./customer.server");
    return setCustomerConsent(scope, data.channel, data.purpose, data.granted);
  });

export const customerRemoveWishlistFn = createServerFn({ method: "POST" })
  .middleware([requireCustomerScope])
  .inputValidator((d: unknown) => z.object({ itemId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const scope = assertCustomer(context.customer);
    await limit("storefront.account", scope.id);
    const { removeWishlistItem } = await import("./customer.server");
    return removeWishlistItem(scope, data.itemId);
  });

export const customerOpenReturnFn = createServerFn({ method: "POST" })
  .middleware([requireCustomerScope])
  .inputValidator((d: unknown) =>
    z
      .object({
        orderId: uuid,
        reason: z.string().min(2).max(200),
        note: z.string().max(500).default(""),
        items: z
          .array(z.object({ orderItemId: uuid, quantity: z.number().int().min(1).max(999) }))
          .min(1)
          .max(50),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const scope = assertCustomer(context.customer);
    await limit("storefront.account", `${scope.id}:return`);
    const { openCustomerReturn } = await import("./customer.server");
    return openCustomerReturn(scope, data);
  });
