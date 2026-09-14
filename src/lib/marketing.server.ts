import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;
type CouponType = Database["public"]["Enums"]["coupon_type"];
type CouponStatus = Database["public"]["Enums"]["coupon_status"];

export class MarketingError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "MarketingError";
  }
}

export async function currentMerchantId(supabase: Client, userId: string) {
  const { data } = await supabase
    .from("merchant_members")
    .select("merchant_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (!data) throw new MarketingError("no_merchant", "No store found");
  return data.merchant_id;
}

export type CouponInput = {
  id?: string;
  code: string;
  type: CouponType;
  amountMinorInt: number;
  percentOff: number;
  buyQuantity: number;
  getQuantity: number;
  minSubtotalMinorInt: number;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  startsAt: string | null;
  expiresAt: string | null;
  allowCombine: boolean;
  onePerOrder: boolean;
  status: CouponStatus;
};

export async function saveCoupon(supabase: Client, merchantId: string, input: CouponInput) {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
    throw new MarketingError("coupon_code_invalid", "Code must be 3-32 characters (A-Z, 0-9, -, _)");
  }
  if (input.type === "percent" && (input.percentOff <= 0 || input.percentOff > 100)) {
    throw new MarketingError("coupon_percent_invalid", "Percentage discount must be between 1-100");
  }
  if (input.type === "fixed" && input.amountMinorInt <= 0) {
    throw new MarketingError("coupon_amount_invalid", "Discount amount must be greater than zero");
  }
  if (input.startsAt && input.expiresAt && new Date(input.startsAt) >= new Date(input.expiresAt)) {
    throw new MarketingError("coupon_window_invalid", "Start time must be before end time");
  }

  const dupQuery = supabase
    .from("coupons")
    .select("id")
    .eq("merchant_id", merchantId)
    .eq("code", code);
  const { data: dup } = input.id ? await dupQuery.neq("id", input.id) : await dupQuery;
  if (dup && dup.length > 0) {
    throw new MarketingError("coupon_code_taken", "This code is already in use");
  }

  const row = {
    merchant_id: merchantId,
    code,
    type: input.type,
    currency_code: "BDT",
    amount_minor_int: Math.max(0, Math.trunc(input.amountMinorInt)),
    percent_off: Math.max(0, Math.min(100, Math.trunc(input.percentOff))),
    buy_quantity: Math.max(0, Math.trunc(input.buyQuantity)),
    get_quantity: Math.max(0, Math.trunc(input.getQuantity)),
    min_subtotal_minor_int: Math.max(0, Math.trunc(input.minSubtotalMinorInt)),
    usage_limit: input.usageLimit,
    per_customer_limit: input.perCustomerLimit,
    starts_at: input.startsAt,
    expires_at: input.expiresAt,
    allow_combine: input.allowCombine,
    one_per_order: input.onePerOrder,
    status: input.status,
  };

  const query = input.id
    ? supabase.from("coupons").update(row).eq("id", input.id).select("id, code").single()
    : supabase.from("coupons").insert(row).select("id, code").single();
  const { data, error } = await query;
  if (error) throw new MarketingError("coupon_save_failed", error.message);
  return data;
}

type SegmentRule = { field: string; operator: string; value: string };

export async function segmentMembers(supabase: Client, merchantId: string, rule: SegmentRule | null) {
  let query = supabase
    .from("subscribers")
    .select("id, email, phone, tags, status, email_consent")
    .eq("merchant_id", merchantId);
  if (rule) {
    if (rule.field === "status") query = query.eq("status", rule.value);
    if (rule.field === "email_consent") query = query.eq("email_consent", rule.value === "true");
    if (rule.field === "tag") query = query.contains("tags", [rule.value]);
  }
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new MarketingError("segment_query_failed", error.message);
  return data ?? [];
}

function mockDeliver(email: string) {
  // Deterministic sandbox outcome so the loop can verify failures without a provider.
  return !/(bounce|invalid)/i.test(email);
}

