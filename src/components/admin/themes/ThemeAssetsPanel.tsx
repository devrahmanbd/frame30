/**
 * Phase 17 — Appearance › Themes › Custom CSS & assets.
 *
 * A merchant writes CSS or colour-token overrides here, scopes them to one
 * installed theme or to every theme, and switches them on and off without
 * deleting them. Everything is sanitised on the way in (client) and again on
 * the way out (server), so a bad paste can never execute on the storefront.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Check, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Card,
  CardSkeleton,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  btnGhost,
  btnPrimary,
  inputClass,
} from "@/components/console/kit";
import {
  ASSET_KIND_LABEL,
  MAX_CSS_BYTES,
  assetSummary,
  cssStats,
  formatAssetBytes,
  sanitiseThemeCss,
  sortAssets,
  validateCss,
  validateTokens,
  type ThemeAsset,
  type ThemeAssetKind,
} from "@/lib/themes/assets";
import {
  themeAssetDeleteFn,
  themeAssetSaveFn,
  themeAssetToggleFn,
  themeAssetsFn,
} from "@/lib/themes/assets.functions";
import type { InstalledTheme } from "@/lib/themes/appearance";

type Draft = {
  id: string | null;
  kind: ThemeAssetKind;
  name: string;
  themeId: string | null;
  content: string;
  enabled: boolean;
};

const newDraft = (kind: ThemeAssetKind): Draft => ({
  id: null,
  kind,
  name: kind === "css" ? "Custom CSS" : "Colour tokens",
  themeId: null,
  content:
    kind === "css"
      ? "/* Your CSS overrides the theme, e.g.\n.fq-hero { padding-block: 64px; }\n*/\n"
      : '{\n  "color-primary": "#1877f2"\n}\n',
  enabled: true,
});

const toDraft = (asset: ThemeAsset): Draft => ({
  id: asset.id,
  kind: asset.kind,
  name: asset.name,
  themeId: asset.themeId,
  content: asset.content ?? "",
  enabled: asset.enabled,
});

