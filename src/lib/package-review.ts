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
