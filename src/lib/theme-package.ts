import {
  EMPTY_AST,
  lintTemplate,
  parseTemplates,
  parseTokens,
  TEMPLATE_KEYS,
} from "./builder-ast";
import type { ThemePreset } from "./theme-presets";

export const MAX_PACKAGE_BYTES = 2 * 1024 * 1024;
export const MAX_SECTIONS_PER_TEMPLATE = 200;

/** Builder API range packages must target (registry versioning). */
export const PACKAGE_API_RANGE = "^3.0.0";

export type PackageResult =
  | { ok: true; preset: ThemePreset }
  | { ok: false; errors: string[] };

function jsUrl(v: unknown): boolean {
  return (
    typeof v === "string" &&
    /^\s*(javascript|data|vbscript):/i.test(v)
  );
}

/** Raw executable markup the parser would otherwise sanitise away. */
function rawExecutableHtml(v: unknown): boolean {
  return (
    typeof v === "string" &&
    /<\s*script\b/i.test(v)
  );
}

/**
 * True when a declared `api` range falls inside ^3.0.0 (major 3).
 * A missing/blank `api` defaults to the current range (accepted).
 */
function apiCompatible(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  const s = String(v).trim();
  if (s === "") return true;
  const m = /^[\^~>=<\s]*(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(s);
  return !!m && Number(m[1]) === 3;
}

/** Section count on the raw payload, including nested children. */
function countSections(rawAst: unknown): number {
  const r = (rawAst ?? {}) as Record<string, unknown>;
  let n = 0;
  const countKids = (node: unknown): number => {
    if (!node || typeof node !== "object") return 0;
    const kids = (node as Record<string, unknown>)["children"];
    if (!Array.isArray(kids)) return 0;
    let k = 0;
    for (const kid of kids) k += 1 + countKids(kid);
    return k;
  };
  for (const slot of ["header", "main", "footer"]) {
    const arr = r[slot];
    if (!Array.isArray(arr)) continue;
    for (const node of arr) n += 1 + countKids(node);
  }
  return n;
}

export function validateThemePackage(input: unknown): PackageResult {
  const errors: string[] = [];
  if (JSON.stringify(input ?? null).length > MAX_PACKAGE_BYTES)
    errors.push("package exceeds 2 MB");
  const raw = (input ?? {}) as Record<string, unknown>;
  if (!apiCompatible(raw["api"]))
    errors.push(
      `unsupported api range: ${String(raw["api"])} (expected ${PACKAGE_API_RANGE})`,
    );
  const rawTemplates = (raw["templates"] ?? {}) as Record<string, unknown>;
  const templates = parseTemplates(rawTemplates);
  const tokens = parseTokens(raw["tokens"] ?? {});
  for (const key of TEMPLATE_KEYS) {
    const rawAst = rawTemplates[key];
    // Packages ship only the templates they define; absent keys are filled
    // with EMPTY_AST on output, not errors (parseTemplates is Partial).
    if (rawAst === undefined) continue;
    // Budgets and dangerous content are checked on the RAW payload: the
    // parser silently truncates over-long slots (60/slot cap) and sanitises
    // executable markup/URLs, so post-parse counts and props cannot see them.
    if (countSections(rawAst) > MAX_SECTIONS_PER_TEMPLATE)
      errors.push(`template ${key} exceeds section budget`);
    const ast = templates[key] ?? EMPTY_AST;
    for (const issue of lintTemplate(ast, key)) {
      if (issue.level === "error") errors.push(`${key}: ${issue.message}`);
    }
    const walk = (v: unknown): void => {
      if (typeof v === "string") {
        if (jsUrl(v)) errors.push(`blocked URL scheme in ${key}`);
        else if (rawExecutableHtml(v))
          errors.push(`blocked executable HTML in ${key}`);
        return;
      }
      if (Array.isArray(v)) {
        for (const item of v) walk(item);
        return;
      }
      if (v !== null && typeof v === "object") {
        for (const item of Object.values(v)) walk(item);
      }
    };
    walk(rawAst);
  }
  if (errors.length > 0) return { ok: false, errors };
  const full = {} as ThemePreset["templates"];
  for (const key of TEMPLATE_KEYS) full[key] = templates[key] ?? EMPTY_AST;
  return {
    ok: true,
    preset: {
      key: String(raw["key"] ?? ""),
      nameEn: String(raw["nameEn"] ?? ""),
      nameBn: String(raw["nameBn"] ?? ""),
      summaryEn: String(raw["summaryEn"] ?? ""),
      summaryBn: String(raw["summaryBn"] ?? ""),
      category: String(raw["category"] ?? "fashion"),
      version: String(raw["version"] ?? "1.0.0"),
      api: String(raw["api"] ?? "^3.0.0"),
      sortOrder: Number(raw["sortOrder"] ?? 50),
      tokens,
      templates: full,
    },
  };
}
