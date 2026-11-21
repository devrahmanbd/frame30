/**
 * MenuPicker: Merchant-friendly navigation menu selector.
 *
 * Populates from authenticated merchant's navigation menus via server RPC,
 * displaying human-readable menu names and hiding internal UUIDs.
 * Handles deleted/unavailable menus gracefully.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useLang } from "@/lib/i18n";
import { builderMenusFn } from "@/lib/builder-workspace.functions";

export interface MenuPickerProps {
  value: string;
  onChange: (menuId: string) => void;
  disabled?: boolean;
}

export function MenuPicker({
  value,
  onChange,
  disabled = false,
}: MenuPickerProps) {
  const { t } = useLang();
  const getMenus = useServerFn(builderMenusFn);

  const { data: menus = [], isLoading } = useQuery({
    queryKey: ["builder", "menus"],
    queryFn: async () => {
      try {
        const res = await getMenus();
        return Array.isArray(res) ? res : [];
      } catch {
        return [];
      }
    },
    staleTime: 60_000,
  });

  const selectedMenu = menus.find(
    (m) => m.id === value || m.handle === value,
  );
  const isUnavailable = Boolean(value && !isLoading && !selectedMenu);

  return (
    <div className="space-y-1.5" data-testid="menu-picker">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-foreground">
          {t("Menu", "মেনু")}
        </label>
        {value ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange("")}
            className="text-[0.65rem] text-muted-foreground hover:text-destructive transition-colors"
          >
            {t("Clear (use default)", "মুছুন (ডিফল্ট)")}
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
              ? t("Loading menus…", "মেনু লোড হচ্ছে…")
              : t("Live Store Taxonomy (Default)", "লাইভ স্টোর ট্যাক্সোনমি (ডিফল্ট)")}
          </option>

          {isUnavailable && (
            <option value={value} disabled>
              {value} ({t("Unavailable", "অনুপলব্ধ")})
            </option>
          )}

          {menus.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name || m.handle}
            </option>
          ))}
        </select>
      </div>

      {isUnavailable && (
        <p className="text-[0.68rem] text-destructive">
          {t(
            "This menu is no longer available or was deleted.",
            "এই মেনুটি আর উপলব্ধ নেই অথবা মুছে ফেলা হয়েছে।",
          )}
        </p>
      )}
    </div>
  );
}