export function ThemeAssetsPanel({
  installed,
  onBack,
}: {
  installed: InstalledTheme[];
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(themeAssetsFn);
  const assets = useQuery<ThemeAsset[]>({
    queryKey: ["theme-assets"],
    queryFn: () => load({} as never),
  });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ThemeAsset | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["theme-assets"] });
  };

  const save = useMutation({
    mutationFn: useServerFn(themeAssetSaveFn),
    onSuccess: () => {
      toast.success("Saved. Your storefront picks this up on the next page load.");
      setDraft(null);
      refresh();
    },
    onError: () => toast.error("That change could not be saved"),
  });

  const toggle = useMutation({
    mutationFn: useServerFn(themeAssetToggleFn),
    onSuccess: refresh,
    onError: () => toast.error("That change could not be saved"),
  });

  const remove = useMutation({
    mutationFn: useServerFn(themeAssetDeleteFn),
    onSuccess: () => {
      toast.success("Deleted");
      setConfirmDelete(null);
      refresh();
    },
    onError: () => toast.error("That asset could not be deleted"),
  });

  const list = useMemo(() => sortAssets(assets.data ?? []), [assets.data]);

  if (assets.isLoading) return <CardSkeleton count={3} lines={4} />;
  if (assets.isError)
    return (
      <ErrorState
        title="Assets could not be loaded"
        message="Your custom CSS is safe — this was a read error."
        onRetry={() => {
          void assets.refetch();
        }}
      />
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btnGhost} onClick={onBack}>
          Back to themes
        </button>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            className={btnGhost}
            onClick={() => setDraft(newDraft("tokens"))}
          >
            <Plus className="size-4" aria-hidden /> Colour tokens
          </button>
          <button type="button" className={btnPrimary} onClick={() => setDraft(newDraft("css"))}>
            <Plus className="size-4" aria-hidden /> Custom CSS
          </button>
        </div>
      </div>

      {draft ? (
        <AssetEditor
          draft={draft}
          installed={installed}
          busy={save.isPending}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSave={(next) =>
            save.mutate({
              data: {
                id: next.id,
                themeId: next.themeId,
                kind: next.kind,
                name: next.name,
                content: next.content,
                enabled: next.enabled,
              },
            })
          }
        />
      ) : null}

      {list.length === 0 && !draft ? (
        <EmptyState
          title="No custom CSS yet"
          description="Add a stylesheet or a set of colour tokens to fine-tune the theme you activated."
          action={
            <button type="button" className={btnPrimary} onClick={() => setDraft(newDraft("css"))}>
              Add custom CSS
            </button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {list.map((asset) => (
            <li key={asset.id}>
              <Card>
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{asset.name}</p>
                    <p className="mt-0.5 text-xs fq-sub">
                      {ASSET_KIND_LABEL[asset.kind].en} · {assetSummary(asset)} ·{" "}
                      {asset.themeId
                        ? (installed.find((theme) => theme.id === asset.themeId)?.name ??
                          "Removed theme")
                        : "Every theme"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex min-h-11 items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        className="size-[18px] accent-[var(--color-primary)]"
                        checked={asset.enabled}
                        onChange={(event) =>
                          toggle.mutate({
                            data: { id: asset.id, enabled: event.currentTarget.checked },
                          })
                        }
                      />
                      Enabled
                    </label>
                    <button
                      type="button"
                      className={btnGhost}
                      onClick={() => setDraft(toDraft(asset))}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className={cn(btnGhost, "text-destructive")}
                      onClick={() => setConfirmDelete(asset)}
                    >
                      <Trash2 className="size-4" aria-hidden /> Delete
                    </button>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        destructive
        title={`Delete ${confirmDelete?.name ?? "asset"}?`}
        description="The storefront stops using it immediately. This cannot be undone."
        confirmLabel="Delete"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) remove.mutate({ data: { id: confirmDelete.id } });
        }}
      />
    </div>
  );
}

function AssetEditor({
  draft,
  installed,
  busy,
  onChange,
  onCancel,
  onSave,
}: {
  draft: Draft;
  installed: InstalledTheme[];
  busy: boolean;
  onChange: (draft: Draft) => void;
  onCancel: () => void;
  onSave: (draft: Draft) => void;
}) {
  const [touched, setTouched] = useState(false);
  useEffect(() => setTouched(false), [draft.id]);

  const isCss = draft.kind === "css";
  const stats = cssStats(draft.content);
  const sanitised = isCss ? sanitiseThemeCss(draft.content) : { css: draft.content, removed: [] };
  const error = isCss ? validateCss(sanitised.css) : validateTokens(draft.content);
  const message =
    error === "css.too_large"
      ? `Stylesheets are limited to ${formatAssetBytes(MAX_CSS_BYTES)}.`
      : error === "css.unbalanced"
        ? "A curly bracket is not closed."
        : error === "tokens.json"
          ? "That is not valid JSON."
          : error === "tokens.shape"
            ? "Tokens must be a JSON object of name and value pairs."
            : null;

  return (
    <Card title={draft.id ? `Edit ${draft.name}` : `New ${ASSET_KIND_LABEL[draft.kind].en}`}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium fq-sub">Name</span>
          <input
            className={cn(inputClass, "min-h-11")}
            value={draft.name}
            maxLength={80}
            onChange={(event) => onChange({ ...draft, name: event.currentTarget.value })}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium fq-sub">Applies to</span>
          <select
            className={cn(inputClass, "min-h-11")}
            value={draft.themeId ?? ""}
            onChange={(event) =>
              onChange({ ...draft, themeId: event.currentTarget.value || null })
            }
          >
            <option value="">Every theme on this store</option>
            {installed.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.name}
                {theme.isActive ? " (active)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="mt-3 block text-sm">
        <span className="mb-1 block text-xs font-medium fq-sub">
          {isCss ? "Stylesheet" : "Token overrides (JSON)"}
        </span>
        <textarea
          className={cn(inputClass, "min-h-[260px] font-mono text-xs leading-relaxed")}
          spellCheck={false}
          value={draft.content}
          onChange={(event) => {
            setTouched(true);
            onChange({ ...draft, content: event.currentTarget.value });
          }}
        />
      </label>

      <p className="mt-2 text-xs fq-sub">
        {isCss
          ? `${stats.rules} rules · ${formatAssetBytes(stats.bytes)} of ${formatAssetBytes(MAX_CSS_BYTES)}`
          : "Names become CSS custom properties, so \"color-primary\" sets --color-primary."}
      </p>

      {sanitised.removed.length > 0 && (
        <p className="mt-2 flex items-start gap-2 rounded-fq-sm bg-warning-soft px-2 py-1 text-xs text-warning-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {sanitised.removed.join(", ")} will be removed when this saves — those cannot run on a
            storefront.
          </span>
        </p>
      )}

      {touched && message ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {message}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={btnPrimary}
          disabled={busy || Boolean(error)}
          onClick={() => onSave({ ...draft, content: isCss ? sanitised.css : draft.content })}
        >
          <Check className="size-4" aria-hidden /> {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className={btnGhost} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </Card>
  );
}
