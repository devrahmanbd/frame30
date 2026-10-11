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
  galleryKeys,
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
  themeApproveFn,
  themeCatalogFavouriteFn,
  themeDeleteFn,
  themeFlagsFn,
  themeInstallFn,
  themesWorkspaceFn,
} from "@/lib/themes/appearance.functions";
import { approvalQueueFn } from "@/lib/approval-queue.functions";
import type { ApprovalQueue } from "@/lib/approval-queue.server";
import { importThemeAllFn } from "@/lib/themes.functions";
import { themeUploadFn } from "@/lib/marketplace.functions";
import { AddThemeCard, ThemeCard } from "./ThemeCard";
import { ThemeApprovalBadge } from "./ThemeApproval";
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
  const loadQueue = useServerFn(approvalQueueFn);

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

  const queue = useQuery<ApprovalQueue>({
    queryKey: ["themes", "approval-queue"],
    queryFn: () => loadQueue({} as never),
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["themes", "workspace"] });
    void queryClient.invalidateQueries({
      queryKey: ["themes", "approval-queue"],
    });
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
  const queueByTheme = useMemo(() => {
    const map = new Map<
      string,
      { versionId: string; findings: { code: string }[] }
    >();
    for (const entry of queue.data?.themes ?? []) map.set(entry.themeId, entry);
    return map;
  }, [queue.data]);

  /**
   * Preview gallery: source keys plus merchant-installed package keys as one
   * union (catalogue order first, installed-only keys after). Installed rows
   * hidden from the grid by curation still resolve via direct URL, so they
   * are listed here with a preview link instead of being unreachable.
   * galleryKeys skips null/blank keys — the list never throws on legacy rows.
   */
  const gallery = useMemo(
    () =>
      galleryKeys(
        (workspace.data?.catalogue ?? []).map((theme) => theme.key),
        (workspace.data?.installed ?? []).map((theme) => theme.key),
      ),
    [workspace.data],
  );
  const galleryMeta = useMemo(() => {
    const installedByKey = new Map<string, InstalledTheme>();
    for (const theme of workspace.data?.installed ?? []) {
      if (theme.key && !installedByKey.has(theme.key))
        installedByKey.set(theme.key, theme);
    }
    const catalogByKey = new Map<string, CatalogTheme>();
    for (const theme of workspace.data?.catalogue ?? []) {
      if (!catalogByKey.has(theme.key)) catalogByKey.set(theme.key, theme);
    }
    return { installedByKey, catalogByKey };
  }, [workspace.data]);

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

  /**
   * Threat-defense approval lane: flagged installed themes badge through
   * `approvalQueueFn` and approve here via the existing `themeApproveFn`,
   * then refresh both queries so the badge clears.
   */
  const approve = useMutation({
    mutationFn: useServerFn(themeApproveFn),
    onMutate: (vars: { data: { themeId: string; versionId: string } }) =>
      setBusy(vars.data.themeId),
    onSuccess: () => {
      toast.success("Theme approved");
      refresh();
    },
    onError: () => toast.error("That theme could not be approved"),
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

  /**
   * LIFECYCLE lane: wires the Add-theme drop-zone to the server upload path
   * (`themeUploadFn` → `installUploadedTheme`). Uploads land as inactive rows
   * where Activate / Preview / Delete already work — the drop-zone is no
   * longer validation messaging only.
   */
  const upload = useMutation({
    mutationFn: useServerFn(themeUploadFn),
    onSuccess: (result: { alreadyInstalled: boolean }) => {
      toast.success(
        result.alreadyInstalled
          ? "That theme is already installed"
          : "Theme uploaded — find it under Installed themes",
      );
      refresh();
    },
    onError: () => toast.error("That theme could not be uploaded"),
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
          onUploadTheme={(input) => upload.mutateAsync({ data: input })}
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
              {installed.map((theme) => {
                const approval = queueByTheme.get(theme.id);
                return (
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
                    {approval ? (
                      <ThemeApprovalBadge
                        findings={approval.findings}
                        busy={busy === theme.id}
                        onApprove={() =>
                          approve.mutate({
                            data: {
                              themeId: theme.id,
                              versionId: approval.versionId,
                            },
                          })
                        }
                      />
                    ) : null}
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
                );
              })}
              <li>
                <AddThemeCard onClick={() => setMode("add")} />
              </li>
            </ul>
          )}

          {gallery.length > 0 ? (
            <Card title="Theme gallery">
              <p className="text-sm fq-sub">
                Every previewable theme in one place — official sources plus
                your installed packages. Removed themes disappear from this list
                automatically.
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {gallery.map((key) => {
                  const local = galleryMeta.installedByKey.get(key);
                  const catalog = galleryMeta.catalogByKey.get(key);
                  const label = local?.name ?? catalog?.name ?? key;
                  return (
                    <li key={key}>
                      <a
                        href={`/theme-preview/${key}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                      >
                        {label}
                        <span className="rounded-full bg-muted px-1.5 text-[11px] font-medium fq-sub">
                          {local ? "Installed" : "Source"}
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}

          <Card title="How themes work">
            {" "}
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
