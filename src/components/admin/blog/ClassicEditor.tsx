/**
 * Phase 1 — the Classic-Editor writing surface.
 *
 * Two tabs over one document, exactly like WordPress: *Visual* edits blocks
 * through `contenteditable`, *Text* edits the canonical markup, and switching
 * is lossless because both sides go through `blog-body.ts`.
 *
 * Deliberately no editor framework. ProseMirror/Slate/TipTap start around
 * 100 kB gzipped before a single plugin, and this surface needs eight block
 * types and four inline marks. What we pay instead is the discipline below:
 *
 *  - **Uncontrolled contenteditable.** React never rewrites the DOM of a block
 *    being typed in (that is what destroys the caret); we seed `innerHTML` once
 *    per block identity and read it back on input, debounced.
 *  - **Sanitise on the way in, always.** Every read from the DOM goes through
 *    `parseInline`, so a paste from Word cannot smuggle markup into state, and
 *    the state we hand upward is already canonical.
 *  - **Zero-CLS images.** Insertion measures the real intrinsic size before it
 *    writes a block, and alt text is required by the same rule the server
 *    enforces — the editor cannot produce something the API would reject.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronsRight,
  Code2,
  Eraser,
  HelpCircle,
  Image as ImageIcon,
  Italic,
  Keyboard,
  Link2,
  List,
  ListOrdered,
  Minus,
  Omega,
  Quote,
  Redo2,
  Scissors,
  Strikethrough,
  Underline,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MediaPicker } from "@/components/builder/MediaPicker";
import { useLang } from "@/lib/i18n";
import { btnGhost, inputClass } from "@/components/admin/MarketingUi";
import {
  BLOCK_LABEL,
  blockEditableHtml,
  blockFromEditableHtml,
  bodyStats,
  emptyBlock,
  inlineToHtml,
  parseBody,
  parseInline,
  safeUrl,
  serializeBody,
  validateBody,
  type Block,
  type BlockType,
  type HeadingLevel,
  type TextAlign,
} from "@/lib/blog-body";

type Tab = "visual" | "text";

const TEXT_BLOCKS: BlockType[] = ["paragraph", "heading", "quote"];

/** Measure an image before inserting it, so the block always has dimensions. */
function measureImage(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve({ width: 0, height: 0 });
    const image = new window.Image();
    // A dead CDN must not hang the editor; fall back to manual entry.
    const timer = window.setTimeout(() => resolve({ width: 0, height: 0 }), 6000);
    image.onload = () => {
      window.clearTimeout(timer);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      resolve({ width: 0, height: 0 });
    };
    image.src = url;
  });
}

/**
 * One uncontrolled rich line.
 *
 * `seed` is applied on mount and whenever the caller bumps `seedKey` (a block
 * replacement, a tab switch, a revision restore) — never on every keystroke.
 */
