import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { CustomerShell } from "@/components/dashboard/CustomerShell";
import { useCustomerAccount } from "@/hooks/use-customer";
import { useLang } from "@/lib/i18n";
import { EmptyState } from "@/components/console/primitives";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard")({
  beforeLoad: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw redirect({ to: "/auth" });
    }
    
    // Root / Owner check
    const email = (user.email || "").toLowerCase();
    const ownerEmails = ["devrahmanbd@gmail.com", "nahid52flame@gmail.com"];
    const configuredOwner = (process.env["PLATFORM_OWNER_EMAIL"] || "").toLowerCase();
    if (configuredOwner) ownerEmails.push(configuredOwner);

    if (ownerEmails.includes(email)) {
      throw redirect({ to: "/root" });
    }
    
    const { data: adminRow } = await supabase
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
      
    if (adminRow) {
      throw redirect({ to: "/root" });
    }
    
    // Merchant check
    if (user.user_metadata?.account_type === "merchant") {
      throw redirect({ to: "/admin" });
    }
  },
  head: () => ({
    meta: [
      { title: "My account — Framique" },
      {
        name: "description",
        content: "Track orders, manage returns and update your details in your Framique account.",
      },
      { property: "og:title", content: "My account — Framique" },
      {
        property: "og:description",
        content: "Track orders, manage returns and update your details.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CustomerLayout,
});

function CustomerLayout() {
  const { t, tk } = useLang();
  const { data: account, isPending } = useCustomerAccount();

  if (isPending) {
    return <p className="p-8 text-sm text-muted-foreground">{tk("common.loading")}</p>;
  }

  // No customer row is an unfinished signup, not a permission failure.
  if (!account) {
    return (
      <CustomerShell>
        <EmptyState
          title={t("Finish creating your account", "আপনার অ্যাকাউন্ট তৈরি সম্পূর্ণ করুন")}
          description={t(
            "We could not find a shopper profile for this login yet. Place an order or complete signup on a store to activate your account portal.",
            "এই লগইনের জন্য এখনো কোনো ক্রেতা প্রোফাইল পাওয়া যায়নি। অ্যাকাউন্ট চালু করতে কোনো দোকানে সাইনআপ সম্পূর্ণ করুন বা একটি অর্ডার করুন।",
          )}
        />
      </CustomerShell>
    );
  }

  return (
    <CustomerShell>
      <Outlet />
    </CustomerShell>
  );
}
