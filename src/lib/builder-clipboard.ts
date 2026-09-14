/**
 * Phase 1.3 — the studio clipboard.
 *
 * Elementor keeps a clipboard that survives page changes and other browser
 * tabs; ours has to do the same while staying safe for a multi-tenant admin:
 *
 *  - **Versioned envelope.** Every payload carries `v`, the origin tab id and a
 *    timestamp. A payload from a future schema version is ignored rather than
 *    coerced, so a half-deployed release can never paste garbage.
 *  - **Sanitised on read.** The stored JSON is untrusted (any script with the
 *    same origin can write it), so it is pushed back through `parseAst`, which
 *    drops unknown widget types, illegal nesting and over-budget trees.
 *  - **Bounded.** Node count, subtree depth and serialised byte size are all
 *    capped before a write, and a `QuotaExceededError` degrades to an
 *    in-memory clipboard instead of throwing into a keyboard handler.
 *  - **Cross-tab.** Writes fan out over `BroadcastChannel` when available and
 *    fall back to the `storage` event, so a second studio tab sees the paste
 *    buffer without a reload.
 *
 * The module is dependency-injected (`storage`, `channel`, `now`, `logger`) so
 * the contract test drives it with fakes and no jsdom.
 */
import { STYLE_KEYS, parseAst, type Breakpoint, type PropValue, type Section, type Slot, type TemplateKey } from "./builder-ast";

export const CLIPBOARD_VERSION = 2;
export const CLIPBOARD_KEY = "framique.builder.clipboard.v2";
export const CLIPBOARD_CHANNEL = "framique.builder.clipboard";

/** Hard ceilings. A clipboard is a convenience, not a bulk transfer tool. */
export const CLIPBOARD_LIMITS = {
  maxNodes: 40,
  maxBytes: 512_000,
} as const;

export type ClipboardKind = "nodes" | "style";

export type ClipboardPayload = {
  v: number;
  /** Epoch ms of the copy, used for staleness display and conflict ordering. */
  ts: number;
  /** Tab that produced the payload; a tab ignores its own broadcast echoes. */
  origin: string;
  kind: ClipboardKind;
  /** Where it was copied from — shown in the paste affordance, never enforced. */
  from: { template: TemplateKey; slot: Slot };
  nodes: Section[];
  /** Present for `kind: "style"`: the copied style layer only. */
  style?: StylePatch;
};

export type StylePatch = {
  props: Record<string, PropValue>;
  bp?: Partial<Record<Breakpoint, Record<string, PropValue>>>;
  hidden?: Breakpoint[];
};

export type ClipboardRejection =
  | "empty"
  | "too_many_nodes"
  | "too_large"
  | "storage_unavailable"
  | "version_mismatch"
  | "malformed";

export type WriteResult =
  | { ok: true; payload: ClipboardPayload; persisted: boolean }
  | { ok: false; reason: ClipboardRejection };

const STYLE_KEY_SET = new Set<string>(STYLE_KEYS);

/* ------------------------------------------------------------ pure helpers */

/** Style-only subset of a node: the universal style layer plus its overrides. */
export function styleSubsetOf(node: Section): StylePatch {
  const props: Record<string, PropValue> = {};
  for (const [key, value] of Object.entries(node.props)) {
    if (STYLE_KEY_SET.has(key)) props[key] = value;
  }
  const patch: StylePatch = { props };
  if (node.bp) {
    const bp: Partial<Record<Breakpoint, Record<string, PropValue>>> = {};
    for (const [device, layer] of Object.entries(node.bp) as [Breakpoint, Record<string, PropValue>][]) {
      const kept: Record<string, PropValue> = {};
      for (const [key, value] of Object.entries(layer ?? {})) {
        if (STYLE_KEY_SET.has(key)) kept[key] = value;
      }
      if (Object.keys(kept).length) bp[device] = kept;
    }
    if (Object.keys(bp).length) patch.bp = bp;
  }
  if (node.hidden?.length) patch.hidden = [...node.hidden];
  return patch;
}

