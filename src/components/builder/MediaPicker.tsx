/**
 * Phase 3.3 — the image prop editor.
 *
 * Three ways in: the store's media library, an upload, or a pasted https URL.
 * Whatever the route, the prop ends up as a plain URL string, so nothing about
 * the AST, autosave or the sanitiser has to know a picker exists.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { mediaListFn, mediaUploadFn } from "@/lib/media.functions";
import {
  MEDIA_MAX_BYTES,
  MEDIA_URL_PREFIX,
  SIZES_LABEL,
  SIZES_PRESETS,
  validateMediaUrl,
  type MediaItem,
} from "@/lib/media";
import { useLang } from "@/lib/i18n";

type Tab = "library" | "url";

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_failed"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

export function MediaPicker({
  value,
  sizesPreset,
  disabled,
  onPick,
  onSizes,
}: {
  value: string;
  sizesPreset: string;
  disabled?: boolean;
  /**
   * The second argument carries what the library knows about the object: alt
   * text the merchant already wrote, and the intrinsic size. Callers that only
   * store a URL can ignore it.
   */
  onPick: (url: string, meta?: { altText?: string | null; width?: number | null; height?: number | null }) => void;

  onSizes: (preset: string) => void;
}) {
  const { t } = useLang();
  const qc = useQueryClient();
  const list = useServerFn(mediaListFn);
  const upload = useServerFn(mediaUploadFn);
  const [tab, setTab] = useState<Tab>("library");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const library = useQuery({
    queryKey: ["builder", "media"],
    queryFn: () => list({}),
    staleTime: 30_000,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > MEDIA_MAX_BYTES) throw new Error("too_large");
      const base64 = await readAsBase64(file);
      return upload({ data: { name: file.name, contentType: file.type, base64 } });
    },
    onSuccess: (result) => {
      setError(null);
      onPick(result.item.url);
      void qc.invalidateQueries({ queryKey: ["builder", "media"] });
    },
    onError: (e: Error) =>
      setError(
        e.message === "too_large"
          ? t("File is larger than 5 MB.", "ফাইলটি ৫ এমবি-র বেশি।")
          : t("Upload failed.", "আপলোড ব্যর্থ হয়েছে।"),
      ),
  });

  const items: MediaItem[] = library.data?.items ?? [];

  return (
    <div className="space-y-2">
      {value ? (
        <div className="flex items-center gap-2 rounded-fq-md border border-border p-2">
          <img src={value} alt="" className="size-12 shrink-0 rounded-fq-sm object-cover" />
          <span className="min-w-0 flex-1 truncate text-[0.65rem] text-muted-foreground">{value}</span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPick("")}
            className="rounded-fq-sm border border-border px-1.5 text-[0.65rem]"
          >
            {t("Clear", "মুছুন")}
          </button>
        </div>
      ) : (
        <p className="text-[0.65rem] text-muted-foreground">{t("No image selected.", "কোনো ছবি বাছা হয়নি।")}</p>
      )}

      <div className="flex gap-1">
        {(["library", "url"] as Tab[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className={`rounded-fq-sm border px-2 py-1 text-[0.65rem] ${
              tab === key ? "border-primary text-primary" : "border-border text-muted-foreground"
            }`}
          >
            {key === "library" ? t("Library", "লাইব্রেরি") : t("URL", "ইউআরএল")}
          </button>
        ))}
      </div>

      {tab === "library" ? (
        <div className="space-y-2">
          <label className="block text-[0.65rem] text-muted-foreground">
            {t("Upload an image", "ছবি আপলোড করুন")}
            <input
              type="file"
              accept="image/*"
              disabled={disabled || uploadMutation.isPending}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) uploadMutation.mutate(file);
                event.target.value = "";
              }}
              className="mt-1 block w-full text-[0.65rem]"
            />
          </label>

          {library.isLoading && (
            <p className="text-[0.65rem] text-muted-foreground">{t("Loading…", "লোড হচ্ছে…")}</p>
          )}
          {!library.isLoading && items.length === 0 && (
            <p className="text-[0.65rem] text-muted-foreground">
              {t("Your library is empty.", "লাইব্রেরি খালি।")}
            </p>
          )}

          <ul className="grid grid-cols-4 gap-1">
            {items.map((item) => (
              <li key={item.path}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    onPick(item.url, { altText: item.altText, width: item.width, height: item.height })
                  }
                  title={item.altText || item.name}

                  className={`block w-full overflow-hidden rounded-fq-sm border ${
                    value === item.url ? "border-primary" : "border-border"
                  }`}
                >
                  <img src={item.url} alt={item.altText || item.name} className="aspect-square w-full object-cover" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex gap-1">
          <input
            type="url"
            value={draft}
            disabled={disabled}
            placeholder="https://…"
            onChange={(event) => setDraft(event.target.value)}
            className="min-w-0 flex-1 rounded-fq-md border border-border bg-card px-2 py-1 text-xs"
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              const raw = draft.trim();
              let parsed: URL | null = null;
              try {
                parsed = raw.startsWith("/") ? null : new URL(raw);
              } catch {
                parsed = null;
              }
              // Uploaded objects are validated exactly; a pasted remote URL only
              // has to be plain https here — the image route re-checks its host.
              const ok = raw.startsWith(MEDIA_URL_PREFIX)
                ? validateMediaUrl(raw).ok
                : parsed?.protocol === "https:" && !parsed.username && !parsed.password;
              if (!ok) {
                setError(t("That URL cannot be used.", "এই ইউআরএল ব্যবহার করা যাবে না।"));
                return;
              }
              setError(null);
              onPick(raw);
              setDraft("");
            }}
            className="inline-flex min-h-8 items-center rounded-fq-md border border-border px-2 py-1 text-xs hover:bg-muted"
          >
            {t("Use", "ব্যবহার")}
          </button>
        </div>
      )}

      {error && <p className="text-[0.65rem] text-danger-foreground">{error}</p>}

      <label className="block text-[0.65rem] text-muted-foreground">
        {t("Rendered width", "রেন্ডার প্রস্থ")}
        <select
          value={sizesPreset || "full"}
          disabled={disabled}
          onChange={(event) => onSizes(event.target.value)}
          className="mt-1 block w-full rounded-fq-md border border-border bg-card px-2 py-1 text-xs"
        >
          {SIZES_PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {t(SIZES_LABEL[preset].en, SIZES_LABEL[preset].bn)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
