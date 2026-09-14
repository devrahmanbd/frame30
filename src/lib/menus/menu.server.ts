/**
 * Phase 16 — navigation menus, server half.
 *
 * The editor saves a whole menu at once: the flat item list replaces what is
 * stored, in one pass, so ordering and nesting can never end up half-applied.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  type MenuItem,
  type MenuItemKind,
  type MenuLocation,
  type MenuSource,
  type NavMenu,
  normalise,
  uniqueHandle,
} from "./menu";

type Db = SupabaseClient<Database>;

export class MenuError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

type MenuRow = { id: string; name: string; handle: string; locations: string[] };
type ItemRow = {
  id: string;
  menu_id: string;
  parent_id: string | null;
  position: number;
  kind: string;
  label: string;
  url: string;
  ref_id: string | null;
  title_attr: string | null;
  new_tab: boolean;
  css_class: string | null;
};

const LOCATIONS: MenuLocation[] = ["header", "footer", "mobile"];
const KINDS: MenuItemKind[] = ["page", "post", "collection", "product", "custom"];

function toItem(row: ItemRow): MenuItem {
  return {
    id: row.id,
    parentId: row.parent_id,
    position: row.position,
    kind: (KINDS as string[]).includes(row.kind) ? (row.kind as MenuItemKind) : "custom",
    label: row.label,
    url: row.url,
    refId: row.ref_id,
    titleAttr: row.title_attr ?? "",
    newTab: row.new_tab,
    cssClass: row.css_class ?? "",
  };
}

export async function listMenus(db: Db, merchantId: string): Promise<NavMenu[]> {
  const { data, error } = await db
    .from("nav_menus")
    .select("id, name, handle, locations")
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: true });
  if (error) throw new MenuError("list_failed", error.message);
  const menus = (data ?? []) as unknown as MenuRow[];
  if (menus.length === 0) return [];

  const items = await db
    .from("nav_menu_items")
    .select("id, menu_id, parent_id, position, kind, label, url, ref_id, title_attr, new_tab, css_class")
    .in(
      "menu_id",
      menus.map((menu) => menu.id),
    )
    .order("position", { ascending: true });
  if (items.error) throw new MenuError("list_failed", items.error.message);
  const rows = (items.data ?? []) as unknown as ItemRow[];

  return menus.map((menu) => ({
    id: menu.id,
    name: menu.name,
    handle: menu.handle,
    locations: (menu.locations ?? []).filter((entry): entry is MenuLocation =>
      (LOCATIONS as string[]).includes(entry),
    ),
    items: rows.filter((row) => row.menu_id === menu.id).map(toItem),
  }));
}

export async function createMenu(db: Db, merchantId: string, name: string): Promise<NavMenu> {
  const clean = name.trim();
  if (!clean) throw new MenuError("no_name", "Give the menu a name");
  const existing = await db.from("nav_menus").select("handle").eq("merchant_id", merchantId);
  const handle = uniqueHandle(clean, ((existing.data ?? []) as { handle: string }[]).map((r) => r.handle));

  const { data, error } = await db
    .from("nav_menus")
    .insert({ merchant_id: merchantId, name: clean, handle, locations: [] } as never)
    .select("id, name, handle, locations")
    .single();
  if (error) throw new MenuError("create_failed", error.message);
  const row = data as unknown as MenuRow;
  return { id: row.id, name: row.name, handle: row.handle, locations: [], items: [] };
}

async function requireMenu(db: Db, merchantId: string, menuId: string): Promise<MenuRow> {
  const { data, error } = await db
    .from("nav_menus")
    .select("id, name, handle, locations")
    .eq("merchant_id", merchantId)
    .eq("id", menuId)
    .maybeSingle();
  if (error) throw new MenuError("load_failed", error.message);
  if (!data) throw new MenuError("not_found", "That menu no longer exists");
  return data as unknown as MenuRow;
}

export type SaveMenuInput = {
  menuId: string;
  name?: string;
  locations?: MenuLocation[];
  items?: MenuItem[];
};

/**
 * Replaces the menu's items wholesale. Client-side ids for new rows are not
 * trusted: rows are re-created, and parent links are re-mapped onto the ids the
 * database hands back.
 */
