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
  {
    rule: "roleplay_bypass",
    kind: "injection",
    pattern:
      /\b(grandmother|grandma|granny|grandpa|grandfather)\b[^.]{0,80}\b(bedtime|story|lullaby|recite|read me|tell me|used to)\b|\b(my\s+)?(dead|deceased|late)\b[^.]{0,20}\b(grandmother|grandma|granny|grandpa|grandfather|mother|father|relative)\b/i,
  },
  {
    rule: "jailbreak_persona",
    kind: "injection",
    pattern:
      /\b(you are|act as|become|enable|activate|stay in|pretend to be|from now on)\b[^.]{0,24}\b(dan|stan|dude|betterdan|unfiltered|unrestricted)\b|\b(stan|betterdan)\b/i,
  },
  {
    rule: "prompt_extraction",
    kind: "injection",
    pattern:
      /\b(repeat|reveal|recite|output|print|show|display|disclose|leak|dump|quote|tell me|give me)\b[^.]{0,50}\b(system|developer|initial|original|hidden|secret|internal|core)\b[^.]{0,24}\b(prompt|message|instructions?|guidelines|rules?)\b/i,
  },
  {
    rule: "authority_override",
    kind: "injection",
    pattern:
      /\b(override|overrule|disregard|suspend|disable|bypass|ignore|drop)\b[^.]{0,30}\b(safety|content|policy|policies|guidelines?|restrictions?|limitations?|filters?|guardrails?|ethics)\b|\b(you have|there are)\s+no\s+(rules|restrictions|limitations|filters|policies)\b|\b(as\s+(an?\s+)?(authority|admin|owner|developer|official|officer|policeman|government)|under\s+(penalty|authority))\b[^.]{0,40}\b(demand|order|require|insist|command)\b/i,
  },
  {
    // Bengali instruction-override attempts (no \b: non-Latin script).
    rule: "multilingual_override",
    kind: "injection",
    pattern:
      /(উপেক্ষা কর|ভুলে যাও|আগের নির্দেশ|পূর্বের নির্দেশ|নির্দেশনা (ভুলে|উপেক্ষা)|সিস্টেম প্রম্পট|সিস্টেম নির্দেশ|জেলব্রেক|ড্যান মোড)/,
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
  [
    // Passive-voice refund claims ("refund has been initiated") evade the
    // active-voice grant_refund rule above; block them the same way.
    "refund_initiated_claim",
    /\b(initiated|processed|issued|completed|dispatched|sent)\b[^.]{0,30}\b(refund|reimbursement)\b|\brefund\b[^.]{0,30}\b(initiated|processed|issued|completed|has been sent|is on (its|the) way)\b/i,
  ],
  [
    // Bengali passive refund claims (e.g. the /refund macro bodyBn).
    "refund_initiated_claim_bn",
    /রিফান্ড[^.।]{0,40}(শুরু করা হ\u09DFেছে|শুরু হ\u09DFেছে|পাঠানো হ\u09DFেছে|সম্পন্ন|দেও\u09DFা হ\u09DFেছে)/,
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
  // Bangladesh NID: 10 / 13 / 17 contiguous digits. Must run BEFORE `card`
  // so 13/17-digit NIDs are labelled nid, not card (16-digit cards never
  // collide with these lengths thanks to the word boundaries).
  ["nid", /\b(?:\d{10}|\d{13}|\d{17})\b/g],
  // Bangladesh passport: 2 letters + 7 digits (e.g. AB1234567).
  ["passport", /\b[A-Z]{2}\d{7}\b/gi],
  // Mobile-banking PIN / OTP anchored to a brand, plus standalone OTP codes.
  [
    "pin_otp",
    /\b(?:bKash|Nagad|Upay|Rocket|Bank|DBBL|BRAC|City)\s*(?:PIN|OTP|secret|verification\s*code|code)\s*(?:is\s+)?[:=\-#]?\s*\d{3,8}\b|\bOTP\s*(?:is\s+)?[:=\-#]?\s*\d{4,8}\b/gi,
  ],
  ["card", /\b(?:\d[ -]?){13,19}\b/g],
  // BD street address cues anchored to a city, plus city + 4-digit postcode.
  [
    "address",
    /(?:\b(?:house|holding|flat|apartment|apt|floor|road|rd|street|lane|block|plot|sector|village|thana|upazila|union|ward)\b[^.\n]{0,60}?\b(?:dhaka|chattogram|chittagong|khulna|sylhet|rajshahi|barishal|rangpur|mymensingh|comilla)\b[^.\n]{0,24}|\b(?:dhaka|chattogram|chittagong|khulna|sylhet|rajshahi|barishal|rangpur|mymensingh|comilla)\s*-?\s*\d{4}\b)/gi,
  ],
  [
    "uuid",
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
  ],
];

/** Inbound scan. Runs on every user turn before retrieval or any tool call. */
const B64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function tryUrlDecodeOnce(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Decode one level (twice, to catch double-encoding) of URL-encoding. */
function tryUrlDecode(value: string): string {
  let prev = value;
  for (let i = 0; i < 2; i++) {
    const next = tryUrlDecodeOnce(prev);
    if (next === prev) break;
    prev = next;
  }
  return prev;
}

/**
 * Bengali nukta folding: য + nukta (U+09AF U+09BC) and the precomposed য়
 * (U+09DF) look identical but are different code points — and Unicode NFC
 * does NOT unify them. Fold decomposed forms to precomposed (also ড+়→ড়,
 * ঢ+়→ঢ়) so one pattern matches both spellings.
 */
const NUKTA_FOLD_MAP: Record<string, string> = {
  "\u09A1": "\u09DC",
  "\u09A2": "\u09DD",
  "\u09AF": "\u09DF",
};

function foldBengaliNukta(value: string): string {
  return value.replace(
    /([\u09A1\u09A2\u09AF])\u09BC/g,
    (m, base: string) => NUKTA_FOLD_MAP[base] ?? m,
  );
};

/** NFC + nukta folding for all Bengali-aware matching. */
function canonicalBn(value: string): string {
  return foldBengaliNukta(value.normalize("NFC"));
}

function b64ToBytes(clean: string): Uint8Array | null {
  const core = clean.replace(/=+$/, "");
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const ch of core) {
    const v = B64_ALPHABET.indexOf(ch);
    if (v < 0) return null;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

/** Keep only decodings that look like human-readable smuggled text. */
function decodedIfReadable(bytes: Uint8Array): string | null {
  if (bytes.length < 8) return null;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  if (text.length < 8) return null;
  const readable = (text.match(/[\x20-\x7E\u0980-\u09FF]/g) ?? []).length;
  if (readable / text.length < 0.7) return null;
  return text;
}

function decodeHexRuns(text: string, into: Set<string>): void {
  const runs = text.match(/(?:[0-9a-fA-F]{2}\s*){8,}/g) ?? [];
  for (const run of runs) {
    let compact = run.replace(/\s+/g, "");
    // Resync: a run can absorb preceding hex-letter pairs from adjacent
    // English words (e.g. the "ad " in "payload"), shifting alignment and
    // producing invalid UTF-8. Retry minus one byte up to twice.
    for (let attempt = 0; attempt < 3 && compact.length >= 16; attempt++) {
      if (compact.length % 2 === 0 && !/[^0-9a-fA-F]/.test(compact)) {
        const bytes = new Uint8Array(compact.length / 2);
        for (let i = 0; i < bytes.length; i++) {
          bytes[i] = parseInt(compact.slice(i * 2, i * 2 + 2), 16);
        }
        const decoded = decodedIfReadable(bytes);
        if (decoded) {
          into.add(decoded);
          if (into.size >= 6) return;
          break;
        }
      }
      compact = compact.slice(2);
    }
  }
}

function decodeBase64Runs(text: string, into: Set<string>): void {
  const runs = text.match(/[A-Za-z0-9+/\-_]{20,}={0,2}/g) ?? [];
  for (const run of runs) {
    let clean = run
      .replace(/\s+/g, "")
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) continue;
    if (clean.length < 20 || clean.length % 4 === 1) continue;
    while (clean.length % 4 !== 0) clean += "=";
    const bytes = b64ToBytes(clean);
    if (!bytes) continue;
    const decoded = decodedIfReadable(bytes);
    if (decoded) {
      into.add(decoded);
      if (into.size >= 6) return;
    }
  }
}

/**
 * Normalize-then-screen corpus: the raw turn plus any base64 / hex /
 * URL-encoded payloads decoded back to readable text, so obfuscated
 * instruction overrides cannot slip past the regex rules below.
 */
export function expandScreeningCorpus(text: string): string[] {
  // NFC + nukta folding first: visually identical Bengali spellings
  // (য় vs য + nukta) must match the same rules regardless of the form
  // the client sent (Unicode NFC does not unify them).
  const src = canonicalBn(text);
  const corpus = new Set<string>([src]);
  const urlDecoded = tryUrlDecode(src);
  if (urlDecoded !== src) corpus.add(urlDecoded);
  decodeHexRuns(src, corpus);
  decodeHexRuns(urlDecoded, corpus);
  decodeBase64Runs(src, corpus);
  decodeBase64Runs(urlDecoded, corpus);
  return [...corpus].slice(0, 7);
}

export function screenInbound(text: string): GuardVerdict {
  for (const candidate of expandScreeningCorpus(text)) {
    const value = candidate.slice(0, 2000);
    for (const item of INBOUND_RULES) {
      if (item.pattern.test(value)) {
        return { allowed: false, kind: item.kind, rule: item.rule };
      }
    }
  }
  if (text.replace(/\s+/g, "").length === 0) {
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
  // NFC + nukta folding so Bengali spellings (য় vs য + nukta) match uniformly.
  text = canonicalBn(text);
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

  // 5. Authority claims and unpinned figures. Explicit negations
  // ("no refund has been issued yet") are disclosures, not claims.
  const authorityText = text.replace(
    /\bno\s+refund\s+has\s+been\s+(initiated|processed|issued|completed|sent)\b[^.]{0,24}/gi,
    "",
  );
  for (const [rule, re] of AUTHORITY_RULES) {
    if (re.test(authorityText))
      return { allowed: false, kind: "authority", rule };
  }
  if (!opts.pinned && !opts.allowNumericClaims && NUMERIC_CLAIM.test(text)) {
    return { allowed: false, kind: "authority", rule: "unpinned_figure" };
  }
  return { allowed: true, kind: null, rule: null };
}

/** Advisory-only replacement copy for the /refund macro (owning lane: paste into support-canned-responses.ts). */
export const ADVISORY_REFUND_TEMPLATE_EN =
  "Thanks for your patience. I have created support ticket {{ticketId}} for order #{{orderNumber}}. " +
  "Refunds are subject to inspection and finance review once we receive the item; approved refunds typically " +
  "reach your original payment method (bKash/Nagad/Card) within 3–5 business days. " +
  "I will update you on this ticket as soon as the review is complete — no refund has been issued yet.";

export const ADVISORY_REFUND_TEMPLATE_BN =
  "ধন্যবাদ। অর্ডার #{{orderNumber}} এর জন্য সাপোর্ট টিকিট {{ticketId}} তৈরি করা হয়েছে। " +
  "পণ্য হাতে পেয়ে যাচাই ও ফিন্যান্স পর্যালোচনা সাপেক্ষে রিফান্ড অনুমোদিত হয়; অনুমোদিত রিফান্ড সাধারণত " +
  "৩–৫ কার্যদিবসের মধ্যে আপনার মূল পেমেন্ট মাধ্যমে (বিকাশ/নগদ/কার্ড) পৌঁছে যায়। " +
  "পর্যালোচনা শেষ হলেই এই টিকিটে জানিয়ে দেব — এখনো কোনো রিফান্ড ইস্যু করা হয়নি।";

export type RefundCopyVerdict = {
  truthful: boolean;
  rule: string | null;
};

const REFUND_INITIATED_EN =
  /\b(we|i)\s+(have|has)\s+(initiated|processed|issued|completed|sent)\b[^.]{0,40}\b(refund|reimburse)/i;
const REFUND_INITIATED_PASSIVE_EN =
  /\brefund\b[^.]{0,30}\b(initiated|processed|issued|completed|has been sent|is on (its|the) way)\b/i;
const REFUND_INITIATED_BN =
  /রিফান্ড[^.।]{0,40}(শুরু করা হ\u09DFেছে|শুরু হ\u09DFেছে|পাঠানো হ\u09DFেছে|সম্পন্ন|দেও\u09DFা হ\u09DFেছে)/;
// Explicit negations ("no refund has been issued yet") are not claims.
const REFUND_NEGATION_EN =
  /\bno\s+refund\s+has\s+been\s+(initiated|processed|issued|completed|sent)\b[^.]{0,20}/gi;
const REFUND_TICKET_REF = /\b(ticket|reference|support desk|escalat)/i;
const REFUND_TICKET_REF_BN = /(টিকিট|রেফারেন্স)/;
const REFUND_ADVISORY_EN =
  /\b(subject to|once|after|typically|usually|estimated|expected|review|verif|inspect|timeline|business days)\b/i;
const REFUND_ADVISORY_BN = /(যাচাই|পর্যালোচনা|সাপেক্ষে|সাধারণত)/;

/**
 * Truthfulness gate for refund macro copy (filter layer).
 * - Any initiated/processed/issued claim without `verifiedRefund` fails.
 * - Refund copy must point at a ticket/reference and carry an advisory
 *   hedge (subject-to-review + estimate wording), never a completion claim.
 */
export function checkRefundCopy(
  text: string,
  opts?: { verifiedRefund?: boolean },
): RefundCopyVerdict {
  text = canonicalBn(text);
  const mentionsRefund = /\brefund\b/i.test(text) || /রিফান্ড/.test(text);
  if (!mentionsRefund) return { truthful: true, rule: null };
  const scrubbed = text.replace(REFUND_NEGATION_EN, "");
  const initiated =
    REFUND_INITIATED_EN.test(scrubbed) ||
    REFUND_INITIATED_PASSIVE_EN.test(scrubbed) ||
    REFUND_INITIATED_BN.test(scrubbed);
  if (initiated && !opts?.verifiedRefund) {
    return { truthful: false, rule: "unverified_refund_claim" };
  }
  const hasTicket =
    REFUND_TICKET_REF.test(text) || REFUND_TICKET_REF_BN.test(text);
  if (!hasTicket) {
    return { truthful: false, rule: "missing_ticket_reference" };
  }
  const advisory =
    REFUND_ADVISORY_EN.test(text) || REFUND_ADVISORY_BN.test(text);
  if (!advisory) {
    return { truthful: false, rule: "missing_advisory_hedge" };
  }
  return { truthful: true, rule: null };
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
