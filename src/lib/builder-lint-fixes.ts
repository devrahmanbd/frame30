/**
 * Phase 2.5 — in-editor lint triage with fix actions.
 *
 * `lintTemplate` returns prose (`AstIssue`), which is the right shape for a
 * publish gate but useless for a UI that must *act*. This module is the missing
 * half: it classifies an issue into a stable code, ranks it, and — where a fix
 * is deterministic — returns a plan the editor can apply in one history step.
 *
 * Design rules:
 *  - **Never invent copy.** A missing alt text or a missing বাংলা translation
 *    can only be fixed by a human, so the plan is `focus`: jump to the node and
 *    open the panel that owns the field. Auto-writing "image" as alt text would
 *    pass the lint and fail the shopper.
 *  - **Only reversible patches.** Every `props` plan resets offending keys to
 *    the widget's catalog default, so an undo restores the previous value and a
 *    fix can never introduce a value the schema does not own.
 *  - **Classification is total.** Unknown messages fall through to
 *    `template.other`, ranked last, still rendered — a new lint rule must not
 *    disappear from the editor because this table has not caught up.
 *  - Pure: no React, no clock (the caller passes `now`), no storage.
 */
import {
  catalogEntry,
  type AstIssue,
  type PropValue,
  type Section,
  type SectionType,
} from "./builder-ast";
import type { BiText } from "./widget-help";

export type LintCode =
  | "node.duplicate_id"
  | "node.children_illegal"
  | "node.slot_illegal"
  | "node.unsupported"
  | "container.empty"
  | "heading.duplicate_h1"
  | "heading.missing_h1"
  | "heading.skipped_level"
  | "media.alt_missing"
  | "media.video_title"
  | "content.countdown_end"
  | "content.english_missing"
  | "content.bangla_missing"
  | "style.raw_colour"
  | "style.fixed_width"
  | "style.uppercase_bangla"
  | "schema.duplicate"
  | "schema.invalid"
  | "template.required_widget"
  | "template.context_mismatch"
  | "template.other";

/** Which inspector panel owns the field a `focus` plan points at. */
export type FixPanel = "content" | "layout" | "style" | "seo";

export type FixPlan =
  /** Reset/patch props on the offending node. Reversible by undo. */
  | { kind: "props"; props: Record<string, PropValue>; label: BiText }
  /** Delete the offending node (empty container, unsupported widget). */
  | { kind: "remove"; label: BiText }
  /** Give the node a fresh id (duplicate-id collisions). */
  | { kind: "reid"; label: BiText }
  /** Drop children that the widget may not hold, keeping the node. */
  | { kind: "unnest"; label: BiText }
  /** Human decision required: select the node and open a panel. */
  | { kind: "focus"; panel: FixPanel; label: BiText };

type Rule = {
  code: LintCode;
  /** Matched against the issue message; first match wins, so order matters. */
  test: RegExp;
  title: BiText;
  /** Lower sorts first. Structural breakage before cosmetics. */
  rank: number;
};

/**
 * Ordered because several messages share vocabulary ("heading", "structured
 * data"); the narrower pattern is always listed above the broader one.
 */
