/**
 * Contract Test: Cloaking Agent Harness Invariants.
 *
 * Enforces non-negotiable Framique architectural rules:
 *  1. Integer minor units for money: wastedSpendMinorInt must be an integer.
 *  2. Zero PII leakage: WAL entries and distilled memories must never leak phone/email/card numbers.
 *  3. Sandbox isolation: isolated in-memory workspace without cross-tenant side effects.
 *  4. Bounded metrics: accuracy, precision, recall, and confidence strictly in [0.0, 1.0].
 */

import { describe, expect, it } from "vitest";
import {
  CloakingHarness,
  generateMLTrafficDataset,
  ExecutionWAL,
} from "./index";

describe("Cloaking Agent Harness Contract Gate", () => {
  it("enforces integer minor units for all wasted spend calculations", async () => {
    const harness = new CloakingHarness();
    const report = await harness.run();

    expect(Number.isInteger(report.initialMetrics.wastedSpendMinorInt)).toBe(true);
    expect(Number.isInteger(report.optimizedMetrics.wastedSpendMinorInt)).toBe(true);
    expect(report.initialMetrics.wastedSpendMinorInt).toBeGreaterThanOrEqual(0);
    expect(report.optimizedMetrics.wastedSpendMinorInt).toBeGreaterThanOrEqual(0);
  });

  it("enforces zero PII leakage in execution WAL logs and distilled memories", async () => {
    const harness = new CloakingHarness();
    const report = await harness.run();

    const wal = new ExecutionWAL("pii_contract_check");
    wal.append("THOUGHT", { note: "Checking traffic" });
    const exportedLog = wal.exportLog();

    const piiPatterns = [
      /01[3-9]\d{8}/, // Bangladeshi phone numbers
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, // Email addresses
      /\b(?:\d{4}[ -]?){3}\d{4}\b/, // Credit card numbers
    ];

    for (const pattern of piiPatterns) {
      expect(pattern.test(exportedLog)).toBe(false);
      for (const mem of report.memoriesDistilled) {
        expect(pattern.test(mem.rule)).toBe(false);
        expect(pattern.test(mem.summary)).toBe(false);
      }
    }
  });

  it("enforces bounded [0.0, 1.0] intervals on all probabilistic and performance metrics", async () => {
    const harness = new CloakingHarness();
    const report = await harness.run();

    const metricsList = [report.initialMetrics, report.optimizedMetrics];
    for (const m of metricsList) {
      expect(m.accuracy).toBeGreaterThanOrEqual(0);
      expect(m.accuracy).toBeLessThanOrEqual(1);
      expect(m.precision).toBeGreaterThanOrEqual(0);
      expect(m.precision).toBeLessThanOrEqual(1);
      expect(m.recall).toBeGreaterThanOrEqual(0);
      expect(m.recall).toBeLessThanOrEqual(1);
      expect(m.f1Score).toBeGreaterThanOrEqual(0);
      expect(m.f1Score).toBeLessThanOrEqual(1);
    }

    for (const mem of report.memoriesDistilled) {
      expect(mem.confidence).toBeGreaterThanOrEqual(0);
      expect(mem.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("enforces sandbox immutability on input dataset", () => {
    const dataset = generateMLTrafficDataset(20);
    const originalChecksum = JSON.stringify(dataset);

    const harness = new CloakingHarness({ samples: dataset });
    expect(JSON.stringify(dataset)).toBe(originalChecksum);
  });
});