export async function saveMenu(db: Db, merchantId: string, input: SaveMenuInput): Promise<NavMenu> {
  await requireMenu(db, merchantId, input.menuId);

  if (input.name !== undefined || input.locations !== undefined) {
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined && input.name.trim()) patch.name = input.name.trim();
    if (input.locations !== undefined) patch.locations = input.locations;
    if (Object.keys(patch).length > 0) {
      const { error } = await db
        .from("nav_menus")
        .update(patch as never)
        .eq("id", input.menuId)
        .eq("merchant_id", merchantId);
      if (error) throw new MenuError("save_failed", error.message);
    }
  }

  if (input.items) {
    const wipe = await db.from("nav_menu_items").delete().eq("menu_id", input.menuId);
    if (wipe.error) throw new MenuError("save_failed", wipe.error.message);

    const ordered = normalise(input.items);
    if (ordered.length > 0) {
      const idMap = new Map<string, string>();
      for (const item of ordered) idMap.set(item.id, crypto.randomUUID());
      const rows = ordered.map((item) => ({
        id: idMap.get(item.id)!,
        menu_id: input.menuId,
        parent_id: item.parentId ? (idMap.get(item.parentId) ?? null) : null,
        position: item.position,
        kind: item.kind,
        label: item.label.trim() || "Untitled",
        url: item.url.trim() || "#",
        ref_id: item.refId,
        title_attr: item.titleAttr.trim() || null,
        new_tab: item.newTab,
        css_class: item.cssClass.trim() || null,
      }));
      const { error } = await db.from("nav_menu_items").insert(rows as never);
      if (error) throw new MenuError("save_failed", error.message);
    }
  }

  const menus = await listMenus(db, merchantId);
  const saved = menus.find((menu) => menu.id === input.menuId);
  if (!saved) throw new MenuError("not_found", "That menu no longer exists");
  return saved;
}

export async function deleteMenu(db: Db, merchantId: string, menuId: string): Promise<void> {
  await requireMenu(db, merchantId, menuId);
  const { error } = await db.from("nav_menus").delete().eq("id", menuId).eq("merchant_id", merchantId);
  if (error) throw new MenuError("delete_failed", error.message);
}

/* --------------------------------------------------------- add-item panel */

/** Pages, posts, collections and products a merchant can link to. */
export async function menuSources(db: Db, merchantId: string): Promise<MenuSource[]> {
  const out: MenuSource[] = [];

  // The live schema is a superset of the generated snapshot; content tables are
  // read through a permissive view of the same client.
  const any = db as unknown as SupabaseClient<never, never, never>;

  const pages = await any
    .from("storefront_pages")
    .select("id, title, slug")
    .eq("merchant_id", merchantId)
    .is("deleted_at", null)
    .order("title", { ascending: true })
    .limit(200);
  for (const row of (pages.data ?? []) as { id: string; title: string; slug: string }[]) {
    out.push({ id: row.id, kind: "page", label: row.title || row.slug, url: `/pages/${row.slug}` });
  }

  const posts = await any
    .from("articles")
    .select("id, title, slug")
    .eq("merchant_id", merchantId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(200);
  for (const row of (posts.data ?? []) as { id: string; title: string; slug: string }[]) {
    out.push({ id: row.id, kind: "post", label: row.title || row.slug, url: `/blog/${row.slug}` });
  }

  const collections = await any
    .from("collections")
    .select("id, name, slug")
    .eq("merchant_id", merchantId)
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .limit(200);
  for (const row of (collections.data ?? []) as { id: string; name: string; slug: string }[]) {
    out.push({ id: row.id, kind: "collection", label: row.name || row.slug, url: `/c/${row.slug}` });
  }

  const products = await any
    .from("products")
    .select("id, title, slug")
    .eq("merchant_id", merchantId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(200);
  for (const row of (products.data ?? []) as { id: string; title: string; slug: string }[]) {
    out.push({ id: row.id, kind: "product", label: row.title || row.slug, url: `/p/${row.slug}` });
  }

  return out;
}
