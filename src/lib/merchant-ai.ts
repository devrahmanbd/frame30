/**
 * Merchant AI kill-switch (Sept 2026, operator decision).
 *
 * AI control (gateway configuration, merchant copilot, AI triage inbox)
 * is platform-operated only. Merchants keep the Support channel
 * (/dashboard/support, support.functions.ts) — that is Framique talking
 * to the merchant, not merchant-operated AI.
 *
 * Single source of truth consumed by:
 * - console-nav.ts (hides the AI entries),
 * - dashboard/ai/* routes (redirect direct URLs to /dashboard),
 * - ai-support.functions.ts (denies the control RPCs server-side, so
 *   hiding UI alone never leaves the API open).
 *
 * Flip to true to restore the merchant AI offer. Pure module: safe to
 * import from client components and server functions alike.
 */
export const MERCHANT_AI_ENABLED = false;
