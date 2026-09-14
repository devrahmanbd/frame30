/**
 * Observability coverage gate.
 *
 * A metric nobody charts and nobody alerts on is not observability — it is
 * exhaust. This test pins the money- and security-critical counters to a
 * dashboard panel or an alert rule, so a future change that stops emitting one
 * (or ships a domain with no visibility) fails here rather than in production.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const OPS = join(process.cwd(), "ops", "observability");
const GRAFANA = join(OPS, "grafana");

const dashboards = readdirSync(GRAFANA).filter((f) => f.endsWith(".json"));
const dashboardText = dashboards.map((f) => readFileSync(join(GRAFANA, f), "utf8")).join("\n");
const alertsText = readFileSync(join(OPS, "alerts.rules.yml"), "utf8");
const watched = `${dashboardText}\n${alertsText}`;

/** Metrics that must be visible somewhere: money, integrity, or containment. */
const CHARTED = [
  // Phase 2 — commerce
  "framique_orders_total",
  "framique_refund_total",
  "framique_gift_card_issued_total",
  "framique_gift_card_redeem_total",
  "framique_return_total",
  "framique_dispute_total",
  "framique_fulfilment_total",
  "framique_inventory_transfer_total",
  // Phase 2 — marketing & delivery
  "framique_webhook_delivery_total",
  // Phase 3 — developer platform
  "framique_api_request_total",
  "framique_oauth_token_total",
  // Phase 3 — ecosystem, AI, analytics, domains
  "framique_market_publish_total",
  "framique_market_payout_total",
  "framique_ai_guardrail_total",
  "framique_analytics_etl_total",
  "framique_domain_cert_total",
  // Phase 4 — treasury, provider rails and the ad-integrity moat
  "framique_payout_transition_total",
  "framique_payout_request_total",
  "framique_payout_decision_total",
  "framique_payout_worker_total",
  "framique_provider_submit_total",
  "framique_provider_secret_writes_total",
  "framique_currency_gate_total",
  "framique_fx_total",
  "framique_ad_autoblocks_total",
  // Phase 8 — page-builder runtime health
  "framique_template_render_ms",
  "framique_widget_resolver_ms",
  "framique_widget_errors_total",
  "framique_plugin_hook_total",
];

/** Signals that must page or ticket someone, not merely appear on a chart. */
const ALERTED = [
  "framique_oauth_token_total",
  "framique_ai_guardrail_total",
  "framique_refund_total",
  "framique_webhook_delivery_total",
  "framique_api_request_total",
  "framique_domain_cert_total",
  // Phase 4 — a payout that cannot settle, a secret rewritten, or a stale FX
  // table all cost real money and must reach a human, not just a chart.
  "framique_payout_transition_total",
  "framique_payout_worker_total",
  "framique_provider_secret_writes_total",
  "framique_fx_total",
  "framique_ad_autoblocks_total",
];

describe("dashboards", () => {
  it("ships the Phase 2/3/4 dashboards alongside the platform ones", () => {
    for (const name of [
      "commerce-dashboard.json",
      "marketing-dashboard.json",
      "developer-platform-dashboard.json",
      "ecosystem-ai-dashboard.json",
      "treasury-dashboard.json",
    ]) {
      expect(dashboards).toContain(name);
    }
  });

  it("every dashboard is valid JSON with a title and at least one panel", () => {
    for (const file of dashboards) {
      const doc = JSON.parse(readFileSync(join(GRAFANA, file), "utf8"));
      expect(doc.title, file).toBeTruthy();
      expect(Array.isArray(doc.panels), file).toBe(true);
      expect(doc.panels.length, file).toBeGreaterThan(0);
    }
  });
});

describe("metric coverage", () => {
  it.each(CHARTED)("%s is charted or alerted on", (metric) => {
    expect(watched).toContain(metric);
  });

  it.each(ALERTED)("%s has an alert rule, not just a panel", (metric) => {
    expect(alertsText).toContain(metric);
  });
});

describe("alert rules", () => {
  const alerts = [...alertsText.matchAll(/- alert:\s*(\S+)/g)].map((m) => m[1] as string);

  it("names every alert uniquely", () => {
    expect(new Set(alerts).size).toBe(alerts.length);
  });

  it("routes refresh-token reuse and AI guardrail blocks to a pager", () => {
    for (const name of ["OAuthRefreshTokenReuseDetected", "AiGuardrailBlockFired"]) {
      const block = alertsText.slice(alertsText.indexOf(`- alert: ${name}`));
      expect(alerts, name).toContain(name);
      expect(block.slice(0, 600)).toContain("severity: page");
    }
  });

  it("gives every alert a summary so a pager message is never empty", () => {
    const blocks = alertsText.split(/- alert:\s*/).slice(1);
    for (const block of blocks) {
      expect(block).toMatch(/summary:/);
    }
  });

  it("keeps burn-rate alerts on both a fast and a slow window", () => {
    for (const pair of [
      ["RefundBurnRateFast", "RefundBurnRateSlow"],
      ["WebhookDeadLetterBurnRateFast", "WebhookDeadLetterBurnRateSlow"],
      ["ApiErrorBudgetBurnFast", "ApiErrorBudgetBurnSlow"],
    ]) {
      expect(alerts).toContain(pair[0]);
      expect(alerts).toContain(pair[1]);
    }
  });

  it("never divides by a bare rate — every ratio is clamped", () => {
    const ratios = [...alertsText.matchAll(/\/\s*\n?\s*(clamp_min\()?sum\(/g)];
    for (const match of ratios) {
      expect(match[1], `unclamped division near: ${match[0]}`).toBe("clamp_min(");
    }
  });
});
