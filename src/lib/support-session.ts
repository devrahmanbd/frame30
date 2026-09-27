/**
 * Support Chat Session Persistence Module.
 *
 * Provides resilient, multi-tiered session persistence for storefront support chat:
 *  1. Primary tier: window.sessionStorage (persists across page reloads and SPA transitions).
 *  2. Secondary tier: window.localStorage with TTL (persists across cross-site navigations and new tabs).
 *  3. In-memory fallback: for private browsing environments with restricted Web Storage.
 *
 * Ensures customer chat history, conversationId, ticket/callback cards, and widget state
 * remain intact when navigating between pages, stores, or external sites.
 *
 * Versioning & upgrade carryover (TODO-6):
 *  - Versioned key `fq_support_chat_v1_<mode>_<slug>`, `version: 1` envelope,
 *    24h TTL (`SESSION_MAX_AGE_MS`) and a 50-message cap (`MAX_SAVED_MESSAGES`).
 *  - Pre-versioned widget snapshots stored under `fq-support-chat:<slug>:<mode>`
 *    (no envelope/TTL) are picked up once via `migrateLegacyChatSession()` and
 *    promoted into the versioned store, so context survives widget upgrades.
 *
 * Streaming note (TODO-6): the widget renders SSE deltas progressively but MUST
 * never persist a partial (`streaming: true`) message as an answer — the save
 * path here only ever receives final messages; the widget strips in-flight
 * partials before calling save.
 */

export type Source = { label: string; table: string; title?: string };
export type Confidence = "pinned" | "grounded" | "unsure";

export type TicketCard = {
  ticketId: string;
  ticketRef: string;
  subject: string;
  priority: string;
  status: string;
  firstResponseDueAt: string;
  agentMessage: string;
};

export type CallbackCard = {
  callbackId: string;
  callbackRef: string;
  customerName: string;
  window: string;
  windowDescription: string;
  agentMessage: string;
};

export type ChatMessage = {
  id: string;
  role: "customer" | "bot";
  body: string;
  sources?: Source[];
  confidence?: Confidence;
  cta?: boolean;
  ticketId?: string | null;
  ticketCard?: TicketCard | null;
  callbackCard?: CallbackCard | null;
};

export type StoredChatSession = {
  version: 1;
  slug: string;
  mode: "platform" | "dashboard" | "store";
  conversationId: string | null;
  customerName?: string;
  customerEmail?: string;
  open: boolean;
  phone: string;
  orderNumber: string;
  staffActive: boolean;
  msgs: ChatMessage[];
  updatedAt: number;
};

export const STORAGE_PREFIX = "fq_support_chat_v1";
export const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
export const MAX_SAVED_MESSAGES = 50;

/**
 * Pre-versioned widget storage key prefix (`fq-support-chat:<slug>:<mode>`).
 * Read-only source for one-time upgrade migration — never written.
 */
export const LEGACY_CHAT_KEY_PREFIX = "fq-support-chat:";

export function getLegacyStorageKey(
  slug: string,
  mode: string = "store",
): string {
  return `${LEGACY_CHAT_KEY_PREFIX}${slug}:${mode}`;
}

/** In-memory storage fallback for SSR or restricted browser sandboxes */
const IN_MEMORY_STORE = new Map<string, string>();

export function clearInMemoryChatSessions() {
  IN_MEMORY_STORE.clear();
}

/**
 * Build deterministic storage key isolated by store slug and mode.
 */
export function getStorageKey(slug: string, mode: string = "store"): string {
  const normalizedSlug = (slug || "default").trim().toLowerCase();
  const normalizedMode = (mode || "store").trim().toLowerCase();
  return `${STORAGE_PREFIX}_${normalizedMode}_${normalizedSlug}`;
}

/**
 * Ordered storage tiers: sessionStorage → localStorage → in-memory.
 * When `window` is unavailable (SSR / Node tests), duck-typed
 * `globalThis.sessionStorage` / `globalThis.localStorage` are honored so the
 * tier order stays meaningful outside the browser; `undefined` always
 * terminates the list as the in-memory tier.
 */
