/**
 * Phase 13 — the Google result preview at the top of the SEO meta box.
 *
 * Clipped with the same pixel model the score uses, so preview and meters can
 * never disagree. Desktop and mobile widths, favicon + breadcrumb line.
 */
import { Globe, Monitor, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";
import { SERP_DESKTOP, SERP_MOBILE, type SerpDevice } from "@/lib/seo-pixels";
import { metaMeters } from "@/lib/seo/seo-meta";
import { PixelMeter } from "./parts";

export function SerpPreviewCard({
  title,
  description,
  url,
  siteName,
  device,
  onDevice,
}: {
  title: string;
  description: string;
  url: string;
  siteName: string;
  device: SerpDevice;
  onDevice: (device: SerpDevice) => void;
}) {
  const { t } = useLang();
  const metrics = metaMeters(title, description, device);
  const budget = device === "mobile" ? SERP_MOBILE : SERP_DESKTOP;
  const crumb = url
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .split("/");

  return (
    <div className="space-y-3 rounded-fq-md border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {t("Search preview", "সার্চ প্রিভিউ")}
        </span>
        <div className="flex gap-1" role="group" aria-label={t("Preview device", "প্রিভিউ ডিভাইস")}>
          {[
            { id: "desktop" as const, Icon: Monitor, label: t("Desktop", "ডেস্কটপ") },
            { id: "mobile" as const, Icon: Smartphone, label: t("Mobile", "মোবাইল") },
          ].map(({ id, Icon, label }) => (
            <button
              key={id}
              type="button"
              aria-pressed={device === id}
              aria-label={label}
              onClick={() => onDevice(id)}
              className={cn(
                "fq-focus-glow inline-flex size-8 items-center justify-center rounded-fq-md border transition-colors",
                device === id
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              <Icon className="size-4" aria-hidden />
            </button>
          ))}
        </div>
      </div>

      <div className={cn("space-y-1", device === "mobile" && "max-w-[360px]")}>
        <div className="flex items-center gap-2">
          <span className="inline-flex size-6 items-center justify-center rounded-full border border-border bg-muted">
            <Globe className="size-3 text-muted-foreground" aria-hidden />
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[12px] text-foreground">
              {siteName || t("Your store", "আপনার স্টোর")}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {crumb[0]}
              {crumb.length > 1 ? ` › ${crumb.slice(1).join(" › ")}` : ""}
            </span>
          </span>
        </div>
        <p className="truncate text-[18px] leading-snug text-primary">
          {metrics.title.shown || t("Untitled", "শিরোনামহীন")}
        </p>
        <p className="line-clamp-2 text-[13px] leading-snug text-muted-foreground">
          {metrics.description.shown || t("No description yet.", "এখনো বর্ণনা নেই।")}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <PixelMeter label={t("Title", "টাইটেল")} px={metrics.title.px} max={budget.titlePx} />
        <PixelMeter
          label={t("Description", "বর্ণনা")}
          px={metrics.description.px}
          max={budget.descriptionPx}
        />
      </div>
    </div>
  );
}
