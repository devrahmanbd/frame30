/**
 * Phase 14 — the builder shell.
 *
 * Top bar · left panel (elements ⇄ settings) · device-framed canvas ·
 * floating structure panel · modals. Keyboard shortcuts are bound once here.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DEVICE_PRESETS } from "@/lib/responsive";
import { useStudio } from "@/lib/studio/useStudio";
import {
  detectStudioPlatform,
  isTypingElement,
  matchStudioShortcut,
  resolveStudioShortcutId,
  type StudioPlatform,
  type StudioShortcutId,
} from "@/lib/studio/shortcuts";
import { BREAKPOINT_BY_KEY, type DeviceKey } from "@/lib/studio/responsive";
import {
  cloneNode,
  findNode,
  flatten,
  parentOf,
  siblingsOf,
  updateNode,
  type DropTarget,
} from "@/lib/studio/tree";
import { newWidgetNode, widgetLabel } from "@/lib/studio/catalog";
import {
  isContainerNode,
  resolveStudioSlots,
  studioSlots,
  uid,
  withSlot,
  type StudioDoc,
  type StudioMenuSource,
  type StudioNode,
  type StudioSlot,
} from "@/lib/studio/model";
import {
  appBlockNodeForPlugin,
  buildExtensionInsert,
  studioNodeForExtension,
  type PluginTrayEntry,
} from "./plugin-tray";
import {
  createWidgetRegistry,
  fromBuiltinWidgets,
  fromStudioCatalog,
  listWidgets as listSingletonWidgets,
  type UnifiedRegistry,
  type WidgetDef,
} from "@/lib/unified-widget-registry";
import type { DevThemeBinding } from "../SectionRenderer";
import { ownerForWidgetKey } from "@/lib/builder-ast";
import {
  isExtensionTwin as isLifecycleTwin,
  normalizeDocForSave as normalizeLifecycleDoc,
  refreshPastedTwins as refreshLifecyclePaste,
  withFreshTwinIdentity as freshLifecycleIdentity,
} from "@/lib/studio/extension-lifecycle";

/**
 * Plugin element accepted on the seam. `pluginName` stays optional so both
 * shapes fit: the shell's minimal `{ key, label }` entries and the full
 * `PluginTrayEntry` rows from `plugin-tray.ts`.
 */
export type StudioBuilderPluginEntry = Pick<
  PluginTrayEntry,
  "key" | "label"
> & {
  pluginName?: string;
  /**
   * `resolvePluginWidget` failure reason for this widget key. Shown inline
   * in the Elements Plugins group so a merchant can tell a disabled plugin
   * from an incompatible one. Absent = usable (legacy entries stay
   * byte-identical). Display-only: no install/update pipeline reads this.
   */
  resolveReason?:
    | "bad_key"
    | "not_installed"
    | "unknown_widget"
    | "incompatible"
    | "disabled"
    | "suspended";
  /**
   * Pinned widget version (`plugin_state.version_pin`). Absent/null tracks
   * the registry latest. Display-only.
   */
  versionPin?: string | null;
  /**
   * Per-install auto-updates flag (`plugin_state.auto_updates`). Absent =
   * unknown (nothing rendered). Display-only: the toggle lives in the
   * plugin manager, never here.
   */
  autoUpdates?: boolean;
  /** Deep-link to the host's update flow for this entry, when offered. */
  updateHref?: string;
  /** Deep-link to the host's enable flow for this entry, when offered. */
  enableHref?: string;
};
import {
  builtInTemplates,
  instantiate,
  loadMyTemplates,
  persistMyTemplates,
  saveAsTemplate,
  importTemplateJson,
  type StudioTemplate,
} from "@/lib/studio/templates";
import type { RevisionEntry } from "@/lib/studio/history";
import {
  AUTOSAVE_DEBOUNCE_MS,
  clearDraft,
  draftAgeLabel,
  recoverableDraft,
  writeDraft,
  type StudioDraft,
} from "@/lib/studio/autosave";

import { NodeContextMenu, type MenuItem } from "../NodeContextMenu";
import { ClassManagerDialog } from "./ClassManagerDialog";
import { StudioTopBar } from "./StudioTopBar";
import { ElementsPanel } from "./ElementsPanel";
import { SettingsPanel } from "./SettingsPanel";
import { StructurePanel } from "./StructurePanel";
import { StudioCanvas } from "./StudioCanvas";
import {
  FinderDialog,
  HistoryDialog,
  LayoutPickerDialog,
  PageSettingsDialog,
  ShortcutsDialog,
  TemplatesDialog,
} from "./StudioModals";

const CANVAS_WIDTH: Record<DeviceKey, string> = {
  widescreen: "100%",
  desktop: "100%",
  laptop: "1200px",
  tablet: "768px",
  mobileLandscape: "880px",
  mobile: "390px",
};

export type StudioBuilderProps = {
  doc: StudioDoc;
  onChange: (doc: StudioDoc) => void;
  onPublish?: (doc: StudioDoc) => void | Promise<void>;
  onExit?: () => void;
  revisions?: RevisionEntry[];
  saving?: boolean;
  /**
   * Identifies this document for local autosave. Omit it (or pass null) and
   * crash recovery is off — never keyed on something that can collide across
   * two documents.
   */
  docId?: string | null;
  /**
   * Full-window (Elementor-style) chrome: no card border or fixed viewport
   * height — the builder fills whatever the host gives it. Hosts that embed
   * the studio inside their own takeover pass this.
   */
  fill?: boolean;
  /**
   * Identity of the server document currently shown (e.g. `id:updatedAt`).
   * When it changes while the canvas is pristine, the studio adopts the new
   * `doc` prop — this covers content that resolves after mount. Edits in
   * progress are never clobbered. Omit for uncontrolled (mount-once) use.
   */
  resetKey?: string | null;
  /**
   * Shared (global) blocks for the Globals tab. The default `copy` insert
   * clones with fresh ids, so placing the same block twice never collides
   * and edits stay local to this page; the opt-in `linked` insert places a
   * `global_ref` pointer instead, so block edits update every placement
   * (resolved live via `resolveGlobalRef` at render-data time).
   */
  globalBlocks?: { id: string; name: string; nodes: StudioNode[] }[];
  /**
   * Persist the selected subtree as a theme global block (reverse of the
   * insert path above). The host owns the RPC; the name defaults to the
   * node's name or element label. Shown in the node context menu when set.
   */
  onSaveGlobalBlock?: ((name: string, nodes: StudioNode[]) => void) | null;
  /**
   * Extra left-panel tab rendered beside Elements when nothing is selected
   * (e.g. the host's SEO panel). A host-provided React node; the studio only
   * owns the tab strip.
   */
  sideTab?: { id: string; label: string; content: ReactNode } | null;
  /**
   * Real menus for the widget→menu binding (`settings.menuId`). Threaded
   * through the canvas into each widget renderer; bound navigation widgets
   * preview the resolved menu, everything else falls back to manual items.
   * Accepts the shell's spread until every caller provides it.
   */
  menus?: readonly StudioMenuSource[] | null;
  /**
   * Theme chrome for slot resolution. When present, the header/footer tabs
   * resolve page overrides against the theme studio's chrome (theme wins
   * when it has content); absent behaves exactly as before.
   */
  themeDoc?: Pick<StudioDoc, "root" | "header" | "footer"> | null;
  /**
   * Working restore for the History dialog's revisions tab (the shell owns
   * the RPC). Falls back to the informational toast when unset.
   */
  onRestoreRevision?: ((revisionId: string) => void) | null;
  /**
   * Plugin-contributed elements for the Elements rail. The shell spreads
   * these (its `StudioPluginEntry`) alongside its own restore callback;
   * entries render as an install-free Plugins group that inserts an
   * `app-block` node pre-pointed at the namespaced widget key.
   */
  pluginEntries?: readonly StudioBuilderPluginEntry[] | null;
  /**
   * Frame30 extension registry for `addPluginNode`. Absent builds the
   * builtin + studio + singleton fallback, so legacy callers stay
   * byte-identical; registry misses keep the `app-block` fallback.
   */
  extensionRegistry?: UnifiedRegistry | null;
  /**
   * Frame30 one-registry — server-projected Level B runtime binding for the
   * active approved theme. Absent keeps uploaded-theme canvas rendering
   * fail-closed (explicit placeholder). Arrives via `studioSeamProps`.
   */
  devThemeBinding?: DevThemeBinding | null;
  /**
   * Active theme key driving per-theme canvas resolution. Absent keeps the
   * legacy unkeyed composition. Arrives via `studioSeamProps`.
   */
  activeThemeKey?: string | null;
};

