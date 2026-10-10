/**
 * Frame30 — explicit source-vs-package asset URL boundary.
 *
 * Two URL forms exist and must never mix implicitly:
 * - source form `/ph/<theme>/<file>`: authored in theme builders, servable
 *   over HTTP in previews/storefronts. Renderers emit ONLY this form.
 * - package form `assets/<file>`: relative refs inside ZIP packages for the
 *   custom-upload/install pipeline (`package-zip.ts` context). Renderers
 *   must NEVER emit this form (a bare `assets/x` resolves against the page
 *   URL and 404s — the Songoskriti preview regression).
 *
 * Use these helpers at every conversion site instead of string splits, so
 * the boundary is type-checked, not heuristic.
 */

export type SourceAssetUrl = string & { readonly __brand: "source" };
export type PackageAssetUrl = string & { readonly __brand: "package" };

function basenameOf(ref: string): string {
  const clean = ref.replace(/^\/+/, "");
  const ph = clean.match(/^ph\/[^/]+\/(.+)$/);
  if (ph?.[1]) return ph[1];
  const pkg = clean.match(/^assets\/(.+)$/);
  if (pkg?.[1]) return pkg[1];
  return clean;
}

/** Absolute servable URL for a theme asset (`/ph/<key>/<file>`). */
export function toSourceUrl(
  basename: string,
  themeKey: string,
): SourceAssetUrl {
  return `/ph/${themeKey}/${basenameOf(basename)}` as SourceAssetUrl;
}

/** Package-relative ref for ZIP context only (`assets/<file>`). */
export function toPackageRef(basename: string): PackageAssetUrl {
  return `assets/${basenameOf(basename)}` as PackageAssetUrl;
}

export function isSourceUrl(s: string): boolean {
  return s.startsWith("/ph/");
}

export function isPackageRef(s: string): boolean {
  return s.startsWith("assets/") && !s.startsWith("/");
}

/**
 * Bare `assets/` refs found anywhere in a rendered template blob, in
 * document order, deduplicated. Rendered previews/storefronts must yield
 * `[]` — a bare ref resolves against the page URL and 404s. ZIP payloads
 * are the only context where these refs are legal (see `rewriteThemeUrls`,
 * package-context-only).
 */
export function findPackageRefs(value: unknown): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const visit = (node: unknown): void => {
    if (typeof node === "string") {
      // Scan embedded occurrences, not just whole-string refs: template
      // props can carry comma-joined lists.
      for (const part of node.split(/[\s,]+/)) {
        const clean = part.trim().replace(/^\.\//, "");
        if (isPackageRef(clean) && !seen.has(clean)) {
          seen.add(clean);
          found.push(clean);
        }
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (node && typeof node === "object") {
      for (const v of Object.values(node as Record<string, unknown>)) visit(v);
    }
  };
  visit(value);
  return found;
}
