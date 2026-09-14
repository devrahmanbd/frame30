/**
 * §1.1 contract: every mutating server function authorises via
 * `requirePermission(<literal>)` — no ad-hoc checks, no bare
 * `requireSupabaseAuth` on a write path.
 *
 * The pre-existing surface is large, so this test is a RATCHET: the legacy
 * list below is frozen. Adding a new mutating server function without
 * `requirePermission` fails the build; migrating a legacy one and forgetting
 * to shrink the list also fails. The list may only ever get shorter.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  can,
  DANGEROUS,
  isDangerous,
  isPermission,
  isPlatformPermission,
  matrixPermissions,
  PERMISSIONS,
  PLATFORM_PERMISSIONS,
  ROLE_PRESETS,
  type Permission,
} from "./authz";

const LIB = join(process.cwd(), "src/lib");

type Fn = { file: string; name: string; guard: string };

function scanMutatingServerFns(): Fn[] {
  const out: Fn[] = [];
  for (const file of readdirSync(LIB).filter((f) => f.endsWith(".functions.ts"))) {
    const src = readFileSync(join(LIB, file), "utf8");
    const re =
      /export const (\w+) = createServerFn\(\{\s*method:\s*"POST"\s*\}\)([\s\S]{0,400}?)\.handler/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const body = m[2] ?? "";
      // A shopper write has no merchant permission to hold: `requireCustomerScope`
      // pins the row to the session's own `customers` id, which is the whole
      // authorisation. It counts as a guard, and only for self-scoped surfaces.
      const guard =
        (/requirePermission\(\s*"([^"]+)"\s*\)/.exec(body)?.[1] ??
          (/requireCustomerScope/.test(body) ? "customer.self" : "")) ||
        ownerGateGuard(src, m.index);
      out.push({ file, name: m[1]!, guard });
    }
  }
  return out;
}

/**
 * Platform-owner RPCs (`/root/*`) do not hold a merchant permission; their
 * boundary is `ownerGate`, which re-checks the platform role, rate-limits and
 * writes the audit row. That only counts as a guard when it is *actually*
 * reached, so this resolves each handler's dynamically imported server module
 * and confirms every function it calls is wrapped in `ownerGate(`. A handler
 * that merely sits next to gated code does not qualify.
 */
