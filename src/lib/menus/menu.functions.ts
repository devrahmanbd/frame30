import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function scope(db: SupabaseClient<Database>, userId: string) {
  const { currentMerchantId } = await import("../marketing.server");
  return currentMerchantId(db, userId);
}

const itemSchema = z.object({
  id: z.string().min(1).max(80),
  parentId: z.string().min(1).max(80).nullable(),
  position: z.number().int().min(0).max(10_000),
  kind: z.enum(["page", "post", "collection", "product", "custom"]),
  label: z.string().max(200),
  url: z.string().max(500),
  refId: z.string().max(80).nullable(),
  titleAttr: z.string().max(200),
  newTab: z.boolean(),
  cssClass: z.string().max(200),
});

export const menusWorkspaceFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listMenus, menuSources } = await import("./menu.server");
    const merchantId = await scope(context.supabase, context.userId);
    const [menus, sources] = await Promise.all([
      listMenus(context.supabase, merchantId),
      menuSources(context.supabase, merchantId),
    ]);
    return { menus, sources };
  });

export const menuCreateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ name: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    const { createMenu } = await import("./menu.server");
    const merchantId = await scope(context.supabase, context.userId);
    return { menu: await createMenu(context.supabase, merchantId, data.name) };
  });

export const menuSaveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        menuId: z.string().uuid(),
        name: z.string().max(120).optional(),
        locations: z.array(z.enum(["header", "footer", "mobile"])).optional(),
        items: z.array(itemSchema).max(300).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { saveMenu } = await import("./menu.server");
    const merchantId = await scope(context.supabase, context.userId);
    return { menu: await saveMenu(context.supabase, merchantId, data) };
  });

export const menuDeleteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ menuId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { deleteMenu } = await import("./menu.server");
    const merchantId = await scope(context.supabase, context.userId);
    await deleteMenu(context.supabase, merchantId, data.menuId);
    return { ok: true as const };
  });
