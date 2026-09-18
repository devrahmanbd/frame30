import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type MenuItem = {
  id: string;
  label: string;
  href: string;
  type: "link" | "page" | "collection" | "product" | "category" | "custom";
  /** Nested children — used for dropdowns and mega menu columns. */
  children?: MenuItem[];
  /** Mega menu mode: spreads children across columns. */
  mega?: { enabled: boolean; columns: number };
};

export type MenuBuilderProps = {
  value: MenuItem[];
  onChange: (items: MenuItem[]) => void;
  /** Maximum nesting depth (default 2). */
  maxDepth?: number;
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

let _uid = 0;
const uid = () => `mi_${Date.now()}_${++_uid}`;

const ITEM_TYPE_LABEL: Record<MenuItem["type"], { en: string; bn: string }> = {
  link: { en: "Link", bn: "লিংক" },
  page: { en: "Page", bn: "পেজ" },
  collection: { en: "Collection", bn: "কালেকশন" },
  product: { en: "Product", bn: "প্রোডাক্ট" },
  category: { en: "Category", bn: "ক্যাটাগরি" },
  custom: { en: "Custom", bn: "কাস্টম" },
};

const newItem = (type: MenuItem["type"] = "link"): MenuItem => ({
  id: uid(),
  label: "",
  href: "#",
  type,
});

/* ------------------------------------------------------------------ */
/*  Single item row                                                    */
/* ------------------------------------------------------------------ */

function MenuItemRow({
  item,
  depth,
  maxDepth,
  onUpdate,
  onRemove,
  onAddChild,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  item: MenuItem;
  depth: number;
  maxDepth: number;
  onUpdate: (patch: Partial<MenuItem>) => void;
  onRemove: () => void;
  onAddChild: (type: MenuItem["type"]) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const { t } = useLang();
  const [expanded, setExpanded] = useState(true);
  const hasChildren = (item.children?.length ?? 0) > 0;
  const megaEnabled = item.mega?.enabled ?? false;

  return (
    <div className={`rounded-fq-md border border-border bg-card ${depth > 0 ? "ml-4 mt-1" : "mt-1"}`}>
      {/* Row header */}
      <div className="flex items-center gap-1 px-2 py-1.5">
        {/* Collapse toggle */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="size-5 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={expanded ? t("Collapse", "গুটান") : t("Expand", "খুলুন")}
        >
          <svg className={`size-3 transition-transform ${expanded ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
        </button>

        {/* Move buttons */}
        <button type="button" onClick={onMoveUp} disabled={!canMoveUp} className="size-5 shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label={t("Move up", "উপরে")}>↑</button>
        <button type="button" onClick={onMoveDown} disabled={!canMoveDown} className="size-5 shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label={t("Move down", "নিচে")}>↓</button>

        {/* Label */}
        <input
          type="text"
          value={item.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder={t("Menu item label", "মেনু আইটেম লেবেল")}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />

        {/* Type badge */}
        <span className="shrink-0 rounded-fq-sm bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {t(ITEM_TYPE_LABEL[item.type].en, ITEM_TYPE_LABEL[item.type].bn)}
        </span>

        {/* Delete */}
        <button type="button" onClick={onRemove} className="size-5 shrink-0 text-muted-foreground hover:text-destructive" aria-label={t("Remove", "বাদ")}>×</button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="space-y-2 border-t border-border px-3 py-2">
          {/* URL + Type */}
          <div className="flex gap-2">
            <input
              type="text"
              value={item.href}
              onChange={(e) => onUpdate({ href: e.target.value })}
              placeholder={t("URL or path", "URL বা পাথ")}
              className="min-w-0 flex-1 rounded-fq-md border border-border px-2 py-1 text-xs"
            />
            <select
              value={item.type}
              onChange={(e) => onUpdate({ type: e.target.value as MenuItem["type"] })}
              className="shrink-0 rounded-fq-md border border-border bg-card px-2 py-1 text-xs"
            >
              {(Object.keys(ITEM_TYPE_LABEL) as MenuItem["type"][]).map((key) => (
                <option key={key} value={key}>{t(ITEM_TYPE_LABEL[key].en, ITEM_TYPE_LABEL[key].bn)}</option>
              ))}
            </select>
          </div>

          {/* Mega menu toggle */}
          {depth === 0 && (
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">{t("Mega menu", "মেগা মেনু")}</label>
              <button
                type="button"
                role="switch"
                aria-checked={megaEnabled}
                onClick={() => onUpdate({ mega: { enabled: !megaEnabled, columns: item.mega?.columns ?? 3 } })}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${megaEnabled ? "bg-primary" : "bg-muted"}`}
              >
                <span className={`inline-block size-3.5 rounded-full bg-white transition-transform ${megaEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
              </button>
            </div>
          )}

          {/* Mega columns slider */}
          {megaEnabled && depth === 0 && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">{t("Columns", "কলাম")}</label>
              <input
                type="range"
                min={1}
                max={4}
                value={item.mega?.columns ?? 3}
                onChange={(e) => onUpdate({ mega: { enabled: true, columns: Number(e.target.value) } })}
                className="flex-1"
              />
              <span className="text-xs tabular-nums">{item.mega?.columns ?? 3}</span>
            </div>
          )}

          {/* Add child button */}
          {depth < maxDepth - 1 && (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => onAddChild("link")}
                className="rounded-fq-md border border-border px-2 py-1 text-[10px] hover:bg-muted"
              >
                + {t("Add submenu item", "সাবমেনু আইটেম যোগ")}
              </button>
              {depth === 0 && (
                <button
                  type="button"
                  onClick={() => onAddChild("page")}
                  className="rounded-fq-md border border-border px-2 py-1 text-[10px] hover:bg-muted"
                >
                  + {t("Add column", "কলাম যোগ")}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Children */}
      {expanded && hasChildren && (
        <div className="border-t border-border px-2 py-1">
          {item.children!.map((child, idx) => (
            <MenuItemRow
              key={child.id}
              item={child}
              depth={depth + 1}
              maxDepth={maxDepth}
              onUpdate={(patch) => {
                const next = [...item.children!];
                next[idx] = { ...next[idx], ...patch };
                onUpdate({ children: next });
              }}
              onRemove={() => {
                const next = item.children!.filter((_, i) => i !== idx);
                onUpdate({ children: next.length ? next : undefined });
              }}
              onAddChild={(type) => {
                const next = [...(item.children ?? []), newItem(type)];
                onUpdate({ children: next });
              }}
              onMoveUp={() => {
                if (idx === 0) return;
                const next = [...item.children!];
                [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                onUpdate({ children: next });
              }}
              onMoveDown={() => {
                if (idx >= item.children!.length - 1) return;
                const next = [...item.children!];
                [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                onUpdate({ children: next });
              }}
              canMoveUp={idx > 0}
              canMoveDown={idx < item.children!.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function MenuBuilder({ value, onChange, maxDepth = 2 }: MenuBuilderProps) {
  const { t } = useLang();
  const [addType, setAddType] = useState<MenuItem["type"]>("link");

  const moveItem = useCallback(
    (idx: number, delta: -1 | 1) => {
      const next = [...value];
      const target = idx + delta;
      if (target < 0 || target >= next.length) return;
      [next[idx], next[target]] = [next[target], next[idx]];
      onChange(next);
    },
    [value, onChange],
  );

  return (
    <div className="space-y-2">
      {/* Existing items */}
      <ul className="space-y-0.5">
        {value.length === 0 && (
          <li className="rounded-fq-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            {t("No menu items yet. Add one below.", "এখনো কোনো মেনু আইটেম নেই। নিচে যোগ করুন।")}
          </li>
        )}
        {value.map((item, idx) => (
          <li key={item.id}>
            <MenuItemRow
              item={item}
              depth={0}
              maxDepth={maxDepth}
              onUpdate={(patch) => {
                const next = [...value];
                next[idx] = { ...next[idx], ...patch };
                onChange(next);
              }}
              onRemove={() => onChange(value.filter((_, i) => i !== idx))}
              onAddChild={(type) => {
                const next = [...value];
                next[idx] = {
                  ...next[idx],
                  children: [...(next[idx].children ?? []), newItem(type)],
                };
                onChange(next);
              }}
              onMoveUp={() => moveItem(idx, -1)}
              onMoveDown={() => moveItem(idx, 1)}
              canMoveUp={idx > 0}
              canMoveDown={idx < value.length - 1}
            />
          </li>
        ))}
      </ul>

      {/* Add item */}
      <div className="flex gap-1">
        <select
          value={addType}
          onChange={(e) => setAddType(e.target.value as MenuItem["type"])}
          className="shrink-0 rounded-fq-md border border-border bg-card px-2 py-1.5 text-xs"
        >
          {(Object.keys(ITEM_TYPE_LABEL) as MenuItem["type"][]).map((key) => (
            <option key={key} value={key}>{t(ITEM_TYPE_LABEL[key].en, ITEM_TYPE_LABEL[key].bn)}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onChange([...value, newItem(addType)])}
          className="flex-1 rounded-fq-md border border-border px-2 py-1.5 text-xs hover:bg-muted"
        >
          + {t("Add menu item", "মেনু আইটেম যোগ")}
        </button>
      </div>

      {/* Help text */}
      <p className="text-[10px] text-muted-foreground">
        {t(
          "Drag ▲▼ to reorder. Toggle mega menu on top items for multi-column dropdowns. Max depth: 2 levels.",
          "সাজাতে ▲▼ টেনে নিন। মাল্টি-কলাম ড্রপডাউনের জন্য শীর্ষ আইটেমে মেগা মেনু চালু করুন। সর্বোচ্চ গভীরতা: ২ স্তর।",
        )}
      </p>
    </div>
  );
}
