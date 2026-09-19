import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { EmailTemplateKind } from "./transactional-mailer.server";

type Client = SupabaseClient<Database>;

async function scope(db: Client, userId: string): Promise<string> {
  const { currentMerchantId } = await import("./marketing.server");
  return currentMerchantId(db, userId);
}

const templateKindSchema = z.enum([
  "newsletter",
  "order_confirmation",
  "invoice_delivery",
  "order_dispatched",
  "order_delivered",
  "customer_welcome",
]);

/* ----------------------------------------------------------- Email Settings */

export const getEmailSettingsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    const { getMerchantSmtpConfig } = await import("./smtp.server");
    const { getMerchantEmailTemplates } =
      await import("./transactional-mailer.server");

    const [{ summary: smtp }, templates] = await Promise.all([
      getMerchantSmtpConfig(context.supabase, merchantId),
      getMerchantEmailTemplates(context.supabase, merchantId),
    ]);

    return { smtp, templates };
  });

export const saveSmtpConfigFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        enabled: z.boolean(),
        host: z.string().trim().min(1, "Host is required"),
        port: z.number().int().min(1).max(65535),
        secure: z.boolean(),
        user: z.string().trim(),
        password: z.string().optional().nullable(),
        fromName: z.string().trim().min(1, "Sender name is required"),
        fromEmail: z.string().trim().email("Invalid sender email"),
        replyTo: z
          .string()
          .trim()
          .email()
          .optional()
          .nullable()
          .or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    const { saveMerchantSmtpConfig } = await import("./smtp.server");

    return saveMerchantSmtpConfig(context.supabase, merchantId, {
      enabled: data.enabled,
      host: data.host,
      port: data.port,
      secure: data.secure,
      user: data.user,
      password: data.password || null,
      fromName: data.fromName,
      fromEmail: data.fromEmail,
      replyTo: data.replyTo || null,
    });
  });

export const testSmtpConnectionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        recipientEmail: z.string().trim().email("Invalid recipient email"),
        // Optional ad-hoc config to test before saving
        adhocConfig: z
          .object({
            host: z.string().trim().min(1),
            port: z.number().int().min(1).max(65535),
            secure: z.boolean(),
            user: z.string().trim(),
            password: z.string().optional().nullable(),
            fromName: z.string().trim().min(1),
            fromEmail: z.string().trim().email(),
            replyTo: z
              .string()
              .trim()
              .email()
              .optional()
              .nullable()
              .or(z.literal("")),
          })
          .optional()
          .nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    const { getMerchantSmtpConfig, sendSmtpMail, verifySmtpConnection } =
      await import("./smtp.server");
    const { unsealSecret } = await import("./webhook-secret.server");

    let cfg;
    let password: string | null = null;

    if (data.adhocConfig) {
      cfg = {
        enabled: true,
        host: data.adhocConfig.host,
        port: data.adhocConfig.port,
        secure: data.adhocConfig.secure,
        user: data.adhocConfig.user,
        fromName: data.adhocConfig.fromName,
        fromEmail: data.adhocConfig.fromEmail,
        replyTo: data.adhocConfig.replyTo || null,
      };
      password = data.adhocConfig.password || null;
    } else {
      const { config: saved } = await getMerchantSmtpConfig(
        context.supabase,
        merchantId,
      );
      if (!saved || !saved.host) {
        return { ok: false, error: "SMTP is not configured yet." };
      }
      cfg = saved;
      if (saved.sealedPass) {
        password = await unsealSecret(saved.sealedPass);
      }
    }

    // Step 1: Handshake verification
    const verifyResult = await verifySmtpConnection(cfg, password);
    if (!verifyResult.ok) {
      return { ok: false, error: `Connection failed: ${verifyResult.error}` };
    }

    // Step 2: Send test email
    const mailResult = await sendSmtpMail(cfg, password, {
      to: data.recipientEmail,
      subject: `[Test] SMTP Connected — Framique Email Gateway`,
      text: `Hello!\n\nThis is a test message confirming that your custom SMTP server (${cfg.host}:${cfg.port}) is successfully connected to Framique.\n\nAll outbound store emails, purchase confirmations, and newsletters will now route through your verified custom domain.`,
      html: `
        <div style="font-family: sans-serif; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; max-width: 500px;">
          <h2 style="color: #0f172a; margin-top: 0;">SMTP Gateway Connected!</h2>
          <p style="color: #334155; font-size: 15px; line-height: 1.5;">
            Your custom SMTP server (<strong>${cfg.host}:${cfg.port}</strong>) is verified and ready to send.
          </p>
          <div style="margin-top: 20px; padding: 12px 16px; background-color: #f1f5f9; border-radius: 6px; font-size: 13px; color: #475569;">
            Sender: ${cfg.fromName} &lt;${cfg.fromEmail}&gt;<br>
            Timestamp: ${new Date().toISOString()}
          </div>
        </div>
      `,
    });

    if (mailResult.ok) {
      return {
        ok: true,
        message: `Test email dispatched successfully to ${data.recipientEmail}`,
      };
    }
    return { ok: false, error: mailResult.error };
  });

