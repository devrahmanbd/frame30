/**
 * Threat-defense — package content review signals (pure).
 *
 * Small, dependency-free helpers that turn package bytes into reviewable
 * facts for consent screens, scan reports, and audit rows. No I/O, no
 * database, no network — safe to run anywhere, including the browser.
 */

export type ReviewFile = {
  path: string;
  bytes: Uint8Array;
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

function isReviewableText(path: string): boolean {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return path === "theme.json" || path === "plugin.json";
  return TEXT_EXTS.has(path.slice(dot).toLowerCase());
}

const URL_RE = /https?:\/\/[^\s"'<>()\\]+/gi;

function cleanUrl(raw: string): string | null {
  // Trailing punctuation from prose/JSON contexts is not part of the URL.
  const url = raw.replace(/[.,;:!?)\]]+$/, "");
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * Sorted unique absolute http(s) URLs across package text files. Binary
 * assets, relative refs, and non-http schemes are never reported.
 */
export function inventoryExternalUrls(files: ReviewFile[]): string[] {
  const seen = new Set<string>();
  for (const file of files) {
    if (!isReviewableText(file.path)) continue;
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(file.bytes);
    } catch {
      continue;
    }
    URL_RE.lastIndex = 0;
    for (const match of text.matchAll(URL_RE)) {
      const clean = cleanUrl(match[0]);
      if (clean) seen.add(clean);
    }
  }
  return [...seen].sort();
}

/* --------------------------------------- capability signals + diff */

export type CapabilitySignals = {
  /** Plugin manifest permissions. */
  permissions: string[];
  /** Theme template external-URL hosts. */
  externalHosts: string[];
  /** Theme carries custom-HTML sections with actual content. */
  customHtml: boolean;
};

export type CapabilityDiff = {
  widened: boolean;
  added: string[];
  removed: string[];
};

/**
 * Consent coverage for a widening diff: every added item must appear in the
 * caller-supplied consent list by exact match. Absent list covers nothing.
 */
export function coversWidening(added: string[], consentScopes?: string[]): boolean {
  if (added.length === 0) return true;
  const granted = new Set(consentScopes ?? []);
  return added.every((a) => granted.has(a));
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function hasNonEmptyString(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasNonEmptyString);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(
      hasNonEmptyString,
    );
  }
  return false;
}

function walkSections(node: unknown, visit: (section: Record<string, unknown>) => void): void {
  if (Array.isArray(node)) {
    for (const item of node) walkSections(item, visit);
    return;
  }
  if (node && typeof node === "object") {
    const rec = node as Record<string, unknown>;
    if (typeof rec.type === "string") visit(rec);
    for (const value of Object.values(rec)) walkSections(value, visit);
  }
}

/**
 * Theme capability signals from parsed templates: external hosts behind
 * template URLs plus custom-HTML presence. Pure — runs on installed rows
 * and incoming payloads alike.
 */
export function themeSignals(templates: unknown): {
  externalHosts: string[];
  customHtml: boolean;
} {
  let blob = "";
  try {
    blob = JSON.stringify(templates);
  } catch {
    blob = "";
  }
  const hosts = new Set<string>();
  URL_RE.lastIndex = 0;
  for (const match of blob.matchAll(URL_RE)) {
    const clean = cleanUrl(match[0]);
    if (!clean) continue;
    const host = hostOf(clean);
    if (host) hosts.add(host);
  }
  let customHtml = false;
  walkSections(templates, (section) => {
    if (
      section.type === "html" &&
      hasNonEmptyString((section.props ?? {}) as unknown)
    ) {
      customHtml = true;
    }
  });
  return { externalHosts: [...hosts].sort(), customHtml };
}

/**
 * Update widening check: added permissions (plugins), added external hosts
 * and custom-HTML arrival (themes). Removals alone never widen. Added items
 * use literal vocabularies — `perm:<scope>`, `url:<host>`, `custom-html` —
 * so a consent list covers them by exact match, never heuristics.
 */
export function diffCapabilities(
  oldS: CapabilitySignals,
  newS: CapabilitySignals,
): CapabilityDiff {
  const added: string[] = [];
  const removed: string[] = [];
  const oldPerms = new Set(oldS.permissions ?? []);
  const newPerms = new Set(newS.permissions ?? []);
  for (const p of newPerms) if (!oldPerms.has(p)) added.push(`perm:${p}`);
  for (const p of oldPerms) if (!newPerms.has(p)) removed.push(`perm:${p}`);
  const oldHosts = new Set(oldS.externalHosts ?? []);
  const newHosts = new Set(newS.externalHosts ?? []);
  for (const h of newHosts) if (!oldHosts.has(h)) added.push(`url:${h}`);
  for (const h of oldHosts) if (!newHosts.has(h)) removed.push(`url:${h}`);
  if (newS.customHtml && !oldS.customHtml) added.push("custom-html");
  added.sort();
  removed.sort();
  return { widened: added.length > 0, added, removed };
}
