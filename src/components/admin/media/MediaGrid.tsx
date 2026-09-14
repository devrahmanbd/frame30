/**
 * Phase 16 — the two library views.
 *
 * Grid is the default (WordPress opens here); List is the table for people who
 * want file name, author, size and date at a glance. Both share one selection
 * model so Bulk select behaves the same either way.
 */
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type Attachment,
  formatBytes,
  dimensionLabel,
  needsAltText,
  uploadedLabel,
} from "@/lib/media/library";
import { MediaThumb } from "./MediaThumb";

type SharedProps = {
  items: Attachment[];
  selecting: boolean;
  selected: string[];
  onOpen: (item: Attachment) => void;
  onToggle: (item: Attachment, shift: boolean) => void;
};

export function MediaGrid({ items, selecting, selected, onOpen, onToggle }: SharedProps) {
  return (
    <ul
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
      aria-label="Media files"
    >
      {items.map((item) => {
        const picked = selected.includes(item.id);
        return (
          <li key={item.id}>
            <button
              type="button"
              aria-pressed={selecting ? picked : undefined}
              onClick={(event) => (selecting ? onToggle(item, event.shiftKey) : onOpen(item))}
              className={cn(
                "group relative block w-full overflow-hidden rounded-fq-md border bg-card text-left transition-shadow",
                picked ? "border-primary shadow-fq-md" : "border-border hover:shadow-fq-md",
              )}
            >
              <span className="block aspect-square overflow-hidden">
                <MediaThumb item={item} sizes="(max-width: 640px) 45vw, 200px" />
              </span>
              <span className="block truncate border-t border-border px-2 py-1.5 text-xs" title={item.fileName}>
                {item.fileName}
              </span>
              {selecting && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-2 top-2 grid size-6 place-items-center rounded-fq-sm border",
                    picked
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card/90 text-transparent",
                  )}
                >
                  <Check className="size-4" />
                </span>
              )}
              {needsAltText(item) && (
                <span className="absolute right-2 top-2 rounded-full bg-warning px-2 py-0.5 text-[11px] font-semibold text-warning-foreground">
                  No alt
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function MediaList({ items, selecting, selected, onOpen, onToggle }: SharedProps) {
  return (
    <div className="overflow-x-auto rounded-fq-md border border-border bg-card">
      <table className="w-full min-w-[640px] text-sm">
        <caption className="sr-only">Media files</caption>
        <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            {selecting && <th scope="col" className="w-10 px-3 py-2" />}
            <th scope="col" className="px-3 py-2">
              File
            </th>
            <th scope="col" className="px-3 py-2">
              Alt text
            </th>
            <th scope="col" className="px-3 py-2">
              Size
            </th>
            <th scope="col" className="px-3 py-2">
              Uploaded
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const picked = selected.includes(item.id);
            return (
              <tr
                key={item.id}
                className={cn("border-b border-border/70 last:border-0", picked && "bg-primary/5")}
              >
                {selecting && (
                  <td className="px-3 py-2">
                    <label className="grid size-11 place-items-center">
                      <span className="sr-only">Select {item.fileName}</span>
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={picked}
                        onChange={(event) =>
                          onToggle(item, (event.nativeEvent as MouseEvent).shiftKey ?? false)
                        }
                      />
                    </label>
                  </td>
                )}
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => onOpen(item)}
                    className="flex items-center gap-3 text-left"
                  >
                    <span className="block size-11 shrink-0 overflow-hidden rounded-fq-sm border border-border">
                      <MediaThumb item={item} sizes="44px" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-primary">{item.title || item.fileName}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.fileName}
                        {dimensionLabel(item) ? ` · ${dimensionLabel(item)}` : ""}
                      </span>
                    </span>
                  </button>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {item.altText || (needsAltText(item) ? <span className="text-warning">Missing</span> : "—")}
                </td>
                <td className="px-3 py-2 tabular-nums text-muted-foreground">{formatBytes(item.sizeBytes)}</td>
                <td className="px-3 py-2 text-muted-foreground">{uploadedLabel(item.createdAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
