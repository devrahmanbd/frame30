/**
 * Cloaking Evaluator & ML Dataset Mistake Analyzer.
 *
 * Ingests ML traffic data inputs where ~50% of the data is wastage,
 * runs diagnostics to find our classification mistakes, and evaluates
 * the impact of harness-driven rule refinements.
 */

import type {
  CloakingDatasetSample,
  CloakingEvaluationResult,
  DatasetMetrics,
} from "./types";
import { CloakingSandbox, type SpeculativeRule } from "./sandbox";
import type { ClickScore } from "../ad-fraud";

export function generateMLTrafficDataset(count = 100): CloakingDatasetSample[] {
  const samples: CloakingDatasetSample[] = [];

  for (let i = 0; i < count; i++) {
    // 50% Wastage / Corrupted / Zero-Signal data
    if (i < count * 0.5) {
      samples.push({
        id: `sample_wastage_${i}`,
        timestamp: new Date(Date.now() - i * 60000).toISOString(),
        network: "other",
        ipClass: "unknown",
        asn: "AS0 (Unknown / Corrupted)",
        isCarrierNat: false,
        dwellMs: 50,
        interactions: 0,
        javascriptRan: false,
        automationHints: 0,
        userAgent: "Wget/1.21.3 (linux-gnu)",
        clickId: null,
        clickIdReused: false,
        referrerHost: null,
        visitorCountry: null,
        targetCountry: "BD",
        timezoneOffsetMinutes: null,
        groundTruth: "wastage_noise",
        isWastage: true,
        labelConfidence: 0.5,
      });
      continue;
    }

    // 25% Genuine Bangladeshi Mobile Shoppers
    if (i < count * 0.75) {
      const isCgnat = i % 2 === 0; // Half of mobile shoppers use CGNAT
      samples.push({
        id: `sample_shopper_${i}`,
        timestamp: new Date(Date.now() - i * 60000).toISOString(),
        network: "facebook",
        ipClass: isCgnat ? "mobile" : "residential",
        asn: isCgnat ? "AS24432 (Grameenphone Bangladesh)" : "AS58715 (AmberIT Dhaka)",
        isCarrierNat: isCgnat,
        dwellMs: 14000 + (i * 300),
        interactions: 6 + (i % 4),
        javascriptRan: true,
        automationHints: 0,
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBDV/iPhone14,5]",
        clickId: `fb.1.1712345678.${i}`,
        clickIdReused: false,
        referrerHost: "facebook.com",
        visitorCountry: "BD",
        targetCountry: "BD",
        timezoneOffsetMinutes: 360, // UTC+6
        groundTruth: "genuine_shopper",
        isWastage: false,
        labelConfidence: 0.95,
      });
      continue;
    }

    // 25% Bots / Click Farms / Scrapers Attempting Cloaking
    const isHeadless = i % 2 === 0;
    samples.push({
      id: `sample_bot_${i}`,
      timestamp: new Date(Date.now() - i * 60000).toISOString(),
      network: "google",
      ipClass: isHeadless ? "residential" : "datacenter", // Stealth bots use residential rotating proxy
      asn: isHeadless ? "AS16509 (Residential Proxy Gateway)" : "AS16509 (Amazon AWS Datacenter)",
      isCarrierNat: false,
      dwellMs: isHeadless ? 2500 : 1200, // Headless bots fake dwell time > 2s
      interactions: 0, // But have zero interactions
      javascriptRan: true,
      automationHints: 0, // Stealth scraper disguises automation flags
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      clickId: isHeadless ? `gclid_fresh_${i}` : `gclid_farm_replay_${i % 3}`,
      clickIdReused: !isHeadless,
      referrerHost: "google.com",
      visitorCountry: "BD",
      targetCountry: "BD",
      timezoneOffsetMinutes: 360,
      groundTruth: isHeadless ? "scraper_bot" : "click_farm",
      isWastage: false,
      labelConfidence: 0.9,
    });
  }

  return samples;
}

export type MistakeAnalysisReport = {
  baselineMetrics: DatasetMetrics;
  falsePositivesIdentified: Array<{
    sampleId: string;
    asn: string;
    reason: string;
  }>;
  falseNegativesIdentified: Array<{
    sampleId: string;
    asn: string;
    reason: string;
  }>;
  wastageSharePercentage: number;
  recommendedRules: string[];
};

