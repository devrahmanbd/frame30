/**
 * Phase 2.4 — most-recently-used widgets.
 *
 * Small, bounded and failure-tolerant: storage can be unavailable (private
 * mode), full (quota) or hostile (another script wrote junk under our key), so
 * every read is validated against the live catalog and every write degrades to
 * an in-memory list rather than throwing into a click handler.
 */
import { catalogEntry, type SectionType } from "./builder-ast";

export const RECENT_KEY = "framique.builder.recent.v1";
export const RECENT_LIMIT = 8;

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
type Logger = (event: string, detail: Record<string, unknown>) => void;

export type RecentStore = {
  read(): SectionType[];
  push(type: SectionType): SectionType[];
};

export function createRecentStore(options: { storage?: Storage | null; logger?: Logger } = {}): RecentStore {
  const logger = options.logger ?? (() => {});
  let storage: Storage | null;
  try {
    storage = options.storage ?? (typeof localStorage === "undefined" ? null : localStorage);
  } catch {
    storage = null;
  }
  let memory: SectionType[] = [];

  const sanitise = (raw: unknown): SectionType[] => {
    if (!Array.isArray(raw)) return [];
    const out: SectionType[] = [];
    for (const value of raw) {
      if (typeof value !== "string") continue;
      if (!catalogEntry(value as SectionType)) continue;
      if (out.includes(value as SectionType)) continue;
      out.push(value as SectionType);
      if (out.length >= RECENT_LIMIT) break;
    }
    return out;
  };

  const read = (): SectionType[] => {
    if (!storage) return memory;
    try {
      const raw = storage.getItem(RECENT_KEY);
      if (!raw) return memory;
      return sanitise(JSON.parse(raw));
    } catch (error) {
      logger("builder.recent.read_failed", { error: String(error) });
      return memory;
    }
  };

  const push = (type: SectionType): SectionType[] => {
    const next = sanitise([type, ...read()]);
    memory = next;
    if (storage) {
      try {
        storage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch (error) {
        // Quota or a locked-down profile: the MRU is a convenience, not state.
        logger("builder.recent.write_failed", { error: String(error) });
      }
    }
    return next;
  };

  return { read, push };
}
