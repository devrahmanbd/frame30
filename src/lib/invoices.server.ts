/**
 * Invoice documents.
 *
 * `order_invoices` stores the immutable legal numbers minted by the
 * `order_invoice_issue` RPC. This module assembles the printable document
 * around that row — merchant identity, buyer block and priced lines — so the
 * admin invoice view never has to re-derive money on the client.
 *
 * Everything here is read-only and tenant-scoped by `merchant_id` on every
 * query, so a tampered order id can never surface another shop's invoice.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { withSpan, incr } from "./observability.server";

type Client = SupabaseClient<Database>;

export type InvoiceDocument = {
  invoice: {
    number: string;
    issuedAt: string;
    sequenceNo: number;
    sequenceYear: number;
    businessBin: string | null;
    currency: string;
    subtotalMinor: number;
    discountMinor: number;
    shippingMinor: number;
    vatMinor: number;
    vatRateBasisPoints: number;
    totalMinor: number;
  };
  order: {
    id: string;
    number: string;
    status: string;
    paymentMethod: string;
    placedAt: string;
    codSurchargeMinor: number;
    customer: { name: string; phone: string; email: string | null; address: string; city: string; postcode: string | null };
  };
  merchant: { name: string; slug: string; supportEmail: string | null; supportPhone: string | null; pricesIncludeVat: boolean };
  lines: { id: string; title: string; variant: string; sku: string | null; quantity: number; unitPriceMinor: number; lineTotalMinor: number }[];
};

/**
 * Loads a complete invoice document, or `null` when the order has not been
 * invoiced yet (the caller then offers the "issue invoice" action instead).
 */
export async function loadInvoiceDocument(
  db: Client,
  merchantId: string,
  orderId: string,
): Promise<InvoiceDocument | null> {
  return withSpan("commerce.invoice_document", async () => {
    const { data: invoice, error } = await db
      .from("order_invoices")
      .select("*")
      .eq("merchant_id", merchantId)
      .eq("order_id", orderId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invoice) return null;

    const [orderRes, itemsRes, merchantRes, settingsRes] = await Promise.all([
      db
        .from("orders")
        .select(
          "id, order_number, status, payment_method, created_at, cod_surcharge_minor_int, customer_name, customer_phone, customer_email, address_line, city, postcode",
        )
        .eq("merchant_id", merchantId)
        .eq("id", orderId)
        .maybeSingle(),
      db
        .from("order_items")
        .select("id, product_title, variant_name, sku, quantity, unit_price_minor_int, line_total_minor_int")
        .eq("merchant_id", merchantId)
        .eq("order_id", orderId)
        .order("created_at", { ascending: true }),
      db.from("merchants").select("name, slug").eq("id", merchantId).maybeSingle(),
      db
        .from("merchant_settings")
        .select("support_email, support_phone, prices_include_vat")
        .eq("merchant_id", merchantId)
        .maybeSingle(),
    ]);

    const order = orderRes.data;
    if (!order) return null;
    incr("framique_invoice_document_total", {});

    return {
      invoice: {
        number: invoice.invoice_number,
        issuedAt: invoice.issued_at,
        sequenceNo: invoice.sequence_no,
        sequenceYear: invoice.sequence_year,
        businessBin: invoice.business_bin,
        currency: invoice.currency_code,
        subtotalMinor: Number(invoice.subtotal_minor_int),
        discountMinor: Number(invoice.discount_minor_int),
        shippingMinor: Number(invoice.shipping_minor_int),
        vatMinor: Number(invoice.vat_minor_int),
        vatRateBasisPoints: invoice.vat_rate_basis_points,
        totalMinor: Number(invoice.total_minor_int),
      },
      order: {
        id: order.id,
        number: order.order_number,
        status: order.status,
        paymentMethod: order.payment_method,
        placedAt: order.created_at,
        codSurchargeMinor: Number(order.cod_surcharge_minor_int),
        customer: {
          name: order.customer_name,
          phone: order.customer_phone,
          email: order.customer_email,
          address: order.address_line,
          city: order.city,
          postcode: order.postcode,
        },
      },
      merchant: {
        name: merchantRes.data?.name ?? "",
        slug: merchantRes.data?.slug ?? "",
        supportEmail: settingsRes.data?.support_email ?? null,
        supportPhone: settingsRes.data?.support_phone ?? null,
        pricesIncludeVat: settingsRes.data?.prices_include_vat ?? false,
      },
      lines: (itemsRes.data ?? []).map((l) => ({
        id: l.id,
        title: l.product_title,
        variant: l.variant_name,
        sku: l.sku,
        quantity: l.quantity,
        unitPriceMinor: Number(l.unit_price_minor_int),
        lineTotalMinor: Number(l.line_total_minor_int),
      })),
    };
  });
}
