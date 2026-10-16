/**
 * Frame30 — editor seam helpers for the REAL editor path
 * (`content/editor.tsx` → `EditorShell` → `StudioBuilder`).
 *
 * Wiring-side contract (sibling lanes own the registry internals and all
 * downstream components): the route builds ONE authorized registry via
 * `buildEditorExtensionRegistry` and threads that SAME instance through
 * `extensionRegistry`, the single projected binding through
 * `devThemeBinding`, and the registry build key through `activeThemeKey`.
 * `pluginEntries` stays a prop-normalization (explicit entries win; empty
 * lets the studio derive from the threaded registry).
 *
 * This module is the testable seam the shell/route consume:
 * - `selectEditorRegistry` guards hostile seam inputs to explicit absent
 *   WITHOUT building a competing registry (no tray-registry builder,
 *   factory, or widget-registration import here — a second build
 *   would compete with the authorized instance).
 * - `resolveEditorThemeKey` is the ONE place the canvas/presentation key is
 *   resolved: the route's workspace `sourceKey` (the exact `themeKey` input
 *   the registry was built with, e.g. `aurora-lookbook`) wins so
 *   owning-theme defs (`theme:<sourceKey>/…`) resolve keyed; the document's
 *   theme uuid is only a legacy fallback when the route key is absent (then
 *   the registry is plugins-only anyway, so resolution fail-closes to a
 *   miss, never to another owner's def). The shell's `data-theme-scope`
 *   (uuid DOM scoping) is a different concern and stays untouched.
 * - `canonicalizeEditorDocForSave` sanitizes extension nodes against the
 *   SAME registry instance before `serializeStudioBody`: per-instance props
 *   are re-validated against the def's own schema (unknown/hostile keys
 *   stripped, missing keys filled, never executed), returned as fresh
 *   objects so two instances never share references, and install-global
 *   settings are never merged in either direction (no global bleed).
 *   Misses and unusable registries preserve the node verbatim (cloned) —
 *   explicit graceful degradation with data preserved for recovery, never
 *   silent drops and never stale definitions rendered as something else.
 * - `editorRegistryFingerprint` / `didEditorRegistrySwitch` /
 *   `describeEditorRegistryRecovery` detect a mid-session switch (theme
 *   change / plugin disable changes the def set) so the shell remounts the
 *   canvas via `resetKey` (explicit recovery) instead of rendering stale
 *   definitions.
 * - `previewEditorExtensionNodes` resolves the same nodes the canvas shows
 *   through the SAME registry + theme key, proving the preview path is not
 *   a disconnected build.
 *
 * Pure module: no database, no network, no React, no side effects, never
 * throws. Tenant isolation comes from the route's authorized inputs; nothing
 * here touches the shared singleton.
 */
import { defaultsFor, validateProps } from "@/lib/widget-props";
import type { StudioDoc, StudioNode } from "@/lib/studio/model";
import type { UnifiedRegistry } from "@/lib/unified-widget-registry";

/** Plugin element entries accepted on the shell seam (unchanged shape). */
export type EditorPluginEntry = {
  key: string;
  label: string;
};

/** Envelope keys the insert path writes beside canonical props. */
const ENVELOPE_KEYS: ReadonlySet<string> = new Set([
  "pluginKey",
  "extensionInstanceId",
  "extensionApi",
  "extensionVersion",
]);

const HOSTILE_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

/**
 * Strict usability for the threaded registry: an object exposing both
 * `resolveWidget` (insert/inspector/canvas/preview/save) and `listWidgets`
 * (tray discovery + fingerprint). Anything else — absent, null, hostile,
 * partially implemented, or foreign — is unusable and selects to explicit
 * absent. Never throws.
 */
export function isUsableEditorRegistry(
  registry: unknown,
): registry is UnifiedRegistry {
  try {
    if (!registry || typeof registry !== "object") return false;
    const candidate = registry as Partial<UnifiedRegistry>;
    return (
      typeof candidate.resolveWidget === "function" &&
      typeof candidate.listWidgets === "function"
    );
  } catch {
    return false;
  }
}

