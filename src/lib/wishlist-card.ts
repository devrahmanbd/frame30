/**
 * Phase1-T1 — wishlist card state for storefront product cards.
 *
 * Reads the shared customer wishlist cache (`["customer", "wishlist"]`),
 * derives the saved flag and count for one variant, and exposes an optimistic
 * toggle with rollback. Guests are redirected to the sign-in gate instead of
 * receiving a server error.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { accountToggleWishlistFn } from "@/lib/accounts.functions";
import { customerWishlistFn } from "@/lib/customer.functions";

/** Shared cache key — seeded by tests, invalidated after every toggle. */
export const WISHLIST_KEY = ["customer", "wishlist"] as const;

export type WishlistCache = {
  currency?: string;
  items?: Array<{ id?: string; variantId: string }>;
};

export function useWishlistCard({
  slug,
  variantId,
}: {
  slug: string;
  variantId: string;
}) {
  const queryClient = useQueryClient();
  const readWishlist = useServerFn(customerWishlistFn);
  const toggleWishlist = useServerFn(accountToggleWishlistFn);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setSignedIn(Boolean(data.session));
      })
      .catch(() => {
        if (active) setSignedIn(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const wishlist = useQuery<WishlistCache>({
    queryKey: WISHLIST_KEY,
    queryFn: () => readWishlist() as Promise<WishlistCache>,
    enabled: signedIn === true,
  });

  const items = wishlist.data?.items ?? [];
  const saved = items.some((item) => item.variantId === variantId);
  const count = items.length;

  const mutation = useMutation({
    mutationFn: () =>
      toggleWishlist({ data: { slug, variantId, stockAlert: false } }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: WISHLIST_KEY });
      const previous = queryClient.getQueryData<WishlistCache>(WISHLIST_KEY);
      queryClient.setQueryData<WishlistCache>(WISHLIST_KEY, (old) => ({
        ...old,
        items: saved
          ? (old?.items ?? []).filter((item) => item.variantId !== variantId)
          : [...(old?.items ?? []), { variantId }],
      }));
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(WISHLIST_KEY, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: WISHLIST_KEY });
    },
  });

  const onClick = () => {
    if (signedIn === null) return;
    if (signedIn === false) {
      const redirect = `${window.location.pathname}${window.location.search}`;
      window.location.assign(
        `/auth?redirect=${encodeURIComponent(redirect)}&mode=signin`,
      );
      return;
    }
    mutation.mutate();
  };

  return { saved, count, onClick };
}
