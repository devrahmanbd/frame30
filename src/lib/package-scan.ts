/**
 * Threat-defense — package quarantine scan (pure).
 *
 * Aggregates content findings over package files into a verdict that drives
 * the activation/enable approval gates. Flagged (secrets, script-bearing
 * SVG, no-plugin-territory theme content) versions require explicit merchant
 * approval with an audit record;
 * clean versions flow through the existing paths untouched. External URLs
 * and permission inventories are informational here — update widening is
 * gated separately (`diffCapabilities`), consent screens already show
 * scopes, and the audit trail already records URL inventories.
 *
 * Approval tiers (severity policy — `approveThemeVersion` /
 * `approvePluginVersion` and the activation/enable gates enforce this):
 *
 * | Tier | Findings | Merchant-approvable? |
 * | ---- | -------- | -------------------- |
 * | 0 — never | `secret` (credential theft) | NO — the approve fns refuse with `theme.approval_forbidden` / `plugin.approval_forbidden` and write no audit row; the gates refuse even when a legacy approval row exists. |
 * | 1 — gated | `svg-script`, `no-plugin-territory.*` (payments, tracking-pixel, auth-form, seo-write) | YES — with a recorded audit bound to the exact content hash / manifest version. |
 * | 2 — informational | `external-urls`, `permissions` | n/a — verdict stays `clean`, no approval needed. |
 *
 * `svg-script` stays merchant-approvable: the upload lane already sanitizes
 * SVG at install, so stored bytes are clean and the flag covers legacy rows.
 * Use `hasSecretFinding` (Tier-0 probe) to enforce the never-approvable
 * tier — never re-derive it from raw severity, which Tier-1 shares.
 *
 * Pure: no I/O, no database. Reuses the repo's own gates read-only —
 * `scanSecrets` (custom-code.ts), `isSvgSafe` (media/library.ts),
 * `inventoryExternalUrls` (package-review.ts).
 */
import { scanSecrets } from "./custom-code";
import { isSvgSafe } from "./media/library";
import { inventoryExternalUrls, scanThemeTrustContent } from "./package-review";

export type ScanFile = {
  path: string;
  bytes: Uint8Array;
};

export type ScanFinding = {
  code: string;
  severity: "high" | "info";
  detail: string;
};

export type ScanReport = {
  verdict: "clean" | "flagged";
  findings: ScanFinding[];
};

/**
 * Scanner revision carried by versioned security reports
 * (`package-security-report.ts`). Bump when scan rules change so a report
 * reader can tell which rule set produced its findings.
 */
export const SCANNER_VERSION = "1";

/**
 * Tier-0 probe for the approval policy (see header): true when the report
 * carries a `secret` (credential-theft) finding. Tier-1 findings
 * (`svg-script`, `no-plugin-territory.*`) share `high` severity but stay
 * merchant-approvable — callers must use this probe, not raw severity.
 */
export function hasSecretFinding(report: ScanReport): boolean {
  return report.findings.some((f) => f.code === "secret");
}

const TEXT_EXTS = new Set([
  ".json",
  ".css",
  ".html",
  ".htm",
  ".svg",
  ".txt",
  ".md",
  ".js",
  ".liquid",
]);

function decodeText(path: string, bytes: Uint8Array): string | null {
  const dot = path.lastIndexOf(".");
  const reviewable =
    dot < 0
      ? path === "theme.json" || path === "plugin.json"
      : TEXT_EXTS.has(path.slice(dot).toLowerCase());
  if (!reviewable) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function scanPackage(
  files: ScanFile[],
  opts: { permissions?: string[] } = {},
): ScanReport {
  const findings: ScanFinding[] = [];
  for (const file of files) {
    const text = decodeText(file.path, file.bytes);
    if (text === null) continue;
    for (const hit of scanSecrets(text, file.path as never)) {
      findings.push({
        code: "secret",
        severity: "high",
        detail: `${file.path}: ${hit.message}`,
      });
    }
    if (file.path.toLowerCase().endsWith(".svg") && !isSvgSafe(text)) {
      findings.push({
        code: "svg-script",
        severity: "high",
        detail: `${file.path}: SVG carries scriptable content the sanitizer would strip.`,
      });
    }
    // No-plugin-territory gates (C6 reasons 1-4): theme packages must never
    // price/charge, plant tracking pixels, collect credentials, or touch
    // `seo_meta`. High severity — the activation/enable approval gates refuse
    // flagged versions without an explicit merchant approval bound to the
    // exact content hash. Plugin manifests stay on the plugin rails (scoped
    // bridge + consent ledger), so `plugin.json` is out of scope here.
    if (file.path !== "plugin.json") {
      for (const trust of scanThemeTrustContent(text)) {
        findings.push({
          code: trust.code,
          severity: "high",
          detail: `${file.path}: ${trust.detail}`,
        });
      }
    }
  }
  const urls = inventoryExternalUrls(files);
  if (urls.length > 0) {
    findings.push({
      code: "external-urls",
      severity: "info",
      detail: urls.join(", "),
    });
  }
  const permissions = (opts.permissions ?? []).filter(
    (p): p is string => typeof p === "string" && p.length > 0,
  );
  if (permissions.length > 0) {
    findings.push({
      code: "permissions",
      severity: "info",
      detail: [...new Set(permissions)].sort().join(", "),
    });
  }
  return {
    verdict: findings.some((f) => f.severity === "high") ? "flagged" : "clean",
    findings,
  };
}