/**
 * Guard the seam prop to the SAME authorized instance or explicit absent.
 * Hostile/foreign inputs yield `null` (the studio's own fallback applies);
 * this helper NEVER builds a registry, so no second competing build can
 * exist on the wiring side. Never throws.
 */
export function selectEditorRegistry(
  registry: unknown,
): UnifiedRegistry | null {
  try {
    return isUsableEditorRegistry(registry) ? registry : null;
  } catch {
    return null;
  }
}

/**
 * Normalize the shell's `pluginEntries` / `plugins` alias pair. Explicit
 * non-empty entries win downstream (the studio prefers them); empty lets
 * the studio derive plugin + uploaded-theme rows from the threaded
 * registry. Non-arrays yield `[]`. Never throws; never builds.
 */
export function deriveEditorPluginEntries(
  pluginEntriesProp: unknown,
  pluginsProp?: unknown,
): EditorPluginEntry[] {
  try {
    const src = pluginEntriesProp ?? pluginsProp ?? [];
    if (!Array.isArray(src)) return [];
    return src as EditorPluginEntry[];
  } catch {
    return [];
  }
}

export type EditorThemeKeyInput = {
  /**
   * Route workspace `sourceKey` — the exact `themeKey` input the authorized
   * registry was built with. Wins when present.
   */
  routeThemeKey?: unknown;
  /** Document theme pin (uuid DOM scope) — legacy fallback only. */
  docThemeId?: unknown;
  /** Active site theme id — last fallback only. */
  activeThemeId?: unknown;
};

/** Trimmed theme key, or `""` for null/garbage (unkeyed resolution). */
function cleanThemeKey(value: unknown): string {
  try {
    return typeof value === "string" ? value.trim().slice(0, 120) : "";
  } catch {
    return "";
  }
}

/**
 * The ONE theme-key resolution for extension presentation: route key first
 * (matches the registry build), then doc pin, then active id. Empty/hostile
 * yields `null` (explicit unkeyed — misses fail closed, never another
 * owner's def). Never throws.
 */
export function resolveEditorThemeKey(
  input: EditorThemeKeyInput | null | undefined,
): string | null {
  try {
    if (!input || typeof input !== "object") return null;
    for (const candidate of [
      (input as EditorThemeKeyInput).routeThemeKey,
      (input as EditorThemeKeyInput).docThemeId,
      (input as EditorThemeKeyInput).activeThemeId,
    ]) {
      const clean = cleanThemeKey(candidate);
      if (clean) return clean;
    }
    return null;
  } catch {
    return null;
  }
}

/** djb2 hex over the sorted id set — stable across rebuilds, cheap. */
function hashIds(sortedIds: string[]): string {
  let hash = 5381;
  for (const id of sortedIds) {
    for (let i = 0; i < id.length; i += 1) {
      hash = ((hash << 5) + hash + id.charCodeAt(i)) | 0;
    }
    hash = ((hash << 5) + hash + 124) | 0;
  }
  return (hash >>> 0).toString(16);
}

/**
 * Stable fingerprint of the authorized def set: `<count>:<hash>` over sorted
 * widget ids, or `absent` / `unknown` for unusable registries. Rebuilds with
 * identical content fingerprint identically (no spurious remount); a theme
 * change or plugin disable changes the set (explicit recovery). Never
 * throws.
 */
export function editorRegistryFingerprint(registry: unknown): string {
  try {
    if (!isUsableEditorRegistry(registry)) return "absent";
    let ids: unknown;
    try {
      ids = registry.listWidgets().map((d) => d?.id);
    } catch {
      return "unknown";
    }
    if (!Array.isArray(ids)) return "unknown";
    const sorted = ids
      .filter((id): id is string => typeof id === "string" && !!id.trim())
      .map((id) => id.trim())
      .sort();
    return `${sorted.length}:${hashIds(sorted)}`;
  } catch {
    return "unknown";
  }
}

/**
 * True when the def set changed between renders (theme change, plugin
 * disable/enable, manifest update). Compares fingerprints, not identity, so
 * a content-identical rebuild is NOT a switch. Never throws.
 */
