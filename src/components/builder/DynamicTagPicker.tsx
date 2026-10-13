/**
 * Dynamic-tag picker — the insert UI for `{{group.field}}` bindings.
 *
 * Dynamic tags resolve fine (see `@/lib/dynamic-tags`) but authors had to
 * hand-type them, and a typo silently became a fallback/empty string. This
 * popover lists every `DYNAMIC_TAGS` entry with a sample output and inserts
 * `dynamicTag(key)` at the textarea/input cursor, so only well-formed tags
 * can ever be produced.
 *
 * Swap-in (one import + one element, `SectionInspector.tsx` untouched):
 *
 *   import { DynamicTagPicker } from "./DynamicTagPicker";
 *   <DynamicTagPicker value={stringValue} onChange={(next) => …} />
 *
 * Insertion is plain-text splicing — tag content is never parsed as HTML.
 */
import { useId, useMemo, useRef, useState } from "react";
import {
  DYNAMIC_TAGS,
  SAMPLE_DYNAMIC_CONTEXT,
  dynamicTag,
  resolveDynamicText,
} from "@/lib/dynamic-tags";
import { useLang } from "@/lib/i18n";

/** The editable control the tag is inserted into. */
export type DynamicTagTarget = HTMLTextAreaElement | HTMLInputElement;

export type DynamicTagPickerProps = {
  /** Current control text; the tag is spliced into this string. */
  value: string;
  /** Receives the text with the tag inserted. */
  onChange: (next: string) => void;
  disabled?: boolean;
  /**
   * Ref of the textarea/input being edited. When it exposes a cursor the tag
   * lands there (replacing any selection); otherwise it appends at the end.
   */
  inputRef?: React.RefObject<DynamicTagTarget | null>;
  /** Renders the popover open on first paint (tests, previews). */
  defaultOpen?: boolean;
};

const KNOWN_KEYS = new Set(DYNAMIC_TAGS.map((tag) => tag.value));

/** Full-anchored tag grammar: `{{ group.field }}` with optional `|fallback`. */
const WELLFORMED_RE = /^\{\{\s*[A-Za-z]+\.[A-Za-z]+\s*(\|[^}]*)?\}\}$/;

export function isKnownTagKey(key: string): boolean {
  return KNOWN_KEYS.has(key);
}

export function isWellFormedTag(text: string): boolean {
  return WELLFORMED_RE.test(text);
}

export type TagInsertion = { text: string; cursor: number };

function clampOffset(raw: number | null | undefined, length: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return length;
  return Math.max(0, Math.min(Math.floor(raw), length));
}

/**
 * Splices `dynamicTag(key)` into `value` at `[start, end)`. Unknown keys
 * return `null` so no write happens; a missing cursor appends at the end.
 * `cursor` is where the caret goes after the insert.
 */
export function insertDynamicTag(
  value: string,
  key: string,
  start: number | null | undefined,
  end: number | null | undefined,
): TagInsertion | null {
  if (!isKnownTagKey(key)) return null;
  const tag = dynamicTag(key);
  let from = clampOffset(start, value.length);
  let to = clampOffset(end, value.length);
  if (from > to) [from, to] = [to, from];
  return {
    text: value.slice(0, from) + tag + value.slice(to),
    cursor: from + tag.length,
  };
}

/** Case-insensitive filter over label, key, and group. */
export function filterDynamicTags(
  query: string,
): { value: string; label: string; group: string }[] {
  const q = query.trim().toLowerCase();
  if (!q) return DYNAMIC_TAGS;
  return DYNAMIC_TAGS.filter(
    (tag) =>
      tag.label.toLowerCase().includes(q) ||
      tag.value.toLowerCase().includes(q) ||
      tag.group.toLowerCase().includes(q),
  );
}

/** Sample output for one catalog key ("" when the sample context is empty). */
export function exampleOutputFor(key: string): string {
  if (!isKnownTagKey(key)) return "";
  return resolveDynamicText(dynamicTag(key), SAMPLE_DYNAMIC_CONTEXT);
}

export type TagPickerStepResult = {
  action: "close" | "pick" | "none";
  active: number;
};

/**
 * Pure key handler for the popover. The component delegates its `onKeyDown`
 * to this, so Escape/arrows/Enter are unit-testable without a DOM.
 */
