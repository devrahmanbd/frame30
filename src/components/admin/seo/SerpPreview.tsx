/**
 * SERP + social preview (Phase 2).
 *
 * Merchants argue with a number; they agree with a picture. This renders the
 * snippet exactly as it will be clipped — desktop and mobile widths — using the
 * same pixel model the score uses (`seo-pixels.ts`), so the preview and the
 * "title too wide" check can never disagree.
 *
 * Presentation only: no data fetching, no analysis. Semantic tokens throughout.
 */
import { useState } from "react";
import { SERP_DESKTOP, SERP_MOBILE, serpMetrics, type SerpDevice } from "@/lib/seo-pixels";
import { useLang } from "@/lib/i18n";

function Meter({ fill, truncated }: { fill: number; truncated: boolean }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
      <div
        className={`h-full rounded-full transition-all ${truncated ? "bg-danger" : fill > 0.75 ? "bg-warning" : "bg-success"}`}
        style={{ width: `${Math.min(100, Math.round(fill * 100))}%` }}
      />
    </div>
  );
}

export function SerpPreview({
  title,
  description,
  url,
  ogImage,
  siteName,
}: {
  title: string;
  description: string;
  url: string;
  ogImage?: string;
  siteName?: string;
}) {
  const { t } = useLang();
  const [device, setDevice] = useState<SerpDevice>("desktop");
  const metrics = serpMetrics({ title, description }, device);
  const budget = device === "mobile" ? SERP_MOBILE : SERP_DESKTOP;
  const crumb = url.replace(/^https?:\/\//i, "").replace(/\/+$/, "").split("/").join(" › ");

  return (
    <section
      aria-label={t("Search preview", "সার্চ প্রিভিউ")}
      className="space-y-3 rounded-fq-lg border border-border bg-card p-4"
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t("Search preview", "সার্চ প্রিভিউ")}</h3>
        <div className="flex gap-1 rounded-fq-md border border-border p-0.5" role="tablist">
          {(["desktop", "mobile"] as SerpDevice[]).map((d) => (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={device === d}
              onClick={() => setDevice(d)}
              className={`rounded-fq-sm px-2 py-1 text-xs ${device === d ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {d === "desktop" ? t("Desktop", "ডেস্কটপ") : t("Mobile", "মোবাইল")}
            </button>
          ))}
        </div>
      </header>

      <div
        className="space-y-1 rounded-fq-md border border-border p-3"
        style={{ maxWidth: device === "mobile" ? 420 : 620 }}
      >
        <p className="truncate text-xs text-muted-foreground">{crumb || t("No URL yet", "এখনো URL নেই")}</p>
        <p className="text-base leading-snug text-primary">
          {metrics.title.shown || t("Untitled page", "শিরোনামহীন পেজ")}
        </p>
        <p className="text-sm leading-snug text-muted-foreground">
          {metrics.description.shown || t("No description yet.", "এখনো বর্ণনা নেই।")}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">
            {t(
              `Title ${metrics.title.px}/${budget.titlePx}px`,
              `টাইটেল ${metrics.title.px}/${budget.titlePx}px`,
            )}
          </p>
          <Meter fill={metrics.title.fill} truncated={metrics.title.truncated} />
        </div>
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">
            {t(
              `Description ${metrics.description.px}/${budget.descriptionPx}px`,
              `বর্ণনা ${metrics.description.px}/${budget.descriptionPx}px`,
            )}
          </p>
          <Meter fill={metrics.description.fill} truncated={metrics.description.truncated} />
        </div>
      </div>

      {/* Social card: the same copy, framed the way a share renders it. */}
      <div className="overflow-hidden rounded-fq-md border border-border">
        {ogImage ? (
          <img
            src={ogImage}
            alt=""
            width={1200}
            height={630}
            loading="lazy"
            className="aspect-[1200/630] w-full object-cover"
          />
        ) : (
          <div className="flex aspect-[1200/630] w-full items-center justify-center bg-muted text-xs text-muted-foreground">
            {t("No social image — shares render as a text link.", "সোশ্যাল ইমেজ নেই — শেয়ার শুধু টেক্সট লিংক দেখাবে।")}
          </div>
        )}
        <div className="space-y-0.5 border-t border-border p-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {siteName || crumb.split(" › ")[0] || t("Your store", "আপনার স্টোর")}
          </p>
          <p className="truncate text-sm font-medium">{title || t("Untitled page", "শিরোনামহীন পেজ")}</p>
          <p className="line-clamp-2 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
    </section>
  );
}