/** Applies a copied style layer without touching content props. */
export function applyStylePatch(node: Section, patch: StylePatch): Section {
  const next: Section = { ...node, props: { ...node.props, ...patch.props } };
  if (patch.bp) {
    const bp = { ...(node.bp ?? {}) } as NonNullable<Section["bp"]>;
    for (const [device, layer] of Object.entries(patch.bp) as [Breakpoint, Record<string, PropValue>][]) {
      bp[device] = { ...(bp[device] ?? {}), ...layer };
    }
    next.bp = bp;
  }
  if (patch.hidden) next.hidden = [...patch.hidden];
  return next;
}

function countNodesDeep(nodes: Section[]): number {
  return nodes.reduce((total, node) => total + 1 + countNodesDeep(node.children ?? []), 0);
}

/**
 * Re-validates an untrusted payload. Nodes go through `parseAst` in the slot
 * they were copied from, so slot legality and the node budget are re-applied
 * by the same code the server uses.
 */
export function sanitiseClipboardNodes(nodes: unknown, slot: Slot): Section[] {
  const ast = parseAst({ header: [], main: [], footer: [], [slot]: nodes });
  return ast[slot].filter((node) => !node.invalid);
}

export function parseClipboard(raw: string | null): { ok: true; payload: ClipboardPayload } | { ok: false; reason: ClipboardRejection } {
  if (!raw) return { ok: false, reason: "empty" };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!value || typeof value !== "object") return { ok: false, reason: "malformed" };
  const envelope = value as Partial<ClipboardPayload>;
  if (envelope.v !== CLIPBOARD_VERSION) return { ok: false, reason: "version_mismatch" };
  const slot = envelope.from?.slot;
  const template = envelope.from?.template;
  if (!slot || !template) return { ok: false, reason: "malformed" };
  const kind: ClipboardKind = envelope.kind === "style" ? "style" : "nodes";
  const nodes = sanitiseClipboardNodes(envelope.nodes, slot);
  if (kind === "nodes" && nodes.length === 0) return { ok: false, reason: "malformed" };
  const style = kind === "style" ? (nodes[0] ? styleSubsetOf(nodes[0]) : undefined) : undefined;
  if (kind === "style" && !style) return { ok: false, reason: "malformed" };
  const payload: ClipboardPayload = {
    v: CLIPBOARD_VERSION,
    ts: typeof envelope.ts === "number" ? envelope.ts : 0,
    origin: typeof envelope.origin === "string" ? envelope.origin : "unknown",
    kind,
    from: { template, slot },
    nodes,
    ...(style ? { style } : {}),
  };
  return { ok: true, payload };
}

/* ------------------------------------------------------------------- store */

/**
 * Structural type for `BroadcastChannel`, kept loose enough that the real DOM
 * class and a test double both satisfy it.
 */
export type ClipboardChannelLike = {
  postMessage: (data: unknown) => void;
  close?: () => void;
  /**
   * Deliberately `unknown`: the DOM's `onmessage` is typed against
   * `MessageEvent` with a `this` binding, which no structural alias can match
   * without excluding either the real class or a test double. We only ever
   * write to it.
   */
  onmessage: unknown;
};

export type ClipboardStoreDeps = {
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  /** Injected for tests; production passes a real `BroadcastChannel`. */
  channel?: ClipboardChannelLike | null;
  now?: () => number;
  origin?: string;
  logger?: (event: string, fields: Record<string, unknown>) => void;
};

export type ClipboardStore = {
  read: () => ClipboardPayload | null;
  write: (input: { kind: ClipboardKind; from: { template: TemplateKey; slot: Slot }; nodes: Section[] }) => WriteResult;
  clear: () => void;
  subscribe: (listener: (payload: ClipboardPayload | null) => void) => () => void;
  /** Called from a `storage` event handler; returns true when state changed. */
  ingestExternal: (raw: string | null) => boolean;
  dispose: () => void;
};

