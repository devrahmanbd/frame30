/**
 * Phase 16 — the "Add media file" drop-zone.
 *
 * WordPress inlines this above the library rather than sending you elsewhere,
 * so it collapses by default and expands in place. Files are validated in the
 * browser before a byte is read, and image dimensions are measured client-side
 * so the attachment details are complete straight away.
 */
import { useRef, useState, type DragEvent } from "react";
import { UploadCloud, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { btnPrimary } from "@/components/console/kit";
import {
  ACCEPTED_MIME,
  MEDIA_UPLOAD_MAX_BYTES,
  formatBytes,
  validateUpload,
} from "@/lib/media/library";

export type PendingUpload = {
  name: string;
  contentType: string;
  base64: string;
  width: number | null;
  height: number | null;
};

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_failed"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

function measure(dataUrl: string, contentType: string): Promise<{ width: number; height: number } | null> {
  if (!contentType.startsWith("image/") || typeof Image === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

export async function toPendingUpload(file: File): Promise<PendingUpload> {
  const base64 = await readAsBase64(file);
  const size = await measure(base64, file.type);
  return {
    name: file.name,
    contentType: file.type,
    base64,
    width: size?.width ?? null,
    height: size?.height ?? null,
  };
}

export function UploadDropzone({
  busy,
  progress,
  onFiles,
  onClose,
  compact = false,
}: {
  busy?: boolean;
  /** `done / total` while a batch is uploading. */
  progress?: { done: number; total: number } | null;
  onFiles: (files: File[]) => void;
  onClose?: () => void;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const accept = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    const bad: string[] = [];
    const good: File[] = [];
    for (const file of files) {
      const check = validateUpload(file);
      if (check.ok) good.push(file);
      else bad.push(`${file.name}: ${check.message}`);
    }
    setErrors(bad);
    if (good.length > 0) onFiles(good);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    accept(event.dataTransfer?.files ?? null);
  };

  return (
    <section
      aria-label="Add media file"
      className={cn(
        "relative rounded-fq-lg border border-dashed bg-card transition-colors",
        over ? "border-primary bg-primary/5" : "border-border",
        compact ? "p-5" : "p-8",
      )}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Hide the upload panel"
          className="absolute right-2 top-2 grid size-11 place-items-center rounded-fq-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}

      <div className="flex flex-col items-center gap-3 text-center">
        <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
          <UploadCloud className="size-5" aria-hidden />
        </span>
        <p className="text-sm font-semibold">Drop files to upload</p>
        <p className="text-xs text-muted-foreground">or</p>
        <button
          type="button"
          className={btnPrimary}
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          Select files
        </button>
        <p className="text-xs text-muted-foreground">
          Maximum file size {formatBytes(MEDIA_UPLOAD_MAX_BYTES)}. Images, SVG, video, audio and documents.
        </p>
        {progress && progress.total > 0 && (
          <p aria-live="polite" className="text-xs font-medium text-primary">
            Uploading {progress.done} of {progress.total}…
          </p>
        )}
        {errors.length > 0 && (
          <ul className="w-full max-w-md space-y-1 text-left text-xs text-destructive" role="alert">
            {errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        accept={ACCEPTED_MIME.join(",")}
        onChange={(event) => {
          accept(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
    </section>
  );
}
