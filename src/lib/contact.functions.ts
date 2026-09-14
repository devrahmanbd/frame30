import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const submitContactFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({
    name: z.string().max(100),
    email: z.string().max(254),
    phone: z.string().max(24).optional().nullable(),
    topic: z.enum(["sales", "support", "migration"]),
    message: z.string().max(4000),
    locale: z.enum(["en", "bn"]).default("en"),
    honeypot: z.string().max(200).optional().nullable(),
    renderedAt: z.number().finite().optional().nullable(),
  }).parse(data))
  .handler(async ({ data }) => {
    const { submitContact, flushContactOutbox } = await import("./contact.server");
    await flushContactOutbox().catch(() => ({ processed: 0 }));
    return submitContact(data);
  });