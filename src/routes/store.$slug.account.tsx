import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ThemeChrome } from "@/components/store/ThemeChrome";
import { PluginLayer } from "@/components/store/PluginLayer";
import { StoreHeader } from "@/components/store/StoreHeader";
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
import { getStoreChrome } from "@/lib/storefront.functions";
import { StorefrontError } from "@/components/store/StorefrontError";
import {
  initialAccountTab,
  isAccountTab,
  type AccountTab,
} from "@/lib/account-tab";

export const Route = createFileRoute("/store/$slug/account")({
  validateSearch: (s: Record<string, unknown>): { tab?: AccountTab } => ({
    tab: isAccountTab(s.tab) ? s.tab : undefined,
  }),
  loader: async ({ params }) => {
    // The published `account` template, when the merchant has one. `account`
    // IS a known template key — it has been in `TEMPLATE_KEYS` since Phase 6
    // (`src/lib/builder-ast.ts:50`) — and `getStoreChrome`'s validator lists
    // it (`src/lib/storefront.functions.ts:107`), so the OLD comment here
    // ("Rejected by the storefront validator until the template-key track
    // extends it") was FALSE from Phase 6 onward. The `.catch` below now
    // swallows only a GENUINE loader failure, so the page falls back to the
    // built-in dashboard when the merchant has no published body.
    const chrome = await getStoreChrome({
      data: { slug: params.slug, template: "account" },
    }).catch(() => null);
    return { chrome };
  },
  head: ({ params }) => {
    const title = `Your account — ${params.slug}`;
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
  errorComponent: StorefrontError,
  notFoundComponent: AccountMissing,
});

function AccountMissing() {
  const { t } = useLang();
  return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">
        {t("Store not found", "দোকান পাওয়া যায়নি")}
      </h1>
    </main>
  );
}

/**
 * The account's four placeable panels — the closed vocabulary the theme's
 * own body may place. A panel the theme places is granted to the theme's
 * body; a panel it does not place is the DASHBOARD's — and the dashboard's
 * fallback skips the placed ones, so a panel is never shown twice on one
 * page.
 */
const ACCOUNT_PANEL_TYPES: readonly AccountPanelType[] = [
  "account_nav",
  "account_overview",
  "account_orders",
  "account_details",
];

