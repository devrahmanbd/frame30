import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { publicClient } from "./pricing.server";
import { one } from "./embed";

type Client = SupabaseClient<Database>;
export type ReviewStatus = Database["public"]["Enums"]["review_status"];
export type ConsentChannel = Database["public"]["Enums"]["consent_channel"];
export type ConsentPurpose = Database["public"]["Enums"]["consent_purpose"];
export type AddressType = Database["public"]["Enums"]["address_type"];

export type StoreRef = { id: string; name: string; slug: string; currency_code: string };

export type AccountAddress = {
  id: string;
  address_type: AddressType;
  label: string;
  full_name: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  district: string;
  postcode: string | null;
  is_default: boolean;
};

export type AccountOverview = {
  profile: { id: string; name: string; email: string | null; phone: string | null } | null;
  addresses: AccountAddress[];
  wishlist: {
    id: string;
    variant_id: string;
    stock_alert: boolean;
    variant_name: string;
    price_amount_minor_int: number;
    stock_quantity: number;
    product_title: string;
    product_slug: string;
  }[];
  consents: { channel: ConsentChannel; purpose: ConsentPurpose; granted: boolean }[];
  orders: {
    id: string;
    order_number: string;
    status: string;
    total_minor_int: number;
    currency_code: string;
    created_at: string;
  }[];
  reviews: { id: string; product_title: string; rating: number; status: ReviewStatus; created_at: string }[];
};

const EMPTY: AccountOverview = {
  profile: null,
  addresses: [],
  wishlist: [],
  consents: [],
  orders: [],
  reviews: [],
};

/** Tenancy always comes from the storefront slug in the URL, never from a session. */
export async function storeBySlug(slug: string): Promise<StoreRef> {
  const db = publicClient();
  const { data } = await db
    .from("merchants")
    .select("id, name, slug, currency_code")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();
  if (!data) throw new Error("store.not_found");
  return data;
}

export async function accountOverview(db: Client, merchantId: string): Promise<AccountOverview> {
  const { data, error } = await db.rpc("customer_overview", { _merchant_id: merchantId });
  if (error) throw error;
  const parsed = (data ?? {}) as unknown as Partial<AccountOverview>;
  return { ...EMPTY, ...parsed };
}

export async function upsertCustomer(
  db: Client,
  merchantId: string,
  input: { name: string; email: string; phone: string; locale: string },
) {
  const { error } = await db.rpc("customer_upsert_self", {
    _merchant_id: merchantId,
    _name: input.name,
    _email: input.email,
    _phone: input.phone,
    _locale: input.locale,
  });
  if (error) throw error;
}

export type AddressInput = {
  addressId: string | null;
  addressType: AddressType;
  label: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  district: string;
  postcode: string;
  isDefault: boolean;
};

export async function saveAddress(db: Client, merchantId: string, input: AddressInput) {
  const { error } = await db.rpc("customer_save_address", {
    _merchant_id: merchantId,
    _address_id: input.addressId as string,
    _address_type: input.addressType,
    _label: input.label,
    _full_name: input.fullName,
    _phone: input.phone,
    _line1: input.line1,
    _line2: input.line2,
    _city: input.city,
    _district: input.district,
    _postcode: input.postcode,
    _is_default: input.isDefault,
  });
  if (error) throw error;
}

export async function deleteAddress(db: Client, merchantId: string, addressId: string) {
  const { error } = await db.rpc("customer_delete_address", {
    _merchant_id: merchantId,
    _address_id: addressId,
  });
  if (error) throw error;
}

