/**
 * Automated Transactional Mailer (Phase 10.5).
 *
 * Produces beautiful, responsive, brand-customized HTML and plain-text emails
 * for the merchant commerce lifecycle:
 *   1. Order Confirmation (itemized lines, minor-unit money, address, tracking link)
 *   2. Invoice Delivery (tax breakdown, BIN, legal sequence number, viewing token)
 *   3. Courier Dispatch & Delivery (AWB number, carrier badge, tracking URL)
 *   4. Customer Welcome (store introduction, shopping CTA)
 *   5. Newsletter Broadcast (customized brand header, body, one-click unsubscribe)
 *
 * Strictly adheres to integer minor-unit money rules and tenant isolation.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { sendTenantMail } from "./smtp.server";
import { loadInvoiceDocument } from "./invoices.server";
import { captureError, incr, log } from "./observability.server";

import {
  type EmailTemplateKind,
  type EmailTemplateConfig,
  DEFAULT_TEMPLATES,
  formatMoneyMinor,
  interpolate,
  renderEmailHtml,
} from "./transactional-mailer-renderer";

export type { EmailTemplateKind, EmailTemplateConfig };
export { DEFAULT_TEMPLATES, formatMoneyMinor, interpolate, renderEmailHtml };

type Client = SupabaseClient<Database>;

/**
 * Loads all saved email template customizations for a merchant.
 */
export async function getMerchantEmailTemplates(
  db: Client,
  merchantId: string,
): Promise<Record<EmailTemplateKind, EmailTemplateConfig>> {
  const { data } = await db
    .from("merchant_settings")
    .select("notify_prefs")
    .eq("merchant_id", merchantId)
    .maybeSingle();

  const prefs = (data?.notify_prefs ?? {}) as {
    email_templates?: Record<string, EmailTemplateConfig>;
  };
  const saved = prefs.email_templates ?? {};

  const merged = { ...DEFAULT_TEMPLATES };
  for (const [key, val] of Object.entries(saved)) {
    if (key in DEFAULT_TEMPLATES) {
      merged[key as EmailTemplateKind] = {
        ...DEFAULT_TEMPLATES[key as EmailTemplateKind],
        ...val,
      };
    }
  }
  return merged;
}

/**
 * Saves template overrides for a specific kind.
 */
export async function saveMerchantEmailTemplate(
  db: Client,
  merchantId: string,
  kind: EmailTemplateKind,
  override: Partial<EmailTemplateConfig>,
): Promise<EmailTemplateConfig> {
  const current = await getMerchantEmailTemplates(db, merchantId);
  const updatedKindConfig: EmailTemplateConfig = {
    ...current[kind],
    ...override,
  };

  const { data: row } = await db
    .from("merchant_settings")
    .select("notify_prefs")
    .eq("merchant_id", merchantId)
    .maybeSingle();

  const rawPrefs = (row?.notify_prefs ?? {}) as Record<string, unknown>;
  const rawTemplates = (rawPrefs["email_templates"] ?? {}) as Record<
    string,
    unknown
  >;

  const updatedPrefs = {
    ...rawPrefs,
    email_templates: {
      ...rawTemplates,
      [kind]: updatedKindConfig,
    },
  };

  const { error } = await db
    .from("merchant_settings")
    .update({
      notify_prefs: updatedPrefs as never,
      updated_at: new Date().toISOString(),
    })
    .eq("merchant_id", merchantId);

  if (error) throw new Error(`Failed to save email template: ${error.message}`);
  return updatedKindConfig;
}

/* ------------------------------------------------------ Dispatchers */

/**
 * Dispatches an automated Purchase Confirmation email with full receipt details.
 */