function storageTiers(): Array<Storage | undefined> {
  const tiers: Array<Storage | undefined> = [];
  if (typeof window !== "undefined") {
    tiers.push(window.sessionStorage, window.localStorage);
  } else {
    const g = globalThis as Record<string, unknown>;
    for (const name of ["sessionStorage", "localStorage"] as const) {
      const candidate = g[name] as Partial<Storage> | undefined;
      if (
        candidate &&
        typeof candidate.getItem === "function" &&
        typeof candidate.setItem === "function" &&
        typeof candidate.removeItem === "function"
      ) {
        tiers.push(candidate as Storage);
      }
    }
  }
  tiers.push(undefined);
  return tiers;
}

function readTier(storage: Storage | undefined, key: string): string | null {
  if (storage === undefined) return IN_MEMORY_STORE.get(key) ?? null;
  return safeGetItem(storage, key);
}

function writeTier(
  storage: Storage | undefined,
  key: string,
  value: string,
): void {
  if (storage === undefined) {
    IN_MEMORY_STORE.set(key, value);
    return;
  }
  safeSetItem(storage, key, value);
}

function removeTier(storage: Storage | undefined, key: string): void {
  if (storage === undefined) {
    IN_MEMORY_STORE.delete(key);
    return;
  }
  safeRemoveItem(storage, key);
}

/** Keep the newest messages; drop anything without id/body. */
function sanitizeMsgs(msgs: unknown): ChatMessage[] {
  if (!Array.isArray(msgs)) return [];
  return (msgs as Array<Partial<ChatMessage>>)
    .filter((m): m is ChatMessage =>
      Boolean(m && typeof m.id === "string" && typeof m.body === "string"),
    )
    .slice(-MAX_SAVED_MESSAGES);
}

function safeGetItem(storage: Storage | undefined, key: string): string | null {
  if (!storage) return IN_MEMORY_STORE.get(key) ?? null;
  try {
    return storage.getItem(key);
  } catch {
    return IN_MEMORY_STORE.get(key) ?? null;
  }
}

function safeSetItem(
  storage: Storage | undefined,
  key: string,
  value: string,
): void {
  IN_MEMORY_STORE.set(key, value);
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    // Storage quota exceeded or disabled in private browsing
  }
}

function safeRemoveItem(storage: Storage | undefined, key: string): void {
  IN_MEMORY_STORE.delete(key);
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Ignore removal errors
  }
}

function parseValidSession(raw: string | null): StoredChatSession | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<StoredChatSession>;
    if (
      !data ||
      data.version !== 1 ||
      typeof data.slug !== "string" ||
      !Array.isArray(data.msgs)
    ) {
      return null;
    }

    // Check expiration TTL
    const now = Date.now();
    if (typeof data.updatedAt === "number") {
      if (now - data.updatedAt > SESSION_MAX_AGE_MS) {
        return null;
      }
    }

    // Validate and sanitize messages array (50-msg cap, newest survive)
    const validMsgs = sanitizeMsgs(data.msgs);

    return {
      version: 1,
      slug: data.slug,
      mode: (data.mode as StoredChatSession["mode"]) || "store",
      conversationId: data.conversationId ?? null,
      customerName:
        typeof data.customerName === "string" ? data.customerName : "",
      customerEmail:
        typeof data.customerEmail === "string" ? data.customerEmail : "",
      open: Boolean(data.open),
      phone: typeof data.phone === "string" ? data.phone : "",
      orderNumber: typeof data.orderNumber === "string" ? data.orderNumber : "",
      staffActive: Boolean(data.staffActive),
      msgs: validMsgs,
      updatedAt: data.updatedAt || now,
    };
  } catch {
    return null;
  }
}

/**
 * Parse a pre-versioned widget snapshot (`fq-support-chat:<slug>:<mode>`).
 * Legacy payloads carry no version/TTL envelope; a readable snapshot is
 * treated as fresh (updatedAt = now), capped to MAX_SAVED_MESSAGES, and
 * promoted into the versioned store by the caller. Returns null for
 * missing/corrupt payloads or snapshots without a usable message list.
 */
