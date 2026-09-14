/**
 * Phase 14 — Class Manager.
 *
 * WordPress/Elementor-style list of global classes for the document: rename,
 * delete, create. Applying a class to the selected element happens from the
 * Classes row at the top of the Style tab.
 */
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { StudioClass } from "@/lib/studio/model";

export function normalizeClassName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function ClassManagerDialog({
  open,
  onOpenChange,
  classes,
  onCreate,
  onRename,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classes: StudioClass[];
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Class Manager</DialogTitle>
          <DialogDescription>
            Global classes can be applied to any element. Editing a class updates every element using it.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const name = normalizeClassName(draft);
            if (!name) return;
            onCreate(name);
            setDraft("");
          }}
        >
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Type class name"
            aria-label="New class name"
          />
          <button
            type="submit"
            className="inline-flex min-h-10 items-center gap-1 rounded-fq-md bg-primary px-3 text-xs font-semibold text-primary-foreground"
          >
            <Plus className="size-4" aria-hidden /> Create
          </button>
        </form>

        {classes.length === 0 ? (
          <p className="rounded-fq-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            There are no global classes yet — create one above to get started.
          </p>
        ) : (
          <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-fq-md border border-border">
            {classes.map((item) => (
              <li key={item.id} className="flex items-center gap-2 p-2">
                <span className="font-mono text-[0.7rem] text-muted-foreground">.</span>
                <Input
                  defaultValue={item.name}
                  aria-label={`Class name for ${item.name}`}
                  onBlur={(event) => {
                    const name = normalizeClassName(event.target.value);
                    if (name && name !== item.name) onRename(item.id, name);
                    else event.target.value = item.name;
                  }}
                  className="h-8 flex-1 font-mono text-xs"
                />
                <button
                  type="button"
                  aria-label={`Delete ${item.name}`}
                  onClick={() => onDelete(item.id)}
                  className="grid size-8 place-items-center rounded-fq-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