export async function toggleWishlist(
  db: Client,
  merchantId: string,
  variantId: string,
  stockAlert: boolean,
) {
  const { data, error } = await db.rpc("customer_toggle_wishlist", {
    _merchant_id: merchantId,
    _variant_id: variantId,
    _stock_alert: stockAlert,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function setConsent(
  db: Client,
  merchantId: string,
  channel: ConsentChannel,
  purpose: ConsentPurpose,
  granted: boolean,
) {
  const { error } = await db.rpc("customer_set_consent", {
    _merchant_id: merchantId,
    _channel: channel,
    _purpose: purpose,
    _granted: granted,
  });
  if (error) throw error;
}

export async function submitReview(
  db: Client,
  merchantId: string,
  input: { productId: string; rating: number; title: string; body: string; authorName: string },
) {
  const { error } = await db.rpc("review_submit", {
    _merchant_id: merchantId,
    _product_id: input.productId,
    _rating: input.rating,
    _title: input.title,
    _body: input.body,
    _author_name: input.authorName,
  });
  if (error) throw error;
}

/** Public review surface: published rows only, aggregates computed in the database. */
export async function publicReviews(productId: string) {
  const db = publicClient();
  const [agg, list] = await Promise.all([
    db.rpc("review_agg", { _product_id: productId }),
    db.rpc("review_list_published", { _product_id: productId, _limit: 20 }),
  ]);
  return {
    agg: (agg.data ?? { count: 0, mean: 0, histogram: {} }) as unknown as {
      count: number;
      mean: number;
      histogram: Record<string, number>;
    },
    list: (list.data ?? []) as unknown as {
      id: string;
      rating: number;
      title: string;
      body: string;
      author_name: string;
      verified_purchase: boolean;
      created_at: string;
      reply: { body: string; published_at: string } | null;
    }[],
  };
}

/* ---------------------------------- admin --------------------------------- */

export async function loadReviewQueue(db: Client, merchantId: string) {
  const [{ data: reviews, error }, { data: replies }] = await Promise.all([
    db
      .from("product_reviews")
      .select("id, product_id, rating, title, body, author_name, verified_purchase, status, moderation_note, created_at, products(title, slug)")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(200),
    db.from("review_replies").select("review_id, body").eq("merchant_id", merchantId),
  ]);
  if (error) throw error;
  const replyByReview = new Map((replies ?? []).map((r) => [r.review_id, r.body]));
  return (reviews ?? []).map((r) => ({
    id: r.id,
    productId: r.product_id,
    productTitle: one<{ title: string; slug: string }>(r.products)?.title ?? "",
    productSlug: one<{ title: string; slug: string }>(r.products)?.slug ?? "",
    rating: r.rating,
    title: r.title,
    body: r.body,
    authorName: r.author_name,
    verified: r.verified_purchase,
    status: r.status,
    note: r.moderation_note,
    createdAt: r.created_at,
    reply: replyByReview.get(r.id) ?? "",
  }));
}

export async function moderateReview(
  db: Client,
  reviewId: string,
  status: ReviewStatus,
  note: string,
) {
  const { error } = await db.rpc("review_moderate", {
    _review_id: reviewId,
    _status: status,
    _note: note,
  });
  if (error) throw error;
}

export async function replyToReview(db: Client, reviewId: string, body: string) {
  const { error } = await db.rpc("review_reply", { _review_id: reviewId, _body: body });
  if (error) throw error;
}

export type FormField = { key: string; label: string; type: "text" | "email" | "phone" | "textarea"; required: boolean };

export async function loadForms(db: Client, merchantId: string) {
  const [{ data: forms, error }, { data: submissions }] = await Promise.all([
    db
      .from("storefront_forms")
      .select("id, slug, title, description, fields, success_message, requires_consent, consent_purpose, is_active, created_at")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false }),
    db
      .from("form_submissions")
      .select("id, form_id, payload, consent_granted, status, created_at")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  if (error) throw error;
  return {
    forms: (forms ?? []).map((f) => ({
      ...f,
      fields: (Array.isArray(f.fields) ? f.fields : []) as unknown as FormField[],
    })),
    submissions: (submissions ?? []).map((s) => ({
      ...s,
      payload: (s.payload ?? {}) as unknown as Record<string, string>,
    })),
  };
}

export type FormInput = {
  id: string | null;
  slug: string;
  title: string;
  description: string;
  fields: FormField[];
  successMessage: string;
  requiresConsent: boolean;
  isActive: boolean;
};

export async function saveForm(db: Client, merchantId: string, input: FormInput) {
  const row = {
    merchant_id: merchantId,
    slug: input.slug,
    title: input.title,
    description: input.description || null,
    fields: input.fields as unknown as Json,
    success_message: input.successMessage,
    requires_consent: input.requiresConsent,
    is_active: input.isActive,
    updated_at: new Date().toISOString(),
  };
  const query = input.id
    ? db.from("storefront_forms").update(row).eq("id", input.id).eq("merchant_id", merchantId)
    : db.from("storefront_forms").insert(row);
  const { error } = await query;
  if (error) throw error;
}

export async function setSubmissionStatus(
  db: Client,
  merchantId: string,
  submissionId: string,
  status: "new" | "handled" | "spam",
) {
  const { error } = await db
    .from("form_submissions")
    .update({ status })
    .eq("id", submissionId)
    .eq("merchant_id", merchantId);
  if (error) throw error;
}

/** Anonymous storefront submission: validated and consent-checked in the database. */
export async function submitForm(
  merchantId: string,
  slug: string,
  payload: Record<string, string>,
  consent: boolean,
  honeypot?: string,
) {
  if (honeypot && honeypot.trim().length > 0) {
    const { recordHoneypotTrip } = await import("./fraud.server");
    await recordHoneypotTrip(merchantId, "storefront_form");
    // Bots get a success-shaped answer; nothing is stored.
    return "discarded";
  }
  const db = publicClient();
  const { data, error } = await db.rpc("form_submit", {
    _merchant_id: merchantId,
    _slug: slug,
    _payload: payload as unknown as Json,
    _consent: consent,
  });
  if (error) throw error;
  return data as string;
}


/** A shopper's own order, resolved in the database from `auth.uid()` — an order
 * id from another customer (or another store) returns null, never a partial row. */
export async function ownOrderDetail(db: Client, merchantId: string, orderId: string) {
  const { data, error } = await db.rpc("customer_order_detail", {
    _merchant_id: merchantId,
    _order_id: orderId,
  });
  if (error) throw error;
  return (data ?? null) as unknown as {
    order: {
      id: string;
      order_number: string;
      status: string;
      payment_method: string;
      currency_code: string;
      subtotal_minor_int: number;
      shipping_minor_int: number;
      discount_minor_int: number;
      cod_surcharge_minor_int: number;
      vat_minor_int: number;
      total_minor_int: number;
      city: string;
      created_at: string;
    };
    items: { title: string; variant_name: string; quantity: number; unit_minor: number; line_minor: number }[];
  } | null;
}
