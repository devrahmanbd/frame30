/**
 * Phase 15 — Appearance › Themes.
 *
 * Two modes on one route: the installed grid (with the trailing `+ Add theme`
 * cell) and the catalogue install screen. Details and Live preview are
 * overlays, so the browser back button is never the only way out.
 */
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Search } from "@/components/icons/tabler";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Card,
  CardSkeleton,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Page,
  btnGhost,
  btnPrimary,
  inputClass,
} from "@/components/console/kit";
import { useMerchant } from "@/hooks/use-merchant";
import {
  neighbourTheme,
  orderInstalled,
  searchInstalled,
  visibleCatalogue,
  visibleInstalled,
  type CatalogTheme,
  type InstalledTheme,
  type ThemesWorkspace,
} from "@/lib/themes/appearance";
import {
  themeActivateFn,
  themeCatalogFavouriteFn,
  themeDeleteFn,
  themeFlagsFn,
  themeInstallFn,
  themesWorkspaceFn,
} from "@/lib/themes/appearance.functions";
import { importThemeAllFn } from "@/lib/themes.functions";
import { AddThemeCard, ThemeCard } from "./ThemeCard";
import { ThemeDetailsModal } from "./ThemeDetailsModal";
import { AddThemeScreen } from "./AddThemeScreen";
import { ThemePreviewSplit, type PreviewSubject } from "./ThemePreviewSplit";
import { ThemeAssetsPanel } from "./ThemeAssetsPanel";
import { ImportDemoData } from "./import-demo-data";

type Mode = "installed" | "add" | "assets";