export async function sendCampaign(supabase: Client, merchantId: string, campaignId: string) {
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (!campaign) throw new MarketingError("campaign_not_found", "Campaign not found");
  if (campaign.status === "sent") throw new MarketingError("campaign_already_sent", "Campaign has already been sent");
  if (!campaign.subject.trim() || !campaign.body_template.trim()) {
    throw new MarketingError("campaign_incomplete", "Subject and body are required");
  }

  let rule: SegmentRule | null = null;
  if (campaign.segment_id) {
    const { data: segment } = await supabase
      .from("segments")
      .select("rule_field, rule_operator, rule_value")
      .eq("id", campaign.segment_id)
      .maybeSingle();
    if (segment) {
      rule = { field: segment.rule_field, operator: segment.rule_operator, value: segment.rule_value };
    }
  }

  const { channelAudience } = await import("./consent.server");
  const { incr } = await import("./observability.server");
  const candidates = (await segmentMembers(supabase, merchantId, rule)).filter(
    (m) => m.status === "subscribed" && m.email_consent,
  );
  // Opt-out wins over every other flag: the ledger is the final authority.
  const { allowed: members, suppressed } = await channelAudience(
    supabase,
    merchantId,
    "email",
    "marketing",
    candidates,
  );
  incr("framique_campaign_recipients_total", { outcome: "allowed" }, members.length);
  incr("framique_campaign_recipients_total", { outcome: "suppressed" }, suppressed.length);
  if (members.length === 0) throw new MarketingError("campaign_no_recipients", "No recipients with active consent");

  const rows = members.map((m) => {
    const ok = mockDeliver(m.email);
    return {
      merchant_id: merchantId,
      campaign_id: campaignId,
      subscriber_id: m.id,
      email: m.email,
      status: ok ? "sent" : "failed",
      error: ok ? null : "mock_smtp_rejected",
      sent_at: ok ? new Date().toISOString() : null,
    };
  });
  const { error: sendError } = await supabase.from("campaign_sends").insert(rows);
  if (sendError) throw new MarketingError("campaign_send_failed", sendError.message);

  const sent = rows.filter((r) => r.status === "sent").length;
  await supabase
    .from("campaigns")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      sent_count: sent,
      failed_count: rows.length - sent,
    })
    .eq("id", campaignId);

  return { sent, failed: rows.length - sent, suppressed: suppressed.length };
}

export async function retryCampaignSend(supabase: Client, merchantId: string, sendId: string) {
  const { data: row } = await supabase
    .from("campaign_sends")
    .select("id, email, campaign_id")
    .eq("id", sendId)
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (!row) throw new MarketingError("send_not_found", "Record not found");
  const ok = mockDeliver(row.email);
  await supabase
    .from("campaign_sends")
    .update({
      status: ok ? "sent" : "failed",
      error: ok ? null : "mock_smtp_rejected",
      sent_at: ok ? new Date().toISOString() : null,
    })
    .eq("id", sendId);
  return { ok };
}

export async function deleteArticle(supabase: Client, merchantId: string, articleId: string) {
  const { data: article } = await supabase
    .from("articles")
    .select("id, status")
    .eq("id", articleId)
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (!article) throw new MarketingError("article_not_found", "Article not found");
  if (article.status !== "draft") {
    throw new MarketingError(
      "article_has_publish_state",
      "Published article cannot be deleted — archive it instead",
    );
  }
  const { error } = await supabase.from("articles").delete().eq("id", articleId);
  if (error) throw new MarketingError("article_delete_failed", error.message);
  return { ok: true };
}

export async function unsubscribeByToken(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: subscriber } = await supabaseAdmin
    .from("subscribers")
    .select("id, email, merchant_id, status")
    .eq("unsubscribe_token", token)
    .maybeSingle();
  if (!subscriber) throw new MarketingError("subscriber_not_found", "Link is not valid");
  if (subscriber.status === "unsubscribed") return { email: subscriber.email, alreadyDone: true };
  // Withdrawal is recorded on every channel and purpose, not just email status.
  const { withdrawAllChannels } = await import("./consent.server");
  await withdrawAllChannels(subscriber.merchant_id, subscriber.id, subscriber.email, "unsubscribe_link");
  await supabaseAdmin
    .from("subscribers")
    .update({ status: "unsubscribed", unsubscribed_at: new Date().toISOString() })
    .eq("id", subscriber.id);
  return { email: subscriber.email, alreadyDone: false };
}

export async function loadPublicArticle(slug: string) {
  const { publicClient } = await import("./pricing.server");
  const db = publicClient();
  const { data: article } = await db
    .from("articles")
    .select(
      "id, title, title_en, slug, excerpt, body, cover_image_url, tags, published_at, meta_title, meta_description, canonical, robots, merchant_id, views",
    )
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (!article) return null;
  const { data: merchant } = await db
    .from("merchants")
    .select("name, slug")
    .eq("id", article.merchant_id)
    .maybeSingle();
  return { article, merchant };
}

export async function listPublishedArticles() {
  const { publicClient } = await import("./pricing.server");
  const db = publicClient();
  const { data } = await db
    .from("articles")
    .select("slug, published_at, updated_at")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(500);
  return data ?? [];
}

export async function listPublicStores() {
  const { publicClient } = await import("./pricing.server");
  const db = publicClient();
  const { data } = await db
    .from("merchants")
    .select("slug")
    .eq("status", "active")
    .limit(500);
  return data ?? [];
}