/** Elements panel shared by the plain and tabbed left-panel layouts. */
function ElementsPanelInner({
  studio,
  templates,
  dragWidget,
  globals,
  onInsertGlobal,
  globalInsertMode,
  onGlobalInsertMode,
  addParent,
  pluginEntries,
  onAddPlugin,
}: {
  studio: ReturnType<typeof useStudio>;
  templates: StudioTemplate[];
  dragWidget: { current: string | null };
  globals: { id: string; name: string }[];
  onInsertGlobal: (id: string, mode?: GlobalInsertMode) => void;
  /** Globals-tab insert behaviour; `copy` (default) never surprises. */
  globalInsertMode: GlobalInsertMode;
  onGlobalInsertMode: (mode: GlobalInsertMode) => void;
  /** Container-scoped add: widget clicks land inside this node when set. */
  addParent?: string | null;
  pluginEntries?: readonly StudioBuilderPluginEntry[];
  onAddPlugin?: (key: string) => void;
}) {
  return (
    <>
      {globals.length > 0 && (
        <div
          role="group"
          aria-label="Global insert mode"
          className="flex items-center gap-1 border-b border-border px-3 py-2"
        >
          <span className="mr-auto text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Global insert
          </span>
          {(["copy", "linked"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={globalInsertMode === mode}
              title={
                mode === "copy"
                  ? "Insert an editable copy (edits stay on this page)"
                  : "Insert a linked reference (edits update everywhere)"
              }
              onClick={() => onGlobalInsertMode(mode)}
              className={
                globalInsertMode === mode
                  ? "min-h-9 rounded-fq-sm bg-primary px-2 text-xs font-medium text-primary-foreground"
                  : "min-h-9 rounded-fq-sm px-2 text-xs text-muted-foreground hover:text-foreground"
              }
            >
              {mode === "copy" ? "Copy" : "Linked"}
            </button>
          ))}
        </div>
      )}
      <ElementsPanel
        onAdd={(key) =>
          studio.addWidget(
            key,
            addParent ? { id: addParent, position: "inside" } : undefined,
          )
        }
        onDragWidget={(key) => {
          dragWidget.current = key;
        }}
        savedBlocks={templates
          .filter((t) => t.kind === "mine")
          .map((t) => ({ id: t.id, name: t.name }))}
        onInsertSaved={(id) => {
          const template = templates.find((t) => t.id === id);
          if (template)
            // Fresh-identity import (frame30): template payloads carry stale
            // twin envelopes (copied verbatim by `instantiate`); re-pin every
            // import to its own new ids so two inserts never share one
            // instance. Legacy nodes keep the plain result byte-identical.
            instantiate(template).forEach((node) => {
              try {
                studio.addNode(duplicateExtensionStudioNode(node));
              } catch {
                studio.addNode(node);
              }
            });
        }}
        globals={globals}
        onInsertGlobal={onInsertGlobal}
      />
      {pluginEntries && pluginEntries.length > 0 && onAddPlugin && (
        <div className="border-t border-border p-3">
          <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Plugins
          </p>
          <div className="flex flex-col gap-1.5">
            {pluginEntries.map((entry) => {
              const status = pluginEntryStatus(entry);
              if (!status) {
                return (
                  <button
                    key={entry.key}
                    type="button"
                    onClick={() => onAddPlugin(entry.key)}
                    title={
                      entry.pluginName
                        ? `${entry.label} — ${entry.pluginName}`
                        : entry.label
                    }
                    className="min-h-11 rounded-fq-md border border-border px-3 text-left text-sm hover:border-primary"
                  >
                    <span className="block truncate">{entry.label}</span>
                    {entry.pluginName && (
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {entry.pluginName}
                      </span>
                    )}
                  </button>
                );
              }
              return (
                <div
                  key={entry.key}
                  className="rounded-fq-md border border-border px-3 py-2"
                >
                  <button
                    type="button"
                    onClick={() => onAddPlugin(entry.key)}
                    title={
                      entry.pluginName
                        ? `${entry.label} — ${entry.pluginName}`
                        : entry.label
                    }
                    className="block w-full text-left"
                  >
                    <span className="block truncate text-sm">
                      {entry.label}
                    </span>
                    {entry.pluginName && (
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {entry.pluginName}
                      </span>
                    )}
                  </button>
                  <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                    {status.reasonLabel && <p>{status.reasonLabel}</p>}
                    {status.pinLabel && <p>{status.pinLabel}</p>}
                    {status.autoLabel && <p>{status.autoLabel}</p>}
                    {(status.updateHref || status.enableHref) && (
                      <p className="flex gap-3">
                        {status.updateHref && (
                          <a
                            href={status.updateHref}
                            className="font-medium text-primary hover:underline"
                          >
                            Update
                          </a>
                        )}
                        {status.enableHref && (
                          <a
                            href={status.enableHref}
                            className="font-medium text-primary hover:underline"
                          >
                            Enable
                          </a>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

/* ---------------- interaction helpers (unit-tested) ----------------
 *
 * Pure selection/multi-select/shortcut-dispatch helpers shared by the
 * keyboard handler and the canvas. Kept outside the component so the
 * contract test drives them without rendering.
 */

export type StudioSelectionMode = "replace" | "toggle";

/** Old-builder `select` semantics: replace by default, toggle with mod. */
export function applySelection(
  current: readonly string[],
  id: string | null,
  mode: StudioSelectionMode,
): string[] {
  if (mode === "toggle" && id !== null) {
    return current.includes(id)
      ? current.filter((value) => value !== id)
      : [...current, id];
  }
  return id === null ? [] : [id];
}

function collectDescendantIds(node: StudioNode, out: Set<string>): void {
  for (const child of node.children ?? []) {
    out.add(child.id);
    collectDescendantIds(child, out);
  }
}

/**
 * Old-builder `topMost` semantics: drop any selected id nested under another
 * selected id so bulk ops never move/copy/delete one subtree twice. Order
 * follows document order.
 */
export function topMostStudioIds(
  root: StudioNode[],
  ids: readonly string[],
): string[] {
  if (ids.length === 0) return [];
  const wanted = new Set(ids);
  const covered = new Set<string>();
  const visit = (nodes: StudioNode[]): void => {
    for (const node of nodes) {
      if (wanted.has(node.id)) collectDescendantIds(node, covered);
      if (node.children) visit(node.children);
    }
  };
  visit(root);
  return flatten(root)
    .filter((entry) => wanted.has(entry.node.id) && !covered.has(entry.node.id))
    .map((entry) => entry.node.id);
}

/**
 * Reorder helper behind `move_up`/`move_down`: swaps the node with the
 * sibling before/after it, staying inside its own sibling list. Clamped at
 * the edges (same order back) and identity-stable for unknown ids.
 */
export function nudgeStudioNodes(
  root: StudioNode[],
  id: string,
  delta: number,
): StudioNode[] {
  const step = delta < 0 ? -1 : 1;
  const parent = parentOf(root, id);
  const siblings = parent ? (parent.children ?? []) : root;
  const index = siblings.findIndex((node) => node.id === id);
  if (index < 0) return root;
  const next = index + step;
  if (next < 0 || next >= siblings.length) return root;
  const reordered = [...siblings];
  const [moved] = reordered.splice(index, 1);
  if (!moved) return root;
  reordered.splice(next, 0, moved);
  if (!parent) return reordered;
  return updateNode(root, parent.id, (current) => ({
    ...current,
    children: reordered,
  }));
}

/** Handlers behind every studio shortcut; boolean results mean "handled". */
export type StudioShortcutContext = {
  hasSelection: boolean;
  selectedIds: string[];
  undo: () => boolean | void;
  redo: () => boolean | void;
  copy: () => boolean | void;
  paste: () => boolean | void;
  duplicate: () => boolean | void;
  remove: () => boolean | void;
  pasteStyle: () => boolean | void;
  resetStyle: () => boolean | void;
  saveDraft: () => boolean | void;
  publish: () => boolean | void;
  togglePreview: () => boolean | void;
  toggleStructure: () => boolean | void;
  openModal: (name: string) => void;
  nudge: (delta: -1 | 1) => boolean | void;
  deselect: () => void;
  searchLayers: () => void;
};

/**
 * Dispatches one shortcut id, accepting the legacy `paste_style` spelling.
 * Returns false for unknown ids and for handlers that report `false` (e.g.
 * copy with nothing selected) so the caller can skip `preventDefault` and
 * leave the browser's native binding alone.
 */
export function runStudioShortcut(
  id: string,
  ctx: StudioShortcutContext,
): boolean {
  const resolved: StudioShortcutId | undefined = resolveStudioShortcutId(id);
  if (!resolved) return false;
  const done = (result: boolean | void): boolean => result !== false;
  switch (resolved) {
    case "undo":
      return done(ctx.undo());
    case "redo":
      return done(ctx.redo());
    case "copy":
      return done(ctx.copy());
    case "paste":
      return done(ctx.paste());
    case "duplicate":
      return done(ctx.duplicate());
    case "delete":
      return done(ctx.remove());
    case "pasteStyle":
      return done(ctx.pasteStyle());
    case "resetStyle":
      return done(ctx.resetStyle());
    case "save":
      return done(ctx.saveDraft());
    case "publish":
      return done(ctx.publish());
    case "preview":
    case "hideHandles":
      return done(ctx.togglePreview());
    case "navigator":
      return done(ctx.toggleStructure());
    case "move_up":
      return done(ctx.nudge(-1));
    case "move_down":
      return done(ctx.nudge(1));
    case "deselect":
      ctx.deselect();
      return true;
    case "search_layers":
      ctx.searchLayers();
      return true;
    case "finder":
      ctx.openModal("finder");
      return true;
    case "templates":
      ctx.openModal("templates");
      return true;
    case "pageSettings":
      ctx.openModal("page");
      return true;
    case "siteSettings":
      ctx.openModal("classes");
      return true;
    case "history":
      ctx.openModal("history");
      return true;
    case "shortcuts":
      ctx.openModal("shortcuts");
      return true;
    default:
      return false;
  }
}

export type StudioKeyEventLike = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  target: unknown;
  preventDefault: () => void;
};

/**
 * Keyboard entry point: never hijacks typing, never claims unhandled keys,
 * and only calls `preventDefault` when a handler actually did the work
 * (so bare ⌘C/⌘V with nothing selected fall through to the browser).
 */
export function handleStudioKeyDown(
  event: StudioKeyEventLike,
  platform: StudioPlatform,
  ctx: StudioShortcutContext,
): boolean {
  if (isTypingElement(event.target)) return false;
  const shortcut = matchStudioShortcut(event, platform);
  if (!shortcut) return false;
  const handled = runStudioShortcut(shortcut.id, ctx);
  if (handled) event.preventDefault();
  return handled;
}

/* ---------------- global insert mode (unit-tested) ----------------
 *
 * The Globals tab offers two placements for a shared block. `copy`
 * (default) clones with fresh ids — edits stay on this page. `linked`
 * inserts a `global_ref` pointer that resolves live at render-data time
 * (`resolveGlobalRef` / `resolveGlobalRefSlots`), so block edits update
 * every placement. Pure helpers below are the testable contract; the
 * `insertGlobalBlock` callback defaults to `copy` so current merchants
 * see no surprise.
 */

/** Globals-tab placement: detached snapshot or live pointer. */
export type GlobalInsertMode = "copy" | "linked";

/** Coerce unknown input to a global-insert mode; unknown stays `copy`. */
export function normalizeGlobalInsertMode(value: unknown): GlobalInsertMode {
  return value === "linked" ? "linked" : "copy";
}

/**
 * Linked-insert pointer for a shared block: a `global_ref` node carrying
 * only the block id (trimmed + clamped like the builder-ast pointer), no
 * snapshot children — resolution stays live. Never throws; blank/hostile
 * ids yield an unpointed node that renders the pick-a-block placeholder.
 */
export function globalRefNodeForBlock(blockId: string): StudioNode {
  try {
    const ref = (typeof blockId === "string" ? blockId : "")
      .trim()
      .slice(0, 120);
    const node = newWidgetNode("global_ref");
    node.settings = { ...node.settings, ref };
    return node;
  } catch {
    return {
      id: `global-${Math.random().toString(36).slice(2, 10)}`,
      el: "global_ref",
      settings: { ref: "" },
    };
  }
}

/* ---------------- plugin entry status (unit-tested) ----------------
 *
 * Display-only affordance for the Elements Plugins group: the
 * `resolvePluginWidget` failure reason plus the `version_pin` /
 * `auto_updates` install state, with host-owned Update/Enable deep-links.
 * No install/update pipeline reads this — entries without any status
 * field return null and render the legacy button byte-identically.
 */

export type PluginEntryStatus = {
  reasonLabel: string | null;
  pinLabel: string | null;
  autoLabel: string | null;
  updateHref: string | null;
  enableHref: string | null;
};

const PLUGIN_REASON_LABEL: Record<
  NonNullable<StudioBuilderPluginEntry["resolveReason"]>,
  string
> = {
  bad_key: "Unavailable — bad widget key.",
  not_installed: "Not installed.",
  unknown_widget: "Widget unavailable in the installed version.",
  incompatible: "Needs update — incompatible with this builder.",
  disabled: "Disabled — enable to use.",
  suspended: "Suspended by the platform — unavailable for now.",
};

function cleanHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const href = value.trim();
  return href ? href : null;
}

/**
 * Merchant-facing status for one plugin entry, or null when the entry is
 * a legacy `{ key, label, pluginName }` row with nothing to surface.
 * Never throws; hostile fields fall back to safe labels/omission.
 */
export function pluginEntryStatus(
  entry: StudioBuilderPluginEntry,
): PluginEntryStatus | null {
  try {
    const reason = entry.resolveReason;
    const pin =
      typeof entry.versionPin === "string" && entry.versionPin.trim()
        ? entry.versionPin.trim().slice(0, 32)
        : null;
    const auto =
      typeof entry.autoUpdates === "boolean" ? entry.autoUpdates : null;
    const updateHref = cleanHref(entry.updateHref);
    const enableHref = cleanHref(entry.enableHref);
    if (!reason && pin === null && auto === null && !updateHref && !enableHref)
      return null;
    return {
      reasonLabel: reason
        ? (PLUGIN_REASON_LABEL[
            reason as NonNullable<StudioBuilderPluginEntry["resolveReason"]>
          ] ?? "Unavailable.")
        : null,
      pinLabel: pin ? `Pinned v${pin}` : null,
      autoLabel:
        auto === null ? null : auto ? "Auto-updates on" : "Auto-updates off",
      updateHref,
      enableHref,
    };
  } catch {
    return null;
  }
}

/* ---------------- Frame30 extension intake/insert/selection (unit-tested) ---
 *
 * The route threads ONE authorized registry through `extensionRegistry` (a
 * sibling lane owns provisioning; this lane only consumes it as documented
 * on the prop: absent builds the builtin + studio + singleton fallback, and
 * misses keep the `app-block` fallback). These pure helpers are the testable
 * contract; the component wires them without touching the settings panel
 * body, canvas, save/serialize internals (another lane owns those).
 */

/**
 * Strict listing usability for the threaded registry: an object exposing
 * both `resolveWidget` (insert) and `listWidgets` (tray). Anything else —
 * absent, null, hostile, partially implemented, or throwing — falls back to
 * today's `pluginEntries` prop byte-identically. Never throws.
 */
export function isUsableExtensionRegistry(
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
 * Insert-path usability (matches the `addPluginNode` contract on the prop
 * docs): a registry that can resolve is usable for insertion even when it
 * cannot list. Never throws.
 */
function hasExtensionResolver(registry: unknown): registry is UnifiedRegistry {
  try {
    return (
      !!registry &&
      typeof registry === "object" &&
      typeof (registry as Partial<UnifiedRegistry>).resolveWidget === "function"
    );
  } catch {
    return false;
  }
}

/**
 * Fallback registry for absent/unusable threaded registries: builtin +
 * studio + singleton tiers (the same tiers `buildTrayRegistry` seeds minus
 * installed plugins, which only the authorized threaded registry carries).
 * A single bad adapter def never breaks the insert. Never throws.
 */
export function buildFallbackExtensionRegistry(): UnifiedRegistry {
  const fallback = createWidgetRegistry();
  try {
    for (const def of [...fromBuiltinWidgets(), ...fromStudioCatalog()]) {
      try {
        fallback.registerWidget(def);
      } catch {
        // A single bad adapter def never breaks the insert.
      }
    }
    try {
      for (const def of listSingletonWidgets()) {
        try {
          fallback.registerWidget(def);
        } catch {
          // Hostile singleton entries are dropped, never stored.
        }
      }
    } catch {
      // Singleton unreadable — tier fallback still stands.
    }
  } catch {
    // Registry construction never breaks the legacy path.
  }
  return fallback;
}

/**
 * Tray listing source: plugin-namespace defs from the threaded registry when
 * usable, otherwise today's `pluginEntries` prop untouched (same reference,
 * so legacy callers render byte-identically). Registry-derived rows carry
 * only `{ key, label, pluginName }` — no install-state display fields, so
 * `pluginEntryStatus` stays null for them exactly as for legacy minimal
 * rows. Only defs the insert path can build are offered (disabled and
 * incompatible builder-API defs are excluded, so the tray can never offer a
 * widget it cannot insert); builtin/studio/theme tiers keep their own rails
 * and never leak into the Plugins group. Never throws; hostile defs or a
 * throwing registry fall back instead of breaking the rail.
 */
export function resolveExtensionTrayEntries(
  registry: UnifiedRegistry | null | undefined,
  fallback: readonly StudioBuilderPluginEntry[] | null | undefined,
): readonly StudioBuilderPluginEntry[] | undefined {
  const legacy = fallback ?? undefined;
  try {
    if (!isUsableExtensionRegistry(registry)) return legacy;
    let defs: unknown;
    try {
      defs = registry.listWidgets();
    } catch {
      return legacy;
    }
    if (!Array.isArray(defs)) return legacy;
    const seen = new Set<string>();
    const out: StudioBuilderPluginEntry[] = [];
    for (const entry of defs) {
      try {
        if (!entry || typeof entry !== "object" || Array.isArray(entry))
          continue;
        const def = entry as Partial<WidgetDef>;
        // Plugin AND uploaded-theme defs: both insert through
        // `buildExtensionInsert` from this same registry (theme defs carry
        // the active approved theme's schemas). Offer only what the insert
        // can build: misses stay hidden instead of landing on the legacy
        // placeholder on click.
        if (def.namespace !== "plugin" && def.namespace !== "theme") continue;
        if (typeof def.id !== "string" || !def.id.trim()) continue;
        const key = def.id.trim().slice(0, 120);
        if (seen.has(key)) continue;
        // Offer only what `buildExtensionInsert` can build from this same
        // registry: misses (disabled/incompatible/uninstalled) stay hidden
        // instead of inserting into the legacy placeholder on click.
        let insertable = false;
        try {
          const resolved = registry.resolveWidget(key, { data: {} });
          insertable =
            !!resolved &&
            (resolved as { ok?: unknown }).ok === true &&
            !!(resolved as { ok: true; def: unknown }).def;
        } catch {
          insertable = false;
        }
        if (!insertable) continue;
        const label =
          typeof def.label === "string" && def.label.trim()
            ? def.label.trim().slice(0, 120)
            : key;
        let pluginName = key;
        try {
          const owner = ownerForWidgetKey(key);
          if (owner.id) pluginName = owner.id;
        } catch {
          pluginName = key;
        }
        seen.add(key);
        out.push({ key, label, pluginName });
      } catch {
        // A single hostile def never breaks the tray.
      }
    }
    return out;
  } catch {
    return legacy;
  }
}

/**
 * True for a studio `app-block` twin carrying the extension envelope
 * (`studioNodeForExtension` writes `settings.extensionInstanceId` beside the
 * canonical props). Legacy `app-block` nodes (no envelope) read false, so
 * every pre-extension document keeps its current behavior. Never throws.
 */
export function isExtensionStudioNode(node: unknown): boolean {
  try {
    if (!node || typeof node !== "object" || Array.isArray(node)) return false;
    const candidate = node as Partial<StudioNode>;
    if (candidate.el !== "app-block") return false;
    const settings = candidate.settings;
    if (!settings || typeof settings !== "object" || Array.isArray(settings))
      return false;
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
export function extensionWidgetKeyOf(node: unknown): string {
  try {
    if (!node || typeof node !== "object" || Array.isArray(node)) return "";
    const settings = (node as Partial<StudioNode>).settings;
    if (!settings || typeof settings !== "object" || Array.isArray(settings))
      return "";
    const raw = (settings as Record<string, unknown>)["pluginKey"];
    return typeof raw === "string" ? raw.trim().slice(0, 120) : "";
  } catch {
    return "";
  }
}

/**
 * Selection helper: resolve the widget def for a selected studio node from
 * the threaded registry. The selected node itself already reaches the
 * settings panel through the existing `node={selected}` prop (untouched —
 * another lane owns `SettingsPanel.tsx`); this selector lets any reader map
 * that identity to its def. Returns `undefined` for legacy nodes, misses,
 * and unusable registries. Never throws.
 */
export function extensionDefForNode(
  node: StudioNode | null | undefined,
  registry: UnifiedRegistry | null | undefined,
): WidgetDef | undefined {
  try {
    if (!isExtensionStudioNode(node)) return undefined;
    const key = extensionWidgetKeyOf(node);
    if (!key) return undefined;
    if (!hasExtensionResolver(registry)) return undefined;
    const resolved = registry.resolveWidget(key, { data: {} });
    if (!resolved || (resolved as { ok?: unknown }).ok !== true)
      return undefined;
    return (resolved as { ok: true; def: WidgetDef }).def;
  } catch {
    return undefined;
  }
}

/**
 * Duplicate a studio node with independent extension identity: the clone
 * keeps deep-cloned per-instance props (no shared references with the
 * source), while every subtree node carrying the extension envelope gets a
 * fresh `extensionInstanceId` pinned to its own new id. Legacy nodes (no
 * envelope) return the plain `cloneNode` result untouched, so pre-extension
 * duplication stays byte-identical. Delegates to the canonical
 * `withFreshTwinIdentity` lifecycle helper (single implementation for
 * selection/duplication/copy-paste). Never throws and never mutates the
 * source.
 */
export function duplicateExtensionStudioNode(source: StudioNode): StudioNode {
  try {
    if (!isLifecycleTwin(source)) {
      try {
        return cloneNode(source);
      } catch {
        return { id: uid(), el: "app-block", settings: {} };
      }
    }
    return freshLifecycleIdentity(source);
  } catch {
    try {
      return cloneNode(source);
    } catch {
      return { id: uid(), el: "app-block", settings: {} };
    }
  }
}

/**
 * Frame30 extension lifecycle — copy/paste + save normalization (pure,
 * unit-tested). `refreshExtensionPaste` gives pasted clipboard nodes fresh
 * identities collision-safe against the live canvas (deep-cloned, envelopes
 * re-pinned); `normalizeExtensionDocForSave` repairs stale envelopes,
 * validates props through the threaded registry when provided, and dedupes
 * colliding ids — legacy docs return the same reference (byte-identical).
 * Never throws.
 */
export function refreshExtensionPaste(
  nodes: readonly StudioNode[],
  liveIds: ReadonlySet<string> | readonly string[],
): StudioNode[] {
  try {
    return refreshLifecyclePaste(nodes, liveIds);
  } catch {
    return [];
  }
}

export function normalizeExtensionDocForSave(
  doc: StudioDoc,
  registry?: UnifiedRegistry | null,
): StudioDoc {
  try {
    const usable =
      registry &&
      typeof (registry as Partial<UnifiedRegistry>).getWidget === "function"
        ? registry
        : null;
    return normalizeLifecycleDoc(doc, usable);
  } catch {
    return doc;
  }
}

export function StudioBuilder({
  doc: initialDoc,
  onChange,
  onPublish,
  onExit,
  revisions = [],
  saving = false,
  docId = null,
  fill = false,
  sideTab = null,
  resetKey = null,
  globalBlocks = [],
  onSaveGlobalBlock = null,
  menus = null,
  themeDoc = null,
  onRestoreRevision = null,
  pluginEntries = null,
  extensionRegistry = null,
  devThemeBinding = null,
  activeThemeKey = null,
}: StudioBuilderProps) {
  const studio = useStudio(initialDoc, resetKey);

  const {
    doc,
    selected,
    selectedId,
    device,
    activeDevices,
    dirty,
    setSelectedId,
    setDevice,
  } = studio;

  /* ---------------- multi-select (old-builder select() semantics) ----------------
   *
   * `selectedIds` is the interaction source of truth; the studio's single
   * `selectedId` mirrors the primary id so the settings panel, context menu
   * and every studio mutation keep working unchanged. The sync effect below
   * converges both directions: canvas/modifier writes flow into the studio,
   * studio-internal writes (add/duplicate/remove/paste) collapse back here.
   */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const select = useCallback(
    (id: string | null, mode: StudioSelectionMode = "replace") => {
      setSelectedIds((current) => applySelection(current, id, mode));
    },
    [],
  );
  useEffect(() => {
    const primary = selectedIds[0] ?? null;
    if (primary !== selectedId) {
      if (selectedId && !selectedIds.includes(selectedId)) {
        setSelectedIds([selectedId]);
      } else {
        setSelectedId(primary);
      }
    }
  }, [selectedIds, selectedId, setSelectedId]);
  /* Drop ids whose subtree is gone (delete/undo/import) so bulk ops and the
   * settings panel never act on ghosts. */
  useEffect(() => {
    setSelectedIds((current) => {
      if (current.length === 0) return current;
      const next = current.filter((id) => findNode(doc.root, id));
      return next.length === current.length ? current : next;
    });
  }, [doc.root]);

  /* ---------------- layout-slot switcher ----------------
   *
   * Mirrors the old builder's slot tabs: the canvas shows the active slot
   * only. Mutations address nodes by id against the full document, so every
   * studio op keeps working on root-resident nodes whichever tab is open.
   */
  const [slot, setSlot] = useState<StudioSlot>("main");
  const slots = useMemo(() => studioSlots(doc), [doc]);
  const resolvedSlots = useMemo(
    () => (themeDoc ? resolveStudioSlots(doc, themeDoc) : null),
    [doc, themeDoc],
  );
  const visibleRoot = useMemo(
    () =>
      slot === "main"
        ? slots.main
        : ((resolvedSlots ?? slots)[slot] as StudioNode[]),
    [slot, slots, resolvedSlots],
  );
  const viewDoc = useMemo(
    () => (slot === "main" ? doc : { ...doc, root: visibleRoot }),
    [doc, slot, visibleRoot],
  );

  /* ---------------- canvas frames ----------------
   *
   * Numeric device presets plus a fluid full-width toggle and zoom, per the
   * old builder's frame toolbar. Picking a preset or a device exits fluid
   * mode; zoom only scales the preview and never touches the document.
   */
  const [frameWidth, setFrameWidth] = useState<number | null>(null);
  const [fluid, setFluid] = useState(false);
  const [zoom, setZoom] = useState(1);
  const pickDevice = useCallback(
    (next: DeviceKey) => {
      setDevice(next);
      setFluid(false);
      setFrameWidth(null);
    },
    [setDevice],
  );
  const frameStyle = {
    maxWidth: fluid
      ? "100%"
      : frameWidth
        ? `${frameWidth}px`
        : CANVAS_WIDTH[device],
    transform: zoom !== 1 ? `scale(${zoom})` : undefined,
    transformOrigin: "top center" as const,
  };

  /* Container-scoped add (`parentId: addParent` semantics): picking "add
   * inside" on a container arms the next rail insert to land there. */
  const [addParent, setAddParent] = useState<string | null>(null);
  const addPluginNode = useCallback(
    (pluginKey: string, target?: DropTarget) => {
      // Frame30 extension insert: canonical node via `buildExtensionInsert`
      // + `studio.addNode`. Registry misses keep the legacy `app-block`
      // fallback — existing callers stay byte-identical when inactive.
      // An explicit drop `target` wins over the container-scoped `addParent`
      // (rail clicks pass none, so they keep the armed-parent behavior).
      const where = addParent
        ? { id: addParent, position: "inside" as const }
        : undefined;
      const at = target ?? where;
      try {
        const key = (pluginKey ?? "").trim().slice(0, 120);
        if (key) {
          let registry = extensionRegistry;
          if (!registry || typeof registry.resolveWidget !== "function") {
            const fallback = createWidgetRegistry();
            for (const def of [
              ...fromBuiltinWidgets(),
              ...fromStudioCatalog(),
            ]) {
              try {
                fallback.registerWidget(def);
              } catch {
                // A single bad adapter def never breaks the insert.
              }
            }
            try {
              for (const def of listSingletonWidgets()) {
                try {
                  fallback.registerWidget(def);
                } catch {
                  // Hostile singleton entries are dropped, never stored.
                }
              }
            } catch {
              // Singleton unreadable — tier fallback still stands.
            }
            registry = fallback;
          }
          const targetSlot =
            slot === "header" || slot === "main" || slot === "footer"
              ? slot
              : "main";
          const built = buildExtensionInsert(registry, {
            widgetKey: key,
            slot: targetSlot,
          });
          if (built.ok) {
            studio.addNode(studioNodeForExtension(built.node), at);
            setAddParent(null);
            return;
          }
        }
      } catch {
        // Extension insert never breaks the legacy path: fall through below.
      }
      studio.addNode(appBlockNodeForPlugin(pluginKey), at);
      setAddParent(null);
    },
    [addParent, extensionRegistry, slot, studio],
  );

  /**
   * Frame30 discovery — explicit `pluginEntries` (with status metadata)
   * win when provided; otherwise the tray derives insertable plugin AND
   * uploaded-theme entries from the threaded authorized registry, so
   * discovery never depends on a second prop. Absent everywhere keeps the
   * tray hidden exactly as before.
   */
  const effectivePluginEntries =
    pluginEntries && pluginEntries.length > 0
      ? pluginEntries
      : (resolveExtensionTrayEntries(extensionRegistry, null) ?? undefined);

  /** Globals-tab insert: editable copy (default) or linked `global_ref`. */
  const [globalInsertMode, setGlobalInsertMode] =
    useState<GlobalInsertMode>("copy");
  const insertGlobalBlock = useCallback(
    (id: string, mode: GlobalInsertMode = globalInsertMode) => {
      const block = globalBlocks.find((candidate) => candidate.id === id);
      if (!block || block.nodes.length === 0) {
        toast.error("That block is empty.");
        return;
      }
      if (normalizeGlobalInsertMode(mode) === "linked") {
        const pointer =
          slot === "main"
            ? globalRefNodeForBlock(block.id)
            : withSlot(globalRefNodeForBlock(block.id), slot);
        studio.addNode(
          pointer,
          addParent ? { id: addParent, position: "inside" } : undefined,
        );
        toast.success(
          `Inserted “${block.name}” (linked — edits update everywhere).`,
        );
        return;
      }
      block.nodes.forEach((node) => {
        // Fresh-identity copy (frame30): twins re-pin to their own new ids
        // with deep-cloned props (no shared references, no envelope desync);
        // legacy nodes keep the plain `cloneNode` result via the helper's
        // legacy branch. Miss → preserved verbatim for save-normalize.
        const fresh = duplicateExtensionStudioNode(node);
        studio.addNode(
          slot === "main" ? fresh : withSlot(fresh, slot),
          addParent ? { id: addParent, position: "inside" } : undefined,
        );
      });
      toast.success(`Inserted “${block.name}” (editable copy).`);
    },
    [addParent, globalBlocks, globalInsertMode, slot, studio],
  );

  const [platform, setPlatform] = useState<StudioPlatform>("pc");
  const [preview, setPreview] = useState(false);
  const [structure, setStructure] = useState(false);
  const [modal, setModal] = useState<
    | null
    | "layout"
    | "templates"
    | "page"
    | "history"
    | "finder"
    | "shortcuts"
    | "classes"
  >(null);
  const [menu, setMenu] = useState<{
    id: string;
    at: { x: number; y: number };
  } | null>(null);
  const [templates, setTemplates] = useState<StudioTemplate[]>(() =>
    builtInTemplates(),
  );
  const [pendingDrop, setPendingDrop] = useState<DropTarget | null>(null);
  const dragWidget = useRef<string | null>(null);
  const dragNode = useRef<string | null>(null);

  useEffect(() => setPlatform(detectStudioPlatform(navigator)), []);
  useEffect(
    () => setTemplates([...builtInTemplates(), ...loadMyTemplates()]),
    [],
  );

  /* keep the host in sync without pushing on every keystroke */
  /* Extension lifecycle: the host receives the normalized save
   * representation (legacy docs pass through by reference). */
  const lastSent = useRef(doc);
  useEffect(() => {
    if (lastSent.current === doc) return;
    lastSent.current = doc;
    const id = window.setTimeout(
      () => onChange(normalizeExtensionDocForSave(doc, extensionRegistry)),
      400,
    );
    return () => window.clearTimeout(id);
  }, [doc, onChange, extensionRegistry]);

  /* ---------------- autosave + crash recovery ---------------- */

  /** A local draft found on open that differs from what the server loaded. */
  const [recovery, setRecovery] = useState<StudioDraft | null>(null);
  const [autosavedAt, setAutosavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!docId) return;
    setRecovery(recoverableDraft(docId, initialDoc));
    // Only on open: once the editor is running, the draft is ours to write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  /* mirror every edit locally, debounced, so a crash loses seconds not hours */
  /* Extension lifecycle: the draft stores the normalized save representation
   * (stale envelopes heal, hostile props neutralize); legacy docs return the
   * same reference, so non-extension autosave stays byte-identical. */
  useEffect(() => {
    if (!docId || !dirty) return;
    const id = window.setTimeout(() => {
      const at = Date.now();
      writeDraft(
        docId,
        normalizeExtensionDocForSave(doc, extensionRegistry),
        at,
      );
      setAutosavedAt(at);
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [doc, dirty, docId, extensionRegistry]);

  /* last-chance write when the tab goes away mid-edit */
  useEffect(() => {
    if (!docId) return;
    const flush = () => {
      if (studio.dirty)
        writeDraft(
          docId,
          normalizeExtensionDocForSave(studio.doc, extensionRegistry),
        );
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
    };
  }, [docId, studio, extensionRegistry]);

  const publish = useCallback(async () => {
    // Extension lifecycle: publish the normalized save representation.
    await onPublish?.(normalizeExtensionDocForSave(doc, extensionRegistry));
    studio.setDirty(false);
    if (docId) clearDraft(docId);
    setAutosavedAt(null);
    toast.success("Page published");
  }, [doc, docId, onPublish, studio, extensionRegistry]);

  const saveDraft = useCallback(() => {
    // Extension lifecycle: explicit save stores the normalized representation.
    onChange(normalizeExtensionDocForSave(doc, extensionRegistry));
    studio.setDirty(false);
    if (docId) clearDraft(docId);
    setAutosavedAt(null);
    toast.success("Draft saved");
  }, [doc, docId, onChange, studio, extensionRegistry]);

  const restoreRecovery = useCallback(() => {
    if (!recovery) return;
    studio.replaceDoc(recovery.doc, "imported");
    setRecovery(null);
    toast.success("Unsaved changes restored");
  }, [recovery, studio]);

  const discardRecovery = useCallback(() => {
    if (docId) clearDraft(docId);
    setRecovery(null);
  }, [docId]);

  const saveTemplate = useCallback(() => {
    const nodes = selected ? [selected] : doc.root;
    const name = window.prompt(
      "Template name",
      selected ? widgetLabel(selected.el) : doc.page.title,
    );
    if (name === null) return;
    const template = saveAsTemplate(name, nodes);
    const mine = [...loadMyTemplates(), template];
    persistMyTemplates(mine);
    setTemplates([...builtInTemplates(), ...mine]);
    toast.success("Saved to My templates");
  }, [doc, selected]);

  /* ---------------- shortcuts ----------------
   *
   * Everything routes through handleStudioKeyDown: typing is never
   * hijacked, unhandled keys fall through to the browser, and
   * `preventDefault` fires only when a handler actually did the work (so
   * ⌘C with nothing selected still reaches the browser).
   */
  const shortcutCtx = useMemo<StudioShortcutContext>(
    () => ({
      hasSelection: selectedIds.length > 0,
      selectedIds,
      undo: () => {
        studio.undo();
      },
      redo: () => {
        studio.redo();
      },
      copy: () => {
        const id = selectedIds[0];
        if (!id) return false;
        const node = findNode(doc.root, id);
        if (!node) return false;
        // Extension lifecycle: deep-cloned copy with valid envelope (legacy
        // path stays `cloneNode`-identical via the helper's legacy branch).
        return studio.copyNodes([duplicateExtensionStudioNode(node)]);
      },
      paste: () => {
        const payload = studio.peekClipboard();
        if (!payload || payload.kind !== "nodes" || payload.nodes.length === 0)
          return false;
        try {
          const nodes = payload.nodes as StudioNode[];
          const hasExtension = nodes.some((entry) => {
            try {
              return isLifecycleTwin(entry);
            } catch {
              return false;
            }
          });
          if (!hasExtension) {
            studio.paste();
            return true;
          }
          const live = new Set<string>();
          try {
            for (const entry of flatten(doc.root)) live.add(entry.node.id);
          } catch {
            // Hostile tree: fall through to the legacy paste below.
          }
          const fresh = refreshExtensionPaste(nodes, live);
          if (fresh.length === 0) return false;
          for (const entry of fresh) studio.addNode(entry);
          return true;
        } catch {
          studio.paste();
          return true;
        }
      },
      duplicate: () => {
        const ids = topMostStudioIds(doc.root, selectedIds);
        if (ids.length === 0) return false;
        try {
          const hasExtension = ids.some((entry) => {
            try {
              return isLifecycleTwin(findNode(doc.root, entry));
            } catch {
              return false;
            }
          });
          if (!hasExtension) {
            studio.duplicateMany(ids);
            return true;
          }
          for (const entry of ids) {
            const source = findNode(doc.root, entry);
            if (!source) continue;
            studio.addNode(duplicateExtensionStudioNode(source), {
              id: entry,
              position: "after",
            });
          }
          return true;
        } catch {
          studio.duplicateMany(ids);
          return true;
        }
      },
      remove: () => {
        const ids = topMostStudioIds(doc.root, selectedIds);
        if (ids.length === 0) return false;
        studio.removeMany(ids);
        return true;
      },
      pasteStyle: () => {
        const id = selectedIds[0];
        if (!id) return false;
        studio.pasteStyle(id);
        return true;
      },
      resetStyle: () => {
        const id = selectedIds[0];
        if (!id) return false;
        studio.resetStyle(id);
        return true;
      },
      saveDraft: () => {
        saveDraft();
      },
      publish: () => {
        void publish();
      },
      togglePreview: () => {
        setPreview((value) => !value);
      },
      toggleStructure: () => {
        setStructure((value) => !value);
      },
      openModal: (name) => {
        if (
          name === "finder" ||
          name === "templates" ||
          name === "page" ||
          name === "history" ||
          name === "shortcuts" ||
          name === "classes" ||
          name === "layout"
        )
          setModal(name);
      },
      nudge: (delta) => {
        const id = selectedIds[0];
        if (!id) return false;
        const siblings = siblingsOf(doc.root, id);
        const index = siblings.findIndex((node) => node.id === id);
        const target = siblings[index + delta];
        if (index < 0 || !target) return false;
        studio.move(id, {
          id: target.id,
          position: delta < 0 ? "before" : "after",
        });
        return true;
      },
      deselect: () => {
        select(null, "replace");
      },
      searchLayers: () => {
        setStructure(true);
      },
    }),
    [doc.root, selectedIds, studio, saveDraft, publish, select],
  );
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      handleStudioKeyDown(event, platform, shortcutCtx);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [platform, shortcutCtx]);

  const finderItems = useMemo(
    () => [
      ...flatten(doc.root).map(({ node, depth }) => ({
        id: node.id,
        label: node.name ?? widgetLabel(node.el),
        hint: depth === 0 ? "top level" : `level ${depth + 1}`,
      })),
    ],
    [doc.root],
  );

  /** Right-click menu, in the Elementor order, for canvas and layer tree. */
  const menuItems = useMemo<MenuItem[]>(() => {
    const id = menu?.id;
    if (!id) return [];
    const node = flatten(doc.root).find((entry) => entry.node.id === id)?.node;
    const label = node ? (node.name ?? widgetLabel(node.el)) : "Element";
    return [
      {
        kind: "action",
        id: "edit",
        label: `Edit ${label}`,
        run: () => select(id, "replace"),
      },
      {
        kind: "action",
        id: "duplicate",
        label: "Duplicate",
        hint: "⌘D",
        run: () => {
          // Extension lifecycle: twins duplicate with fresh identities
          // (legacy path stays `studio.duplicate`-identical).
          try {
            const source = findNode(doc.root, id);
            if (source) {
              try {
                if (isLifecycleTwin(source)) {
                  studio.addNode(duplicateExtensionStudioNode(source), {
                    id,
                    position: "after",
                  });
                  return;
                }
              } catch {
                // Fall through to the legacy duplicate below.
              }
            }
          } catch {
            // Fall through to the legacy duplicate below.
          }
          studio.duplicate(id);
        },
      },
      { kind: "separator", id: "s1" },
      {
        kind: "action",
        id: "copy",
        label: "Copy",
        hint: "⌘C",
        run: () => {
          try {
            const source = findNode(doc.root, id);
            if (source) {
              try {
                if (isLifecycleTwin(source)) {
                  studio.copyNodes([duplicateExtensionStudioNode(source)]);
                  return;
                }
              } catch {
                // Fall through to the legacy copy below.
              }
            }
          } catch {
            // Fall through to the legacy copy below.
          }
          studio.copy(id);
        },
      },
      {
        kind: "action",
        id: "paste",
        label: "Paste",
        hint: "⌘V",
        run: () => {
          // Extension lifecycle: pasted twins get fresh identities
          // collision-safe against the live canvas (legacy stays identical).
          try {
            const payload = studio.peekClipboard();
            const nodes = payload?.kind === "nodes" ? payload.nodes : null;
            if (nodes?.length) {
              const hasExtension = (nodes as StudioNode[]).some((entry) => {
                try {
                  return isLifecycleTwin(entry);
                } catch {
                  return false;
                }
              });
              if (hasExtension) {
                const live = new Set<string>();
                try {
                  for (const entry of flatten(doc.root))
                    live.add(entry.node.id);
                } catch {
                  // Hostile tree: paste with an empty live set below.
                }
                const fresh = refreshExtensionPaste(
                  nodes as StudioNode[],
                  live,
                );
                if (fresh.length > 0) {
                  let at: DropTarget = { id, position: "after" };
                  for (const entry of fresh) {
                    studio.addNode(entry, at);
                    at = { id: entry.id, position: "after" };
                  }
                  return;
                }
              }
            }
          } catch {
            // Fall through to the legacy paste below.
          }
          studio.paste({ id, position: "after" });
        },
      },
      {
        kind: "action",
        id: "copy-style",
        label: "Copy style",
        hint: "⌘⇧C",
        run: () => studio.copyStyle(id),
      },
      {
        kind: "action",
        id: "paste-style",
        label: "Paste style",
        hint: "⌘⇧V",
        run: () => studio.pasteStyle(id),
      },
      {
        kind: "action",
        id: "reset-style",
        label: "Reset style",
        run: () => studio.resetStyle(id),
      },
      { kind: "separator", id: "s2" },
      {
        kind: "action",
        id: "save-template",
        label: "Save as template",
        run: saveTemplate,
      },
      ...(onSaveGlobalBlock && node
        ? [
            {
              kind: "action",
              id: "save-global",
              label: "Save as global block",
              run: () =>
                onSaveGlobalBlock(node.name ?? widgetLabel(node.el), [node]),
            } as const,
          ]
        : []),
      {
        kind: "action",
        id: "structure",
        label: "Structure",
        hint: "⌘I",
        run: () => setStructure(true),
      },
      { kind: "separator", id: "s3" },
      {
        kind: "action",
        id: "delete",
        label: "Delete",
        hint: "⌦",
        danger: true,
        run: () => studio.remove(id),
      },
    ];
  }, [doc.root, menu, saveTemplate, select, studio]);

  const handleDrop = useCallback(
    (target: DropTarget) => {
      if (dragWidget.current) {
        const key = dragWidget.current;
        dragWidget.current = null;
        // Extension-key drops (namespaced `owner:widget`) funnel through the
        // canonical `addPluginNode` insert (validated props + fresh identity
        // + miss fallback); catalog keys keep the legacy widget path
        // byte-identical. Never throws into the canvas drag state.
        try {
          if (typeof key === "string" && key.includes(":")) {
            addPluginNode(key, target);
            return;
          }
        } catch {
          // Fall through to the legacy path below.
        }
        studio.addWidget(key, target);
        return;
      }
      if (dragNode.current) {
        studio.move(dragNode.current, target);
        dragNode.current = null;
      }
    },
    [addPluginNode, studio],
  );

  // Host-provided left tab (e.g. SEO) beside Elements when idle. Selecting
  // a canvas node always switches to its settings; deselecting returns to
  // the last tab.
  const [sideTabId, setSideTabId] = useState<string>("elements");

  const addParentLabel = addParent
    ? (flatten(doc.root).find((entry) => entry.node.id === addParent)?.node
        .name ?? "Container")
    : null;

  return (
    <div
      className={
        fill
          ? // Viewport-relative height: deterministic without relying on an
            // ancestor height chain (takeover is fixed inset-0; h-14 top bar
            // plus the host's top padding make up the 4rem offset).
            "fq-studio flex h-[calc(100dvh-4rem)] min-h-[480px] flex-col overflow-hidden bg-background"
          : "fq-studio flex h-[78vh] min-h-[560px] flex-col overflow-hidden rounded-fq-lg border border-border bg-background"
      }
    >
      <StudioTopBar
        title={doc.page.title}
        device={device}
        activeDevices={activeDevices}
        dirty={dirty}
        saving={saving}
        platform={platform}
        onDevice={pickDevice}
        onAddElement={() => select(null, "replace")}
        onPageSettings={() => setModal("page")}
        onHistory={() => setModal("history")}
        onDesignSystem={() => setModal("templates")}
        onFinder={() => setModal("finder")}
        onStructure={() => setStructure((value) => !value)}
        onPreview={() => setPreview((value) => !value)}
        onPublish={() => void publish()}
        onSaveDraft={saveDraft}
        onSaveTemplate={saveTemplate}
        onShortcuts={() => setModal("shortcuts")}
        onExit={() => onExit?.()}
      />

      {recovery && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/60 px-4 py-2 text-sm"
        >
          <span className="text-foreground">
            Unsaved changes from {draftAgeLabel(recovery.at)} were recovered
            from this browser.
          </span>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={restoreRecovery}
              className="rounded-fq-sm bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
            >
              Restore
            </button>
            <button
              type="button"
              onClick={discardRecovery}
              className="rounded-fq-sm border border-border px-3 py-1 text-xs font-medium text-muted-foreground"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {autosavedAt !== null && !recovery && (
        <div className="border-b border-border px-4 py-1 text-[11px] text-muted-foreground">
          Autosaved locally {draftAgeLabel(autosavedAt)}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {!preview && (
          <div className="hidden w-80 shrink-0 flex-col border-r border-border md:flex">
            {selected ? (
              <SettingsPanel
                node={selected}
                device={device}
                activeDevices={activeDevices}
                registry={extensionRegistry ?? undefined}
                onDevice={setDevice}
                onChange={(key, value) =>
                  studio.setSetting(selected.id, key, value)
                }
                onBack={() => select(null, "replace")}
                onResetStyles={() => studio.resetStyle(selected.id)}
                classes={studio.classes}
                onOpenClassManager={() => setModal("classes")}
              />
            ) : sideTab ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div
                  role="tablist"
                  aria-label="Studio side panel"
                  className="flex shrink-0 gap-1 border-b border-border p-2"
                >
                  {(
                    [
                      { id: "elements", label: "Elements" },
                      { id: sideTab.id, label: sideTab.label },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={sideTabId === tab.id}
                      onClick={() => setSideTabId(tab.id)}
                      className={cn(
                        "flex-1 rounded-fq-sm px-2 py-1.5 text-xs font-medium transition-colors",
                        sideTabId === tab.id
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div className="min-h-0 flex-1 overflow-auto">
                  {sideTabId === sideTab.id ? (
                    sideTab.content
                  ) : (
                    <ElementsPanelInner
                      studio={studio}
                      templates={templates}
                      dragWidget={dragWidget}
                      globals={globalBlocks.map(({ id, name }) => ({
                        id,
                        name,
                      }))}
                      onInsertGlobal={insertGlobalBlock}
                      globalInsertMode={globalInsertMode}
                      onGlobalInsertMode={setGlobalInsertMode}
                      addParent={addParent}
                      pluginEntries={effectivePluginEntries}
                      onAddPlugin={addPluginNode}
                    />
                  )}
                </div>
              </div>
            ) : (
              <ElementsPanelInner
                studio={studio}
                templates={templates}
                dragWidget={dragWidget}
                globals={globalBlocks.map(({ id, name }) => ({ id, name }))}
                onInsertGlobal={insertGlobalBlock}
                globalInsertMode={globalInsertMode}
                onGlobalInsertMode={setGlobalInsertMode}
                addParent={addParent}
                pluginEntries={effectivePluginEntries}
                onAddPlugin={addPluginNode}
              />
            )}
          </div>
        )}

        <main
          className="relative min-h-0 flex-1 overflow-auto bg-muted/40 p-4"
          aria-label="Page canvas"
        >
          {/* Layout-slot tabs + frame presets + zoom: the old builder's
           * canvas toolbar, rescoped to studio slots. */}
          <div className="mx-auto mb-3 flex max-w-full flex-wrap items-center gap-1.5">
            <div
              role="tablist"
              aria-label="Layout slot"
              className="flex rounded-fq-md border border-border bg-background p-0.5"
            >
              {(["header", "main", "footer"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={slot === key}
                  onClick={() => setSlot(key)}
                  className={cn(
                    "min-h-9 rounded-fq-sm px-3 text-xs font-medium capitalize",
                    slot === key
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {key}
                </button>
              ))}
            </div>
            <div
              role="tablist"
              aria-label="Frame width"
              className="flex rounded-fq-md border border-border bg-background p-0.5"
            >
              {DEVICE_PRESETS.map((preset) => (
                <button
                  key={preset.width}
                  type="button"
                  role="tab"
                  aria-selected={
                    !fluid && (frameWidth ?? null) === preset.width
                  }
                  title={`${preset.width}px frame`}
                  onClick={() => {
                    setFluid(false);
                    setFrameWidth(preset.width);
                  }}
                  className={cn(
                    "min-h-9 rounded-fq-sm px-2 text-xs tabular-nums",
                    !fluid && (frameWidth ?? null) === preset.width
                      ? "bg-muted font-semibold text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {preset.label}
                </button>
              ))}
              <button
                type="button"
                role="tab"
                aria-selected={fluid}
                title="Full window width canvas"
                onClick={() => setFluid((value) => !value)}
                className={cn(
                  "min-h-9 rounded-fq-sm px-2 text-xs",
                  fluid
                    ? "bg-muted font-semibold text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Fluid
              </button>
            </div>
            <div
              role="group"
              aria-label="Canvas zoom"
              className="flex items-center rounded-fq-md border border-border bg-background p-0.5"
            >
              <button
                type="button"
                aria-label="Zoom out"
                onClick={() =>
                  setZoom((value) => Math.max(0.5, +(value - 0.25).toFixed(2)))
                }
                className="grid min-h-9 min-w-9 place-items-center rounded-fq-sm text-sm text-muted-foreground hover:text-foreground"
              >
                −
              </button>
              <button
                type="button"
                title="Reset zoom"
                aria-label={`Zoom ${Math.round(zoom * 100)} percent, reset`}
                onClick={() => setZoom(1)}
                className="min-h-9 min-w-12 rounded-fq-sm text-xs tabular-nums text-muted-foreground hover:text-foreground"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                aria-label="Zoom in"
                onClick={() =>
                  setZoom((value) => Math.min(1.5, +(value + 0.25).toFixed(2)))
                }
                className="grid min-h-9 min-w-9 place-items-center rounded-fq-sm text-sm text-muted-foreground hover:text-foreground"
              >
                +
              </button>
            </div>
            {addParent && (
              <button
                type="button"
                title="Clear container-scoped add"
                onClick={() => setAddParent(null)}
                className="inline-flex min-h-9 items-center gap-1 rounded-fq-md border border-border bg-background px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                Inside {addParentLabel ?? "container"} ✕
              </button>
            )}
          </div>
          <div
            className={cn(
              "mx-auto min-h-full bg-background shadow-fq-md transition-[max-width] duration-200",
            )}
            style={frameStyle}
          >
            <StudioCanvas
              doc={viewDoc}
              device={device}
              selectedId={selectedId}
              selectedIds={selectedIds}
              hideHandles={preview}
              onSelect={(id) => select(id, "replace")}
              onSelectMode={(id, mode) => select(id, mode)}
              menus={menus}
              onDrop={handleDrop}
              onDragNode={(id) => {
                dragNode.current = id;
              }}
              onDuplicate={studio.duplicate}
              onDelete={studio.remove}
              onAddInside={(id) => {
                setAddParent(id);
                setPendingDrop({ id, position: "inside" });
                setModal("layout");
              }}
              onAddRoot={() => {
                setPendingDrop({ id: null, position: "after" });
                setModal("layout");
              }}
              onContextMenu={(id, at) => {
                select(id, "replace");
                setMenu({ id, at });
              }}
              onInlineEdit={(id, text) => studio.setSetting(id, "text", text)}
              themeKey={activeThemeKey ?? null}
              registry={extensionRegistry ?? undefined}
              devThemeBinding={devThemeBinding ?? undefined}
            />
          </div>

          <p className="pointer-events-none sticky bottom-0 pt-2 text-center text-[11px] text-muted-foreground">
            {BREAKPOINT_BY_KEY[device].label} preview
            {slot !== "main" ? ` · ${slot} slot` : ""}
          </p>

          {selectedIds.length > 1 && (
            <div
              role="status"
              className="sticky bottom-8 mx-auto flex w-fit items-center gap-2 rounded-fq-md border border-border bg-background px-3 py-1.5 text-xs shadow-fq-md"
            >
              <span className="text-muted-foreground">
                {selectedIds.length} selected
              </span>
              <button
                type="button"
                onClick={() => {
                  // Extension lifecycle: twins duplicate with fresh identities
                  // (legacy path stays `duplicateMany`-identical).
                  try {
                    const ids = topMostStudioIds(doc.root, selectedIds);
                    const hasExtension = ids.some((entry) => {
                      try {
                        return isLifecycleTwin(findNode(doc.root, entry));
                      } catch {
                        return false;
                      }
                    });
                    if (hasExtension) {
                      for (const entry of ids) {
                        const source = findNode(doc.root, entry);
                        if (!source) continue;
                        studio.addNode(duplicateExtensionStudioNode(source), {
                          id: entry,
                          position: "after",
                        });
                      }
                      return;
                    }
                    studio.duplicateMany(ids);
                  } catch {
                    studio.duplicateMany(
                      topMostStudioIds(doc.root, selectedIds),
                    );
                  }
                }}
                className="font-medium text-primary hover:underline"
              >
                Duplicate
              </button>
              <button
                type="button"
                onClick={() => {
                  const ids = topMostStudioIds(doc.root, selectedIds);
                  studio.removeMany(ids);
                }}
                className="font-medium text-destructive hover:underline"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => select(null, "replace")}
                className="font-medium text-muted-foreground hover:underline"
              >
                Clear
              </button>
            </div>
          )}

          {structure && (
            <div className="pointer-events-none absolute right-4 top-4 z-20">
              <StructurePanel
                nodes={doc.root}
                selectedId={selectedId}
                onSelect={(id) => select(id, "replace")}
                onRename={studio.rename}
                onToggleHidden={studio.toggleHidden}
                onMove={studio.move}
                onContextMenu={(id, at) => setMenu({ id, at })}
                onClose={() => setStructure(false)}
                onDuplicate={studio.duplicate}
                onDelete={studio.remove}
              />
            </div>
          )}
        </main>
      </div>

      <NodeContextMenu
        at={menu?.at ?? null}
        items={menuItems}
        label="Element actions"
        onClose={() => setMenu(null)}
      />

      <ClassManagerDialog
        open={modal === "classes"}
        onOpenChange={(open) => setModal(open ? "classes" : null)}
        classes={studio.classes}
        onCreate={studio.createClass}
        onRename={studio.renameClass}
        onDelete={studio.deleteClass}
      />

      <LayoutPickerDialog
        open={modal === "layout"}
        onOpenChange={(open) => setModal(open ? "layout" : null)}
        onPick={(preset) => {
          studio.addPreset(preset, pendingDrop ?? undefined);
          setPendingDrop(null);
        }}
      />

      <TemplatesDialog
        open={modal === "templates"}
        onOpenChange={(open) => setModal(open ? "templates" : null)}
        templates={templates}
        onInsert={(template) =>
          // Fresh-identity import (frame30): see `onInsertSaved` above.
          instantiate(template).forEach((node) => {
            try {
              studio.addNode(duplicateExtensionStudioNode(node));
            } catch {
              studio.addNode(node);
            }
          })
        }
        onToggleFavourite={(id) =>
          setTemplates((list) =>
            list.map((t) =>
              t.id === id ? { ...t, favourite: !t.favourite } : t,
            ),
          )
        }
        onImport={(json) => {
          const template = importTemplateJson(json);
          if (!template) {
            toast.error("That file is not a template export.");
            return;
          }
          setTemplates((list) => [...list, template]);
          toast.success(`Imported ${template.name}`);
        }}
      />

      <PageSettingsDialog
        open={modal === "page"}
        onOpenChange={(open) => setModal(open ? "page" : null)}
        page={doc.page}
        breakpoints={activeDevices}
        onChange={studio.setPage}
        onBreakpoints={studio.setBreakpoints}
      />

      <HistoryDialog
        open={modal === "history"}
        onOpenChange={(open) => setModal(open ? "history" : null)}
        history={studio.history}
        revisions={revisions}
        onJump={studio.jump}
        onRestore={(revisionId) =>
          onRestoreRevision
            ? onRestoreRevision(revisionId)
            : toast.info(
                "Revision restore is handled by the editor's revisions panel.",
              )
        }
      />

      <FinderDialog
        open={modal === "finder"}
        onOpenChange={(open) => setModal(open ? "finder" : null)}
        items={finderItems}
        onPick={(id) => {
          select(id, "replace");
          const node = doc.root.find((child) => child.id === id);
          if (node && isContainerNode(node)) setStructure(true);
        }}
      />

      <ShortcutsDialog
        open={modal === "shortcuts"}
        onOpenChange={(open) => setModal(open ? "shortcuts" : null)}
        platform={platform}
      />
    </div>
  );
}