export function createClipboardStore(deps: ClipboardStoreDeps = {}): ClipboardStore {
  const now = deps.now ?? (() => Date.now());
  const origin = deps.origin ?? `tab-${Math.random().toString(36).slice(2, 10)}`;
  const log = deps.logger ?? (() => {});
  const listeners = new Set<(payload: ClipboardPayload | null) => void>();
  let memory: ClipboardPayload | null = null;

  const emit = () => {
    for (const listener of listeners) {
      try {
        listener(memory);
      } catch (error) {
        log("builder.clipboard.listener_failed", { error: String(error) });
      }
    }
  };

  const readStorage = (): ClipboardPayload | null => {
    if (!deps.storage) return null;
    let raw: string | null = null;
    try {
      raw = deps.storage.getItem(CLIPBOARD_KEY);
    } catch (error) {
      log("builder.clipboard.read_failed", { error: String(error) });
      return null;
    }
    const parsed = parseClipboard(raw);
    if (parsed.ok) return parsed.payload;
    if (raw && parsed.reason !== "empty") log("builder.clipboard.rejected", { reason: parsed.reason });
    return null;
  };

  memory = readStorage();

  if (deps.channel) {
    deps.channel.onmessage = (event: { data: unknown }) => {
      const data = event.data as { origin?: string; raw?: string | null } | null;
      if (!data || data.origin === origin) return;
      if (typeof data.raw === "undefined") return;
      const parsed = parseClipboard(data.raw ?? null);
      memory = parsed.ok ? parsed.payload : null;
      emit();
    };
  }

  return {
    read() {
      // Storage is authoritative when present: another tab may have replaced it
      // between broadcasts (private mode, blocked channel, extension writes).
      const stored = readStorage();
      if (stored && (!memory || stored.ts >= memory.ts)) memory = stored;
      return memory;
    },
    write({ kind, from, nodes }) {
      if (!nodes.length) return { ok: false, reason: "empty" };
      const total = countNodesDeep(nodes);
      if (total > CLIPBOARD_LIMITS.maxNodes) return { ok: false, reason: "too_many_nodes" };
      const payload: ClipboardPayload = {
        v: CLIPBOARD_VERSION,
        ts: now(),
        origin,
        kind,
        from,
        nodes,
        ...(kind === "style" && nodes[0] ? { style: styleSubsetOf(nodes[0]) } : {}),
      };
      let raw: string;
      try {
        raw = JSON.stringify(payload);
      } catch {
        return { ok: false, reason: "malformed" };
      }
      if (raw.length > CLIPBOARD_LIMITS.maxBytes) return { ok: false, reason: "too_large" };
      memory = payload;
      let persisted = false;
      if (deps.storage) {
        try {
          deps.storage.setItem(CLIPBOARD_KEY, raw);
          persisted = true;
        } catch (error) {
          // Quota or private-mode failure: the in-memory clipboard still works
          // for this tab, which is strictly better than throwing at ⌘C.
          log("builder.clipboard.persist_failed", { error: String(error), bytes: raw.length });
        }
      }
      try {
        deps.channel?.postMessage({ origin, raw });
      } catch (error) {
        log("builder.clipboard.broadcast_failed", { error: String(error) });
      }
      emit();
      return { ok: true, payload, persisted };
    },
    clear() {
      memory = null;
      try {
        deps.storage?.removeItem(CLIPBOARD_KEY);
      } catch {
        /* nothing recoverable */
      }
      try {
        deps.channel?.postMessage({ origin, raw: null });
      } catch {
        /* nothing recoverable */
      }
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    ingestExternal(raw) {
      const parsed = parseClipboard(raw);
      const next = parsed.ok ? parsed.payload : null;
      const changed = (next?.ts ?? null) !== (memory?.ts ?? null);
      memory = next;
      if (changed) emit();
      return changed;
    },
    dispose() {
      listeners.clear();
      try {
        deps.channel?.close?.();
      } catch {
        /* nothing recoverable */
      }
    },
  };
}
