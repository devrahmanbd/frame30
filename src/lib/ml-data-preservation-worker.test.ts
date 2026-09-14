import { describe, it, expect, beforeEach } from "vitest";
import {
  processGdprErasure,
  handleTenantDeletionWebhook,
  scanResidualPii,
  seedMockTransactionalData,
  clearMockTransactionalData,
} from "./ml-data-preservation-worker.server";
import {
  captureTrainingTurn,
  clearInMemoryTrainingData,
  computeCohortHash,
} from "./ai-training-data.server";

describe("Phase 11.5 — ML Training Flywheel Decoupling & GDPR Tombstone Unlink Worker", () => {
  beforeEach(() => {
    clearInMemoryTrainingData();
    clearMockTransactionalData();
  });

  describe("Residual PII Scanner", () => {
    it("detects unredacted Bangladeshi phone numbers, emails, and card numbers", () => {
      const rawText = "Contact me at 01712345678 or support@teststore.com with card 4111 2222 3333 4444";
      const result = scanResidualPii(rawText);

      expect(result.hasPii).toBe(true);
      expect(result.matches.some((m) => m.includes("01712345678"))).toBe(true);
      expect(result.matches.some((m) => m.includes("support@teststore.com"))).toBe(true);
      expect(result.matches.some((m) => m.includes("4111 2222 3333 4444"))).toBe(true);
    });

    it("verifies clean text scrubbed by PII redactor", () => {
      const scrubbedText = "Contact me at [PHONE] or [EMAIL] with card [CARD].";
      const result = scanResidualPii(scrubbedText);

      expect(result.hasPii).toBe(false);
      expect(result.matches).toHaveLength(0);
    });
  });

  describe("Merchant Deletion & ML Data Immunity Shield", () => {
    it("purges merchant personal data while permanently preserving ML training turns under cohort hash", async () => {
      const merchantId = "merchant_dhaka_fashion_88";
      const cohortHash = computeCohortHash(merchantId);

      // 1. Seed transactional data
      seedMockTransactionalData({
        merchants: [
          {
            id: merchantId,
            name: "Dhaka Fashion Hub",
            email: "owner@dhakafashion.com",
            phone: "01811223344",
            status: "active",
          },
        ],
        orders: [
          {
            id: "ord_101",
            merchantId,
            customerName: "Rahim Chowdhury",
            customerPhone: "01999887766",
            shippingAddress: "House 12, Road 4, Dhanmondi, Dhaka",
            totalAmount: 4500,
          },
        ],
      });

      // 2. Ingest AI training turn for this merchant
      const turn = await captureTrainingTurn({
        merchantId,
        conversationId: "conv_891",
        systemPrompt: "You are the Framique support agent.",
        userMessage: "How do I ship my order to Chittagong via SteadFast?",
        agentReply: "You can create a SteadFast consignment directly from the Orders tab.",
        latencyMs: 340,
        grounded: true,
      });

      expect(turn.merchantId).toBe(merchantId);
      expect(turn.merchantCohortHash).toBe(cohortHash);

      // 3. Process GDPR / Tenant Churn Erasure
      const result = await processGdprErasure({
        targetType: "merchant",
        targetId: merchantId,
        reason: "tenant_churn",
        requestedBy: "platform_admin",
      });

      // Assert Purge Metrics
      expect(result.success).toBe(true);
      expect(result.purgedRecords.merchantsPurged).toBe(1);
      expect(result.purgedRecords.ordersAnonymized).toBe(1);

      // Assert ML Data Immunity Preservation
      expect(result.preservedMl.trainingTurnsUnlinked).toBe(1);
      expect(result.preservedMl.cohortHash).toBe(cohortHash);
      expect(result.preservedMl.zeroPiiVerified).toBe(true);

      // Assert that turn has merchantId unlinked (null) but keeps cohortHash intact
      expect(turn.merchantId).toBeNull();
      expect(turn.merchantCohortHash).toBe(cohortHash);
    });
  });

  describe("Customer GDPR 'Right to Erasure' Anonymization", () => {
    it("anonymizes customer personal records and order addresses while leaving anonymized ML telemetry intact", async () => {
      const customerId = "cust_tanvir_99";
      const merchantId = "merchant_shop_01";

      seedMockTransactionalData({
        customers: [
          {
            id: customerId,
            merchantId,
            fullName: "Tanvir Ahmed",
            email: "tanvir@example.com",
            phone: "01755667788",
          },
        ],
        orders: [
          {
            id: "ord_cust_1",
            merchantId,
            customerId,
            customerName: "Tanvir Ahmed",
            customerPhone: "01755667788",
            shippingAddress: "Sector 3, Uttara, Dhaka",
            totalAmount: 1850,
          },
        ],
      });

      const result = await processGdprErasure({
        targetType: "customer",
        targetId: customerId,
        merchantId,
        reason: "gdpr_right_to_erasure",
      });

      expect(result.success).toBe(true);
      expect(result.purgedRecords.customersAnonymized).toBe(1);
      expect(result.purgedRecords.ordersAnonymized).toBe(1);
      expect(result.preservedMl.zeroPiiVerified).toBe(true);
    });
  });

  describe("Webhook Integration", () => {
    it("handles incoming merchant deletion webhook and triggers decoupling pipeline", async () => {
      const merchantId = "merchant_webhook_test_55";

      seedMockTransactionalData({
        merchants: [
          {
            id: merchantId,
            name: "Webhook Test Boutique",
            email: "boutique@example.com",
            phone: "01711002233",
            status: "active",
          },
        ],
      });

      const webhookResult = await handleTenantDeletionWebhook({
        event: "merchant.deleted",
        merchantId,
        timestamp: new Date().toISOString(),
      });

      expect(webhookResult.success).toBe(true);
      expect(webhookResult.targetType).toBe("merchant");
      expect(webhookResult.targetId).toBe(merchantId);
      expect(webhookResult.purgedRecords.merchantsPurged).toBe(1);
    });
  });
});
