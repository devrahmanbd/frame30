/**
 * Phase 12 — full-screen editor takeover shared by pages, posts and the builder.
 *
 * `position: fixed; inset: 0; z-50` above the console shell. Owns layout
 * (top bar · optional outline · canvas · resizable sidebar), keyboard
 * shortcuts, the leave guard and the pre-publish flow. Document state lives
 * in `useEditorDoc`; the writing surface is the Classic editor (markdown or
 * block markup, bridged transparently) or the page builder.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { ClassicEditor } from "@/components/admin/blog/ClassicEditor";
import { ShortcutHelp } from "@/components/admin/content/ShortcutHelp";
import { StudioBuilder } from "@/components/builder/studio/StudioBuilder";
import { readStudioBody, serializeStudioBody, upgradeV1 } from "@/lib/studio/model";
import { ConfirmDialog, ErrorState, type MenuAction } from "@/components/console/kit";
import { parseBody, serializeBody } from "@/lib/blog-body";
import {
  EDITOR_SHORTCUTS,
  prePublishChecks,
  primaryAction,
  titlePill,
  type ContentKind,
  type EditorDoc,
} from "@/lib/editor/editor-doc";
import { blocksToMarkdown, markdownToBlocks } from "@/lib/editor/page-markdown";
import {
  parseBuilderBody,
  serializeBuilderBody,
  starterDoc,
  type BuilderDoc,
} from "@/lib/page-builder";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { DocumentPanel } from "./DocumentPanel";
import { EditorChoiceCard } from "./EditorChoiceCard";
import { EditorTopBar, type Device } from "./EditorTopBar";
import { OutlinePanel } from "./OutlinePanel";
import { PrePublishPanel } from "./PrePublishPanel";
import { SeoMetaBox } from "@/components/admin/seo/metabox/SeoMetaBox";
import { UnderlineTabs, fieldInput } from "./primitives";
import { useEditorDoc } from "./useEditorDoc";

const SIDEBAR_MIN = 320;
const SIDEBAR_MAX = 420;
const SIDEBAR_KEY = "fq.editor.sidebar";
const DEVICE_WIDTH: Record<Device, string> = { desktop: "100%", tablet: "768px", mobile: "390px" };

export function EditorShell({
  kind,
  id,
  listHref,
  onCreated,
  forceEditor = null,
}: {
  kind: ContentKind;
  id: string | null;
  listHref: string;
  onCreated: (id: string) => void;
  /** `?editor=builder` from the list's "Edit with Builder" action. */
  forceEditor?: "classic" | "builder" | null;
}) {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const state = useEditorDoc(kind, id, onCreated);
  const { doc, update, context } = state;

  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth >= 1024,
  );
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === "undefined") return SIDEBAR_MIN;
    const stored = Number(window.localStorage.getItem(SIDEBAR_KEY));
    return stored >= SIDEBAR_MIN && stored <= SIDEBAR_MAX ? stored : SIDEBAR_MIN;
  });
  const [sideTab, setSideTab] = useState<"document" | "block">("document");
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [device, setDevice] = useState<Device>("desktop");
  const [prePublish, setPrePublish] = useState(false);
  const [leaveAsk, setLeaveAsk] = useState(false);
  const [trashAsk, setTrashAsk] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  const canPublish = context?.canPublish ?? false;
  const action = primaryAction(doc, canPublish);
  const pill = titlePill(doc, lang === "bn" ? "bn" : "en");
  const builderDoc: BuilderDoc | null =
    doc.editor === "builder" ? parseBuilderBody(doc.body) : null;
  const needsChoice =
    kind === "post" &&
    !doc.id &&
    !doc.body &&
    doc.editor === "classic" &&
    !state.dirty &&
    choiceNotMade(doc);

  // Honour `?editor=builder` once the document has loaded.
  const forced = useRef(false);
  useEffect(() => {
    if (forced.current || !context || !forceEditor) return;
    forced.current = true;
    if (forceEditor !== context.doc.editor) {
      markChoice();
      const next =
        forceEditor === "builder"
          ? (parseBuilderBody(context.doc.body) ?? starterDoc(context.doc.title || undefined))
          : null;
      update({ editor: forceEditor, body: next ? serializeBuilderBody(next) : "" }, "editor");
    } else if (forceEditor === "builder") {
      markChoice();
    }
  }, [context, forceEditor, update]);

  const leave = useCallback(() => {
    void navigate({ to: listHref });
  }, [navigate, listHref]);

  const back = useCallback(() => {
    if (state.dirty) setLeaveAsk(true);
    else leave();
  }, [state.dirty, leave]);

  const saveDraft = useCallback(async () => {
    setBusy(true);
    await state.commit("save");
    setBusy(false);
  }, [state]);

  const publish = useCallback(async () => {
    setBusy(true);
    const ok = await state.commit("publish");
    setBusy(false);
    if (ok) setPrePublish(false);
  }, [state]);

  const checks = useMemo(
    () =>
      prePublishChecks(doc, {
        seoScore: state.seoScore,
        builderLints: 0,
        slugTaken: state.error?.code === "slug_taken",
      }),
    [doc, state.seoScore, state.error],
  );

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveDraft();
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setPrePublish(true);
      } else if (mod && e.key === "\\") {
        e.preventDefault();
        setSidebarOpen((o) => !o);
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        setOutlineOpen((o) => !o);
      } else if (mod && e.key.toLowerCase() === "z" && !typing) {
        e.preventDefault();
        if (e.shiftKey) state.redo();
        else state.undo();
      } else if (e.key === "?" && !typing) {
        e.preventDefault();
        setHelpOpen((o) => !o);
      } else if (
        e.key === "Escape" &&
        !typing &&
        !prePublish &&
        !leaveAsk &&
        !trashAsk &&
        !helpOpen
      ) {
        if (outlineOpen) setOutlineOpen(false);
        else back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveDraft, state, back, outlineOpen, prePublish, leaveAsk, trashAsk, helpOpen]);

  // Lock body scroll while the takeover is mounted.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Sidebar resize (pointer drag on the left edge).
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidth;
    const onMove = (ev: PointerEvent) => {
      const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startW + (startX - ev.clientX)));
      setSidebarWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setSidebarWidth((w) => {
        window.localStorage.setItem(SIDEBAR_KEY, String(w));
        return w;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const setBody = (body: string) => update({ body }, "body");

  const menu: MenuAction[] = [
    {
      id: "outline",
      label: t("Document outline", "আউটলাইন"),
      onSelect: () => setOutlineOpen((o) => !o),
    },
    {
      id: "help",
      label: t("Keyboard shortcuts", "কীবোর্ড শর্টকাট"),
      onSelect: () => setHelpOpen(true),
    },
    {
      id: "switch",
      label:
        doc.editor === "builder"
          ? t("Switch to Classic editor", "ক্লাসিক এডিটরে যান")
          : t("Edit with Builder", "বিল্ডারে সম্পাদনা"),
      onSelect: () => switchEditor(doc.editor === "builder" ? "classic" : "builder"),
    },
    {
      id: "trash",
      label: t("Move to trash", "ট্র্যাশে পাঠান"),
      destructive: true,
      disabled: !doc.id,
      onSelect: () => setTrashAsk(true),
    },
  ];

  const switchEditor = (editor: "classic" | "builder") => {
    if (editor === doc.editor) return;
    if (editor === "builder") {
      const next = builderDoc ?? starterDoc(doc.title || undefined);
      update({ editor, body: serializeBuilderBody(next) }, "editor");
    } else {
      // Builder → classic keeps nothing renderable; start a fresh column but keep undo available.
      update({ editor, body: "" }, "editor");
    }
    if (doc.id) void state.chooseEditor(editor);
  };

  const previewHref =
    context && doc.id
      ? kind === "page"
        ? `/store/${context.storeSlug}/pages/${doc.slug}?preview=1`
        : `/blog/${doc.slug}?preview=1`
      : null;

  return (
    <div
      className="fq-admin fixed inset-0 z-50 flex flex-col bg-background text-foreground"
    >
      <EditorTopBar
        pill={pill}
        saveState={state.saveState}
        lastSaved={
          state.lastSavedAt
            ? new Date(state.lastSavedAt).toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              })
            : null
        }
        canUndo={state.canUndo}
        canRedo={state.canRedo}
        onBack={back}
        onUndo={state.undo}
        onRedo={state.redo}
        outlineOpen={outlineOpen}
        onToggleOutline={() => setOutlineOpen((o) => !o)}
        showBuilderSwitch={doc.editor === "classic" && !needsChoice}
        onEditWithBuilder={() => switchEditor("builder")}
        previewHref={previewHref}
        device={device}
        onDevice={setDevice}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
        onSaveDraft={() => void saveDraft()}
        primary={action}
        onPrimary={() => setPrePublish(true)}
        busy={busy || state.saveState === "saving"}
        menu={menu}
      />

      {state.error && (
        <div
          role="alert"
          className="flex items-center gap-2 border-b border-[var(--fq-danger)]/40 bg-[color-mix(in_oklab,var(--fq-danger)_10%,var(--color-card))] px-4 py-2 text-sm"
        >
          <AlertTriangle className="size-4 shrink-0 text-[var(--fq-danger)]" aria-hidden />
          <span>{lang === "bn" ? state.error.bn : state.error.en}</span>
          <button
            type="button"
            onClick={state.clearError}
            className="fq-focus-glow ml-auto rounded-fq-md px-2 text-xs underline-offset-2 hover:underline"
          >
            {t("Dismiss", "বাতিল")}
          </button>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        {outlineOpen && context && (
          <OutlinePanel
            doc={doc}
            revisions={context.revisions}
            authors={context.authors}
            onJump={(index) => {
              const node = canvasRef.current?.querySelectorAll("[role='textbox']")[index] as
                HTMLElement | undefined;
              node?.scrollIntoView({ block: "center", behavior: "smooth" });
              node?.focus();
            }}
            onRestore={(rid) => void state.restoreRevision(rid)}
            onClose={() => setOutlineOpen(false)}
          />
        )}

        {/* Canvas */}
        <main
          ref={canvasRef}
          className="min-w-0 flex-1 overflow-auto"
          aria-busy={state.query.isPending}
        >
          <h1 className="sr-only">
            {doc.title?.trim() ||
              (kind === "page" ? t("Untitled page", "শিরোনামহীন পেজ") : t("Untitled post", "শিরোনামহীন পোস্ট"))}
          </h1>
          {state.query.isError ? (
            <div className="p-8">
              <ErrorState
                title={t("Couldn't open this item", "আইটেমটি খোলা যায়নি")}
                message={String((state.query.error as Error)?.message ?? "")}
                onRetry={() => void state.query.refetch()}
              />
            </div>
          ) : state.query.isPending ? (
            <CanvasSkeleton />
          ) : needsChoice ? (
            <EditorChoiceCard
              onChoose={(editor) => {
                markChoice();
                if (editor === "builder") switchEditor("builder");
                else update({ editor: "classic" }, "editor");
              }}
            />
          ) : (
            <div
              className="mx-auto transition-[max-width] duration-200"
              style={{
                maxWidth:
                  doc.editor === "builder"
                    ? DEVICE_WIDTH[device]
                    : device === "desktop"
                      ? "720px"
                      : DEVICE_WIDTH[device],
              }}
            >
              <div
                className={cn("px-4 pb-24 pt-8 sm:px-6", doc.editor === "builder" && "px-0 pt-4")}
              >
                <textarea
                  value={doc.title}
                  onChange={(e) => update({ title: e.target.value.replace(/\n/g, "") }, "title")}
                  placeholder={t("Add title", "শিরোনাম দিন")}
                  aria-label={t("Title", "শিরোনাম")}
                  rows={1}
                  maxLength={160}
                  className="font-bangla-display fq-focus-glow mb-4 w-full resize-none rounded-fq-md border border-transparent bg-transparent px-1 text-3xl font-bold leading-tight placeholder:text-muted-foreground/60 focus:border-border sm:text-4xl"
                  onInput={(e) => {
                    const el = e.currentTarget;
                    el.style.height = "auto";
                    el.style.height = `${el.scrollHeight}px`;
                  }}
                />
                {kind === "post" && (
                  <input
                    value={doc.titleEn}
                    onChange={(e) => update({ titleEn: e.target.value }, "titleEn")}
                    placeholder={t(
                      "English title (used for the URL)",
                      "ইংরেজি শিরোনাম (URL-এর জন্য)",
                    )}
                    aria-label={t("English title", "ইংরেজি শিরোনাম")}
                    maxLength={160}
                    className={cn(
                      fieldInput,
                      "mb-4 border-transparent bg-transparent px-1 text-base focus:border-border",
                    )}
                  />
                )}
                {doc.editor === "builder" && builderDoc ? (
                  <StudioBuilder
                    doc={
                      readStudioBody(doc.body, doc.title || pill.title) ??
                      upgradeV1(builderDoc, doc.title || pill.title)
                    }
                    onChange={(next) => setBody(serializeStudioBody(next))}
                    docId={doc.id ? `${kind}:${doc.id}` : null}
                  />

                ) : (

                  <ClassicBody
                    kind={kind}
                    body={doc.body}
                    onChange={setBody}
                    history={{
                      canUndo: state.canUndo,
                      canRedo: state.canRedo,
                      undo: state.undo,
                      redo: state.redo,
                    }}
                    onHelp={() => setHelpOpen(true)}
                  />
                )}
              </div>
            </div>
          )}
        </main>

        {/* Sidebar */}
        {sidebarOpen && context && (
          <aside
            className="relative flex shrink-0 flex-col border-l border-border bg-card max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-20 max-lg:w-full max-lg:max-w-[360px] max-lg:shadow-[-24px_0_48px_-32px_rgb(0_0_0/0.5)]"
            style={{ width: sidebarWidth }}
            aria-label={t("Settings sidebar", "সেটিংস সাইডবার")}
          >
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label={t("Resize sidebar", "সাইডবার আকার")}
              aria-valuemin={SIDEBAR_MIN}
              aria-valuemax={SIDEBAR_MAX}
              aria-valuenow={sidebarWidth}
              tabIndex={0}
              onPointerDown={startResize}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft") setSidebarWidth((w) => Math.min(SIDEBAR_MAX, w + 16));
                if (e.key === "ArrowRight") setSidebarWidth((w) => Math.max(SIDEBAR_MIN, w - 16));
              }}
              className="fq-focus-glow absolute inset-y-0 -left-1 z-10 hidden w-2 cursor-col-resize hover:bg-primary/30 lg:block"
            />
            <UnderlineTabs
              label={t("Sidebar sections", "সাইডবার অংশ")}
              value={sideTab}
              onChange={setSideTab}
              tabs={[
                { id: "document", label: kind === "page" ? t("Page", "পেজ") : t("Post", "পোস্ট") },
                {
                  id: "block",
                  label: doc.editor === "builder" ? t("Element", "এলিমেন্ট") : t("Block", "ব্লক"),
                },
              ]}
            />
            <div className="min-h-0 flex-1 overflow-auto">
              {sideTab === "document" ? (
                <DocumentPanel
                  doc={doc}
                  update={update}
                  ctx={{ ...context, canPublish }}
                  onTrash={() => setTrashAsk(true)}
                  lastSavedAt={state.lastSavedAt}
                  seoSlot={
                    <EditorSeoBox
                      doc={doc}
                      update={update}
                      storeName={context.storeName}
                      storeSlug={context.storeSlug}
                    />
                  }
                />
              ) : (
                <p className="fq-sub p-4 text-sm">
                  {doc.editor === "builder"
                    ? t(
                        "Select an element on the canvas to edit its settings.",
                        "সেটিংস সম্পাদনা করতে ক্যানভাসে একটি এলিমেন্ট নির্বাচন করুন।",
                      )
                    : t(
                        "Block settings appear here when a block is focused. Use the toolbar above the text for formatting.",
                        "ব্লক ফোকাস হলে এখানে সেটিংস দেখাবে। ফরম্যাটিংয়ের জন্য টুলবার ব্যবহার করুন।",
                      )}
                </p>
              )}
            </div>
          </aside>
        )}

        <PrePublishPanel
          open={prePublish}
          checks={checks}
          action={action}
          busy={busy}
          onCancel={() => setPrePublish(false)}
          onConfirm={() => void publish()}
        />
      </div>

      <ConfirmDialog
        open={leaveAsk}
        title={t("Save changes before leaving?", "চলে যাওয়ার আগে সংরক্ষণ করবেন?")}
        description={t(
          "You have unsaved edits. Save a draft or discard them.",
          "অসংরক্ষিত পরিবর্তন আছে। খসড়া সংরক্ষণ করুন বা বাতিল করুন।",
        )}
        confirmLabel={t("Discard and leave", "বাতিল করে চলে যান")}
        cancelLabel={t("Save draft", "খসড়া সংরক্ষণ")}
        destructive
        onCancel={async () => {
          const ok = await state.commit("save");
          setLeaveAsk(false);
          if (ok) leave();
        }}
        onConfirm={() => {
          setLeaveAsk(false);
          leave();
        }}
      />
      <ConfirmDialog
        open={trashAsk}
        title={t("Move to trash?", "ট্র্যাশে পাঠাবেন?")}
        description={t(
          "You can restore it from the Trash tab for 30 days.",
          "ট্র্যাশ ট্যাব থেকে ৩০ দিন পর্যন্ত ফিরিয়ে আনা যাবে।",
        )}
        confirmLabel={t("Move to trash", "ট্র্যাশে পাঠান")}
        cancelLabel={t("Keep", "রাখুন")}
        onCancel={() => setTrashAsk(false)}
        onConfirm={async () => {
          await state.moveToTrash();
          setTrashAsk(false);
          leave();
        }}
      />
      <ShortcutHelp
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        shortcuts={EDITOR_SHORTCUTS}
        hint={t("Press ? again to close.", "বন্ধ করতে আবার ? চাপুন।")}
      />
    </div>
  );
}