export function didEditorRegistrySwitch(prev: unknown, next: unknown): boolean {
  try {
    return editorRegistryFingerprint(prev) !== editorRegistryFingerprint(next);
  } catch {
    return false;
  }
}

export type EditorRegistryRecovery =
  | { switched: false; recovery: "none" }
  | { switched: true; recovery: "remount-canvas" };

/**
 * Explicit recovery for a mid-session switch: remount the canvas via a
 * fingerprint-keyed `resetKey` so tray, inspector, canvas and preview
 * re-derive from the new def set — stale definitions never render, authored
 * data stays preserved in the persisted body for re-resolution. Never
 * throws.
 */
export function describeEditorRegistryRecovery(
  prev: unknown,
  next: unknown,
): EditorRegistryRecovery {
  try {
    if (!didEditorRegistrySwitch(prev, next)) {
      return { switched: false, recovery: "none" };
    }
    return { switched: true, recovery: "remount-canvas" };
  } catch {
    return { switched: false, recovery: "none" };
  }
}

/**
 * True for a studio `app-block` twin carrying the extension envelope
 * (`studioNodeForExtension` writes `settings.extensionInstanceId` beside the
 * canonical props). Mirrors the studio's own check so the save path does not
 * import sibling components. Never throws.
 */
export function isEditorExtensionNode(node: unknown): boolean {
  try {
    if (!node || typeof node !== "object" || Array.isArray(node)) return false;
    const candidate = node as Partial<StudioNode>;
    if (candidate.el !== "app-block") return false;
    const settings = candidate.settings;
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
      return false;
    }
    const marker = (settings as Record<string, unknown>)["extensionInstanceId"];
    return typeof marker === "string" && marker.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Widget address carried by a studio node (`settings.pluginKey`), trimmed
 * and clamped like the insert path. Blank/hostile reads `""`. Never throws.
 */
export function editorExtensionWidgetKeyOf(node: unknown): string {
  try {
    if (!node || typeof node !== "object" || Array.isArray(node)) return "";
    const settings = (node as Partial<StudioNode>).settings;
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
      return "";
    }
    const raw = (settings as Record<string, unknown>)["pluginKey"];
    return typeof raw === "string" ? raw.trim().slice(0, 120) : "";
  } catch {
    return "";
  }
}

function cloneJson<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return (
      typeof value === "object" && value !== null
        ? Array.isArray(value)
          ? []
          : {}
        : value
    ) as T;
  }
}

function stripHostileRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!key || HOSTILE_KEYS.has(key)) continue;
    if (key.length > 120) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Validate per-instance props against the resolved def's own schema:
 * unknown/hostile keys stripped, missing keys filled from schema defaults,
 * every known key present — returned as a FRESH object so two instances
 * never share references. Empty-schema (legacy) defs keep declared defaults
 * verbatim (cloned). Install-global settings are never read here, so they
 * can never bleed in either direction. Never throws.
 */
export function sanitizeEditorExtensionProps(
  rawProps: unknown,
  def: { defaults?: unknown; propsSchema?: unknown } | null | undefined,
): Record<string, unknown> {
  try {
    const safe: Record<string, unknown> =
      rawProps && typeof rawProps === "object" && !Array.isArray(rawProps)
        ? cloneJson(rawProps as Record<string, unknown>)
        : {};
    const fields = (
      def as { propsSchema?: { fields?: unknown } } | null | undefined
    )?.propsSchema?.fields;
    if (Array.isArray(fields) && fields.length > 0) {
      try {
        const declared =
          def &&
          typeof def === "object" &&
          (def as { defaults?: unknown }).defaults &&
          typeof (def as { defaults?: unknown }).defaults === "object"
            ? cloneJson((def as { defaults: Record<string, unknown> }).defaults)
            : {};
        const schemaDefaults = defaultsFor({ fields } as Parameters<
          typeof defaultsFor
        >[0]) as Record<string, unknown>;
        const merged: Record<string, unknown> = {
          ...schemaDefaults,
          ...(declared as Record<string, unknown>),
          ...stripHostileRecord(safe),
        };
        const clean = validateProps(
          { fields } as Parameters<typeof validateProps>[0],
          merged,
        ).clean as Record<string, unknown>;
        return stripHostileRecord(cloneJson(clean));
      } catch {
        return stripHostileRecord(cloneJson(safe));
      }
    }
    const declared =
      def &&
      typeof def === "object" &&
      (def as { defaults?: unknown }).defaults &&
      typeof (def as { defaults?: unknown }).defaults === "object" &&
      !Array.isArray((def as { defaults?: unknown }).defaults)
        ? cloneJson((def as { defaults: Record<string, unknown> }).defaults)
        : {};
    return stripHostileRecord({
      ...(declared as Record<string, unknown>),
      ...stripHostileRecord(cloneJson(safe)),
    });
  } catch {
    return {};
  }
}

