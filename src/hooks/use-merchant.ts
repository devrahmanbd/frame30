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

export const ACTIVE_MERCHANT_KEY = "fq.active_merchant_id";

export type MerchantMembership = {
  merchant_id: string;
  role?: string;
  merchant: Merchant;
};

export async function loadMemberships(): Promise<MerchantMembership[]> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return [];

  const { data, error } = await supabase
    .from("merchant_members")
    .select("merchant_id, role, merchants(id, name, slug, currency_code, status)")
    .eq("user_id", userData.user.id);
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
 * implicitly — creation goes through the /onboarding wizard and create_store. */
async function loadMerchant(): Promise<Merchant | null> {
  const memberships = await loadMemberships();
  if (memberships.length === 0) return null;

  let activeId: string | null = null;
  if (typeof window !== "undefined") {
    activeId = window.localStorage.getItem(ACTIVE_MERCHANT_KEY);
  }

  const matched = activeId ? memberships.find((m) => m.merchant_id === activeId) : null;
  const current = matched ?? memberships[0];

  if (typeof window !== "undefined" && current) {
    window.localStorage.setItem(ACTIVE_MERCHANT_KEY, current.merchant_id);
  }

  return current?.merchant ?? null;
}

export function useMerchant() {
  return useQuery({
    queryKey: ["merchant"],
    queryFn: loadMerchant,
    staleTime: 5 * 60 * 1000,
  });
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