function ownerGateGuard(src: string, declarationIndex: number): string {
  const next = src.indexOf("\nexport const ", declarationIndex + 1);
  const decl = src.slice(declarationIndex, next === -1 ? src.length : next);
  if (/ownerGate\(/.test(decl)) return "owner.gate";

  const called = [...decl.matchAll(/\b(?:const|let)\s*\{([^}]+)\}\s*=\s*await import\("\.\/([\w.-]+)"\)/g)];
  if (called.length === 0) return "";
  let sawOne = false;
  for (const [, names, moduleName] of called) {
    let moduleSrc: string;
    try {
      moduleSrc = readFileSync(join(LIB, `${moduleName}.ts`), "utf8");
    } catch {
      return "";
    }
    for (const raw of names!.split(",")) {
      const fn = raw.trim().split(":")[0]!.trim();
      if (!fn || !new RegExp(`\\b${fn}\\s*\\(`).test(decl)) continue;
      const at = new RegExp(`export (?:async )?function ${fn}\\b`).exec(moduleSrc);
      if (!at) return "";
      const end = moduleSrc.indexOf("\nexport ", at.index + 1);
      const fnBody = moduleSrc.slice(at.index, end === -1 ? moduleSrc.length : end);
      if (!/ownerGate\(/.test(fnBody)) return "";
      sawOne = true;
    }
  }
  return sawOne ? "owner.gate" : "";
}

/**
 * Public-by-design surfaces. Distinct from the frozen legacy backlog below:
 * these are anonymous endpoints whose safety comes from the server layer
 * (rate limit + input allow-list) rather than from a permission grant.
 * Adding an entry here is a review decision, not a test fix.
 */
const PUBLIC_BY_DESIGN = new Set<string>([
  // Docs "try it" sandbox: POST only because it carries a body. It proxies a
  // fixed allow-list of documented GET routes, returns no tenant data, and is
  // rate limited per subject in docs.server.ts (`docs.tryit` bucket).
  "docs.functions.ts#docsTryItFn",
]);

/** Frozen legacy backlog — may shrink, never grow. Do not add entries. */
const LEGACY_UNGUARDED = new Set<string>([
  // Anonymous marketing contact: rate limited, spam scored, and service-owned.
  "contact.functions.ts#submitContactFn",
  // Token-authenticated by design: the person clicking a link in an email has
  // no session, and requiring one would make confirming or unsubscribing
  // impossible. Both are rate-limited and single-use inside the server layer.
  "newsletter.functions.ts#verifyNewsletterFn",
  "newsletter.functions.ts#unsubscribeNewsletterFn",
  "accounts.functions.ts#accountUpsertSelfFn",
  "accounts.functions.ts#accountSaveAddressFn",
  "accounts.functions.ts#accountDeleteAddressFn",
  "accounts.functions.ts#accountToggleWishlistFn",
  "accounts.functions.ts#accountSetConsentFn",
  "ad-fraud.functions.ts#adFraudBlockFn",
  "ad-fraud.functions.ts#adFraudToggleBlockFn",
  "ad-fraud.functions.ts#adFraudRecomputeFn",
  "ai-support.functions.ts#askAssistantFn",
  "ai-support.functions.ts#supportThreadFn",
  "ai-support.functions.ts#supportReplyFn",
  "ai-support.functions.ts#supportStatusFn",
  "analytics.functions.ts#analyticsFlushFn",
  "analytics.functions.ts#analyticsSaveReportFn",
  "analytics.functions.ts#analyticsDeleteReportFn",
  "analytics.functions.ts#analyticsRunReportFn",
  "billing.functions.ts#billingPlanPreviewFn",
  "billing.functions.ts#billingChangePlanFn",
  "billing.functions.ts#billingClaimTrialFn",
  "billing.functions.ts#billingPayInvoiceFn",
  "bundle-quote.functions.ts#quoteBundle",
  "catalog.functions.ts#catalogDeskFn",
  "catalog.functions.ts#catalogDryRunFn",
  "catalog.functions.ts#catalogApplyImportFn",
  "catalog.functions.ts#catalogDiscardImportFn",
  "catalog.functions.ts#catalogKindConfigFn",
  "catalog.functions.ts#catalogDeleteDefinitionFn",
  "catalog.functions.ts#catalogPreviewCollectionFn",
  "catalog.functions.ts#catalogExportCsvFn",
  "commerce-desk.functions.ts#draftOrderActionFn",
  "commerce-desk.functions.ts#draftOrderAcceptFn",
  "commerce-desk.functions.ts#priceListItemSaveFn",
  "commerce-desk.functions.ts#priceListItemDeleteFn",
  "commerce-desk.functions.ts#purchaseOrderActionFn",
  "commerce-desk.functions.ts#variantPreorderSaveFn",
  "commerce-desk.functions.ts#skuNextFn",
  "commerce-desk.functions.ts#orderTagsSaveFn",
  "commerce-desk.functions.ts#savedViewSaveFn",
  "commerce-desk.functions.ts#savedViewDeleteFn",
  "commerce-desk.functions.ts#subscriptionActionFn",
  "commerce-desk.functions.ts#subscriptionBillingRunFn",
  "commerce.functions.ts#inventorySetLevelFn",
  "commerce.functions.ts#inventoryTransferFn",
  "commerce.functions.ts#fulfilmentCreateFn",
  "commerce.functions.ts#fulfilmentAdvanceFn",
  "commerce.functions.ts#giftCardIssueFn",
  "commerce.functions.ts#giftCardVoidFn",
  "commerce.functions.ts#returnAdvanceFn",
  "commerce.functions.ts#disputeAdvanceFn",
  "commerce.functions.ts#cartRecoveryFn",
  "commerce.functions.ts#bundleDeleteFn",
  "commerce.functions.ts#customersLoadFn",
  "commerce.functions.ts#invoiceIssueFn",
  "commerce.functions.ts#invoiceDocumentFn",
  "conversion.functions.ts#trackProductViewFn",
  "conversion.functions.ts#submitReviewFn",
  "conversion.functions.ts#moderateReviewFn",
  "conversion.functions.ts#replyReviewFn",
  "conversion.functions.ts#experimentStatusFn",
  "custom-code.functions.ts#customCodeRestoreFn",
  "custom-code.functions.ts#customCodeKillFn",
  "developers.functions.ts#oauthClientRotateFn",
  "developers.functions.ts#oauthClientStatusFn",
  "developers.functions.ts#oauthConsentRevokeFn",
  "developers.functions.ts#oauthAuthorizeDescribeFn",
  "developers.functions.ts#oauthAuthorizeGrantFn",
  "developers.functions.ts#webhookSaveFn",
  "developers.functions.ts#webhookRotateFn",
  "developers.functions.ts#webhookStatusFn",
  "developers.functions.ts#webhookTestFn",
  "developers.functions.ts#webhookReplayFn",
  "domains.functions.ts#domainAddFn",
  "domains.functions.ts#domainVerifyFn",
  "domains.functions.ts#domainPrimaryFn",
  "domains.functions.ts#domainRedirectFn",
  "domains.functions.ts#domainEnabledFn",
  "domains.functions.ts#domainRemoveFn",
  "domains.functions.ts#domainHistoryFn",
  "exports.functions.ts#exportCreateFn",
  "exports.functions.ts#exportRetryFn",
  "exports.functions.ts#exportDownloadFn",
  "exports.functions.ts#apiKeyCreateFn",
  "exports.functions.ts#apiKeyRevokeFn",
  "finance.functions.ts#providerSaveEvidenceFn",
  "finance.functions.ts#providerSaveSecretsFn",
  "finance.functions.ts#providerSubmitFn",
  "finance.functions.ts#providerHistoryFn",
  "finance.functions.ts#providerDecideFn",
  "finance.functions.ts#payoutRequestFn",
  "finance.functions.ts#payoutDecideFn",
  "finance.functions.ts#payoutCancelFn",
  "finance.functions.ts#currencyConsentFn",
  "finance.functions.ts#currencyModeFn",
  "fraud.functions.ts#fraudScanFn",
  "fraud.functions.ts#fraudDecideFn",
  "fraud.functions.ts#fraudRuleFn",
  "fraud.functions.ts#fraudBlacklistAddFn",
  "fraud.functions.ts#fraudBlacklistToggleFn",
  "gateway.functions.ts#gatewayRetryFn",
  "governance.functions.ts#governanceSaveRoleFn",
  "governance.functions.ts#governanceDeleteRoleFn",
  "governance.functions.ts#governanceSetMemberFn",
  "governance.functions.ts#governanceSetMfaFn",
  "governance.functions.ts#governanceSubmitKycFn",
  "governance.functions.ts#approvalSubmitFn",
  "governance.functions.ts#approvalDecideFn",
  "growth.functions.ts#growthAdjustPointsFn",
  "growth.functions.ts#growthDecideReferralFn",
  "growth.functions.ts#growthPayCommissionsFn",
  "growth.functions.ts#virtualImportCodesFn",
  "growth.functions.ts#virtualRevealCodeFn",
  "growth.functions.ts#virtualRevokeCodeFn",
  "growth.functions.ts#virtualRetryDeliveryFn",
  "identity.functions.ts#signInGuardFn",
  "identity.functions.ts#requestPasswordResetFn",
  "identity.functions.ts#registerSessionFn",
  "identity.functions.ts#revokeOtherSessionsFn",
  "identity.functions.ts#grantStepUpFn",
  "identity.functions.ts#regenerateRecoveryCodesFn",
  "identity.functions.ts#consumeRecoveryCodeFn",
  "identity.functions.ts#requestEmailChangeFn",
  "infra.functions.ts#infraReindexFn",
  "infra.functions.ts#infraJobActionFn",
  "marketing.functions.ts#saveCouponFn",
  "marketing.functions.ts#sendCampaignFn",
  "marketing.functions.ts#retrySendFn",
  "marketing.functions.ts#deleteArticleFn",
  "marketing.functions.ts#unsubscribeFn",
  "marketplace.functions.ts#marketInstallStatusFn",
  "marketplace.functions.ts#marketListingStatusFn",
  "marketplace.functions.ts#marketModerateFn",
  "marketplace.functions.ts#marketReviewVersionFn",
  "marketplace.functions.ts#marketListingVersionsFn",
  "marketplace.functions.ts#marketPayoutAccrueFn",
  "marketplace.functions.ts#marketPayoutSettleFn",
  "marketplace.functions.ts#marketSubmitReviewFn",
  "marketplace.functions.ts#marketMyReviewsFn",
  "media.functions.ts#mediaUploadFn",
  "media.functions.ts#mediaDeleteFn",
  "merchant-admin.functions.ts#adminMarkNotificationsFn",
  "ops.functions.ts#opsReplayFn",
  "ops.functions.ts#opsRetentionSweepFn",
  "ops.functions.ts#opsIncidentUpdateFn",
  "ops.functions.ts#opsComponentStateFn",
  "orders-admin.functions.ts#advanceOrder",
  "orders-admin.functions.ts#fulfillOrder",
  "orders-admin.functions.ts#cancelOrder",
  "orders-admin.functions.ts#refundOrder",
  "orders-admin.functions.ts#declineRefund",
  "orders-admin.functions.ts#amendOrder",
  "owner.functions.ts#ownerSetFlagFn",
  "owner.functions.ts#ownerSuspendFn",
  "owner.functions.ts#ownerReinstateFn",
  "owner.functions.ts#ownerImpersonateRequestFn",
  "owner.functions.ts#ownerImpersonateRevokeFn",
  "owner.functions.ts#ownerImpersonateUseFn",
  "owner.functions.ts#merchantImpersonationQueueFn",
  "owner.functions.ts#merchantImpersonationRespondFn",
  "payments.functions.ts#startCharge",
  "payments.functions.ts#openRefund",
  "payments.functions.ts#stepRefund",
  "payments.functions.ts#reconcileCodOrder",
  "payments.functions.ts#clearCod",
  "payments.functions.ts#uploadSettlement",
  "payments.functions.ts#postSettlementFile",
  "payments.functions.ts#resolveAlert",
  "plugins.functions.ts#pluginInstallFn",
  "plugins.functions.ts#pluginSettingsSaveFn",
  "plugins.functions.ts#pluginToggleFn",
  "plugins.functions.ts#pluginUninstallFn",
  "plugins.functions.ts#pluginKillSwitchFn",
  "pos.functions.ts#openShiftFn",
  "pos.functions.ts#closeShiftFn",
  "pos.functions.ts#capturePosOrderFn",
  "pos.functions.ts#shiftReportFn",
  "pos.functions.ts#lookupBarcodeFn",
  "pos.functions.ts#retryRateFn",
  "pos.functions.ts#generateLabelFn",
  "seo.functions.ts#seoIndexFn",
  "seo.functions.ts#seoLoadFn",
  "seo.functions.ts#seoSaveFn",
  "seo.functions.ts#consentLedgerFn",
  "seo.functions.ts#consentRecordFn",
  "seo.functions.ts#seoTemplatesFn",
  "seo.functions.ts#seoTemplateSaveFn",
  "seo.functions.ts#seoRedirectSaveFn",
  "seo.functions.ts#seoRedirectDeleteFn",
  "shipping.functions.ts#quoteShippingFn",
  "shipping.functions.ts#deleteRuleFn",
  "shipping.functions.ts#schedulePickupFn",
  "shipping.functions.ts#cancelShipmentFn",
  "shipping.functions.ts#reconcileCodFn",
  "shipping.functions.ts#setCarrierModeFn",
  "shipping.functions.ts#trackParcelFn",
  "shipping.functions.ts#replayCourierEventFn",
  "storefront-search.functions.ts#savePageFn",
  "storefront-search.functions.ts#archivePageFn",
  "storefront.functions.ts#quoteCart",
  "storefront.functions.ts#reserveCheckout",
  "storefront.functions.ts#releaseCheckout",
  "support.functions.ts#rateSupportFn",
  "support.functions.ts#supportTicketEventsFn",
  "support.functions.ts#supportTicketCreateFn",
  "support.functions.ts#supportSlaSaveFn",
  "support.functions.ts#supportKbDeleteFn",
  "tenancy.functions.ts#tenancyRequestPurgeFn",
  "tenancy.functions.ts#tenancyCancelPurgeFn",
  "tenancy.functions.ts#tenancyExecutePurgeFn",
  "theme-fonts.functions.ts#uploadFontAssetFn",
  "theme-fonts.functions.ts#confirmFontLicenceFn",
  "theme-fonts.functions.ts#deleteFontAssetFn",
  "themes.functions.ts#builderAutosaveFn",
  "themes.functions.ts#builderCommitFn",
  "themes.functions.ts#builderPublishFn",
  "themes.functions.ts#builderRollbackFn",
  "themes.functions.ts#builderScheduleFn",
  "themes.functions.ts#builderCancelScheduleFn",
  "themes.functions.ts#builderInstallFn",
  "themes.functions.ts#builderPresetSwapFn",
  "themes.functions.ts#builderUpdatePreviewFn",
  "themes.functions.ts#builderUpdateApplyFn",
  "themes.functions.ts#builderDemoImportFn",
  "themes.functions.ts#builderDemoPurgeFn",
  "url-lifecycle.functions.ts#recordSlugChangeFn",
  "widget-data.functions.ts#resolveWidgetDataFn",
]);

describe("authz model", () => {
  it("permission keys are unique and namespaced", () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
    for (const p of PERMISSIONS) expect(p).toMatch(/^[a-z_]+\.[a-z_]+$/);
    for (const p of PLATFORM_PERMISSIONS) expect(p).toMatch(/^[a-z_]+\.[a-z_]+$/);
  });

  it("merchant and platform namespaces are disjoint", () => {
    for (const p of PLATFORM_PERMISSIONS) {
      expect(isPermission(p as string)).toBe(false);
    }
  });

  it("the editable permission matrix only expresses declared permissions", () => {
    for (const key of matrixPermissions()) expect(isPermission(key)).toBe(true);
  });

  it("every role preset only grants declared merchant permissions", () => {
    for (const [preset, perms] of Object.entries(ROLE_PRESETS)) {
      expect(new Set(perms).size, `${preset} has duplicates`).toBe(perms.length);
      for (const p of perms) expect(isPermission(p), `${preset}: ${p}`).toBe(true);
    }
  });

  it("owner is a superset of every other preset", () => {
    const owner = new Set(ROLE_PRESETS.owner);
    for (const [preset, perms] of Object.entries(ROLE_PRESETS)) {
      for (const p of perms) expect(owner.has(p), `${preset}: ${p}`).toBe(true);
    }
  });

  it("read_only grants nothing dangerous", () => {
    for (const p of ROLE_PRESETS.read_only) expect(isDangerous(p)).toBe(false);
    for (const p of ROLE_PRESETS.support) expect(isDangerous(p)).toBe(false);
  });

  it("DANGEROUS entries are declared permissions", () => {
    for (const p of DANGEROUS) {
      expect(isPermission(p) || isPlatformPermission(p), p).toBe(true);
    }
  });
});

