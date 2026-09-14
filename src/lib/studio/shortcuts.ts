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
  | "resetStyle"
  | "finder"
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
  { id: "publish", label: "Publish", group: "Actions", key: "p", mod: true, shift: true },
  { id: "undo", label: "Undo", group: "Actions", key: "z", mod: true },
  { id: "redo", label: "Redo", group: "Actions", key: "z", mod: true, shift: true },
  { id: "copy", label: "Copy", group: "Editing", key: "c", mod: true },
  { id: "paste", label: "Paste", group: "Editing", key: "v", mod: true },
  { id: "pasteStyle", label: "Paste style", group: "Editing", key: "v", mod: true, shift: true },
  { id: "duplicate", label: "Duplicate", group: "Editing", key: "d", mod: true },
  { id: "delete", label: "Delete", group: "Editing", key: "Delete" },
  { id: "resetStyle", label: "Reset style", group: "Editing", key: "r", mod: true, shift: true },
  { id: "finder", label: "Finder", group: "Go to", key: "e", mod: true },
  { id: "templates", label: "Templates library", group: "Go to", key: "l", mod: true, shift: true },
  { id: "pageSettings", label: "Page settings", group: "Go to", key: "y", mod: true, shift: true },
  { id: "siteSettings", label: "Site settings", group: "Go to", key: "k", mod: true },
  { id: "navigator", label: "Structure", group: "Go to", key: "i", mod: true, shift: true },
  { id: "history", label: "History", group: "Go to", key: "h", mod: true, shift: true },
  { id: "preview", label: "Preview changes", group: "Go to", key: "p", mod: true },
  { id: "hideHandles", label: "Hide element handles", group: "Editing", key: "h", mod: true },
  { id: "shortcuts", label: "Keyboard shortcuts", group: "Go to", key: "?", mod: true },
];

export type StudioPlatform = "mac" | "pc";

export function detectStudioPlatform(nav?: { platform?: string; userAgent?: string }): StudioPlatform {
  const source = `${nav?.platform ?? ""} ${nav?.userAgent ?? ""}`.toLowerCase();
  return /mac|iphone|ipad/.test(source) ? "mac" : "pc";
}

export function formatStudioShortcut(shortcut: StudioShortcut, platform: StudioPlatform = "pc"): string {
  const parts: string[] = [];
  if (shortcut.mod) parts.push(platform === "mac" ? "⌘" : "Ctrl");
  if (shortcut.shift) parts.push(platform === "mac" ? "⇧" : "Shift");
  if (shortcut.alt) parts.push(platform === "mac" ? "⌥" : "Alt");
  parts.push(shortcut.key === "Delete" ? "Del" : shortcut.key.toUpperCase());
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
  platform: StudioPlatform = "pc",
): StudioShortcut | undefined {
  const mod = platform === "mac" ? Boolean(event.metaKey) : Boolean(event.ctrlKey);
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  return STUDIO_SHORTCUTS.find((shortcut) => {
    if (shortcut.key.toLowerCase() !== key.toLowerCase()) return false;
    if (Boolean(shortcut.mod) !== mod) return false;
    if (Boolean(shortcut.shift) !== Boolean(event.shiftKey)) return false;
    if (Boolean(shortcut.alt) !== Boolean(event.altKey)) return false;
    return true;
  });
}

export function isTypingElement(target: unknown): boolean {
  const el = target as { tagName?: string; isContentEditable?: boolean } | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = (el.tagName ?? "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}