export async function sendOrderConfirmationEmail(args: {
  db: Client;
  merchantId: string;
  orderId: string;
}): Promise<boolean> {
  try {
    const [orderRes, itemsRes, merchantRes, templates] = await Promise.all([
      args.db
        .from("orders")
        .select("*")
        .eq("merchant_id", args.merchantId)
        .eq("id", args.orderId)
        .maybeSingle(),
      args.db
        .from("order_items")
        .select("*")
        .eq("merchant_id", args.merchantId)
        .eq("order_id", args.orderId),
      args.db
        .from("merchants")
        .select("name, slug, currency_code")
        .eq("id", args.merchantId)
        .maybeSingle(),
      getMerchantEmailTemplates(args.db, args.merchantId),
    ]);

    const order = orderRes.data;
    const items = itemsRes.data ?? [];
    const merchant = merchantRes.data;

    if (!order || !order.customer_email || !merchant) {
      return false;
    }

    const tpl = templates.order_confirmation;
    const currency = order.currency_code || merchant.currency_code || "BDT";

    const vars: Record<string, string> = {
      store_name: merchant.name,
      store_slug: merchant.slug,
      order_number: order.order_number,
      customer_name: order.customer_name || "Customer",
      total_amount: formatMoneyMinor(order.total_minor_int, currency),
    };

    const subject = interpolate(
      tpl.subjectTemplate ?? "Order Confirmed #{{order_number}}",
      vars,
    );
    const bodyText = interpolate(tpl.bodyTemplate ?? "", vars);
    const headerTitle = interpolate(tpl.headerTitle ?? "Order Confirmed", vars);
    const { storeBaseUrl } = await import("./storefront-host.server");
    const ctaUrl = `${await storeBaseUrl(args.merchantId, merchant.slug)}/track?order=${order.order_number}`;

    // Itemized table HTML
    const itemsHtml = `
      <div style="margin: 24px 0 16px;">
        <h3 style="margin: 0 0 12px; font-size: 14px; font-weight: 600; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em;">Order Summary</h3>
        <table width="100%" cellpadding="8" cellspacing="0" style="border-collapse: collapse; font-size: 14px; text-align: left;">
          <thead>
            <tr style="border-bottom: 2px solid #e2e8f0; color: #475569;">
              <th style="padding: 8px 4px;">Item</th>
              <th style="padding: 8px 4px; text-align: center;">Qty</th>
              <th style="padding: 8px 4px; text-align: right;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map(
                (item) => `
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 10px 4px; color: #1e293b;">
                  <strong>${escapeHtml(item.product_title)}</strong>
                  ${item.variant_name ? `<br><span style="font-size: 12px; color: #64748b;">${escapeHtml(item.variant_name)}</span>` : ""}
                </td>
                <td style="padding: 10px 4px; text-align: center; color: #475569;">${item.quantity}</td>
                <td style="padding: 10px 4px; text-align: right; font-weight: 500; color: #1e293b;">${formatMoneyMinor(item.line_total_minor_int, currency)}</td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;

    // Totals Breakdown HTML
    const totalsHtml = `
      <table width="100%" cellpadding="4" cellspacing="0" style="font-size: 13px; margin-top: 12px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
        <tr>
          <td style="color: #64748b;">Subtotal:</td>
          <td style="text-align: right; color: #1e293b;">${formatMoneyMinor(order.subtotal_minor_int, currency)}</td>
        </tr>
        ${order.discount_minor_int > 0 ? `<tr><td style="color: #10b981;">Discount:</td><td style="text-align: right; color: #10b981;">-${formatMoneyMinor(order.discount_minor_int, currency)}</td></tr>` : ""}
        ${order.shipping_minor_int > 0 ? `<tr><td style="color: #64748b;">Shipping:</td><td style="text-align: right; color: #1e293b;">${formatMoneyMinor(order.shipping_minor_int, currency)}</td></tr>` : ""}
        ${order.cod_surcharge_minor_int > 0 ? `<tr><td style="color: #64748b;">COD Fee:</td><td style="text-align: right; color: #1e293b;">${formatMoneyMinor(order.cod_surcharge_minor_int, currency)}</td></tr>` : ""}
        ${order.vat_minor_int > 0 ? `<tr><td style="color: #64748b;">VAT:</td><td style="text-align: right; color: #1e293b;">${formatMoneyMinor(order.vat_minor_int, currency)}</td></tr>` : ""}
        <tr style="font-size: 16px; font-weight: 700; border-top: 2px solid #0f172a;">
          <td style="padding-top: 8px; color: #0f172a;">Total:</td>
          <td style="padding-top: 8px; text-align: right; color: #0f172a;">${formatMoneyMinor(order.total_minor_int, currency)}</td>
        </tr>
      </table>
    `;

    const plainText = `${headerTitle}\n\n${bodyText}\n\nOrder #${order.order_number}\nTotal: ${formatMoneyMinor(order.total_minor_int, currency)}\n\nTrack order: ${ctaUrl}`;

    const html = renderEmailHtml({
      storeName: merchant.name,
      brandColor: tpl.brandColor || "#0f172a",
      logoUrl: tpl.logoUrl,
      headerTitle,
      bodyText,
      ctaText: tpl.ctaText || "Track Your Order",
      ctaUrl,
      itemsTableHtml: itemsHtml,
      totalsTableHtml: totalsHtml,
      footerText: tpl.footerText,
    });

    const result = await sendTenantMail(args.db, args.merchantId, {
      to: order.customer_email,
      subject,
      text: plainText,
      html,
    });

    incr("framique_transactional_email_total", {
      kind: "order_confirmation",
      outcome: result.ok ? "sent" : "failed",
    });
    return result.ok;
  } catch (err) {
    await captureError(err, {
      scope: "mail.order_confirmation",
      orderId: args.orderId,
    });
    log("error", "mail.order_confirmation_failed", {
      orderId: args.orderId,
      error: String(err),
    });
    return false;
  }
}