function AccountPage() {
  const { t, lang } = useLang();
  const { slug } = Route.useParams();
  const { chrome } = Route.useLoaderData();
  const search = Route.useSearch();
  const qc = useQueryClient();
  const overviewFn = useServerFn(accountOverviewFn);
  const navigate = useNavigate();

  // The active tab is a URL state — the five destinations are `?tab=` values
  // on THIS route (`/store/$slug/account`), not separate routes. The dashboard's
  // navigation links carry them, so a tab is shareable and survives a reload.
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

  // The session-scoped order detail. The order route is TOKEN-GATED
  // (`loadOrder` returns nothing unless the request carries the order's own
  // access token) and the account payload carries no token — so the order
  // rows can never LINK to it. `accountOrderFn` is the tree's own
  // session-scoped server function for a shopper's OWN order, resolved by
  // the `customer_order_detail` RPC under `auth.uid()`, so the shopper sees
  // their order inline with no token and no dead link.
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

  // Theme account template: feed merchant `orders_list` / `profile_card`
  // sections live session rows. The widgets fall back to their sign-in
  // prompt when signed out (rows undefined, not pending).
  //
  // The `pending` flag is the SESSION-GATED one: the overview query is
  // disabled for a signed-out shopper, and in React Query v5 a disabled
  // query is `status: "pending"` — so the raw `account.isPending` would
  // show a signed-out visitor a skeleton forever instead of the widgets'
  // sign-in prompt.
  const pending = accountSlotsPending({
    signedIn,
    queryPending: account.isPending,
  });

  /**
   * The panels the THEME's own body placed.
   *
   * The generalised form of `themePlacesAccountProfile`: the route supplies a
   * control the theme's body does not place, and the supply is explicit. A
   * panel the theme places is the THEME's; a panel it does not place is the
   * DASHBOARD's — and the dashboard's fallback skips the placed ones, so a
   * panel is never shown twice on one page.
   */
  const placedPanels = useMemo(() => {
    const out: AccountPanelType[] = [];
    for (const panel of ACCOUNT_PANEL_TYPES) {
      if (themePlacesAccountPanel(chrome?.ast, panel)) out.push(panel);
    }
    return out;
  }, [chrome?.ast]);

  /**
   * The tab selection. The five destinations are `?tab=` values on THIS
   * route, so the selection is the URL's — the provider's `setTab` navigates
   * to the tab's own URL exactly as the dashboard's own nav links do.
   */
  const setTab = useCallback(
    (next: AccountTab) => {
      void navigate({
        to: "/store/$slug/account",
        params: { slug },
        search: { tab: next },
      });
    },
    [navigate, slug],
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
    // (Batch D, self-critique fix 2) The theme's profile card is the shopper's
    // OWN profile — it is granted to a SIGNED-IN shopper only. An anonymous
    // visitor gets the platform's single, designed order-lookup panel; the
    // widget's own bare "Sign in to continue." prompt is a SECOND sign-in
    // block, in a different type language, directly above it.
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
    // The account's four PLACEABLE panels. A panel the theme's body places is
    // granted here (the panel itself reads the account provider — the route's
    // own session-scoped state — and nothing else); a panel it does not place
    // is the dashboard's, and the dashboard's fallback skips the placed ones.
    if (placedPanels.includes("account_nav")) out.account_nav = null;
    if (placedPanels.includes("account_overview")) out.account_overview = null;
    if (placedPanels.includes("account_orders")) out.account_orders = null;
    if (placedPanels.includes("account_details")) out.account_details = null;
    return out;
  }, [chrome, overview, pending, lang, slug, signedIn, placedPanels]);

  // The composed profile card. The THEME places it when its account body
  // carries a `profile_card` section (the slot above); when it does not, the
  // dashboard carries it instead — so the shopper's details are shown ONCE.
  //
  // "The theme places it" means the theme's body RENDERS: `ThemeChrome`
  // drops the theme's ENTIRE body when it declares no `page_content`
  // section, so a merchant whose published account body predates the
  // route-owned body slot (the old `heading` + `profile_card` +
  // `orders_list` composition) renders NO theme body at all — and then the
  // dashboard must carry the profile. The route therefore asks the SAME
  // question `ThemeChrome` asks (`themePlacesAccountProfile`), so the two
  // can never disagree about who places the profile card.
  const themePlacesProfile = themePlacesAccountProfile(chrome?.ast);
  const profileSlot = useMemo(() => {
    if (themePlacesProfile) return undefined;
    const row = overview?.profile
      ? mapProfileToRow(overview.profile)
      : undefined;
    if (!row) return undefined;
    // A STABLE synthetic section — the platform's own profile widget, rendered
    // with the shopper's own row. (The id is fixed so the server and the
    // browser agree on it.)
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

  // The six states the account surface distinguishes — ONE pure mapping
  // (`src/lib/account-status.ts`), unit-tested in every combination.
  const status: AccountDashboardStatus = accountStatus({
    sessionPending: session.isPending,
    signedIn,
    queryPending: account.isPending,
    queryError: account.isError,
  });

  /**
   * The route's own account state — ONE object, shared by the dashboard's
   * own copy of every panel and by the panel the THEME places in its body.
   *
   * The provider is mounted by the ROUTE, above `ThemeChrome`, so the two
   * copies read ONE state: the same tab, the same open order, the same write
   * callbacks. Without it a theme-placed panel and the dashboard's copy would
   * disagree — and the shopper would see one tab selected in the nav and
   * another tab's panel below it.
   */
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
      // The order rows disclose the order inline, resolved under the
      // shopper's own session. There is no link to the token-gated order
      // route, so there is no link that can 404.
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
      // The panels the THEME's body placed — the dashboard's fallback skips
      // them, so a panel is never shown twice on one page.
      placed: placedPanels,
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
    ],
  );

  const dashboard = (
    <AccountDashboard
      slug={slug}
      overview={overview}
      status={status}
      tab={tab}
      profileSlot={profileSlot}
      currency={currency}
      // The order rows disclose the order inline, resolved under the
      // shopper's own session. There is no link to the token-gated order
      // route, so there is no link that can 404.
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
      {/*
        The account's ONE state, mounted ABOVE the theme host: a panel the
        theme places in its own body and the dashboard's own copy of the same
        panel read the same tab, the same open order and the same write
        callbacks. The provider carries no credential and never queries — it
        is the route's own state, verbatim.
      */}
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
          // The theme's account body is composed AROUND the dashboard: the
          // merchant's own sections (the placeable account panels, and
          // anything else they place) frame the route's body, which flows
          // through the platform's route-owned body slot.
          contentSlot="page_content"
          contextSlots={{ ...accountSlots, page_content: dashboard }}
          chrome={
            <StoreHeader
              slug={slug}
              name={chrome?.merchant.name ?? store?.name ?? slug}
              themeKey={chrome?.themeKey ?? null}
            />
          }
          containerClassName="mx-auto max-w-[var(--fq-container,1280px)] px-4 py-12 sm:px-6 lg:px-8"
          fallback={dashboard}
        />
      </AccountDashboardProvider>
    </PluginLayer>
  );
}
