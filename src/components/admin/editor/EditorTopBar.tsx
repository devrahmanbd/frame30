/**
 * Phase 12 — 56px editor top bar (Gutenberg order, Slate & Signal tokens).
 *
 * ← back · + Add · ↶ ↷ · ☰ Outline · ▣ Edit with Builder · [Title · Page] ·
 * Preview ↗ · device switch · sidebar toggle · Save draft · Publish/Update · ⋮
 */
import { ArrowLeft, ExternalLink, LayoutTemplate, List, Monitor, PanelRight, Plus, Redo2, Smartphone, Tablet, Undo2 } from "lucide-react";
import { ActionMenu, SaveIndicator, btnGhost, btnPrimary, type MenuAction, type SaveState } from "@/components/console/kit";
import { useLang } from "@/lib/i18n";
import { PRIMARY_LABEL, type PrimaryAction } from "@/lib/editor/editor-doc";
import { cn } from "@/lib/utils";
import { IconButton } from "./primitives";

export type Device = "desktop" | "tablet" | "mobile";

export function EditorTopBar({
  pill,
  saveState,
  lastSaved,
  canUndo,
  canRedo,
  onBack,
  onAdd,
  onUndo,
  onRedo,
  outlineOpen,
  onToggleOutline,
  showBuilderSwitch,
  onEditWithBuilder,
  previewHref,
  device,
  onDevice,
  sidebarOpen,
  onToggleSidebar,
  onSaveDraft,
  primary,
  onPrimary,
  busy,
  menu,
}: {
  pill: { title: string; kind: string };
  saveState: SaveState;
  lastSaved: string | null;
  canUndo: boolean;
  canRedo: boolean;
  onBack: () => void;
  onAdd?: () => void;
  onUndo: () => void;
  onRedo: () => void;
  outlineOpen: boolean;
  onToggleOutline: () => void;
  showBuilderSwitch: boolean;
  onEditWithBuilder: () => void;
  previewHref: string | null;
  device: Device;
  onDevice: (d: Device) => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onSaveDraft: () => void;
  primary: PrimaryAction;
  onPrimary: () => void;
  busy: boolean;
  menu: readonly MenuAction[];
}) {
  const { t, lang } = useLang();
  const primaryLabel = PRIMARY_LABEL[primary][lang === "bn" ? "bn" : "en"];

  return (
    <header className="flex h-14 shrink-0 items-center gap-1 border-b border-border bg-card px-2"><div className="flex w-full items-center gap-1" role="toolbar" aria-label={t("Editor toolbar", "এডিটর টুলবার")}>
      <IconButton label={t("Back to list", "তালিকায় ফিরুন")} onClick={onBack} shortcut="Esc">
        <ArrowLeft className="size-4" aria-hidden />
      </IconButton>
      {onAdd && (
        <IconButton label={t("Add block", "ব্লক যোগ")} onClick={onAdd} tone="signal" shortcut="/">
          <Plus className="size-4" aria-hidden />
        </IconButton>
      )}
      <IconButton label={t("Undo", "পূর্বাবস্থা")} onClick={onUndo} disabled={!canUndo} shortcut="⌘Z">
        <Undo2 className="size-4" aria-hidden />
      </IconButton>
      <IconButton label={t("Redo", "পুনরায়")} onClick={onRedo} disabled={!canRedo} shortcut="⇧⌘Z">
        <Redo2 className="size-4" aria-hidden />
      </IconButton>
      <IconButton label={t("Document outline", "আউটলাইন")} onClick={onToggleOutline} active={outlineOpen} shortcut="⌘⇧O" className="hidden sm:inline-flex">
        <List className="size-4" aria-hidden />
      </IconButton>
      {showBuilderSwitch && (
        <button type="button" onClick={onEditWithBuilder} className={cn(btnPrimary, "ml-1 hidden min-h-8 px-2.5 text-xs md:inline-flex")}>
          <LayoutTemplate className="size-3.5" aria-hidden />
          {t("Edit with Builder", "বিল্ডারে সম্পাদনা")}
        </button>
      )}

      <div className="mx-auto flex min-w-0 items-center gap-2 px-2">
        <span className="hidden max-w-[28rem] truncate rounded-fq-md bg-muted px-3 py-1.5 text-sm md:inline-flex" title={`${pill.title} · ${pill.kind}`}>
          <span className="truncate font-medium">{pill.title}</span>
          <span className="fq-sub shrink-0">&nbsp;·&nbsp;{pill.kind}</span>
        </span>
        <SaveIndicator state={saveState} className="shrink-0" />
        {lastSaved && saveState === "saved" && <span className="fq-sub hidden text-xs lg:inline">{lastSaved}</span>}
      </div>

      {previewHref && (
        <a
          href={previewHref}
          target="_blank"
          rel="noopener noreferrer"
          className="fq-focus-glow hidden min-h-8 items-center gap-1 rounded-fq-md px-2 text-xs text-foreground hover:bg-muted lg:inline-flex"
        >
          {t("Preview in new tab", "নতুন ট্যাবে প্রিভিউ")}
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      )}
      <div role="group" aria-label={t("Preview device", "প্রিভিউ ডিভাইস")} className="hidden items-center rounded-fq-md border border-border p-0.5 md:flex">
        {(
          [
            ["desktop", Monitor, t("Desktop", "ডেস্কটপ")],
            ["tablet", Tablet, t("Tablet", "ট্যাবলেট")],
            ["mobile", Smartphone, t("Mobile", "মোবাইল")],
          ] as const
        ).map(([id, Icon, label]) => (
          <IconButton key={id} label={label} active={device === id} onClick={() => onDevice(id)} className="size-8">
            <Icon className="size-3.5" aria-hidden />
          </IconButton>
        ))}
      </div>
      <IconButton label={t("Settings sidebar", "সেটিংস সাইডবার")} onClick={onToggleSidebar} active={sidebarOpen} shortcut="⌘\">
        <PanelRight className="size-4" aria-hidden />
      </IconButton>
      <button type="button" onClick={onSaveDraft} disabled={busy} className={cn(btnGhost, "hidden min-h-8 px-2.5 text-xs sm:inline-flex")} title="⌘S">
        {t("Save draft", "খসড়া সংরক্ষণ")}
      </button>
      <button type="button" onClick={onPrimary} disabled={busy} className={cn(btnPrimary, "min-h-8 px-3 text-xs")} title="⌘⇧P">
        {primaryLabel}
      </button>
      <ActionMenu actions={menu} label={t("More", "আরও")} />
    </div></header>
  );
}
