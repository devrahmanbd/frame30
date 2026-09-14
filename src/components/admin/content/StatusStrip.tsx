import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";
import { STATUS_LABEL, statusTabs, type StatusCounts, type StatusView } from "@/lib/content-desk";

/**
 * WordPress status links: `All (12) | Published (9) | Drafts (2) | Trash (1)`.
 * Plain text links separated by hairlines — deliberately not the saved-view
 * chip row, which sits in the toolbar below.
 */
export function StatusStrip({
  counts,
  active,
  onSelect,
}: {
  counts: StatusCounts;
  active: StatusView;
  onSelect: (view: StatusView) => void;
}) {
  const { lang } = useLang();
  const tabs = statusTabs(counts);
  return (
    <nav aria-label="Status" className="mb-3 flex flex-wrap items-center gap-x-1 text-sm">
      {tabs.map((t, i) => {
        const isActive = t.view === active;
        return (
          <span key={t.view} className="flex items-center">
            {i > 0 ? <span aria-hidden className="mx-1.5 h-3.5 w-px bg-border" /> : null}
            <button
              type="button"
              aria-current={isActive ? "page" : undefined}
              onClick={() => onSelect(t.view)}
              className={cn(
                "fq-focus-glow inline-flex min-h-8 items-center gap-1 rounded-fq-sm px-1.5 outline-none transition-colors duration-150",
                isActive ? "font-semibold text-foreground" : "fq-sub hover:text-foreground",
                t.view === "trash" && !isActive && "hover:text-[var(--fq-danger)]",
              )}
            >
              {STATUS_LABEL[t.view][lang === "bn" ? "bn" : "en"]}
              <span className={cn("fq-num", isActive ? "text-foreground/70" : "opacity-70")}>({t.count})</span>
            </button>
          </span>
        );
      })}
    </nav>
  );
}
