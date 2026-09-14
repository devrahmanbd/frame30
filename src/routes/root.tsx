import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
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
 * its own shell and its own components, so nothing in the merchant console can
 * change what an owner sees or how this tree is protected.
 */
const OWNER_EMAILS = ["devrahmanbd@gmail.com", "nahid52flame@gmail.com"];

export const Route = createFileRoute("/root")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    const email = data.user.email?.toLowerCase() || "";
    if (!OWNER_EMAILS.includes(email) && process.env["PLATFORM_OWNER_EMAIL"]?.toLowerCase() !== email) {
      throw redirect({ to: "/admin" });
    }
    const { data: adminRow } = await supabase
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", data.user.id)
      .maybeSingle();
    if (!adminRow) {
      // Auto-provision owner row via server call
      await platformIsAdminFn();
    }
    return { user: data.user };
  },
  head: () => ({
    meta: [
      { title: "Platform owner console — Framique" },
      {
        name: "description",
        content:
          "Framique platform owner console: plan definitions, tenant usage, money and platform audit.",
      },
      { property: "og:title", content: "Framique platform owner console" },
      {
        property: "og:description",
        content: "Plan builder, tenant limits and audit trail for Framique platform owners.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RootLayout,
});

function RootLayout() {
  const { tk } = useLang();
  const isAdmin = useServerFn(platformIsAdminFn);
  const { data, isPending } = useQuery({
    queryKey: ["root", "gate"],
    queryFn: () => isAdmin(),
    staleTime: 60_000,
  });

  if (isPending) {
    return <p className="p-8 text-sm text-muted-foreground">{tk("common.loading")}</p>;
  }
  // Neutral copy: never confirm what lives behind this path.
  if (!data?.admin) {
    return <p className="p-8 text-sm text-muted-foreground">{tk("owner.forbidden")}</p>;
  }

  return (
    <RootShell>
      <Outlet />
    </RootShell>
  );
}
