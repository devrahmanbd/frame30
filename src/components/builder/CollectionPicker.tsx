/**
 * CollectionPicker: Merchant-friendly collection selector.
 *
 * Populates from authenticated merchant's product collections via server RPC,
 * displaying human-readable names and hiding internal database identifiers.
 * Handles deleted/unavailable collections gracefully.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useLang } from "@/lib/i18n";
import { builderCollectionsFn } from "@/lib/builder-workspace.functions";

export interface CollectionPickerProps {
  value: string;
  onChange: (collectionSlug: string) => void;
  disabled?: boolean;
}

export function CollectionPicker({
  value,
  onChange,
  disabled = false,
}: CollectionPickerProps) {
  const { t } = useLang();
  const getCollections = useServerFn(builderCollectionsFn);

  const { data: collections = [], isLoading } = useQuery({
    queryKey: ["builder", "collections"],
    queryFn: async () => {
      try {
        const res = await getCollections();
        return Array.isArray(res) ? res : [];
      } catch {
        return [];
      }
    },
    staleTime: 60_000,
  });

  const selectedCollection = collections.find(
    (c) => c.slug === value || c.id === value,
  );
  const isUnavailable = Boolean(value && !isLoading && !selectedCollection);

  return (
    <div className="space-y-1.5" data-testid="collection-picker">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-foreground">
          {t("Collection", "কালেকশন")}
        </label>
        {value ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange("")}
            className="text-[0.65rem] text-muted-foreground hover:text-destructive transition-colors"
          >
            {t("Clear", "মুছুন")}
          </button>
        ) : null}
      </div>

      <div className="relative">
        <select
          value={value}
          disabled={disabled || isLoading}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-fq-sm border border-input bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-ring disabled:opacity-50"
        >
          <option value="">
            {isLoading
              ? t("Loading collections…", "কালেকশন লোড হচ্ছে…")
              : t("Select a collection…", "কালেকশন নির্বাচন করুন…")}
          </option>

          {isUnavailable && (
            <option value={value} disabled>
              {value} ({t("Unavailable", "অনুপলব্ধ")})
            </option>
          )}

          {collections.map((col) => (
            <option key={col.id} value={col.slug}>
              {col.name}
            </option>
          ))}
        </select>
      </div>

      {isUnavailable && (
        <p className="text-[0.68rem] text-destructive">
          {t(
            "This collection is no longer available or was deleted.",
            "এই কালেকশনটি আর উপলব্ধ নেই অথবা মুছে ফেলা হয়েছে।",
          )}
        </p>
      )}
    </div>
  );
}
