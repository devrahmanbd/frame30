import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Heart, MapPin, Package, ShieldCheck, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { StoreHeader } from "@/components/store/StoreHeader";
import { supabase } from "@/integrations/supabase/client";
import { fmtMinor } from "@/lib/money";
import { useLang } from "@/lib/i18n";
import {
  accountDeleteAddressFn,
  accountOverviewFn,
  accountSaveAddressFn,
  accountSetConsentFn,
  accountToggleWishlistFn,
  accountUpsertSelfFn,
} from "@/lib/accounts.functions";

export const Route = createFileRoute("/store/$slug/account")({
  head: ({ params }) => {
    const title = `Your account — ${params.slug}`;
    const description = "Manage your orders, saved addresses, wishlist and message preferences.";
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

const TABS = ["orders", "addresses", "wishlist", "profile", "privacy"] as const;
type Tab = (typeof TABS)[number];

const CONSENTS = [
  { channel: "email", purpose: "marketing" },
  { channel: "sms", purpose: "marketing" },
  { channel: "email", purpose: "cart_recovery" },
  { channel: "email", purpose: "stock_alerts" },
] as const;

function AccountPage() {
  const { t } = useLang();
  const { slug } = Route.useParams();
  const [tab, setTab] = useState<Tab>("orders");
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

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["store-account", slug] });
  const mutate = <T,>(fn: (input: { data: T }) => Promise<unknown>, done: string) =>
    useMutation({
      mutationFn: (data: T) => fn({ data }),
      onSuccess: () => {
        invalidate();
        toast.success(done);
      },
      onError: (e: Error) =>
        toast.error(
          e.message.includes("rate")
            ? t("Too many changes — wait a moment.", "অনেক বেশি পরিবর্তন — একটু অপেক্ষা করুন।")
            : t("Could not save. Try again.", "সংরক্ষণ হয়নি। আবার চেষ্টা করুন।"),
        ),
    });

  const saveAddress = mutate(useServerFn(accountSaveAddressFn), t("Address saved", "ঠিকানা সংরক্ষিত"));
  const delAddress = mutate(useServerFn(accountDeleteAddressFn), t("Address removed", "ঠিকানা মুছে ফেলা হয়েছে"));
  const saveProfile = mutate(useServerFn(accountUpsertSelfFn), t("Profile saved", "প্রোফাইল সংরক্ষিত"));
  const setConsent = mutate(useServerFn(accountSetConsentFn), t("Preference saved", "পছন্দ সংরক্ষিত"));
  const toggleWish = mutate(useServerFn(accountToggleWishlistFn), t("Wishlist updated", "উইশলিস্ট হালনাগাদ"));

  const store = account.data?.store;
  const data = account.data?.overview;
  const currency = store?.currency_code ?? "BDT";
  const consentMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const c of data?.consents ?? []) m.set(`${c.channel}:${c.purpose}`, c.granted);
    return m;
  }, [data?.consents]);

  if (!signedIn) {
    return (
      <div className="min-h-screen bg-background">
        <StoreHeader slug={slug} name={slug} />
        <main className="mx-auto max-w-md px-4 py-16 text-center">
          <h1 className="font-bangla-display text-2xl font-bold">{t("Your account", "আপনার অ্যাকাউন্ট")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t(
              "Sign in to see your orders, addresses and wishlist for this store.",
              "এই দোকানের অর্ডার, ঠিকানা ও উইশলিস্ট দেখতে সাইন ইন করুন।",
            )}
          </p>
          <Link
            to="/auth"
            search={{ redirect: `/store/${slug}/account` }}
            className="mt-6 inline-flex min-h-11 items-center rounded-fq-md bg-primary px-5 text-sm font-medium text-primary-foreground"
          >
            {t("Sign in", "সাইন ইন")}
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <StoreHeader slug={slug} name={store?.name ?? slug} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="font-bangla-display text-2xl font-bold sm:text-3xl">
          {t("Your account", "আপনার অ্যাকাউন্ট")}
        </h1>

        <div role="tablist" aria-label={t("Account sections", "অ্যাকাউন্ট বিভাগ")} className="mt-4 flex flex-wrap gap-2">
          {TABS.map((key) => (
            <button
              key={key}
              role="tab"
              type="button"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`inline-flex min-h-11 items-center gap-2 rounded-fq-md border px-3 text-sm font-medium ${
                tab === key
                  ? "border-bd-teal-700 bg-bd-teal-700 text-background"
                  : "border-border bg-card text-muted-foreground hover:bg-muted"
              }`}
            >
              {key === "orders" && <Package className="size-4" aria-hidden />}
              {key === "addresses" && <MapPin className="size-4" aria-hidden />}
              {key === "wishlist" && <Heart className="size-4" aria-hidden />}
              {key === "profile" && <User className="size-4" aria-hidden />}
              {key === "privacy" && <ShieldCheck className="size-4" aria-hidden />}
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
            {t("We could not load your account right now.", "এখন আপনার অ্যাকাউন্ট লোড করা যায়নি।")}
          </p>
        )}

        {data && (
          <section role="tabpanel" className="mt-6">
            {tab === "orders" &&
              (data.orders.length === 0 ? (
                <Empty text={t("No orders yet.", "এখনও কোনো অর্ডার নেই।")} slug={slug} />
              ) : (
                <ul className="space-y-2">
                  {data.orders.map((o) => (
                    <li key={o.id}>
                      <Link
                        to="/store/$slug/order/$orderId"
                        params={{ slug, orderId: o.id }}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-fq-lg border border-border bg-card p-4 hover:bg-muted"
                      >
                        <span>
                          <span className="money block text-sm font-semibold">{o.order_number}</span>
                          <time dateTime={o.created_at} className="money text-xs text-muted-foreground">
                            {new Date(o.created_at).toLocaleDateString("en-GB")}
                          </time>
                        </span>
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">{o.status}</span>
                        <span className="money text-sm font-semibold">
                          {fmtMinor(o.total_minor_int, o.currency_code)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ))}

            {tab === "addresses" && (
              <div className="space-y-4">
                <ul className="grid gap-3 sm:grid-cols-2">
                  {data.addresses.map((a) => (
                    <li key={a.id} className="rounded-fq-lg border border-border bg-card p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">
                            {a.label}
                            {a.is_default && (
                              <span className="ml-2 rounded-full bg-success/15 px-2 py-0.5 text-xs text-success-foreground">
                                {t("Default", "ডিফল্ট")}
                              </span>
                            )}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {a.full_name} · <span className="money">{a.phone}</span>
                            <br />
                            {a.line1}
                            {a.line2 ? `, ${a.line2}` : ""}
                            <br />
                            {a.city}, {a.district} <span className="money">{a.postcode ?? ""}</span>
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-label={t(`Remove ${a.label}`, `${a.label} মুছুন`)}
                          onClick={() => delAddress.mutate({ slug, addressId: a.id })}
                          className="rounded-fq-md p-2 text-danger-foreground hover:bg-danger/10"
                        >
                          <Trash2 className="size-4" aria-hidden />
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
                <Empty text={t("Nothing saved yet.", "এখনও কিছু সংরক্ষিত নেই।")} slug={slug} />
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {data.wishlist.map((w) => (
                    <li key={w.id} className="flex items-center justify-between gap-3 rounded-fq-lg border border-border bg-card p-4">
                      <Link
                        to="/store/$slug/p/$productSlug"
                        params={{ slug, productSlug: w.product_slug }}
                        className="min-w-0"
                      >
                        <span className="block truncate text-sm font-medium">{w.product_title}</span>
                        <span className="block text-xs text-muted-foreground">{w.variant_name}</span>
                        <span className="money mt-1 block text-sm font-semibold">
                          {fmtMinor(w.price_amount_minor_int, currency)}
                        </span>
                        <span
                          className={`text-xs ${w.stock_quantity > 0 ? "text-success-foreground" : "text-warn-foreground"}`}
                        >
                          {w.stock_quantity > 0 ? t("In stock", "স্টকে আছে") : t("Out of stock", "স্টক নেই")}
                        </span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => toggleWish.mutate({ slug, variantId: w.variant_id, stockAlert: false })}
                        className="min-h-11 rounded-fq-md border border-border px-3 text-xs"
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
                      className="flex items-center justify-between gap-3 rounded-fq-lg border border-border bg-card p-4 text-sm"
                    >
                      <span>
                        <span className="font-medium capitalize">{c.purpose.replace("_", " ")}</span>
                        <span className="block text-xs uppercase tracking-wide text-muted-foreground">{c.channel}</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) =>
                          setConsent.mutate({ slug, channel: c.channel, purpose: c.purpose, granted: e.target.checked })
                        }
                        className="size-5 accent-[var(--bd-teal-700)]"
                      />
                    </label>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function Empty({ text, slug }: { text: string; slug: string }) {
  const { t } = useLang();
  return (
    <div className="rounded-fq-lg border border-border bg-card p-6">
      <p className="text-sm text-muted-foreground">{text}</p>
      <Link to="/store/$slug" params={{ slug }} className="mt-3 inline-block text-sm text-primary underline">
        {t("Start shopping", "কেনাকাটা শুরু করুন")}
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

function AddressForm({ busy, onSubmit }: { busy: boolean; onSubmit: (v: AddressValues) => void }) {
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
  const set = (k: keyof AddressValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV((p) => ({ ...p, [k]: k === "isDefault" ? e.target.checked : e.target.value }));

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
      className="rounded-fq-lg border border-border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
    >
      <h2 className="font-bangla-display text-lg font-semibold">{t("Add an address", "ঠিকানা যোগ করুন")}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {fields.map(([key, label, placeholder]) => (
          <label key={key} htmlFor={`addr-${key}`} className="text-xs text-muted-foreground">
            {label}
            <input
              id={`addr-${key}`}
              value={String(v[key])}
              onChange={set(key)}
              placeholder={placeholder}
              required={["label", "fullName", "phone", "line1", "city", "district"].includes(key)}
              className="mt-1 block min-h-11 w-full rounded-fq-md border border-border bg-background px-3 text-sm"
            />
          </label>
        ))}
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={v.isDefault} onChange={set("isDefault")} className="size-4 accent-[var(--bd-teal-700)]" />
        {t("Use as my default address", "এটিকে ডিফল্ট ঠিকানা করুন")}
      </label>
      <button
        type="submit"
        disabled={busy}
        className="mt-4 min-h-11 rounded-fq-md bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {busy ? t("Saving…", "সংরক্ষণ হচ্ছে…") : t("Save address", "ঠিকানা সংরক্ষণ")}
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
      className="max-w-md rounded-fq-lg border border-border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
    >
      <h2 className="font-bangla-display text-lg font-semibold">{t("Your details", "আপনার তথ্য")}</h2>
      <div className="mt-3 space-y-3">
        <label htmlFor="pf-name" className="block text-xs text-muted-foreground">
          {t("Full name", "পুরো নাম")}
          <input
            id="pf-name"
            value={v.name}
            required
            onChange={(e) => setV((p) => ({ ...p, name: e.target.value }))}
            className="mt-1 block min-h-11 w-full rounded-fq-md border border-border bg-background px-3 text-sm"
          />
        </label>
        <label htmlFor="pf-phone" className="block text-xs text-muted-foreground">
          {t("Phone", "ফোন")}
          <input
            id="pf-phone"
            value={v.phone}
            required
            inputMode="tel"
            onChange={(e) => setV((p) => ({ ...p, phone: e.target.value }))}
            className="money mt-1 block min-h-11 w-full rounded-fq-md border border-border bg-background px-3 text-sm"
          />
        </label>
        <label htmlFor="pf-email" className="block text-xs text-muted-foreground">
          {t("Email (optional)", "ইমেইল (ঐচ্ছিক)")}
          <input
            id="pf-email"
            type="email"
            value={v.email}
            onChange={(e) => setV((p) => ({ ...p, email: e.target.value }))}
            className="mt-1 block min-h-11 w-full rounded-fq-md border border-border bg-background px-3 text-sm"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={busy}
        className="mt-4 min-h-11 rounded-fq-md bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {busy ? t("Saving…", "সংরক্ষণ হচ্ছে…") : t("Save details", "তথ্য সংরক্ষণ")}
      </button>
    </form>
  );
}