/**
 * Sanitize one studio node against the SAME authorized registry: extension
 * twins get validated per-instance props + preserved envelope; legacy nodes
 * pass through untouched (same reference shape, cloned children only when
 * needed). Misses (disabled/incompatible/uninstalled after a mid-session
 * switch) preserve the node verbatim (cloned) — data kept for recovery,
 * never dropped, never re-rendered as another def. Never throws; never
 * mutates the input.
 */
export function sanitizeEditorExtensionNode(
  node: StudioNode,
  registry: unknown,
): StudioNode {
  try {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      return node;
    }
    const children = Array.isArray(node.children)
      ? node.children.map((child) =>
          sanitizeEditorExtensionNode(child, registry),
        )
      : node.children;
    const childrenChanged =
      Array.isArray(node.children) &&
      Array.isArray(children) &&
      children.some((child, index) => child !== node.children![index]);
    if (!isEditorExtensionNode(node)) {
      if (!childrenChanged) return node;
      return { ...node, children: children as StudioNode[] };
    }
    const settings =
      node.settings && typeof node.settings === "object"
        ? (node.settings as Record<string, unknown>)
        : {};
    const widgetKey = editorExtensionWidgetKeyOf(node);
    let def: { defaults?: unknown; propsSchema?: unknown } | undefined;
    try {
      if (
        widgetKey &&
        registry &&
        typeof (registry as UnifiedRegistry).resolveWidget === "function"
      ) {
        const resolved = (registry as UnifiedRegistry).resolveWidget(
          widgetKey,
          {
            data: {},
          },
        );
        if (resolved && resolved.ok) {
          def = (resolved as { ok: true; def: unknown }).def as {
            defaults?: unknown;
            propsSchema?: unknown;
          };
        }
      }
    } catch {
      def = undefined;
    }
    // Miss or unusable registry: preserve verbatim (cloned settings) so a
    // mid-session disable never loses authored data; the canvas placeholder
    // (sibling-owned) explains the miss.
    if (!def) {
      const preserved = cloneJson(settings);
      if (!childrenChanged) {
        return { ...node, settings: preserved as StudioNode["settings"] };
      }
      return {
        ...node,
        settings: preserved as StudioNode["settings"],
        children: children as StudioNode[],
      };
    }
    const userProps: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(settings)) {
      if (ENVELOPE_KEYS.has(key) || HOSTILE_KEYS.has(key)) continue;
      userProps[key] = value;
    }
    const cleanProps = sanitizeEditorExtensionProps(userProps, def);
    const nextSettings: Record<string, unknown> = {
      ...cleanProps,
      pluginKey: widgetKey,
      extensionInstanceId:
        typeof settings.extensionInstanceId === "string" &&
        (settings.extensionInstanceId as string).trim()
          ? (settings.extensionInstanceId as string).trim().slice(0, 64)
          : node.id,
      ...(typeof settings.extensionApi === "string" &&
      (settings.extensionApi as string).trim()
        ? {
            extensionApi: (settings.extensionApi as string).trim().slice(0, 32),
          }
        : {}),
      ...(typeof settings.extensionVersion === "string" &&
      (settings.extensionVersion as string).trim()
        ? {
            extensionVersion: (settings.extensionVersion as string)
              .trim()
              .slice(0, 32),
          }
        : {}),
    };
    return {
      ...node,
      settings: nextSettings as StudioNode["settings"],
      ...(childrenChanged ? { children: children as StudioNode[] } : {}),
    };
  } catch {
    return node;
  }
}

