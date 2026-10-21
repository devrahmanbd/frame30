/**
 * The account dashboard — the shopper's OWN account area.
 *
 * The account route used to hand-build this surface inline (a heading, a tab
 * strip and five panels, `src/routes/store.$slug.account.tsx`). It is a
 * component now, because the theme composes AROUND it: the route owns the
 * data, the theme owns the frame, and this module is the designed body both
 * of them agree on.
 *
 * **The data contract.** Everything here is read from ONE payload — the
 * `AccountOverview` the `customer_overview` RPC returns for the CURRENT
 * shopper (`src/lib/accounts.server.ts:36-67`). Nothing is derived from
 * another customer, from a query parameter or from a widget: the identity is
 * the session's, and the numbers are counts and facts the RPC hands back.
 * A figure that cannot be computed from that payload is not rendered at all.
 *
 * **The navigation contract.** The five destinations are the `ACCOUNT_TABS`
 * union (`src/lib/account-tab.ts:8-14`) and each one is a REAL link to
 * `?tab=<value>` on this same route (`/store/$slug/account`). The tree
 * serves no per-tab routes — the tabs are search values on ONE route — so
 * there is no such path to link to here.
 *
 * **The layout contract.** The breakpoints are the platform's (`sm` 640,
 * `md` 768, `lg` 1024, `xl` 1280 — `src/lib/responsive.ts:11-18`), used
 * through Tailwind's own prefixes. No hand-rolled width variants appear in
 * this file, so the storefront can never drift from the studio's device
 * frames.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  Heart,
  MapPin,
  Package,
  ShieldCheck,
  Trash2,
  User,
} from "@/components/icons/tabler";
import { useLang } from "@/lib/i18n";
import { fmtMinor } from "@/lib/money";
import type { AccountTab } from "@/lib/account-tab";
import type {
  AccountOverview,
  ConsentChannel,
  ConsentPurpose,
} from "@/lib/accounts.server";
import { mapOrdersToRows } from "./account-slots";

/** The route's own state — the six states the account surface distinguishes. */
export type AccountDashboardStatus =
  "unauthenticated" | "loading" | "error" | "ready";

