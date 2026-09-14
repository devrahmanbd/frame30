import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { catalogEntry, type SectionType, type Slot } from "@/lib/builder-ast";
import { useLang } from "@/lib/i18n";
import { pluginTrayEntries, type BlockSlot } from "@/lib/plugin-manifest";
import {
  VERTICALS,
  presetsFor,
  searchWidgets,
  widgetHelp,
  type WidgetSearchHit,
  type WidgetVertical,
} from "@/lib/widget-metadata";
import { createRecentStore } from "@/lib/widget-recent";
import { useInstalledPlugins } from "./PluginContext";

const REASON_LABEL: Record<WidgetSearchHit["reason"], { en: string; bn: string }> = {
  label: { en: "Name", bn: "নাম" },
  synonym: { en: "Also called", bn: "অন্য নাম" },
  vertical: { en: "For your store", bn: "আপনার স্টোরের জন্য" },
  help: { en: "In description", bn: "বর্ণনায়" },
};

const VERTICAL_LABEL: Record<WidgetVertical, { en: string; bn: string }> = {
  general: { en: "All", bn: "সব" },
  apparel: { en: "Apparel", bn: "পোশাক" },
  electronics: { en: "Electronics", bn: "ইলেকট্রনিকস" },
  beauty: { en: "Beauty", bn: "বিউটি" },
};

const GROUP_LABEL: Record<string, { en: string; bn: string }> = {
  layout: { en: "Layout", bn: "লেআউট" },
  content: { en: "Content", bn: "কন্টেন্ট" },
  commerce: { en: "Commerce", bn: "কমার্স" },
  engagement: { en: "Engagement", bn: "এনগেজমেন্ট" },
  context: { en: "Page context", bn: "পেজ কনটেক্সট" },
};

/**
 * Phase 2.4 — the widget palette.
 *
 * Three behaviours the old grid did not have:
 *  - **Search that understands merchants.** `searchWidgets` matches labels,
 *    synonyms ("banner" → hero) and help prose, ranks deterministically, and is
 *    always filtered to the widgets this slot legally accepts.
 *  - **Recently used, persisted.** The MRU list survives reloads through a
 *    store that tolerates private mode, quota errors and hostile JSON.
 *  - **Preset before insert.** A widget with designed variants opens a small
 *    picker, so a merchant starts from a layout rather than from defaults.
 */