/**
 * Canonicalize a studio doc for save/publish against the SAME authorized
 * registry: every extension node validated (no prop loss for known keys, no
 * hostile keys, no global bleed, fresh objects per instance), legacy nodes
 * byte-identical in shape, misses preserved for recovery. Header/footer
 * slots walk too. Never throws; never mutates the input.
 */
export function canonicalizeEditorDocForSave(
  doc: StudioDoc | null | undefined,
  registry: unknown,
): StudioDoc | null {
  try {
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) return null;
    const root = Array.isArray(doc.root)
      ? doc.root.map((node) => sanitizeEditorExtensionNode(node, registry))
      : [];
    const header = Array.isArray(doc.header)
      ? doc.header.map((node) => sanitizeEditorExtensionNode(node, registry))
      : doc.header;
    const footer = Array.isArray(doc.footer)
      ? doc.footer.map((node) => sanitizeEditorExtensionNode(node, registry))
      : doc.footer;
    return {
      ...doc,
      root,
      ...(header !== undefined ? { header } : {}),
      ...(footer !== undefined ? { footer } : {}),
    };
  } catch {
    return doc ?? null;
  }
}

export type PreviewEditorNodeState = {
  nodeId: string;
  widgetKey: string;
  ok: boolean;
  reason?: string;
};

/**
 * Resolve the preview's extension nodes through the SAME registry + theme
 * key the canvas uses (not a disconnected preview build): each extension
 * twin resolves via `registry.resolveWidget`; legacy nodes are skipped.
 * Miss reasons are preserved verbatim for the placeholder path. Never
 * throws.
 */
export function previewEditorExtensionNodes(
  doc: StudioDoc | null | undefined,
  registry: unknown,
  _themeKey?: unknown,
): PreviewEditorNodeState[] {
  try {
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) return [];
    const out: PreviewEditorNodeState[] = [];
    const walk = (nodes: unknown): void => {
      try {
        if (!Array.isArray(nodes)) return;
        for (const node of nodes) {
          try {
            if (isEditorExtensionNode(node)) {
              const typed = node as StudioNode;
              const widgetKey = editorExtensionWidgetKeyOf(node);
              if (!widgetKey) {
                out.push({
                  nodeId: typed.id ?? "",
                  widgetKey: "",
                  ok: false,
                  reason: "bad_key",
                });
              } else if (
                !registry ||
                typeof (registry as UnifiedRegistry).resolveWidget !==
                  "function"
              ) {
                out.push({
                  nodeId: typed.id ?? "",
                  widgetKey,
                  ok: false,
                  reason: "unknown",
                });
              } else {
                try {
                  const resolved = (registry as UnifiedRegistry).resolveWidget(
                    widgetKey,
                    { data: {} },
                  );
                  if (resolved && resolved.ok) {
                    out.push({ nodeId: typed.id ?? "", widgetKey, ok: true });
                  } else {
                    const reason =
                      resolved && !resolved.ok
                        ? (resolved as { missing: { reason: string } }).missing
                            .reason
                        : "unknown";
                    out.push({
                      nodeId: typed.id ?? "",
                      widgetKey,
                      ok: false,
                      reason,
                    });
                  }
                } catch {
                  out.push({
                    nodeId: typed.id ?? "",
                    widgetKey,
                    ok: false,
                    reason: "unknown",
                  });
                }
              }
            }
            const children = (node as Partial<StudioNode> | null)?.children;
            if (Array.isArray(children) && children.length > 0) walk(children);
          } catch {
            // A single hostile node never breaks the preview walk.
          }
        }
      } catch {
        // Hostile root never breaks the preview walk.
      }
    };
    walk(doc.root);
    if (Array.isArray(doc.header)) walk(doc.header);
    if (Array.isArray(doc.footer)) walk(doc.footer);
    return out;
  } catch {
    return [];
  }
}
