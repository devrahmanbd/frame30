import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Puzzle,
  Sparkles,
  Check,
  Star,
  Download,
  ShieldCheck,
  Trash2,
  Settings,
  Search,
  X,
  Layers,
  Store,
  TrendingUp,
  CreditCard,
  Truck,
  Flame,
  Award,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Info,
} from "@/components/icons/tabler";
import { fmtMinor } from "@/lib/money";
import {
  marketBulkInstallsFn,
  marketCatalogFn,
  marketInstallFn,
  marketInstallStatusFn,
  marketListingVersionsFn,
  marketUninstallWidgetFn,
} from "@/lib/marketplace.functions";
import {
  InstallConsent,
  type ConsentVersion,
} from "@/components/marketplace/InstallConsent";
import { InstalledApps } from "@/components/marketplace/InstalledApps";
import { ConfirmDialog } from "@/components/console/kit";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard/marketplace/")({
  // Theme tabs retired (Sept 2026 purge): every marketplace view is plugins.
  // Legacy `?tab=theme` deep-links coerce to the plugin catalog.
  validateSearch: (
    s: Record<string, unknown>,
  ): {
    tab: "plugin";
    view?: "installed" | "catalog";
  } => ({
    tab: "plugin" as const,
    ...(s.view === "installed" ? { view: "installed" as const } : {}),
  }),
  loader: () => marketCatalogFn(),
  head: () => ({
    meta: [
      { title: "Marketplace — Framique Admin" },
      {
        name: "description",
        content:
          "Browse and install modular extensions verified by Framique Cloud.",
      },
      { property: "og:title", content: "Marketplace — Framique Admin" },
      {
        property: "og:description",
        content: "Verified modular plugins for your storefront.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Marketplace,
});

type Catalog = Awaited<ReturnType<typeof marketCatalogFn>>;
type Listing = Catalog["widgets"][number];

/** Ledger rows in these states count as "installed" for badges and actions. */
function isLiveInstall(status: string) {
  return status === "installed" || status === "trial" || status === "paused";
}

const INSTALL_LABEL: Record<string, string> = {
  installed: "Installed",
  removed: "Removed",
  trial: "Trial",
  paused: "Paused",
  rolled_back: "Rolled back",
};

/** Category icons and colors for plugins */
function getPluginIcon(category: string) {
  const cat = category.toLowerCase();
  if (cat.includes("support") || cat.includes("chat")) return MessageSquare;
  if (
    cat.includes("fulfill") ||
    cat.includes("courier") ||
    cat.includes("shipping")
  )
    return Truck;
  if (cat.includes("social") || cat.includes("review")) return Star;
  if (cat.includes("marketing") || cat.includes("loyalty")) return Award;
  if (cat.includes("conversion") || cat.includes("sales")) return Flame;
  if (cat.includes("pay") || cat.includes("bill")) return CreditCard;
  if (cat.includes("analytic") || cat.includes("seo")) return TrendingUp;
  return Puzzle;
}

function getPluginBadgeColor(category: string) {
  const cat = category.toLowerCase();
  if (cat.includes("support") || cat.includes("chat")) {
    return {
      bg: "bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
      accent: "from-emerald-500 to-teal-600",
    };
  }
  if (
    cat.includes("fulfill") ||
    cat.includes("courier") ||
    cat.includes("shipping")
  ) {
    return {
      bg: "bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30",
      accent: "from-amber-500 to-orange-600",
    };
  }
  if (cat.includes("social") || cat.includes("review")) {
    return {
      bg: "bg-yellow-500/10 dark:bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
      accent: "from-yellow-500 to-amber-600",
    };
  }
  if (cat.includes("marketing") || cat.includes("loyalty")) {
    return {
      bg: "bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30",
      accent: "from-purple-500 to-indigo-600",
    };
  }
  if (cat.includes("conversion") || cat.includes("sales")) {
    return {
      bg: "bg-rose-500/10 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30",
      accent: "from-rose-500 to-red-600",
    };
  }
  if (cat.includes("pay") || cat.includes("bill")) {
    return {
      bg: "bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30",
      accent: "from-blue-500 to-cyan-600",
    };
  }
  if (cat.includes("analytic") || cat.includes("seo")) {
    return {
      bg: "bg-cyan-500/10 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border-cyan-500/30",
      accent: "from-cyan-500 to-blue-600",
    };
  }
  return {
    bg: "bg-primary/10 text-primary border-primary/30",
    accent: "from-indigo-500 to-primary",
  };
}

function Marketplace() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const qc = useQueryClient();
  const { view: initialView } = Route.useSearch();

  const [pluginView, setPluginView] = useState<"catalog" | "installed">(
    initialView === "installed" ? "installed" : "catalog",
  );

  useEffect(() => {
    setPluginView(initialView === "installed" ? "installed" : "catalog");
  }, [initialView]);

  const [query, setQuery] = useState("");
  const [priceFilter, setPriceFilter] = useState<"all" | "free" | "paid">(
    "all",
  );
  const [category, setCategory] = useState("all");
  const [installFilter, setInstallFilter] = useState<
    "all" | "installed" | "available"
  >("all");
  const [sortBy, setSortBy] = useState<
    "popular" | "rating" | "newest" | "name"
  >("popular");

  const [active, setActive] = useState<Listing | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [impacted, setImpacted] = useState<string[]>([]);
  const [consent, setConsent] = useState<{
    listing: Listing;
    trial: boolean;
    version: ConsentVersion | null;
    idempotencyKey: string;
  } | null>(null);

  const [pendingDelete, setPendingDelete] = useState<{
    installId?: string;
    name: string;
  } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showLedger, setShowLedger] = useState(false);

  const source = data.widgets;

  // Available categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    source.forEach((l) => {
      if (l.category) set.add(l.category);
    });
    return Array.from(set).sort();
  }, [source]);

  // Reset category if the current category doesn't exist
  useEffect(() => {
    if (category !== "all" && !categories.includes(category)) {
      setCategory("all");
    }
  }, [categories, category]);

  // Filter and sort listings
  const listings = useMemo(() => {
    return source
      .filter((l) => {
        // Category filter
        if (category !== "all" && l.category !== category) return false;

        // Price filter
        if (priceFilter === "free" && l.price_minor_int > 0) return false;
        if (priceFilter === "paid" && l.price_minor_int === 0) return false;

        // Installation filter
        const isInstalled = data.installs.some(
          (i) =>
            (l.builtin ? i.listing_slug === l.slug : i.widget_id === l.id) &&
            isLiveInstall(i.status),
        );
        if (installFilter === "installed" && !isInstalled) return false;
        if (installFilter === "available" && isInstalled) return false;

        // Search query
        if (query.trim()) {
          const q = query.trim().toLowerCase();
          const matchName = l.name.toLowerCase().includes(q);
          const matchDesc = (l.description ?? "").toLowerCase().includes(q);
          const matchVendor = (l.vendor_name ?? "").toLowerCase().includes(q);
          const matchCategory = (l.category ?? "").toLowerCase().includes(q);
          const matchTags =
            "tags" in l && Array.isArray(l.tags)
              ? l.tags.some((t: string) => t.toLowerCase().includes(q))
              : false;
          if (
            !matchName &&
            !matchDesc &&
            !matchVendor &&
            !matchCategory &&
            !matchTags
          ) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "popular") return b.install_count - a.install_count;
        if (sortBy === "rating") {
          const rA = a.rating ?? 0;
          const rB = b.rating ?? 0;
          return rB - rA;
        }
        if (sortBy === "newest") {
          return (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        }
        if (sortBy === "name") {
          return a.name.localeCompare(b.name);
        }
        return 0;
      });
  }, [
    source,
    category,
    priceFilter,
    installFilter,
    query,
    sortBy,
    data.installs,
  ]);

  const hasActiveFilters =
    query.trim() !== "" ||
    category !== "all" ||
    priceFilter !== "all" ||
    installFilter !== "all";

  function resetFilters() {
    setQuery("");
    setCategory("all");
    setPriceFilter("all");
    setInstallFilter("all");
    setSortBy("popular");
  }

  /** Step 1 — pull the pinned version and request consent if needed */
  async function requestInstall(listing: Listing, trial: boolean) {
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
      const key = `${listing.id}-${trial ? "trial" : "buy"}-${crypto.randomUUID()}`;
      setConsent({ listing, trial, version: latest, idempotencyKey: key });
      setActive(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not read versions");
      toast.error("Could not fetch extension details");
    } finally {
      setBusy(false);
    }
  }

  /** Step 2 — install with granted scopes */
  async function install(
    listing: Listing,
    trial: boolean,
    versionId: string | null,
    grantedScopes: string[],
  ) {
    setBusy(true);
    setMsg(null);
    try {
      const stableKey =
        consent?.idempotencyKey ??
        `${listing.id}-${trial ? "trial" : "buy"}-${crypto.randomUUID()}`;
      const res = await marketInstallFn({
        data: {
          kind: listing.kind,
          listingId: listing.id,
          trial,
          versionId,
          grantedScopes,
          idempotencyKey: stableKey,
        },
      });
      setImpacted(res.impacted ?? []);
      const base = trial
        ? "Trial license initiated successfully."
        : "Installed successfully.";
      setMsg(base);
      toast.success("Plugin installed successfully");
      setConsent(null);
      await router.invalidate();
      await qc.invalidateQueries({ queryKey: ["admin", "plugins"] });
    } catch (e) {
      const err = e instanceof Error ? e.message : "Install failed";
      setMsg(err);
      toast.error(err);
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
      await marketInstallStatusFn({ data: { installId, status } });
      const base =
        status === "rolled_back"
          ? "Extension files rolled back to clean state."
          : `Extension status updated to ${status}.`;
      setMsg(base);
      toast.success(
        status === "paused"
          ? "Extension paused"
          : status === "installed"
            ? "Extension resumed"
            : "Files restored",
      );
      await router.invalidate();
      await qc.invalidateQueries({ queryKey: ["admin", "plugins"] });
    } catch (e) {
      const err = e instanceof Error ? e.message : "Update failed";
      setMsg(err);
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  async function bulkRun(action: "enable" | "pause" | "delete") {
    if (selected.size === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await marketBulkInstallsFn({
        data: { installIds: [...selected], action },
      });
      const ok = res.results.filter((r) => r.ok).length;
      const failed = res.results.length - ok;
      toast.success(
        failed === 0
          ? `Bulk action applied to ${ok} item(s)`
          : `Bulk action applied to ${ok}/${res.results.length} items (${failed} skipped)`,
      );
      setSelected(new Set());
      await router.invalidate();
      await qc.invalidateQueries({ queryKey: ["admin", "plugins"] });
    } catch (e) {
      const err = e instanceof Error ? e.message : "Bulk action failed";
      setMsg(err);
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  async function deleteInstalledWidget() {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await marketUninstallWidgetFn({
        data: { installId: pendingDelete.installId },
      });
      toast.success("Plugin deleted successfully");
      setPendingDelete(null);
      setActive(null);
      await router.invalidate();
      await qc.invalidateQueries({ queryKey: ["admin", "plugins"] });
    } catch (e) {
      const err = e instanceof Error ? e.message : "Delete failed";
      setMsg(err);
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Top Header & Metrics Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/30 p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                <Store className="size-3.5" /> Framique Directory
              </span>
              <span className="rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[11px] font-mono text-muted-foreground">
                Engine v{data.appVersion}
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Marketplace
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Browse and install modular extensions verified by Framique Cloud.
              All modules run in sandboxed V8 environments with zero runtime
              bloat.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              to="/dashboard/marketplace/creator"
              className="inline-flex items-center gap-1.5 rounded-fq-md border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground shadow-xs transition-colors hover:bg-muted active:scale-[0.98]"
            >
              <Sparkles className="size-3.5 text-primary" />
              <span>Creator Studio</span>
            </Link>
            <Link
              to="/dashboard/marketplace/versions"
              className="inline-flex items-center gap-1.5 rounded-fq-md border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground shadow-xs transition-colors hover:bg-muted active:scale-[0.98]"
            >
              <Layers className="size-3.5 text-muted-foreground" />
              <span>Version Vault</span>
            </Link>
          </div>
        </div>

        {/* Quick Chips */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-4 text-xs">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-border/70 bg-background/60 px-3 py-1 text-muted-foreground backdrop-blur-xs">
              <ShieldCheck className="size-3.5 text-emerald-500" />
              <span>100% Sandboxed V8 & Zero Bloat</span>
            </div>
          </div>

          <div className="flex items-center gap-3 text-muted-foreground">
            <span>
              <strong className="text-foreground">{data.widgets.length}</strong>{" "}
              Plugins
            </span>
            <span>·</span>
            <span>
              <strong className="text-foreground">
                {data.installs.length}
              </strong>{" "}
              Active Installs
            </span>
          </div>
        </div>
      </div>

      {msg && (
        <div
          role="status"
          className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-sm text-foreground animate-in fade-in duration-200"
        >
          <div className="flex items-center gap-2.5">
            <Info className="size-4 text-primary shrink-0" />
            <span>{msg}</span>
          </div>
          <button
            type="button"
            onClick={() => setMsg(null)}
            className="text-muted-foreground hover:text-foreground p-1 cursor-pointer"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {impacted.length > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">
          <div className="flex items-center gap-2 font-semibold text-warning-foreground">
            <AlertCircle className="size-4" />
            <span>Warning — impacted page nodes detected</span>
          </div>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-0.5 text-xs">
            {impacted.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Verify layout coherence in the builder before publishing to
            shoppers.
          </p>
        </div>
      )}

      {/* Plugins navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-3">
        <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-2 text-sm font-semibold text-foreground">
          <Puzzle className="size-4" />
          <span>Plugins & Extensions</span>
          <span className="rounded-full bg-primary/10 px-2 py-0.2 text-[11px] tabular-nums text-primary font-bold">
            {data.widgets.length}
          </span>
        </div>

        <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => {
              setPluginView("catalog");
              void router.navigate({
                to: "/dashboard/marketplace",
                search: { tab: "plugin", view: "catalog" },
              });
            }}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer",
              pluginView === "catalog"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Browse Catalog
          </button>
          <button
            type="button"
            onClick={() => {
              setPluginView("installed");
              void router.navigate({
                to: "/dashboard/marketplace",
                search: { tab: "plugin", view: "installed" },
              });
            }}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer",
              pluginView === "installed"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Installed Plugins Desk
          </button>
        </div>
      </div>

      {/* If in 'installed' view, render InstalledApps immediately */}
      {pluginView === "installed" ? (
        <div className="space-y-4">
          <InstalledApps installs={data.installs} />
        </div>
      ) : (
        <>
          {/* Filter, Search & Ergonomics Bar */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* Search Bar */}
              <div className="relative flex-1 min-w-[240px]">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search plugins by name, scope, category..."
                  aria-label="Search catalog"
                  className="h-10 w-full rounded-xl border border-border bg-card pl-10 pr-9 text-sm text-foreground shadow-xs transition-colors focus:border-primary focus:outline-hidden"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 cursor-pointer"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              {/* Price Filter Pills */}
              <div className="inline-flex rounded-xl border border-border bg-muted/30 p-1 text-xs">
                {(
                  [
                    ["all", "All Prices"],
                    ["free", "Free"],
                    ["paid", "Paid"],
                  ] as const
                ).map(([p, label]) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriceFilter(p)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer",
                      priceFilter === p
                        ? "bg-card text-foreground shadow-xs font-semibold"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Install Status Filter Pills */}
              <div className="inline-flex rounded-xl border border-border bg-muted/30 p-1 text-xs">
                {(
                  [
                    ["all", "All Items"],
                    ["installed", "Installed"],
                    ["available", "Available"],
                  ] as const
                ).map(([s, label]) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setInstallFilter(s)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer",
                      installFilter === s
                        ? "bg-card text-foreground shadow-xs font-semibold"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Sort Dropdown */}
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  aria-label="Sort extensions"
                  className="h-10 rounded-xl border border-border bg-card px-3 pr-8 text-xs font-medium text-foreground shadow-xs focus:border-primary focus:outline-hidden cursor-pointer"
                >
                  <option value="popular">Most Popular</option>
                  <option value="rating">Highest Rated</option>
                  <option value="newest">Newest Releases</option>
                  <option value="name">Alphabetical (A-Z)</option>
                </select>
              </div>
            </div>

            {/* Category Pills (Horizontal Scroll) */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              <button
                type="button"
                onClick={() => setCategory("all")}
                className={cn(
                  "shrink-0 rounded-full px-3.5 py-1 text-xs font-medium transition-all cursor-pointer",
                  category === "all"
                    ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                    : "border border-border/80 bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                All Categories ({source.length})
              </button>
              {categories.map((c) => {
                const count = source.filter((l) => l.category === c).length;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={cn(
                      "shrink-0 capitalize rounded-full px-3.5 py-1 text-xs font-medium transition-all cursor-pointer",
                      category === c
                        ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                        : "border border-border/80 bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {c}{" "}
                    <span className="opacity-70 text-[10px]">({count})</span>
                  </button>
                );
              })}
            </div>

            {/* Active Filters Summary */}
            {hasActiveFilters && (
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
                <span>Active filters:</span>
                {query && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-foreground">
                    Keyword: "{query}"
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="cursor-pointer"
                    >
                      <X className="size-3 hover:text-primary" />
                    </button>
                  </span>
                )}
                {category !== "all" && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 capitalize text-foreground">
                    Category: {category}
                    <button
                      type="button"
                      onClick={() => setCategory("all")}
                      className="cursor-pointer"
                    >
                      <X className="size-3 hover:text-primary" />
                    </button>
                  </span>
                )}
                {priceFilter !== "all" && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 capitalize text-foreground">
                    Price: {priceFilter}
                    <button
                      type="button"
                      onClick={() => setPriceFilter("all")}
                      className="cursor-pointer"
                    >
                      <X className="size-3 hover:text-primary" />
                    </button>
                  </span>
                )}
                {installFilter !== "all" && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 capitalize text-foreground">
                    Status: {installFilter}
                    <button
                      type="button"
                      onClick={() => setInstallFilter("all")}
                      className="cursor-pointer"
                    >
                      <X className="size-3 hover:text-primary" />
                    </button>
                  </span>
                )}
                <button
                  type="button"
                  onClick={resetFilters}
                  className="font-medium text-primary hover:underline ml-1 cursor-pointer"
                >
                  Reset all filters
                </button>
              </div>
            )}
          </div>

          {/* Grid of Listings */}
          {listings.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-card/50 p-12 text-center">
              <div className="grid size-12 place-items-center rounded-full bg-muted">
                <Search className="size-6 text-muted-foreground" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-foreground">
                No plugins found
              </h3>
              <p className="mt-1 text-sm text-muted-foreground max-w-sm">
                No extensions match your current query and filters. Try
                adjusting your search criteria or resetting filters.
              </p>
              <button
                type="button"
                onClick={resetFilters}
                className="mt-5 inline-flex items-center gap-2 rounded-fq-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-all active:scale-95 cursor-pointer"
              >
                <RotateCcw className="size-3.5" />
                <span>Reset All Filters</span>
              </button>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {listings.map((l) => {
                const isInstalled = data.installs.some(
                  (i) =>
                    (l.builtin
                      ? i.listing_slug === l.slug
                      : i.widget_id === l.id) && isLiveInstall(i.status),
                );

                // Plugin Card
                const IconComp = getPluginIcon(l.category);
                const colorScheme = getPluginBadgeColor(l.category);
                return (
                  <article
                    key={l.id}
                    className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-card transition-all duration-300 hover:border-primary/40 hover:shadow-xl hover:-translate-y-1.5 motion-reduce:hover:transform-none p-5"
                  >
                    <div className="flex items-start gap-3.5">
                      <div
                        className={cn(
                          "grid size-12 shrink-0 place-items-center rounded-xl border transition-transform duration-300 group-hover:scale-105",
                          colorScheme.bg,
                        )}
                      >
                        <IconComp className="size-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors text-base tracking-tight truncate">
                            {l.name}
                          </h3>
                          {isInstalled && (
                            <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                              <Check className="size-3" /> Installed
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <span>by {l.vendor_name || "Framique Core"}</span>
                          <ShieldCheck className="size-3 text-emerald-500" />
                        </p>
                      </div>
                    </div>

                    <p className="mt-3 text-xs text-muted-foreground line-clamp-2 leading-relaxed flex-1">
                      {l.description ??
                        "Modular extension with sandboxed V8 execution, zero client bloat, and unified admin controls."}
                    </p>

                    {/* Scopes / Category Tags */}
                    <div className="mt-3 flex flex-wrap gap-1">
                      <span className="rounded-full bg-muted/80 px-2 py-0.5 text-[10px] font-medium text-foreground/80 uppercase tracking-wider">
                        {l.category}
                      </span>
                      {"manifest" in l &&
                        l.manifest &&
                        typeof l.manifest === "object" &&
                        "permissions" in
                          (l.manifest as Record<string, unknown>) &&
                        Array.isArray(
                          (l.manifest as Record<string, unknown>).permissions,
                        ) &&
                        (
                          (l.manifest as Record<string, unknown>)
                            .permissions as string[]
                        )
                          .slice(0, 2)
                          .map((perm: string) => (
                            <span
                              key={perm}
                              className="rounded-full border border-border/60 bg-card px-2 py-0.5 text-[10px] text-muted-foreground"
                            >
                              {perm.replace(/_/g, " ")}
                            </span>
                          ))}
                    </div>

                    {/* Metadata Footer */}
                    <div className="mt-3.5 flex items-center gap-3 border-t border-border/50 pt-2.5 text-[11px] text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        {l.price_minor_int === 0
                          ? "Free"
                          : fmtMinor(l.price_minor_int, l.currency_code)}
                      </span>
                      <span>·</span>
                      <span className="font-medium">v{l.version}</span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1">
                        <Download className="size-3" />
                        <span className="tabular-nums">
                          {l.install_count} installs
                        </span>
                      </span>
                      {l.rating != null && (
                        <span className="ml-auto inline-flex items-center gap-1 text-amber-500 font-medium">
                          <Star className="size-3 fill-amber-400" />
                          {l.rating.toFixed(1)}
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="mt-3.5 flex items-center gap-2 pt-1">
                      {isInstalled ? (
                        <>
                          <Link
                            to="/dashboard/plugins"
                            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-fq-md border border-border bg-muted/50 px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-colors active:scale-[0.98]"
                          >
                            <Settings className="size-3.5" /> Configure in
                            Plugins
                          </Link>
                          <button
                            type="button"
                            onClick={() => setActive(l)}
                            className="rounded-fq-md border border-border px-3 py-2 text-xs font-medium hover:bg-muted transition-colors active:scale-[0.98] cursor-pointer"
                          >
                            Details
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={busy || !l.compatible}
                            onClick={() => requestInstall(l, false)}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-fq-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors active:scale-[0.98] disabled:opacity-60 cursor-pointer"
                          >
                            <Download className="size-3.5" />
                            {l.price_minor_int === 0
                              ? "Install Plugin"
                              : "Install"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setActive(l)}
                            className="rounded-fq-md border border-border px-3 py-2 text-xs font-medium hover:bg-muted transition-colors active:scale-[0.98] cursor-pointer"
                          >
                            Details
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Install History & Rollback Ledger Section */}
      <section className="rounded-2xl border border-border/80 bg-card overflow-hidden shadow-xs">
        <button
          type="button"
          onClick={() => setShowLedger((prev) => !prev)}
          className="w-full flex items-center justify-between p-4 text-left transition-colors hover:bg-muted/40 cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <Layers className="size-4 text-primary" />
            <h2 className="text-base font-semibold text-foreground">
              Install Records & License Ledger
            </h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums">
              {data.installs.length} records
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{showLedger ? "Hide ledger" : "View ledger & rollback"}</span>
            {showLedger ? (
              <ChevronUp className="size-4" />
            ) : (
              <ChevronDown className="size-4" />
            )}
          </div>
        </button>

        {showLedger && (
          <div className="border-t border-border p-4 space-y-3 animate-in fade-in duration-200">
            {data.installs.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={
                      selected.size > 0 &&
                      selected.size === data.installs.length
                    }
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? new Set(data.installs.map((r) => r.id))
                          : new Set(),
                      )
                    }
                    className="size-4 rounded-sm"
                  />
                  <span>Select all {data.installs.length} installs</span>
                </label>

                {selected.size > 0 && (
                  <div
                    role="toolbar"
                    aria-label="Bulk actions"
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/60 px-3 py-1.5 text-xs"
                  >
                    <span className="font-semibold tabular-nums text-foreground">
                      {selected.size} selected
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => bulkRun("enable")}
                      className="rounded-md border border-border bg-card px-2.5 py-1 font-medium hover:bg-muted transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      Enable
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => bulkRun("pause")}
                      className="rounded-md border border-border bg-card px-2.5 py-1 font-medium hover:bg-muted transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      Pause
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => bulkRun("delete")}
                      className="rounded-md border border-destructive/40 bg-card px-2.5 py-1 font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelected(new Set())}
                      className="text-muted-foreground hover:text-foreground px-1 cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>
            )}

            <ul className="divide-y divide-border/60 rounded-xl border border-border bg-card/60">
              {data.installs.length === 0 ? (
                <li className="p-6 text-center text-sm text-muted-foreground">
                  No extensions installed on this store yet.
                </li>
              ) : (
                data.installs.map((i) => (
                  <li
                    key={i.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-3.5 text-sm transition-colors hover:bg-muted/30"
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selected.has(i.id)}
                        onChange={(e) =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(i.id);
                            else next.delete(i.id);
                            return next;
                          })
                        }
                        aria-label={`Select ${i.listing_name}`}
                        className="size-4 rounded-sm"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">
                            {i.listing_name}
                          </span>
                          <span className="rounded-full px-2 py-0.2 text-[10px] font-medium uppercase tracking-wider bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                            {i.kind}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Status:{" "}
                          <span className="font-medium text-foreground">
                            {INSTALL_LABEL[i.status] ?? i.status}
                          </span>
                          {i.is_trial ? " · Trial License" : ""}
                          {i.expires_at
                            ? ` · Expires ${new Date(i.expires_at).toLocaleDateString("en-GB")}`
                            : ""}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isLiveInstall(i.status) && i.kind === "widget" && (
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
                            className="rounded-fq-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-60 cursor-pointer"
                          >
                            {i.status === "paused" ? "Resume" : "Pause"}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              setPendingDelete({
                                installId: i.id,
                                name: i.listing_name,
                              })
                            }
                            className="inline-flex items-center gap-1 rounded-fq-md border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-60 cursor-pointer"
                          >
                            <Trash2 className="size-3" /> Delete
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </section>

      {/* Detail Modal */}
      {active &&
        (() => {
          const live = data.installs.find(
            (i) =>
              (active.builtin
                ? i.listing_slug === active.slug
                : i.widget_id === active.id) && isLiveInstall(i.status),
          );
          const isInstalled = Boolean(live);
          return (
            <DetailModal
              listing={active}
              installed={isInstalled}
              busy={busy}
              onClose={() => setActive(null)}
              onInstall={requestInstall}
              liveInstallId={live?.id ?? null}
              onDelete={
                isInstalled
                  ? () =>
                      setPendingDelete({
                        installId: live?.id,
                        name: active.name,
                      })
                  : undefined
              }
            />
          );
        })()}

      {/* Consent Modal */}
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

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Uninstall Plugin"
        description={`Are you sure you want to uninstall and remove "${pendingDelete?.name}"? Its background hooks and storefront widgets will be deregistered.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => deleteInstalledWidget()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function DetailModal({
  listing,
  installed,
  busy,
  onClose,
  onInstall,
  liveInstallId,
  onDelete,
}: {
  listing: Listing;
  installed?: boolean;
  busy: boolean;
  onClose: () => void;
  onInstall: (l: Listing, trial: boolean) => void;
  liveInstallId?: string | null;
  onDelete?: () => void;
}) {
  const history = Array.isArray(listing.version_history)
    ? (listing.version_history as unknown[]).map(String)
    : [];

  const IconComp = getPluginIcon(listing.category);
  const colorScheme = getPluginBadgeColor(listing.category);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={listing.name}
      className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-md p-4 animate-in fade-in duration-200"
    >
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-4">
          <div className="flex items-start gap-3.5">
            <div
              className={cn(
                "grid size-12 shrink-0 place-items-center rounded-xl border",
                colorScheme.bg,
              )}
            >
              <IconComp className="size-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-foreground">
                  {listing.name}
                </h2>
                {installed && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <Check className="size-3" /> Installed
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                <span className="capitalize">{listing.category}</span>
                <span>·</span>
                <span>v{listing.version}</span>
                <span>·</span>
                <span>by {listing.vendor_name || "Framique"}</span>
                <span>·</span>
                <span className="tabular-nums">
                  {listing.install_count.toLocaleString()} installs
                </span>
                {listing.rating != null && (
                  <>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1 text-amber-500 font-medium">
                      <Star className="size-3 fill-amber-400" />
                      {listing.rating.toFixed(1)}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Description & Features */}
        <div className="mt-5 space-y-4">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Overview
            </h3>
            <p className="mt-1.5 text-sm text-foreground/90 leading-relaxed">
              {listing.description ??
                "High-performance extension designed for modern merchant storefronts with zero runtime bloat."}
            </p>
          </div>

          {/* Key Feature Checkpoints */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Architecture & Guarantees
            </h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 text-xs">
              <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/30 p-2.5">
                <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                <span>Zero Layout Shift & Core Web Vitals 95+</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/30 p-2.5">
                <ShieldCheck className="size-4 text-emerald-500 shrink-0" />
                <span>Sandboxed V8 Execution & Zero Data Leaks</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/30 p-2.5">
                <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                <span>Edge Nitro SSR with Automated CDN Purging</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/30 p-2.5">
                <ShieldCheck className="size-4 text-emerald-500 shrink-0" />
                <span>Verified Clean Code & Malware-Free Vault</span>
              </div>
            </div>
          </div>

          {/* Tags */}
          {"tags" in listing &&
            Array.isArray(listing.tags) &&
            listing.tags.length > 0 && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Tags
                </h3>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {listing.tags.map((tag: string) => (
                    <span
                      key={tag}
                      className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

          {/* Features */}
          {"features" in listing &&
            Array.isArray(listing.features) &&
            listing.features.length > 0 && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Features Included
                </h3>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {listing.features.map((feature: string) => (
                    <span
                      key={feature}
                      className="inline-flex items-center gap-1 rounded-lg border border-border/80 bg-card px-2.5 py-1 text-xs capitalize text-foreground"
                    >
                      <Check className="size-3 text-emerald-500" /> {feature}
                    </span>
                  ))}
                </div>
              </div>
            )}

          {/* Version History */}
          {history.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Release History
              </h3>
              <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                {history.map((h) => (
                  <li key={h} className="font-mono">
                    • {h}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Sticky Action Footer */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
          <div>
            <span className="text-xs text-muted-foreground block">
              License Price
            </span>
            <span className="text-xl font-bold text-foreground">
              {listing.price_minor_int === 0
                ? "Free"
                : fmtMinor(listing.price_minor_int, listing.currency_code)}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy || !listing.compatible}
              onClick={() => onInstall(listing, false)}
              className="inline-flex items-center gap-1.5 rounded-fq-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors disabled:opacity-60 cursor-pointer"
            >
              <Download className="size-4" />
              {installed
                ? "Reinstall / Update"
                : listing.price_minor_int === 0
                  ? "Install Free"
                  : "Install"}
            </button>

            {listing.trial_allowed &&
              listing.price_minor_int > 0 &&
              !installed && (
                <button
                  type="button"
                  disabled={busy || !listing.compatible}
                  onClick={() => onInstall(listing, true)}
                  className="rounded-fq-md border border-border px-3.5 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-60 cursor-pointer"
                >
                  14-Day Free Trial
                </button>
              )}

            {onDelete && (
              <button
                type="button"
                disabled={busy}
                onClick={onDelete}
                className="inline-flex items-center gap-1 rounded-fq-md border border-destructive/40 px-3.5 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-60 cursor-pointer"
              >
                <Trash2 className="size-4" /> Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
