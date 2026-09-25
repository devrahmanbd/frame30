import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { one } from "@/lib/embed";

export type Merchant = {
  id: string;
  name: string;
  slug: string;
  currency_code: string;
  status: string;
};

export function slugify(input: string) {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0980-\u09FF]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `item-${Date.now().toString(36)}`;
}

/**
 * Onboarding no longer asks for a store address (custom domains are the
 * identity now), so the slug is derived: name-based candidates with numeric
 * suffixes, strict server-safe characters only. The caller tries each in
 * order against create_store and moves on at the first slug.taken.
 */
export function candidateStoreSlugs(name: string, max = 10): string[] {
  const cleaned = slugify(name)
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  const root = cleaned.length >= 3 ? cleaned : "store";
  return Array.from({ length: Math.max(1, max) }, (_, i) =>
    i === 0 ? root : `${root}-${i + 1}`.slice(0, 60),
  );
}

/** Mirror of lib/merchant-scope.server.ts ACTIVE_MERCHANT_COOKIE (keep in sync). */
export const ACTIVE_MERCHANT_COOKIE = "fq.active_merchant_id";
export const ACTIVE_MERCHANT_KEY = ACTIVE_MERCHANT_COOKIE;

function writeMerchantCookie(merchantId: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${ACTIVE_MERCHANT_COOKIE}=${merchantId}; path=/; max-age=31536000; SameSite=Lax`;
}

export type MerchantMembership = {
  merchant_id: string;
  role?: string;
  merchant: Merchant;
};

export async function loadMemberships(): Promise<MerchantMembership[]> {
  const { data: sessionData } = await supabase.auth.getSession();
  let user = sessionData.session?.user;
  if (!user) {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return [];
    user = userData.user;
  }

  const { data, error } = await supabase
    .from("merchant_members")
    .select(
      "merchant_id, role, merchants(id, name, slug, currency_code, status)",
    )
    .eq("user_id", user.id);
  if (error) throw error;

  const rows: MerchantMembership[] = [];
  for (const row of data ?? []) {
    const m = one<Merchant>(row.merchants);
    if (m) {
      rows.push({
        merchant_id: row.merchant_id,
        role: row.role ?? undefined,
        merchant: m,
      });
    }
  }
  return rows;
}

/** Resolves the store the signed-in user belongs to. Stores are never created
 * implicitly — creation goes through the /onboarding wizard and create_store.
 *
 * Read path is deliberately two-step (Sept 18 2026 onboarding-loop fix):
 * memberships first, then the merchant row by id. A single embedded
 * `merchants(...)` join silently drops to null when the merchants RLS policy
 * denies the row — indistinguishable from "no store" — which bounced completed
 * merchants back to /onboarding forever. Here that case throws a diagnostic
 * error so the UI shows a retry/wrong-account card instead of the wizard.
 */
async function loadMerchant(): Promise<Merchant | null> {
  const memberships = await loadMemberships();
  if (memberships.length === 0) return null;

  let activeId: string | null = null;
  if (typeof window !== "undefined") {
    activeId = window.localStorage.getItem(ACTIVE_MERCHANT_KEY);
  }

  const matched = activeId
    ? memberships.find((m) => m.merchant_id === activeId)
    : null;
  const current = matched ?? memberships[0];

  if (typeof window !== "undefined") {
    window.localStorage.setItem(ACTIVE_MERCHANT_KEY, current.merchant_id);
    writeMerchantCookie(current.merchant_id);
  }

  // Fast path: if the joined membership already carries the complete merchant row,
  // use it directly — eliminating a redundant remote round-trip to Supabase.
  if (
    current.merchant?.id &&
    current.merchant?.name &&
    current.merchant?.slug
  ) {
    return current.merchant;
  }

  const { data: merchantRow, error: merchantError } = await supabase
    .from("merchants")
    .select("id, name, slug, currency_code, status")
    .eq("id", current.merchant_id)
    .maybeSingle();
  if (merchantError) {
    throw new Error(`merchant.read_failed: ${merchantError.message}`);
  }
  if (!merchantRow) {
    throw new Error(
      "merchant.inaccessible: you have a store membership but the store row is not readable (RLS). Retry, or sign in with the account that created the store.",
    );
  }

  return merchantRow as Merchant;
}

export function useMerchant() {
  return useQuery({
    queryKey: ["merchant"],
    queryFn: loadMerchant,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Drops every merchant-scoped read after an identity change (fresh login,
 * account switch). Without this the dashboard/onboarding keep serving the
 * previous session's null/merchant until staleTime expires and bounce
 * completed stores back to the wizard.
 */
export async function invalidateMerchantScope(
  queryClient: Pick<
    import("@tanstack/react-query").QueryClient,
    "invalidateQueries"
  >,
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ["merchant"] });
  await queryClient.invalidateQueries({ queryKey: ["merchant-memberships"] });
}

export function useMerchants() {
  const qc = useQueryClient();
  const membershipsQuery = useQuery({
    queryKey: ["merchant-memberships"],
    queryFn: loadMemberships,
    staleTime: 5 * 60 * 1000,
  });

  const merchantQuery = useMerchant();

  const switchMerchant = (merchantId: string) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ACTIVE_MERCHANT_KEY, merchantId);
    }
    writeMerchantCookie(merchantId);
    void qc.invalidateQueries({ queryKey: ["merchant"] });
    void qc.invalidateQueries({ queryKey: ["products"] });
    void qc.invalidateQueries({ queryKey: ["orders"] });
    void qc.invalidateQueries({ queryKey: ["categories"] });
    void qc.invalidateQueries({ queryKey: ["brands"] });
  };

  return {
    currentMerchant: merchantQuery.data ?? null,
    memberships: membershipsQuery.data ?? [],
    switchMerchant,
    isPending: merchantQuery.isPending || membershipsQuery.isPending,
  };
}

export function useInvalidateCatalog() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["products"] });
    void qc.invalidateQueries({ queryKey: ["brands"] });
    void qc.invalidateQueries({ queryKey: ["categories"] });
  };
}
