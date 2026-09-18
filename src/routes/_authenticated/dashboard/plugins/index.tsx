/**
 * Phase 16 / WP-Parity — `/dashboard/plugins` (Plugins › Installed Plugins parity).
 *
 * Direct dedicated route providing WordPress `plugins.php` management:
 * Status filtering (All, Active, Inactive), bulk actions (Activate, Deactivate, Delete),
 * per-row action links (Activate, Deactivate, Settings, Delete), and deep-link to Add New.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { InstalledApps } from "@/components/marketplace/InstalledApps";
import { consoleRoute } from "@/lib/console-routes";
import { useLang } from "@/lib/i18n";
import { Page } from "@/components/console/kit";

export const Route = createFileRoute("/_authenticated/dashboard/plugins/")({
  staticData: consoleRoute({ permission: "themes.read" }),
  head: () => ({
    meta: [
      { title: "Installed Plugins — Framique Admin" },
      {
        name: "description",
        content:
          "Manage installed extensions, configure settings, activate or deactivate modules.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PluginsPage,
});

function PluginsPage() {
  const { t } = useLang();

  return (
    <Page
      title={t("Installed Plugins", "ইনস্টল করা প্লাগইন")}
      description={t(
        "Extend your storefront and admin capabilities with verified modular plugins.",
        "ভেরিফায়েড মডুলার প্লাগইন দিয়ে আপনার স্টোরফ্রন্ট এবং অ্যাডমিন সক্ষমতা বৃদ্ধি করুন।",
      )}
      actions={
        <Link
          to="/dashboard/plugins/new"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-fq-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="size-3.5" />
          <span>{t("Add New Plugin", "নতুন প্লাগইন যুক্ত করুন")}</span>
        </Link>
      }
    >
      <InstalledApps />
    </Page>
  );
}
