/**
 * Threat-defense — Security approvals queue.
 *
 * Merchant desk over `approvalQueueFn` (read-only: flagged theme drafts +
 * flagged plugin manifests with no matching approval audit). Approvals go
 * through the existing `themeApproveFn` / `pluginApproveFn` — no new server
 * fns. Server-fn call pattern mirrors the staff governance page
 * (`dashboard/approvals.tsx`: loader shape, `useServerFn`, sonner toasts +
 * `router.invalidate()`); layout/chrome/i18n follow the merchant desk
 * convention (`t(en, bn)` inline copy). Rows live in
 * `ApprovalQueue` so this route stays thin.
 */
import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import { approvalQueueFn } from "@/lib/approval-queue.functions";
import { themeApproveFn } from "@/lib/themes/appearance.functions";
import { pluginApproveFn } from "@/lib/plugins.functions";
import { ApprovalQueue } from "@/components/admin/ApprovalQueue";

export const Route = createFileRoute(
  "/_authenticated/dashboard/security-approvals",
)({
  loader: () => approvalQueueFn(),
  head: () => ({
    meta: [
      { title: "Security approvals — Framique admin" },
      {
        name: "description",
        content:
          "Review flagged themes and plugins, then approve them to clear the queue.",
      },
      { property: "og:title", content: "Security approvals — Framique admin" },
      {
        property: "og:description",
        content: "Approve flagged theme and plugin versions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SecurityApprovalsPage,
});

function SecurityApprovalsPage() {
  const { t, tError } = useLang();
  const data = Route.useLoaderData();
  const router = useRouter();
  const approveTheme = useServerFn(themeApproveFn);
  const approvePlugin = useServerFn(pluginApproveFn);

  const [busy, setBusy] = useState<string | null>(null);

  async function run(
    key: string,
    fn: () => Promise<unknown>,
    okMessage: string,
  ) {
    setBusy(key);
    try {
      await fn();
      toast.success(okMessage);
      await router.invalidate();
    } catch (error) {
      toast.error(tError(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-bangla-display text-xl font-semibold">
          {t("Security approvals", "নিরাপত্তা অনুমোদন")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(
            "Review flagged themes and plugins, then approve them to clear the queue.",
            "ফ্ল্যাগ করা থিম ও প্লাগইন পর্যালোচনা করে অনুমোদন করুন।",
          )}
        </p>
      </header>

      <ApprovalQueue
        themes={data.themes}
        plugins={data.plugins}
        busy={busy}
        onApproveTheme={(themeId, versionId) =>
          run(
            themeId,
            () => approveTheme({ data: { themeId, versionId } }),
            t("Theme approved", "থিম অনুমোদিত হয়েছে"),
          )
        }
        onApprovePlugin={(pluginId, manifestVersion) =>
          run(
            pluginId,
            () => approvePlugin({ data: { pluginId, manifestVersion } }),
            t("Plugin approved", "প্লাগইন অনুমোদিত হয়েছে"),
          )
        }
      />
    </div>
  );
}
