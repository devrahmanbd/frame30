import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Heart,
  MapPin,
  Package,
  ShieldCheck,
  Trash2,
  User,
} from "@/components/icons/tabler";
import { toast } from "sonner";
import { ThemeChrome } from "@/components/store/ThemeChrome";
import { PluginLayer } from "@/components/store/PluginLayer";
import { StoreHeader } from "@/components/store/StoreHeader";
import { supabase } from "@/integrations/supabase/client";
import { fmtMinor } from "@/lib/money";
import { useLang } from "@/lib/i18n";
import { flattenAst } from "@/lib/builder-ast";
import { OrdersList, ProfileCard } from "@/components/builder/account";
import {
  accountSlotCtx,
  mapOrdersToRows,
  mapProfileToRow,
} from "@/components/store/account-slots";
import {
  accountDeleteAddressFn,
  accountOverviewFn,
  accountSaveAddressFn,
  accountSetConsentFn,
  accountToggleWishlistFn,
  accountUpsertSelfFn,
} from "@/lib/accounts.functions";
import { getStoreChrome } from "@/lib/storefront.functions";
import {
  ACCOUNT_TABS as TABS,
  initialAccountTab,
  isAccountTab,
  nextAccountTabSearch,
  type AccountTab,
} from "@/lib/account-tab";

