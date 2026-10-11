/**
 * Threat-defense — package quarantine scan (pure).
 *
 * Aggregates content findings over package files into a verdict that drives
 * the activation/enable approval gates. Flagged (secrets, script-bearing
 * SVG) versions require explicit merchant approval with an audit record;
 * clean versions flow through the existing paths untouched. External URLs
 * and permission inventories are informational here — update widening is
 * gated separately (`diffCapabilities`), consent screens already show
 * scopes, and the audit trail already records URL inventories.
 *
 * Pure: no I/O, no database. Reuses the repo's own gates read-only —
 * `scanSecrets` (custom-code.ts), `isSvgSafe` (media/library.ts),
 * `inventoryExternalUrls` (package-review.ts).
 */
import { scanSecrets } from "./custom-code";
import { isSvgSafe } from "./media/library";
import { inventoryExternalUrls } from "./package-review";

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
