import { useMemo, useRef, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Plus,
  Settings,
  Trash2,
  CheckCircle2,
  XCircle,
  ExternalLink,
  ShieldCheck,
  UploadCloud,
} from "@/components/icons/tabler";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import {
  MAX_PLUGIN_UPLOAD_BYTES,
  pluginApproveFn,
  pluginListFn,
  pluginSettingsSaveFn,
  pluginToggleFn,
  pluginAutoUpdatesFn,
  pluginUninstallFn,
  pluginUploadFn,
  validatePluginUpload,
  type PluginUploadInput,
  type PluginUploadResult,
} from "@/lib/plugins.functions";
import { approvalQueueFn } from "@/lib/approval-queue.functions";
import type { ApprovalQueue } from "@/lib/approval-queue.server";
import { formatBytes } from "@/lib/themes/appearance";
import { marketUninstallWidgetFn } from "@/lib/marketplace.functions";
import {
  satisfiesApiRange,
  type InstalledPlugin,
  type SettingsValues,
} from "@/lib/plugin-manifest";
import { PluginSettingsForm } from "./PluginSettingsForm";
import { PluginApprovalBadge } from "./PluginApproval";
import { ConfirmDialog } from "@/components/console/kit";

type InstallRef = { id: string; listing_slug: string; status: string };

/**
 * WordPress Plugins › Installed Plugins (`plugins.php`) Parity Desk.
 * Features: tabular view, Activate / Deactivate / Delete / Settings actions,
 * status filters (All, Active, Inactive), multi-select bulk operations, and
 * settings modal.
 */
