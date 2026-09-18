import {
  createFileRoute,
  Outlet,
  redirect,
  useRouterState,
} from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { platformIsAdminFn } from "@/lib/platform.functions";
import { RootShell } from "@/components/root/RootShell";
import { useLang } from "@/lib/i18n";

/**
 * Platform owner console — a standalone route tree.
 *
 * It deliberately sits OUTSIDE `_authenticated` and owns its own session gate,
 * its own login path (/root/login), shell, and components.
 * Non-owners are redirected to /dashboard.
 * Unauthenticated visitors are redirected to /root/login.
 */
export const Route = createFileRoute("/root")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const isLoginRoute =
      location.pathname === "/root/login" || location.pathname === "/root/auth";
    const { data, error } = await supabase.auth.getUser();
    const user = !error && data?.user ? data.user : null;

    let isOwner = false;
    if (user) {
      const { data: adminRow } = await supabase
        .from("platform_admins")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (adminRow) {
        isOwner = true;
      } else {
        const serverCheck = await platformIsAdminFn().catch(() => ({
          admin: false,
        }));
        if (serverCheck?.admin) {
          isOwner = true;
        }
      }
    }

    // If on the login page
    if (isLoginRoute) {
      if (isOwner) {
        throw redirect({ to: "/root" });
      }
      return { user };
    }

    // For protected /root routes:
    if (!user) {
      throw redirect({ to: "/root/login" });
    }

    if (!isOwner) {
      // Not a platform owner -> redirect to merchant dashboard
      throw redirect({ to: "/dashboard" });
    }

    return { user };
  },
  head: () => ({
    meta: [
      { title: "Platform Owner Console — Framique" },
      {
        name: "description",
        content:
          "Framique platform owner console: plan definitions, tenant usage, money and platform audit.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RootLayout,
});

function RootLayout() {
  const { tk } = useLang();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isLoginRoute = pathname === "/root/login" || pathname === "/root/auth";

  // Login route renders without RootShell
  if (isLoginRoute) {
    return <Outlet />;
  }

  const isAdmin = useServerFn(platformIsAdminFn);
  const { data, isPending } = useQuery({
    queryKey: ["root", "gate"],
    queryFn: () => isAdmin(),
    staleTime: 60_000,
  });

  if (isPending) {
    return (
      <p className="p-8 text-sm text-muted-foreground">
        {tk("common.loading")}
      </p>
    );
  }
  // Neutral copy: never confirm what lives behind this path.
  if (!data?.admin) {
    return (
      <p className="p-8 text-sm text-muted-foreground">
        {tk("owner.forbidden")}
      </p>
    );
  }

  return (
    <RootShell>
      <Outlet />
    </RootShell>
  );
}
