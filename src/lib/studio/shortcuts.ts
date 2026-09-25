/**
 * Phase 14 — the 19 editor keyboard shortcuts, verbatim from the Elementor
 * reference walk (Findings §B). Pure data plus a matcher so both the help
 * modal and the shell read from one list.
 */

export type StudioShortcutId =
  | "save"
  | "publish"
  | "undo"
  | "redo"
  | "copy"
  | "paste"
  | "pasteStyle"
  | "duplicate"
  | "delete"
  | "move_up"
  | "move_down"
  | "deselect"
  | "resetStyle"
  | "finder"
  | "search_layers"
  | "templates"
  | "pageSettings"
  | "siteSettings"
  | "navigator"
  | "history"
  | "preview"
  | "hideHandles"
  | "shortcuts";

export type StudioShortcut = {
  id: StudioShortcutId;
  label: string;
  group: "Actions" | "Go to" | "Editing";
  /** Lower-case key, or "Delete". */
  key: string;
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
};

export const STUDIO_SHORTCUTS: StudioShortcut[] = [
  { id: "save", label: "Save", group: "Actions", key: "s", mod: true },
  {
    id: "publish",
    label: "Publish",
    group: "Actions",
    key: "p",
    mod: true,
    shift: true,
  },
  { id: "undo", label: "Undo", group: "Actions", key: "z", mod: true },
  {
    id: "redo",
    label: "Redo",
    group: "Actions",
    key: "z",
    mod: true,
    shift: true,
  },
  { id: "copy", label: "Copy", group: "Editing", key: "c", mod: true },
  { id: "paste", label: "Paste", group: "Editing", key: "v", mod: true },
  {
    id: "pasteStyle",
    label: "Paste style",
    group: "Editing",
    key: "v",
    mod: true,
    shift: true,
  },
  {
    id: "duplicate",
    label: "Duplicate",
    group: "Editing",
    key: "d",
    mod: true,
  },
  { id: "delete", label: "Delete", group: "Editing", key: "Delete" },
  {
    id: "move_up",
    label: "Move up",
    group: "Editing",
    key: "ArrowUp",
    mod: true,
  },
  {
    id: "move_down",
    label: "Move down",
    group: "Editing",
    key: "ArrowDown",
    mod: true,
  },
  { id: "deselect", label: "Deselect", group: "Editing", key: "Escape" },
  {
    id: "resetStyle",
    label: "Reset style",
    group: "Editing",
    key: "r",
    mod: true,
    shift: true,
  },
  { id: "finder", label: "Finder", group: "Go to", key: "e", mod: true },
  {
    id: "search_layers",
    label: "Search layers",
    group: "Go to",
    key: "f",
    mod: true,
    shift: true,
  },
  {
    id: "templates",
    label: "Templates library",
    group: "Go to",
    key: "l",
    mod: true,
    shift: true,
  },
  {
    id: "pageSettings",
    label: "Page settings",
    group: "Go to",
    key: "y",
    mod: true,
    shift: true,
  },
  {
    id: "siteSettings",
    label: "Site settings",
    group: "Go to",
    key: "k",
    mod: true,
  },
  {
    id: "navigator",
    label: "Structure",
    group: "Go to",
    key: "i",
    mod: true,
    shift: true,
  },
  {
    id: "history",
    label: "History",
    group: "Go to",
    key: "h",
    mod: true,
    shift: true,
  },
  {
    id: "preview",
    label: "Preview changes",
    group: "Go to",
    key: "p",
    mod: true,
  },
  {
    id: "hideHandles",
    label: "Hide element handles",
    group: "Editing",
    key: "h",
    mod: true,
  },
  {
    id: "shortcuts",
    label: "Keyboard shortcuts",
    group: "Go to",
    key: "?",
    mod: true,
  },
];

export type StudioPlatform = "mac" | "pc";

export function detectStudioPlatform(nav?: {
  platform?: string;
  userAgent?: string;
}): StudioPlatform {
  const source = `${nav?.platform ?? ""} ${nav?.userAgent ?? ""}`.toLowerCase();
  return /mac|iphone|ipad/.test(source) ? "mac" : "pc";
}

const STUDIO_KEY_LABEL: Record<string, string> = {
  Delete: "Del",
  Escape: "Esc",
  ArrowUp: "↑",
  ArrowDown: "↓",
};

export function formatStudioShortcut(
  shortcut: StudioShortcut,
  platform: StudioPlatform = "pc",
): string {
  const parts: string[] = [];
  if (shortcut.mod) parts.push(platform === "mac" ? "⌘" : "Ctrl");
  if (shortcut.shift) parts.push(platform === "mac" ? "⇧" : "Shift");
  if (shortcut.alt) parts.push(platform === "mac" ? "⌥" : "Alt");
  parts.push(
    STUDIO_KEY_LABEL[shortcut.key] ??
      (shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key),
  );
  return parts.join(platform === "mac" ? "" : "+");
}

export type KeyEventLike = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
};

export function matchStudioShortcut(
  event: KeyEventLike,
  // Kept for call-site compatibility: the mod key is accepted from *either*
  // physical key (like the classic `matchShortcut`), so the platform only
  // matters for display, never for matching.
  _platform: StudioPlatform = "pc",
): StudioShortcut | undefined {
  // Either ⌘ or Ctrl counts as mod, matching the classic builder behaviour.
  const mod = Boolean(event.metaKey || event.ctrlKey);
  const raw = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  // Backspace deletes, like the classic map's `delete` + `backspace` combos.
  const key = raw === "Backspace" ? "Delete" : raw;
  return STUDIO_SHORTCUTS.find((shortcut) => {
    const want =
      shortcut.key.length === 1 ? shortcut.key.toLowerCase() : shortcut.key;
    if (want !== (key.length === 1 ? key.toLowerCase() : key)) {
      // Bare `?` (with or without the Shift that produces it) opens help.
      if (shortcut.id === "shortcuts" && (key === "?" || key === "/")) {
        if (mod || event.altKey) return false;
        return true;
      }
      return false;
    }
    if (Boolean(shortcut.mod) !== mod) {
      // The help entry is declared mod+? but a bare `?` must work too.
      if (shortcut.id === "shortcuts" && !mod) return true;
      return false;
    }
    // `?` arrives with Shift held on most layouts; tolerate it for
    // punctuation keys the way the classic matcher does.
    const punctuation = want.length === 1 && !/[a-z0-9]/.test(want);
    if (!shortcut.shift && event.shiftKey && !punctuation) return false;
    if (shortcut.shift && !event.shiftKey) return false;
    if (Boolean(shortcut.alt) !== Boolean(event.altKey)) return false;
    return true;
  });
}

/**
 * Normalises the legacy `paste_style` spelling (used by the classic
 * dispatch table and its contract test) to the studio `pasteStyle` id.
 * Returns undefined for unknown ids so dispatchers can report "unhandled"
 * and leave the browser's native binding alone.
 */
export function resolveStudioShortcutId(
  id: string,
): StudioShortcutId | undefined {
  if (id === "paste_style") return "pasteStyle";
  return STUDIO_SHORTCUTS.some((shortcut) => shortcut.id === id)
    ? (id as StudioShortcutId)
    : undefined;
}

export function isTypingElement(target: unknown): boolean {
  const el = target as { tagName?: string; isContentEditable?: boolean } | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = (el.tagName ?? "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}