export function tagPickerStep(args: {
  key: string;
  active: number;
  count: number;
}): TagPickerStepResult {
  if (args.key === "Escape") return { action: "close", active: args.active };
  if (args.count <= 0) return { action: "none", active: 0 };
  const max = args.count - 1;
  if (args.key === "ArrowDown")
    return { action: "none", active: Math.min(args.active + 1, max) };
  if (args.key === "ArrowUp")
    return { action: "none", active: Math.max(args.active - 1, 0) };
  if (args.key === "Enter")
    return { action: "pick", active: Math.max(0, Math.min(args.active, max)) };
  return { action: "none", active: args.active };
}

export function DynamicTagPicker({
  value,
  onChange,
  disabled,
  inputRef,
  defaultOpen,
}: DynamicTagPickerProps) {
  const { t } = useLang();
  const [open, setOpen] = useState(defaultOpen ?? false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const baseId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const listId = `dtags-${baseId}`;

  const filtered = useMemo(() => filterDynamicTags(query), [query]);
  const highlight =
    filtered.length === 0 ? 0 : Math.min(active, filtered.length - 1);

  const close = () => {
    setOpen(false);
    setQuery("");
    setActive(0);
  };

  const pick = (key: string) => {
    if (disabled) return;
    const el = inputRef?.current ?? null;
    const next = insertDynamicTag(
      value,
      key,
      el && typeof el.selectionStart === "number" ? el.selectionStart : null,
      el && typeof el.selectionEnd === "number" ? el.selectionEnd : null,
    );
    if (!next) return;
    onChange(next.text);
    close();
    if (el) {
      try {
        el.focus();
        el.setSelectionRange(next.cursor, next.cursor);
      } catch {
        // Non-text inputs (or detached nodes) reject caret moves — the text
        // itself is already committed via onChange.
      }
    }
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const step = tagPickerStep({
      key: event.key,
      active,
      count: filtered.length,
    });
    if (step.action === "close") {
      event.preventDefault();
      close();
      return;
    }
    // Arrows/Enter belong to the search field; the trigger button keeps its
    // native Space/Enter click behavior.
    if (event.target !== searchRef.current) return;
    if (step.action === "pick") {
      event.preventDefault();
      const item = filtered[step.active];
      if (item) pick(item.value);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive(step.active);
    }
  };

  const showPopover = open && !disabled;

  return (
    <div
      className="relative inline-block"
      data-dynamic-tag-picker
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={showPopover}
        onClick={() => {
          if (open) {
            close();
          } else {
            setOpen(true);
            window.setTimeout(() => searchRef.current?.focus(), 0);
          }
        }}
        className="rounded-fq-sm border border-border px-2 py-1 text-[0.65rem] text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        title={t("Insert dynamic data", "ডাইনামিক ডেটা ঢোকান")}
      >
        {"{{}}"}
      </button>
      {showPopover && (
        <div
          role="dialog"
          aria-label={t("Insert a dynamic tag", "ডাইনামিক ট্যাগ ঢোকান")}
          className="absolute left-0 z-50 mt-1 w-72 rounded-fq-md border border-border bg-card shadow-xl"
        >
          <div className="border-b border-border p-2">
            <input
              ref={searchRef}
              type="text"
              value={query}
              aria-label={t("Search tags", "ট্যাগ খুঁজুন")}
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={
                filtered.length > 0 ? `${listId}-${highlight}` : undefined
              }
              placeholder={t("Search tags…", "ট্যাগ খুঁজুন…")}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              className="w-full rounded-fq-sm border border-border bg-card px-2 py-1 text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul
            id={listId}
            role="listbox"
            aria-label={t("Dynamic tags", "ডাইনামিক ট্যাগ")}
            className="max-h-64 overflow-y-auto p-1"
          >
            {filtered.length === 0 && (
              <li className="px-3 py-4 text-center text-xs text-muted-foreground">
                {t("No tags match.", "কোনো ট্যাগ মেলেনি।")}
              </li>
            )}
            {filtered.map((tag, index) => {
              const preview = exampleOutputFor(tag.value);
              return (
                <li
                  key={tag.value}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === highlight}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => pick(tag.value)}
                  className={`cursor-pointer rounded-fq-sm px-2 py-1.5 ${
                    index === highlight
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-muted"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-medium">{tag.label}</span>
                    <span className="shrink-0 text-[0.6rem] text-muted-foreground">
                      {tag.group}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-[0.65rem] text-muted-foreground">
                    {preview || dynamicTag(tag.value)}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="border-t border-border px-3 py-1.5 text-[0.6rem] text-muted-foreground">
            {t(
              "Inserts at the cursor. Unknown tags never render as braces.",
              "কার্সরে ঢোকানো হয়। অজানা ট্যাগ কখনো ব্রেস হিসেবে দেখায় না।",
            )}
          </p>
        </div>
      )}
    </div>
  );
}