/* ------------------------------------------------------- Template Customizer */

export const saveEmailTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: templateKindSchema,
        brandColor: z
          .string()
          .trim()
          .regex(/^#[0-9a-fA-F]{6}$/, "Must be valid hex color (e.g. #0f172a)")
          .optional(),
        logoUrl: z
          .string()
          .trim()
          .url()
          .optional()
          .nullable()
          .or(z.literal("")),
        headerTitle: z.string().trim().min(1, "Header title is required"),
        subjectTemplate: z
          .string()
          .trim()
          .min(1, "Subject template is required"),
        bodyTemplate: z.string().trim().min(1, "Body template is required"),
        ctaText: z.string().trim().optional(),
        ctaUrl: z.string().trim().optional(),
        footerText: z.string().trim().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    const { saveMerchantEmailTemplate } =
      await import("./transactional-mailer.server");

    return saveMerchantEmailTemplate(
      context.supabase,
      merchantId,
      data.kind as EmailTemplateKind,
      {
        brandColor: data.brandColor,
        logoUrl: data.logoUrl || null,
        headerTitle: data.headerTitle,
        subjectTemplate: data.subjectTemplate,
        bodyTemplate: data.bodyTemplate,
        ctaText: data.ctaText,
        ctaUrl: data.ctaUrl,
        footerText: data.footerText,
      },
    );
  });

export const sendTemplatePreviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: templateKindSchema,
        recipientEmail: z.string().trim().email("Invalid recipient email"),
        brandColor: z.string().trim().optional(),
        logoUrl: z.string().trim().optional().nullable(),
        headerTitle: z.string().trim().min(1),
        subjectTemplate: z.string().trim().min(1),
        bodyTemplate: z.string().trim().min(1),
        ctaText: z.string().trim().optional(),
        ctaUrl: z.string().trim().optional(),
        footerText: z.string().trim().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    const { renderEmailHtml, interpolate } =
      await import("./transactional-mailer.server");
    const { sendTenantMail } = await import("./smtp.server");

    const { data: merchant } = await context.supabase
      .from("merchants")
      .select("name, slug")
      .eq("id", merchantId)
      .maybeSingle();

    const vars: Record<string, string> = {
      store_name: merchant?.name ?? "Demo Store",
      store_slug: merchant?.slug ?? "demo",
      customer_name: "Valued Shopper",
      order_number: "FQ-2026-PREVIEW",
      total_amount: "৳ 1,850.00",
      invoice_number: "INV-2026-001",
      carrier_name: "Steadfast",
      awb_number: "SF-8849201",
      tracking_url: "https://framique.com/track",
    };

    const subject = `[PREVIEW] ${interpolate(data.subjectTemplate, vars)}`;
    const headerTitle = interpolate(data.headerTitle, vars);
    const bodyText = interpolate(data.bodyTemplate, vars);

    const html = renderEmailHtml({
      storeName: merchant?.name ?? "Framique Store",
      brandColor: data.brandColor || "#0f172a",
      logoUrl: data.logoUrl || null,
      headerTitle,
      bodyText,
      ctaText: data.ctaText || "View Collection",
      ctaUrl: data.ctaUrl
        ? interpolate(data.ctaUrl, vars)
        : "https://framique.qubickle.com",
      footerText: data.footerText
        ? interpolate(data.footerText, vars)
        : "Preview test transmission",
    });

    const res = await sendTenantMail(context.supabase, merchantId, {
      to: data.recipientEmail,
      subject,
      text: `${headerTitle}\n\n${bodyText}`,
      html,
    });

    return {
      ok: res.ok,
      error: res.ok ? undefined : (res as { error?: string }).error,
    };
  });
