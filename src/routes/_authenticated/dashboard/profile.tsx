import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useCustomerAccount, useCustomerMutation, useCustomerProfile } from "@/hooks/use-customer";
import {
  customerSaveProfileFn,
  customerSaveAddressFn,
  customerDeleteAddressFn,
  customerSetConsentFn,
} from "@/lib/customer.functions";
import { useLang } from "@/lib/i18n";
import { EmptyState, InlineError, PageHeader, TableSkeleton } from "@/components/console/primitives";
import {
  User,
  Mail,
  Phone,
  Globe,
  MapPin,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  ShieldCheck,
  Bell,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard/profile")({
  head: () => ({
    meta: [
      { title: "Profile & Address Book — Framique" },
      { name: "description", content: "Your contact details, address book, and privacy settings." },
      { property: "og:title", content: "Profile & Address Book — Framique" },
      { property: "og:description", content: "Your contact details, address book, and privacy settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ProfilePage,
});

type AddressFormState = {
  addressId: string | null;
  addressType: "shipping" | "billing";
  label: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  district: string;
  postcode: string;
  isDefault: boolean;
};

const EMPTY_ADDRESS: AddressFormState = {
  addressId: null,
  addressType: "shipping",
  label: "Home",
  fullName: "",
  phone: "",
  line1: "",
  line2: "",
  city: "Dhaka",
  district: "Dhaka",
  postcode: "",
  isDefault: false,
};

function ProfilePage() {
  const { t, lang, setLang } = useLang();
  const { data: account } = useCustomerAccount();
  const profileQuery = useCustomerProfile(Boolean(account?.id));

  // Profile Form State
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedLang, setSelectedLang] = useState<"en" | "bn">("en");
  const [profileSaved, setProfileSaved] = useState(false);

  // Address Modal/Form State
  const [isAddressFormOpen, setIsAddressFormOpen] = useState(false);
  const [addressForm, setAddressForm] = useState<AddressFormState>(EMPTY_ADDRESS);

  // Sync initial profile values
  useEffect(() => {
    if (profileQuery.data?.profile) {
      const p = profileQuery.data.profile;
      setName(p.name ?? "");
      setEmail(p.email ?? "");
      setPhone(p.phone ?? "");
      const locale = (p.locale === "bn" ? "bn" : "en") as "en" | "bn";
      setSelectedLang(locale);
    }
  }, [profileQuery.data?.profile]);

  // Mutations
  const saveProfileMutation = useCustomerMutation(customerSaveProfileFn, [
    ["customer", "profile"],
    ["customer-account"],
  ]);

  const saveAddressMutation = useCustomerMutation(customerSaveAddressFn, [
    ["customer", "profile"],
  ]);

  const deleteAddressMutation = useCustomerMutation(customerDeleteAddressFn, [
    ["customer", "profile"],
  ]);

  const setConsentMutation = useCustomerMutation(customerSetConsentFn, [
    ["customer", "profile"],
  ]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    await saveProfileMutation.mutateAsync({
      name: name.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      locale: selectedLang,
    });

    setLang(selectedLang);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 3000);
  };

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addressForm.fullName.trim() || !addressForm.line1.trim()) return;

    await saveAddressMutation.mutateAsync({
      addressId: addressForm.addressId,
      addressType: addressForm.addressType,
      label: addressForm.label.trim(),
      fullName: addressForm.fullName.trim(),
      phone: addressForm.phone.trim(),
      line1: addressForm.line1.trim(),
      line2: addressForm.line2.trim(),
      city: addressForm.city.trim(),
      district: addressForm.district.trim(),
      postcode: addressForm.postcode.trim(),
      isDefault: addressForm.isDefault,
    });

    setIsAddressFormOpen(false);
    setAddressForm(EMPTY_ADDRESS);
  };

  const handleEditAddress = (addr: (typeof addresses)[number]) => {
    setAddressForm({
      addressId: addr.id,
      addressType: addr.address_type as "shipping" | "billing",
      label: addr.label,
      fullName: addr.full_name,
      phone: addr.phone,
      line1: addr.line1,
      line2: addr.line2 ?? "",
      city: addr.city,
      district: addr.district,
      postcode: addr.postcode ?? "",
      isDefault: addr.is_default,
    });
    setIsAddressFormOpen(true);
  };

  const handleDeleteAddress = async (addressId: string) => {
    await deleteAddressMutation.mutateAsync({ addressId });
  };

  const handleToggleConsent = async (
    channel: "email" | "sms" | "push",
    purpose: "marketing" | "cart_recovery" | "stock_alerts",
    currentGranted: boolean,
  ) => {
    await setConsentMutation.mutateAsync({
      channel,
      purpose,
      granted: !currentGranted,
    });
  };

  const addresses = profileQuery.data?.addresses ?? [];
  const consents = profileQuery.data?.consents ?? [];

  const getConsent = (
    channel: "email" | "sms" | "push",
    purpose: "marketing" | "cart_recovery" | "stock_alerts",
  ) => {
    return (
      consents.find((c) => c.channel === channel && c.purpose === purpose)?.granted ?? false
    );
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("Profile & Address Book", "প্রোফাইল ও ঠিকানা")}
        description={t(
          "Manage your personal information, delivery addresses, and communication preferences.",
          "আপনার ব্যক্তিগত তথ্য, ডেলিভারির ঠিকানা ও যোগাযোগের পছন্দসমূহ নিয়ন্ত্রণ করুন।",
        )}
      />

      {profileQuery.isPending && <TableSkeleton rows={3} cols={2} />}

      {profileQuery.isError && (
        <InlineError
          message={t("Could not load your profile details.", "প্রোফাইল তথ্য লোড করা যায়নি।")}
          onRetry={() => void profileQuery.refetch()}
        />
      )}

      {!profileQuery.isPending && (
        <div className="space-y-8">
          {/* Section 1: Personal Details & Language */}
          <section className="rounded-fq-xl border border-border bg-card p-5 sm:p-6 shadow-sm">
            <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              {t("Personal Details", "ব্যক্তিগত বিবরণ")}
            </h2>

            <form onSubmit={handleSaveProfile} className="space-y-4 max-w-xl">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  {t("Full Name", "পুরো নাম")} *
                </label>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-fq-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    {t("Email", "ইমেইল")}
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-fq-md border border-border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    {t("Phone Number", "মোবাইল নম্বর")}
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+8801..."
                      className="w-full rounded-fq-md border border-border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  {t("Language Preference", "পছন্দের ভাষা")}
                </label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="radio"
                      name="lang"
                      value="en"
                      checked={selectedLang === "en"}
                      onChange={() => setSelectedLang("en")}
                      className="h-4 w-4 text-primary focus:ring-primary"
                    />
                    English
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="radio"
                      name="lang"
                      value="bn"
                      checked={selectedLang === "bn"}
                      onChange={() => setSelectedLang("bn")}
                      className="h-4 w-4 text-primary focus:ring-primary"
                    />
                    বাংলা (Bangla)
                  </label>
                </div>
              </div>

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={saveProfileMutation.isPending}
                  className="rounded-fq-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {saveProfileMutation.isPending
                    ? t("Saving…", "সংরক্ষণ করা হচ্ছে…")
                    : t("Save Changes", "পরিবর্তন সংরক্ষণ করুন")}
                </button>
                {profileSaved && (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    <CheckCircle2 className="h-4 w-4" />
                    {t("Saved successfully", "সফলভাবে সংরক্ষিত হয়েছে")}
                  </span>
                )}
              </div>
            </form>
          </section>

          {/* Section 2: Address Book */}
          <section className="rounded-fq-xl border border-border bg-card p-5 sm:p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                {t("Saved Addresses", "সংরক্ষিত ঠিকানা")}
              </h2>
              {!isAddressFormOpen && (
                <button
                  type="button"
                  onClick={() => {
                    setAddressForm(EMPTY_ADDRESS);
                    setIsAddressFormOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-fq-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("Add Address", "ঠিকানা যোগ করুন")}
                </button>
              )}
            </div>

            {/* Address Edit/Add Form */}
            {isAddressFormOpen && (
              <form
                onSubmit={handleSaveAddress}
                className="rounded-fq-lg border border-primary/30 bg-muted/20 p-4 space-y-3"
              >
                <div className="flex items-center justify-between border-b border-border/70 pb-2">
                  <h3 className="text-sm font-semibold">
                    {addressForm.addressId
                      ? t("Edit Address", "ঠিকানা সম্পাদনা")
                      : t("New Delivery Address", "নতুন ডেলিভারির ঠিকানা")}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsAddressFormOpen(false)}
                    className="text-muted-foreground hover:text-foreground p-1"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      {t("Label (e.g. Home, Office)", "লেবেল (যেমন: বাসা, অফিস)")}
                    </label>
                    <input
                      required
                      value={addressForm.label}
                      onChange={(e) => setAddressForm({ ...addressForm, label: e.target.value })}
                      className="w-full rounded-fq-md border border-border bg-background px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      {t("Recipient Name", "প্রাপকের নাম")} *
                    </label>
                    <input
                      required
                      value={addressForm.fullName}
                      onChange={(e) => setAddressForm({ ...addressForm, fullName: e.target.value })}
                      className="w-full rounded-fq-md border border-border bg-background px-3 py-1.5 text-sm"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      {t("Phone", "মোবাইল নম্বর")} *
                    </label>
                    <input
                      required
                      value={addressForm.phone}
                      onChange={(e) => setAddressForm({ ...addressForm, phone: e.target.value })}
                      className="w-full rounded-fq-md border border-border bg-background px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      {t("Address Type", "ঠিকানার ধরণ")}
                    </label>
                    <select
                      value={addressForm.addressType}
                      onChange={(e) =>
                        setAddressForm({
                          ...addressForm,
                          addressType: e.target.value as "shipping" | "billing",
                        })
                      }
                      className="w-full rounded-fq-md border border-border bg-background px-3 py-1.5 text-sm"
                    >
                      <option value="shipping">{t("Shipping Address", "শিপিং ঠিকানা")}</option>
                      <option value="billing">{t("Billing Address", "বিলিং ঠিকানা")}</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    {t("Street Address / House & Road", "রাস্তা / বাড়ি নম্বর")} *
                  </label>
                  <input
                    required
                    value={addressForm.line1}
                    onChange={(e) => setAddressForm({ ...addressForm, line1: e.target.value })}
                    className="w-full rounded-fq-md border border-border bg-background px-3 py-1.5 text-sm"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      {t("City", "শহর")} *
                    </label>
                    <input
                      required
                      value={addressForm.city}
                      onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })}
                      className="w-full rounded-fq-md border border-border bg-background px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      {t("District", "জেলা")} *
                    </label>
                    <input
                      required
                      value={addressForm.district}
                      onChange={(e) => setAddressForm({ ...addressForm, district: e.target.value })}
                      className="w-full rounded-fq-md border border-border bg-background px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      {t("Postcode", "পোস্টকোড")}
                    </label>
                    <input
                      value={addressForm.postcode}
                      onChange={(e) => setAddressForm({ ...addressForm, postcode: e.target.value })}
                      className="w-full rounded-fq-md border border-border bg-background px-3 py-1.5 text-sm"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="isDefault"
                    checked={addressForm.isDefault}
                    onChange={(e) =>
                      setAddressForm({ ...addressForm, isDefault: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <label htmlFor="isDefault" className="text-xs font-medium cursor-pointer">
                    {t("Make this my default address", "ডিফল্ট ঠিকানা হিসেবে সেট করুন")}
                  </label>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={saveAddressMutation.isPending}
                    className="rounded-fq-md bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {saveAddressMutation.isPending ? t("Saving…", "সংরক্ষণ…") : t("Save Address", "সংরক্ষণ করুন")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddressFormOpen(false)}
                    className="rounded-fq-md border border-border px-3.5 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                  >
                    {t("Cancel", "বাতিল")}
                  </button>
                </div>
              </form>
            )}

            {/* Addresses Grid */}
            {addresses.length === 0 && !isAddressFormOpen ? (
              <p className="text-xs text-muted-foreground py-2">
                {t(
                  "You have not saved any delivery addresses yet.",
                  "আপনার কোনো সংরক্ষিত ডেলিভারি ঠিকানা নেই।",
                )}
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {addresses.map((addr) => (
                  <div
                    key={addr.id}
                    className="relative flex flex-col justify-between rounded-fq-lg border border-border bg-card p-4 transition-all"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="font-semibold text-sm">{addr.label}</span>
                        {addr.is_default && (
                          <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                            {t("Default", "ডিফল্ট")}
                          </span>
                        )}
                        <span className="text-[10px] uppercase font-mono text-muted-foreground border rounded px-1.5 py-0.5">
                          {addr.address_type}
                        </span>
                      </div>

                      <p className="text-sm font-medium">{addr.full_name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{addr.phone}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {addr.line1}
                        {addr.line2 ? `, ${addr.line2}` : ""}
                        {`, ${addr.city}, ${addr.district}`}
                        {addr.postcode ? ` - ${addr.postcode}` : ""}
                      </p>
                    </div>

                    <div className="mt-4 flex items-center gap-2 pt-2 border-t border-border/60">
                      <button
                        type="button"
                        onClick={() => handleEditAddress(addr)}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground p-1"
                      >
                        <Edit2 className="h-3 w-3" />
                        {t("Edit", "সম্পাদনা")}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteAddress(addr.id)}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive p-1"
                      >
                        <Trash2 className="h-3 w-3" />
                        {t("Delete", "মুছুন")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Section 3: Privacy & Communication Consent */}
          <section className="rounded-fq-xl border border-border bg-card p-5 sm:p-6 shadow-sm space-y-4">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              {t("Privacy & Notifications", "গোপনীয়তা ও নোটিফিকেশন")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t(
                "Choose which communications you would like to receive. We strictly respect your preferences under local data protection standards.",
                "কোন ধরনের নোটিফিকেশন পেতে চান তা নির্ধারণ করুন। আপনার পছন্দ সম্পূর্ণ সংরক্ষিত থাকবে।",
              )}
            </p>

            <div className="divide-y divide-border rounded-fq-lg border border-border">
              {/* Marketing Email */}
              <div className="flex items-center justify-between p-3.5">
                <div>
                  <p className="text-sm font-medium">{t("Marketing Offers via Email", "ইমেইলে বিশেষ অফার ও ছাড়")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("Receive discount coupons, seasonal sales, and new arrivals.", "ডিসকাউন্ট কুপন ও নতুন পণ্যের আপডেট।")}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={getConsent("email", "marketing")}
                  onChange={() => handleToggleConsent("email", "marketing", getConsent("email", "marketing"))}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                />
              </div>

              {/* Cart Recovery SMS */}
              <div className="flex items-center justify-between p-3.5">
                <div>
                  <p className="text-sm font-medium">{t("Cart Recovery & Reminder SMS", "কার্ট রিকভারি ও রিমাইন্ডার এসএমএস")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("Get reminded if items you left in your shopping bag are running out.", "ব্যাগে রেখে যাওয়া পণ্যের স্টক শেষ হওয়ার পূর্বে সতর্কতা।")}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={getConsent("sms", "cart_recovery")}
                  onChange={() => handleToggleConsent("sms", "cart_recovery", getConsent("sms", "cart_recovery"))}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                />
              </div>

              {/* Stock Alerts Push/SMS */}
              <div className="flex items-center justify-between p-3.5">
                <div>
                  <p className="text-sm font-medium">{t("Back-in-Stock Alerts", "স্টক ফিরে আসার নোটিফিকেশন")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("Instant notification when wishlist items become available again.", "উইশলিস্টের পণ্য পুনরায় স্টকে আসলে তাৎক্ষণিক বার্তা।")}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={getConsent("push", "stock_alerts")}
                  onChange={() => handleToggleConsent("push", "stock_alerts", getConsent("push", "stock_alerts"))}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                />
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
