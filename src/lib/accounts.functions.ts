/**
 * Shopper account surface. Tenancy comes from the storefront slug in the URL and
 * identity from the bearer session — never from anything the client asserts.
 * Every write is rate limited and every read is resolved by a security-definer
 * routine that scopes to `auth.uid()`.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const slugInput = z.object({ slug: z.string().min(1).max(80) });

const addressSchema = slugInput.extend({
  addressId: z.string().uuid().nullish(),
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
});

async function guard(slug: string, userId: string) {
  const { enforceRateLimit } = await import("./rate-limit.server");
  await enforceRateLimit("storefront.account", `${slug}:${userId}`);
  const { storeBySlug } = await import("./accounts.server");
  return storeBySlug(slug);
}

export const accountOverviewFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => slugInput.parse(d))
  .handler(async ({ data, context }) => {
    const store = await guard(data.slug, context.userId);
    const { accountOverview } = await import("./accounts.server");
    const overview = await accountOverview(context.supabase, store.id);
    return { store, overview };
  });

export const accountOrderFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => slugInput.extend({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const store = await guard(data.slug, context.userId);
    const { ownOrderDetail } = await import("./accounts.server");
    return ownOrderDetail(context.supabase, store.id, data.orderId);
  });

export const accountUpsertSelfFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    slugInput
      .extend({
        name: z.string().min(2).max(120),
        email: z.string().email().max(254).or(z.literal("")).default(""),
        phone: z.string().min(6).max(24),
        locale: z.enum(["bn", "en"]).default("bn"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const store = await guard(data.slug, context.userId);
    const { upsertCustomer } = await import("./accounts.server");
    await upsertCustomer(context.supabase, store.id, {
      name: data.name,
      email: data.email,
      phone: data.phone,
      locale: data.locale,
    });
    return { ok: true };
  });

export const accountSaveAddressFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => addressSchema.parse(d))
  .handler(async ({ data, context }) => {
    const store = await guard(data.slug, context.userId);
    const { saveAddress } = await import("./accounts.server");
    await saveAddress(context.supabase, store.id, { ...data, addressId: data.addressId ?? null });
    return { ok: true };
  });

export const accountDeleteAddressFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => slugInput.extend({ addressId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const store = await guard(data.slug, context.userId);
    const { deleteAddress } = await import("./accounts.server");
    await deleteAddress(context.supabase, store.id, data.addressId);
    return { ok: true };
  });

export const accountToggleWishlistFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    slugInput
      .extend({ variantId: z.string().uuid(), stockAlert: z.boolean().default(false) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const store = await guard(data.slug, context.userId);
    const { toggleWishlist } = await import("./accounts.server");
    return { saved: await toggleWishlist(context.supabase, store.id, data.variantId, data.stockAlert) };
  });

export const accountSetConsentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    slugInput
      .extend({
        channel: z.enum(["email", "sms", "push"]),
        purpose: z.enum(["marketing", "cart_recovery", "stock_alerts"]),
        granted: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const store = await guard(data.slug, context.userId);
    const { setConsent } = await import("./accounts.server");
    await setConsent(context.supabase, store.id, data.channel, data.purpose, data.granted);
    return { ok: true };
  });
