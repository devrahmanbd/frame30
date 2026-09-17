import { Outlet, createFileRoute, useMatches, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { useMerchant } from "@/hooks/use-merchant";
import { useLang } from "@/lib/i18n";
import { chromeFromMatches } from "@/lib/console-routes";
import { supabase } from "@/integrations/supabase/client";

/**
 * Merchant Console Layout — strictly for Merchants only.
 * Platform owners attempting to access /dashboard are redirected to /root.
 */
export const Route = createFileRoute("/_authenticated/dashboard")({
  beforeLoad: async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      throw redirect({ to: "/auth" });
    }
  },
  head: () => ({
    meta: [
      { title: "Merchant Dashboard — Framique" },
      {
        name: "description",
        content: "Merchant control panel for managing products, orders, inventory, payouts and storefront settings.",
      },
      { property: "og:title", content: "Merchant Dashboard — Framique" },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: MerchantDashboardLayout,
});

function MerchantDashboardLayout() {
  const { tk } = useLang();
  const navigate = useNavigate();
  const { data: merchant, isPending } = useMerchant();
  const matches = useMatches();
  const chrome = chromeFromMatches(matches);

  useEffect(() => {
    if (isPending || merchant) return;

    // Fresh merchant signup with no store yet -> onboarding
    void navigate({ to: "/onboarding", replace: true });
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