export function ThemesScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const merchant = useMerchant();
  const loadWorkspace = useServerFn(themesWorkspaceFn);

  const [mode, setMode] = useState<Mode>("installed");
  const [query, setQuery] = useState("");
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewSubject | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<InstalledTheme | null>(
    null,
  );
  const [busy, setBusy] = useState<string | null>(null);

  const workspace = useQuery<ThemesWorkspace>({
    queryKey: ["themes", "workspace"],
    queryFn: () => loadWorkspace({} as never),
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["themes", "workspace"] });
  }, [queryClient]);

  const installed = useMemo(
    () =>
      orderInstalled(
        searchInstalled(
          visibleInstalled(workspace.data?.installed ?? []),
          query,
        ),
      ),
    [workspace.data, query],
  );
  const catalogue = useMemo(
    () => visibleCatalogue(workspace.data?.catalogue ?? []),
    [workspace.data],
  );
  const details = installed.find((theme) => theme.id === detailsId) ?? null;
  const activeTheme = installed.find((theme) => theme.isActive) ?? null;

  const activate = useMutation({
    mutationFn: useServerFn(themeActivateFn),
    onMutate: (vars: { data: { id: string } }) => setBusy(vars.data.id),
    onSuccess: () => {
      toast.success("Theme activated");
      refresh();
    },
    onError: () => toast.error("That theme could not be activated"),
    onSettled: () => setBusy(null),
  });

  const install = useMutation({
    mutationFn: useServerFn(themeInstallFn),
    onMutate: (vars: { data: { key: string } }) => setBusy(vars.data.key),
    onSuccess: (result: { alreadyInstalled: boolean }) => {
      toast.success(
        result.alreadyInstalled
          ? "That theme is already installed"
          : "Theme installed",
      );
      refresh();
    },
    onError: () => toast.error("That theme could not be installed"),
    onSettled: () => setBusy(null),
  });

  const remove = useMutation({
    mutationFn: useServerFn(themeDeleteFn),
    onSuccess: () => {
      toast.success("Theme deleted");
      setDetailsId(null);
      refresh();
    },
    onError: () =>
      toast.error("Activate another theme before deleting this one"),
  });

  const flags = useMutation({
    mutationFn: useServerFn(themeFlagsFn),
    onSuccess: refresh,
    onError: () => toast.error("That change could not be saved"),
  });

  const favouriteCatalog = useMutation({
    mutationFn: useServerFn(themeCatalogFavouriteFn),
    onSuccess: refresh,
    onError: () => toast.error("That change could not be saved"),
  });

  const importDemo = useMutation({
    mutationFn: useServerFn(importThemeAllFn),
    onMutate: (vars: { data: { themeKey: string } }) =>
      setBusy(vars.data.themeKey),
    onSuccess: (result: { totalImported: number }) => {
      toast.success(
        result.totalImported > 0
          ? `Imported ${result.totalImported} content type${result.totalImported > 1 ? "s" : ""}`
          : "Demo content already present",
      );
      refresh();
    },
    onError: () => toast.error("That demo content could not be imported"),
    onSettled: () => setBusy(null),
  });

  const openCustomize = () =>
    void navigate({ to: "/dashboard/builder" as never });

  const previewInstalled = (theme: InstalledTheme) =>
    void navigate({
      to: "/dashboard/builder" as never,
      search: { preview_theme_id: theme.id } as never,
    });

  /** Opens the public blueprint preview route in a new tab. */
  const openBlueprintPreview = (theme: InstalledTheme) => {
    if (theme.key) {
      window.open(
        `/theme-preview/${theme.key}`,
        "_blank",
        "noopener,noreferrer",
      );
    }
  };

  const previewCatalog = (theme: CatalogTheme) =>
    setPreview({
      key: theme.key,
      name: theme.name,
      author: theme.author,
      version: theme.version,
      summary: theme.summary,
      rating: theme.rating > 0 ? theme.rating : undefined,
      installed: theme.installed,
      active: theme.active,
    });

  const stepPreview = (direction: -1 | 1) => {
    const pool: PreviewSubject[] = catalogue.map((theme) => ({
      key: theme.key,
      name: theme.name,
      author: theme.author,
      version: theme.version,
      summary: theme.summary,
      rating: theme.rating > 0 ? theme.rating : undefined,
      installed: theme.installed,
      active: theme.active,
    }));
    const current = pool.find((entry) => entry.key === preview?.key);
    if (!current) return;
    const next = neighbourTheme(pool, current, direction);
    if (next) setPreview(next);
  };

  const stepDetails = (direction: -1 | 1) => {
    if (!details) return;
    const next = neighbourTheme(installed, details, direction);
    if (next) setDetailsId(next.id);
  };

  // The live preview takes the whole screen, so the console behind it is
  // unmounted rather than merely covered — screen readers and axe both treat a
  // covered-but-present page as reachable content.
  if (preview) {
    return (
      <ThemePreviewSplit
        subject={preview}
        storeSlug={merchant.data?.slug ?? null}
        busy={busy === preview.key}
        onClose={() => setPreview(null)}
        onStep={stepPreview}
        onPrimary={() => {
          if (preview.active) {
            openCustomize();
            return;
          }
          const local = (workspace.data?.installed ?? []).find(
            (entry) => entry.key === preview.key,
          );
          if (local) activate.mutate({ data: { id: local.id } });
          else if (preview.key) install.mutate({ data: { key: preview.key } });
        }}
      />
    );
  }

  return (
    <Page
      title="Themes"
      description="Install, preview and activate the look of your storefront."
      actions={
        mode === "installed" ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btnGhost}
              onClick={() => setMode("assets")}
            >
              Custom CSS &amp; assets
            </button>
            <button
              type="button"
              className={btnPrimary}
              onClick={() => setMode("add")}
            >
              <Plus className="size-4" aria-hidden /> Add theme
            </button>
          </div>
        ) : null
      }
    >
      {workspace.isLoading ? (
        <CardSkeleton count={6} lines={3} />
      ) : workspace.isError ? (
        <ErrorState
          title="Themes could not be loaded"
          message="Your themes are safe — this was a read error."
          onRetry={() => {
            void workspace.refetch();
          }}
        />
      ) : mode === "assets" ? (
        <ThemeAssetsPanel
          installed={workspace.data?.installed ?? []}
          onBack={() => setMode("installed")}
        />
      ) : mode === "add" ? (
        <AddThemeScreen
          catalogue={catalogue}
          busyKey={busy}
          onBack={() => setMode("installed")}
          onInstall={(theme) => install.mutate({ data: { key: theme.key } })}
          onActivate={(theme) => {
            const local = (workspace.data?.installed ?? []).find(
              (entry) => entry.key === theme.key,
            );
            if (local) activate.mutate({ data: { id: local.id } });
          }}
          onPreview={previewCatalog}
          onToggleFavourite={(theme) =>
            favouriteCatalog.mutate({
              data: { key: theme.key, favourite: !theme.favourite },
            })
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium fq-sub">
              {installed.length} installed
            </span>
            <div className="relative ml-auto min-w-[200px] flex-1 sm:max-w-xs">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="Search installed themes"
                aria-label="Search installed themes"
                className={cn(inputClass, "min-h-11 pl-8")}
              />
            </div>
          </div>

          {installed.length === 0 ? (
            <EmptyState
              title={
                query
                  ? "No installed theme matches that search"
                  : "No themes installed yet"
              }
              description={
                query
                  ? "Clear the search to see everything installed on this store."
                  : "Install one of the official themes to give your storefront a starting point."
              }
              action={
                <button
                  type="button"
                  className={btnPrimary}
                  onClick={() => setMode("add")}
                >
                  Add theme
                </button>
              }
            />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {installed.map((theme) => (
                <li key={theme.id} className="space-y-2">
                  <ThemeCard
                    theme={theme}
                    busy={busy === theme.id}
                    onDetails={() => setDetailsId(theme.id)}
                    onActivate={() =>
                      activate.mutate({ data: { id: theme.id } })
                    }
                    onPreview={() => previewInstalled(theme)}
                    onCustomize={openCustomize}
                    onToggleFavourite={() =>
                      flags.mutate({
                        data: { id: theme.id, favourite: !theme.favourite },
                      })
                    }
                  />
                  {theme.key ? (
                    <button
                      type="button"
                      onClick={() => openBlueprintPreview(theme)}
                      className="w-full rounded-fq-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      Blueprint preview
                    </button>
                  ) : null}
                </li>
              ))}
              <li>
                <AddThemeCard onClick={() => setMode("add")} />
              </li>
            </ul>
          )}

          <Card title="How themes work">
            <p className="text-sm fq-sub">
              Activating a theme replaces your storefront layout with that
              theme&apos;s templates and colours. Switching themes never touches
              your content — but importing demo data overwrites any products,
              pages, posts or media with matching names, after an explicit
              confirmation listing every conflict. You can switch back at any
              time.
            </p>
          </Card>

          {activeTheme && activeTheme.key ? (
            <ImportDemoData
              themeKey={activeTheme.key}
              themeName={activeTheme.name}
              onImported={refresh}
            />
          ) : null}
        </div>
      )}

      {details ? (
        <ThemeDetailsModal
          theme={details}
          busy={busy === details.id}
          onClose={() => setDetailsId(null)}
          onStep={stepDetails}
          onActivate={() => activate.mutate({ data: { id: details.id } })}
          onPreview={() => {
            setDetailsId(null);
            previewInstalled(details);
          }}
          onCustomize={openCustomize}
          onDelete={() => setConfirmDelete(details)}
          onToggleAutoUpdate={(next) =>
            flags.mutate({ data: { id: details.id, autoUpdate: next } })
          }
          onImportDemo={() =>
            details.key &&
            importDemo.mutate({ data: { themeKey: details.key } })
          }
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={`Delete ${confirmDelete?.name ?? "theme"}?`}
        description="The theme is removed from this store. Your pages, posts and products stay exactly as they are."
        confirmLabel="Delete theme"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) remove.mutate({ data: { id: confirmDelete.id } });
          setConfirmDelete(null);
        }}
      />
    </Page>
  );
}
