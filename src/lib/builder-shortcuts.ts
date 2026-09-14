/**
 * Phase 1.4 — the studio keyboard map.
 *
 * One declarative table is the single source of truth for three consumers:
 * the `keydown` dispatcher, the `?` help overlay, and the contract test that
 * fails the build when the overlay advertises a shortcut nothing handles.
 *
 * Platform formatting matters: a macOS merchant expects `⌘Z`, a Windows one
 * `Ctrl+Z`, and printing the wrong one erodes trust in the whole editor.
 */

export type ShortcutId =
  | "undo"
  | "redo"
  | "copy"
  | "paste"
  | "paste_style"
  | "duplicate"
  | "delete"
  | "deselect"
  | "move_up"
  | "move_down"
  | "save"
  | "preview"
  | "search_layers"
  | "help";

export type ShortcutGroup = "history" | "clipboard" | "structure" | "workflow";

export type Combo = {
  /** Compared lower-cased against `event.key`. */
  key: string;
  /** ⌘ on macOS, Ctrl elsewhere. */
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
};

export type ShortcutSpec = {
  id: ShortcutId;
  group: ShortcutGroup;
  combos: Combo[];
  label: { en: string; bn: string };
  /** True when the action needs at least one selected node. */
  needsSelection?: boolean;
};

export type Platform = "mac" | "other";

export const SHORTCUTS: ShortcutSpec[] = [
  {
    id: "undo",
    group: "history",
    combos: [{ key: "z", mod: true }],
    label: { en: "Undo", bn: "আনডু" },
  },
  {
    id: "redo",
    group: "history",
    combos: [
      { key: "z", mod: true, shift: true },
      { key: "y", mod: true },
    ],
    label: { en: "Redo", bn: "রিডু" },
  },
  {
    id: "copy",
    group: "clipboard",
    combos: [{ key: "c", mod: true }],
    label: { en: "Copy selection", bn: "নির্বাচন কপি" },
    needsSelection: true,
  },
  {
    id: "paste",
    group: "clipboard",
    combos: [{ key: "v", mod: true }],
    label: { en: "Paste", bn: "পেস্ট" },
  },
  {
    id: "paste_style",
    group: "clipboard",
    combos: [{ key: "v", mod: true, shift: true }],
    label: { en: "Paste style only", bn: "শুধু স্টাইল পেস্ট" },
    needsSelection: true,
  },
  {
    id: "duplicate",
    group: "structure",
    combos: [{ key: "d", mod: true }],
    label: { en: "Duplicate", bn: "ডুপ্লিকেট" },
    needsSelection: true,
  },
  {
    id: "delete",
    group: "structure",
    combos: [{ key: "delete" }, { key: "backspace" }],
    label: { en: "Delete", bn: "মুছুন" },
    needsSelection: true,
  },
  {
    id: "deselect",
    group: "structure",
    combos: [{ key: "escape" }],
    label: { en: "Deselect", bn: "নির্বাচন বাতিল" },
  },
  {
    id: "move_up",
    group: "structure",
    combos: [{ key: "arrowup", mod: true }],
    label: { en: "Move up one sibling", bn: "এক ধাপ উপরে" },
    needsSelection: true,
  },
  {
    id: "move_down",
    group: "structure",
    combos: [{ key: "arrowdown", mod: true }],
    label: { en: "Move down one sibling", bn: "এক ধাপ নিচে" },
    needsSelection: true,
  },
  {
    id: "save",
    group: "workflow",
    combos: [{ key: "s", mod: true }],
    label: { en: "Save draft now", bn: "ড্রাফট সেভ" },
  },
  {
    id: "preview",
    group: "workflow",
    combos: [{ key: "p", mod: true, shift: true }],
    label: { en: "Open storefront preview", bn: "স্টোরফ্রন্ট প্রিভিউ" },
  },
  {
    id: "search_layers",
    group: "workflow",
    combos: [{ key: "f", mod: true, shift: true }],
    label: { en: "Search layers", bn: "লেয়ার খুঁজুন" },
  },
  {
    id: "help",
    group: "workflow",
    combos: [{ key: "?" }, { key: "/", shift: true }],
    label: { en: "Keyboard shortcuts", bn: "কীবোর্ড শর্টকাট" },
  },
];