export function InstalledApps({ installs = [] }: { installs?: InstallRef[] }) {
  const { t } = useLang();
  const qc = useQueryClient();
  const router = useRouter();
  const list = useServerFn(pluginListFn);
  const save = useServerFn(pluginSettingsSaveFn);
  const toggle = useServerFn(pluginToggleFn);
  const approve = useServerFn(pluginApproveFn);
  const loadQueue = useServerFn(approvalQueueFn);
  const autoUpdates = useServerFn(pluginAutoUpdatesFn);
  const uninstallWidget = useServerFn(marketUninstallWidgetFn);
  const uninstallPlugin = useServerFn(pluginUninstallFn);
  const uploadPlugin = useServerFn(pluginUploadFn);

  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("all");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<
    "activate" | "deactivate" | "delete" | ""
  >("");
  const [confirmDelete, setConfirmDelete] = useState<InstalledPlugin | null>(
    null,
  );
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [activeSettingsPlugin, setActiveSettingsPlugin] =
    useState<InstalledPlugin | null>(null);

  const pluginsQuery = useQuery({
    queryKey: ["admin", "plugins"],
    queryFn: () => list({}),
    staleTime: 30_000,
  });

  const queueQuery = useQuery<ApprovalQueue>({
    queryKey: ["admin", "plugins", "approval-queue"],
    queryFn: () => loadQueue({}),
    staleTime: 30_000,
  });

  const allPlugins = useMemo(
    () => pluginsQuery.data?.plugins ?? [],
    [pluginsQuery.data?.plugins],
  );
  const queueByPlugin = useMemo(() => {
    const map = new Map<
      string,
      { manifestVersion: string; findings: { code: string }[] }
    >();
    for (const entry of queueQuery.data?.plugins ?? [])
      map.set(entry.pluginId, entry);
    return map;
  }, [queueQuery.data]);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin", "plugins"] });
    qc.invalidateQueries({ queryKey: ["admin", "plugins", "approval-queue"] });
    void router.invalidate();
  };
  const liveInstallFor = (pluginId: string) =>
    installs.find((i) => i.listing_slug === pluginId && isLiveStatus(i.status));

  const filteredPlugins = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allPlugins.filter((p) => {
      if (statusFilter === "active" && !p.enabled) return false;
      if (statusFilter === "inactive" && p.enabled) return false;
      if (q && !p.manifest.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allPlugins, statusFilter, query]);

  const toggleMutation = useMutation({
    mutationFn: (vars: { pluginId: string; enabled: boolean }) =>
      toggle({ data: vars }),
    onSuccess: (_, vars) => {
      toast.success(
        vars.enabled
          ? t("Plugin activated", "প্লাগইন সক্রিয় করা হয়েছে")
          : t("Plugin deactivated", "প্লাগইন নিষ্ক্রিয় করা হয়েছে"),
      );
      refresh();
    },
    onError: () =>
      toast.error(
        t("Failed to update plugin state", "প্লাগইন আপডেট করা যায়নি"),
      ),
  });

  /**
   * Threat-defense approval lane: flagged installs badge through
   * `approvalQueueFn` and approve here via the existing `pluginApproveFn`,
   * then refresh so the badge clears.
   */
  const approveMutation = useMutation({
    mutationFn: (vars: { pluginId: string; manifestVersion: string }) =>
      approve({ data: vars }),
    onSuccess: () => {
      toast.success(t("Plugin approved", "প্লাগইন অনুমোদিত হয়েছে"));
      refresh();
    },
    onError: () =>
      toast.error(t("Failed to approve plugin", "প্লাগইন অনুমোদন করা যায়নি")),
  });

  const autoUpdatesMutation = useMutation({
    mutationFn: (vars: { pluginId: string; enabled: boolean }) =>
      autoUpdates({ data: vars }),
    onSuccess: (_, vars) => {
      toast.success(
        vars.enabled
          ? t("Auto-updates enabled", "স্বয়ংক্রিয় আপডেট চালু হয়েছে")
          : t("Auto-updates disabled", "স্বয়ংক্রিয় আপডেট বন্ধ হয়েছে"),
      );
      refresh();
    },
    onError: () =>
      toast.error(
        t("Failed to update auto-updates", "স্বয়ংক্রিয় আপডেট বদলানো যায়নি"),
      ),
  });

  const uninstallMutation = useMutation({
    mutationFn: async (pluginId: string) => {
      const install = liveInstallFor(pluginId);
      if (install) {
        return uninstallWidget({ data: { installId: install.id } });
      }
      return uninstallPlugin({ data: { pluginId } });
    },
    onSuccess: () => {
      toast.success(
        t("Plugin deleted successfully", "প্লাগইন সফলভাবে মুছে ফেলা হয়েছে"),
      );
      setConfirmDelete(null);
      setConfirmBulkDelete(false);
      setSelectedIds(new Set());
      refresh();
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error ? err.message : "Failed to delete plugin";
      toast.error(msg);
      setConfirmDelete(null);
      setConfirmBulkDelete(false);
    },
  });

  // PLUGIN UPLOAD lane: wires the drop-zone below to the server upload path
  // (`pluginUploadFn` → `installUploadedPlugin` → pipeline install + host
  // projection). Uploads land rendered and toggleable where Activate /
  // Deactivate / Delete already work.
  const uploadMutation = useMutation({
    mutationFn: (vars: PluginUploadInput) =>
      uploadPlugin({ data: vars }) as Promise<PluginUploadResult>,
    onSuccess: (result) => {
      toast.success(
        result.alreadyInstalled
          ? t("That plugin is already installed", "সেই প্লাগইন আগেই ইনস্টল আছে")
          : t(
              "Plugin uploaded — find it in the list below",
              "প্লাগইন আপলোড হয়েছে — নিচের তালিকায় দেখুন",
            ),
      );
      refresh();
    },
    onError: () =>
      toast.error(
        t(
          "That plugin could not be uploaded",
          "সেই প্লাগইন আপলোড করা যায়নি",
        ),
      ),
  });

  async function onSaveSettings(pluginId: string, values: SettingsValues) {
    try {
      await save({ data: { pluginId, values } });
      toast.success(t("Settings saved", "সেটিং সেভ হয়েছে"));
      setActiveSettingsPlugin(null);
      refresh();
    } catch {
      toast.error(t("Could not save settings", "সেটিং সেভ করা যায়নি"));
    }
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredPlugins.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredPlugins.map((p) => p.manifest.id)));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  async function handleApplyBulk() {
    if (!bulkAction || selectedIds.size === 0) return;

    if (bulkAction === "delete") {
      setConfirmBulkDelete(true);
      return;
    }

    const ids = [...selectedIds];
    const enabled = bulkAction === "activate";
    let ok = 0;
    try {
      for (const id of ids) {
        try {
          await toggle({ data: { pluginId: id, enabled } });
          ok += 1;
        } catch {
          // Per-row isolation: one bad row never aborts the batch.
        }
      }
      if (ok === ids.length) {
        toast.success(
          enabled
            ? t(
                "Selected plugins activated",
                "নির্বাচিত প্লাগইন সক্রিয় হয়েছে",
              )
            : t(
                "Selected plugins deactivated",
                "নির্বাচিত প্লাগইন নিষ্ক্রিয় হয়েছে",
              ),
        );
      } else if (ok === 0) {
        toast.error(t("Bulk action failed", "বাল্ক অ্যাকশন ব্যর্থ হয়েছে"));
      } else {
        toast.warning(
          t(
            "Bulk action partially applied.",
            "বাল্ক অ্যাকশন আংশিক প্রয়োগ হয়েছে।",
          ) + ` ${ok}/${ids.length}`,
        );
      }
      setSelectedIds(new Set());
      setBulkAction("");
      refresh();
    } catch {
      toast.error(t("Bulk action failed", "বাল্ক অ্যাকশন ব্যর্থ হয়েছে"));
    }
  }

  const activeCount = allPlugins.filter((p) => p.enabled).length;
  const inactiveCount = allPlugins.filter((p) => !p.enabled).length;

  return (
    <section className="space-y-4">
      {/* Header & Add New Action */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-bangla-display text-xl font-bold text-foreground">
            {t("Plugins", "প্লাগইনসমূহ")}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t(
              "Extend your storefront and admin capabilities with verified Framique apps.",
              "ভেরিফায়েড ফ্রেমিক অ্যাপের মাধ্যমে আপনার স্টোরের কার্যক্ষমতা বাড়ান।",
            )}
          </p>
        </div>

        <Link
          to="/dashboard/marketplace"
          search={{ tab: "plugin" }}
          className="inline-flex items-center gap-1.5 rounded-fq-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors"
        >
          <Plus className="size-4" />
          <span>{t("Add New Plugin", "নতুন প্লাগইন যোগ করুন")}</span>
        </Link>
      </div>

      {/* Upload plugin (ZIP lane): validated drop-zone → server pipeline. */}
      <PluginUploadDropzone
        onUploadPlugin={(input) => uploadMutation.mutateAsync(input)}
      />

      {/* Filter Tabs & Bulk Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        {/* Search */}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("Search plugins", "প্লাগইন খুঁজুন")}
          aria-label={t("Search plugins", "প্লাগইন খুঁজুন")}
          className="rounded-fq-md border border-border bg-background px-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {/* Status Filters */}
        <div className="flex items-center rounded-fq-md border border-border bg-muted/30 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`rounded-fq-sm px-2.5 py-1 font-medium transition-colors ${
              statusFilter === "all"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("All", "সব")} ({allPlugins.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("active")}
            className={`rounded-fq-sm px-2.5 py-1 font-medium transition-colors ${
              statusFilter === "active"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("Active", "সক্রিয়")} ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("inactive")}
            className={`rounded-fq-sm px-2.5 py-1 font-medium transition-colors ${
              statusFilter === "inactive"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("Inactive", "নিষ্ক্রিয়")} ({inactiveCount})
          </button>
        </div>

        {/* Bulk Action Controls */}
        <div className="flex items-center gap-2">
          <select
            value={bulkAction}
            onChange={(e) =>
              setBulkAction(
                e.target.value as "activate" | "deactivate" | "delete" | "",
              )
            }
            aria-label={t("Bulk actions", "বাল্ক অ্যাকশন")}
            className="rounded-fq-md border border-border bg-background px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">{t("Bulk actions", "বাল্ক অ্যাকশন")}</option>
            <option value="activate">{t("Activate", "সক্রিয় করুন")}</option>
            <option value="deactivate">
              {t("Deactivate", "নিষ্ক্রিয় করুন")}
            </option>
            <option value="delete">{t("Delete", "মুছে ফেলুন")}</option>
          </select>
          <button
            type="button"
            onClick={handleApplyBulk}
            disabled={!bulkAction || selectedIds.size === 0}
            className="rounded-fq-md border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-40 transition-colors cursor-pointer"
          >
            {t("Apply", "প্রয়োগ")}
          </button>
        </div>
      </div>

      {/* Installed Plugins Table */}
      <div className="overflow-x-auto rounded-fq-lg border border-border bg-card shadow-xs">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="w-10 px-3.5 py-3">
                <input
                  type="checkbox"
                  checked={
                    filteredPlugins.length > 0 &&
                    selectedIds.size === filteredPlugins.length
                  }
                  onChange={toggleSelectAll}
                  aria-label={t(
                    "Select all plugins",
                    "সব প্লাগইন নির্বাচন করুন",
                  )}
                  className="rounded border-border text-primary focus:ring-primary"
                />
              </th>
              <th className="px-3.5 py-3 min-w-[14rem]">
                {t("Plugin", "প্লাগইন")}
              </th>
              <th className="px-3.5 py-3">{t("Description", "বিবরণ")}</th>
              <th className="px-3.5 py-3 w-28 text-center">
                {t("Auto-updates", "স্বয়ংক্রিয় আপডেট")}
              </th>
              <th className="px-3.5 py-3 w-28 text-center">
                {t("Status", "স্ট্যাটাস")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {filteredPlugins.map((plugin) => {
              const compatible = satisfiesApiRange(plugin.manifest.api);
              const isChecked = selectedIds.has(plugin.manifest.id);
              const approval = queueByPlugin.get(plugin.manifest.id);

              return (
                <tr
                  key={plugin.manifest.id}
                  className={`transition-colors hover:bg-muted/20 ${
                    plugin.enabled ? "bg-primary/[0.02]" : "bg-card"
                  }`}
                >
                  <td className="px-3.5 py-4 align-top">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleSelectOne(plugin.manifest.id)}
                      aria-label={`Select ${plugin.manifest.name}`}
                      className="rounded border-border text-primary focus:ring-primary mt-1"
                    />
                  </td>

                  <td className="px-3.5 py-4 align-top">
                    <div className="font-semibold text-foreground text-sm">
                      {plugin.manifest.name}
                    </div>

                    {!compatible && (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                        ⚠️ {t("Needs API update", "এপিআই আপডেট প্রয়োজন")}
                      </p>
                    )}

                    {approval ? (
                      <PluginApprovalBadge
                        findings={approval.findings}
                        busy={approveMutation.isPending}
                        onApprove={() =>
                          approveMutation.mutate({
                            pluginId: plugin.manifest.id,
                            manifestVersion: approval.manifestVersion,
                          })
                        }
                      />
                    ) : null}

                    {/* WP Action Links: Activate | Deactivate | Settings | Delete */}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      {plugin.enabled ? (
                        <button
                          type="button"
                          onClick={() =>
                            toggleMutation.mutate({
                              pluginId: plugin.manifest.id,
                              enabled: false,
                            })
                          }
                          disabled={toggleMutation.isPending}
                          className="font-medium text-amber-600 hover:underline dark:text-amber-400 cursor-pointer"
                        >
                          {t("Deactivate", "নিষ্ক্রিয়")}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            toggleMutation.mutate({
                              pluginId: plugin.manifest.id,
                              enabled: true,
                            })
                          }
                          disabled={toggleMutation.isPending}
                          className="font-medium text-primary hover:underline cursor-pointer"
                        >
                          {t("Activate", "সক্রিয়")}
                        </button>
                      )}

                      {plugin.manifest.settings && (
                        <>
                          <span className="text-border">|</span>
                          <button
                            type="button"
                            onClick={() => setActiveSettingsPlugin(plugin)}
                            className="font-medium text-muted-foreground hover:text-foreground cursor-pointer"
                          >
                            {t("Settings", "সেটিংস")}
                          </button>
                        </>
                      )}

                      {!plugin.enabled && (
                        <>
                          <span className="text-border">|</span>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(plugin)}
                            disabled={uninstallMutation.isPending}
                            className="font-medium text-destructive hover:underline cursor-pointer"
                          >
                            {t("Delete", "মুছে ফেলুন")}
                          </button>
                        </>
                      )}
                    </div>
                  </td>

                  <td className="px-3.5 py-4 align-top">
                    <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
                      {plugin.manifest.description ||
                        t("No description provided.", "কোনো বিবরণ নেই।")}
                    </p>
                    <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground font-mono">
                      <span>v{plugin.manifest.version}</span>
                      <span>
                        By{" "}
                        {typeof plugin.manifest.author === "string"
                          ? plugin.manifest.author
                          : (plugin.manifest.author?.name ??
                            "Framique Contributor")}
                      </span>
                      {plugin.manifest.homepage && (
                        <>
                          <span>·</span>
                          <a
                            href={plugin.manifest.homepage}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline flex items-center gap-0.5"
                          >
                            <span>Visit site</span>
                            <ExternalLink className="size-2.5" />
                          </a>
                        </>
                      )}
                    </div>
                  </td>

                  <td className="px-3.5 py-4 align-top text-center">
                    <input
                      type="checkbox"
                      checked={plugin.autoUpdates === true}
                      onChange={(e) =>
                        autoUpdatesMutation.mutate({
                          pluginId: plugin.manifest.id,
                          enabled: e.target.checked,
                        })
                      }
                      disabled={autoUpdatesMutation.isPending}
                      aria-label={t("Auto-updates", "স্বয়ংক্রিয় আপডেট")}
                      className="rounded border-border text-primary focus:ring-primary mt-1"
                    />
                  </td>

                  <td className="px-3.5 py-4 align-top text-center">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        plugin.enabled
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {plugin.enabled ? (
                        <>
                          <CheckCircle2 className="size-3" />
                          <span>{t("Active", "সক্রিয়")}</span>
                        </>
                      ) : (
                        <span>{t("Inactive", "নিষ্ক্রিয়")}</span>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}

            {filteredPlugins.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="p-8 text-center text-sm text-muted-foreground"
                >
                  {t(
                    "No plugins match the selected criteria.",
                    "কোনো প্লাগইন পাওয়া যায়নি।",
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom Bulk Actions Bar (mirrors the top bar) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {t(`${selectedIds.size} selected`, `${selectedIds.size}টি নির্বাচিত`)}
        </p>
        <div className="flex items-center gap-2">
          <select
            value={bulkAction}
            onChange={(e) =>
              setBulkAction(
                e.target.value as "activate" | "deactivate" | "delete" | "",
              )
            }
            aria-label={t("Bulk actions", "বাল্ক অ্যাকশন")}
            className="rounded-fq-md border border-border bg-background px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">{t("Bulk actions", "বাল্ক অ্যাকশন")}</option>
            <option value="activate">{t("Activate", "সক্রিয় করুন")}</option>
            <option value="deactivate">
              {t("Deactivate", "নিষ্ক্রিয় করুন")}
            </option>
            <option value="delete">{t("Delete", "মুছে ফেলুন")}</option>
          </select>
          <button
            type="button"
            onClick={handleApplyBulk}
            disabled={!bulkAction || selectedIds.size === 0}
            className="rounded-fq-md border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-40 transition-colors cursor-pointer"
          >
            {t("Apply", "প্রয়োগ")}
          </button>
        </div>
      </div>

      {/* Settings Modal Drawer */}
      {activeSettingsPlugin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          role="presentation"
          onClick={() => setActiveSettingsPlugin(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${activeSettingsPlugin.manifest.name} Settings`}
            className="w-full max-w-lg rounded-fq-lg border border-border bg-card p-6 shadow-xl animate-in fade-in-0 zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                <Settings className="size-4 text-primary" />
                <span>{activeSettingsPlugin.manifest.name} Settings</span>
              </h3>
              <button
                type="button"
                onClick={() => setActiveSettingsPlugin(null)}
                className="rounded-fq-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="mt-4">
              <PluginSettingsForm
                plugin={activeSettingsPlugin}
                onSave={(values) =>
                  onSaveSettings(activeSettingsPlugin.manifest.id, values)
                }
                onToggle={async (enabled) => {
                  await toggle({
                    data: {
                      pluginId: activeSettingsPlugin.manifest.id,
                      enabled,
                    },
                  });
                  refresh();
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Single Plugin Delete Confirm Dialog */}
      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={t(
          `Delete ${confirmDelete?.manifest.name ?? "plugin"}?`,
          `${confirmDelete?.manifest.name ?? "প্লাগইন"} কি মুছে ফেলবেন?`,
        )}
        description={t(
          "This plugin and its stored configuration will be completely removed from your store. Are you sure?",
          "এই প্লাগইন এবং এর কনফিগারেশন স্থায়ীভাবে মুছে ফেলা হবে। আপনি কি নিশ্চিত?",
        )}
        confirmLabel={t("Delete Plugin", "প্লাগইন মুছুন")}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) {
            uninstallMutation.mutate(confirmDelete.manifest.id);
          }
        }}
      />

      {/* Bulk Delete Confirm Dialog */}
      <ConfirmDialog
        open={confirmBulkDelete}
        title={t(
          "Delete selected plugins?",
          "নির্বাচিত প্লাগইনগুলো কি মুছবেন?",
        )}
        description={t(
          `You are about to permanently delete ${selectedIds.size} plugins and their configurations. This action cannot be undone.`,
          `আপনি ${selectedIds.size}টি প্লাগইন স্থায়ীভাবে মুছে ফেলতে চলেছেন। এই কাজটি ফিরিয়ে নেওয়া যাবে না।`,
        )}
        confirmLabel={t("Delete Selected", "নির্বাচিত মুছুন")}
        onCancel={() => setConfirmBulkDelete(false)}
        onConfirm={async () => {
          const ids = [...selectedIds];
          let ok = 0;
          for (const id of ids) {
            try {
              const install = liveInstallFor(id);
              if (install) {
                await uninstallWidget({ data: { installId: install.id } });
              } else {
                await uninstallPlugin({ data: { pluginId: id } });
              }
              ok += 1;
            } catch {
              // Per-row isolation: one bad row never aborts the batch.
            }
          }
          if (ok === ids.length) {
            toast.success(
              t(
                "Selected plugins deleted",
                "নির্বাচিত প্লাগইন মুছে ফেলা হয়েছে",
              ),
            );
          } else if (ok === 0) {
            toast.error(t("Bulk delete failed", "বাল্ক মোছা ব্যর্থ হয়েছে"));
          } else {
            toast.warning(
              t(
                "Bulk delete partially applied.",
                "বাল্ক মোছা আংশিক প্রয়োগ হয়েছে।",
              ) + ` ${ok}/${ids.length}`,
            );
          }
          setConfirmBulkDelete(false);
          setSelectedIds(new Set());
          setBulkAction("");
          refresh();
        }}
      />
    </section>
  );
}

function isLiveStatus(status: string) {
  return status === "installed" || status === "trial" || status === "paused";
}

/**
 * PLUGIN UPLOAD lane: validated `.zip` files upload through the server path
 * (`pluginUploadFn` → `installUploadedPlugin` → pipeline install + host
 * projection) instead of stopping at client messaging. Without
 * `onUploadPlugin` the drop-zone keeps its validation-only message.
 * Mirrors the theme `UploadDropzone` in `AddThemeScreen` (read-only
 * template): per-pick idempotency key, uploading/success/replay/error
 * states, input reset so re-picking the same file re-fires.
 */
function PluginUploadDropzone({
  onUploadPlugin,
}: {
  onUploadPlugin?: (input: PluginUploadInput) => Promise<PluginUploadResult>;
}) {
  const { t } = useLang();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<
    | { ok: true; message: string }
    | { ok: false; message: string }
    | { ok: "busy"; message: string }
    | null
  >(null);
  const [over, setOver] = useState(false);

  const readAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("read_failed"));
      reader.onload = () => {
        const url = String(reader.result ?? "");
        const comma = url.indexOf(",");
        resolve(comma >= 0 ? url.slice(comma + 1) : url);
      };
      reader.readAsDataURL(file);
    });

  const accept = (file: File | undefined) => {
    if (!file) return;
    const check = validatePluginUpload(file);
    if (!check.ok) {
      setState({ ok: false, message: check.reason });
      return;
    }
    if (!onUploadPlugin) {
      setState({
        ok: true,
        message: `${check.name} (${formatBytes(file.size)}) ${t(
          "is ready. Plugin packaging installs land with the extension directory.",
          "প্রস্তুত।",
        )}`,
      });
      return;
    }
    // One idempotency key per file-pick, held across retries/double-clicks —
    // the server replays the original install instead of stacking duplicates.
    const picked = { name: file.name, size: file.size };
    const idempotencyKey =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setState({
      ok: "busy",
      message: `${t("Uploading", "আপলোড হচ্ছে")} ${picked.name} (${formatBytes(picked.size)})…`,
    });
    void readAsBase64(file).then(
      (fileBase64) =>
        onUploadPlugin({
          fileName: picked.name,
          fileBase64,
          idempotencyKey,
        }).then(
          (result) => {
            setState({
              ok: true,
              message: result.alreadyInstalled
                ? t(
                    `${picked.name} is already installed — find it in the list below.`,
                    `${picked.name} আগেই ইনস্টল আছে — নিচের তালিকায় দেখুন।`,
                  )
                : t(
                    `${picked.name} installed — find it in the list below, ready to activate.`,
                    `${picked.name} ইনস্টল হয়েছে — নিচের তালিকায় দেখুন।`,
                  ),
            });
          },
          () => {
            setState({
              ok: false,
              message: t(
                `${picked.name} could not be uploaded. Check the file is a valid plugin .zip and try again.`,
                `${picked.name} আপলোড করা যায়নি। ফাইলটি বৈধ প্লাগইন .zip কিনা দেখুন।`,
              ),
            });
          },
        ),
      () => {
        setState({
          ok: false,
          message: t(
            `${picked.name} could not be read in this browser. Try again.`,
            `${picked.name} এই ব্রাউজারে পড়া যায়নি। আবার চেষ্টা করুন।`,
          ),
        });
      },
    );
  };

  const busy = state?.ok === "busy";

  return (
    <div className="space-y-2 rounded-fq-lg border border-border bg-card p-3.5 shadow-xs">
      <h2 className="text-sm font-semibold text-foreground">
        {t("Upload plugin", "প্লাগইন আপলোড")}
      </h2>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          accept(event.dataTransfer.files?.[0]);
        }}
        className={`grid place-items-center gap-2 rounded-fq-md border border-dashed px-6 py-8 text-center transition-colors ${
          over ? "border-primary bg-primary/5" : "border-border bg-muted/20"
        }`}
      >
        <UploadCloud className="size-6 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium text-foreground">
          {t("Drop your plugin .zip here", "প্লাগইন .zip এখানে দিন")}
        </p>
        <p className="text-xs text-muted-foreground">
          {t(
            `Maximum size ${formatBytes(MAX_PLUGIN_UPLOAD_BYTES)}`,
            `সর্বোচ্চ ${formatBytes(MAX_PLUGIN_UPLOAD_BYTES)}`,
          )}
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="rounded-fq-md border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-40 transition-colors cursor-pointer"
        >
          {busy
            ? t("Uploading…", "আপলোড হচ্ছে…")
            : t("Select file", "ফাইল নির্বাচন")}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".zip"
          className="sr-only"
          aria-label={t("Plugin package", "প্লাগইন প্যাকেজ")}
          disabled={busy}
          onChange={(event) => {
            accept(event.currentTarget.files?.[0] ?? undefined);
            // Reset so picking the same file again re-fires the upload.
            event.currentTarget.value = "";
          }}
        />
      </div>
      {state ? (
        state.ok === true || state.ok === "busy" ? (
          <p
            className="rounded-fq-md border border-border bg-muted px-3 py-2 text-sm text-foreground"
            aria-live="polite"
          >
            {state.message}
          </p>
        ) : (
          <p
            className="rounded-fq-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {state.message}
          </p>
        )
      ) : null}
    </div>
  );
}
