/**
 * Permalink structures (WP parity, Framique posts v1).
 *
 * Pure + client-safe: URL building/parsing shared by settings UI,
 * sitemap/canonical emitters, and the catch-all resolver. Products and
 * pages keep fixed shapes in v1; only `kind` targets below apply to posts.
 */

export type PermalinkKind =
  | "plain"
  | "day-name"
  | "month-name"
  | "numeric"
  | "postname"
  | "custom";

export type PermalinkStructure = {
  kind: PermalinkKind;
  /** Required when kind === "custom", e.g. "/%category%/%postname%/". */
  custom?: string;
  categoryBase?: string;
  tagBase?: string;
};

export const PERMALINK_PRESETS: Array<{
  kind: PermalinkKind;
  label: string;
  example: string;
}> = [
  { kind: "plain", label: "Plain", example: "?p=123" },
  { kind: "day-name", label: "Day and name", example: "/2026/09/21/sample-post/" },
  { kind: "month-name", label: "Month and name", example: "/2026/09/sample-post/" },
  { kind: "numeric", label: "Numeric", example: "/archives/123" },
  { kind: "postname", label: "Post name", example: "/sample-post/" },
  { kind: "custom", label: "Custom Structure", example: "/%category%/%postname%/" },
];

export const DEFAULT_PERMALINK_STRUCTURE: PermalinkStructure = {
  kind: "postname",
};

export type PermalinkPost = {
  postname: string;
  dateISO?: string | null;
  category?: string | null;
  author?: string | null;
  post_id?: number | string | null;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function parts(post: PermalinkPost): Record<string, string> {
  const d = post.dateISO ? new Date(post.dateISO) : null;
  const valid = d !== null && !Number.isNaN(d.getTime());
  return {
    "%year%": valid ? String(d.getUTCFullYear()) : "",
    "%monthnum%": valid ? pad2(d.getUTCMonth() + 1) : "",
    "%day%": valid ? pad2(d.getUTCDate()) : "",
    "%hour%": valid ? pad2(d.getUTCHours()) : "",
    "%minute%": valid ? pad2(d.getUTCMinutes()) : "",
    "%second%": valid ? pad2(d.getUTCSeconds()) : "",
    "%post_id%": post.post_id !== null && post.post_id !== undefined ? String(post.post_id) : "",
    "%postname%": post.postname,
    "%category%": post.category ?? "uncategorized",
    "%author%": post.author ?? "",
  };
}

function templateFor(s: PermalinkStructure): string {
  switch (s.kind) {
    case "plain":
      return "";
    case "day-name":
      return "/%year%/%monthnum%/%day%/%postname%/";
    case "month-name":
      return "/%year%/%monthnum%/%postname%/";
    case "numeric":
      return "/archives/%post_id%";
    case "postname":
      return "/%postname%/";
    case "custom":
      return s.custom && s.custom.length > 0 ? s.custom : "/%postname%/";
  }
}

/** Absolute-path post URL (no trailing-slash normalization beyond WP norms). */
export function buildPostUrl(
  s: PermalinkStructure,
  post: PermalinkPost,
): string {
  if (s.kind === "plain") {
    const id = post.post_id ?? "";
    return `/?p=${encodeURIComponent(String(id))}`;
  }
  const map = parts(post);
  let out = templateFor(s);
  for (const [tag, value] of Object.entries(map)) {
    out = out.split(tag).join(encodeURIComponent(value));
  }
  if (!out.startsWith("/")) out = `/${out}`;
  return out;
}

const TAG_PATTERN: Record<string, string> = {
  "%year%": "(?<year>\\d{4})",
  "%monthnum%": "(?<monthnum>\\d{1,2})",
  "%day%": "(?<day>\\d{1,2})",
  "%hour%": "(?<hour>\\d{1,2})",
  "%minute%": "(?<minute>\\d{1,2})",
  "%second%": "(?<second>\\d{1,2})",
  "%post_id%": "(?<post_id>\\d+)",
  "%postname%": "(?<postname>[^/]+)",
  "%category%": "(?<category>[^/]+)",
  "%author%": "(?<author>[^/]+)",
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Match a request path against a structure; null when it cannot match. */
export function matchPostUrl(
  s: PermalinkStructure,
  path: string,
): Record<string, string> | null {
  if (s.kind === "plain") {
    const m = /[?&]p=([^&#]+)/.exec(path);
    return m?.[1] ? { post_id: decodeURIComponent(m[1]) } : null;
  }
  const template = templateFor(s);
  let source = "";
  const names: string[] = [];
  const tagRe = /%(?:year|monthnum|day|hour|minute|second|post_id|postname|category|author)%/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(template)) !== null) {
    source += escapeRegex(template.slice(last, m.index));
    const pattern = TAG_PATTERN[m[0]];
    if (pattern) {
      source += pattern;
      const name = m[0].slice(1, -1);
      if (!names.includes(name)) names.push(name);
    }
    last = m.index + m[0].length;
  }
  source += escapeRegex(template.slice(last));
  const pathname = path.split(/[?#]/)[0] ?? "";
  const match = new RegExp(`^${source}/?$`).exec(pathname);
  if (!match?.groups) return null;
  const out: Record<string, string> = {};
  for (const name of names) {
    const value = match.groups[name];
    if (typeof value === "string" && value.length > 0) {
      out[name] = decodeURIComponent(value);
    }
  }
  return out;
}
