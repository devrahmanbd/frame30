/**
 * AI output guardrails (pure, unit-tested).
 *
 * The assistant is advisory only. These helpers run *before* any retrieval or
 * tool call and *after* a candidate answer is drafted, so three classes of
 * failure can never reach a buyer:
 *
 * 1. prompt injection / instruction override,
 * 2. authority claims over money, refunds, stock or order state,
 * 3. PII and cross-tenant identifiers leaking into a reply or a log line.
 *
 * Everything here is deterministic and provider-independent: swapping the LLM
 * behind `LLMService` never changes the safety envelope.
 */

export type GuardKind = "injection" | "unsafe" | "cross_tenant" | "authority" | "pii";

export type GuardVerdict = {
  allowed: boolean;
  kind: GuardKind | null;
  rule: string | null;
};

const INJECTION_RULES: Array<[string, RegExp]> = [
  ["ignore_previous", /\b(ignore|disregard|forget)\b[^.]{0,30}\b(previous|prior|above|earlier)\b/i],
  ["system_prompt", /\b(system|developer)\s*(prompt|message|instructions?)\b/i],
  ["role_override", /\byou are now\b|\bact as\b[^.]{0,20}\b(admin|owner|developer|root)\b/i],
  ["secret_exfil", /\b(api[_\s-]?key|service[_\s-]?role|secret|token|password|env var)\b/i],
  ["tenant_probe", /\b(other|another|all)\s+(store|merchant|tenant|shop)s?\b/i],
  ["sql_probe", /\b(select\s+\*|drop\s+table|insert\s+into|update\s+\w+\s+set)\b/i],
  ["tool_forgery", /\b(tool_call|function_call|<\|im_start\|>|```json\s*\{\s*"tool")/i],
];

const AUTHORITY_RULES: Array<[string, RegExp]> = [
  ["grant_refund", /\b(i (will|can|have)|we (will|can|have))\b[^.]{0,40}\b(refund|reimburse|credit)\b/i],
  ["change_price", /\b(i|we)\b[^.]{0,30}\b(set|change|lower|discount)\b[^.]{0,20}\bprice\b/i],
  ["cancel_order", /\b(i|we)\b[^.]{0,20}\b(cancelled|cancelled it|have cancelled|will cancel)\b/i],
  ["guarantee_stock", /\b(guarantee|promise)\b[^.]{0,25}\b(stock|in stock|delivery date)\b/i],
];

/** Digits that look like BD money/quantity claims made without a pinned tool result. */
const NUMERIC_CLAIM = /(৳|BDT|Tk\.?)\s?[\d,]+|[\d,]+\s?(pieces?|pcs|units?|টাকা)/i;

/** Raw identifiers that must never round-trip into a reply or a log line. */
const PII_PATTERNS: Array<[string, RegExp]> = [
  ["email", /[\w.+-]+@[\w-]+\.[\w.]{2,}/g],
  ["phone", /(?:\+?88)?01[3-9]\d{8}/g],
  ["card", /\b(?:\d[ -]?){13,19}\b/g],
  ["uuid", /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi],
];

/** Inbound scan. Runs on every user turn before retrieval or any tool call. */
export function screenInbound(text: string): GuardVerdict {
  const value = text.slice(0, 2000);
  for (const [rule, re] of INJECTION_RULES) {
    if (re.test(value)) return { allowed: false, kind: "injection", rule };
  }
  if (value.replace(/\s+/g, "").length === 0) {
    return { allowed: false, kind: "unsafe", rule: "empty" };
  }
  return { allowed: true, kind: null, rule: null };
}

/**
 * Outbound scan. `pinned` is true only when every figure in the draft came
 * from a recorded tool call against a tenant-scoped source table.
 */
export function screenOutbound(text: string, opts: { pinned: boolean }): GuardVerdict {
  for (const [rule, re] of AUTHORITY_RULES) {
    if (re.test(text)) return { allowed: false, kind: "authority", rule };
  }
  if (!opts.pinned && NUMERIC_CLAIM.test(text)) {
    return { allowed: false, kind: "authority", rule: "unpinned_figure" };
  }
  return { allowed: true, kind: null, rule: null };
}

/** Replaces PII with stable placeholders. Applied to every stored message. */
export function redactPii(text: string): { text: string; hits: string[] } {
  let out = text;
  const hits: string[] = [];
  for (const [rule, re] of PII_PATTERNS) {
    if (re.test(out)) hits.push(rule);
    re.lastIndex = 0;
    out = out.replace(re, `[${rule} redacted]`);
  }
  return { text: out, hits };
}

/**
 * Confidence of a drafted answer. Two consecutive `unsure` turns escalate to a
 * human — the machine in `docs/10-ai-support` §5.
 */
export type Confidence = "pinned" | "grounded" | "unsure";

export function confidenceOf(opts: {
  toolHit: boolean;
  kbHits: number;
  topRank: number;
}): Confidence {
  if (opts.toolHit) return "pinned";
  if (opts.kbHits > 0 && opts.topRank >= 0.02) return "grounded";
  return "unsure";
}

/** Short, human-readable digest used in audit rows instead of raw text. */
export async function digest(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 24);
}
