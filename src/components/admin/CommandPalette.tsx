/**
 * `⌘K` palette for `/admin` — the real navigation of the console.
 *
 * It searches every destination the actor is allowed to see: the eight sidebar
 * sections *and* the destinations that no longer earn a sidebar row. Recently
 * visited pages lead when the query is empty, so the palette replaces a deep
 * menu tree rather than duplicating it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { HIDDEN_DESTINATIONS, type NavGroup, type NavItem } from "@/lib/console-nav";
import type { Permission } from "@/lib/authz";

const RECENTS_KEY = "fq.admin.recents";
const RECENTS_MAX = 5;

function readRecents(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}

type Entry = { item: NavItem; section: string; sectionBn: string };

export function CommandPalette({
  open,
  onClose,
  groups,
  can,
}: {
  open: boolean;
  onClose: () => void;
  groups: readonly NavGroup[];
  /** Same affordance check the shell uses; hidden destinations respect it too. */
  can?: (permission?: Permission) => boolean;
}) {
  const { t } = useLang();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [recents, setRecents] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const flat = useMemo<Entry[]>(() => {
    const visible = groups.flatMap((g) =>
      [...g.items, ...(g.more ?? [])].map((item) => ({
        item,
        section: g.en,
        sectionBn: g.bn,
      })),
    );
    const more = HIDDEN_DESTINATIONS.filter((i) => (can ? can(i.permission) : true)).map(
      (item) => ({ item, section: "More", sectionBn: "আরও" }),
    );
    return [...visible, ...more];
  }, [groups, can]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      const recent = recents
        .map((to) => flat.find((e) => e.item.to === to))
        .filter((e): e is Entry => Boolean(e))
        .map((e) => ({ ...e, section: "Recent", sectionBn: "সাম্প্রতিক" }));
      const rest = flat.filter((e) => !recents.includes(e.item.to));
      return [...recent, ...rest].slice(0, 14);
    }
    return flat
      .filter(
        ({ item, section }) =>
          item.en.toLowerCase().includes(q) ||
          item.bn.includes(query.trim()) ||
          item.to.includes(q) ||
          section.toLowerCase().includes(q),
      )
      .slice(0, 14);
  }, [flat, query, recents]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      setRecents(readRecents());
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [cursor, results.length]);

  const go = useCallback(
    (item: NavItem | undefined) => {
      if (!item) return;
      const next = [item.to, ...readRecents().filter((x) => x !== item.to)].slice(0, RECENTS_MAX);
      try {
        window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      } catch {
        /* private mode — recents are a convenience, never a requirement */
      }
      onClose();
      void navigate({ to: item.to });
    },
    [navigate, onClose],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/30 p-4 pt-24 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Search the console", "কনসোলে খুঁজুন")}
        className="w-full max-w-lg overflow-hidden rounded-fq-lg border border-border bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => (results.length ? (c + 1) % results.length : 0));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => (results.length ? (c - 1 + results.length) % results.length : 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(results[cursor]?.item);
              }
            }}
            placeholder={t("Jump to any page…", "যেকোনো পেজে যান…")}
            aria-label={t("Search the console", "কনসোলে খুঁজুন")}
            className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border border-border px-1 text-[10px] fq-sub">esc</kbd>
        </div>
        <ul ref={listRef} className="max-h-80 overflow-y-auto p-1">
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-sm fq-sub">
              {t("No matching page", "কোনো পেজ মেলেনি")}
            </li>
          )}
          {results.map(({ item, section, sectionBn }, index) => (
            <li key={`${section}:${item.to}`}>
              <button
                type="button"
                data-active={index === cursor}
                onMouseEnter={() => setCursor(index)}
                onClick={() => go(item)}
                aria-selected={index === cursor}
                className={`flex w-full items-center justify-between gap-3 rounded-fq-md px-3 py-2 text-left text-sm transition-colors duration-150 ${
                  index === cursor ? "bg-primary/10 text-foreground" : "text-foreground"
                }`}
              >
                <span className="truncate">{t(item.en, item.bn)}</span>
                <span className="shrink-0 text-xs fq-sub">{t(section, sectionBn)}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3 border-t border-border px-3 py-2 text-[11px] fq-sub">
          <span>↑↓ {t("navigate", "চলাচল")}</span>
          <span>↵ {t("open", "খুলুন")}</span>
          <span className="ml-auto">⌘K</span>
        </div>
      </div>
    </div>
  );
}
