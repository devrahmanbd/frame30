import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "@/lib/i18n";

export type FinderAction = {
  id: string;
  label: string;
  section?: string;
  shortcut?: string;
  run: () => void;
};
export type FinderPaletteProps = {
  open: boolean;
  onClose: () => void;
  actions: FinderAction[];
};

export function FinderPalette({ open, onClose, actions }: FinderPaletteProps) {
  const { t } = useLang();
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = useMemo(() => {
    if (!query.trim()) return actions;
    const q = query.toLowerCase();
    return actions.filter(
      (a) =>
        a.label.toLowerCase().includes(q) ||
        (a.section ?? "").toLowerCase().includes(q),
    );
  }, [query, actions]);
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);
  const runAction = useCallback(
    (idx: number) => {
      const a = filtered[idx];
      if (a) {
        a.run();
        onClose();
      }
    },
    [filtered, onClose],
  );
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/30 backdrop-blur-sm">
      <div
        role="combobox"
        aria-label={t("Finder", "ফাইন্ডার")}
        className="w-full max-w-md overflow-hidden rounded-fq-lg border border-border bg-card shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <svg
            className="size-4 shrink-0 text-muted-foreground"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelectedIdx((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                runAction(selectedIdx);
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
            placeholder={t(
              "Search actions, templates, widgets…",
              "অ্যাকশন, টেমপ্লেট, উইজেট খুঁজুন…",
            )}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
            ESC
          </kbd>
        </div>
        <ul className="max-h-72 overflow-y-auto p-1" role="listbox">
          {filtered.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">
              {t("No results", "কোনো ফলাফল নেই")}
            </li>
          )}
          {filtered.map((action, idx) => (
            <li
              key={action.id}
              role="option"
              aria-selected={idx === selectedIdx}
              onMouseEnter={() => setSelectedIdx(idx)}
              onClick={() => runAction(idx)}
              className={`flex cursor-pointer items-center gap-3 rounded-fq-md px-3 py-2 text-sm ${idx === selectedIdx ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"}`}
            >
              <span className="flex-1 truncate">{action.label}</span>
              {action.shortcut && (
                <kbd className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {action.shortcut}
                </kbd>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
