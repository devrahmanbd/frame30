import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission } from "./authz-middleware";
import { z } from "zod";

const orderInput = (d: unknown) =>
  z.object({ orderId: z.string().uuid(), reason: z.string().max(300).optional() }).parse(d);

export const loadOrderDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { loadOrderDetail: run } = await import("./orders-admin.server");
    return run(context.supabase, data.orderId);
  });

export const advanceOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        target: z.enum(["packed", "shipped", "delivered"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { advanceOrder: run } = await import("./orders-admin.server");
    return run(context.supabase, data.orderId, data.target);
  });

export const fulfillOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(orderInput)
  .handler(async ({ data, context }) => {
    const { fulfillOrder: run } = await import("./orders-admin.server");
    return run(context.supabase, data.orderId);
  });

export const cancelOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(orderInput)
  .handler(async ({ data, context }) => {
    const { cancelOrder: run } = await import("./orders-admin.server");
    return run(context.supabase, data.orderId, data.reason);
  });

export const refundOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(orderInput)
  .handler(async ({ data, context }) => {
    const { refundOrder: run } = await import("./orders-admin.server");
    return run(context.supabase, data.orderId, data.reason);
  });

export const declineRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(orderInput)
  .handler(async ({ data, context }) => {
    const { declineRefund: run } = await import("./orders-admin.server");
    return run(context.supabase, data.orderId, data.reason);
  });

export const amendOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        reason: z.string().min(4).max(300),
        shippingMinor: z.number().int().min(0).max(100_000_000),
        discountMinor: z.number().int().min(0).max(100_000_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { amendOrderAmounts } = await import("./orders-admin.server");
    return amendOrderAmounts(
      context.supabase,
      data.orderId,
      data.reason,
      data.shippingMinor,
      data.discountMinor,
    );
  });

export const bulkAdvanceOrders = createServerFn({ method: "POST" })
  .middleware([requirePermission("orders.update_status")])
  .inputValidator((d: unknown) =>
    z
      .object({
        orderIds: z.array(z.string().uuid()).min(1).max(100),
        target: z.enum(["next", "packed", "shipped", "delivered"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { bulkAdvanceOrders: run } = await import("./orders-admin.server");
    return run(context.supabase, data.orderIds, data.target);
  });

export const loadOrderDesk = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { loadOrderDesk: run } = await import("./orders-admin.server");
    return run(context.supabase, data.orderId);
  });

export const refundOrderLines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        lines: z
          .array(
            z.object({
              orderItemId: z.string().uuid(),
              quantity: z.number().int().min(1).max(10_000),
              restock: z.boolean(),
            }),
          )
          .min(1)
          .max(100),
        reason: z.enum([
          "damaged",
          "wrong_item",
          "not_as_described",
          "late_delivery",
          "customer_changed_mind",
          "price_adjustment",
          "duplicate_charge",
          "other",
        ]),
        note: z.string().max(300).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { refundOrderLines: run } = await import("./orders-admin.server");
    return run(context.supabase, data.orderId, data.lines, data.reason, data.note);
  });

export const recordCodCall = createServerFn({ method: "POST" })
  .middleware([requirePermission("orders.update_status")])
  .inputValidator((d: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        outcome: z.enum(["confirmed", "no_answer", "wrong_number", "refused", "callback_requested"]),
        note: z.string().max(300).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { recordCodCall: run } = await import("./orders-admin.server");
    return run(context.supabase, data.orderId, data.outcome, data.note);
  });

export const addOrderNote = createServerFn({ method: "POST" })
  .middleware([requirePermission("orders.update_status")])
  .inputValidator((d: unknown) =>
    z.object({ orderId: z.string().uuid(), body: z.string().min(2).max(2000), pinned: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { addOrderNote: run } = await import("./orders-admin.server");
    return run(context.supabase, data.orderId, data.body, data.pinned ?? false);
  });

export const deleteOrderNote = createServerFn({ method: "POST" })
  .middleware([requirePermission("orders.update_status")])
  .inputValidator((d: unknown) => z.object({ noteId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { deleteOrderNote: run } = await import("./orders-admin.server");
    return run(context.supabase, data.noteId);
  });

export const setOrderTags = createServerFn({ method: "POST" })
  .middleware([requirePermission("orders.update_status")])
  .inputValidator((d: unknown) =>
    z.object({ orderId: z.string().uuid(), tags: z.array(z.string().max(32)).max(20) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { setOrderTags: run } = await import("./orders-admin.server");
    return run(context.supabase, data.orderId, data.tags);
  });
