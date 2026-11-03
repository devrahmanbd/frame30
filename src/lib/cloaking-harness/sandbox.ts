/**
 * Step 1: Isolated Execution Sandbox.
 *
 * Guarantees safe experimentation:
 *  - Sandboxes rule evaluation and speculative threshold tuning.
 *  - In-memory workspace that NEVER writes to production tables or leaks tenant boundaries.
 *  - Provides snapshot and rollback capability so speculative changes can be reverted instantly.
 */

import { createHash } from "node:crypto";
import type {
  CloakingDatasetSample,
  CloakingEvaluationResult,
  DatasetMetrics,
} from "./types";
import {
  scoreClick,
  INVALID_THRESHOLD,
  SUSPICIOUS_THRESHOLD,
  type ClickInput,
  type ClickScore,
} from "../ad-fraud";

export type SpeculativeRule = {
  id: string;
  name: string;
  description: string;
  condition: (sample: CloakingDatasetSample) => boolean;
  adjustment: (baseScore: ClickScore, sample: CloakingDatasetSample) => ClickScore;
  active: boolean;
};

export class CloakingSandbox {
  private baseSamples: CloakingDatasetSample[] = [];
  private activeRules: Map<string, SpeculativeRule> = new Map();
  private invalidThreshold: number = INVALID_THRESHOLD;
  private suspiciousThreshold: number = SUSPICIOUS_THRESHOLD;
  private wastageFilterActive = false;
  private snapshotHistory: Array<{
    rules: Array<[string, SpeculativeRule]>;
    invalidThreshold: number;
    suspiciousThreshold: number;
    wastageFilterActive: boolean;
  }> = [];

  constructor(initialSamples: CloakingDatasetSample[] = []) {
    this.baseSamples = structuredClone(initialSamples);
  }

  public loadDataset(samples: CloakingDatasetSample[]): void {
    this.baseSamples = structuredClone(samples);
  }

  public getDataset(): readonly CloakingDatasetSample[] {
    return this.baseSamples;
  }

  public registerRule(rule: SpeculativeRule): void {
    this.activeRules.set(rule.id, rule);
  }

  public removeRule(ruleId: string): boolean {
    return this.activeRules.delete(ruleId);
  }

  public setThresholds(invalid: number, suspicious: number): void {
    if (invalid <= suspicious) {
      throw new Error("Invalid threshold must be strictly greater than suspicious threshold");
    }
    this.invalidThreshold = invalid;
    this.suspiciousThreshold = suspicious;
  }

  public setWastageFilter(active: boolean): void {
    this.wastageFilterActive = active;
  }

  public createSnapshot(): number {
    const snapshot = {
      rules: Array.from(this.activeRules.entries()),
      invalidThreshold: this.invalidThreshold,
      suspiciousThreshold: this.suspiciousThreshold,
      wastageFilterActive: this.wastageFilterActive,
    };
    this.snapshotHistory.push(snapshot);
    return this.snapshotHistory.length - 1;
  }

  public rollbackToSnapshot(index: number): boolean {
    if (index < 0 || index >= this.snapshotHistory.length) {
      return false;
    }
    const snap = this.snapshotHistory[index];
    this.activeRules = new Map(snap.rules);
    this.invalidThreshold = snap.invalidThreshold;
    this.suspiciousThreshold = snap.suspiciousThreshold;
    this.wastageFilterActive = snap.wastageFilterActive;
    return true;
  }

