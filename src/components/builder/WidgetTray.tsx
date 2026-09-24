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
import { TRAY_MIME, encodeTrayDrop } from "./dnd";
import { useInstalledPlugins } from "./PluginContext";

const REASON_LABEL: Record<
  WidgetSearchHit["reason"],
  { en: string; bn: string }
> = {
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

function WidgetIcon({ type }: { type: string }) {
  if (
    type.includes("grid") ||
    type.includes("rail") ||
    type.includes("product")
  ) {
    return (
      <svg
        className="size-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <rect width="7" height="7" x="3" y="3" rx="1" />
        <rect width="7" height="7" x="14" y="3" rx="1" />
        <rect width="7" height="7" x="14" y="14" rx="1" />
        <rect width="7" height="7" x="3" y="14" rx="1" />
      </svg>
    );
  }
  if (type.includes("hero") || type.includes("banner")) {
    return (
      <svg
        className="size-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <rect width="18" height="12" x="3" y="6" rx="2" />
        <path d="m3 14 5-4 4 3 6-5 3 2" />
      </svg>
    );
  }
  if (
    type.includes("menu") ||
    type.includes("strip") ||
    type.includes("subbrand")
  ) {
    return (
      <svg
        className="size-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <line x1="3" x2="21" y1="6" y2="6" />
        <line x1="3" x2="21" y1="12" y2="12" />
        <line x1="3" x2="21" y1="18" y2="18" />
      </svg>
    );
  }
  if (type.includes("cart") || type.includes("checkout")) {
    return (
      <svg
        className="size-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="8" cy="21" r="1" />
        <circle cx="19" cy="21" r="1" />
        <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
      </svg>
    );
  }
  if (type.includes("container") || type.includes("columns")) {
    return (
      <svg
        className="size-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <line x1="12" x2="12" y1="3" y2="21" />
      </svg>
    );
  }
  if (type.includes("faq") || type.includes("care") || type.includes("help")) {
    return (
      <svg
        className="size-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" x2="12.01" y1="17" y2="17" />
      </svg>
    );
  }
  return (
    <svg
      className="size-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
    </svg>
  );
}

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
      (e) =>
        !q ||
        e.label.toLowerCase().includes(q) ||
        e.pluginName.toLowerCase().includes(q),
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
      <div className="space-y-3.5 animate-in fade-in duration-150">
        <div className="flex items-center justify-between gap-2 border-b border-border/80 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-fq-md bg-primary/10 text-primary">
              <WidgetIcon type={pending} />
            </div>
            <div>
              <h3 className="text-xs font-bold text-foreground">
                {entry?.label ?? pending}
              </h3>
              <p className="text-[10px] text-muted-foreground">
                {t("Choose a layout preset", "একটি প্রিসেট বেছে নিন")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPending(null)}
            className="rounded-fq-md border border-border/70 px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
          >
            {t("Back", "ফিরে যান")}
          </button>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          {t(widgetHelp(pending).en, widgetHelp(pending).bn)}
        </p>

        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-foreground uppercase tracking-wider">
            {t("Start from", "শুরু করুন")}
          </p>
          <ul className="space-y-1.5">
            {presets.map((preset) => (
              <li key={preset.key}>
                <button
                  type="button"
                  onClick={() => insert(pending, preset.key)}
                  className="flex w-full items-center justify-between rounded-fq-md border border-border/70 bg-card p-2.5 text-left text-xs font-medium hover:border-primary hover:bg-primary/5 hover:text-primary transition-all cursor-pointer shadow-xs"
                >
                  <span>{t(preset.label.en, preset.label.bn)}</span>
                  <svg
                    className="size-3.5 text-muted-foreground"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search Input with Icon */}
      <div className="space-y-1">
        <label
          htmlFor="widget-search"
          className="block text-xs font-semibold text-foreground"
        >
          {t("Find a widget", "উইজেট খুঁজুন")}
        </label>
        <div className="relative">
          <svg
            className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            id="widget-search"
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={t(
              "Search widgets (e.g. hero, grid, care)…",
              "উইজেট সার্চ",
            )}
            className="w-full rounded-fq-md border border-border/80 bg-background pl-8 pr-3 py-1.5 text-xs shadow-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Vertical Store Pills */}
      <div
        role="group"
        aria-label={t("Store type", "স্টোরের ধরন")}
        className="flex flex-wrap gap-1"
      >
        {VERTICALS.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={vertical === key}
            onClick={() => setVertical(key)}
            className={`rounded-fq-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
              vertical === key
                ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                : "border border-border/70 bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {t(VERTICAL_LABEL[key].en, VERTICAL_LABEL[key].bn)}
          </button>
        ))}
      </div>

      {/* Recently Used Widgets */}
      {recentHits.length > 0 && !term && (
        <section
          aria-label={t("Recently used", "সম্প্রতি ব্যবহৃত")}
          className="space-y-1.5"
        >
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {t("Recently used", "সম্প্রতি ব্যবহৃত")}
          </h3>
          <ul className="grid grid-cols-2 gap-1.5">
            {recentHits.map((type) => (
              <li key={type}>
                <button
                  type="button"
                  onClick={() => pick(type)}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      TRAY_MIME,
                      encodeTrayDrop({ type, presetKey: "default" }),
                    );
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  title={widgetHelp(type).en}
                  className="flex w-full items-center gap-2 rounded-fq-md border border-border/70 bg-card p-2 text-left text-xs font-medium hover:border-primary hover:bg-accent/60 transition-all cursor-pointer shadow-xs"
                >
                  <div className="flex size-6 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
                    <WidgetIcon type={type} />
                  </div>
                  <span className="truncate text-foreground">
                    {catalogEntry(type)?.label ?? type}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Zero State */}
      {hits.length === 0 && (
        <div className="rounded-fq-md border border-dashed border-border p-4 text-center">
          <p className="text-xs text-muted-foreground">
            {term
              ? t(
                  "Nothing matches that search in this slot.",
                  "এই স্লটে সার্চের সাথে কিছু মেলেনি।",
                )
              : t("No widgets match this slot.", "এই স্লটে কোনো উইজেট মেলেনি।")}
          </p>
        </div>
      )}

      {/* Installed Apps / Plugins */}
      {appEntries.length > 0 && (
        <section aria-label={t("Apps", "অ্যাপ")} className="space-y-1.5">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {t("Apps", "অ্যাপ")}
          </h3>
          <ul className="grid grid-cols-2 gap-1.5">
            {appEntries.map((entry) => (
              <li key={entry.key}>
                <button
                  type="button"
                  onClick={() => onAddPlugin?.(entry.key)}
                  disabled={!onAddPlugin}
                  title={entry.pluginName}
                  className="flex w-full items-center gap-1.5 rounded-fq-md border border-border/70 bg-card p-2 text-left text-xs hover:border-primary hover:bg-accent/60 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                >
                  <span className="rounded-fq-xs bg-primary/15 px-1 py-0.5 text-[9px] font-bold uppercase text-primary">
                    {t("App", "অ্যাপ")}
                  </span>
                  <span className="truncate text-foreground font-medium">
                    {entry.label}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Categorized Widget Cards */}
      {grouped.map(([group, entries]) => (
        <section
          key={group}
          aria-label={t(
            GROUP_LABEL[group]?.en ?? group,
            GROUP_LABEL[group]?.bn ?? group,
          )}
          className="space-y-1.5"
        >
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {t(
              GROUP_LABEL[group]?.en ?? group,
              GROUP_LABEL[group]?.bn ?? group,
            )}
          </h3>
          <ul className="grid grid-cols-1 gap-1.5">
            {entries.map((hit) => {
              const variants = presetsFor(hit.type);
              return (
                <li key={hit.type}>
                  <button
                    type="button"
                    onClick={() => pick(hit.type)}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        TRAY_MIME,
                        encodeTrayDrop({
                          type: hit.type,
                          presetKey: "default",
                        }),
                      );
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    title={widgetHelp(hit.type).en}
                    className="flex w-full items-center justify-between rounded-fq-md border border-border/70 bg-card p-2 text-left text-xs hover:border-primary hover:bg-accent/50 hover:shadow-xs transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-fq-md bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                        <WidgetIcon type={hit.type} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-foreground group-hover:text-primary transition-colors">
                          {hit.label}
                        </span>
                        {term && hit.reason !== "label" ? (
                          <span className="block text-[10px] text-muted-foreground">
                            {t(
                              REASON_LABEL[hit.reason].en,
                              REASON_LABEL[hit.reason].bn,
                            )}
                          </span>
                        ) : (
                          <span className="block text-[10px] text-muted-foreground truncate">
                            {t(
                              widgetHelp(hit.type).en,
                              widgetHelp(hit.type).bn,
                            )}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 ml-2">
                      {variants.length > 1 ? (
                        <span className="rounded-fq-xs bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
                          {variants.length} {t("presets", "প্রিসেট")}
                        </span>
                      ) : (
                        <svg
                          className="size-3.5 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