const RULES: Rule[] = [
  { code: "node.duplicate_id", test: /^Duplicate node id/i, rank: 0, title: { en: "Duplicate node id", bn: "একই নোড আইডি দুবার" } },
  { code: "node.unsupported", test: /^Unsupported widget/i, rank: 1, title: { en: "Unsupported widget", bn: "অসমর্থিত উইজেট" } },
  { code: "node.children_illegal", test: /cannot hold nested widgets/i, rank: 2, title: { en: "Nesting not allowed", bn: "ভিতরে রাখা যাবে না" } },
  { code: "node.slot_illegal", test: /is not allowed in the .* slot/i, rank: 3, title: { en: "Wrong slot", bn: "ভুল স্লট" } },
  { code: "template.context_mismatch", test: /needs data this template does not provide/i, rank: 4, title: { en: "Missing page context", bn: "পেজ কনটেক্সট নেই" } },
  { code: "template.required_widget", test: /template has no /i, rank: 5, title: { en: "Required widget missing", bn: "দরকারি উইজেট নেই" } },
  { code: "heading.duplicate_h1", test: /claims the page <h1>/i, rank: 6, title: { en: "Two primary headings", bn: "দুটি প্রধান হেডিং" } },
  { code: "heading.skipped_level", test: /skipp?ed|from h\d to h\d/i, rank: 7, title: { en: "Heading level skipped", bn: "হেডিং লেভেল বাদ পড়েছে" } },
  { code: "heading.missing_h1", test: /No primary heading/i, rank: 8, title: { en: "No primary heading", bn: "প্রধান হেডিং নেই" } },
  { code: "schema.duplicate", test: /only one per page is valid/i, rank: 9, title: { en: "Duplicate structured data", bn: "স্ট্রাকচার্ড ডেটা দুবার" } },
  { code: "schema.invalid", test: /^Structured data/i, rank: 10, title: { en: "Invalid structured data", bn: "ভুল স্ট্রাকচার্ড ডেটা" } },
  { code: "media.alt_missing", test: /missing alt text/i, rank: 11, title: { en: "Alt text missing", bn: "অল্ট টেক্সট নেই" } },
  { code: "media.video_title", test: /missing an accessible title/i, rank: 12, title: { en: "Video title missing", bn: "ভিডিও টাইটেল নেই" } },
  { code: "style.raw_colour", test: /Raw colour value/i, rank: 13, title: { en: "Raw colour", bn: "কাঁচা রঙ" } },
  { code: "style.fixed_width", test: /Fixed pixel width/i, rank: 14, title: { en: "Fixed pixel width", bn: "নির্দিষ্ট পিক্সেল প্রস্থ" } },
  { code: "style.uppercase_bangla", test: /Uppercase styling on/i, rank: 15, title: { en: "Uppercase on বাংলা", bn: "বাংলায় বড় হাতের স্টাইল" } },
  { code: "content.english_missing", test: /English copy is missing/i, rank: 16, title: { en: "English copy missing", bn: "ইংরেজি কপি নেই" } },
  { code: "content.bangla_missing", test: /no বাংলা translation/i, rank: 17, title: { en: "বাংলা translation missing", bn: "বাংলা অনুবাদ নেই" } },
  { code: "content.countdown_end", test: /Countdown has no valid end time/i, rank: 18, title: { en: "Countdown end time", bn: "কাউন্টডাউন শেষ সময়" } },
  { code: "container.empty", test: /Empty container/i, rank: 19, title: { en: "Empty container", bn: "খালি কনটেইনার" } },
];

const FALLBACK: Rule = {
  code: "template.other",
  test: /.^/,
  rank: 99,
  title: { en: "Template check", bn: "টেমপ্লেট চেক" },
};

export type ClassifiedIssue = AstIssue & {
  code: LintCode;
  title: BiText;
  rank: number;
  /** Stable key for React lists and for dismissal bookkeeping. */
  key: string;
};

export function classifyIssue(issue: AstIssue, index = 0): ClassifiedIssue {
  const rule = RULES.find((r) => r.test.test(issue.message)) ?? FALLBACK;
  return {
    ...issue,
    code: rule.code,
    title: rule.title,
    rank: rule.rank,
    key: `${rule.code}:${issue.sectionId ?? "template"}:${index}`,
  };
}

/**
 * Errors before warnings, then structural before cosmetic, then message order
 * so the list is stable across renders (React keys and screen-reader order
 * both depend on that).
 */
export function classifyIssues(issues: readonly AstIssue[]): ClassifiedIssue[] {
  return issues
    .map((issue, index) => classifyIssue(issue, index))
    .sort(
      (a, b) =>
        (a.level === b.level ? 0 : a.level === "error" ? -1 : 1) ||
        a.rank - b.rank ||
        a.message.localeCompare(b.message),
    );
}

/** Counts for the badge on the studio header. */
export function issueSummary(issues: readonly AstIssue[]): { errors: number; warnings: number } {
  let errors = 0;
  let warnings = 0;
  for (const issue of issues) {
    if (issue.level === "error") errors += 1;
    else warnings += 1;
  }
  return { errors, warnings };
}

/* ------------------------------------------------------------------- fixes */