export function WidgetTray({
  slot,
  onAdd,
  onAddPlugin,
}: {
  slot: Slot;
  /** `presetKey` is `"default"` when the widget has no variants. */
  onAdd: (type: SectionType, presetKey: string) => void;
  /** Phase 5: adds a `plugin_block` already pointed at an app widget. */
  onAddPlugin?: (pluginKey: string) => void;
}) {
  const { t } = useLang();
  const [term, setTerm] = useState("");
  const [vertical, setVertical] = useState<WidgetVertical>("general");
  const [pending, setPending] = useState<SectionType | null>(null);
  const [recent, setRecent] = useState<SectionType[]>([]);
  const plugins = useInstalledPlugins();
  const store = useRef(createRecentStore()).current;

  useEffect(() => {
    setRecent(store.read());
  }, [store]);

  // Changing slot can invalidate a pending preset choice (the widget may not be
  // legal here), so the two-step flow always resets with the slot.
  useEffect(() => {
    setPending(null);
  }, [slot]);

  const hits = useMemo(
    () => searchWidgets({ term, slot, vertical, recent, limit: 60 }),
    [term, slot, vertical, recent],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, WidgetSearchHit[]>();
    for (const hit of hits) {
      const list = map.get(hit.group) ?? [];
      list.push(hit);
      map.set(hit.group, list);
    }
    return [...map.entries()];
  }, [hits]);

  const appEntries = useMemo(() => {
    const q = term.trim().toLowerCase();
    return pluginTrayEntries(plugins, slot as BlockSlot).filter(
      (e) => !q || e.label.toLowerCase().includes(q) || e.pluginName.toLowerCase().includes(q),
    );
  }, [plugins, slot, term]);

  const insert = useCallback(
    (type: SectionType, presetKey: string) => {
      setRecent(store.push(type));
      setPending(null);
      onAdd(type, presetKey);
    },
    [onAdd, store],
  );

  const pick = useCallback(
    (type: SectionType) => {
      // One variant means there is nothing to choose: skip the extra click.
      if (presetsFor(type).length <= 1) insert(type, "default");
      else setPending(type);
    },
    [insert],
  );

  const recentHits = useMemo(
    () => recent.filter((type) => catalogEntry(type)?.slots.includes(slot)),
    [recent, slot],
  );

  if (pending) {
    const presets = presetsFor(pending);
    const entry = catalogEntry(pending);
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{entry?.label ?? pending}</h3>
          <button type="button" onClick={() => setPending(null)} className="text-xs underline">
            {t("Back", "ফিরে যান")}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t(widgetHelp(pending).en, widgetHelp(pending).bn)}
        </p>
        <p className="text-xs font-medium">{t("Start from", "শুরু করুন")}</p>
        <ul className="space-y-1">
          {presets.map((preset) => (
            <li key={preset.key}>
              <button
                type="button"
                onClick={() => insert(pending, preset.key)}
                className="w-full rounded-fq-md border border-border bg-card px-2 py-2 text-left text-xs hover:bg-accent hover:text-accent-foreground"
              >
                {t(preset.label.en, preset.label.bn)}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <label className="block text-xs font-medium text-muted-foreground" htmlFor="widget-search">
        {t("Find a widget", "উইজেট খুঁজুন")}
      </label>
      <input
        id="widget-search"
        type="search"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder={t("Search widgets", "উইজেট সার্চ")}
        className="w-full rounded-fq-md border border-border bg-card px-3 py-2 text-sm"
      />

      <div role="group" aria-label={t("Store type", "স্টোরের ধরন")} className="flex flex-wrap gap-1">
        {VERTICALS.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={vertical === key}
            onClick={() => setVertical(key)}
            className={`rounded-fq-md px-2 py-1 text-[11px] ${
              vertical === key ? "bg-primary text-primary-foreground" : "border border-border bg-card"
            }`}
          >
            {t(VERTICAL_LABEL[key].en, VERTICAL_LABEL[key].bn)}
          </button>
        ))}
      </div>

      {recentHits.length > 0 && !term && (
        <section aria-label={t("Recently used", "সম্প্রতি ব্যবহৃত")}>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("Recently used", "সম্প্রতি ব্যবহৃত")}
          </h3>
          <ul className="flex flex-wrap gap-1">
            {recentHits.map((type) => (
              <li key={type}>
                <button
                  type="button"
                  onClick={() => pick(type)}
                  title={widgetHelp(type).en}
                  className="rounded-fq-md border border-border bg-card px-2 py-1 text-[11px] hover:bg-accent hover:text-accent-foreground"
                >
                  {catalogEntry(type)?.label ?? type}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {hits.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {term
            ? t("Nothing matches that search in this slot.", "এই স্লটে সার্চের সাথে কিছু মেলেনি।")
            : t("No widgets match this slot.", "এই স্লটে কোনো উইজেট মেলেনি।")}
        </p>
      )}

      {appEntries.length > 0 && (
        <section aria-label={t("Apps", "অ্যাপ")}>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("Apps", "অ্যাপ")}
          </h3>
          <ul className="grid grid-cols-2 gap-1">
            {appEntries.map((entry) => (
              <li key={entry.key}>
                <button
                  type="button"
                  onClick={() => onAddPlugin?.(entry.key)}
                  disabled={!onAddPlugin}
                  title={entry.pluginName}
                  className="flex w-full items-center gap-1 rounded-fq-md border border-border bg-card px-2 py-2 text-left text-xs hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                >
                  <span className="rounded-fq-sm bg-primary/10 px-1 text-[10px] font-semibold uppercase text-primary">
                    {t("App", "অ্যাপ")}
                  </span>
                  <span className="truncate">{entry.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {grouped.map(([group, entries]) => (
        <section key={group} aria-label={t(GROUP_LABEL[group]?.en ?? group, GROUP_LABEL[group]?.bn ?? group)}>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t(GROUP_LABEL[group]?.en ?? group, GROUP_LABEL[group]?.bn ?? group)}
          </h3>
          <ul className="grid grid-cols-2 gap-1">
            {entries.map((hit) => (
              <li key={hit.type}>
                <button
                  type="button"
                  onClick={() => pick(hit.type)}
                  title={widgetHelp(hit.type).en}
                  className="w-full rounded-fq-md border border-border bg-card px-2 py-2 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                >
                  <span className="block truncate">{hit.label}</span>
                  {term && hit.reason !== "label" && (
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">
                      {t(REASON_LABEL[hit.reason].en, REASON_LABEL[hit.reason].bn)}
                    </span>
                  )}
                  {presetsFor(hit.type).length > 1 && (
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">
                      {t("Variants available", "ভ্যারিয়েন্ট আছে")}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