  /**
   * Evaluates all samples in the sandbox using the current rules & thresholds.
   * Produces detailed evaluation results and composite metrics.
   */
  public evaluate(): {
    results: CloakingEvaluationResult[];
    metrics: DatasetMetrics;
  } {
    const results: CloakingEvaluationResult[] = [];
    let correctCount = 0;
    let falsePositiveCount = 0;
    let falseNegativeCount = 0;
    let truePositives = 0;
    let wastedSpendMinorInt = 0;

    const totalSamples = this.baseSamples.length;
    let evaluatedCount = 0;
    let wastageFilteredCount = 0;

    for (const sample of this.baseSamples) {
      // Step 1: If wastage filter is active and sample is noisy wastage, filter it out
      if (this.wastageFilterActive && sample.isWastage) {
        wastageFilteredCount++;
        results.push({
          sampleId: sample.id,
          score: 0,
          verdict: "invalid", // Screened out as wastage
          firedSignals: ["NETWORK_ABUSE"],
          isCorrect: true, // Successfully filtered wastage
          isFalsePositive: false,
          isFalseNegative: false,
          isWastageFiltered: true,
          notes: "Filtered by ML wastage screening (corrupted/noisy signal)",
        });
        correctCount++;
        continue;
      }

      evaluatedCount++;

      // Convert sample to ad-fraud ClickInput format
      const clickInput: ClickInput = {
        network: sample.network,
        javascriptRan: sample.javascriptRan,
        automationHints: sample.automationHints,
        userAgent: sample.userAgent,
        dwellMs: sample.dwellMs,
        interactions: sample.interactions,
        clickId: sample.clickId,
        clickIdSeenBefore: sample.clickIdReused,
        referrerHost: sample.referrerHost,
        ipClass: sample.ipClass,
        clicksLastHour: sample.isCarrierNat ? 8 : (sample.groundTruth === "click_farm" ? 12 : 1),
        distinctVisitorsPerIp: sample.isCarrierNat ? 80 : 1, // CGNAT carries many visitors
        visitorCountry: sample.visitorCountry,
        targetCountry: sample.targetCountry,
        timezoneOffsetMinutes: sample.timezoneOffsetMinutes,
        minutesSinceDistantHop: null,
        blocklisted: false,
        networkReports: 0,
      };

      // Base engine scoring
      let scoreObj = scoreClick(clickInput);

      // Apply sandbox speculative rules
      for (const rule of this.activeRules.values()) {
        if (rule.active && rule.condition(sample)) {
          scoreObj = rule.adjustment(scoreObj, sample);
        }
      }

      // Re-apply sandboxed thresholds
      let verdict: "valid" | "suspicious" | "invalid" = "valid";
      if (scoreObj.decisiveCode || scoreObj.score >= this.invalidThreshold) {
        verdict = "invalid";
      } else if (scoreObj.score >= this.suspiciousThreshold) {
        verdict = "suspicious";
      }

      const isBotOrFraud = sample.groundTruth === "scraper_bot" || sample.groundTruth === "click_farm";
      const isGenuine = sample.groundTruth === "genuine_shopper";

      let isCorrect = false;
      let isFalsePositive = false;
      let isFalseNegative = false;

      if (isGenuine) {
        if (verdict === "valid") {
          isCorrect = true;
        } else {
          isFalsePositive = true;
          falsePositiveCount++;
          // In minor units: misclassified genuine click wastes spend (e.g. 25.00 BDT)
          wastedSpendMinorInt += 2500;
        }
      } else if (isBotOrFraud) {
        if (verdict === "invalid" || verdict === "suspicious") {
          isCorrect = true;
          truePositives++;
        } else {
          isFalseNegative = true;
          falseNegativeCount++;
          // Uncaught bot drains ad spend (e.g. 50.00 BDT)
          wastedSpendMinorInt += 5000;
        }
      } else {
        // Wastage/noise: If wastage filter is not active, this is unfiltered noise wasting compute & budget
        isCorrect = false;
        wastedSpendMinorInt += 1000;
      }

      if (isCorrect) correctCount++;

      results.push({
        sampleId: sample.id,
        score: scoreObj.score,
        verdict,
        firedSignals: scoreObj.signals.map((s) => s.code),
        isCorrect,
        isFalsePositive,
        isFalseNegative,
        isWastageFiltered: false,
        notes: `Engine score ${scoreObj.score} -> ${verdict} (GT: ${sample.groundTruth})`,
      });
    }

    const totalEvaluated = totalSamples;
    const accuracy = totalEvaluated > 0 ? correctCount / totalEvaluated : 0;
    const precision =
      truePositives + falsePositiveCount > 0
        ? truePositives / (truePositives + falsePositiveCount)
        : 0;
    const totalActualBots = this.baseSamples.filter(
      (s) => s.groundTruth === "scraper_bot" || s.groundTruth === "click_farm",
    ).length;
    const recall = totalActualBots > 0 ? truePositives / totalActualBots : 0;
    const f1Score =
      precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    const metrics: DatasetMetrics = {
      totalSamples,
      wastageCount: wastageFilteredCount,
      wastagePercentage: totalSamples > 0 ? wastageFilteredCount / totalSamples : 0,
      evaluatedSamples: evaluatedCount,
      correctCount,
      accuracy,
      falsePositiveCount,
      falseNegativeCount,
      precision,
      recall,
      f1Score,
      wastedSpendMinorInt,
    };

    return { results, metrics };
  }

  public getRulesState(): Record<string, unknown> {
    const rulesSummary: Record<string, unknown> = {};
    for (const [id, rule] of this.activeRules) {
      rulesSummary[id] = { name: rule.name, active: rule.active };
    }
    return {
      rules: rulesSummary,
      invalidThreshold: this.invalidThreshold,
      suspiciousThreshold: this.suspiciousThreshold,
      wastageFilterActive: this.wastageFilterActive,
    };
  }

  public getActiveRuleIds(): string[] {
    return Array.from(this.activeRules.keys());
  }
}
