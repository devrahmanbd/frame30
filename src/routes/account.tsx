import {
  getStoreChrome,
  resolveStorefrontHostFn,
} from "@/lib/storefront.functions";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ThemeChrome } from "@/components/store/ThemeChrome";
import { PluginLayer } from "@/components/store/PluginLayer";
import { StoreHeader } from "@/components/store/StoreHeader";
import { CustomerAccountAccess } from "@/components/store/CustomerAccountAccess";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { flattenAst, type Section } from "@/lib/builder-ast";
import {
  themePlacesAccountPanel,
  themePlacesAccountProfile,
} from "@/lib/theme-shell-slots";
import { OrdersList, ProfileCard } from "@/components/builder/account";
import {
  AccountDashboardProvider,
  type AccountAddressValues,
  type AccountPanelType,
} from "@/components/store/AccountDashboardContext";
import {
  accountSlotCtx,
  mapOrdersToRows,
  mapProfileToRow,
} from "@/components/store/account-slots";
import {
  AccountDashboard,
  type AccountDashboardStatus,
} from "@/components/store/AccountDashboard";
import {
  accountDeleteAddressFn,
  accountOrderFn,
  accountOverviewFn,
  accountSaveAddressFn,
  accountSetConsentFn,
  accountToggleWishlistFn,
  accountUpsertSelfFn,
} from "@/lib/accounts.functions";
import { accountSlotsPending, accountStatus } from "@/lib/account-status";
import { accountRemovedPanelsFn } from "@/lib/account-panel-survival";
import {
  initialAccountTab,
  isAccountTab,
  type AccountTab,
} from "@/lib/account-tab";

