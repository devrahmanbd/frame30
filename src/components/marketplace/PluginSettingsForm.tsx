import { useMemo, useState } from "react";
import {
  validateSettings,
  type InstalledPlugin,
  type SettingsValues,
} from "@/lib/plugin-manifest";
import { useLang } from "@/lib/i18n";

/**
 * Phase 5 — schema-driven plugin settings.
 *
 * The plugin ships a settings *schema*, never a form: core renders the fields,
 * coerces them against the schema and stores them per merchant, so a plugin
 * can never inject markup or script into the admin.
 */
export function PluginSettingsForm({
  plugin,
  onSave,
  onToggle,
  saving = false,
}: {
  plugin: InstalledPlugin;
  onSave: (values: SettingsValues) => void;
  onToggle?: (enabled: boolean) => void;
  saving?: boolean;
}) {
  const { t, lang } = useLang();
  const schema = plugin.manifest.settings;
  const [values, setValues] = useState<SettingsValues>(plugin.settings);

  const label = useMemo(() => {
    const dict = lang === "bn" ? plugin.manifest.i18n.bn : plugin.manifest.i18n.en;
    return (key: string, fallback: string) => dict[key] ?? fallback;
  }, [lang, plugin.manifest.i18n]);

  const errors = validateSettings(schema, values).errors;

  function set(key: string, value: string | number | boolean) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const checked = validateSettings(schema, values);
        if (!checked.errors.length) onSave(checked.values);
      }}
    >
      <header className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{plugin.manifest.name}</h3>
          <p className="text-xs text-muted-foreground">
            v{plugin.manifest.version} · {plugin.grantedScopes.length}{" "}
            {t("permissions", "অনুমতি")}
          </p>
        </div>
        {onToggle && (
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={plugin.enabled}
              onChange={(e) => onToggle(e.target.checked)}
            />
            {t("Enabled", "সক্রিয়")}
          </label>
        )}
      </header>

      {schema.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {t("This app has no settings.", "এই অ্যাপে কোনো সেটিং নেই।")}
        </p>
      )}

      {schema.map((field) => {
        const id = `plugin-${plugin.manifest.id}-${field.key}`;
        const value = values[field.key];
        return (
          <div key={field.key} className="space-y-1">
            <label htmlFor={id} className="block text-xs font-medium">
              {label(field.key, field.label)}
            </label>
            {field.kind === "boolean" ? (
              <input
                id={id}
                type="checkbox"
                checked={value === true}
                onChange={(e) => set(field.key, e.target.checked)}
              />
            ) : field.kind === "select" ? (
              <select
                id={id}
                value={String(value ?? "")}
                onChange={(e) => set(field.key, e.target.value)}
                className="w-full rounded-fq-md border border-border bg-card px-3 py-2 text-sm"
              >
                {field.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {label(o.value, o.label)}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={id}
                type={field.kind === "number" ? "number" : "text"}
                value={String(value ?? "")}
                min={field.min}
                max={field.max}
                onChange={(e) =>
                  set(field.key, field.kind === "number" ? Number(e.target.value) : e.target.value)
                }
                className="w-full rounded-fq-md border border-border bg-card px-3 py-2 text-sm"
              />
            )}
          </div>
        );
      })}

      {errors.length > 0 && (
        <p className="text-xs text-destructive">
          {t("Check the highlighted values.", "মানগুলো আবার দেখুন।")} ({errors.join(", ")})
        </p>
      )}

      <button
        type="submit"
        disabled={saving || errors.length > 0}
        className="rounded-fq-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
      >
        {saving ? t("Saving…", "সেভ হচ্ছে…") : t("Save settings", "সেটিং সেভ করুন")}
      </button>
    </form>
  );
}
