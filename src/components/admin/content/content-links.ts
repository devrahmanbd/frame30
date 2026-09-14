import type { ContentKind, ContentRow } from "@/lib/content-desk";

/**
 * Where each row action goes. Editors are still the existing screens until
 * Phase 12 ships the takeover shell; the desk only needs stable deep links.
 */
/** Phase 12: both kinds open the full-screen editor takeover. */
export function editHref(kind: ContentKind, id: string, editor?: "classic" | "builder"): string {
  const params = new URLSearchParams({ kind, id });
  if (editor) params.set("editor", editor);
  return `/admin/content/editor?${params.toString()}`;
}

export function newHref(kind: ContentKind): string {
  return `/admin/content/editor?kind=${kind}`;
}

export function previewHref(kind: ContentKind, row: Pick<ContentRow, "slug" | "status">, storeSlug: string): string {
  const path = kind === "page" ? `/store/${storeSlug}/pages/${row.slug}` : `/blog/${row.slug}`;
  return row.status === "published" ? path : `${path}?preview=1`;
}

export function permalinkPrefix(kind: ContentKind, storeSlug: string): string {
  return kind === "page" ? `/store/${storeSlug}/pages/` : `/blog/`;
}