export const SHORTCUT_GROUP_LABEL: Record<ShortcutGroup, { en: string; bn: string }> = {
  history: { en: "History", bn: "ইতিহাস" },
  clipboard: { en: "Clipboard", bn: "ক্লিপবোর্ড" },
  structure: { en: "Structure", bn: "স্ট্রাকচার" },
  workflow: { en: "Workflow", bn: "ওয়ার্কফ্লো" },
};

export function detectPlatform(userAgent: string | undefined | null): Platform {
  if (!userAgent) return "other";
  return /mac|iphone|ipad|ipod/i.test(userAgent) ? "mac" : "other";
}

const KEY_LABEL: Record<string, string> = {
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  escape: "Esc",
  delete: "Del",
  backspace: "Backspace",
  enter: "Enter",
};

export function formatCombo(combo: Combo, platform: Platform): string {
  const parts: string[] = [];
  if (combo.mod) parts.push(platform === "mac" ? "⌘" : "Ctrl");
  if (combo.shift) parts.push(platform === "mac" ? "⇧" : "Shift");
  if (combo.alt) parts.push(platform === "mac" ? "⌥" : "Alt");
  const key = KEY_LABEL[combo.key] ?? (combo.key.length === 1 ? combo.key.toUpperCase() : combo.key);
  parts.push(key);
  return platform === "mac" ? parts.join("") : parts.join("+");
}

export function formatShortcut(spec: ShortcutSpec, platform: Platform): string {
  return spec.combos.map((combo) => formatCombo(combo, platform)).join(" / ");
}

export type KeyEventLike = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
};

function comboMatches(combo: Combo, event: KeyEventLike): boolean {
  if (combo.key !== event.key.toLowerCase()) return false;
  const mod = !!(event.metaKey || event.ctrlKey);
  if (!!combo.mod !== mod) return false;
  // `?` is produced with Shift on most layouts, so a combo that does not
  // declare `shift` still tolerates it for punctuation keys.
  const punctuation = combo.key.length === 1 && !/[a-z0-9]/.test(combo.key);
  if (!combo.shift && !!event.shiftKey && !punctuation) return false;
  if (combo.shift && !event.shiftKey) return false;
  if (!!combo.alt !== !!event.altKey) return false;
  return true;
}

/** Resolves an event to a shortcut id, or null when nothing claims it. */
export function matchShortcut(event: KeyEventLike): ShortcutId | null {
  // Longest-specificity first: ⇧⌘V must win over ⌘V.
  const ranked = [...SHORTCUTS].sort(
    (a, b) => specificity(b) - specificity(a),
  );
  for (const spec of ranked) {
    if (spec.combos.some((combo) => comboMatches(combo, event))) return spec.id;
  }
  return null;
}

function specificity(spec: ShortcutSpec): number {
  return Math.max(
    ...spec.combos.map((combo) => (combo.mod ? 1 : 0) + (combo.shift ? 2 : 0) + (combo.alt ? 4 : 0)),
  );
}

/** True when the event originated in a field where typing must not be hijacked. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as (HTMLElement & { tagName?: string }) | null;
  if (!element) return false;
  if (element.isContentEditable) return true;
  const tag = element.tagName?.toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function shortcutsByGroup(): { group: ShortcutGroup; items: ShortcutSpec[] }[] {
  const groups: ShortcutGroup[] = ["history", "clipboard", "structure", "workflow"];
  return groups.map((group) => ({ group, items: SHORTCUTS.filter((s) => s.group === group) }));
}
