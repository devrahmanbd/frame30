/**
 * `requirePermission()` — the only approved authorisation gate for mutating
 * server functions.
 *
 * Client-safe module (no `.server` import at module scope): the actual actor
 * resolution lives in `authz.server.ts` and is imported inside the handler, so
 * `*.functions.ts` files can reference this middleware freely.
 *
 *   createServerFn({ method: "POST" })
 *     .middleware([requirePermission("plan.write")])
 *     .inputValidator(...)
 *     .handler(async ({ context }) => { context.actor; })
 */

import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isDangerous, isPlatformPermission, type AnyPermission } from "./authz";

export function requirePermission(permission: AnyPermission) {
  return createMiddleware({ type: "function" })
    .middleware([requireSupabaseAuth])
    .server(async ({ next, context, data }) => {
      const { loadActor, assertPermission } = await import("./authz.server");
      const scoped = data as { merchantId?: string } | undefined;
      const actor = await loadActor(
        context.supabase,
        context.userId,
        isPlatformPermission(permission) ? null : (scoped?.merchantId ?? null),
      );
      assertPermission(permission, actor);
      // §5: a DANGEROUS permission additionally burns a fresh step-up grant
      // for its action class. `assertStepUp` is a no-op for ordinary grants.
      if (isDangerous(permission)) {
        const { assertStepUp } = await import("./hardening.server");
        await assertStepUp(context.supabase, permission, actor.merchantId);
      }
      return next({ context: { actor, permission, stepUp: isDangerous(permission) } });
    });
}