function parseLegacySession(
  raw: string | null,
  slug: string,
  mode: string,
): StoredChatSession | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as {
      msgs?: unknown;
      conversationId?: unknown;
      customerName?: unknown;
      customerEmail?: unknown;
      open?: unknown;
      phone?: unknown;
      orderNumber?: unknown;
      staffActive?: unknown;
    };
    if (!data || !Array.isArray(data.msgs)) return null;
    const validMsgs = sanitizeMsgs(data.msgs);
    if (validMsgs.length === 0) return null;
    const normalizedMode =
      mode === "platform" || mode === "dashboard" ? mode : "store";
    return {
      version: 1,
      slug,
      mode: normalizedMode,
      conversationId:
        typeof data.conversationId === "string" ? data.conversationId : null,
      customerName:
        typeof data.customerName === "string" ? data.customerName : "",
      customerEmail:
        typeof data.customerEmail === "string" ? data.customerEmail : "",
      open: data.open === true,
      phone: typeof data.phone === "string" ? data.phone : "",
      orderNumber: typeof data.orderNumber === "string" ? data.orderNumber : "",
      staffActive: data.staffActive === true,
      msgs: validMsgs,
      updatedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * One-time upgrade carryover: promote a pre-versioned widget snapshot into
 * the versioned store and remove the legacy key. Idempotent — a second call
 * finds no legacy key and returns null (the versioned snapshot, if any, is
 * left untouched). Never throws.
 */
export function migrateLegacyChatSession(
  slug: string,
  mode: string = "store",
): StoredChatSession | null {
  const legacyKey = getLegacyStorageKey(slug, mode);
  let raw: string | null = null;
  for (const storage of storageTiers()) {
    try {
      raw = readTier(storage, legacyKey);
    } catch {
      raw = null;
    }
    if (raw) break;
  }
  const session = parseLegacySession(raw, slug, mode);
  if (!session) return null;
  try {
    const payload = JSON.stringify(session);
    const key = getStorageKey(slug, mode);
    for (const storage of storageTiers()) {
      try {
        writeTier(storage, key, payload);
        removeTier(storage, legacyKey);
      } catch {
        /* best effort per tier */
      }
    }
  } catch {
    /* promotion failed; still return the parsed session */
  }
  return session;
}

/**
 * Load persisted support chat session for a specific merchant slug and mode.
 * Checks sessionStorage first, falling back to localStorage if fresh, then
 * in-memory. When no versioned snapshot exists, a pre-versioned widget
 * snapshot is migrated in place so context survives widget upgrades.
 */
export function loadSupportChatSession(
  slug: string,
  mode: string = "store",
): StoredChatSession | null {
  const key = getStorageKey(slug, mode);
  const tiers = storageTiers();

  for (let i = 0; i < tiers.length; i++) {
    let raw: string | null = null;
    try {
      raw = readTier(tiers[i], key);
    } catch {
      continue;
    }
    const parsed = parseValidSession(raw);
    if (parsed) {
      // Re-populate earlier tiers so the active tab stays in sync
      // (e.g. recovered from localStorage into sessionStorage).
      if (i > 0 && raw) {
        for (let j = 0; j < i; j++) {
          try {
            writeTier(tiers[j], key, raw);
          } catch {
            /* best effort */
          }
        }
      }
      return parsed;
    }
  }

  // 4. Upgrade carryover from the pre-versioned widget key.
  return migrateLegacyChatSession(slug, mode);
}

/**
 * Persist support chat session into both sessionStorage and localStorage.
 */
export function saveSupportChatSession(
  session: Omit<StoredChatSession, "version" | "updatedAt">,
): void {
  const key = getStorageKey(session.slug, session.mode);
  const fullSession: StoredChatSession = {
    ...session,
    version: 1,
    msgs: session.msgs.slice(-MAX_SAVED_MESSAGES),
    updatedAt: Date.now(),
  };

  const payload = JSON.stringify(fullSession);

  for (const storage of storageTiers()) {
    try {
      writeTier(storage, key, payload);
    } catch {
      /* best effort per tier */
    }
  }
}

/**
 * Clear the chat session across all storage tiers (e.g. user clicks "New Chat").
 */
export function clearSupportChatSession(
  slug: string,
  mode: string = "store",
): void {
  const key = getStorageKey(slug, mode);

  for (const storage of storageTiers()) {
    try {
      removeTier(storage, key);
    } catch {
      /* best effort per tier */
    }
  }
}

/**
 * Check if a non-empty active chat session exists for the given store.
 */
export function isChatSessionActive(
  slug: string,
  mode: string = "store",
): boolean {
  const session = loadSupportChatSession(slug, mode);
  if (!session) return false;
  return (
    Boolean(session.conversationId) ||
    session.msgs.some((m) => m.role === "customer") ||
    session.msgs.length > 1
  );
}