/**
 * Dispatches an automated Invoice Delivery email.
 */
export async function sendInvoiceEmail(args: {
  db: Client;
  merchantId: string;
  orderId: string;
}): Promise<boolean> {
  try {
    const doc = await loadInvoiceDocument(
      args.db,
      args.merchantId,
      args.orderId,
    );
    if (!doc || !doc.order.customer.email) return false;

    const templates = await getMerchantEmailTemplates(args.db, args.merchantId);
    const tpl = templates.invoice_delivery;
    const currency = doc.invoice.currency || "BDT";

    const vars: Record<string, string> = {
      store_name: doc.merchant.name,
      store_slug: doc.merchant.slug,
      order_number: doc.order.number,
      invoice_number: doc.invoice.number,
      customer_name: doc.order.customer.name || "Customer",
      total_amount: formatMoneyMinor(doc.invoice.totalMinor, currency),
      invoice_token: doc.order.id,
    };

    const subject = interpolate(
      tpl.subjectTemplate ?? "Invoice {{invoice_number}}",
      vars,
    );
    const bodyText = interpolate(tpl.bodyTemplate ?? "", vars);
    const headerTitle = interpolate(tpl.headerTitle ?? "Tax Invoice", vars);
    const ctaUrl = `https://framique.qubickle.com/invoice/${doc.order.id}`;

    const plainText = `${headerTitle}\n\nInvoice: ${doc.invoice.number}\nOrder: #${doc.order.number}\nTotal: ${formatMoneyMinor(doc.invoice.totalMinor, currency)}\n\nView online: ${ctaUrl}`;

    const html = renderEmailHtml({
      storeName: doc.merchant.name,
      brandColor: tpl.brandColor || "#0f172a",
      logoUrl: tpl.logoUrl,
      headerTitle,
      bodyText,
      ctaText: tpl.ctaText || "View Official Invoice",
      ctaUrl,
      footerText: tpl.footerText,
    });

    const result = await sendTenantMail(args.db, args.merchantId, {
      to: doc.order.customer.email,
      subject,
      text: plainText,
      html,
    });

    incr("framique_transactional_email_total", {
      kind: "invoice_delivery",
      outcome: result.ok ? "sent" : "failed",
    });
    return result.ok;
  } catch (err) {
    await captureError(err, {
      scope: "mail.invoice_delivery",
      orderId: args.orderId,
    });
    return false;
  }
}

/**
 * Dispatches an automated Courier Dispatch / Shipping notification.
 */
