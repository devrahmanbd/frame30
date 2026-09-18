import { useLang } from "@/lib/i18n";
import { DEVICE_PRESETS, type DeviceBucket } from "@/lib/responsive";

export type BuilderTopBarProps = {
  title: string;
  status: string;
  device: DeviceBucket;
  previewWidth: number;
  onWidthChange: (w: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onPreview: () => void;
  isPreview: boolean;
  onSave: () => void;
  onPublish: () => void;
  saveDisabled?: boolean;
  publishDisabled?: boolean;
  onFinderOpen?: () => void;
  onStructureToggle?: () => void;
  structureVisible?: boolean;
  onChecklistOpen?: () => void;
  issueCount?: number;
};

export function BuilderTopBar({
  title,
  status,
  device,
  previewWidth,
  onWidthChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onPreview,
  isPreview,
  onSave,
  onPublish,
  saveDisabled,
  publishDisabled,
  onFinderOpen,
  onStructureToggle,
  structureVisible,
  onChecklistOpen,
  issueCount = 0,
}: BuilderTopBarProps) {
  const { t } = useLang();

  return (
    <header
      className="flex items-center gap-2 border-b border-border bg-card px-3 py-1.5 text-sm"
      role="toolbar"
      aria-label={t("Builder toolbar", "বিল্ডার টুলবার")}
    >
      <div className="flex items-center gap-2 shrink-0">
        <span className="font-bangla-display text-base font-bold tracking-tight">
          {t("Theme Studio", "থিম স্টুডিও")}
        </span>
        <span className="hidden text-muted-foreground sm:inline">/</span>
        <span className="hidden truncate max-w-[180px] font-medium sm:inline">
          {title}
        </span>
      </div>

      <div
        role="tablist"
        aria-label={t("Device", "ডিভাইস")}
        className="ml-2 hidden gap-0.5 rounded-fq-md border border-border p-0.5 sm:flex"
      >
        {DEVICE_PRESETS.map((preset) => (
          <button
            key={preset.width}
            type="button"
            role="tab"
            aria-selected={previewWidth === preset.width}
            aria-label={`${preset.label}px — ${preset.bp}`}
            onClick={() => onWidthChange(preset.width)}
            className={`rounded-fq-sm px-2 py-1 text-xs tabular-nums transition-colors ${
              previewWidth === preset.width
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <p
        aria-live="polite"
        className="mx-2 hidden truncate text-xs text-muted-foreground lg:block"
      >
        {status}
      </p>

      <div className="ml-auto flex items-center gap-1">
        {onFinderOpen && (
          <button
            type="button"
            onClick={onFinderOpen}
            aria-label={t("Finder (⌘K)", "ফাইন্ডার (⌘K)")}
            className="inline-flex h-8 items-center gap-1.5 rounded-fq-md border border-border px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <span className="hidden md:inline">{t("Find", "খুঁজুন")}</span>
          </button>
        )}

        {onStructureToggle && (
          <button
            type="button"
            onClick={onStructureToggle}
            aria-label={t("Toggle navigator", "নেভিগেটর টগল")}
            aria-pressed={structureVisible}
            className={`inline-flex size-8 items-center justify-center rounded-fq-md hover:bg-muted hover:text-foreground ${structureVisible ? "bg-muted text-foreground" : "text-muted-foreground"}`}
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          </button>
        )}

        {onChecklistOpen && (
          <button
            type="button"
            onClick={onChecklistOpen}
            aria-label={t("Checklist", "চেকলিস্ট")}
            className={`inline-flex h-8 items-center gap-1.5 rounded-fq-md px-2 text-xs hover:bg-muted ${issueCount > 0 ? "text-destructive" : "text-muted-foreground hover:text-foreground"}`}
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            {issueCount > 0 && <span className="font-medium">{issueCount}</span>}
          </button>
        )}

        <div className="mx-1 h-5 w-px bg-border" role="separator" />

        <button type="button" onClick={onUndo} disabled={!canUndo} aria-label={t("Undo", "আনডু")} className="inline-flex size-8 items-center justify-center rounded-fq-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40">
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 10h10a5 5 0 0 1 0 10H9"/><path d="m7 6-4 4 4 4"/></svg>
        </button>
        <button type="button" onClick={onRedo} disabled={!canRedo} aria-label={t("Redo", "রিডু")} className="inline-flex size-8 items-center justify-center rounded-fq-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40">
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10H11a5 5 0 0 0 0 10h4"/><path d="m17 6 4 4-4 4"/></svg>
        </button>

        <div className="mx-1 h-5 w-px bg-border" role="separator" />

        <button type="button" onClick={onPreview} aria-label={isPreview ? t("Exit preview", "প্রিভিউ বন্ধ") : t("Preview changes", "পরিবর্তন প্রিভিউ")} className={`inline-flex size-8 items-center justify-center rounded-fq-md hover:bg-muted hover:text-foreground ${isPreview ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>
          {isPreview ? <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg> : <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>}
        </button>

        <button type="button" onClick={onSave} disabled={saveDisabled} className="hidden rounded-fq-md border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50 sm:inline-flex sm:items-center">
          {t("Save", "সেভ")}
        </button>
        <button type="button" onClick={onPublish} disabled={publishDisabled} className="rounded-fq-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {t("Publish", "পাবলিশ")}
        </button>
      </div>
    </header>
  );
}