function Editable({
  seed,
  seedKey,
  ariaLabel,
  className,
  onCommit,
  onFocus,
  plainPaste = false,
}: {
  seed: string;
  seedKey: string;
  ariaLabel: string;
  className?: string;
  onCommit: (html: string) => void;
  onFocus?: () => void;
  plainPaste?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (node && node.innerHTML !== seed) node.innerHTML = seed;
    // Intentionally keyed on identity only: re-seeding on every `seed` change
    // would fight the user's caret while they type.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

  return (
    <div
      ref={ref}
      role="textbox"
      tabIndex={0}
      aria-multiline="false"
      aria-label={ariaLabel}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      className={className}
      onFocus={onFocus}
      onInput={(event) => onCommit((event.target as HTMLDivElement).innerHTML)}
      onBlur={(event) => onCommit((event.target as HTMLDivElement).innerHTML)}
      onPaste={(event) => {
        // Paste is where hostile and bloated markup arrives. Take the HTML,
        // run it through the allow-list, and insert the clean result.
        event.preventDefault();
        const html = event.clipboardData.getData("text/html");
        const text = event.clipboardData.getData("text/plain");
        const clean = html && !plainPaste ? inlineToHtml(parseInline(html)) : inlineToHtml(parseInline(text.replace(/[<>]/g, (c) => (c === "<" ? "&lt;" : "&gt;"))));
        document.execCommand("insertHTML", false, clean);
        const node = event.currentTarget as HTMLDivElement;
        onCommit(node.innerHTML);
      }}
    />
  );
}

export function ClassicEditor({
  value,
  onChange,
  disabled,
  variant = "card",
  history,
  placeholder,
  onHelp,
}: {
  value: string;
  onChange: (body: string) => void;
  disabled?: boolean;
  /** `takeover` drops the outer card so the shell canvas owns the frame. */
  variant?: "card" | "takeover";
  /** Document-level undo/redo (Phase 12 shell) — rendered on the second toolbar row. */
  history?: { canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void };
  placeholder?: string;
  onHelp?: () => void;
}) {
  const { t } = useLang();
  const helpId = useId();
  const [tab, setTab] = useState<Tab>("visual");
  const [secondRow, setSecondRow] = useState(false);
  const [pasteAsText, setPasteAsText] = useState(false);
  const [blocks, setBlocks] = useState<Block[]>(() => parseBody(value));
  const [active, setActive] = useState(0);
  const [textBuffer, setTextBuffer] = useState(value);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [seedEpoch, setSeedEpoch] = useState(0);
  /** Ids survive edits so `Editable` keeps its caret; index alone would not. */
  const idsRef = useRef<string[]>(blocks.map((_, index) => `b${index}`));
  const nextId = useRef(blocks.length);
  const lastEmitted = useRef(value);

  // Adopt an external change (revision restore, draft recovery, article switch)
  // without clobbering what the writer is typing.
  useEffect(() => {
    if (value === lastEmitted.current) return;
    const parsed = parseBody(value);
    setBlocks(parsed);
    idsRef.current = parsed.map(() => `b${nextId.current++}`);
    setTextBuffer(value);
    setSeedEpoch((epoch) => epoch + 1);
    lastEmitted.current = value;
  }, [value]);

  const emit = useCallback(
    (next: Block[]) => {
      setBlocks(next);
      const serialized = serializeBody(next);
      lastEmitted.current = serialized;
      setTextBuffer(serialized);
      onChange(serialized);
    },
    [onChange],
  );

  const idAt = (index: number) => idsRef.current[index] ?? `b${index}`;

  const patch = (index: number, block: Block) => {
    const next = blocks.slice();
    next[index] = block;
    emit(next);
  };

  const insertAt = (index: number, block: Block) => {
    const next = blocks.slice();
    next.splice(index, 0, block);
    idsRef.current.splice(index, 0, `b${nextId.current++}`);
    emit(next);
    setActive(index);
    setSeedEpoch((epoch) => epoch + 1);
  };

  const removeAt = (index: number) => {
    const next = blocks.slice();
    next.splice(index, 1);
    idsRef.current.splice(index, 1);
    emit(next.length ? next : [emptyBlock("paragraph")]);
    setActive(Math.max(0, index - 1));
    setSeedEpoch((epoch) => epoch + 1);
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= blocks.length) return;
    const next = blocks.slice();
    const [block] = next.splice(index, 1);
    next.splice(target, 0, block!);
    const [id] = idsRef.current.splice(index, 1);
    idsRef.current.splice(target, 0, id!);
    emit(next);
    setActive(target);
    setSeedEpoch((epoch) => epoch + 1);
  };

  /** Inline marks use execCommand: the one browser API that respects selection. */
  const mark = (command: "bold" | "italic" | "underline" | "strikeThrough" | "removeFormat" | "insertText", arg?: string) => {
    document.execCommand(command, false, arg);
    // execCommand mutates the DOM directly; the block's onInput will not fire.
    const node = document.activeElement as HTMLElement | null;
    if (node?.isContentEditable) commitActive(node.innerHTML);
  };

  const commitActive = (html: string) => {
    const block = blocks[active];
    if (!block) return;
    if (!TEXT_BLOCKS.includes(block.type)) return;
    patch(active, blockFromEditableHtml(block, html));
  };

  const applyLink = () => {
    const raw = window.prompt(t("Link URL", "লিঙ্কের ঠিকানা") ?? "URL", "https://");
    if (!raw) return;
    const href = safeUrl(raw);
    if (!href) {
      window.alert(t("That link is not allowed.", "এই লিঙ্ক গ্রহণযোগ্য নয়।"));
      return;
    }
    document.execCommand("createLink", false, href);
    const node = document.activeElement as HTMLElement | null;
    if (node?.isContentEditable) commitActive(node.innerHTML);
  };

  const changeType = (type: BlockType, level?: HeadingLevel) => {
    const block = blocks[active];
    if (!block) return;
    const inline = "inline" in block ? block.inline : [];
    const replacement: Block =
      type === "heading"
        ? { type: "heading", level: level ?? 2, inline }
        : type === "paragraph"
          ? { type: "paragraph", inline }
          : type === "quote"
            ? { type: "quote", inline }
            : emptyBlock(type);
    patch(active, replacement);
    idsRef.current[active] = `b${nextId.current++}`;
    setSeedEpoch((epoch) => epoch + 1);
  };

  const setAlign = (align: TextAlign) => {
    const block = blocks[active];
    if (!block || (block.type !== "paragraph" && block.type !== "heading")) return;
    const next = { ...block } as Block & { align?: TextAlign };
    if (align === "left") delete next.align;
    else next.align = align;
    patch(active, next);
  };

  const currentAlign: TextAlign = (() => {
    const block = blocks[active] as (Block & { align?: TextAlign }) | undefined;
    return block?.align ?? "left";
  })();

  /** ≡ / 1. — convert the active text block into a list, or flip an existing list's order. */
  const toggleList = (ordered: boolean) => {
    const block = blocks[active];
    if (!block) return;
    if (block.type === "list") {
      if (block.ordered === ordered) {
        patch(active, { type: "paragraph", inline: block.items[0] ?? [] });
      } else {
        patch(active, { ...block, ordered });
      }
    } else {
      const inline = "inline" in block ? block.inline : [];
      patch(active, { type: "list", ordered, items: [inline] });
    }
    idsRef.current[active] = `b${nextId.current++}`;
    setSeedEpoch((epoch) => epoch + 1);
  };

  const insertSpecial = (char: string) => {
    const node = document.activeElement as HTMLElement | null;
    if (node?.isContentEditable) {
      document.execCommand("insertText", false, char);
      commitActive(node.innerHTML);
    }
  };

  const insertImage = async (url: string) => {
    setMediaOpen(false);
    const { width, height } = await measureImage(url);
    insertAt(active + 1, { type: "image", src: url, alt: "", width, height, caption: "" });
  };

  const stats = useMemo(() => bodyStats(blocks), [blocks]);
  const issues = useMemo(() => validateBody(blocks), [blocks]);
  const hasMore = blocks.some((block) => block.type === "more");

  const switchTab = (next: Tab) => {
    if (next === tab) return;
    if (next === "visual") {
      // Text → Visual: re-parse whatever the writer typed, sanitising it.
      const parsed = parseBody(textBuffer);
      idsRef.current = parsed.map(() => `b${nextId.current++}`);
      emit(parsed);
      setSeedEpoch((epoch) => epoch + 1);
    } else {
      setTextBuffer(serializeBody(blocks));
    }
    setTab(next);
  };

  const tool = (active?: boolean) =>
    cn(
      "fq-focus-glow inline-flex size-8 shrink-0 items-center justify-center rounded-fq-md text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40",
      active && "bg-foreground text-background hover:bg-foreground",
    );
  const activeBlock = blocks[active];
  const isText = !!activeBlock && TEXT_BLOCKS.includes(activeBlock.type);

  return (
    <div className={cn(variant === "card" ? "rounded-fq-md border border-border bg-card" : "bg-transparent")}>
      {/* Row 1 — Classic layout: Paragraph ▾ · B I U S · " · ≡ · 1. · link · image · align · more · ⌨ */}
      <div className={cn("flex flex-wrap items-center gap-0.5 px-2 py-1.5", variant === "card" ? "border-b border-border" : "sticky top-0 z-10 rounded-t-fq-md border border-border bg-card")}>
        {tab === "visual" && (
          <div className="flex flex-wrap items-center gap-0.5" role="toolbar" aria-label={t("Formatting", "ফরম্যাটিং")}>
            <select
              className={`${inputClass} h-8 w-auto min-w-28 py-0 text-xs`}
              aria-label={t("Block type", "ব্লকের ধরন")}
              disabled={disabled}
              value={
                blocks[active]?.type === "heading"
                  ? `heading${(blocks[active] as { level: HeadingLevel }).level}`
                  : (blocks[active]?.type ?? "paragraph")
              }
              onChange={(event) => {
                const raw = event.target.value;
                if (raw.startsWith("heading")) changeType("heading", Number(raw.slice(7)) as HeadingLevel);
                else changeType(raw as BlockType);
              }}
            >
              <option value="paragraph">{t(BLOCK_LABEL.paragraph.en, BLOCK_LABEL.paragraph.bn)}</option>
              <option value="heading2">{t("Heading 2", "শিরোনাম ২")}</option>
              <option value="heading3">{t("Heading 3", "শিরোনাম ৩")}</option>
              <option value="heading4">{t("Heading 4", "শিরোনাম ৪")}</option>
              <option value="quote">{t(BLOCK_LABEL.quote.en, BLOCK_LABEL.quote.bn)}</option>
              <option value="list">{t(BLOCK_LABEL.list.en, BLOCK_LABEL.list.bn)}</option>
              <option value="code">{t("Preformatted", "প্রি-ফরম্যাটেড")}</option>
              <option value="table">{t(BLOCK_LABEL.table.en, BLOCK_LABEL.table.bn)}</option>
            </select>
            <span aria-hidden className="mx-1 h-5 w-px bg-border" />
            <button type="button" className={tool()} disabled={disabled} onClick={() => mark("bold")} aria-label={t("Bold", "বোল্ড")} title={`${t("Bold", "বোল্ড")} (⌘B)`}>
              <Bold className="size-4" aria-hidden />
            </button>
            <button type="button" className={tool()} disabled={disabled} onClick={() => mark("italic")} aria-label={t("Italic", "ইটালিক")} title={`${t("Italic", "ইটালিক")} (⌘I)`}>
              <Italic className="size-4" aria-hidden />
            </button>
            <button type="button" className={tool()} disabled={disabled} onClick={() => mark("underline")} aria-label={t("Underline", "আন্ডারলাইন")} title={`${t("Underline", "আন্ডারলাইন")} (⌘U)`}>
              <Underline className="size-4" aria-hidden />
            </button>
            <button type="button" className={tool()} disabled={disabled} onClick={() => mark("strikeThrough")} aria-label={t("Strikethrough", "স্ট্রাইকথ্রু")}>
              <Strikethrough className="size-4" aria-hidden />
            </button>
            <span aria-hidden className="mx-1 h-5 w-px bg-border" />
            <button type="button" className={tool(activeBlock?.type === "quote")} disabled={disabled} onClick={() => changeType(activeBlock?.type === "quote" ? "paragraph" : "quote")} aria-label={t("Blockquote", "উদ্ধৃতি")}>
              <Quote className="size-4" aria-hidden />
            </button>
            <button type="button" className={tool(activeBlock?.type === "list" && !activeBlock.ordered)} disabled={disabled} onClick={() => toggleList(false)} aria-label={t("Bulleted list", "বুলেট তালিকা")}>
              <List className="size-4" aria-hidden />
            </button>
            <button type="button" className={tool(activeBlock?.type === "list" && activeBlock.ordered)} disabled={disabled} onClick={() => toggleList(true)} aria-label={t("Numbered list", "নম্বর তালিকা")}>
              <ListOrdered className="size-4" aria-hidden />
            </button>
            <span aria-hidden className="mx-1 h-5 w-px bg-border" />
            <button type="button" className={tool()} disabled={disabled} onClick={applyLink} aria-label={t("Insert link", "লিঙ্ক যোগ")} title={`${t("Insert link", "লিঙ্ক যোগ")} (⌘⇧K)`}>
              <Link2 className="size-4" aria-hidden />
            </button>
            <button type="button" className={tool(mediaOpen)} disabled={disabled} onClick={() => setMediaOpen((open) => !open)} aria-label={t("Add media", "মিডিয়া")} aria-expanded={mediaOpen}>
              <ImageIcon className="size-4" aria-hidden />
            </button>
            <span aria-hidden className="mx-1 h-5 w-px bg-border" />
            <button type="button" className={tool(currentAlign === "left" && isText)} disabled={disabled || !isText} onClick={() => setAlign("left")} aria-label={t("Align left", "বামে সাজান")}>
              <AlignLeft className="size-4" aria-hidden />
            </button>
            <button type="button" className={tool(currentAlign === "center")} disabled={disabled || !isText} onClick={() => setAlign("center")} aria-label={t("Align centre", "মাঝে সাজান")}>
              <AlignCenter className="size-4" aria-hidden />
            </button>
            <button type="button" className={tool(currentAlign === "right")} disabled={disabled || !isText} onClick={() => setAlign("right")} aria-label={t("Align right", "ডানে সাজান")}>
              <AlignRight className="size-4" aria-hidden />
            </button>
            <span aria-hidden className="mx-1 h-5 w-px bg-border" />
            <button
              type="button"
              className={tool()}
              disabled={disabled || hasMore}
              title={t("Insert Read More tag", "আরও পড়ুন ট্যাগ")}
              aria-label={t("Insert Read More tag", "আরও পড়ুন ট্যাগ")}
              onClick={() => insertAt(active + 1, emptyBlock("more"))}
            >
              <Scissors className="size-4" aria-hidden />
            </button>
            <button type="button" className={tool()} disabled={disabled} onClick={() => insertAt(active + 1, emptyBlock("hr"))} aria-label={t("Horizontal line", "অনুভূমিক রেখা")}>
              <Minus className="size-4" aria-hidden />
            </button>
            <button type="button" className={tool(secondRow)} onClick={() => setSecondRow((v) => !v)} aria-label={t("Toolbar toggle", "টুলবার টগল")} aria-expanded={secondRow} title={`${t("Toolbar toggle", "টুলবার টগল")} (⌥⇧Z)`}>
              <Keyboard className="size-4" aria-hidden />
            </button>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <p className="hidden text-xs tabular-nums text-muted-foreground sm:block" aria-live="polite">
            {stats.words} {t("words", "শব্দ")} · {stats.readingMinutes} {t("min", "মিনিট")}
          </p>
          <div role="tablist" aria-label={t("Editor mode", "সম্পাদনার ধরন")} className="flex rounded-fq-md border border-border p-0.5">
            {(["visual", "text"] as Tab[]).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className={cn("fq-focus-glow inline-flex min-h-8 items-center gap-1 rounded-[calc(var(--radius-fq-md)-2px)] px-2 text-xs font-medium", tab === key ? "fq-pill-active" : "text-muted-foreground hover:text-foreground")}
                onClick={() => switchTab(key)}
              >
                {key === "text" && <Code2 className="size-3.5" aria-hidden />}
                {key === "visual" ? t("Visual", "ভিজ্যুয়াল") : t("Code", "কোড")}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2 — toggled: paste as text · clear formatting · special char · indent · undo/redo · help */}
        {tab === "visual" && secondRow && (
          <div className="flex w-full flex-wrap items-center gap-0.5 border-t border-border pt-1.5" role="toolbar" aria-label={t("More formatting", "আরও ফরম্যাটিং")}>
            <button type="button" className={tool(pasteAsText)} onClick={() => setPasteAsText((v) => !v)} aria-pressed={pasteAsText} aria-label={t("Paste as text", "টেক্সট হিসেবে পেস্ট")} title={t("Paste as text", "টেক্সট হিসেবে পেস্ট")}>
              <span className="text-xs font-semibold">T</span>
            </button>
            <button type="button" className={tool()} disabled={disabled} onClick={() => mark("removeFormat")} aria-label={t("Clear formatting", "ফরম্যাট মুছুন")}>
              <Eraser className="size-4" aria-hidden />
            </button>
            <details className="relative">
              <summary className={cn(tool(), "list-none cursor-pointer")} aria-label={t("Special character", "বিশেষ অক্ষর")} title={t("Special character", "বিশেষ অক্ষর")}>
                <Omega className="size-4" aria-hidden />
              </summary>
              <div className="absolute left-0 top-full z-20 mt-1 grid w-56 grid-cols-8 gap-0.5 rounded-fq-md border border-border bg-popover p-1.5 shadow-lg">
                {["—", "–", "…", "©", "®", "™", "°", "±", "×", "÷", "→", "←", "↑", "↓", "•", "·", "«", "»", "‘", "’", "“", "”", "৳", "€", "£", "$", "¥", "½", "¼", "¾", "§", "¶"].map((ch) => (
                  <button key={ch} type="button" className="fq-focus-glow inline-flex size-6 items-center justify-center rounded text-sm hover:bg-muted" onMouseDown={(e) => e.preventDefault()} onClick={() => insertSpecial(ch)} aria-label={ch}>
                    {ch}
                  </button>
                ))}
              </div>
            </details>
            <button type="button" className={tool()} disabled={disabled || activeBlock?.type !== "quote"} onClick={() => changeType("paragraph")} aria-label={t("Decrease indent", "ইন্ডেন্ট কমান")}>
              <ChevronsRight className="size-4 rotate-180" aria-hidden />
            </button>
            <button type="button" className={tool()} disabled={disabled || !isText || activeBlock?.type === "quote"} onClick={() => changeType("quote")} aria-label={t("Increase indent", "ইন্ডেন্ট বাড়ান")}>
              <ChevronsRight className="size-4" aria-hidden />
            </button>
            {history && (
              <>
                <span aria-hidden className="mx-1 h-5 w-px bg-border" />
                <button type="button" className={tool()} disabled={!history.canUndo} onClick={history.undo} aria-label={t("Undo", "পূর্বাবস্থা")} title="⌘Z">
                  <Undo2 className="size-4" aria-hidden />
                </button>
                <button type="button" className={tool()} disabled={!history.canRedo} onClick={history.redo} aria-label={t("Redo", "পুনরায়")} title="⇧⌘Z">
                  <Redo2 className="size-4" aria-hidden />
                </button>
              </>
            )}
            {onHelp && (
              <button type="button" className={cn(tool(), "ml-auto")} onClick={onHelp} aria-label={t("Keyboard shortcuts", "কীবোর্ড শর্টকাট")} title="?">
                <HelpCircle className="size-4" aria-hidden />
              </button>
            )}
          </div>
        )}
      </div>

      {mediaOpen && (
        <div className="border-b border-border p-3">
          <MediaPicker value="" sizesPreset="full" disabled={disabled} onPick={(url) => void insertImage(url)} onSizes={() => {}} />
        </div>
      )}

      {tab === "text" ? (
        <textarea
          className={cn(inputClass, "min-h-80 rounded-none border-0 font-mono text-xs", variant === "takeover" && "min-h-[60vh] border border-t-0 border-border")}
          aria-label={t("Article markup", "লেখার মার্কআপ")}
          aria-describedby={helpId}
          value={textBuffer}
          disabled={disabled}
          onChange={(event) => {
            setTextBuffer(event.target.value);
            // Text mode is the raw truth while it is open; parse on commit so
            // typing "<p" mid-word does not rewrite the buffer under the caret.
            lastEmitted.current = event.target.value;
            onChange(event.target.value);
          }}
          onBlur={() => {
            const normalised = serializeBody(parseBody(textBuffer));
            setTextBuffer(normalised);
            lastEmitted.current = normalised;
            onChange(normalised);
          }}
        />
      ) : (
        <div className={cn("space-y-2 p-3", variant === "takeover" && "min-h-[60vh] rounded-b-fq-md border border-t-0 border-border bg-card px-4 py-5")}>
          {blocks.length === 0 && (
            <button type="button" className={btnGhost} onClick={() => insertAt(0, emptyBlock("paragraph"))}>
              {placeholder ?? t("Start writing", "লেখা শুরু করুন")}
            </button>
          )}
          {blocks.map((block, index) => (
            <div
              key={idAt(index)}
              className={`rounded-fq-md border p-2 ${index === active ? "border-primary" : "border-transparent"}`}
              onFocusCapture={() => setActive(index)}
            >
              <BlockEditor
                block={block}
                seedKey={`${idAt(index)}:${seedEpoch}`}
                disabled={disabled}
                plainPaste={pasteAsText}
                onChange={(next) => patch(index, next)}
              />
              <div className="mt-1 flex items-center gap-1 text-xs">
                <button type="button" className={btnGhost} onClick={() => move(index, -1)} aria-label={t("Move up", "উপরে")}>
                  ↑
                </button>
                <button type="button" className={btnGhost} onClick={() => move(index, 1)} aria-label={t("Move down", "নিচে")}>
                  ↓
                </button>
                <button type="button" className={btnGhost} onClick={() => removeAt(index)} aria-label={t("Remove block", "ব্লক মুছুন")}>
                  ✕
                </button>
                <span className="ml-auto text-muted-foreground">
                  {t(BLOCK_LABEL[block.type].en, BLOCK_LABEL[block.type].bn)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <p id={helpId} className={cn("px-3 py-2 text-xs text-muted-foreground", variant === "card" ? "border-t border-border" : "sr-only")}>
        {t(
          "Visual and Text edit the same document. Images need alt text and dimensions before the article can save.",
          "ভিজ্যুয়াল ও টেক্সট একই লেখা সম্পাদনা করে। সংরক্ষণের আগে ছবির বিকল্প লেখা ও মাপ দরকার।",
        )}
      </p>

      {issues.length > 0 && (
        <ul className="space-y-1 border-t border-warning bg-warning-soft px-3 py-2 text-sm">
          {issues.map((issue) => (
            <li key={`${issue.code}:${issue.blockIndex}`}>
              #{issue.blockIndex + 1} — {t(issue.en, issue.bn)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BlockEditor({
  block,
  seedKey,
  disabled,
  plainPaste,
  onChange,
}: {
  block: Block;
  seedKey: string;
  disabled?: boolean;
  plainPaste?: boolean;
  onChange: (block: Block) => void;
}) {
  const { t } = useLang();

  switch (block.type) {
    case "paragraph":
    case "quote":
    case "heading": {
      const size =
        block.type === "heading"
          ? block.level === 2
            ? "text-xl font-semibold"
            : block.level === 3
              ? "text-lg font-semibold"
              : "text-base font-semibold"
          : block.type === "quote"
            ? "border-l-2 border-border pl-3 italic"
            : "";
      return (
        <Editable
                plainPaste={plainPaste}
          seed={blockEditableHtml(block)}
          seedKey={seedKey}
          ariaLabel={t(BLOCK_LABEL[block.type].en, BLOCK_LABEL[block.type].bn)}
          className={cn("min-h-6 outline-none", size, (block as { align?: TextAlign }).align === "center" && "text-center", (block as { align?: TextAlign }).align === "right" && "text-right")}
          onCommit={(html) => onChange(blockFromEditableHtml(block, html))}
        />
      );
    }
    case "list":
      return (
        <ul className="ml-4 list-disc space-y-1">
          {block.items.map((item, index) => (
            <li key={`${seedKey}:${index}`}>
              <Editable
                plainPaste={plainPaste}
                seed={inlineToHtml(item)}
                seedKey={`${seedKey}:${index}`}
                ariaLabel={`${t("List item", "তালিকার আইটেম")} ${index + 1}`}
                className="min-h-6 outline-none"
                onCommit={(html) => {
                  const items = block.items.slice();
                  items[index] = parseInline(html);
                  onChange({ ...block, items });
                }}
              />
            </li>
          ))}
          <li>
            <button type="button" className={btnGhost} onClick={() => onChange({ ...block, items: [...block.items, []] })}>
              {t("Add item", "আইটেম যোগ")}
            </button>
            <button
              type="button"
              className={btnGhost}
              onClick={() => onChange({ ...block, ordered: !block.ordered })}
            >
              {block.ordered ? t("Make bulleted", "বুলেট করুন") : t("Make numbered", "নম্বর করুন")}
            </button>
          </li>
        </ul>
      );
    case "code":
      return (
        <textarea
          className={`${inputClass} min-h-24 font-mono text-xs`}
          aria-label={t("Code", "কোড")}
          value={block.code}
          disabled={disabled}
          onChange={(event) => onChange({ ...block, code: event.target.value })}
        />
      );
    case "hr":
      return <hr className="my-2 border-border" />;
    case "more":
      return (
        <p className="rounded-fq-md bg-muted px-2 py-1 text-center text-xs uppercase tracking-wide text-muted-foreground">
          {t("Excerpt ends here", "সারসংক্ষেপ এখানে শেষ")}
        </p>
      );
    case "image":
      return (
        <div className="grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)]">
          {block.src ? (
            <img
              src={block.src}
              alt={block.alt}
              width={block.width || undefined}
              height={block.height || undefined}
              className="h-24 w-full rounded-fq-md object-cover"
            />
          ) : (
            <div className="h-24 rounded-fq-md bg-muted" />
          )}
          <div className="space-y-1">
            <input
              className={inputClass}
              placeholder={t("Alt text (required)", "বিকল্প লেখা (আবশ্যক)")}
              value={block.alt}
              onChange={(event) => onChange({ ...block, alt: event.target.value })}
            />
            <div className="flex gap-1">
              <input
                className={inputClass}
                inputMode="numeric"
                placeholder={t("Width", "প্রস্থ")}
                value={block.width || ""}
                onChange={(event) => onChange({ ...block, width: Number(event.target.value.replace(/\D/g, "")) || 0 })}
              />
              <input
                className={inputClass}
                inputMode="numeric"
                placeholder={t("Height", "উচ্চতা")}
                value={block.height || ""}
                onChange={(event) => onChange({ ...block, height: Number(event.target.value.replace(/\D/g, "")) || 0 })}
              />
            </div>
            <input
              className={inputClass}
              placeholder={t("Caption", "ক্যাপশন")}
              value={block.caption}
              onChange={(event) => onChange({ ...block, caption: event.target.value })}
            />
          </div>
        </div>
      );
    case "table":
      return (
        <table className="w-full border border-border text-sm">
          <tbody>
            {[block.head, ...block.rows].filter((row) => row.length).map((row, rowIndex) => (
              <tr key={`${seedKey}:r${rowIndex}`}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="border border-border p-1">
                    <Editable
                plainPaste={plainPaste}
                      seed={inlineToHtml(cell)}
                      seedKey={`${seedKey}:r${rowIndex}:c${cellIndex}`}
                      ariaLabel={`${t("Cell", "সেল")} ${rowIndex + 1}.${cellIndex + 1}`}
                      className="min-h-5 outline-none"
                      onCommit={(html) => {
                        const parsed = parseInline(html);
                        if (rowIndex === 0 && block.head.length) {
                          const head = block.head.slice();
                          head[cellIndex] = parsed;
                          onChange({ ...block, head });
                          return;
                        }
                        const offset = block.head.length ? rowIndex - 1 : rowIndex;
                        const rows = block.rows.map((current, index) =>
                          index === offset ? current.map((value, i) => (i === cellIndex ? parsed : value)) : current,
                        );
                        onChange({ ...block, rows });
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
  }
}