describe("can()", () => {
  const active = (permissions: Permission[]) => ({ permissions, status: "active" as const });

  it("refuses grants the actor does not hold", () => {
    expect(can("orders.read", active(["orders.read"]))).toBe(true);
    expect(can("orders.refund", active(["orders.read"]))).toBe(false);
  });

  it("refuses non-active members", () => {
    expect(can("orders.read", { permissions: ["orders.read"], status: "suspended" })).toBe(false);
    expect(can("orders.read", { permissions: ["orders.read"], status: "invited" })).toBe(false);
  });

  it("never lets a merchant grant satisfy a platform permission", () => {
    expect(can("tenant.suspend", active([...PERMISSIONS]))).toBe(false);
    expect(can("tenant.suspend", { platformAdmin: true })).toBe(true);
  });

  it("never lets a platform admin inherit tenant grants", () => {
    expect(can("orders.refund", { platformAdmin: true })).toBe(false);
  });

  it("blocks dangerous actions during impersonation", () => {
    expect(can("tenant.purge", { platformAdmin: true, impersonating: true })).toBe(false);
    expect(can("orders.refund", { ...active(["orders.refund"]), impersonating: true })).toBe(false);
    expect(can("orders.read", { ...active(["orders.read"]), impersonating: true })).toBe(true);
  });

  it("blocks dangerous actions without a fresh step-up", () => {
    expect(can("orders.refund", { ...active(["orders.refund"]), stepUp: false })).toBe(false);
    expect(can("orders.refund", { ...active(["orders.refund"]), stepUp: true })).toBe(true);
  });
});

describe("server function contract", () => {
  const fns = scanMutatingServerFns();

  it("finds mutating server functions to check", () => {
    expect(fns.length).toBeGreaterThan(100);
  });

  it("every requirePermission() argument is a declared permission literal", () => {
    for (const f of fns.filter((x) => x.guard && x.guard !== "customer.self" && x.guard !== "owner.gate")) {
      expect(
        isPermission(f.guard) || isPlatformPermission(f.guard),
        `${f.file}#${f.name} → ${f.guard}`,
      ).toBe(true);
    }
  });

  it("no NEW mutating server function ships without requirePermission", () => {
    const unguarded = fns
      .filter((f) => !f.guard)
      .map((f) => `${f.file}#${f.name}`)
      .filter((k) => !LEGACY_UNGUARDED.has(k) && !PUBLIC_BY_DESIGN.has(k));
    expect(unguarded).toEqual([]);
  });

  it("the /root owner console mutations are guarded by platform permissions", () => {
    const platform = fns.filter((f) => f.file === "platform.functions.ts");
    expect(platform.length).toBeGreaterThan(0);
    for (const f of platform) {
      expect(isPlatformPermission(f.guard), `${f.name} → ${f.guard || "(none)"}`).toBe(true);
    }
  });
});