export class CloakingMistakeAnalyzer {
  public static analyzeMistakes(
    sandbox: CloakingSandbox,
  ): MistakeAnalysisReport {
    const { results, metrics } = sandbox.evaluate();

    const falsePositives: Array<{ sampleId: string; asn: string; reason: string }> = [];
    const falseNegatives: Array<{ sampleId: string; asn: string; reason: string }> = [];

    const samples = sandbox.getDataset();
    const sampleMap = new Map(samples.map((s) => [s.id, s]));

    for (const r of results) {
      const sample = sampleMap.get(r.sampleId);
      if (!sample) continue;

      if (r.isFalsePositive) {
        falsePositives.push({
          sampleId: r.sampleId,
          asn: sample.asn,
          reason: sample.isCarrierNat
            ? "Legitimate shopper on mobile CGNAT misflagged due to IP_FANOUT penalty"
            : `Misflagged with score ${r.score} on ${sample.network}`,
        });
      }

      if (r.isFalseNegative) {
        falseNegatives.push({
          sampleId: r.sampleId,
          asn: sample.asn,
          reason: "Stealth bot passed through by faking dwell time > 2000ms while having 0 interactions",
        });
      }
    }

    const recommendedRules: string[] = [];
    if (falsePositives.some((fp) => fp.reason.includes("CGNAT"))) {
      recommendedRules.push("rule_cgnat_mobile_tolerance");
    }
    if (falseNegatives.length > 0) {
      recommendedRules.push("rule_zero_interaction_headless_block");
    }
    const totalWastage = samples.filter((s) => s.isWastage).length;
    const wastageSharePercentage = samples.length > 0 ? Math.round((totalWastage / samples.length) * 100) : 0;
    if (wastageSharePercentage >= 40) {
      recommendedRules.push("filter_pre_attribution_wastage");
    }

    return {
      baselineMetrics: metrics,
      falsePositivesIdentified: falsePositives,
      falseNegativesIdentified: falseNegatives,
      wastageSharePercentage,
      recommendedRules,
    };
  }

  /**
   * Generates the optimized rule to address CGNAT false positives.
   */
  public static createCGNATExemptionRule(): SpeculativeRule {
    return {
      id: "rule_cgnat_mobile_tolerance",
      name: "Carrier-Grade NAT Mobile Tolerance",
      description: "Waives IP_FANOUT and CLICK_FLOOD penalties when user is verified on a Bangladeshi mobile carrier with valid touch interactions",
      condition: (sample) => sample.isCarrierNat && sample.interactions >= 2 && sample.visitorCountry === "BD",
      adjustment: (baseScore, _sample) => {
        // Remove IP_FANOUT and CLICK_FLOOD weights from legitimate mobile shoppers
        const filteredSignals = baseScore.signals.filter(
          (s) => s.code !== "IP_FANOUT" && s.code !== "CLICK_FLOOD",
        );
        const newScore = Math.max(0, filteredSignals.reduce((sum, s) => sum + s.weight, 0));
        return {
          ...baseScore,
          score: newScore,
          signals: filteredSignals,
          verdict: newScore >= 70 ? "invalid" : newScore >= 40 ? "suspicious" : "valid",
        };
      },
      active: true,
    };
  }

  /**
   * Generates the optimized rule to catch stealth headless scrapers faking dwell time.
   */
  public static createHeadlessZeroInteractionRule(): SpeculativeRule {
    return {
      id: "rule_zero_interaction_headless_block",
      name: "Stealth Headless Zero Interaction Enforcement",
      description: "Penalizes traffic from proxy or datacenter networks with 0 interactions regardless of faked dwell time",
      condition: (sample) =>
        (sample.asn.includes("Proxy") || sample.ipClass === "datacenter") &&
        sample.interactions === 0,
      adjustment: (baseScore, _sample) => {
        // Enforce decisive block
        return {
          ...baseScore,
          score: 100,
          verdict: "invalid",
          decisiveCode: "DATACENTER_IP",
          signals: [
            ...baseScore.signals,
            { code: "HEADLESS_SIGNATURE", weight: 50, detail: "Zero interaction proxy bot" },
          ],
        };
      },
      active: true,
    };
  }
}
