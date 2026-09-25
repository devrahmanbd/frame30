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

    // Validate and sanitize messages array
    const validMsgs = data.msgs
      .filter((m): m is ChatMessage =>
        Boolean(m && typeof m.id === "string" && typeof m.body === "string"),
      )
      .slice(-MAX_SAVED_MESSAGES);

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
 * Load persisted support chat session for a specific merchant slug and mode.
 * Checks sessionStorage first, falling back to localStorage if fresh.
 */
export function loadSupportChatSession(
  slug: string,
  mode: string = "store",
): StoredChatSession | null {
  if (typeof window === "undefined") return null;

  const key = getStorageKey(slug, mode);

  // 1. Try sessionStorage (primary active browser session)
  const sessionRaw = safeGetItem(window.sessionStorage, key);
  const fromSession = parseValidSession(sessionRaw);
  if (fromSession) {
    return fromSession;
  }

  // 2. Try localStorage (for cross-site navigations or newly opened tabs)
  const localRaw = safeGetItem(window.localStorage, key);
  const fromLocal = parseValidSession(localRaw);
  if (fromLocal) {
    // Re-populate sessionStorage so active tab is in sync
    safeSetItem(window.sessionStorage, key, localRaw!);
    return fromLocal;
  }

  // 3. Try in-memory fallback
  const memoryRaw = IN_MEMORY_STORE.get(key) ?? null;
  return parseValidSession(memoryRaw);
}

/**
 * Persist support chat session into both sessionStorage and localStorage.
 */
export function saveSupportChatSession(
  session: Omit<StoredChatSession, "version" | "updatedAt">,
): void {
  if (typeof window === "undefined") {
    // In SSR or node environment, store in memory
    const fullSession: StoredChatSession = {
      ...session,
      version: 1,
      msgs: session.msgs.slice(-MAX_SAVED_MESSAGES),
      updatedAt: Date.now(),
    };
    IN_MEMORY_STORE.set(
      getStorageKey(session.slug, session.mode),
      JSON.stringify(fullSession),
    );
    return;
  }

  const key = getStorageKey(session.slug, session.mode);
  const fullSession: StoredChatSession = {
    ...session,
    version: 1,
    msgs: session.msgs.slice(-MAX_SAVED_MESSAGES),
    updatedAt: Date.now(),
  };

  const payload = JSON.stringify(fullSession);

  // Write to sessionStorage
  safeSetItem(window.sessionStorage, key, payload);

  // Write to localStorage for cross-tab / cross-site recovery
  safeSetItem(window.localStorage, key, payload);
}

/**
 * Clear the chat session across all storage tiers (e.g. user clicks "New Chat").
 */
export function clearSupportChatSession(
  slug: string,
  mode: string = "store",
): void {
  const key = getStorageKey(slug, mode);

  if (typeof window !== "undefined") {
    safeRemoveItem(window.sessionStorage, key);
    safeRemoveItem(window.localStorage, key);
  }

  IN_MEMORY_STORE.delete(key);
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