export const Route = createFileRoute("/store/$slug/account")({
  validateSearch: (s: Record<string, unknown>): { tab?: AccountTab } => ({
    tab: isAccountTab(s.tab) ? s.tab : undefined,
  }),
  loader: async ({ params }) => {
    // The published `account` template, when the merchant has one. Rejected
    // by the storefront validator until the template-key track extends it —
    // caught to null so the page renders the built-in dashboard regardless.
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
});

type Tab = AccountTab;

const CONSENTS = [
  { channel: "email", purpose: "marketing" },
  { channel: "sms", purpose: "marketing" },
  { channel: "email", purpose: "cart_recovery" },
  { channel: "email", purpose: "stock_alerts" },
] as const;

function AccountPage() {
  const { t } = useLang();
  const { slug } = Route.useParams();
  const { chrome } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.id });
  // URL is the source of truth (same pattern as auth.tsx search.mode):
  // popstate and direct ?tab= URLs re-sync with no effect and cannot bounce.
  // Distinct-tab clicks push (see push-vs-replace rationale in
  // src/lib/account-tab.ts) so Back restores the prior tab.
  const tab: Tab = initialAccountTab(search.tab);
  const selectTab = (key: Tab) => {
    if (key === tab) return;
    void navigate({
      to: ".",
      search: (prev) => nextAccountTabSearch(prev, key),
    });
  };
  const qc = useQueryClient();
  const overviewFn = useServerFn(accountOverviewFn);

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
  const mutate = <T,>(
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

  const saveAddress = mutate(
    useServerFn(accountSaveAddressFn),
    t("Address saved", "ঠিকানা সংরক্ষিত"),
  );
  const delAddress = mutate(
    useServerFn(accountDeleteAddressFn),
    t("Address removed", "ঠিকানা মুছে ফেলা হয়েছে"),
  );
  const saveProfile = mutate(
    useServerFn(accountUpsertSelfFn),
    t("Profile saved", "প্রোফাইল সংরক্ষিত"),
  );
  const setConsent = mutate(
    useServerFn(accountSetConsentFn),
    t("Preference saved", "পছন্দ সংরক্ষিত"),
  );
  const toggleWish = mutate(
    useServerFn(accountToggleWishlistFn),
    t("Wishlist updated", "উইশলিস্ট হালনাগাদ"),
  );

  const store = account.data?.store;
  const data = account.data?.overview;
  const currency = store?.currency_code ?? "BDT";
  const consentMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const c of data?.consents ?? [])
      m.set(`${c.channel}:${c.purpose}`, c.granted);
    return m;
  }, [data?.consents]);

  if (!signedIn) {
    return <ShopperOrderLookup slug={slug} />;
  }

  // Route's default body: used when the theme publishes no `account` main
  // sections, so the page is never blank. (The `defaultAccountAst` fallback
  // takes the `ast` slot once the widget registry knows its section types.)
  const dashboard = (
    <>
      <h1 className="font-bangla-display text-3xl sm:text-4xl font-medium tracking-wide text-foreground/90 text-center sm:text-left">
        {t("Your Account", "আপনার অ্যাকাউন্ট")}
      </h1>

      <div
        role="tablist"
        aria-label={t("Account sections", "অ্যাকাউন্ট বিভাগ")}
        className="mt-10 flex flex-wrap gap-6 border-b border-border/60"
      >
        {TABS.map((key) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            onClick={() => selectTab(key)}
            className={`flex h-12 items-center gap-2 border-b-2 px-1 text-[13px] font-bold fq-caps tracking-widest transition-colors ${
              tab === key
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {key === "orders" && <Package className="size-4" aria-hidden />}
            {key === "addresses" && <MapPin className="size-4" aria-hidden />}
            {key === "wishlist" && <Heart className="size-4" aria-hidden />}
            {key === "profile" && <User className="size-4" aria-hidden />}
            {key === "privacy" && (
              <ShieldCheck className="size-4" aria-hidden />
            )}
            {key === "orders"
              ? t("Orders", "অর্ডার")
              : key === "addresses"
                ? t("Addresses", "ঠিকানা")
                : key === "wishlist"
                  ? t("Wishlist", "উইশলিস্ট")
                  : key === "profile"
                    ? t("Profile", "প্রোফাইল")
                    : t("Privacy", "গোপনীয়তা")}
          </button>
        ))}
      </div>

      {account.isPending && (
        <p className="mt-6 text-sm text-muted-foreground" aria-live="polite">
          {t("Loading your account…", "আপনার অ্যাকাউন্ট লোড হচ্ছে…")}
        </p>
      )}

      {account.isError && (
        <p className="mt-6 rounded-fq-md border border-danger bg-danger/10 p-4 text-sm text-danger-foreground">
          {t(
            "We could not load your account right now.",
            "এখন আপনার অ্যাকাউন্ট লোড করা যায়নি।",
          )}
        </p>
      )}

      {data && (
        <section role="tabpanel" className="mt-6">
          {tab === "orders" &&
            (data.orders.length === 0 ? (
              <Empty
                text={t("No orders yet.", "এখনও কোনো অর্ডার নেই।")}
                slug={slug}
              />
            ) : (
              <ul className="divide-y divide-border/60">
                {data.orders.map((o) => (
                  <li key={o.id}>
                    <Link
                      to="/store/$slug/order/$orderId"
                      params={{ slug, orderId: o.id }}
                      className="flex flex-wrap items-center justify-between gap-4 py-6 transition-colors hover:bg-muted/30 -mx-4 px-4 sm:mx-0 sm:px-0"
                    >
                      <span className="min-w-0">
                        <span className="money block text-[14px] font-bold text-foreground">
                          {o.order_number}
                        </span>
                        <time
                          dateTime={o.created_at}
                          className="money text-[12px] font-medium tracking-wide text-muted-foreground mt-1 block"
                        >
                          {new Date(o.created_at).toLocaleDateString("en-GB")}
                        </time>
                      </span>
                      <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
                        {o.status}
                      </span>
                      <span className="money text-[14px] font-semibold text-foreground tracking-wide">
                        {fmtMinor(o.total_minor_int, o.currency_code)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ))}

          {tab === "addresses" && (
            <div className="space-y-4">
              <ul className="grid gap-6 sm:grid-cols-2">
                {data.addresses.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-col justify-between border border-border/60 p-6 bg-transparent"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[13.5px] font-bold text-foreground">
                          {a.label}
                          {a.is_default && (
                            <span className="ml-3 inline-block rounded-full bg-foreground/10 px-2.5 py-1 text-[10px] font-bold fq-caps tracking-widest text-foreground">
                              {t("Default", "ডিফল্ট")}
                            </span>
                          )}
                        </p>
                        <p className="mt-3 text-[13.5px] text-muted-foreground leading-relaxed">
                          <span className="font-medium text-foreground/80">
                            {a.full_name}
                          </span>{" "}
                          · <span className="money">{a.phone}</span>
                          <br />
                          {a.line1}
                          {a.line2 ? `, ${a.line2}` : ""}
                          <br />
                          {a.city}, {a.district}{" "}
                          <span className="money">{a.postcode ?? ""}</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label={t(`Remove ${a.label}`, `${a.label} মুছুন`)}
                        onClick={() =>
                          delAddress.mutate({ slug, addressId: a.id })
                        }
                        className="text-muted-foreground hover:text-danger-foreground transition-colors p-2 -mr-2 -mt-2"
                      >
                        <Trash2 className="size-5" aria-hidden />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <AddressForm
                busy={saveAddress.isPending}
                onSubmit={(v) => saveAddress.mutate({ slug, ...v })}
              />
            </div>
          )}

          {tab === "wishlist" &&
            (data.wishlist.length === 0 ? (
              <Empty
                text={t("Nothing saved yet.", "এখনও কিছু সংরক্ষিত নেই।")}
                slug={slug}
              />
            ) : (
              <ul className="divide-y divide-border/60">
                {data.wishlist.map((w) => (
                  <li
                    key={w.id}
                    className="flex items-center justify-between gap-4 py-6"
                  >
                    <Link
                      to="/store/$slug/p/$productSlug"
                      params={{ slug, productSlug: w.product_slug }}
                      className="min-w-0"
                    >
                      <span className="block truncate text-[14px] font-medium leading-relaxed">
                        {w.product_title}
                      </span>
                      <span className="block text-[12px] font-medium tracking-wide text-muted-foreground mt-0.5">
                        {w.variant_name}
                      </span>
                      <span className="money mt-2 block text-[13.5px] font-semibold tracking-wide">
                        {fmtMinor(w.price_amount_minor_int, currency)}
                      </span>
                      <span
                        className={`text-[11px] font-bold fq-caps tracking-widest block mt-2 ${w.stock_quantity > 0 ? "text-foreground" : "text-danger-foreground"}`}
                      >
                        {w.stock_quantity > 0
                          ? t("In Stock", "স্টকে আছে")
                          : t("Out of Stock", "স্টক নেই")}
                      </span>
                    </Link>
                    <button
                      type="button"
                      onClick={() =>
                        toggleWish.mutate({
                          slug,
                          variantId: w.variant_id,
                          stockAlert: false,
                        })
                      }
                      className="text-[11px] font-bold fq-caps tracking-widest text-muted-foreground hover:text-foreground transition-colors px-4 py-2"
                    >
                      {t("Remove", "সরান")}
                    </button>
                  </li>
                ))}
              </ul>
            ))}

          {tab === "profile" && (
            <ProfileForm
              busy={saveProfile.isPending}
              initial={{
                name: data.profile?.name ?? "",
                email: data.profile?.email ?? "",
                phone: data.profile?.phone ?? "",
              }}
              onSubmit={(v) => saveProfile.mutate({ slug, ...v, locale: "bn" })}
            />
          )}

          {tab === "privacy" && (
            <div className="max-w-xl space-y-3">
              <p className="text-sm text-muted-foreground">
                {t(
                  "You choose which messages this store may send you. Turning one off applies everywhere immediately.",
                  "এই দোকান আপনাকে কোন বার্তা পাঠাতে পারবে তা আপনি ঠিক করবেন। বন্ধ করলে সব জায়গায় সাথে সাথে প্রযোজ্য হবে।",
                )}
              </p>
              {CONSENTS.map((c) => {
                const key = `${c.channel}:${c.purpose}`;
                const on = consentMap.get(key) ?? false;
                return (
                  <label
                    key={key}
                    className="flex items-center justify-between gap-4 py-6 border-b border-border/60"
                  >
                    <span>
                      <span className="font-bold text-[13px] text-foreground block">
                        {c.purpose.replace("_", " ")}
                      </span>
                      <span className="block text-[11px] font-bold uppercase tracking-widest text-muted-foreground mt-1">
                        {c.channel}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) =>
                        setConsent.mutate({
                          slug,
                          channel: c.channel,
                          purpose: c.purpose,
                          granted: e.target.checked,
                        })
                      }
                      className="size-5 accent-foreground"
                    />
                  </label>
                );
              })}
            </div>
          )}
        </section>
      )}
    </>
  );

  const { lang } = useLang();
  // Theme account template: feed merchant orders_list / profile_card
  // sections live session rows. The widgets fall back to their sign-in
  // prompt when signed out (rows undefined, not pending).
  const overview = account.data?.overview;
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
    if (p) {
      const row = overview?.profile
        ? mapProfileToRow(overview.profile)
        : undefined;
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
  }, [chrome, account.data, account.isPending, lang, slug]);

  return (
    <PluginLayer plugins={chrome?.installedPlugins ?? []}>
      <ThemeChrome
        template="account"
        ast={chrome?.ast ?? null}
        tokens={chrome?.tokens ?? null}
        storeSlug={slug}
        merchantId={chrome?.merchant.id ?? null}
        siteKit={chrome?.siteKit ?? null}
        ownsPrimary
        contextSlots={accountSlots}
        chrome={
          <StoreHeader
            slug={slug}
            name={chrome?.merchant.name ?? store?.name ?? slug}
          />
        }
        containerClassName="mx-auto max-w-[var(--fq-container,1280px)] px-4 py-12 sm:px-6 lg:px-8"
        fallback={dashboard}
      />
    </PluginLayer>
  );
}

function Empty({ text, slug }: { text: string; slug: string }) {
  const { t } = useLang();
  return (
    <div className="py-12">
      <p className="text-[13.5px] text-muted-foreground">{text}</p>
      <Link
        to="/store/$slug"
        search={{ preview_token: undefined }}
        params={{ slug }}
        className="mt-6 inline-flex min-h-12 items-center justify-center border border-border px-8 text-[11px] font-bold fq-caps tracking-widest text-foreground hover:bg-muted/50 transition-colors"
      >
        {t("Start Shopping", "কেনাকাটা শুরু করুন")}
      </Link>
    </div>
  );
}

type AddressValues = {
  label: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  district: string;
  postcode: string;
  isDefault: boolean;
  addressType: "shipping" | "billing";
};

function AddressForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (v: AddressValues) => void;
}) {
  const { t } = useLang();
  const [v, setV] = useState<AddressValues>({
    label: "",
    fullName: "",
    phone: "",
    line1: "",
    line2: "",
    city: "",
    district: "",
    postcode: "",
    isDefault: false,
    addressType: "shipping",
  });
  const set =
    (k: keyof AddressValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setV((p) => ({
        ...p,
        [k]: k === "isDefault" ? e.target.checked : e.target.value,
      }));

  const fields: [keyof AddressValues, string, string][] = [
    ["label", t("Label", "লেবেল"), t("Home", "বাসা")],
    ["fullName", t("Full name", "পুরো নাম"), ""],
    ["phone", t("Phone", "ফোন"), "01XXXXXXXXX"],
    ["line1", t("Address line 1", "ঠিকানা ১"), ""],
    ["line2", t("Address line 2", "ঠিকানা ২"), ""],
    ["city", t("City", "শহর"), ""],
    ["district", t("District", "জেলা"), ""],
    ["postcode", t("Postcode", "পোস্টকোড"), ""],
  ];

  return (
    <form
      className="mt-12 max-w-2xl"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
    >
      <h2 className="text-[11px] font-bold fq-caps tracking-widest text-foreground border-b border-border/60 pb-3 mb-6">
        {t("Add an Address", "নতুন ঠিকানা যোগ করুন")}
      </h2>
      <div className="grid gap-6 sm:grid-cols-2">
        {fields.map(([key, label, placeholder]) => (
          <label key={key} htmlFor={`addr-${key}`} className="block">
            <span className="mb-2 block text-[11px] font-bold fq-caps tracking-widest text-muted-foreground">
              {label}
            </span>
            <input
              id={`addr-${key}`}
              value={String(v[key])}
              onChange={set(key)}
              placeholder={placeholder}
              required={[
                "label",
                "fullName",
                "phone",
                "line1",
                "city",
                "district",
              ].includes(key)}
              className="min-h-12 w-full border-b border-border/60 bg-transparent px-0 text-[13.5px] focus:outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground/30"
            />
          </label>
        ))}
      </div>
      <label className="mt-8 flex items-center gap-3 text-[13px] font-medium text-foreground">
        <input
          type="checkbox"
          checked={v.isDefault}
          onChange={set("isDefault")}
          className="size-4 accent-foreground"
        />
        {t("Set as default address", "ডিফল্ট ঠিকানা হিসেবে সেট করুন")}
      </label>
      <button
        type="submit"
        disabled={busy}
        className="mt-8 min-h-14 bg-foreground px-10 text-[13px] font-bold fq-caps tracking-widest text-background transition-transform active:scale-[0.98] disabled:opacity-60"
      >
        {busy
          ? t("Saving…", "সংরক্ষণ হচ্ছে…")
          : t("Save Address", "ঠিকানা সংরক্ষণ করুন")}
      </button>
    </form>
  );
}

function ProfileForm({
  busy,
  initial,
  onSubmit,
}: {
  busy: boolean;
  initial: { name: string; email: string; phone: string };
  onSubmit: (v: { name: string; email: string; phone: string }) => void;
}) {
  const { t } = useLang();
  const [v, setV] = useState(initial);
  return (
    <form
      className="max-w-xl"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
    >
      <h2 className="text-[11px] font-bold fq-caps tracking-widest text-foreground border-b border-border/60 pb-3 mb-6">
        {t("Your Details", "আপনার তথ্য")}
      </h2>
      <div className="space-y-6">
        <label htmlFor="pf-name" className="block">
          <span className="mb-2 block text-[11px] font-bold fq-caps tracking-widest text-muted-foreground">
            {t("Full Name", "পুরো নাম")}
          </span>
          <input
            id="pf-name"
            value={v.name}
            required
            onChange={(e) => setV((p) => ({ ...p, name: e.target.value }))}
            className="min-h-12 w-full border-b border-border/60 bg-transparent px-0 text-[13.5px] focus:outline-none focus:border-foreground transition-colors"
          />
        </label>
        <label htmlFor="pf-phone" className="block">
          <span className="mb-2 block text-[11px] font-bold fq-caps tracking-widest text-muted-foreground">
            {t("Phone", "ফোন")}
          </span>
          <input
            id="pf-phone"
            value={v.phone}
            required
            inputMode="tel"
            onChange={(e) => setV((p) => ({ ...p, phone: e.target.value }))}
            className="money min-h-12 w-full border-b border-border/60 bg-transparent px-0 text-[13.5px] focus:outline-none focus:border-foreground transition-colors"
          />
        </label>
        <label htmlFor="pf-email" className="block">
          <span className="mb-2 block text-[11px] font-bold fq-caps tracking-widest text-muted-foreground">
            {t("Email (optional)", "ইমেইল (ঐচ্ছিক)")}
          </span>
          <input
            id="pf-email"
            type="email"
            value={v.email}
            onChange={(e) => setV((p) => ({ ...p, email: e.target.value }))}
            className="min-h-12 w-full border-b border-border/60 bg-transparent px-0 text-[13.5px] focus:outline-none focus:border-foreground transition-colors"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={busy}
        className="mt-10 min-h-14 bg-foreground px-10 text-[13px] font-bold fq-caps tracking-widest text-background transition-transform active:scale-[0.98] disabled:opacity-60"
      >
        {busy
          ? t("Saving…", "সংরক্ষণ হচ্ছে…")
          : t("Save Details", "তথ্য সংরক্ষণ করুন")}
      </button>
    </form>
  );
}

function ShopperOrderLookup({ slug }: { slug: string }) {
  const { t } = useLang();
  const navigate = useNavigate();
  const [orderId, setOrderId] = useState("");

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId.trim()) return;
    void navigate({
      to: "/store/$slug/order/$orderId",
      params: { slug, orderId: orderId.trim() },
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <StoreHeader slug={slug} name={slug} />
      <main className="mx-auto max-w-[var(--fq-container,1280px)] px-4 py-16 sm:px-6 lg:px-8 text-center">
        <div className="mx-auto max-w-md mt-12">
          <h1 className="font-bangla-display text-3xl font-medium tracking-wide">
            {t("Track Your Order", "আপনার অর্ডার খুঁজুন")}
          </h1>
          <p className="mt-4 text-[13.5px] text-muted-foreground leading-relaxed">
            {t(
              "Enter your Order ID from your confirmation message or receipt to check its status.",
              "আপনার অর্ডার আইডি দিয়ে অর্ডারের বর্তমান অবস্থা এবং বিস্তারিত তথ্য দেখুন।",
            )}
          </p>
          <form
            onSubmit={handleLookup}
            className="mt-10 flex flex-col gap-6 text-left"
          >
            <label htmlFor="order-lookup-input" className="block">
              <span className="mb-2 block text-[11px] font-bold fq-caps tracking-widest text-muted-foreground">
                {t("Order ID", "অর্ডার আইডি")}
              </span>
              <input
                id="order-lookup-input"
                type="text"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                placeholder={t("e.g. ord_01j7...", "যেমন: ord_01j7...")}
                required
                className="min-h-12 w-full border-b border-border/60 bg-transparent px-0 text-[13.5px] focus:outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground/30"
              />
            </label>
            <button
              type="submit"
              className="min-h-14 w-full bg-foreground px-8 text-[13px] font-bold fq-caps tracking-widest text-background transition-transform active:scale-[0.98]"
            >
              {t("View Order Status", "অর্ডার স্ট্যাটাস দেখুন")}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
