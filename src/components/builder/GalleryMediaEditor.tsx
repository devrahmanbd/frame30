/**
 * GalleryMediaEditor: Visual multi-image manager for UGC Gallery sections.
 *
 * Replaces raw comma-separated URL textareas with visual cards, thumbnails,
 * alt text editing, reordering, and individual item removal.
 * Preserves StructuredMediaValue metadata (alt, focalPoint, dimensions)
 * and maintains 100% backward compatibility for comma-separated legacy URLs.
 */
import { useState, useMemo } from "react";
import { useLang } from "@/lib/i18n";
import {
  resolveMediaUrl,
  resolveMediaAlt,
  type StructuredMediaValue,
} from "@/lib/theme-contract";
import { MediaPicker } from "./MediaPicker";

export interface GalleryMediaEditorProps {
  value: unknown;
  onChange: (images: StructuredMediaValue[]) => void;
  disabled?: boolean;
}

export function GalleryMediaEditor({
  value,
  onChange,
  disabled = false,
}: GalleryMediaEditorProps) {
  const { t } = useLang();
  const [showPicker, setShowPicker] = useState(false);
  const [pastedUrl, setPastedUrl] = useState("");

  // Normalize incoming value to StructuredMediaValue[]
  const images: StructuredMediaValue[] = useMemo(() => {
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (typeof item === "string") {
            const trimmed = item.trim();
            return trimmed ? { url: trimmed, alt: "" } : null;
          }
          if (item && typeof item === "object") {
            const rawUrl = resolveMediaUrl(item);
            if (!rawUrl) return null;
            const alt = resolveMediaAlt(item, "");
            const focalPoint =
              "focalPoint" in item
                ? (item as StructuredMediaValue).focalPoint ?? null
                : null;
            const width =
              "width" in item ? (item as StructuredMediaValue).width : undefined;
            const height =
              "height" in item ? (item as StructuredMediaValue).height : undefined;
            const media: StructuredMediaValue = { url: rawUrl, alt };
            if (focalPoint) media.focalPoint = focalPoint;
            if (width) media.width = width;
            if (height) media.height = height;
            return media;
          }
          return null;
        })
        .filter((item): item is StructuredMediaValue => item !== null);
    }
    if (typeof value === "string" && value.trim()) {
      return value
        .split(",")
        .map((u) => u.trim())
        .filter(Boolean)
        .map((url) => ({ url, alt: "" }));
    }
    return [];
  }, [value]);

  const updateAlt = (index: number, alt: string) => {
    const next = images.map((img, i) => (i === index ? { ...img, alt } : img));
    onChange(next);
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= images.length || from === to) return;
    const next = [...images];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    onChange(next);
  };

  const remove = (index: number) => {
    onChange(images.filter((_, i) => i !== index));
  };

  const handlePickMedia = (
    urlOrValue: string | StructuredMediaValue,
    meta?: {
      altText?: string | null;
      width?: number | null;
      height?: number | null;
      focalPoint?: { x: number; y: number } | null;
    },
  ) => {
    const url =
      typeof urlOrValue === "string"
        ? urlOrValue.trim()
        : resolveMediaUrl(urlOrValue) || "";
    if (!url) return;

    const alt =
      meta?.altText ??
      (typeof urlOrValue === "object" ? resolveMediaAlt(urlOrValue, "") : "") ??
      "";
    const focalPoint =
      meta?.focalPoint ??
      (typeof urlOrValue === "object" ? urlOrValue.focalPoint ?? null : null);
    const width =
      meta?.width ??
      (typeof urlOrValue === "object" ? urlOrValue.width : undefined);
    const height =
      meta?.height ??
      (typeof urlOrValue === "object" ? urlOrValue.height : undefined);

    const newMedia: StructuredMediaValue = { url, alt };
    if (focalPoint) newMedia.focalPoint = focalPoint;
    if (width) newMedia.width = width;
    if (height) newMedia.height = height;

    onChange([...images, newMedia]);
    setShowPicker(false);
  };

  const handleAddDirectUrl = () => {
    const trimmed = pastedUrl.trim();
    if (!trimmed) return;
    onChange([...images, { url: trimmed, alt: "" }]);
    setPastedUrl("");
  };

  return (
    <div className="space-y-3" data-testid="gallery-media-editor">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">
          {t("Gallery images", "গ্যালারির ছবিসমূহ")}
        </span>
        <span className="text-[0.65rem] text-muted-foreground">
          {images.length} {images.length === 1 ? t("image", "ছবি") : t("images", "ছবি")}
        </span>
      </div>

      {images.length === 0 ? (
        <div className="rounded-fq-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          {t(
            "No images in gallery yet. Add images below.",
            "গ্যালারিতে এখনও কোনো ছবি নেই। নিচে ছবি যোগ করুন।",
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {images.map((img, index) => {
            const url = resolveMediaUrl(img) || "";
            return (
              <div
                key={index}
                className="flex items-start gap-2.5 rounded-fq-md border border-border bg-card p-2 shadow-xs"
              >
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-fq-sm border border-border bg-muted">
                  <img
                    src={url}
                    alt={img.alt || `Gallery item ${index + 1}`}
                    style={
                      img.focalPoint
                        ? {
                            objectPosition: `${img.focalPoint.x}% ${img.focalPoint.y}%`,
                          }
                        : undefined
                    }
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>

                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[0.68rem] font-medium text-muted-foreground truncate">
                      #{index + 1}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={t("Move up", "উপরে")}
                        disabled={disabled || index === 0}
                        onClick={() => move(index, index - 1)}
                        className="rounded-fq-sm border border-border px-1.5 py-0.5 text-[0.65rem] disabled:opacity-30 hover:bg-muted"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={t("Move down", "নিচে")}
                        disabled={disabled || index === images.length - 1}
                        onClick={() => move(index, index + 1)}
                        className="rounded-fq-sm border border-border px-1.5 py-0.5 text-[0.65rem] disabled:opacity-30 hover:bg-muted"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        aria-label={t("Remove image", "ছবি মুছুন")}
                        disabled={disabled}
                        onClick={() => remove(index)}
                        className="rounded-fq-sm border border-destructive/40 px-1.5 py-0.5 text-[0.65rem] text-destructive hover:bg-destructive/10"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <input
                    type="text"
                    disabled={disabled}
                    value={img.alt ?? ""}
                    onChange={(e) => updateAlt(index, e.target.value)}
                    placeholder={t("Alt text / description", "ছবির বিবরণ (অল্ট টেক্সট)")}
                    className="w-full rounded-fq-sm border border-input bg-background px-2 py-0.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showPicker ? (
        <div className="rounded-fq-md border border-border bg-card p-3 space-y-2">
          <div className="flex items-center justify-between pb-1 border-b border-border">
            <span className="text-xs font-medium">
              {t("Pick or Upload Image", "ছবি নির্বাচন বা আপলোড করুন")}
            </span>
            <button
              type="button"
              onClick={() => setShowPicker(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </div>
          <MediaPicker
            value={null}
            sizesPreset="square"
            onSizes={() => {}}
            onPick={handlePickMedia}
            disabled={disabled}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setShowPicker(true)}
            className="w-full rounded-fq-sm border border-dashed border-border py-2 text-xs font-medium text-foreground hover:bg-muted/60 transition-colors"
          >
            + {t("Add from Media Library", "মিডিয়া লাইব্রেরি থেকে ছবি যোগ করুন")}
          </button>

          <div className="flex items-center gap-1.5">
            <input
              type="text"
              disabled={disabled}
              value={pastedUrl}
              onChange={(e) => setPastedUrl(e.target.value)}
              placeholder="https://... image URL"
              className="flex-1 rounded-fq-sm border border-input bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
            <button
              type="button"
              disabled={disabled || !pastedUrl.trim()}
              onClick={handleAddDirectUrl}
              className="rounded-fq-sm border border-border px-2.5 py-1 text-xs font-medium text-foreground disabled:opacity-40 hover:bg-muted"
            >
              {t("Add URL", "যোগ")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