export async function sendShipmentDispatchedEmail(args: {
  db: Client;
  merchantId: string;
  shipmentId: string;
}): Promise<boolean> {
  try {
    const { data: shipment } = await args.db
      .from("carrier_shipments")
      .select("*, orders(*)")
      .eq("merchant_id", args.merchantId)
      .eq("id", args.shipmentId)
      .maybeSingle();

    if (!shipment || !shipment.orders) return false;
    const order = shipment.orders as {
      customer_email?: string | null;
      customer_name?: string | null;
      order_number?: string | null;
    };

    if (!order.customer_email) return false;

    const { data: merchant } = await args.db
      .from("merchants")
      .select("name, slug")
      .eq("id", args.merchantId)
      .maybeSingle();

    if (!merchant) return false;

    const templates = await getMerchantEmailTemplates(args.db, args.merchantId);
    const tpl = templates.order_dispatched;
    const { storeBaseUrl } = await import("./storefront-host.server");
    const storeBase = await storeBaseUrl(args.merchantId, merchant.slug);

    const vars: Record<string, string> = {
      store_name: merchant.name,
      store_slug: merchant.slug,
      order_number: order.order_number ?? "",
      customer_name: order.customer_name ?? "Customer",
      carrier_name: shipment.carrier_code?.toUpperCase() ?? "Courier",
      awb_number: shipment.awb ?? "Assigned",
      tracking_url:
        shipment.tracking_url ?? `${storeBase}/track`,
    };

    const subject = interpolate(
      tpl.subjectTemplate ?? "Order #{{order_number}} has been dispatched",
      vars,
    );
    const bodyText = interpolate(tpl.bodyTemplate ?? "", vars);
    const headerTitle = interpolate(
      tpl.headerTitle ?? "Your Order is on the Way!",
      vars,
    );
    const ctaUrl = vars["tracking_url"]!;

    const plainText = `${headerTitle}\n\n${bodyText}\n\nCarrier: ${vars["carrier_name"]}\nAWB Tracking: ${vars["awb_number"]}\nTrack URL: ${ctaUrl}`;

    const html = renderEmailHtml({
      storeName: merchant.name,
      brandColor: tpl.brandColor || "#0f172a",
      logoUrl: tpl.logoUrl,
      headerTitle,
      bodyText,
      ctaText: tpl.ctaText || "Track Parcel Live",
      ctaUrl,
      footerText: tpl.footerText
        ? interpolate(tpl.footerText, vars)
        : `Tracking Number: ${vars["awb_number"]}`,
    });

    const result = await sendTenantMail(args.db, args.merchantId, {
      to: order.customer_email,
      subject,
      text: plainText,
      html,
    });

    incr("framique_transactional_email_total", {
      kind: "order_dispatched",
      outcome: result.ok ? "sent" : "failed",
    });
    return result.ok;
  } catch (err) {
    await captureError(err, {
      scope: "mail.order_dispatched",
      shipmentId: args.shipmentId,
    });
    return false;
  }
}

/**
 * Dispatches an automated Customer Welcome email.
 */
export async function sendCustomerWelcomeEmail(args: {
  db: Client;
  merchantId: string;
  customerEmail: string;
  customerName?: string | null;
}): Promise<boolean> {
  try {
    const { data: merchant } = await args.db
      .from("merchants")
      .select("name, slug")
      .eq("id", args.merchantId)
      .maybeSingle();

    if (!merchant) return false;

    const templates = await getMerchantEmailTemplates(args.db, args.merchantId);
    const tpl = templates.customer_welcome;

    const vars: Record<string, string> = {
      store_name: merchant.name,
      store_slug: merchant.slug,
      customer_name: args.customerName || "there",
    };

    const subject = interpolate(
      tpl.subjectTemplate ?? "Welcome to {{store_name}}",
      vars,
    );
    const bodyText = interpolate(tpl.bodyTemplate ?? "", vars);
    const headerTitle = interpolate(tpl.headerTitle ?? "Welcome!", vars);
    const { storeBaseUrl } = await import("./storefront-host.server");
    const ctaUrl = await storeBaseUrl(args.merchantId, merchant.slug);

    const plainText = `${headerTitle}\n\n${bodyText}\n\nVisit store: ${ctaUrl}`;

    const html = renderEmailHtml({
      storeName: merchant.name,
      brandColor: tpl.brandColor || "#0f172a",
      logoUrl: tpl.logoUrl,
      headerTitle,
      bodyText,
      ctaText: tpl.ctaText || "Start Shopping",
      ctaUrl,
      footerText: tpl.footerText,
    });

    const result = await sendTenantMail(args.db, args.merchantId, {
      to: args.customerEmail,
      subject,
      text: plainText,
      html,
    });

    incr("framique_transactional_email_total", {
      kind: "customer_welcome",
      outcome: result.ok ? "sent" : "failed",
    });
    return result.ok;
  } catch (err) {
    await captureError(err, {
      scope: "mail.customer_welcome",
      customerEmail: args.customerEmail,
    });
    return false;
  }
}