/* --------------------------------------------------------- Classic bridge */

/** Pages store markdown, posts store block markup; the editor only knows blocks. */
function ClassicBody({
  kind,
  body,
  onChange,
  history,
  onHelp,
}: {
  kind: ContentKind;
  body: string;
  onChange: (body: string) => void;
  history: { canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void };
  onHelp: () => void;
}) {
  const { t } = useLang();
  // Pages: markdown → blocks → markup for the editor; posts pass straight through.
  // The last emission is cached so the editor sees its own markup back verbatim
  // (a re-derived string that differs by a byte would re-seed and drop the caret).
  const last = useRef<{ md: string; markup: string } | null>(null);
  const markup = useMemo(() => {
    if (kind === "post") return body;
    if (last.current && last.current.md === body) return last.current.markup;
    return serializeBody(markdownToBlocks(body));
  }, [kind, body]);
  const handle = (next: string) => {
    if (kind === "post") {
      onChange(next);
      return;
    }
    const md = blocksToMarkdown(parseBody(next));
    last.current = { md, markup: next };
    onChange(md);
  };
  return (
    <ClassicEditor
      value={markup}
      onChange={handle}
      variant="takeover"
      history={history}
      onHelp={onHelp}
      placeholder={t("Start writing or type / to add a block", "লেখা শুরু করুন")}
    />
  );
}

