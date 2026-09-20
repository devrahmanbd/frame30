import type { ContentKind, ContentRow } from "@/lib/content-desk";

/**
 * Where each row action goes. Editors are still the existing screens until
 * Phase 12 ships the takeover shell; the desk only needs stable deep links.
 */
/** Phase 12: both kinds open the full-screen editor takeover. Pages are
 * builder-only (the block editor was removed for pages); posts keep the
 * classic writing surface. */
export function editHref(
  kind: ContentKind,
  id: string,
  editor?: "classic" | "builder",
): string {
  const chosen =
    kind === "page" ? "builder" : (editor ?? "classic");
  const params = new URLSearchParams({ kind, id, editor: chosen });
  return `/dashboard/content/editor?${params.toString()}`;
}

export function newHref(kind: ContentKind): string {
  const defaultEditor = kind === "page" ? "builder" : "classic";
  return `/dashboard/content/editor?kind=${kind}&editor=${defaultEditor}`;
}

export function previewHref(
  kind: ContentKind,
  row: Pick<ContentRow, "slug" | "status">,
  storeSlug: string,
): string {
  const path =
    kind === "page"
      ? `/store/${storeSlug}/pages/${row.slug}`
      : `/blog/${row.slug}`;
  return row.status === "published" ? path : `${path}?preview=1`;
}

export function permalinkPrefix(kind: ContentKind, storeSlug: string): string {
  return kind === "page" ? `/store/${storeSlug}/pages/` : `/blog/`;
}
