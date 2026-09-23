/**
 * Appearance › Custom CSS, JS parity route.
 *
 * Provides dedicated editing of merchant Custom CSS stylesheets and deferred
 * sandboxed JavaScript islands with live linting and strict limits.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { consoleRoute } from "@/lib/console-routes";
import { useLang } from "@/lib/i18n";
import { Page, CardSkeleton, ErrorState } from "@/components/console/kit";
import { CustomCodeEditor } from "@/components/builder/CustomCodeEditor";
import { themesWorkspaceFn } from "@/lib/themes/appearance.functions";
import type { ThemesWorkspace } from "@/lib/themes/appearance";
import { Code2, Palette } from "@/components/icons/tabler";

export const Route = createFileRoute(
  "/_authenticated/dashboard/content/custom-code",
)({
  staticData: consoleRoute({ permission: "themes.read" }),
  head: () => ({
    meta: [
      { title: "Custom CSS & JS — Framique Admin" },
      {
        name: "description",
        content:
          "Write custom CSS stylesheets and sandboxed JavaScript islands for your storefront.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CustomCodeRoute,
});

function CustomCodeRoute() {
  const { t } = useLang();
  const loadWorkspace = useServerFn(themesWorkspaceFn);

  const workspace = useQuery<ThemesWorkspace>({
    queryKey: ["themes", "workspace"],
    queryFn: () => loadWorkspace({} as never),
  });

  const installed = workspace.data?.installed ?? [];
  const activeTheme = installed.find((th) => th.isActive) ?? installed[0] ?? null;
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);

  const themeId = selectedThemeId ?? activeTheme?.id ?? null;

  return (
    <Page
      title={t("Custom CSS, JS", "কাস্টম সিএসএস ও জেএস")}
      description={t(
        "Apply custom CSS stylesheets, JavaScript scripts, and header/footer tags to your storefront.",
        "আপনার স্টোরফ্রন্টে কাস্টম সিএসএস স্টাইলশিট, জাভাস্ক্রিপ্ট স্ক্রিপ্ট এবং হেডার/ফুটার ট্যাগ প্রয়োগ করুন।",
      )}
      actions={
        installed.length > 1 ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {t("Theme:", "থিম:")}
            </span>
            <select
              value={themeId ?? ""}
              onChange={(e) => setSelectedThemeId(e.target.value)}
              className="h-9 rounded-fq-md border border-border bg-background px-3 text-xs font-medium"
              aria-label={t("Select theme for custom code", "কাস্টম কোডের জন্য থিম নির্বাচন")}
            >
              {installed.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.name} {theme.isActive ? `(${t("Active", "Active")})` : ""}
                </option>
              ))}
            </select>
          </div>
        ) : null
      }
    >
      {workspace.isLoading ? (
        <CardSkeleton count={2} lines={4} />
      ) : workspace.isError ? (
        <ErrorState
          title={t("Themes could not be loaded", "থিম লোড করা যায়নি")}
          message={t("Please retry to load your theme assets.", "আপনার থিম পুনরায় লোড করার চেষ্টা করুন।")}
          onRetry={() => {
            void workspace.refetch();
          }}
        />
      ) : !themeId ? (
        <div className="rounded-fq-lg border border-border bg-card p-8 text-center">
          <Palette className="mx-auto size-8 text-muted-foreground" />
          <h3 className="mt-3 text-sm font-semibold">
            {t("No theme installed", "কোনো থিম ইনস্টল করা নেই")}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              "Activate a theme before editing custom CSS and JavaScript.",
              "কাস্টম সিএসএস এবং জাভাস্ক্রিপ্ট সম্পাদনার আগে একটি থিম সক্রিয় করুন।",
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-fq-md border border-border bg-muted/30 px-4 py-2.5 text-xs">
            <div className="flex items-center gap-2">
              <Code2 className="size-4 text-primary" />
              <span className="font-semibold text-foreground">
                {t("Target Theme:", "টার্গেট থিম:")}
              </span>
              <span className="font-medium text-foreground">
                {installed.find((th) => th.id === themeId)?.name ?? "Theme"}
              </span>
            </div>
            <span className="text-muted-foreground">
              {t(
                "CSS is prefix-scoped; JS is executed in a deferred sandbox.",
                "সিএসএস প্রিফিক্স-স্কোপড; জাভাস্ক্রিপ্ট স্যান্ডবক্সে চলে।",
              )}
            </span>
          </div>

          <CustomCodeEditor themeId={themeId} />
        </div>
      )}
    </Page>
  );
}