function CanvasSkeleton() {
  return (
    <div className="mx-auto max-w-[720px] px-6 pt-10" aria-hidden>
      <div className="h-10 w-2/3 animate-pulse rounded-fq-md bg-muted" />
      <div className="mt-6 h-8 w-full animate-pulse rounded-fq-md bg-muted" />
      <div className="mt-2 h-64 w-full animate-pulse rounded-fq-md bg-muted" />
    </div>
  );
}

/**
 * Phase 13 — the SEO meta box inside the editor sidebar.
 *
 * Same component, same analyser as the full-width box under the classic body:
 * the merchant sees one score, wherever they are looking from.
 */
function EditorSeoBox({
  doc,
  update,
  storeName,
  storeSlug,
}: {
  doc: EditorDoc;
  update: (part: Partial<EditorDoc>) => void;
  storeName: string;
  storeSlug: string;
}) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const path =
    doc.kind === "page"
      ? `/store/${storeSlug}/pages/${doc.slug || "new-page"}`
      : `/blog/${doc.slug || "new-post"}`;
  return (
    <div className="border-t border-border p-3">
      <SeoMetaBox
        seo={doc.seoExtended}
        onChange={(seoExtended) => update({ seoExtended })}
        fallbackTitle={doc.title}
        fallbackDescription={doc.excerpt}
        content={doc.body}
        excerpt={doc.excerpt}
        url={`${origin}${path}`}
        origin={origin}
        siteName={storeName}
        slug={doc.slug}
        onSlugChange={(slug) => update({ slug })}
        publishedAt={doc.publishedAt}
        updatedAt={doc.updatedAt}
        imageUrl={doc.featuredImage}
      />
    </div>
  );
}

/* ------------------------------------------------------------ choice memo */

const CHOICE_KEY = "fq.editor.choice-seen";
function choiceNotMade(doc: EditorDoc): boolean {
  if (typeof window === "undefined") return false;
  return doc.kind === "post" && window.sessionStorage.getItem(CHOICE_KEY) !== "1";
}
function markChoice() {
  window.sessionStorage.setItem(CHOICE_KEY, "1");
}