export const Route = createFileRoute("/account")({
  validateSearch: (s: Record<string, unknown>): { tab?: AccountTab } => ({
    tab: isAccountTab(s.tab) ? s.tab : undefined,
  }),
  loader: async () => {
    let host: Awaited<ReturnType<typeof resolveStorefrontHostFn>> = null;
    try {
      host = await resolveStorefrontHostFn();
    } catch {
      host = null;
    }
    if (!host) throw notFound();
    const slug = host.merchantSlug;
    const chrome = await getStoreChrome({
      data: { slug, template: "account" },
    }).catch(() => null);
    return {
      slug,
      chrome,
      removedPanels: await accountRemovedPanelsFn({
        data: { themeKey: chrome?.themeKey ?? null, ast: chrome?.ast ?? null },
      }).catch(() => [] as readonly AccountPanelType[]),
    };
  },
  head: ({ loaderData }) => {
    const title = `Your account — ${loaderData?.slug ?? "store"}`;
    const description =
      "Manage your orders, saved addresses, wishlist and message preferences.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        // A signed-in dashboard must never be indexed.
        { name: "robots", content: "noindex,nofollow" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: AccountPage,
});

const ACCOUNT_PANEL_TYPES: readonly AccountPanelType[] = [
  "account_nav",
  "account_overview",
  "account_orders",
  "account_details",
];

function AccountPage() {
  const { t, lang } = useLang();
  const { slug, chrome, removedPanels } = Route.useLoaderData();
  const search = Route.useSearch();
  const qc = useQueryClient();
  const overviewFn = useServerFn(accountOverviewFn);
  const navigate = useNavigate();

  const tab = initialAccountTab(search.tab);

  const session = useQuery({
    queryKey: ["auth-session"],
    queryFn: async () => (await supabase.auth.getSession()).data.session,
    staleTime: 30_000,
  });
  const signedIn = Boolean(session.data);

  const account = useQuery({
    queryKey: ["store-account", slug],
    queryFn: () => overviewFn({ data: { slug } }),
    enabled: signedIn,
    staleTime: 15_000,
  });

  const orderFn = useServerFn(accountOrderFn);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const orderDetail = useQuery({
    queryKey: ["store-order-detail", slug, openOrderId],
    queryFn: () => orderFn({ data: { slug, orderId: openOrderId! } }),
    enabled: Boolean(openOrderId) && signedIn,
  });

  const invalidate = () =>
    void qc.invalidateQueries({ queryKey: ["store-account", slug] });
  const useAccountMutation = <T,>(
    fn: (input: { data: T }) => Promise<unknown>,
    done: string,
  ) =>
    useMutation({
      mutationFn: (data: T) => fn({ data }),
      onSuccess: () => {
        invalidate();
        toast.success(done);
      },
      onError: (e: Error) =>
        toast.error(
          e.message.includes("rate")
            ? t(
                "Too many changes — wait a moment.",
                "অনেক বেশি পরিবর্তন — একটু অপেক্ষা করুন।",
              )
            : t(
                "Could not save. Try again.",
                "সংরক্ষণ হয়নি। আবার চেষ্টা করুন।",
              ),
        ),
    });

  const saveAddress = useAccountMutation(
    useServerFn(accountSaveAddressFn),
    t("Address saved", "ঠিকানা সংরক্ষিত"),
  );
  const delAddress = useAccountMutation(
    useServerFn(accountDeleteAddressFn),
    t("Address removed", "ঠিকানা মুছে ফেলা হয়েছে"),
  );
  const saveProfile = useAccountMutation(
    useServerFn(accountUpsertSelfFn),
    t("Profile saved", "প্রোফাইল সংরক্ষিত"),
  );
  const setConsent = useAccountMutation(
    useServerFn(accountSetConsentFn),
    t("Preference saved", "পছন্দ সংরক্ষিত"),
  );
  const toggleWish = useAccountMutation(
    useServerFn(accountToggleWishlistFn),
    t("Wishlist updated", "উইশলিস্ট হালনাগাদ"),
  );

  const store = account.data?.store;
  const overview = account.data?.overview;
  const currency = store?.currency_code ?? "BDT";
  const merchantName = chrome?.merchant?.name || slug;

  const pending = accountSlotsPending({
    signedIn,
    queryPending: account.isPending,
  });

  const placedPanels = useMemo(() => {
    const out: AccountPanelType[] = [];
    for (const panel of ACCOUNT_PANEL_TYPES) {
      if (themePlacesAccountPanel(chrome?.ast, panel)) out.push(panel);
    }
    return out;
  }, [chrome?.ast]);

  const setTab = useCallback(
    (next: AccountTab) => {
      void navigate({
        to: "/account",
        search: { tab: next },
      });
    },
    [navigate],
  );

  const accountSlots = useMemo(() => {
    const sections = chrome?.ast ? flattenAst(chrome.ast) : [];
    const out: Partial<Record<string, ReactNode>> = {};
    const o = sections.find((s) => s.type === "orders_list");
    if (o) {
      out.orders_list = (
        <OrdersList
          {...accountSlotCtx(o, {
            rows: overview ? mapOrdersToRows(overview.orders ?? []) : undefined,
            pending,
            locale: lang,
            storeSlug: slug,
          })}
        />
      );
    }
    const p = sections.find((s) => s.type === "profile_card");
    const row = overview?.profile
      ? mapProfileToRow(overview.profile)
      : undefined;
    if (p && signedIn) {
      out.profile_card = (
        <ProfileCard
          {...accountSlotCtx(p, {
            rows: row ? [row] : undefined,
            pending,
            locale: lang,
            storeSlug: slug,
          })}
        />
      );
    }
    if (placedPanels.includes("account_nav")) out.account_nav = null;
    if (placedPanels.includes("account_overview")) out.account_overview = null;
    if (placedPanels.includes("account_orders")) out.account_orders = null;
    if (placedPanels.includes("account_details")) out.account_details = null;
    return out;
  }, [chrome, overview, pending, lang, slug, signedIn, placedPanels]);

  const themePlacesProfile = themePlacesAccountProfile(chrome?.ast);
  const profileSlot = useMemo(() => {
    if (themePlacesProfile) return undefined;
    const row = overview?.profile
      ? mapProfileToRow(overview.profile)
      : undefined;
    if (!row) return undefined;
    const section: Section = {
      id: "account-profile-slot",
      type: "profile_card",
      props: {},
    };
    return (
      <ProfileCard
        {...accountSlotCtx(section, {
          rows: [row],
          pending,
          locale: lang,
          storeSlug: slug,
        })}
      />
    );
  }, [themePlacesProfile, overview, pending, lang, slug]);

  const status: AccountDashboardStatus = accountStatus({
    sessionPending: session.isPending,
    signedIn,
    queryPending: account.isPending,
    queryError: account.isError,
  });

  const accountState = useMemo(
    () => ({
      slug,
      currency,
      status,
      overview,
      orders: overview ? mapOrdersToRows(overview.orders ?? []) : [],
      tab,
      setTab,
      openOrderId,
      setOpenOrderId,
      orderDetail:
        orderDetail.data && openOrderId
          ? { orderId: openOrderId, detail: orderDetail.data }
          : null,
      orderDetailPending: orderDetail.isFetching,
      orderDetailError: orderDetail.isError,
      onLoadOrder: (orderId: string) => setOpenOrderId(orderId),
      onSaveAddress: (values: AccountAddressValues) =>
        saveAddress.mutate({ slug, ...values }),
      onDeleteAddress: (addressId: string) =>
        delAddress.mutate({ slug, addressId }),
      onSaveProfile: (values: { name: string; email: string; phone: string }) =>
        saveProfile.mutate({ slug, ...values, locale: "bn" }),
      onSetConsent: (consent: {
        channel: "email" | "sms";
        purpose: "marketing" | "cart_recovery" | "stock_alerts";
        granted: boolean;
      }) => setConsent.mutate({ slug, ...consent }),
      onToggleWishlist: (variantId: string) =>
        toggleWish.mutate({ slug, variantId, stockAlert: false }),
      busy: {
        address: saveAddress.isPending || delAddress.isPending,
        profile: saveProfile.isPending,
        consent: setConsent.isPending,
        wishlist: toggleWish.isPending,
      },
      placed: placedPanels,
      removed: removedPanels,
    }),
    [
      slug,
      currency,
      status,
      overview,
      tab,
      setTab,
      openOrderId,
      orderDetail.data,
      orderDetail.isFetching,
      orderDetail.isError,
      saveAddress,
      delAddress,
      saveProfile,
      setConsent,
      toggleWish,
      placedPanels,
      removedPanels,
    ],
  );

  const dashboard = (
    <AccountDashboard
      slug={slug}
      merchantName={merchantName}
      status={status}
      overview={overview}
      tab={tab}
      currency={currency}
      isStoreSlugRoute={false}
      profileSlot={profileSlot}
      onLoadOrder={(orderId) => setOpenOrderId(orderId)}
      orderDetail={
        orderDetail.data && openOrderId
          ? { orderId: openOrderId, detail: orderDetail.data }
          : null
      }
      orderDetailPending={orderDetail.isFetching}
      orderDetailError={orderDetail.isError}
      onSaveAddress={(values) => saveAddress.mutate({ slug, ...values })}
      onDeleteAddress={(addressId) => delAddress.mutate({ slug, addressId })}
      onSaveProfile={(values) =>
        saveProfile.mutate({ slug, ...values, locale: "bn" })
      }
      onSetConsent={(consent) => setConsent.mutate({ slug, ...consent })}
      onToggleWishlist={(variantId) =>
        toggleWish.mutate({ slug, variantId, stockAlert: false })
      }
      busy={{
        address: saveAddress.isPending || delAddress.isPending,
        profile: saveProfile.isPending,
        consent: setConsent.isPending,
        wishlist: toggleWish.isPending,
      }}
    />
  );

  return (
    <PluginLayer plugins={chrome?.installedPlugins ?? []}>
      <AccountDashboardProvider value={accountState}>
        <ThemeChrome
          template="account"
          ast={chrome?.ast ?? null}
          tokens={chrome?.tokens ?? null}
          storeSlug={slug}
          themeKey={chrome?.themeKey ?? null}
          merchantId={chrome?.merchant.id ?? null}
          siteKit={chrome?.siteKit ?? null}
          ownsPrimary
          contentSlot="page_content"
          contextSlots={{ ...accountSlots, page_content: dashboard }}
          chrome={
            <StoreHeader
              slug={slug}
              name={merchantName}
              themeKey={chrome?.themeKey ?? null}
              showAnnouncement={false}
            />
          }
          containerClassName="mx-auto max-w-[var(--fq-container,1280px)] px-4 py-12 sm:px-6 lg:px-8"
          fallback={dashboard}
        />
      </AccountDashboardProvider>
    </PluginLayer>
  );
}
