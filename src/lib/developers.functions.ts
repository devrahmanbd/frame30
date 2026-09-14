import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Merchant-facing developer platform RPC: OAuth apps, webhook endpoints and
 * consent management. All authorisation (role checks, rate limits, audit) lives
 * in the server modules so these stay thin wrappers.
 */
async function scope(db: SupabaseClient<Database>, userId: string) {
  const { currentMerchantId } = await import("./marketing.server");
  return currentMerchantId(db, userId);
}

const scopeEnum = z.enum([
  "orders.read",
  "orders.write",
  "products.read",
  "products.write",
  "customers.read",
  "analytics.read",
  "exports.read",
  "exports.write",
  "webhooks.read",
  "webhooks.write",
]);

/* ----------------------------- OAuth apps ----------------------------- */

export const oauthClientsListFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listClients } = await import("./oauth.server");
    return listClients(context.supabase, await scope(context.supabase, context.userId));
  });

export const oauthClientSaveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().nullable().optional(),
        name: z.string().trim().min(2).max(120),
        clientType: z.enum(["public", "confidential"]),
        redirectUris: z.array(z.string().trim().min(1).max(500)).min(1).max(8),
        scopes: z.array(scopeEnum).min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { saveClient } = await import("./oauth.server");
    const merchantId = await scope(context.supabase, context.userId);
    return saveClient(context.supabase, merchantId, context.userId, {
      id: data.id ?? null,
      name: data.name,
      clientType: data.clientType,
      redirectUris: data.redirectUris,
      scopes: data.scopes,
    });
  });

export const oauthClientRotateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { rotateClientSecret } = await import("./oauth.server");
    const merchantId = await scope(context.supabase, context.userId);
    return rotateClientSecret(context.supabase, merchantId, context.userId, data.id);
  });

export const oauthClientStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(["active", "disabled"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { setClientStatus } = await import("./oauth.server");
    const merchantId = await scope(context.supabase, context.userId);
    return setClientStatus(context.supabase, merchantId, context.userId, data.id, data.status);
  });

export const oauthConsentRevokeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ consentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { revokeConsent } = await import("./oauth.server");
    const merchantId = await scope(context.supabase, context.userId);
    return revokeConsent(context.supabase, merchantId, context.userId, data.consentId);
  });

/* ------------------------- Consent screen (grant) ---------------------- */

const authorizeInput = z.object({
  clientId: z.string().trim().min(4).max(120),
  redirectUri: z.string().trim().min(4).max(500),
  scopes: z.array(scopeEnum).min(1),
  codeChallenge: z.string().trim().min(20).max(128),
  codeChallengeMethod: z.string().trim().max(10),
  state: z.string().trim().max(500).nullable().optional(),
});

export const oauthAuthorizeDescribeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => authorizeInput.parse(d))
  .handler(async ({ data }) => {
    const { describeAuthorization } = await import("./oauth.server");
    const described = await describeAuthorization({ ...data, state: data.state ?? null });
    // Never hand the merchant row id to the browser; the consent screen only
    // needs the app name and the scope decision.
    return { appName: described.appName, granted: described.granted, refused: described.refused };
  });

export const oauthAuthorizeGrantFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => authorizeInput.parse(d))
  .handler(async ({ data, context }) => {
    const { issueCode } = await import("./oauth.server");
    const result = await issueCode(context.userId, { ...data, state: data.state ?? null });
    return { redirectTo: result.redirectTo };
  });

/* ------------------------------ Webhooks ------------------------------ */

export const webhooksListFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listWebhooks } = await import("./webhooks.server");
    return listWebhooks(context.supabase, await scope(context.supabase, context.userId));
  });

export const webhookSaveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().nullable().optional(),
        url: z.string().trim().min(8).max(500),
        description: z.string().trim().max(200).default(""),
        events: z.array(z.string().trim().max(60)).min(1).max(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { saveWebhook } = await import("./webhooks.server");
    const merchantId = await scope(context.supabase, context.userId);
    return saveWebhook(context.supabase, merchantId, context.userId, {
      id: data.id ?? null,
      url: data.url,
      description: data.description,
      events: data.events,
    });
  });

export const webhookRotateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { rotateWebhookSecret } = await import("./webhooks.server");
    const merchantId = await scope(context.supabase, context.userId);
    return rotateWebhookSecret(context.supabase, merchantId, context.userId, data.id);
  });

export const webhookStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(["active", "paused", "disabled"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { setWebhookStatus } = await import("./webhooks.server");
    const merchantId = await scope(context.supabase, context.userId);
    return setWebhookStatus(context.supabase, merchantId, context.userId, data.id, data.status);
  });

export const webhookTestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { sendTestEvent } = await import("./webhooks.server");
    const merchantId = await scope(context.supabase, context.userId);
    return sendTestEvent(context.supabase, merchantId, context.userId, data.id);
  });

export const webhookReplayFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ deliveryId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { replayDelivery } = await import("./webhooks.server");
    const merchantId = await scope(context.supabase, context.userId);
    return replayDelivery(context.supabase, merchantId, context.userId, data.deliveryId);
  });
