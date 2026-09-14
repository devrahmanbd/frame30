import { Outlet, createFileRoute, useMatches, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { useMerchant } from "@/hooks/use-merchant";
import { useLang } from "@/lib/i18n";
import { chromeFromMatches } from "@/lib/console-routes";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw redirect({ to: "/auth" });
    }
    
    // 1. Root / Owner check
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

    // 2. Customer check
    if (user.user_metadata?.account_type === "customer") {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: AdminLayout,
});

function AdminLayout() {
  const { tk } = useLang();
  const navigate = useNavigate();
  const { data: merchant, isPending } = useMerchant();
  const matches = useMatches();
  const chrome = chromeFromMatches(matches);

  useEffect(() => {
    if (isPending || merchant) return;

    // Check user persona before assuming onboarding intent:
    // Platform owners belong in /root; shoppers/appointees belong in /dashboard.
    async function resolveFallback() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        void navigate({ to: "/auth", replace: true });
        return;
      }

      const [adminRes, customerRes] = await Promise.all([
        supabase.from("platform_admins").select("user_id").eq("user_id", userData.user.id).maybeSingle(),
        supabase.from("customers").select("id").eq("auth_uid", userData.user.id).limit(1).maybeSingle(),
      ]);

      const isOwner = userData.user.email?.toLowerCase() === "devrahmanbd@gmail.com";
      if (adminRes.data || isOwner) {
        void navigate({ to: "/root", replace: true });
        return;
      }
      if (customerRes.data || userData.user.user_metadata?.account_type === "customer") {
        void navigate({ to: "/dashboard", replace: true });
        return;
      }

      // Fresh merchant signup with no store yet
      void navigate({ to: "/onboarding", replace: true });
    }

    void resolveFallback();
  }, [isPending, merchant, navigate]);

  if (isPending) {
    return <p className="p-8 text-sm text-muted-foreground">{tk("common.loading")}</p>;
  }
  if (!merchant) {
    return <p className="p-8 text-sm text-muted-foreground">{tk("onboarding.required")}</p>;
  }

  // Editors take over the viewport (Gutenberg-style): no sidebar or topbar to tab through.
  if (!chrome) return <Outlet />;

  return (
    <AdminShell>
      <Outlet />
    </AdminShell>
  );
}
