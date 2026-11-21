/**
 * LinkListEditor: Structured link repeater for footer sitemaps, headers, and navigation.
 *
 * Allows merchants to visually add, reorder, edit, and remove links without
 * manual pipe-delimited syntax ("Label|/url") or comma-separated lists.
 * Provides 100% backward compatibility for legacy strings.
 */
import { useMemo } from "react";
import { useLang } from "@/lib/i18n";
import { parseLinkList } from "./chrome";
import type { StructuredLink } from "@/lib/builder-ast";

export interface LinkListEditorProps {
  value: unknown;
  onChange: (links: StructuredLink[]) => void;
  locale?: string;
  disabled?: boolean;
}

export function LinkListEditor({
  value,
  onChange,
  disabled = false,
}: LinkListEditorProps) {
  const { t } = useLang();

  // Normalize incoming value: array or legacy string
  const links: StructuredLink[] = useMemo(() => {
    if (Array.isArray(value)) {
      return value.map((item) => {
        if (!item || typeof item !== "object") {
          return { label: "", href: "" };
        }
        const record = item as Record<string, unknown>;
        return {
          label: typeof record.label === "string" ? record.label : "",
          href: typeof record.href === "string" ? record.href : "",
          ...(typeof record.label_bn === "string" && record.label_bn
            ? { label_bn: record.label_bn }
            : {}),
        };
      });
    }
    if (typeof value === "string" && value.trim()) {
      return parseLinkList(value);
    }
    return [];
  }, [value]);

  const updateItem = (
    index: number,
    field: "label" | "href" | "label_bn",
    val: string,
  ) => {
    const next = links.map((item, i) => {
      if (i !== index) return item;
      const updated = { ...item, [field]: val };
      if (field === "label_bn" && !val) {
        delete updated.label_bn;
      }
      return updated;
    });
    onChange(next);
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= links.length || from === to) return;
    const next = [...links];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    onChange(next);
  };

  const remove = (index: number) => {
    onChange(links.filter((_, i) => i !== index));
  };

  const addLink = () => {
    onChange([...links, { label: "", href: "" }]);
  };

  return (
    <div className="space-y-3" data-testid="link-list-editor">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">
          {t("Links", "লিংকসমূহ")}
        </span>
        <span className="text-[0.65rem] text-muted-foreground">
          {links.length} {links.length === 1 ? t("link", "লিংক") : t("links", "লিংক")}
        </span>
      </div>

      {links.length === 0 ? (
        <div className="rounded-fq-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
          {t("No links configured yet.", "এখনও কোনো লিংক যোগ করা হয়নি।")}
        </div>
      ) : (
        <ul className="space-y-2">
          {links.map((link, index) => {
            const hasMissingLabel = !link.label.trim() && Boolean(link.href.trim());
            return (
              <li
                key={index}
                className="rounded-fq-md border border-border bg-card p-2.5 space-y-2 shadow-xs"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold truncate text-foreground">
                    {link.label.trim() || t(`Link #${index + 1}`, `লিংক #${index + 1}`)}
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
                      disabled={disabled || index === links.length - 1}
                      onClick={() => move(index, index + 1)}
                      className="rounded-fq-sm border border-border px-1.5 py-0.5 text-[0.65rem] disabled:opacity-30 hover:bg-muted"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      aria-label={t("Remove link", "লিংক মুছুন")}
                      disabled={disabled}
                      onClick={() => remove(index)}
                      className="rounded-fq-sm border border-destructive/40 px-1.5 py-0.5 text-[0.65rem] text-destructive hover:bg-destructive/10"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[0.68rem] text-muted-foreground mb-1">
                      {t("Label", "লেবেল")}
                    </label>
                    <input
                      type="text"
                      disabled={disabled}
                      value={link.label}
                      onChange={(e) => updateItem(index, "label", e.target.value)}
                      placeholder={t("e.g. Silk Sarees", "উদাঃ সিল্ক শাড়ি")}
                      className="w-full rounded-fq-sm border border-input bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-[0.68rem] text-muted-foreground mb-1">
                      {t("Label (বাংলা, optional)", "লেবেল (বাংলা, ঐচ্ছিক)")}
                    </label>
                    <input
                      type="text"
                      disabled={disabled}
                      value={link.label_bn ?? ""}
                      onChange={(e) => updateItem(index, "label_bn", e.target.value)}
                      placeholder="সিল্ক শাড়ি"
                      className="w-full rounded-fq-sm border border-input bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[0.68rem] text-muted-foreground mb-1">
                    {t("Destination URL", "গন্তব্য লিংক")}
                  </label>
                  <input
                    type="text"
                    disabled={disabled}
                    value={link.href}
                    onChange={(e) => updateItem(index, "href", e.target.value)}
                    placeholder="/c/sarees or https://..."
                    className="w-full rounded-fq-sm border border-input bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
                  />
                </div>

                {hasMissingLabel && (
                  <p className="text-[0.65rem] text-destructive font-medium">
                    {t("Please enter a link label.", "দয়া করে লিংকের লেবেল দিন।")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={addLink}
        className="w-full rounded-fq-sm border border-dashed border-border py-1.5 text-xs font-medium text-foreground hover:bg-muted/60 transition-colors"
      >
        + {t("Add link", "নতুন লিংক যোগ করুন")}
      </button>
    </div>
  );
}
