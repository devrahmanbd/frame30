/**
 * Phase 8.4 — tenant isolation lives at the data layer.
 *
 * The renderer is a pure function of (AST, rows): it has no idea which tenant
 * it is drawing, and it must stay that way. Every resolver entry point that
 * accepts a merchant id therefore validates it here first, so a missing,
 * blank or malformed id fails loudly instead of silently widening a query.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ids that read like "every tenant". A resolver that receives one of these has
 * lost its scope somewhere upstream, so it must fail rather than fan out.
 */
const WILDCARDS = new Set(["*", "all", "any", "null", "undefined", "0", "-"]);

export class TenantScopeError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "TenantScopeError";
  }
}

export function isTenantId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const id = value.trim();
  if (id.length === 0 || id.length > 64) return false;
  if (WILDCARDS.has(id.toLowerCase())) return false;
  // Separator characters would let an id smuggle its way into a cache key or a
  // filter expression built from it.
  return !/[\s:*%,'"();]/.test(id);
}

/** Stricter form: a real database tenant id. Storage-facing paths use this. */
export function isTenantUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value.trim());
}

/** Returns the normalised id, or throws — never returns a falsy id. */
export function assertTenantId(value: unknown, scope: string): string {
  if (!isTenantId(value)) {
    throw new TenantScopeError("tenant.scope_missing", `${scope} requires a tenant id`);
  }
  return (value as string).trim();
}
