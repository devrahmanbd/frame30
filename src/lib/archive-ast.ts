import type { ThemeAst } from "@/lib/builder-ast";

/**
 * Remove the theme's authored empty-state panel(s) from an archive body.
 *
 * `empty_state` is an ordinary authored section in the archive composition,
 * not a context slot, so the host's `contextSlots` grant alone cannot hide
 * it. An archive with rows must never carry "Nothing in this archive yet"
 * underneath the listing (Swarm 4 review §(u.5)); the host strips the panel
 * while the feed is non-empty, and the empty feed keeps it.
 *
 * The recursion is deliberate: a merchant may place the empty state inside a
 * container, and it must still be hidden on a live archive.
 */
export function stripArchiveEmptyState(
  sections: ThemeAst["main"],
): ThemeAst["main"] {
  return sections
    .filter((section) => section.type !== "empty_state")
    .map((section) =>
      section.children
        ? { ...section, children: stripArchiveEmptyState(section.children) }
        : section,
    );
}
