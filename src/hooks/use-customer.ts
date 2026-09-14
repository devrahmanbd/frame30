import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  customerAccountFn,
  customerAccountsFn,
  customerHomeFn,
  customerOrderFn,
  customerOrdersFn,
  customerProfileFn,
  customerTrackingFn,
  customerWishlistFn,
} from "@/lib/customer.functions";

export type CustomerAccount = {
  id: string;
  merchantId: string;
  name: string;
  email: string | null;
  phone: string | null;
  locale: string;
  storeName: string | null;
  storeSlug: string | null;
  currencyCode: string;
};

/**
 * Resolves the shopper account behind `/dashboard` from the session. A signed-in
 * user without a `customers` row is not forbidden — they simply have not
 * finished creating their account yet, and the shell says so.
 */
export function useCustomerAccount(merchantId?: string) {
  const fn = useServerFn(customerAccountFn);
  return useQuery({
    queryKey: ["customer-account", merchantId],
    queryFn: () => fn({ data: { merchantId } }) as Promise<CustomerAccount | null>,
    staleTime: 60_000,
  });
}

/** Resolves all merchant stores where this user holds a customer profile. */
export function useCustomerAccounts() {
  const fn = useServerFn(customerAccountsFn);
  return useQuery({
    queryKey: ["customer-accounts"],
    queryFn: () => fn() as Promise<CustomerAccount[]>,
    staleTime: 60_000,
  });
}

export function useCustomerHome(enabled: boolean) {
  const fn = useServerFn(customerHomeFn);
  return useQuery({ queryKey: ["customer", "home"], queryFn: () => fn(), enabled });
}

export function useCustomerOrders(page: number, enabled: boolean) {
  const fn = useServerFn(customerOrdersFn);
  return useQuery({
    queryKey: ["customer", "orders", page],
    queryFn: () => fn({ data: { page } }),
    enabled,
  });
}

export function useCustomerOrder(orderId: string | null) {
  const fn = useServerFn(customerOrderFn);
  return useQuery({
    queryKey: ["customer", "order", orderId],
    queryFn: () => fn({ data: { orderId: orderId! } }),
    enabled: Boolean(orderId),
  });
}

export function useCustomerTracking(enabled: boolean) {
  const fn = useServerFn(customerTrackingFn);
  return useQuery({ queryKey: ["customer", "tracking"], queryFn: () => fn(), enabled });
}

export function useCustomerWishlist(enabled: boolean) {
  const fn = useServerFn(customerWishlistFn);
  return useQuery({ queryKey: ["customer", "wishlist"], queryFn: () => fn(), enabled });
}

export function useCustomerProfile(enabled: boolean) {
  const fn = useServerFn(customerProfileFn);
  return useQuery({ queryKey: ["customer", "profile"], queryFn: () => fn(), enabled });
}

/** Wraps a shopper mutation and refreshes the affected dashboard queries. */
export function useCustomerMutation<TInput, TOutput>(
  serverFn: (opts: { data: TInput }) => Promise<TOutput>,
  invalidate: string[][],
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: TInput) => serverFn({ data }),
    onSuccess: () => {
      for (const key of invalidate) void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
