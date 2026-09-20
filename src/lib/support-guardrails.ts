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

export type GuardKind =
  | "injection"
  | "unsafe"
  | "cross_tenant"
  | "authority"
  | "pii"
  | "code_leak"
  | "secret_leak"
  | "vulnerability";

export type GuardVerdict = {
  allowed: boolean;
  kind: GuardKind | null;
  rule: string | null;
};

type InboundRule = {
  rule: string;
  kind: GuardKind;
  pattern: RegExp;
};

const INBOUND_RULES: InboundRule[] = [
  // 1. Prompt Injection, Jailbreak & Instruction Override
  {
    rule: "ignore_previous",
    kind: "injection",
    pattern:
      /\b(ignore|disregard|forget)\b[^.]{0,30}\b(previous|prior|above|earlier)\b/i,
  },
  {
    rule: "system_prompt",
    kind: "injection",
    pattern: /\b(system|developer)\s*(prompt|message|instructions?)\b/i,
  },
  {
    rule: "role_override",
    kind: "injection",
    pattern:
      /\byou are now\b|\bact as\b[^.]{0,20}\b(admin|owner|developer|root|system)\b/i,
  },
  {
    rule: "jailbreak_mode",
    kind: "injection",
    pattern:
      /\b(dan mode|developer mode|unrestricted mode|jailbreak|unfiltered mode|no rules mode|do anything now|aim mode|chaos mode)\b/i,
  },
  {
    rule: "tool_forgery",
    kind: "injection",
    pattern:
      /(<\|im_start\|>|```json\s*\{\s*"tool")|\b(tool_call|function_call)\b/i,
  },
  {
    rule: "encoding_evasion",
    kind: "injection",
    pattern: /\b(base64|rot13|hex)\s*(decode|decoded|payload|eval)\b/i,
  },

  // 2. Source Code & Architecture Exfiltration
  {
    rule: "source_code_dump",
    kind: "code_leak",
    pattern:
      /\b(dump|show|reveal|print|extract|give me|leak|read|display)\b[^.]{0,30}\b(source code|codebase|repository|repo files|internal code|\.env|package\.json|server\.ts|schema|database migrations|backend code)\b/i,
  },
  {
    rule: "file_inspection",
    kind: "code_leak",
    pattern:
      /\b(cat|grep|view_file|read_file|head|tail)\s+([./~a-zA-Z0-9_-]+\.(ts|tsx|js|jsx|sql|sh|env|json|yaml|yml|prisma))\b/i,
  },
  {
    rule: "repo_structure",
    kind: "code_leak",
    pattern:
      /\b(list|show|find|ls)\s+(all\s+)?(files|directories|folders)\s+(in|of|from)\s+(src|lib|routes|backend|server|app)\b/i,
  },

  // 3. Sensitive Credentials & Secrets Probing
  {
    rule: "secret_exfil",
    kind: "secret_leak",
    pattern:
      /\b(api[_\s-]?key|service[_\s-]?role|secret|token|password|env var|database[_\s-]?url|db[_\s-]?url|connection string|jwt[_\s-]?secret|auth[_\s-]?token|private[_\s-]?key|ssh[_\s-]?key|credential|webhook[_\s-]?secret)\b/i,
  },
  {
    rule: "financial_secret",
    kind: "secret_leak",
    pattern:
      /\b(bkash|nagad|upay|rocket|bank)\s*(pin|otp|app[_\s-]?secret|merchant[_\s-]?secret)\b/i,
  },

  // 4. Customer & Cross-Tenant Data Scraping
  {
    rule: "tenant_probe",
    kind: "cross_tenant",
    pattern:
      /\b(other|another|different|all)\s+(store|merchant|tenant|shop|account)s?(\s*(data|orders|customers|revenue|sales|info))?\b/i,
  },
  {
    rule: "customer_data_scraping",
    kind: "pii",
    pattern:
      /\b(dump|scrape|list all|export all|show all|get all|extract all)\b[^.]{0,30}\b(customers?|users?|buyers?|clients?|merchants?|emails?|phone numbers?|contacts?|passwords?|cards?|addresses?)\b/i,
  },

  // 5. Vulnerability Probing & Attack Payloads
  {
    rule: "vulnerability_probe",
    kind: "vulnerability",
    pattern:
      /\b(vulnerabilit(y|ies)|cve-\d{4}-\d+|penetration test|pen test|zero-day|0-day|idor|privilege escalation|remote code execution|rce|backdoor)\b/i,
  },
  {
    rule: "attack_intent",
    kind: "vulnerability",
    pattern:
      /\b(how to (hack|exploit|compromise|break into|attack|crack|defend against us))\b/i,
  },
  {
    rule: "defense_bypass",
    kind: "vulnerability",
    pattern:
      /\b(how to )?bypass\s*(rls|waf|rate[_\s-]?limit|auth(entication)?|guardrail|security|permissions?)\b/i,
  },
  {
    rule: "exploit_payload",
    kind: "vulnerability",
    pattern:
      /\b(sql\s*injection|xss\s*payload|ssrf\s*payload|reverse\s*shell|cmd\s*injection)\b/i,
  },
  {
    rule: "sql_probe",
    kind: "vulnerability",
    pattern:
      /\b(select\s+\*|drop\s+table|insert\s+into|update\s+\w+\s+set|union\s+select|information_schema|pg_catalog|pg_sleep)\b/i,
  },
  {
    rule: "code_injection",
    kind: "vulnerability",
    pattern:
      /(<script\b|javascript:|onerror\s*=|onload\s*=|document\.cookie|169\.254\.169\.254|\/etc\/passwd|\/etc\/shadow)/i,
  },
];

const AUTHORITY_RULES: Array<[string, RegExp]> = [
  [
    "grant_refund",
    /\b(i (will|can|have)|we (will|can|have))\b[^.]{0,40}\b(refund|reimburse|credit)\b/i,
  ],
  [
    "change_price",
    /\b(i|we)\b[^.]{0,30}\b(set|change|lower|discount)\b[^.]{0,20}\bprice\b/i,
  ],
  [
    "cancel_order",
    /\b(i|we)\b[^.]{0,20}\b(cancelled|cancelled it|have cancelled|will cancel)\b/i,
  ],
  [
    "guarantee_stock",
    /\b(guarantee|promise)\b[^.]{0,25}\b(stock|in stock|delivery date)\b/i,
  ],
];

/** Digits that look like BD money/quantity claims made without a pinned tool result. */
const NUMERIC_CLAIM =
  /(৳|BDT|Tk\.?)\s?[\d,]+|[\d,]+\s?(pieces?|pcs|units?|টাকা)/i;

/** Outbound code leak patterns that must never escape into answers. */
const CODE_LEAK_RULES: Array<[string, RegExp]> = [
  ["import_internal", /\bimport\s+.*?from\s+["'](@\/|\.\.\/|\.\/)/],
  [
    "server_boundary",
    /\b(createServerFn|supabaseAdmin|createClient\(|process\.env\[)\b/,
  ],
  [
    "server_file_path",
    /\b(src\/lib\/[a-zA-Z0-9_-]+\.server\.ts|src\/routes\/[a-zA-Z0-9_/.-]+\.tsx)\b/,
  ],
  [
    "local_path",
    /(?:\/Users\/|\/home\/|\/app\/|\/var\/)[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+/,
  ],
  [
    "schema_ddl",
    /\b(CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE)\s+(public\.)?\w+/i,
  ],
  [
    "export_code",
    /\bexport\s+(async\s+)?function\s+[a-zA-Z0-9_]+\s*\([^)]*\)\s*\{/,
  ],
];

/** Outbound secret patterns that must never escape into answers. */
const SECRET_LEAK_RULES: Array<[string, RegExp]> = [
  ["openrouter_or_ai_key", /\bsk-(?:or-v1-)?[a-zA-Z0-9_-]{20,}\b/],
  ["supabase_key", /\bsbp_[a-zA-Z0-9]{20,}\b/],
  [
    "jwt_token",
    /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\b/,
  ],
  [
    "database_uri",
    /\b(?:postgres(?:ql)?|mysql|redis|mongodb):\/\/[^:\s]+:[^@\s]+@[^\s]+\b/,
  ],
  ["private_key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  [
    "secret_assignment",
    /\b(?:api[_-]?key|service[_-]?role|jwt[_-]?secret|auth[_-]?token)\s*[:=]\s*['"][a-zA-Z0-9_.-]{10,}['"]/i,
  ],
  [
    "financial_pin",
    /\b(?:bKash|Nagad|Upay|Rocket|Bank)\s*(?:PIN|OTP|secret)\s*[:=]?\s*\d{3,6}\b/i,
  ],
];

/** Outbound vulnerability & exploit patterns. */
const VULNERABILITY_LEAK_RULES: Array<[string, RegExp]> = [
  [
    "exploit_disclosure",
    /\b(exploit payload|sql injection payload|xss payload|attack vector against framique|vulnerability in (framique|our api|our database))\b/i,
  ],
  [
    "malicious_shell",
    /\b(curl\s+-[sS]*\s*https?:.*\|\s*(ba)?sh|rm\s+-rf\s+\/|chmod\s+777\s+\/)\b/i,
  ],
  [
    "reverse_shell",
    /\b(nc\s+-[e\w]*\s+\/bin\/(ba)?sh|\/dev\/tcp\/\d+\.\d+\.\d+\.\d+\/\d+)\b/i,
  ],
];

/** Raw identifiers that must never round-trip into a reply or a log line. */
const PII_PATTERNS: Array<[string, RegExp]> = [
  ["email", /[\w.+-]+@[\w-]+\.[\w.]{2,}/g],
  ["phone", /(?:\+?88)?01[3-9]\d{8}/g],
  ["card", /\b(?:\d[ -]?){13,19}\b/g],
  [
    "uuid",
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
  ],
];

/** Inbound scan. Runs on every user turn before retrieval or any tool call. */
export function screenInbound(text: string): GuardVerdict {
  const value = text.slice(0, 2000);
  for (const item of INBOUND_RULES) {
    if (item.pattern.test(value)) {
      return { allowed: false, kind: item.kind, rule: item.rule };
    }
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
export function screenOutbound(
  text: string,
  opts: { pinned: boolean; allowNumericClaims?: boolean },
): GuardVerdict {
  // 1. Secrets leak check (highest severity)
  for (const [rule, re] of SECRET_LEAK_RULES) {
    if (re.test(text)) return { allowed: false, kind: "secret_leak", rule };
  }

  // 2. Source code and platform internals leak check
  for (const [rule, re] of CODE_LEAK_RULES) {
    if (re.test(text)) return { allowed: false, kind: "code_leak", rule };
  }

  // 3. Vulnerability and exploit leak check
  for (const [rule, re] of VULNERABILITY_LEAK_RULES) {
    if (re.test(text)) return { allowed: false, kind: "vulnerability", rule };
  }

  // 4. Customer PII and bulk data leak check
  const cardMatch = text.match(/\b(?:\d[ -]?){13,19}\b/);
  if (cardMatch) {
    const digits = cardMatch[0].replace(/\D/g, "");
    if (
      digits.length === 16 ||
      (digits.length >= 13 &&
        digits.length <= 19 &&
        /^(4|5[1-5]|3[47]|6011)/.test(digits))
    ) {
      return { allowed: false, kind: "pii", rule: "unmasked_card" };
    }
  }
  const emails = text.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/g) ?? [];
  if (new Set(emails).size >= 2) {
    return { allowed: false, kind: "pii", rule: "bulk_email_leak" };
  }
  const phones = text.match(/(?:\+?88)?01[3-9]\d{8}/g) ?? [];
  if (new Set(phones).size >= 2) {
    return { allowed: false, kind: "pii", rule: "bulk_phone_leak" };
  }

  // 5. Authority claims and unpinned figures
  for (const [rule, re] of AUTHORITY_RULES) {
    if (re.test(text)) return { allowed: false, kind: "authority", rule };
  }
  if (!opts.pinned && !opts.allowNumericClaims && NUMERIC_CLAIM.test(text)) {
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
