import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { currentMerchantPrimaryHostFn } from "@/lib/storefront.functions";
import {
  storefrontPathForMerchant,
  storefrontUrlForMerchant,
  storePageUrlForMerchant,
} from "@/lib/storefront-url";
import { useMerchant } from "./use-merchant";

/**
 * The merchant's primary custom domain, if any. Fail-soft null: every URL
 * builder below falls back to path URLs, so a failed lookup never breaks
 * a link — it just renders the legacy shape.
 */
export function usePrimaryHost() {
  const { data: merchant } = useMerchant();
  const loadPrimary = useServerFn(currentMerchantPrimaryHostFn);
  return useQuery({
    queryKey: ["merchant-primary-host", merchant?.id],
    queryFn: async () =>
      ((await loadPrimary({})) as { primaryHost: string | null })
        .primaryHost,
    enabled: !!merchant?.id,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

/**
 * Merchant-facing storefront URLs under the custom-domain-only rule: the
 * primary domain when one exists, path URLs otherwise. One hook for every
 * View-store / preview / sitemap / permalink surface so no new caller
 * hard-codes `/store/<slug>` ever again.
 */
export function useStoreUrl() {
  const { data: merchant } = useMerchant();
  const { data: primaryHost } = usePrimaryHost();
  const slug = merchant?.slug ?? "";
  const primary = primaryHost ?? null;
  return {
    primaryHost: primary,
    storeUrl: () => storefrontUrlForMerchant(primary, slug),
    storePath: (subpath: string) =>
      storefrontPathForMerchant(primary, slug, subpath),
    storePage: (pageSlug: string, preview = false) =>
      storePageUrlForMerchant(primary, slug, pageSlug, preview),
  };
}
