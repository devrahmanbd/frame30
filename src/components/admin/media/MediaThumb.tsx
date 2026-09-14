/**
 * Phase 16 — one attachment tile's visual.
 *
 * Images and sanitised vectors show themselves; everything else gets a typed
 * placard so the grid stays scannable without loading a byte.
 */
import { FileAudio, FileText, FileVideo, ImageOff, Shapes } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Attachment, extensionOf, isPreviewable, mediaKind } from "@/lib/media/library";

export function MediaThumb({
  item,
  className,
  sizes = "200px",
}: {
  item: Attachment;
  className?: string;
  sizes?: string;
}) {
  const kind = mediaKind(item.contentType);

  if (isPreviewable(item.contentType)) {
    return (
      <img
        src={item.url}
        alt={item.altText || item.title || item.fileName}
        loading="lazy"
        decoding="async"
        sizes={sizes}
        className={cn("size-full bg-muted object-cover", className)}
      />
    );
  }

  const Icon =
    kind === "video" ? FileVideo : kind === "audio" ? FileAudio : kind === "document" ? FileText : ImageOff;

  return (
    <div
      className={cn(
        "grid size-full place-items-center gap-1 bg-muted text-muted-foreground",
        className,
      )}
    >
      <Icon className="size-7" aria-hidden />
      <span className="text-[11px] font-semibold uppercase tracking-wide">
        {extensionOf(item.fileName) || kind}
      </span>
    </div>
  );
}

export function SanitisedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      <Shapes className="size-3" aria-hidden /> SVG cleaned
    </span>
  );
}
