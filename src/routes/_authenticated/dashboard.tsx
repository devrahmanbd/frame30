import {
  Outlet,
  createFileRoute,
  useMatches,
  useNavigate,
  redirect,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { useMerchant } from "@/hooks/use-merchant";
import { useLang } from "@/lib/i18n";
import { chromeFromMatches } from "@/lib/console-routes";
import { supabase } from "@/integrations/supabase/client";
import { SupportWidget } from "@/components/store/SupportWidget";

/**
 * Merchant Console Layout — strictly for Merchants only.
 * Platform owners attempting to access /dashboard are redirected to /root.
 */
export const Route = createFileRoute("/_authenticated/dashboard")({
  beforeLoad: async ({ context }) => {
    // Parent _authenticated route already validated the user and verified MFA
    const parentUser = (
      context as {
        user?: { id: string; user_metadata?: Record<string, unknown> };
      }
    )?.user;
    let user = parentUser;
    if (!user) {
      const {
        data: { user: freshUser },
      } = await supabase.auth.getUser();
      user = freshUser ?? undefined;
    }
    if (!user) {
      throw redirect({ to: "/auth" });
    }
    // Customers cannot access the merchant console
    if (user.user_metadata?.account_type === "customer") {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }
  },
  head: () => ({
    meta: [
      { title: "Merchant Dashboard — Framique" },
      {
        name: "description",
        content:
          "Merchant control panel for managing products, orders, inventory, payouts and storefront settings.",
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
    return (
      <p className="p-8 text-sm text-muted-foreground">
        {tk("common.loading")}
      </p>
    );
  }
  if (!merchant) {
    return (
      <p className="p-8 text-sm text-muted-foreground">
        {tk("onboarding.required")}
      </p>
    );
  }

  // Editors take over the viewport (Gutenberg-style): no sidebar or topbar to tab through.
  if (!chrome) return <Outlet />;

  return (
    <AdminShell>
      <Outlet />
      {merchant?.slug ? (
        <SupportWidget slug={merchant.slug} mode="dashboard" />
      ) : null}
    </AdminShell>
  );
}
