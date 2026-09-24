/**
 * Import Demo Data — granular import panel for theme demo content.
 *
 * Shows a checkbox group (Slides, Media, Products, Posts, All) with an
 * import button.  A confirmation dialog gates every import.
 */
import { useCallback, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Loader2 } from "@/components/icons/tabler";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  importThemeSlidesFn,
  importThemeMediaFn,
  importThemeProductsFn,
  importThemePostsFn,
  importThemeAllFn,
  importPreflightFn,
} from "@/lib/themes.functions";

type ImportKind = "slides" | "media" | "products" | "posts" | "all";

type Conflict = { kind: string; slugs: string[] };

const KINDS: { key: ImportKind; label: string }[] = [
  { key: "slides", label: "Slides" },
  { key: "media", label: "Media" },
  { key: "products", label: "Products" },
  { key: "posts", label: "Posts" },
  { key: "all", label: "All" },
];

interface ImportDemoDataProps {
  themeKey: string;
  themeName: string;
  onImported?: () => void;
}

export function ImportDemoData({
  themeKey,
  themeName,
  onImported,
}: ImportDemoDataProps) {
  const [selected, setSelected] = useState<Set<ImportKind>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [overwriteAck, setOverwriteAck] = useState(false);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [conflictTotal, setConflictTotal] = useState(0);
  const [checking, setChecking] = useState(false);
  const preflight = useServerFn(importPreflightFn);

  async function openConfirm() {
    setConfirmOpen(true);
    setOverwriteAck(false);
    setConflicts([]);
    setConflictTotal(0);
    setChecking(true);
    try {
      const res = await preflight({ data: { themeKey } });
      setConflicts(res.conflicts ?? []);
      setConflictTotal(res.total ?? 0);
    } catch {
      // Preflight is advisory: a failed check must not block importing.
      setConflicts([]);
      setConflictTotal(0);
    } finally {
      setChecking(false);
    }
  }

  const importAll = useMutation({
    mutationFn: useServerFn(importThemeAllFn),
    onSuccess: (result: { totalImported: number }) => {
      toast.success(
        result.totalImported > 0
          ? `Imported ${result.totalImported} content type${result.totalImported > 1 ? "s" : ""}`
          : "Demo content already present",
      );
      onImported?.();
    },
    onError: () => toast.error("Import failed"),
  });

  const importSlides = useMutation({
    mutationFn: useServerFn(importThemeSlidesFn),
  });
  const importMedia = useMutation({
    mutationFn: useServerFn(importThemeMediaFn),
  });
  const importProducts = useMutation({
    mutationFn: useServerFn(importThemeProductsFn),
  });
  const importPosts = useMutation({
    mutationFn: useServerFn(importThemePostsFn),
  });

  const busy =
    importAll.isPending ||
    importSlides.isPending ||
    importMedia.isPending ||
    importProducts.isPending ||
    importPosts.isPending;

  const toggle = useCallback((kind: ImportKind) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (kind === "all") {
        if (next.has("all")) {
          next.clear();
        } else {
          for (const k of KINDS) next.add(k.key);
        }
      } else {
        if (next.has(kind)) next.delete(kind);
        else next.add(kind);
        const individual = KINDS.filter((k) => k.key !== "all");
        if (individual.every((k) => next.has(k.key))) next.add("all");
        else next.delete("all");
      }
      return next;
    });
  }, []);

  const runImport = useCallback(async () => {
    const kinds =
      selected.size === 0 ? (["all"] as ImportKind[]) : [...selected];
    const overwrite = conflictTotal > 0 && overwriteAck;
    if (kinds.includes("all")) {
      await importAll.mutateAsync({ data: { themeKey, overwrite } });
    } else {
      let imported = 0;
      for (const kind of kinds) {
        try {
          const mutations = {
            slides: importSlides,
            media: importMedia,
            products: importProducts,
            posts: importPosts,
          };
          const result = await mutations[kind].mutateAsync({
            data: { themeKey, overwrite },
          });
          if (result.imported) imported++;
        } catch {
          // continue
        }
      }
      if (imported > 0) {
        toast.success(
          `Imported ${imported} content type${imported > 1 ? "s" : ""}`,
        );
      } else {
        toast.info("Demo content already present");
      }
      onImported?.();
    }
    setConfirmOpen(false);
    setSelected(new Set());
  }, [
    selected,
    themeKey,
    conflictTotal,
    overwriteAck,
    importAll,
    importSlides,
    importMedia,
    importProducts,
    importPosts,
    onImported,
  ]);

  const selectedKinds = useMemo(() => {
    const list = [...selected].filter((k) => k !== "all");
    if (list.length === 0) return "all";
    return list.join(", ");
  }, [selected]);

  return (
    <>
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Download className="size-4 text-muted-foreground" aria-hidden />
            <span className="text-sm font-medium">Import demo data</span>
          </div>

          <fieldset className="flex flex-wrap items-center gap-3">
            <legend className="sr-only">Content types to import</legend>
            {KINDS.map((kind) => (
              <label
                key={kind.key}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"
              >
                <Checkbox
                  checked={selected.has(kind.key)}
                  onCheckedChange={() => toggle(kind.key)}
                  disabled={busy}
                />
                {kind.label}
              </label>
            ))}
          </fieldset>

          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void openConfirm()}
            className="ml-auto"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Download className="size-4" aria-hidden />
            )}
            {busy
              ? "Importing…"
              : conflictTotal > 0
                ? `Overwrite ${conflictTotal} items`
                : "Import"}
          </Button>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import demo content?</DialogTitle>
            <DialogDescription>
              This will import demo {selectedKinds} content for{" "}
              <strong>{themeName}</strong>. Existing content will not be
              duplicated.
            </DialogDescription>
          </DialogHeader>
          {checking ? (
            <p className="text-sm text-muted-foreground">
              Checking for conflicting content…
            </p>
          ) : (
            conflictTotal > 0 && (
              <div
                role="alert"
                className="rounded-fq-md border border-warning-foreground/30 bg-warning-soft p-3 text-sm"
              >
                <p className="font-semibold text-warning-foreground">
                  {conflictTotal} existing{" "}
                  {conflictTotal === 1 ? "item" : "items"} will be overwritten
                  by demo data.
                </p>
                <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                  {conflicts.map((c) => (
                    <li key={c.kind}>
                      <span className="font-medium">{c.kind}:</span>{" "}
                      {c.slugs.join(", ")}
                    </li>
                  ))}
                </ul>
                <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs font-medium">
                  <Checkbox
                    checked={overwriteAck}
                    onCheckedChange={(v) => setOverwriteAck(v === true)}
                  />
                  I understand existing design, pages, posts and media with
                  matching names will be replaced.
                </label>
              </div>
            )
          )}
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => void runImport()}
              disabled={busy || (conflictTotal > 0 && !overwriteAck)}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              {busy ? "Importing\u2026" : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
