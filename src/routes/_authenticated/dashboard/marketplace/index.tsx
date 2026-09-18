import { useMemo, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fmtMinor } from "@/lib/money";
import { useLang } from "@/lib/i18n";
import {
  marketCatalogFn,
  marketInstallFn,
  marketInstallStatusFn,
  marketListingVersionsFn,
  marketUninstallThemeFn,
} from "@/lib/marketplace.functions";
import {
  themeActivateFn,
  themeDeleteFn,
} from "@/lib/themes/appearance.functions";
import {
  InstallConsent,
  type ConsentVersion,
} from "@/components/marketplace/InstallConsent";
import { InstalledApps } from "@/components/marketplace/InstalledApps";
import { z } from "zod";
import { ConfirmDialog } from "@/components/console/kit";

const marketSearchSchema = z.object({
  tab: z.enum(["theme", "widget", "apps"]).optional().catch(undefined),
});

export const Route = createFileRoute("/_authenticated/dashboard/marketplace/")({
  validateSearch: (search) => marketSearchSchema.parse(search),
  loader: () => marketCatalogFn(),
  head: () => ({
    meta: [
      { title: "মার্কেটপ্লেস — Framique admin" },
      {
        name: "description",
        content:
          "Install themes and widgets from the Framique extension store.",
      },
      { property: "og:title", content: "মার্কেটপ্লেস — Framique admin" },
      {
        property: "og:description",
        content: "Themes and widgets for your storefront.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Marketplace,
});

type Catalog = Awaited<ReturnType<typeof marketCatalogFn>>;
type Listing = Catalog["themes"][number] | Catalog["widgets"][number];

/** Ledger rows in these states count as "installed" for badges and actions. */
function isLiveInstall(status: string) {
  return status === "installed" || status === "trial" || status === "paused";
}

const INSTALL_LABEL: Record<string, { en: string; bn: string }> = {
  installed: { en: "Installed", bn: "ইনস্টলড" },
  removed: { en: "Removed", bn: "সরানো হয়েছে" },
  trial: { en: "Trial", bn: "ট্রায়াল" },
  paused: { en: "Paused", bn: "স্থগিত" },
  rolled_back: { en: "Rolled back", bn: "রোলব্যাক" },
};

function Marketplace() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const router = useRouter();
  const qc = useQueryClient();
  const { t, tk } = useLang();
  const [tab, setTab] = useState<"theme" | "widget">(
    search.tab === "widget" ? "widget" : "theme",
  );
  const [query, setQuery] = useState("");
  const [priceFilter, setPriceFilter] = useState("all");
  const [category, setCategory] = useState("all");
  const [active, setActive] = useState<Listing | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [impacted, setImpacted] = useState<string[]>([]);
  const [consent, setConsent] = useState<{
    listing: Listing;
    trial: boolean;
    version: ConsentVersion | null;
  } | null>(null);

  const [pendingDelete, setPendingDelete] = useState<{
    installId: string;
    name: string;
  } | null>(null);

  const source = tab === "theme" ? data.themes : data.widgets;
  const themeStateBySlug = useMemo(
    () => new Map((data.themeStates ?? []).map((s) => [s.slug, s])),
    [data.themeStates],
  );
  const categories = useMemo(
    () => Array.from(new Set(source.map((l) => l.category))),
    [source],
  );
  const listings = source.filter(
    (l) =>
      (category === "all" || l.category === category) &&
      (priceFilter === "all" ||
        (priceFilter === "free"
          ? l.price_minor_int === 0
          : l.price_minor_int > 0)) &&
      (!query.trim() ||
        l.name.toLowerCase().includes(query.trim().toLowerCase())),
  );

  /** Step 1 — never install blind: pull the pinned version and ask for consent. */
  async function requestInstall(listing: Listing, trial: boolean) {
    // Official presets are free and scopeless: install directly, no versions
    // lookup and no consent screen.
    if (listing.builtin) {
      setActive(null);
      await install(listing, false, null, []);
      return;
    }
    setBusy(true);
    setMsg(null);
    setImpacted([]);
    try {
      const res = await marketListingVersionsFn({
        data: { kind: listing.kind, listingId: listing.id },
      });
      const latest = res.versions[0] ?? null;
      setConsent({ listing, trial, version: latest });
      setActive(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not read versions");
    } finally {
      setBusy(false);
    }
  }

  /** Step 2 — install with exactly the scopes the merchant ticked. */
  async function install(
    listing: Listing,
    trial: boolean,
    versionId: string | null,
    grantedScopes: string[],
  ) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await marketInstallFn({
        data: {
          kind: listing.kind,
          listingId: listing.id,
          trial,
          versionId,
          grantedScopes,
          idempotencyKey: `${listing.id}-${trial ? "trial" : "buy"}-${Date.now()}`,
        },
      });
      setImpacted(res.impacted ?? []);
      const base = trial
        ? tk("marketplace.trial_started")
        : tk("marketplace.install_complete");
      setMsg(res.themeNoticeKey ? `${base} ${tk(res.themeNoticeKey)}` : base);
      toast.success(
        listing.kind === "theme"
          ? t("Theme installed successfully", "থিম সফলভাবে ইনস্টল হয়েছে")
          : t("Plugin installed successfully", "প্লাগইন সফলভাবে ইনস্টল হয়েছে"),
      );
      setConsent(null);
      await router.invalidate();
      await qc.invalidateQueries({ queryKey: ["admin", "plugins"] });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Install failed");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(
    installId: string,
    status: "paused" | "installed" | "rolled_back",
  ) {
    setBusy(true);
    try {
      const res = await marketInstallStatusFn({ data: { installId, status } });
      const base =
        status === "rolled_back"
          ? tk("marketplace.rolled_back")
          : tk("marketplace.status_updated");
      setMsg(res.themeNoticeKey ? `${base} ${tk(res.themeNoticeKey)}` : base);
      await router.invalidate();
      await qc.invalidateQueries({ queryKey: ["admin", "plugins"] });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  /** WordPress-style activation: flip the installed theme live. */
  async function activateInstalledTheme(themeId: string) {
    setBusy(true);
    setMsg(null);
    try {
      await themeActivateFn({ data: { id: themeId } });
      setMsg(tk("marketplace.theme_activated"));
      setActive(null);
      await router.invalidate();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Activation failed");
    } finally {
      setBusy(false);
    }
  }

  /** WordPress-style uninstall: inactive themes only (server refuses active). */
  async function deleteInstalledTheme() {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await marketUninstallThemeFn({
        data: { installId: pendingDelete.installId },
      });
      setMsg(tk("marketplace.theme_deleted"));
      setPendingDelete(null);
      setActive(null);
      await router.invalidate();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-bangla-display text-xl font-semibold">
            {t("Marketplace", "মার্কেটপ্লেস")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("App version", "অ্যাপ সংস্করণ")} {data.appVersion} ·{" "}
            {t(
              "Price and trial are verified server-side.",
              "দাম ও ট্রায়াল সার্ভারে যাচাই হয়।",
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/dashboard/marketplace/creator"
            className="min-h-11 rounded-fq-md border border-border px-3 py-2 text-sm"
          >
            {t("Creator panel", "ক্রিয়েটর প্যানেল")}
          </Link>
          <Link
            to="/dashboard/marketplace/moderation"
            className="min-h-11 rounded-fq-md border border-border px-3 py-2 text-sm"
          >
            {t("Moderation", "মডারেশন")}
          </Link>
        </div>
      </header>

      {msg && (
        <p
          role="status"
          className="rounded-fq-md border border-border bg-muted p-3 text-sm"
        >
          {msg}
        </p>
      )}
      {impacted.length > 0 && (
        <div className="rounded-fq-md border border-border bg-warning/10 p-3 text-sm">
          <p className="font-medium">
            {t("Warning — impacted page nodes", "উত্থান — প্রভাবিত পেজ নোড")}
          </p>
          <ul className="mt-1 list-disc pl-5 text-muted-foreground">
            {impacted.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <p className="mt-1 text-muted-foreground">
            {t(
              "Verify in the builder before publishing; roll back if needed.",
              "প্রকাশের আগে বিল্ডারে যাচাই করুন; দরকার হলে রোলব্যাক করুন।",
            )}
          </p>
        </div>
      )}

      <div
        role="tablist"
        aria-label={t("Marketplace tabs", "মার্কেটপ্লেস ট্যাব")}
        className="flex gap-2"
      >
        {(
          [
            ["theme", { en: "Themes", bn: "থিম" }],
            ["widget", { en: "Widgets", bn: "উইজেট" }],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`min-h-11 rounded-fq-md px-4 text-sm ${
              tab === k
                ? "bg-primary text-primary-foreground"
                : "border border-border"
            }`}
          >
            {t(label.en, label.bn)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("Search by name", "নাম দিয়ে খুঁজুন")}
          aria-label={t("Search by name", "নাম দিয়ে খুঁজুন")}
          className="min-h-11 flex-1 rounded-fq-md border border-border bg-background px-3 text-sm"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label={t("Category", "ক্যাটাগরি")}
          className="min-h-11 rounded-fq-md border border-border bg-background px-2 text-sm"
        >
          <option value="all">{t("All categories", "সব ক্যাটাগরি")}</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={priceFilter}
          onChange={(e) => setPriceFilter(e.target.value)}
          aria-label={t("Price", "দাম")}
          className="min-h-11 rounded-fq-md border border-border bg-background px-2 text-sm"
        >
          <option value="all">{t("All prices", "সব দাম")}</option>
          <option value="free">{t("Free", "ফ্রি")}</option>
          <option value="paid">{t("Paid", "পেইড")}</option>
        </select>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {listings.length === 0 && (
          <li className="rounded-fq-md border border-dashed border-border p-6 text-sm text-muted-foreground">
            {t("No extensions found.", "কোনো এক্সটেনশন পাওয়া যায়নি।")}
          </li>
        )}
        {listings.map((l) => {
          const isInstalled = data.installs.some(
            (i) =>
              (l.builtin
                ? i.listing_slug === l.slug
                : i.theme_id === l.id || i.widget_id === l.id) &&
              isLiveInstall(i.status),
          );
          const themeState =
            l.kind === "theme" ? themeStateBySlug.get(l.slug) : undefined;
          const liveInstall =
            l.kind === "theme"
              ? data.installs.find(
                  (i) =>
                    (l.builtin
                      ? i.listing_slug === l.slug
                      : i.theme_id === l.id) && isLiveInstall(i.status),
                )
              : undefined;
          return (
            <li
              key={l.id}
              className="flex flex-col rounded-fq-md border border-border bg-card p-4"
            >
              <div
                className="mb-2 h-24 rounded-fq-sm bg-muted"
                aria-hidden="true"
              />
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{l.name}</p>
                {isInstalled && (
                  <span className="shrink-0 rounded-fq-sm bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    ✓ {t("Installed", "ইনস্টলড")}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {l.vendor_name || "Framique creator"}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="tabular-nums font-medium">
                  {l.price_minor_int === 0
                    ? "৳ 0.00"
                    : fmtMinor(l.price_minor_int, l.currency_code)}
                </span>
                <span className="rounded-fq-sm border border-border px-2 py-0.5">
                  v{l.version}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {l.install_count} {t("installs", "ইনস্টল")}
                </span>
                {l.rating != null && (
                  <span className="tabular-nums text-muted-foreground">
                    ★ {l.rating.toFixed(1)}
                  </span>
                )}
                {!l.compatible && (
                  <span className="rounded-fq-sm bg-destructive/10 px-2 py-0.5 text-destructive">
                    {t("Version mismatch", "সংস্করণ অমিল")}
                  </span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActive(l)}
                  className="min-h-11 rounded-fq-md border border-border px-3 text-sm"
                >
                  {t("Details", "বিস্তারিত")}
                </button>
                {themeState && !themeState.isActive && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => activateInstalledTheme(themeState.themeId)}
                    className="min-h-11 rounded-fq-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
                  >
                    {t("Activate", "সক্রিয় করুন")}
                  </button>
                )}
                {themeState?.isActive && (
                  <span className="inline-flex min-h-11 items-center rounded-fq-md bg-primary/10 px-2 text-xs font-medium text-primary">
                    {t("Active", "সক্রিয়")}
                  </span>
                )}
                {liveInstall && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      setPendingDelete({
                        installId: liveInstall.id,
                        name: l.name,
                      })
                    }
                    className="min-h-11 rounded-fq-md border border-destructive/40 px-3 text-sm text-destructive disabled:opacity-60"
                  >
                    {t("Delete", "মুছুন")}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {active && (
        <DetailModal
          listing={active}
          installed={data.installs.some(
            (i) =>
              (active.builtin
                ? i.listing_slug === active.slug
                : i.theme_id === active.id || i.widget_id === active.id) &&
              isLiveInstall(i.status),
          )}
          busy={busy}
          onClose={() => setActive(null)}
          onInstall={requestInstall}
        />
      )}

      {consent && (
        <InstallConsent
          listingName={consent.listing.name}
          version={consent.version}
          trial={consent.trial}
          busy={busy}
          onCancel={() => setConsent(null)}
          onApprove={(v, s) =>
            consent && install(consent.listing, consent.trial, v, s)
          }
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("Delete theme", "থিম মুছুন")}
        description={tk("marketplace.confirm_delete_theme")}
        confirmLabel={t("Delete", "মুছুন")}
        destructive
        onConfirm={() => deleteInstalledTheme()}
        onCancel={() => setPendingDelete(null)}
      />

      <section className="space-y-2">
        <h2 className="font-bangla-display text-lg font-semibold">
          {t("My installs", "আমার ইনস্টল")}
        </h2>
        <ul className="divide-y divide-border rounded-fq-md border border-border bg-card">
          {data.installs.length === 0 && (
            <li className="p-4 text-sm text-muted-foreground">
              {t("Nothing installed yet.", "এখনো কিছু ইনস্টল করা হয়নি।")}
            </li>
          )}
          {data.installs.map((i) => (
            <li
              key={i.id}
              className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
            >
              <span>
                <span className="font-medium">{i.listing_name}</span>{" "}
                <span className="text-muted-foreground">
                  ·{" "}
                  {INSTALL_LABEL[i.status]
                    ? t(INSTALL_LABEL[i.status].en, INSTALL_LABEL[i.status].bn)
                    : i.status}
                  {i.expires_at
                    ? ` · ${t("expires", "মেয়াদ")} ${new Date(i.expires_at).toLocaleDateString("en-GB")}`
                    : ""}
                </span>
              </span>
              <span className="flex gap-2">
                {isLiveInstall(i.status) && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        setStatus(
                          i.id,
                          i.status === "paused" ? "installed" : "paused",
                        )
                      }
                      className="min-h-11 rounded-fq-md border border-border px-3 disabled:opacity-60"
                    >
                      {i.status === "paused"
                        ? t("Enable", "চালু")
                        : t("Pause", "স্থগিত")}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setStatus(i.id, "rolled_back")}
                      className="min-h-11 rounded-fq-md border border-border px-3 disabled:opacity-60"
                    >
                      {t("Restore original files", "মূল ফাইল ফেরান")}
                    </button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <InstalledApps />
    </div>
  );
}

function DetailModal({
  listing,
  installed,
  busy,
  onClose,
  onInstall,
}: {
  listing: Listing;
  installed?: boolean;
  busy: boolean;
  onClose: () => void;
  onInstall: (l: Listing, trial: boolean) => void;
}) {
  const { t, tk } = useLang();
  const history = Array.isArray(listing.version_history)
    ? (listing.version_history as unknown[]).map(String)
    : [];
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={listing.name}
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4"
    >
      <div className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-fq-lg border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bangla-display text-lg font-semibold">
                {listing.name}
              </h2>
              {installed && (
                <span className="rounded-fq-sm bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  ✓ {t("Installed", "ইনস্টলড")}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {listing.category} · v{listing.version} · {listing.install_count}{" "}
              {t("installs", "ইনস্টল")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-fq-md border border-border px-3 text-sm"
          >
            {t("Close", "বন্ধ")}
          </button>
        </div>

        <div className="mt-4 grid h-40 place-items-center rounded-fq-md bg-muted text-sm text-muted-foreground">
          {listing.kind === "theme"
            ? t("Theme preview (demo page)", "থিম প্রিভিউ (ডেমো পেজ)")
            : t("Widget mock preview", "উইজেট মক প্রিভিউ")}
        </div>

        <p className="mt-4 text-sm">
          {listing.description ?? t("No description.", "বর্ণনা নেই।")}
        </p>

        {history.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            {history.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <span className="tabular-nums text-lg font-semibold">
            {listing.price_minor_int === 0
              ? "৳ 0.00"
              : fmtMinor(listing.price_minor_int, listing.currency_code)}
          </span>
          <button
            type="button"
            disabled={busy || !listing.compatible}
            onClick={() => onInstall(listing, false)}
            className="min-h-11 rounded-fq-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {installed
              ? t("Reinstall / Update", "পুনরায় ইনস্টল / আপডেট")
              : t("Install", "ইনস্টল করুন")}
          </button>
          {listing.trial_allowed && listing.price_minor_int > 0 && (
            <button
              type="button"
              disabled={busy || !listing.compatible}
              onClick={() => onInstall(listing, true)}
              className="min-h-11 rounded-fq-md border border-border px-4 text-sm disabled:opacity-60"
            >
              {t("14-day trial", "১৪ দিনের ট্রায়াল")}
            </button>
          )}
          {!listing.compatible && (
            <span className="text-sm text-destructive">
              {t(
                "Version mismatch — install blocked",
                "সংস্করণ অমিল — ইনস্টল বন্ধ",
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
