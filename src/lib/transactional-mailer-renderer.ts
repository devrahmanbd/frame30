export type EmailTemplateKind =
  | "newsletter"
  | "order_confirmation"
  | "invoice_delivery"
  | "order_dispatched"
  | "order_delivered"
  | "customer_welcome";

export type EmailTemplateConfig = {
  brandColor?: string; // hex, default #0f172a
  logoUrl?: string | null;
  headerTitle?: string;
  subjectTemplate?: string;
  bodyTemplate?: string;
  ctaText?: string;
  ctaUrl?: string;
  footerText?: string;
};

export const DEFAULT_TEMPLATES: Record<EmailTemplateKind, EmailTemplateConfig> =
  {
    newsletter: {
      brandColor: "#0f172a",
      headerTitle: "{{store_name}} Newsletter",
      subjectTemplate: "Latest updates from {{store_name}}",
      bodyTemplate:
        "Hello {{customer_name}},\n\nHere is the latest news and curated picks from our store.",
      ctaText: "Shop the Collection",
      ctaUrl: "https://store.framique.com/{{store_slug}}",
      footerText:
        "You received this email because you subscribed to updates from {{store_name}}.",
    },
    order_confirmation: {
      brandColor: "#0f172a",
      headerTitle: "Order Confirmed",
      subjectTemplate: "Order Confirmed #{{order_number}} — {{store_name}}",
      bodyTemplate:
        "Hi {{customer_name}},\n\nThank you for your order! We have received your purchase and are preparing it for shipment.",
      ctaText: "Track Your Order",
      ctaUrl: "https://store.framique.com/{{store_slug}}/track",
      footerText:
        "Questions about your order? Reply to this email or contact support.",
    },
    invoice_delivery: {
      brandColor: "#0f172a",
      headerTitle: "Tax Invoice",
      subjectTemplate: "Invoice {{invoice_number}} for Order #{{order_number}}",
      bodyTemplate:
        "Hi {{customer_name}},\n\nPlease find attached your official tax invoice document.",
      ctaText: "View Invoice Online",
      ctaUrl: "https://store.framique.com/invoice/{{invoice_token}}",
      footerText: "Official invoice record issued by {{store_name}}.",
    },
    order_dispatched: {
      brandColor: "#0f172a",
      headerTitle: "Your Order is on the Way!",
      subjectTemplate:
        "Order #{{order_number}} has been dispatched — {{carrier_name}}",
      bodyTemplate:
        "Good news {{customer_name}}!\n\nYour parcel has been handed over to {{carrier_name}} for fast delivery to your address.",
      ctaText: "Track Parcel Live",
      ctaUrl: "{{tracking_url}}",
      footerText: "Tracking number (AWB): {{awb_number}}.",
    },
    order_delivered: {
      brandColor: "#10b981",
      headerTitle: "Package Delivered",
      subjectTemplate: "Order #{{order_number}} has been delivered!",
      bodyTemplate:
        "Hi {{customer_name}},\n\nYour package has been successfully delivered. We hope you love your purchase!",
      ctaText: "Leave a Review",
      ctaUrl: "https://store.framique.com/{{store_slug}}",
      footerText: "Thank you for supporting {{store_name}}.",
    },
    customer_welcome: {
      brandColor: "#0f172a",
      headerTitle: "Welcome to {{store_name}}",
      subjectTemplate: "Welcome to {{store_name}}, {{customer_name}}!",
      bodyTemplate:
        "Welcome aboard! We are thrilled to have you as part of our community. Explore our catalog and find the best items tailored for you.",
      ctaText: "Start Shopping",
      ctaUrl: "https://store.framique.com/{{store_slug}}",
      footerText: "Thank you for registering at {{store_name}}.",
    },
  };

export function formatMoneyMinor(minor: number, currency = "BDT"): string {
  const symbol = currency === "BDT" ? "৳" : "$";
  const major = Math.trunc(minor) / 100;
  return `${symbol} ${major.toLocaleString("en-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function interpolate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    return vars[key] ?? "";
  });
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderEmailHtml(args: {
  storeName: string;
  brandColor: string;
  logoUrl?: string | null;
  headerTitle: string;
  bodyText: string;
  ctaText?: string | null;
  ctaUrl?: string | null;
  itemsTableHtml?: string | null;
  totalsTableHtml?: string | null;
  footerText?: string | null;
  unsubscribeUrl?: string | null;
}): string {
  const brand = args.brandColor || "#0f172a";
  const paragraphs = args.bodyText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(
      (line) =>
        `<p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #334155;">${escapeHtml(line)}</p>`,
    )
    .join("");

  const logoMarkup = args.logoUrl
    ? `<img src="${escapeHtml(args.logoUrl)}" alt="${escapeHtml(args.storeName)}" style="max-height: 44px; max-width: 180px; display: block; margin: 0 auto 16px;" />`
    : "";

  const ctaMarkup =
    args.ctaText && args.ctaUrl
      ? `<div style="text-align: center; margin: 32px 0;">
          <a href="${escapeHtml(args.ctaUrl)}" style="background-color: ${escapeHtml(brand)}; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 14px; font-weight: 600; display: inline-block;">
            ${escapeHtml(args.ctaText)}
          </a>
        </div>`
      : "";

  const unsubscribeMarkup = args.unsubscribeUrl
    ? `<p style="margin: 8px 0 0; font-size: 12px; color: #94a3b8;">
        Don't want to receive these emails? <a href="${escapeHtml(args.unsubscribeUrl)}" style="color: #64748b; text-decoration: underline;">Unsubscribe here</a>.
      </p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(args.headerTitle)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <!-- Header Banner -->
          <tr>
            <td style="padding: 28px 32px; background-color: #ffffff; border-bottom: 2px solid ${escapeHtml(brand)}; text-align: center;">
              ${logoMarkup}
              <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #0f172a; letter-spacing: -0.02em;">
                ${escapeHtml(args.headerTitle)}
              </h1>
              <div style="font-size: 13px; font-weight: 500; color: #64748b; margin-top: 4px;">
                ${escapeHtml(args.storeName)}
              </div>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 32px;">
              ${paragraphs}
              ${args.itemsTableHtml ?? ""}
              ${args.totalsTableHtml ?? ""}
              ${ctaMarkup}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f1f5f9; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #64748b;">
                ${escapeHtml(args.footerText ?? `Sent by ${args.storeName}`)}
              </p>
              ${unsubscribeMarkup}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
