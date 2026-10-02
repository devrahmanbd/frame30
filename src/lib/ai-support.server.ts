import { en } from "./i18n-dict";
import { fmtMinor } from "./money";

export type Provenance = { label: string; table: string } | null;
export type AskResult = {
  conversationId: string;
  reply: string;
  provenance: Provenance;
  needsAgent: boolean;
  cta: "none" | "ticket";
};

export class SupportError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function admin() {
  const { supabaseAdmin } =
    await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function hashPhone(phone: string) {
  const bytes = new TextEncoder().encode(
    `framique:${phone.replace(/\D/g, "")}`,
  );
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `••••••${digits.slice(-4)}`;
}

export type Intent =
  | "order_status"
  | "refund"
  | "billing"
  | "technical"
  | "complaint"
  | "lead"
  | "faq_shipping"
  | "faq_hours"
  | "product"
  | "create_ticket"
  | "request_callback"
  | "other";

/**
 * Keyword-intent patterns (in order of specificity — first match wins for
 * detectIntent; classifyIntent returns every match, primary = first).
 *
 * create_ticket & request_callback are checked BEFORE generic patterns so that
 * explicit escalation requests are never reclassified as refunds or faq_shipping.
 * refund stays before order_status ("I want a refund for order 1001" → refund).
 * billing/complaint/technical/lead sit before the generic commerce patterns so
 * money/anger/bug/dealer signals are not swallowed by faq_shipping ("charge")
 * or the catch-all "other" humility path.
 */
const PATTERNS: Array<[Intent, RegExp]> = [
  // Explicit ticket / escalation intent (English + Bangla)
  // Checked FIRST — most specific, prevents reclassification as other intents
  [
    "create_ticket",
    /open.*ticket|create.*ticket|submit.*ticket|file.*ticket|ticket.*open|start.*ticket|escalate|টিকিট.*খুলুন|টিকিট.*তৈরি|সাপোর্ট.*টিকিট|contact.*support|reach.*support|speak.*(?:to|with)?.*agent|talk.*(?:to|with)?.*agent|talk.*to.*(?:real|human)|human.*support|speak.*human|মানুষের.*সাথে|এজেন্টের.*সাথে|এজেন্ট|real.*person|talk.*person/i,
  ],
  // Explicit callback / phone call intent (English + Bangla)
  [
    "request_callback",
    /call.*me|call.*back|phone.*call|ring.*me|কল.*করুন|কলব্যাক|ফোন.*করুন|আমাকে.*ফোন|কল.*দিন|callback|call back/i,
  ],
  // Refund BEFORE order_status: "I want a refund for order 1001" must hit refund,
  // not order_status.
  ["refund", /(refund|রিফান্ড|return|ফেরত|exchange|বদল)/i],
  // Billing / payments BEFORE order_status + faq_shipping ("charge" would
  // otherwise route money issues to the shipping FAQ). EN + BN + code-mixed.
  [
    "billing",
    /(bill(?:ing|ed)?|invoice|payment\s*(fail|error|declin|not\s*(reflect|receiv|complet|credit)|stuck|pending)|charged?\s*twice|double\s*charg|overcharg|extra\s*charg|wrong\s*(amount|bill|charg)|deduct(?:ed)?\s*(twice|extra)|bkash|nagad|sslcommerz|shurjopay|cod\s*(fail|issue)|বিল|ইনভয়েস|পেমেন্ট\s*(ব্যর্থ|হয়নি|আসেনি|সমস্যা|আটকে)|টাকা\s*(কেটে|কাটা|বেশি|দুবার|ফেরত\s*আসেনি)|চার্জ\s*(বেশি|দুবার)|বিকাশ|নগদ|taka\s*(kete|katlo|beshi|dubara?|jayni|asheni)|payment\s*(hoyni|hoini|failed|hocche\s*na)|double\s*taka|bhul\s*(bill|taka|amount))/i,
  ],
  // Complaint / anger BEFORE generic commerce patterns so angry delivery or
  // product turns route to the human fast-lane, not a cheerful FAQ.
  [
    "complaint",
    /(complain|grievance|grumble|rude|terribl|horribl|awful|pathetic|worst|atrocious|disgust|scam|fraud|cheat(?:ed|ing|er)?|liar|lying|lied|shame(?:ful|less)?|useless|nonsense|threat|sue\b|lawsuit|consumer\s*(rights?|court)|অভিযোগ|বাজে(\s*সার্ভিস|\s*ব্যবহার|\s*পণ্য)?|ফালতু|চোর|বাটপার|ধোকা|প্রতারণা|ঠক(?:ি[য়ে]|ানো)?|বিরক্ত|ঘৃণা|জঘন্য|নিকৃষ্ট|মিথ্যা|মিথ্যাবাদী|বদমাশ|ভোক্তা\s*অধিকার|baje\s*(service|behaviour|behavior|product|mal)|faltu|chor|batpar|dhoka|protarona|birokto|joghonno|mittha|bodmash|chiting|kharap\s*(service|behaviour|behavior))/i,
  ],
  // Technical / bug reports (platform, checkout, login, courier API).
  [
    "technical",
    /\b(bug|error|crash(?:ed|ing)?|glitch|broken\s*(site|app|page|link|checkout|payment)|not\s*working|doesn'?t\s*(work|load|open)|failed\s*to\s*load|login\s*(fail|error|issue|problem)|sign-?in\s*(fail|error)|website\s*(down|not\s*open|slow)|app\s*(crash|freeze|hang)|integration|api\b|webhook|checkout\s*error|5\d\d\s*error|404|500|এরর|ত্রুটি|সমস্যা|কাজ\s*করছে\s*না|লগইন\s*(হচ্ছে\s*না|সমস্যা|ব্যর্থ)|ওয়েবসাইট\s*(ডাউন|খুলছে\s*না)|অ্যাপ\s*(ক্র্যাশ|চলছে\s*না)|kaj\s*korch?e\s*na|kaj\s*kortese\s*na|login\s*hocche\s*na|website\s*khulche\s*na|error\s*(dicche|diche|asche)|bug\s*(ache|ace))\b/i,
  ],
  // Sales lead / new-business intent (store opening, dealership, wholesale).
  [
    "lead",
    /(open\s*(a|my\s*own|new)\s*store|start\s*selling|start\s*(a|my)\s*(business|shop|store)|dealership|distributorship|franchise|partner(?:ship)?\s*with|become\s*(a|an)\s*(dealer|distributor|partner|reseller|seller)|bulk\s*(order|buy|purchase|pricing)|wholesale|resell(?:er|ing)?|pricing\s*for\s*(bulk|reseller|dealer)|want\s*to\s*sell|দোকান\s*খুলতে|ব্যবসা\s*(করতে|শুরু)|ডিলারশিপ|ফ্র্যাঞ্চাইজি|পাইকারি|বাল্ক\s*অর্ডার|পার্টনার|বিক্রি\s*করতে\s*চাই|dokan\s*khulte\s*chai|business\s*korte\s*chai|dealer\s*hote\s*chai|paikari\s*(dam|rate|price)|bulk\s*kinte\s*chai)/i,
  ],
  ["order_status", /(order|অর্ডার|status|অবস্থা|track|ট্র্যাক|কোথায়)/i],
  ["faq_shipping", /(ship|ডেলিভারি|delivery|কুরিয়ার|charge|চার্জ)/i],
  [
    "faq_hours",
    /(hour|সময়|খোলা|location|ঠিকানা|address|ফোন|contact|যোগাযোগ)/i,
  ],
  ["product", /(size|সাইজ|stock|স্টক|available|আছে কি|দাম|price)/i],
];

export function detectIntent(text: string): Intent {
  for (const [intent, re] of PATTERNS) if (re.test(text)) return intent;
  return "other";
}

/**
 * TODO-3 — Agent brain: confidence-scored, multi-intent classification.
 *
 * Keyword-regex fast path (sync, deterministic, offline-safe) + model
 * fallback (async embedding similarity, see classifyIntentModel).
 * detectIntent() above is preserved as the backward-compatible wrapper
 * (primary of the fast path) so existing callers keep working.
 */

export type IntentSource = "keyword" | "embedding" | "heuristic" | "fallback";

export type IntentConfidence = {
  intent: Intent;
  confidence: number;
  source: IntentSource;
};

export type ClassifiedIntent = {
  primary: Intent;
  confidence: number;
  source: IntentSource;
  intents: IntentConfidence[];
  multi: boolean;
};

/** Base confidence per intent when matched by the keyword fast path. */
const INTENT_BASE_CONFIDENCE: Record<Intent, number> = {
  create_ticket: 0.93,
  request_callback: 0.93,
  refund: 0.9,
  order_status: 0.88,
  billing: 0.86,
  complaint: 0.84,
  technical: 0.84,
  lead: 0.82,
  faq_shipping: 0.8,
  faq_hours: 0.8,
  product: 0.8,
  other: 0.3,
};

/** Below this confidence the agent treats the turn as low-confidence. */
export const LOW_INTENT_CONFIDENCE_THRESHOLD = 0.45;

/**
 * Sync keyword fast path: every matching pattern is scored, primary is the
 * most specific (pattern order). Multi-intent turns (e.g. "refund please, and
 * get me a human") return all matches so the orchestrator can fire the
 * highest-priority action while recording the full picture.
 */
export function classifyIntent(text: string): ClassifiedIntent {
  const matches: IntentConfidence[] = [];
  for (const [intent, re] of PATTERNS) {
    if (re.test(text)) {
      matches.push({
        intent,
        confidence: INTENT_BASE_CONFIDENCE[intent],
        source: "keyword",
      });
    }
  }
  if (!matches.length) {
    return {
      primary: "other",
      confidence: INTENT_BASE_CONFIDENCE.other,
      source: "fallback",
      intents: [
        {
          intent: "other",
          confidence: INTENT_BASE_CONFIDENCE.other,
          source: "fallback",
        },
      ],
      multi: false,
    };
  }
  return {
    primary: matches[0].intent,
    confidence: matches[0].confidence,
    source: "keyword",
    intents: matches,
    multi: matches.length > 1,
  };
}

/** Short exemplar phrases per intent for the embedding fallback lane. */
const INTENT_PROTOTYPES: Record<Exclude<Intent, "other">, string[]> = {
  order_status: [
    "where is my order",
    "track my parcel status",
    "amar order kothay",
  ],
  refund: ["i want a refund", "return my product", "amar refund din"],
  billing: [
    "my bKash payment failed but money was deducted",
    "charged twice on my card",
    "taka kete niyeche payment hoyni",
  ],
  technical: [
    "website login is not working",
    "checkout shows an error",
    "login hocche na error dicche",
  ],
  complaint: [
    "your delivery man was rude, i want to complain",
    "terrible service, this is a scam",
    "baje service faltu behaviour",
  ],
  lead: [
    "i want to open a store and sell online",
    "dealership and wholesale pricing please",
    "dokan khulte chai paikari dam",
  ],
  faq_shipping: ["what are delivery charges", "do you deliver to Sylhet"],
  faq_hours: ["what are your shop hours", "shop address and contact"],
  product: ["is this size available in stock", "what is the price"],
  create_ticket: ["please open a support ticket", "talk to a human agent"],
  request_callback: ["please call me back", "amake call korun"],
};

const prototypeEmbeddingCache = new Map<string, number[]>();

async function prototypeEmbedding(phrase: string): Promise<number[] | null> {
  const cached = prototypeEmbeddingCache.get(phrase);
  if (cached) return cached;
  try {
    const { generateEmbeddingWithMeta } =
      await import("./support-embed.server");
    const res = await generateEmbeddingWithMeta(phrase, {
      timeoutMs: 4000,
      allowDeterministicFallback: true,
    });
    prototypeEmbeddingCache.set(phrase, res.embedding);
    return res.embedding;
  } catch {
    return null;
  }
}

/** Latin-token count: the offline deterministic embedder drops Bengali script,
 *  so embedding similarity is only meaningful when Latin tokens exist. */
function latinTokenCount(text: string): number {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

/** Clear the prototype embedding cache (tests). */
export function clearIntentPrototypeCache() {
  prototypeEmbeddingCache.clear();
}

/**
 * Model-backed classifier: keyword fast path first; embedding fallback only
 * when the fast path is unsure ("other" or confidence < 0.6) AND the query
 * carries enough Latin tokens for the similarity to be meaningful. BN-only
 * queries stay on the keyword/heuristic lane (keyword patterns already cover
 * BN + code-mixed). Never throws — degrades to the fast-path result.
 */
export async function classifyIntentModel(
  text: string,
): Promise<ClassifiedIntent> {
  const fast = classifyIntent(text);
  if (fast.primary !== "other" && fast.confidence >= 0.6) return fast;
  if (latinTokenCount(text) < 2) return fast;
  try {
    const { generateEmbeddingWithMeta, cosineSimilarity } =
      await import("./support-embed.server");
    const query = await generateEmbeddingWithMeta(text, {
      timeoutMs: 4000,
      allowDeterministicFallback: true,
    });
    let bestIntent: Intent = "other";
    let bestScore = 0;
    for (const [intent, phrases] of Object.entries(INTENT_PROTOTYPES) as Array<
      [Exclude<Intent, "other">, string[]]
    >) {
      let intentBest = 0;
      for (const phrase of phrases) {
        const proto = await prototypeEmbedding(phrase);
        if (!proto || proto.length !== query.embedding.length) continue;
        const sim = cosineSimilarity(query.embedding, proto);
        if (sim > intentBest) intentBest = sim;
      }
      if (intentBest > bestScore) {
        bestScore = intentBest;
        bestIntent = intent;
      }
    }
    // Deterministic-fallback vectors are token-overlap projections: accept a
    // moderate threshold; live Nemotron vectors easily clear it too.
    if (bestIntent !== "other" && bestScore >= 0.35) {
      const confidence = Math.min(0.75, 0.4 + bestScore * 0.4);
      const modelHit: IntentConfidence = {
        intent: bestIntent,
        confidence: Number(confidence.toFixed(3)),
        source: query.fallback ? "heuristic" : "embedding",
      };
      const intents =
        fast.primary === "other" ? [modelHit] : [fast.intents[0], modelHit];
      return {
        primary: fast.primary === "other" ? bestIntent : fast.primary,
        confidence:
          fast.primary === "other" ? modelHit.confidence : fast.confidence,
        source: fast.primary === "other" ? modelHit.source : fast.source,
        intents,
        multi: intents.length > 1,
      };
    }
    return fast;
  } catch {
    return fast;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TODO-3 — Sentiment + urgency scoring → ticket priority (angry fast-lane).
//
// Pure, deterministic heuristics (no model call): caps, punctuation bursts,
// angry/negative/positive lexicons (EN + BN + code-mixed), urgency markers.
// Never generates promises — it only scores, the orchestrator escalates.
// ─────────────────────────────────────────────────────────────────────────────

export type SentimentLabel = "positive" | "neutral" | "negative" | "angry";
export type UrgencyLevel = "low" | "normal" | "high" | "urgent";
export type TicketPriority = "low" | "normal" | "high" | "urgent";

export type SentimentVerdict = {
  sentiment: SentimentLabel;
  urgency: UrgencyLevel;
  /** Polarity in [-1, 1]: -1 furious, +1 delighted. */
  score: number;
  signals: string[];
  priority: TicketPriority;
  /** True when the turn should hand to a human (never auto-promise). */
  needsAgent: boolean;
};

const ANGRY_PATTERNS: Array<[string, RegExp]> = [
  [
    "angry_word",
    /(furious|enraged|outraged|disgust|hate|terrible|horrible|awful|pathetic|worst|atrocious|rude|scam|fraud|cheat|liar|lying|shameless|useless|nonsense|hell|damn|idiot|stupid|dumb|fool)/i,
  ],
  [
    "angry_bn",
    /(রাগ|ফালতু|চোর|বাটপার|ধোকা|প্রতারণা|ঘৃণা|জঘন্য|নিকৃষ্ট|মিথ্যাবাদী|বদমাশ|বিরক্ত)/,
  ],
  [
    "angry_mixed",
    /\b(faltu|chor|batpar|dhoka|protarona|birokto|joghonno|mittha|bodmash|baje|chiting)\b/i,
  ],
  [
    "threat",
    /(sue\b|lawsuit|court|police|consumer\s*(rights?|court)|case\s*(korbo|korbo)|report\s*you|social\s*media|facebook\s*(post|live)|viral|ভোক্তা\s*অধিকার|মামলা)/i,
  ],
];

const NEGATIVE_PATTERNS: Array<[string, RegExp]> = [
  [
    "negative_word",
    /(disappoint|unhappy|upset|worried|sad|angry|late|delay|damaged|broken|wrong|missing|lost|never|bad|poor|slow|expensive|overcharg|problem|issue|defect|fault|cancel)/i,
  ],
  [
    "negative_bn",
    /(দুঃখিত|হতাশ|চিন্তিত|সমস্যা|দেরি|ভাঙা|নষ্ট|ভুল|হারিয়ে|খারাপ|ধীর)/,
  ],
  ["negative_mixed", /\b(deri|nosto|bhanga|bhul|hariye|kharap|noshto)\b/i],
];

const POSITIVE_PATTERNS: Array<[string, RegExp]> = [
  [
    "positive_word",
    /(thank|thanks|grateful|great|excellent|awesome|love|perfect|helpful|satisfied|happy|nice|good\s*(service|job|work)|appreciated)/i,
  ],
  ["positive_bn", /(ধন্যবাদ|ভালো|চমৎকার|দারুণ|সন্তুষ্ট|খুশি)/],
  ["positive_mixed", /\b(dhonnobad|bhalo|darun|khushi)\b/i],
];

const URGENCY_PATTERNS: Array<[string, RegExp]> = [
  [
    "urgent_word",
    /(urgent|asap|immediately|right\s*now|emergency|hurry|at\s*once|within\s*today|today\s*itself|out\s*of\s*time)/i,
  ],
  ["urgent_bn", /(এখনই|তাড়াতাড়ি|জরুরি|দ্রুত|একক্ষ?ুনি|আজই)/],
  ["urgent_mixed", /\b(ekhuni|ekhon\s*i|taratari|joruri|druto|aaj\s*i)\b/i],
  [
    "wait_duration",
    /(\d+\s*(days?|din|hours?|ghonta|weeks?)\s*(late|deri|holo|hoye|par|dhore))/i,
  ],
];

export function analyzeSentiment(text: string): SentimentVerdict {
  const signals: string[] = [];
  let neg = 0;
  let pos = 0;

  for (const [name, re] of ANGRY_PATTERNS) {
    if (re.test(text)) {
      signals.push(name);
      neg += 0.55;
    }
  }
  for (const [name, re] of NEGATIVE_PATTERNS) {
    if (re.test(text) && !signals.includes(name)) {
      signals.push(name);
      neg += 0.3;
    }
  }
  for (const [name, re] of POSITIVE_PATTERNS) {
    if (re.test(text)) {
      signals.push(name);
      pos += 0.45;
    }
  }

  let urgencyHits = 0;
  for (const [name, re] of URGENCY_PATTERNS) {
    if (re.test(text)) {
      signals.push(name);
      urgencyHits += 1;
    }
  }

  // Caps shouting: >50% uppercase alpha and reasonably long.
  const letters = text.replace(/[^a-zA-Z]/g, "");
  const upper = text.replace(/[^A-Z]/g, "");
  if (letters.length >= 10 && upper.length / letters.length > 0.5) {
    signals.push("caps_shouting");
    neg += 0.35;
    urgencyHits += 1;
  }
  // Punctuation bursts (!!! / ???) read as shouting or desperation.
  const bangs = (text.match(/!/g) ?? []).length;
  const questions = (text.match(/\?/g) ?? []).length;
  if (bangs >= 2) {
    signals.push("exclaim_burst");
    neg += 0.25;
    urgencyHits += 1;
  } else if (bangs === 1 && neg > 0) {
    signals.push("exclaim");
    neg += 0.1;
  }
  if (questions >= 3) {
    signals.push("question_burst");
    urgencyHits += 1;
  }

  const raw = pos > 0 && neg === 0 ? pos : neg - pos;
  const score = Number(
    Math.max(-1, Math.min(1, pos > 0 && neg === 0 ? raw : -raw)).toFixed(3),
  );

  let sentiment: SentimentLabel;
  if (neg >= 0.6) sentiment = "angry";
  else if (neg >= 0.28) sentiment = "negative";
  else if (pos >= 0.4 && neg === 0) sentiment = "positive";
  else sentiment = "neutral";

  let urgency: UrgencyLevel;
  if (urgencyHits >= 2 || (sentiment === "angry" && urgencyHits >= 1)) {
    urgency = "urgent";
  } else if (urgencyHits === 1 || sentiment === "angry") {
    urgency = "high";
  } else if (sentiment === "positive") {
    urgency = "low";
  } else {
    urgency = "normal";
  }

  // Angry-customer fast-lane: high priority minimum, urgent when explicitly
  // time-pressured. Never auto-promise — priority only buys queue position.
  let priority: TicketPriority;
  if (sentiment === "angry") {
    priority = urgency === "urgent" ? "urgent" : "high";
  } else if (sentiment === "negative") {
    priority = urgency === "urgent" || urgency === "high" ? "high" : "normal";
  } else if (urgency === "urgent") {
    priority = "high";
  } else if (sentiment === "positive") {
    priority = "low";
  } else {
    priority = "normal";
  }

  const needsAgent =
    sentiment === "angry" ||
    sentiment === "negative" ||
    urgency === "urgent" ||
    urgency === "high";

  return { sentiment, urgency, score, signals, priority, needsAgent };
}

export async function merchantBySlug(slug: string) {
  const db = await admin();
  const { data } = await db
    .from("merchants")
    .select("id, name, slug")
    .eq("slug", slug)
    .maybeSingle();
  if (!data) throw new SupportError("no_merchant", "support.store_not_found");
  return { id: data.id, name: data.name, slug: data.slug };
}

export async function lookupOrder(
  merchantId: string,
  orderNumber: string,
  phone: string,
) {
  const db = await admin();
  const digits = phone.replace(/\D/g, "").slice(-9);
  const { data } = await db
    .from("orders")
    .select(
      "id, order_number, status, payment_method, currency_code, total_minor_int, customer_phone, created_at",
    )
    .eq("merchant_id", merchantId)
    .eq("order_number", orderNumber.trim().toUpperCase())
    .maybeSingle();
  if (!data) return null;
  if (!data.customer_phone.replace(/\D/g, "").endsWith(digits)) return null;
  return data;
}

const statusLabel = (status: string) => en(`order.status.${status}`);

export function orderAnswer(order: {
  order_number: string;
  status: string;
  total_minor_int: number;
  currency_code: string;
}) {
  const status = statusLabel(order.status);
  const total = fmtMinor(order.total_minor_int, order.currency_code);
  return en("support.order_answer", {
    number: order.order_number,
    status,
    total,
  });
}

export const FAQ: Record<
  Exclude<
    Intent,
    | "order_status"
    | "create_ticket"
    | "request_callback"
    | "billing"
    | "technical"
    | "complaint"
    | "lead"
  >,
  string
> = {
  refund: en("support.faq.refund"),
  faq_shipping: en("support.faq.shipping"),
  faq_hours: en("support.faq.hours"),
  product: en("support.faq.product"),
  other: en("support.faq.other"),
};

/** Fallback copy for the new brain intents (advisory only, never promises). */
export const BRAIN_INTENT_FALLBACK: Record<
  Extract<Intent, "billing" | "technical" | "complaint" | "lead">,
  string
> = {
  billing: en("support.faq.refund"),
  technical: en("support.faq.other"),
  complaint: en("support.ticket_prompt"),
  lead: en("support.faq.product"),
};

export async function startConversation(
  merchantId: string,
  phone: string | null,
) {
  const db = await admin();
  const { data, error } = await db
    .from("ai_conversations")
    .insert({
      merchant_id: merchantId,
      channel: "widget",
      phone_hash: phone ? await hashPhone(phone) : null,
    })
    .select("id")
    .single();
  if (error)
    throw new SupportError("conversation_failed", "support.chat_failed");
  return data.id;
}

export async function appendMessage(
  merchantId: string,
  conversationId: string,
  role: "customer" | "bot" | "agent",
  body: string,
) {
  const db = await admin();
  await db.from("ai_messages").insert({
    merchant_id: merchantId,
    conversation_id: conversationId,
    role,
    body,
  });
  await db
    .from("ai_conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("merchant_id", merchantId);
}

export async function escalate(
  merchantId: string,
  conversationId: string,
  orderNumber?: string,
) {
  const db = await admin();
  await db
    .from("ai_conversations")
    .update({ status: "needs_agent", order_number: orderNumber ?? null })
    .eq("id", conversationId)
    .eq("merchant_id", merchantId);
  return { ok: true } as const;
}

type AskInput = {
  slug: string;
  message: string;
  conversationId?: string | null;
  orderNumber?: string | null;
  phone?: string | null;
};

export async function handleAsk(input: AskInput): Promise<AskResult> {
  const merchant = await merchantBySlug(input.slug);
  const conversationId =
    input.conversationId ??
    (await startConversation(merchant.id, input.phone ?? null));
  await appendMessage(
    merchant.id,
    conversationId,
    "customer",
    input.message.slice(0, 500),
  );

  const intent = detectIntent(input.message);
  const result = await resolveIntent(merchant.id, intent, input);
  await appendMessage(merchant.id, conversationId, "bot", result.reply);
  if (result.needsAgent)
    await escalate(merchant.id, conversationId, input.orderNumber ?? undefined);
  return { ...result, conversationId };
}

async function resolveIntent(
  merchantId: string,
  intent: Intent,
  input: AskInput,
): Promise<Omit<AskResult, "conversationId">> {
  // Grounded-answer kernel: legacy keyword FAQ answers carried factual claims
  // with provenance:null, making fake replies structurally possible.
  // Null-context now returns explicit unsure+handoff, never a bare FAQ.
  // Order verification stays pinned (DB truth); everything else escalates.
  if (intent !== "order_status") {
    const needsAgent = true;
    return {
      reply:
        "I don't have verified info to answer this accurately. A member of the store team will take it from here — you can also open a ticket or request a callback.",
      provenance: null,
      needsAgent,
      cta: "ticket",
    };
  }
  if (!input.orderNumber || !input.phone)
    return {
      reply: en("support.ask_order_details"),
      provenance: null,
      needsAgent: false,
      cta: "none",
    };
  const order = await lookupOrder(merchantId, input.orderNumber, input.phone);
  if (!order)
    return {
      reply: en("support.order_not_found"),
      provenance: null,
      needsAgent: true,
      cta: "ticket",
    };
  return {
    reply: orderAnswer(order),
    provenance: { label: en("support.provenance.orders"), table: "orders" },
    needsAgent: false,
    cta: "none",
  };
}
