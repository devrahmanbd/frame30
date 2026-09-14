/**
 * Phase 1 — local draft recovery.
 *
 * Server autosave already writes an `article_revisions` row every few seconds
 * (`cms.server.ts`), but that only helps if the *save* reached the server. The
 * failures writers actually hit are the other ones: the tab crashed, the laptop
 * slept, the session expired mid-post, the network dropped on a train. So the
 * editor also keeps a local copy, and offers "Restore unsaved draft from 14:02"
 * on reopen — the WordPress affordance, implemented honestly.
 *
 * Rules this module enforces:
 *  - Storage may be **absent or hostile** (Safari private mode throws on write,
 *    quota can be full, another tab can write garbage). Every access is
 *    defensive; a failure downgrades to in-memory and is reported, never thrown.
 *  - Drafts are **namespaced per merchant and article** so two stores or two
 *    posts never collide, and a stale draft cannot leak across tenants.
 *  - Drafts **expire** (7 days) and the store **self-prunes** to a bounded
 *    number of entries, so localStorage cannot grow without limit.
 *  - A draft that matches what the server already has is **not offered** —
 *    nothing is more annoying than a recovery prompt for identical text.
 */

export const DRAFT_LIMITS = {
  version: 1,
  prefix: "fq.blog.draft.",
  /** Bigger than any sane article, small enough to never hog the 5 MB budget. */
  maxBytes: 512_000,
  maxEntries: 12,
  ttlMs: 7 * 24 * 60 * 60 * 1000,
} as const;

export type DraftPayload = {
  title: string;
  titleEn: string;
  slug: string;
  excerpt: string;
  body: string;
  metaTitle: string;
  metaDescription: string;
};

export type StoredDraft = DraftPayload & {
  version: number;
  merchantId: string;
  articleId: string;
  savedAt: string;
  /** Fingerprint of the server state this draft diverged from. */
  baseHash: string;
};

export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem"> & {
  readonly length?: number;
  key?(index: number): string | null;
};

export type WriteResult =
  | { ok: true; persisted: boolean }
  | { ok: false; reason: "too_large" | "storage_failed" };

/** Stable, order-independent fingerprint (FNV-1a) — no crypto, no async. */
export function draftHash(payload: DraftPayload): string {
  const source = [
    payload.title,
    payload.titleEn,
    payload.slug,
    payload.excerpt,
    payload.body,
    payload.metaTitle,
    payload.metaDescription,
  ].join("\u0000");
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

export function draftKey(merchantId: string, articleId: string): string {
  return `${DRAFT_LIMITS.prefix}${merchantId}.${articleId}`;
}

function safeStorage(): DraftStorage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null; // storage disabled by policy
  }
}

export type DraftStore = ReturnType<typeof createDraftStore>;

export function createDraftStore(options: { storage?: DraftStorage | null; now?: () => number } = {}) {
  const storage = options.storage === undefined ? safeStorage() : options.storage;
  const now = options.now ?? (() => Date.now());
  /** Mirror so the current tab keeps working even when persistence is refused. */
  const memory = new Map<string, StoredDraft>();

  function parse(raw: string | null): StoredDraft | null {
    if (!raw) return null;
    try {
      const value = JSON.parse(raw) as Partial<StoredDraft>;
      if (!value || value.version !== DRAFT_LIMITS.version) return null;
      if (typeof value.savedAt !== "string" || typeof value.body !== "string") return null;
      const age = now() - Date.parse(value.savedAt);
      if (!Number.isFinite(age) || age < 0 || age > DRAFT_LIMITS.ttlMs) return null;
      return value as StoredDraft;
    } catch {
      return null; // another tab, another version, or corruption
    }
  }

  /** Best-effort eviction of expired and surplus entries. Never throws. */
  function prune(): number {
    if (!storage || typeof storage.length !== "number" || typeof storage.key !== "function") return 0;
    const mine: { key: string; savedAt: number }[] = [];
    for (let index = 0; index < (storage.length ?? 0); index += 1) {
      const key = storage.key(index);
      if (!key || !key.startsWith(DRAFT_LIMITS.prefix)) continue;
      const draft = parse(storage.getItem(key));
      if (!draft) {
        mine.push({ key, savedAt: -1 });
        continue;
      }
      mine.push({ key, savedAt: Date.parse(draft.savedAt) || 0 });
    }
    const doomed = mine
      .sort((a, b) => a.savedAt - b.savedAt)
      .slice(0, Math.max(0, mine.length - DRAFT_LIMITS.maxEntries))
      .concat(mine.filter((entry) => entry.savedAt < 0));
    let removed = 0;
    for (const entry of new Set(doomed.map((item) => item.key))) {
      try {
        storage.removeItem(entry);
        removed += 1;
      } catch {
        /* nothing sensible to do */
      }
    }
    return removed;
  }

  return {
    prune,

    write(merchantId: string, articleId: string, payload: DraftPayload, baseHash: string): WriteResult {
      const key = draftKey(merchantId, articleId);
      const draft: StoredDraft = {
        ...payload,
        version: DRAFT_LIMITS.version,
        merchantId,
        articleId,
        savedAt: new Date(now()).toISOString(),
        baseHash,
      };
      const serialized = JSON.stringify(draft);
      if (serialized.length > DRAFT_LIMITS.maxBytes) return { ok: false, reason: "too_large" };
      memory.set(key, draft);
      if (!storage) return { ok: true, persisted: false };
      try {
        storage.setItem(key, serialized);
        return { ok: true, persisted: true };
      } catch {
        // Quota is the common case: make room once, then try again.
        prune();
        try {
          storage.setItem(key, serialized);
          return { ok: true, persisted: true };
        } catch {
          return { ok: true, persisted: false };
        }
      }
    },

    read(merchantId: string, articleId: string): StoredDraft | null {
      const key = draftKey(merchantId, articleId);
      if (storage) {
        try {
          const stored = parse(storage.getItem(key));
          if (stored) return stored;
        } catch {
          /* fall through to memory */
        }
      }
      return memory.get(key) ?? null;
    },

    clear(merchantId: string, articleId: string) {
      const key = draftKey(merchantId, articleId);
      memory.delete(key);
      try {
        storage?.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * Should the editor offer recovery?
 *
 * Only when the local copy is genuinely newer *and* different from what the
 * server holds. Identical text, or a draft that predates the server row, is
 * silently discarded — a false recovery prompt teaches writers to ignore it.
 */
export function recoveryOffer(
  draft: StoredDraft | null,
  server: DraftPayload,
  serverUpdatedAt: string | null,
): { offer: boolean; reason: "none" | "identical" | "stale" | "diverged" } {
  if (!draft) return { offer: false, reason: "none" };
  if (draftHash(draft) === draftHash(server)) return { offer: false, reason: "identical" };
  if (serverUpdatedAt) {
    const serverTime = Date.parse(serverUpdatedAt);
    const draftTime = Date.parse(draft.savedAt);
    if (Number.isFinite(serverTime) && Number.isFinite(draftTime) && draftTime <= serverTime) {
      return { offer: false, reason: "stale" };
    }
  }
  return { offer: true, reason: "diverged" };
}

export function draftPayloadOf(source: Partial<DraftPayload>): DraftPayload {
  return {
    title: source.title ?? "",
    titleEn: source.titleEn ?? "",
    slug: source.slug ?? "",
    excerpt: source.excerpt ?? "",
    body: source.body ?? "",
    metaTitle: source.metaTitle ?? "",
    metaDescription: source.metaDescription ?? "",
  };
}
