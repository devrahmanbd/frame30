import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Unauthenticated: lockout verdict before a password attempt is made. */
export const signInGuardFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ email: z.string().email().max(254) }).parse(d))
  .handler(async ({ data }) => {
    const { signInGuard } = await import("./identity.server");
    return signInGuard(data.email);
  });

/** Unauthenticated: audit trail for client-observed auth outcomes. */
export const recordAuthEventFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        event: z.enum([
          "signin.success",
          "signin.failed",
          "signup.success",
          "signup.failed",
          "oauth.started",
          "mfa.challenge.failed",
          "mfa.challenge.success",
          "mfa.enrolled",
          "mfa.unenrolled",
          "password.changed",
          "email.change.requested",
          "signout",
        ]),
        outcome: z.enum(["ok", "denied", "error"]),
        userId: z.string().uuid().nullish(),
        email: z.string().email().max(254).nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { recordAuthEvent } = await import("./identity.server");
    await recordAuthEvent(data);
    return { ok: true };
  });

export const requestPasswordResetFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ email: z.string().email().max(254), redirectTo: z.string().url().max(500) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { requestPasswordReset } = await import("./identity.server");
    return requestPasswordReset(data.email, data.redirectTo);
  });

export const registerMerchantFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().email().max(254),
        password: z.string().min(8),
        fullName: z.string().max(200),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { registerMerchant } = await import("./identity.server");
    return registerMerchant(data);
  });

export const registerSessionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ sessionId: z.string().min(8).max(200), aal: z.string().max(10).nullish() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { registerSession } = await import("./identity.server");
    return registerSession(context.userId, { sessionId: data.sessionId, aal: data.aal ?? null });
  });

export const securityDeskFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ sessionId: z.string().max(200).nullish() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { loadSecurityDesk } = await import("./identity.server");
    return loadSecurityDesk(context.supabase, context.userId, data.sessionId ?? null);
  });

export const revokeOtherSessionsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ keepSessionId: z.string().max(200).nullish() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { markSessionsRevoked } = await import("./identity.server");
    return markSessionsRevoked(context.userId, data.keepSessionId ?? null);
  });

export const grantStepUpFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        action: z.enum(["refund", "payout", "purge", "api_key.rotate"]),
        merchantId: z.string().uuid().nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { grantStepUp } = await import("./identity.server");
    return grantStepUp(context.userId, context.claims as Record<string, unknown>, {
      action: data.action,
      merchantId: data.merchantId ?? null,
    });
  });

/** Regenerates recovery codes. Returns plaintext once; refuses without aal2. */
export const regenerateRecoveryCodesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { regenerateRecoveryCodes } = await import("./mfa-recovery.server");
    return regenerateRecoveryCodes(
      context.supabase,
      context.userId,
      context.claims as Record<string, unknown>,
    );
  });

export const recoveryCodeStatusFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { recoveryCodeStatus } = await import("./mfa-recovery.server");
    return recoveryCodeStatus(context.supabase, context.userId);
  });

export const consumeRecoveryCodeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ code: z.string().min(4).max(40) }).parse(d))
  .handler(async ({ data, context }) => {
    const { consumeRecoveryCode } = await import("./mfa-recovery.server");
    return consumeRecoveryCode(context.userId, data.code);
  });

export const requestEmailChangeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ newEmail: z.string().email().max(254), redirectTo: z.string().url().max(500) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requestEmailChange } = await import("./identity.server");
    return requestEmailChange(context.supabase, context.userId, {
      newEmail: data.newEmail,
      redirectTo: data.redirectTo,
    });
  });
