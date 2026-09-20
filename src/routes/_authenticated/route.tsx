import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Fast path: resolve from local session memory/storage (0ms)
    const { data: sessionData } = await supabase.auth.getSession();
    let user = sessionData.session?.user;

    if (!user) {
      // Fallback: only make network round-trip if local session is absent
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) throw redirect({ to: "/auth" });
      user = data.user;
    }

    const aal = user.app_metadata?.aal;
    if (aal === "aal2") {
      const { data: aalData } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalData?.nextLevel === "aal2" && aalData.currentLevel !== "aal2") {
        throw redirect({ to: "/auth" });
      }
    }
    return { user };
  },
  component: () => <Outlet />,
});
