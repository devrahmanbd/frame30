import { createFileRoute } from "@tanstack/react-router";
import { useMemo, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ThemeChrome } from "@/components/store/ThemeChrome";
import { PluginLayer } from "@/components/store/PluginLayer";
import { StoreHeader } from "@/components/store/StoreHeader";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { flattenAst, type Section } from "@/lib/builder-ast";
import { OrdersList, ProfileCard } from "@/components/builder/account";
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
  accountOverviewFn,
  accountSaveAddressFn,
  accountSetConsentFn,
  accountToggleWishlistFn,
  accountUpsertSelfFn,
} from "@/lib/accounts.functions";
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

function AccountPage() {
  const { t, lang } = useLang();
  const { slug } = Route.useParams();
  const { chrome } = Route.useLoaderData();
  const search = Route.useSearch();
  const qc = useQueryClient();
  const overviewFn = useServerFn(accountOverviewFn);

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
  // (Above the signed-out early return so hooks run unconditionally in the
  // same order on every render; rendered output is unchanged.)
  const accountSlots = useMemo(() => {
    const sections = chrome?.ast ? flattenAst(chrome.ast) : [];
    const out: Partial<Record<string, ReactNode>> = {};
    const pending = account.isPending;
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
    if (p) {
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
    return out;
  }, [chrome, overview, account.isPending, lang, slug]);

  // The composed profile card. The THEME places it when its account body
  // carries a `profile_card` section (the slot above); when it does not, the
  // dashboard carries it instead — so the shopper's details are shown ONCE.
  const themePlacesProfile = Boolean(
    chrome?.ast &&
    flattenAst(chrome.ast).some((section) => section.type === "profile_card"),
  );
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
          pending: account.isPending,
          locale: lang,
          storeSlug: slug,
        })}
      />
    );
  }, [themePlacesProfile, overview, account.isPending, lang, slug]);

  // The six states the account surface distinguishes.
  const status: AccountDashboardStatus = session.isPending
    ? "loading"
    : !signedIn
      ? "unauthenticated"
      : account.isPending
        ? "loading"
        : account.isError
          ? "error"
          : "ready";

  const dashboard = (
    <AccountDashboard
      slug={slug}
      overview={overview}
      status={status}
      tab={tab}
      profileSlot={profileSlot}
      currency={currency}
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
        // merchant's own sections (the profile card, and anything else they
        // place) frame the route's body, which flows through the platform's
        // route-owned body slot.
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
    </PluginLayer>
  );
}