const RAW_COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|hsl)a?\s*\(/;
const FIXED_WIDTH = /\b\d{2,4}px\b|\bw-\[\d/;
const UPPERCASE = /\buppercase\b|text-transform\s*:\s*uppercase/gi;

function defaultsOf(type: SectionType): Record<string, PropValue> {
  return catalogEntry(type)?.defaults ?? {};
}

/**
 * Reset every prop whose *string* value matches `pattern` back to the catalog
 * default (or the empty string when the schema has no default). Only the base
 * layer is touched here; breakpoint layers are handled by `resetOverrides`.
 */
function resetMatching(section: Section, pattern: RegExp): Record<string, PropValue> {
  const defaults = defaultsOf(section.type);
  const patch: Record<string, PropValue> = {};
  for (const [key, value] of Object.entries(section.props)) {
    if (typeof value !== "string" || !pattern.test(value)) continue;
    patch[key] = defaults[key] ?? "";
  }
  return patch;
}

function stripUppercase(section: Section): Record<string, PropValue> {
  const patch: Record<string, PropValue> = {};
  for (const [key, value] of Object.entries(section.props)) {
    if (typeof value !== "string" || !UPPERCASE.test(value)) continue;
    UPPERCASE.lastIndex = 0;
    patch[key] = value.replace(UPPERCASE, "").replace(/\s{2,}/g, " ").trim();
  }
  UPPERCASE.lastIndex = 0;
  return patch;
}

/** Seven days out, minute-aligned, so the value is reviewable and predictable. */
export function defaultCountdownEnd(now: number): string {
  const at = new Date(now + 7 * 24 * 60 * 60 * 1000);
  at.setUTCSeconds(0, 0);
  return at.toISOString();
}

export type FixContext = { now: number };

/**
 * The fix for one classified issue, or `null` when the merchant must decide
 * something we cannot decide for them *and* there is no field worth jumping to.
 */
export function planFix(
  issue: ClassifiedIssue,
  section: Section | null,
  ctx: FixContext = { now: Date.now() },
): FixPlan | null {
  switch (issue.code) {
    case "node.duplicate_id":
      return { kind: "reid", label: { en: "Give a new id", bn: "নতুন আইডি দিন" } };
    case "node.unsupported":
    case "container.empty":
      return { kind: "remove", label: { en: "Remove this node", bn: "নোডটি মুছুন" } };
    case "node.children_illegal":
      return { kind: "unnest", label: { en: "Remove nested widgets", bn: "ভিতরের উইজেট সরান" } };
    case "style.raw_colour":
      if (!section) return null;
      return {
        kind: "props",
        props: resetMatching(section, RAW_COLOUR),
        label: { en: "Reset to theme token", bn: "থিম টোকেনে ফেরান" },
      };
    case "style.fixed_width":
      if (!section) return null;
      return {
        kind: "props",
        props: resetMatching(section, FIXED_WIDTH),
        label: { en: "Clear fixed width", bn: "নির্দিষ্ট প্রস্থ সরান" },
      };
    case "style.uppercase_bangla":
      if (!section) return null;
      return {
        kind: "props",
        props: stripUppercase(section),
        label: { en: "Remove uppercase", bn: "বড় হাতের স্টাইল সরান" },
      };
    case "content.countdown_end":
      return {
        kind: "props",
        props: { endsAt: defaultCountdownEnd(ctx.now) },
        label: { en: "Set end in 7 days", bn: "৭ দিন পরে শেষ" },
      };
    case "media.alt_missing":
    case "media.video_title":
    case "content.english_missing":
    case "content.bangla_missing":
      return { kind: "focus", panel: "content", label: { en: "Open the field", bn: "ফিল্ড খুলুন" } };
    case "node.slot_illegal":
    case "template.context_mismatch":
    case "heading.duplicate_h1":
    case "schema.duplicate":
    case "schema.invalid":
      return { kind: "focus", panel: "content", label: { en: "Review this widget", bn: "উইজেট দেখুন" } };
    case "heading.missing_h1":
    case "heading.skipped_level":
      return { kind: "focus", panel: "seo", label: { en: "Open SEO panel", bn: "SEO প্যানেল খুলুন" } };
    default:
      return section ? { kind: "focus", panel: "content", label: { en: "Review this widget", bn: "উইজেট দেখুন" } } : null;
  }
}

/**
 * A `props` plan with nothing to write is not a fix — it would burn a history
 * entry and leave the lint standing. The panel uses this to render the reason
 * instead of a dead button.
 */
export function isActionable(plan: FixPlan | null): boolean {
  if (!plan) return false;
  if (plan.kind === "props") return Object.keys(plan.props).length > 0;
  return true;
}
