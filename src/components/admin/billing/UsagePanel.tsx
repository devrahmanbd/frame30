/**
 * Plan usage panel.
 *
 * The point of this panel is that a cap is *never* first discovered as a red
 * error in the editor: blocked and warning resources sort to the top, each row
 * states used/cap in the resource's own unit, and the upsell copy is the same
 * string the server would have thrown. A limits outage degrades to a quiet
 * notice — it must not blank the billing screen it decorates.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { entitlementPanelFn } from "@/lib/entitlements.functions";
import { RESOURCE_META, formatUsage, type EntitlementVerdict } from "@/lib/entitlements";
import { useLang } from "@/lib/i18n";

const LEVEL_BAR: Record<EntitlementVerdict["level"], string> = {
  ok: "bg-primary",
  warn: "bg-warning",
  block: "bg-destructive",
};

export function UsagePanel() {
  const { t, lang } = useLang();
  const load = useServerFn(entitlementPanelFn);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["entitlements", "panel"],
    queryFn: () => load({ data: {} }),
    // Usage moves when the merchant works, not when they stare at this panel.
    staleTime: 30_000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <section className="rounded-fq-md border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">{t("Loading plan usage…", "প্ল্যান ব্যবহার লোড হচ্ছে…")}</p>
      </section>
    );
  }

  if (isError || !data) {
    return (
      <section className="rounded-fq-md border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">{t("Plan usage", "প্ল্যান ব্যবহার")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(
            "Usage figures are temporarily unavailable. Your limits are unchanged.",
            "ব্যবহারের হিসাব সাময়িকভাবে দেখা যাচ্ছে না। আপনার লিমিট অপরিবর্তিত।",
          )}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-fq-md border border-border bg-card p-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{t("Plan usage", "প্ল্যান ব্যবহার")}</h2>
          <p className="text-xs text-muted-foreground">
            {t("Plan", "প্ল্যান")}: <span className="font-medium capitalize">{data.plan}</span> ·{" "}
            {t("Status", "স্ট্যাটাস")}: {data.status}
            {data.trialEndsAt && (
              <> · {t("Trial ends", "ট্রায়াল শেষ")} {data.trialEndsAt.slice(0, 10)}</>
            )}
          </p>
        </div>
        <Link to="/admin/plans" className="text-xs underline">
          {t("Compare plans", "প্ল্যান তুলনা")}
        </Link>
      </header>

      <ul className="mt-3 space-y-3">
        {data.resources.map((r) => {
          const meta = RESOURCE_META[r.resource];
          return (
            <li key={r.resource}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{lang === "bn" ? meta.bn : meta.en}</span>
                <span className="tabular-nums text-muted-foreground">
                  {formatUsage(r.resource, r.used)} / {r.unlimited ? "∞" : formatUsage(r.resource, r.cap)}
                </span>
              </div>
              <div
                className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={r.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={lang === "bn" ? meta.bn : meta.en}
              >
                <div
                  className={`h-full ${LEVEL_BAR[r.level]}`}
                  style={{ width: `${r.unlimited ? 4 : Math.max(2, r.percent)}%` }}
                />
              </div>
              {r.level !== "ok" && (
                <p
                  className={`mt-1 text-xs ${r.level === "block" ? "text-destructive" : "text-warning"}`}
                >
                  {lang === "bn" ? r.bn : r.en}
                  {r.upgradeTo && (
                    <>
                      {" "}
                      <Link to="/admin/plans" className="underline">
                        {t(`Upgrade to ${r.upgradeTo}`, `${r.upgradeTo}-এ আপগ্রেড`)}
                      </Link>
                    </>
                  )}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {data.blocking.length > 0 && (
        <p className="mt-3 rounded-fq-md bg-destructive/10 p-2 text-xs text-destructive">
          {t(
            "Some writes are blocked by your current plan. Nothing already published has been removed.",
            "আপনার বর্তমান প্ল্যানে কিছু কাজ বন্ধ আছে। প্রকাশিত কিছুই মুছে ফেলা হয়নি।",
          )}
        </p>
      )}
    </section>
  );
}