export type AccountAddressValues = {
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

export type AccountDashboardProps = {
  /** The store's slug — every link is a real route on this store. */
  slug: string;
  /** The shopper's own overview. Undefined while loading or signed out. */
  overview?: AccountOverview;
  /** Which state the surface is in. */
  status: AccountDashboardStatus;
  /** The active tab — a `?tab=` value on `/store/$slug/account`. */
  tab: AccountTab;
  /**
   * Called when the shopper picks a tab. Present only where the surface is
   * NOT driven by the URL (the theme preview); on the storefront the tab
   * links navigate and the route's own search parameter carries the state.
   */
  onTabChange?: (tab: AccountTab) => void;
  /**
   * The composed `profile_card` — the merchant's OWN profile section. The
   * dashboard renders it in its profile area when the theme does not place a
   * profile section of its own, so the shopper's details are never shown
   * twice on one page.
   */
  profileSlot?: ReactNode;
  /** The store's currency — the fallback when a row carries none. */
  currency: string;
  onSaveAddress?: (values: AccountAddressValues) => void;
  onDeleteAddress?: (addressId: string) => void;
  onSaveProfile?: (values: {
    name: string;
    email: string;
    phone: string;
  }) => void;
  onSetConsent?: (consent: {
    channel: ConsentChannel;
    purpose: ConsentPurpose;
    granted: boolean;
  }) => void;
  onToggleWishlist?: (variantId: string) => void;
  busy?: {
    address?: boolean;
    profile?: boolean;
    consent?: boolean;
    wishlist?: boolean;
  };
};

/**
 * The five destinations — the `ACCOUNT_TABS` union, one entry each, with the
 * icon and the label the nav renders. The list is written out (rather than
 * derived) so the icon and the bilingual label live beside the tab value.
 */
const ACCOUNT_TAB_ITEMS: readonly {
  tab: AccountTab;
  en: string;
  bn: string;
  icon: "package" | "map" | "heart" | "user" | "shield";
}[] = [
  { tab: "orders", en: "Orders", bn: "অর্ডার", icon: "package" },
  { tab: "addresses", en: "Addresses", bn: "ঠিকানা", icon: "map" },
  { tab: "wishlist", en: "Wishlist", bn: "উইশলিস্ট", icon: "heart" },
  { tab: "profile", en: "Profile", bn: "প্রোফাইল", icon: "user" },
  { tab: "privacy", en: "Privacy", bn: "গোপনীয়তা", icon: "shield" },
];

function TabIcon({
  icon,
}: {
  icon: (typeof ACCOUNT_TAB_ITEMS)[number]["icon"];
}) {
  const cls = "size-4 shrink-0";
  if (icon === "package") return <Package className={cls} aria-hidden />;
  if (icon === "map") return <MapPin className={cls} aria-hidden />;
  if (icon === "heart") return <Heart className={cls} aria-hidden />;
  if (icon === "user") return <User className={cls} aria-hidden />;
  return <ShieldCheck className={cls} aria-hidden />;
}

/** The consent switches the platform offers — the same four the route owned. */
const CONSENTS: readonly {
  channel: ConsentChannel;
  purpose: ConsentPurpose;
}[] = [
  { channel: "email", purpose: "marketing" },
  { channel: "sms", purpose: "marketing" },
  { channel: "email", purpose: "cart_recovery" },
  { channel: "email", purpose: "stock_alerts" },
];

function formatDay(value: string | undefined, lang: string): string {
  if (!value) return "";
  const time = Date.parse(value);
  if (Number.isNaN(time)) return "";
  return new Date(time).toLocaleDateString(lang === "bn" ? "bn-BD" : "en-GB");
}

/**
 * The account surface.
 *
 * The six states are DISTINCT and each one is reachable: signed out, loading,
 * failed, signed in with orders, signed in without orders.
 */
export function AccountDashboard({
  slug,
  overview,
  status,
  tab,
  onTabChange,
  profileSlot,
  currency,
  onSaveAddress,
  onDeleteAddress,
  onSaveProfile,
  onSetConsent,
  onToggleWishlist,
  busy,
}: AccountDashboardProps) {
  const { t, lang } = useLang();

  if (status === "unauthenticated") {
    return <OrderLookup slug={slug} />;
  }

  const panelId = "account-panel";
  const tabId = (key: AccountTab) => `account-tab-${key}`;

  if (status === "loading") {
    return (
      <section className="py-16" aria-live="polite">
        <h1 className="font-bangla-display text-3xl font-medium tracking-wide text-foreground/90 sm:text-4xl">
          {t("Your Account", "আপনার অ্যাকাউন্ট")}
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">
          {t("Loading your account…", "আপনার অ্যাকাউন্ট লোড হচ্ছে…")}
        </p>
      </section>
    );
  }

  if (status === "error") {
    return (
      <section className="py-16">
        <h1 className="font-bangla-display text-3xl font-medium tracking-wide text-foreground/90 sm:text-4xl">
          {t("Your Account", "আপনার অ্যাকাউন্ট")}
        </h1>
        <p
          role="alert"
          className="mt-6 rounded-fq-md border border-danger bg-danger/10 p-4 text-sm text-danger-foreground"
        >
          {t(
            "We could not load your account right now.",
            "এখন আপনার অ্যাকাউন্ট লোড করা যায়নি।",
          )}
        </p>
      </section>
    );
  }

  const orders = overview?.orders ?? [];
  const addresses = overview?.addresses ?? [];
  const wishlist = overview?.wishlist ?? [];
  const consents = overview?.consents ?? [];
  const profile = overview?.profile ?? null;

  // The MOST RECENT order — the newest `created_at` the RPC returned, not
  // the first row it happened to send.
  const latest = orders.reduce<(typeof orders)[number] | null>(
    (best, order) =>
      best === null ||
      Date.parse(order.created_at) > Date.parse(best.created_at)
        ? order
        : best,
    null,
  );
  const defaultAddress = addresses.find((address) => address.is_default);
  const name = profile?.name ?? "";
  const email = profile?.email ?? "";

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <h1 className="font-bangla-display text-3xl font-medium tracking-wide text-foreground/90 sm:text-4xl">
          {t("Your Account", "আপনার অ্যাকাউন্ট")}
        </h1>
        <p className="text-[13.5px] text-muted-foreground">
          {name
            ? t("Signed in as ", "সাইন ইন করা আছেন ") + name
            : t(
                "Signed in to this store's account.",
                "এই দোকানের অ্যাকাউন্টে সাইন ইন করা আছে।",
              )}
          {email ? ` · ${email}` : ""}
        </p>
      </header>

      <nav
        role="tablist"
        aria-label={t("Account sections", "অ্যাকাউন্ট বিভাগ")}
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 lg:gap-3"
      >
        {ACCOUNT_TAB_ITEMS.map((item) => {
          const selected = item.tab === tab;
          return (
            <Link
              key={item.tab}
              id={tabId(item.tab)}
              to="/store/$slug/account"
              params={{ slug }}
              search={{ tab: item.tab }}
              role="tab"
              aria-selected={selected}
              aria-controls={panelId}
              onClick={(event) => {
                if (!onTabChange) return;
                event.preventDefault();
                onTabChange(item.tab);
              }}
              className={`flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-[13px] font-bold fq-caps tracking-widest transition-colors ${
                selected
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <TabIcon icon={item.icon} />
              <span>{t(item.en, item.bn)}</span>
            </Link>
          );
        })}
      </nav>

      <section
        role="tabpanel"
        id={panelId}
        aria-labelledby={tabId(tab)}
        tabIndex={0}
        className="space-y-10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground"
      >
        <section aria-label={t("At a glance", "এক নজরে")} className="space-y-4">
          <h2 className="text-[11px] font-bold fq-caps tracking-widest text-muted-foreground">
            {t("At a glance", "এক নজরে")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Fact
              label={t("Orders", "অর্ডার")}
              value={
                orders.length === 1
                  ? t("1 order", "১টি অর্ডার")
                  : t(`${orders.length} orders`, `${orders.length}টি অর্ডার`)
              }
            />
            <Fact
              label={t("Latest order", "সর্বশেষ অর্ডার")}
              value={latest ? latest.order_number : "—"}
              detail={latest ? latest.status : undefined}
            />
            <Fact
              label={t("Default address", "ডিফল্ট ঠিকানা")}
              value={defaultAddress ? defaultAddress.city : "—"}
              detail={
                defaultAddress
                  ? defaultAddress.district
                  : t("Not set", "সেট করা নেই")
              }
            />
            <Fact
              label={t("Saved items", "সংরক্ষিত পণ্য")}
              value={String(wishlist.length)}
            />
          </div>
        </section>

        {tab === "orders" &&
          (orders.length === 0 ? (
            <Empty
              text={t("No orders yet.", "এখনও কোনো অর্ডার নেই।")}
              slug={slug}
            />
          ) : (
            <OrderRows slug={slug} orders={orders} lang={lang} />
          ))}

        {tab === "addresses" && (
          <div className="space-y-6">
            {addresses.length === 0 ? (
              <Empty
                text={t(
                  "No saved addresses yet.",
                  "এখনও কোনো ঠিকানা সংরক্ষণ করা নেই।",
                )}
                slug={slug}
              />
            ) : (
              <ul className="grid gap-6 sm:grid-cols-2">
                {addresses.map((address) => (
                  <li
                    key={address.id}
                    className="flex flex-col justify-between border border-border/60 p-6 bg-transparent"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[13.5px] font-bold text-foreground">
                          {address.label}
                          {address.is_default && (
                            <span className="ml-3 inline-block rounded-full bg-foreground/10 px-2.5 py-1 text-[10px] font-bold fq-caps tracking-widest text-foreground">
                              {t("Default", "ডিফল্ট")}
                            </span>
                          )}
                        </p>
                        <p className="mt-3 text-[13.5px] text-muted-foreground leading-relaxed">
                          <span className="font-medium text-foreground/80">
                            {address.full_name}
                          </span>{" "}
                          · <span className="money">{address.phone}</span>
                          <br />
                          {address.line1}
                          {address.line2 ? `, ${address.line2}` : ""}
                          <br />
                          {address.city}, {address.district}{" "}
                          <span className="money">
                            {address.postcode ?? ""}
                          </span>
                        </p>
                      </div>
                      {onDeleteAddress ? (
                        <button
                          type="button"
                          aria-label={t(
                            `Remove ${address.label}`,
                            `${address.label} মুছুন`,
                          )}
                          onClick={() => onDeleteAddress(address.id)}
                          className="text-muted-foreground hover:text-danger-foreground transition-colors p-2 -mr-2 -mt-2"
                        >
                          <Trash2 className="size-5" aria-hidden />
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {onSaveAddress ? (
              <AddressForm
                busy={busy?.address ?? false}
                onSubmit={(values) => onSaveAddress(values)}
              />
            ) : null}
          </div>
        )}

        {tab === "wishlist" &&
          (wishlist.length === 0 ? (
            <Empty
              text={t("Nothing saved yet.", "এখনও কিছু সংরক্ষিত নেই।")}
              slug={slug}
            />
          ) : (
            <ul className="divide-y divide-border/60">
              {wishlist.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-4 py-6"
                >
                  <Link
                    to="/store/$slug/p/$productSlug"
                    params={{ slug, productSlug: item.product_slug }}
                    className="min-w-0"
                  >
                    <span className="block truncate text-[14px] font-medium leading-relaxed">
                      {item.product_title}
                    </span>
                    <span className="block text-[12px] font-medium tracking-wide text-muted-foreground mt-0.5">
                      {item.variant_name}
                    </span>
                    <span className="money mt-2 block text-[13.5px] font-semibold tracking-wide">
                      {fmtMinor(item.price_amount_minor_int, currency)}
                    </span>
                    <span
                      className={`text-[11px] font-bold fq-caps tracking-widest block mt-2 ${item.stock_quantity > 0 ? "text-foreground" : "text-danger-foreground"}`}
                    >
                      {item.stock_quantity > 0
                        ? t("In Stock", "স্টকে আছে")
                        : t("Out of Stock", "স্টক নেই")}
                    </span>
                  </Link>
                  {onToggleWishlist ? (
                    <button
                      type="button"
                      onClick={() => onToggleWishlist(item.variant_id)}
                      className="text-[11px] font-bold fq-caps tracking-widest text-muted-foreground hover:text-foreground transition-colors px-4 py-2"
                    >
                      {t("Remove", "সরান")}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ))}

        {tab === "profile" && (
          <div className="space-y-8">
            {/* The composed profile — the merchant's OWN `profile_card`
                section when the theme does not place one of its own (the
                route hands it over only then, so the shopper's details are
                never shown twice on one page) — and the editable contact
                fields the platform keeps for the shopper. */}
            {profileSlot ? (
              <section
                aria-label={t("Your profile", "আপনার প্রোফাইল")}
                className="border border-border/60 p-6 bg-transparent"
              >
                {profileSlot}
              </section>
            ) : null}
            {onSaveProfile ? (
              <ProfileForm
                busy={busy?.profile ?? false}
                initial={{
                  name: profile?.name ?? "",
                  email: profile?.email ?? "",
                  phone: profile?.phone ?? "",
                }}
                onSubmit={(values) => onSaveProfile(values)}
              />
            ) : null}
          </div>
        )}

        {tab === "privacy" && (
          <div className="max-w-xl space-y-3">
            <p className="text-sm text-muted-foreground">
              {t(
                "You choose which messages this store may send you. Turning one off applies everywhere immediately.",
                "এই দোকান আপনাকে কোন বার্তা পাঠাতে পারবে তা আপনি ঠিক করবেন। বন্ধ করলে সব জায়গায় সাথে সাথে প্রযোজ্য হবে।",
              )}
            </p>
            {CONSENTS.map((consent) => {
              const granted =
                consents.find(
                  (row) =>
                    row.channel === consent.channel &&
                    row.purpose === consent.purpose,
                )?.granted ?? false;
              return (
                <label
                  key={`${consent.channel}:${consent.purpose}`}
                  className="flex items-center justify-between gap-4 py-6 border-b border-border/60"
                >
                  <span>
                    <span className="font-bold text-[13px] text-foreground block">
                      {consent.purpose.replace("_", " ")}
                    </span>
                    <span className="block text-[11px] font-bold uppercase tracking-widest text-muted-foreground mt-1">
                      {consent.channel}
                    </span>
                  </span>
                  {onSetConsent ? (
                    <input
                      type="checkbox"
                      checked={granted}
                      onChange={(event) =>
                        onSetConsent({
                          channel: consent.channel,
                          purpose: consent.purpose,
                          granted: event.target.checked,
                        })
                      }
                      className="size-5 accent-foreground"
                    />
                  ) : (
                    <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                      {granted ? t("On", "চালু") : t("Off", "বন্ধ")}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

/** One fact in the overview strip — a count or a fact the RPC returned. */
function Fact({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="border border-border/60 p-5 bg-transparent">
      <p className="text-[11px] font-bold fq-caps tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="money mt-2 truncate text-[15px] font-semibold tracking-wide text-foreground">
        {value}
      </p>
      {detail ? (
        <p className="mt-1 truncate text-[12px] font-medium tracking-wide text-muted-foreground">
          {detail}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The order history, laid out as ROWS: the order number, the date, the status
 * and the total — the four fields the platform's own row mapping produces
 * (`mapOrdersToRows`), arranged rather than listed.
 */
function OrderRows({
  slug,
  orders,
  lang,
}: {
  slug: string;
  orders: AccountOverview["orders"];
  lang: string;
}) {
  const rows = mapOrdersToRows(orders);
  return (
    <ul className="divide-y divide-border/60">
      {rows.map((row) => (
        <li key={row.id}>
          <Link
            to="/store/$slug/order/$orderId"
            params={{ slug, orderId: row.id }}
            className="grid gap-2 py-6 transition-colors hover:bg-muted/30 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-6 -mx-4 px-4 sm:mx-0 sm:px-0"
          >
            <span className="min-w-0">
              <span className="money block text-[14px] font-bold text-foreground">
                {row.title}
              </span>
              <time
                dateTime={row.date}
                className="money text-[12px] font-medium tracking-wide text-muted-foreground mt-1 block"
              >
                {formatDay(row.date, lang)}
              </time>
            </span>
            {row.subtitle ? (
              <span className="justify-self-start text-[11px] font-bold uppercase tracking-widest text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
                {row.subtitle}
              </span>
            ) : null}
            {typeof row.priceMinor === "number" ? (
              <span className="money text-[14px] font-semibold text-foreground tracking-wide">
                {fmtMinor(row.priceMinor, row.currency)}
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
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

function AddressForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (values: AccountAddressValues) => void;
}) {
  const { t } = useLang();
  const [values, setValues] = useState<AccountAddressValues>({
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
    (key: keyof AccountAddressValues) =>
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setValues((previous) => ({
        ...previous,
        [key]: key === "isDefault" ? event.target.checked : event.target.value,
      }));

  const fields: [keyof AccountAddressValues, string, string][] = [
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
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(values);
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
              value={String(values[key])}
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
          checked={values.isDefault}
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
  onSubmit: (values: { name: string; email: string; phone: string }) => void;
}) {
  const { t } = useLang();
  const [values, setValues] = useState(initial);
  return (
    <form
      className="max-w-xl"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(values);
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
            value={values.name}
            required
            onChange={(event) =>
              setValues((previous) => ({
                ...previous,
                name: event.target.value,
              }))
            }
            className="min-h-12 w-full border-b border-border/60 bg-transparent px-0 text-[13.5px] focus:outline-none focus:border-foreground transition-colors"
          />
        </label>
        <label htmlFor="pf-phone" className="block">
          <span className="mb-2 block text-[11px] font-bold fq-caps tracking-widest text-muted-foreground">
            {t("Phone", "ফোন")}
          </span>
          <input
            id="pf-phone"
            value={values.phone}
            required
            inputMode="tel"
            onChange={(event) =>
              setValues((previous) => ({
                ...previous,
                phone: event.target.value,
              }))
            }
            className="money min-h-12 w-full border-b border-border/60 bg-transparent px-0 text-[13.5px] focus:outline-none focus:border-foreground transition-colors"
          />
        </label>
        <label htmlFor="pf-email" className="block">
          <span className="mb-2 block text-[11px] font-bold fq-caps tracking-widest text-muted-foreground">
            {t("Email (optional)", "ইমেইল (ঐচ্ছিক)")}
          </span>
          <input
            id="pf-email"
            value={values.email}
            type="email"
            onChange={(event) =>
              setValues((previous) => ({
                ...previous,
                email: event.target.value,
              }))
            }
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

/**
 * The signed-out state.
 *
 * The platform's honest unauthenticated surface is the ORDER LOOKUP: a
 * shopper who is not signed in can still find an order they placed. This is
 * the same thing the account route rendered before the dashboard existed —
 * the same honest thing, not a themed sign-in page the platform cannot
 * authenticate against.
 */
function OrderLookup({ slug }: { slug: string }) {
  const { t } = useLang();
  const navigate = useNavigate();
  const [orderId, setOrderId] = useState("");

  const handleLookup = (event: React.FormEvent) => {
    event.preventDefault();
    if (!orderId.trim()) return;
    void navigate({
      to: "/store/$slug/order/$orderId",
      params: { slug, orderId: orderId.trim() },
    });
  };

  return (
    <div className="mx-auto max-w-md py-10 text-center sm:py-16">
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
            onChange={(event) => setOrderId(event.target.value)}
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
  );
}
