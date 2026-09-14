/**
 * Phase 14 — the builder shell.
 *
 * Top bar · left panel (elements ⇄ settings) · device-framed canvas ·
 * floating structure panel · modals. Keyboard shortcuts are bound once here.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useStudio } from "@/lib/studio/useStudio";
import {
  detectStudioPlatform,
  isTypingElement,
  matchStudioShortcut,
  STUDIO_SHORTCUTS,
  type StudioPlatform,
} from "@/lib/studio/shortcuts";
import { BREAKPOINT_BY_KEY, type DeviceKey } from "@/lib/studio/responsive";
import { flatten, type DropTarget } from "@/lib/studio/tree";
import { widgetLabel } from "@/lib/studio/catalog";
import { isContainerNode, type StudioDoc } from "@/lib/studio/model";
import {
  builtInTemplates,
  instantiate,
  loadMyTemplates,
  persistMyTemplates,
  saveAsTemplate,
  importTemplateJson,
  type StudioTemplate,
} from "@/lib/studio/templates";
import type { RevisionEntry } from "@/lib/studio/history";
import {
  AUTOSAVE_DEBOUNCE_MS,
  clearDraft,
  draftAgeLabel,
  recoverableDraft,
  writeDraft,
  type StudioDraft,
} from "@/lib/studio/autosave";

import { NodeContextMenu, type MenuItem } from "../NodeContextMenu";
import { ClassManagerDialog } from "./ClassManagerDialog";
import { StudioTopBar } from "./StudioTopBar";
import { ElementsPanel } from "./ElementsPanel";
import { SettingsPanel } from "./SettingsPanel";
import { StructurePanel } from "./StructurePanel";
import { StudioCanvas } from "./StudioCanvas";
import {
  FinderDialog,
  HistoryDialog,
  LayoutPickerDialog,
  PageSettingsDialog,
  ShortcutsDialog,
  TemplatesDialog,
} from "./StudioModals";

const CANVAS_WIDTH: Record<DeviceKey, string> = {
  widescreen: "100%",
  desktop: "100%",
  laptop: "1200px",
  tablet: "768px",
  mobileLandscape: "880px",
  mobile: "390px",
};

export type StudioBuilderProps = {
  doc: StudioDoc;
  onChange: (doc: StudioDoc) => void;
  onPublish?: (doc: StudioDoc) => void | Promise<void>;
  onExit?: () => void;
  revisions?: RevisionEntry[];
  saving?: boolean;
  /**
   * Identifies this document for local autosave. Omit it (or pass null) and
   * crash recovery is off — never keyed on something that can collide across
   * two documents.
   */
  docId?: string | null;
};

export function StudioBuilder({
  doc: initialDoc,
  onChange,
  onPublish,
  onExit,
  revisions = [],
  saving = false,
  docId = null,
}: StudioBuilderProps) {

  const studio = useStudio(initialDoc);
  const {
    doc,
    selected,
    selectedId,
    device,
    activeDevices,
    dirty,
    setSelectedId,
    setDevice,
  } = studio;

  const [platform, setPlatform] = useState<StudioPlatform>("pc");
  const [preview, setPreview] = useState(false);
  const [structure, setStructure] = useState(false);
  const [modal, setModal] = useState<
    null | "layout" | "templates" | "page" | "history" | "finder" | "shortcuts" | "classes"
  >(null);
  const [menu, setMenu] = useState<{ id: string; at: { x: number; y: number } } | null>(null);
  const [templates, setTemplates] = useState<StudioTemplate[]>(() => builtInTemplates());
  const [pendingDrop, setPendingDrop] = useState<DropTarget | null>(null);
  const dragWidget = useRef<string | null>(null);
  const dragNode = useRef<string | null>(null);

  useEffect(() => setPlatform(detectStudioPlatform(navigator)), []);
  useEffect(() => setTemplates([...builtInTemplates(), ...loadMyTemplates()]), []);

  /* keep the host in sync without pushing on every keystroke */
  const lastSent = useRef(doc);
  useEffect(() => {
    if (lastSent.current === doc) return;
    lastSent.current = doc;
    const id = window.setTimeout(() => onChange(doc), 400);
    return () => window.clearTimeout(id);
  }, [doc, onChange]);

  /* ---------------- autosave + crash recovery ---------------- */

  /** A local draft found on open that differs from what the server loaded. */
  const [recovery, setRecovery] = useState<StudioDraft | null>(null);
  const [autosavedAt, setAutosavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!docId) return;
    setRecovery(recoverableDraft(docId, initialDoc));
    // Only on open: once the editor is running, the draft is ours to write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  /* mirror every edit locally, debounced, so a crash loses seconds not hours */
  useEffect(() => {
    if (!docId || !dirty) return;
    const id = window.setTimeout(() => {
      const at = Date.now();
      writeDraft(docId, doc, at);
      setAutosavedAt(at);
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [doc, dirty, docId]);

  /* last-chance write when the tab goes away mid-edit */
  useEffect(() => {
    if (!docId) return;
    const flush = () => {
      if (studio.dirty) writeDraft(docId, studio.doc);
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
    };
  }, [docId, studio]);

  const publish = useCallback(async () => {
    await onPublish?.(doc);
    studio.setDirty(false);
    if (docId) clearDraft(docId);
    setAutosavedAt(null);
    toast.success("Page published");
  }, [doc, docId, onPublish, studio]);

  const saveDraft = useCallback(() => {
    onChange(doc);
    studio.setDirty(false);
    if (docId) clearDraft(docId);
    setAutosavedAt(null);
    toast.success("Draft saved");
  }, [doc, docId, onChange, studio]);

  const restoreRecovery = useCallback(() => {
    if (!recovery) return;
    studio.replaceDoc(recovery.doc, "imported");
    setRecovery(null);
    toast.success("Unsaved changes restored");
  }, [recovery, studio]);

  const discardRecovery = useCallback(() => {
    if (docId) clearDraft(docId);
    setRecovery(null);
  }, [docId]);


  const saveTemplate = useCallback(() => {
    const nodes = selected ? [selected] : doc.root;
    const name = window.prompt("Template name", selected ? widgetLabel(selected.el) : doc.page.title);
    if (name === null) return;
    const template = saveAsTemplate(name, nodes);
    const mine = [...loadMyTemplates(), template];
    persistMyTemplates(mine);
    setTemplates([...builtInTemplates(), ...mine]);
    toast.success("Saved to My templates");
  }, [doc, selected]);

  /* ---------------- shortcuts ---------------- */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTypingElement(event.target)) return;
      const id = selectedId;
      if (event.key === "Escape") {
        setSelectedId(null);
        return;
      }
      const shortcut = matchStudioShortcut(event, platform);
      if (!shortcut) return;
      switch (shortcut.id) {
        case "undo": studio.undo(); break;
        case "redo": studio.redo(); break;
        case "copy": if (id) studio.copy(id); break;
        case "paste": studio.paste(); break;
        case "duplicate": if (id) studio.duplicate(id); break;
        case "delete": if (id) studio.remove(id); break;
        case "pasteStyle": if (id) studio.pasteStyle(id); break;
        case "resetStyle": if (id) studio.resetStyle(id); break;
        case "save": saveDraft(); break;
        case "publish": void publish(); break;
        case "preview": setPreview((value) => !value); break;
        case "hideHandles": setPreview((value) => !value); break;
        case "navigator": setStructure((value) => !value); break;
        case "finder": setModal("finder"); break;
        case "templates": setModal("templates"); break;
        case "pageSettings": setModal("page"); break;
        case "siteSettings": setModal("classes"); break;
        case "history": setModal("history"); break;
        case "shortcuts": setModal("shortcuts"); break;
        default: return;
      }
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [platform, publish, saveDraft, selectedId, setSelectedId, studio]);


  const finderItems = useMemo(
    () => [
      ...flatten(doc.root).map(({ node, depth }) => ({
        id: node.id,
        label: node.name ?? widgetLabel(node.el),
        hint: depth === 0 ? "top level" : `level ${depth + 1}`,
      })),
    ],
    [doc.root],
  );

  /** Right-click menu, in the Elementor order, for canvas and layer tree. */
  const menuItems = useMemo<MenuItem[]>(() => {
    const id = menu?.id;
    if (!id) return [];
    const node = flatten(doc.root).find((entry) => entry.node.id === id)?.node;
    const label = node ? (node.name ?? widgetLabel(node.el)) : "Element";
    return [
      { kind: "action", id: "edit", label: `Edit ${label}`, run: () => setSelectedId(id) },
      { kind: "action", id: "duplicate", label: "Duplicate", hint: "⌘D", run: () => studio.duplicate(id) },
      { kind: "separator", id: "s1" },
      { kind: "action", id: "copy", label: "Copy", hint: "⌘C", run: () => studio.copy(id) },
      { kind: "action", id: "paste", label: "Paste", hint: "⌘V", run: () => studio.paste({ id, position: "after" }) },
      {
        kind: "action",
        id: "copy-style",
        label: "Copy style",
        hint: "⌘⇧C",
        run: () => studio.copyStyle(id),
      },
      { kind: "action", id: "paste-style", label: "Paste style", hint: "⌘⇧V", run: () => studio.pasteStyle(id) },
      { kind: "action", id: "reset-style", label: "Reset style", run: () => studio.resetStyle(id) },
      { kind: "separator", id: "s2" },
      { kind: "action", id: "save-template", label: "Save as template", run: saveTemplate },
      { kind: "action", id: "structure", label: "Structure", hint: "⌘I", run: () => setStructure(true) },
      { kind: "separator", id: "s3" },
      { kind: "action", id: "delete", label: "Delete", hint: "⌦", danger: true, run: () => studio.remove(id) },
    ];
  }, [doc.root, menu, saveTemplate, setSelectedId, studio]);

  const handleDrop = useCallback(
    (target: DropTarget) => {
      if (dragWidget.current) {
        studio.addWidget(dragWidget.current, target);
        dragWidget.current = null;
        return;
      }
      if (dragNode.current) {
        studio.move(dragNode.current, target);
        dragNode.current = null;
      }
    },
    [studio],
  );

  return (
    <div className="fq-studio flex h-[78vh] min-h-[560px] flex-col overflow-hidden rounded-fq-lg border border-border bg-background">
      <StudioTopBar
        title={doc.page.title}
        device={device}
        activeDevices={activeDevices}
        dirty={dirty}
        saving={saving}
        platform={platform}
        onDevice={setDevice}
        onAddElement={() => setSelectedId(null)}
        onPageSettings={() => setModal("page")}
        onHistory={() => setModal("history")}
        onDesignSystem={() => setModal("templates")}
        onFinder={() => setModal("finder")}
        onStructure={() => setStructure((value) => !value)}
        onPreview={() => setPreview((value) => !value)}
        onPublish={() => void publish()}
        onSaveDraft={saveDraft}
        onSaveTemplate={saveTemplate}
        onShortcuts={() => setModal("shortcuts")}
        onExit={() => onExit?.()}
      />

      {recovery && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/60 px-4 py-2 text-sm"
        >
          <span className="text-foreground">
            Unsaved changes from {draftAgeLabel(recovery.at)} were recovered from this browser.
          </span>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={restoreRecovery}
              className="rounded-fq-sm bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
            >
              Restore
            </button>
            <button
              type="button"
              onClick={discardRecovery}
              className="rounded-fq-sm border border-border px-3 py-1 text-xs font-medium text-muted-foreground"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {autosavedAt !== null && !recovery && (
        <div className="border-b border-border px-4 py-1 text-[11px] text-muted-foreground">
          Autosaved locally {draftAgeLabel(autosavedAt)}
        </div>
      )}



      <div className="flex min-h-0 flex-1">
        {!preview && (
          <div className="hidden w-80 shrink-0 border-r border-border md:block">
            {selected ? (
              <SettingsPanel
                node={selected}
                device={device}
                activeDevices={activeDevices}
                onDevice={setDevice}
                onChange={(key, value) => studio.setSetting(selected.id, key, value)}
                onBack={() => setSelectedId(null)}
                onResetStyles={() => studio.resetStyle(selected.id)}
                classes={studio.classes}
                onOpenClassManager={() => setModal("classes")}
              />
            ) : (
              <ElementsPanel
                onAdd={(key) => studio.addWidget(key)}
                onDragWidget={(key) => {
                  dragWidget.current = key;
                }}
                savedBlocks={templates.filter((t) => t.kind === "mine").map((t) => ({ id: t.id, name: t.name }))}
                onInsertSaved={(id) => {
                  const template = templates.find((t) => t.id === id);
                  if (template) instantiate(template).forEach((node) => studio.addNode(node));
                }}
                globals={[]}
                onInsertGlobal={() => toast.info("Global elements arrive with the design system.")}
              />
            )}
          </div>
        )}

        <main className="relative min-h-0 flex-1 overflow-auto bg-muted/40 p-4" aria-label="Page canvas">
          <div
            className={cn("mx-auto min-h-full bg-background shadow-fq-md transition-[max-width] duration-200")}
            style={{ maxWidth: CANVAS_WIDTH[device] }}
          >
            <StudioCanvas
              doc={doc}
              device={device}
              selectedId={selectedId}
              hideHandles={preview}
              onSelect={setSelectedId}
              onDrop={handleDrop}
              onDragNode={(id) => {
                dragNode.current = id;
              }}
              onDuplicate={studio.duplicate}
              onDelete={studio.remove}
              onAddInside={(id) => {
                setPendingDrop({ id, position: "inside" });
                setModal("layout");
              }}
              onAddRoot={() => {
                setPendingDrop({ id: null, position: "after" });
                setModal("layout");
              }}
              onContextMenu={(id, at) => {
                setSelectedId(id);
                setMenu({ id, at });
              }}
              onInlineEdit={(id, text) => studio.setSetting(id, "text", text)}
            />
          </div>

          <p className="pointer-events-none sticky bottom-0 pt-2 text-center text-[11px] text-muted-foreground">
            {BREAKPOINT_BY_KEY[device].label} preview
          </p>

          {structure && (
            <div className="pointer-events-none absolute right-4 top-4 z-20">
              <StructurePanel
                nodes={doc.root}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onRename={studio.rename}
                onToggleHidden={studio.toggleHidden}
                onMove={studio.move}
                onContextMenu={(id, at) => setMenu({ id, at })}
                onClose={() => setStructure(false)}
              />
            </div>
          )}
        </main>
      </div>

      <NodeContextMenu
        at={menu?.at ?? null}
        items={menuItems}
        label="Element actions"
        onClose={() => setMenu(null)}
      />

      <ClassManagerDialog
        open={modal === "classes"}
        onOpenChange={(open) => setModal(open ? "classes" : null)}
        classes={studio.classes}
        onCreate={studio.createClass}
        onRename={studio.renameClass}
        onDelete={studio.deleteClass}
      />

      <LayoutPickerDialog
        open={modal === "layout"}
        onOpenChange={(open) => setModal(open ? "layout" : null)}
        onPick={(preset) => {
          studio.addPreset(preset, pendingDrop ?? undefined);
          setPendingDrop(null);
        }}
      />

      <TemplatesDialog
        open={modal === "templates"}
        onOpenChange={(open) => setModal(open ? "templates" : null)}
        templates={templates}
        onInsert={(template) => instantiate(template).forEach((node) => studio.addNode(node))}
        onToggleFavourite={(id) =>
          setTemplates((list) => list.map((t) => (t.id === id ? { ...t, favourite: !t.favourite } : t)))
        }
        onImport={(json) => {
          const template = importTemplateJson(json);
          if (!template) {
            toast.error("That file is not a template export.");
            return;
          }
          setTemplates((list) => [...list, template]);
          toast.success(`Imported ${template.name}`);
        }}
      />

      <PageSettingsDialog
        open={modal === "page"}
        onOpenChange={(open) => setModal(open ? "page" : null)}
        page={doc.page}
        breakpoints={activeDevices}
        onChange={studio.setPage}
        onBreakpoints={studio.setBreakpoints}
      />

      <HistoryDialog
        open={modal === "history"}
        onOpenChange={(open) => setModal(open ? "history" : null)}
        history={studio.history}
        revisions={revisions}
        onJump={studio.jump}
        onRestore={() => toast.info("Revision restore is handled by the editor's revisions panel.")}
      />

      <FinderDialog
        open={modal === "finder"}
        onOpenChange={(open) => setModal(open ? "finder" : null)}
        items={finderItems}
        onPick={(id) => {
          setSelectedId(id);
          const node = doc.root.find((child) => child.id === id);
          if (node && isContainerNode(node)) setStructure(true);
        }}
      />

      <ShortcutsDialog
        open={modal === "shortcuts"}
        onOpenChange={(open) => setModal(open ? "shortcuts" : null)}
        platform={platform}
      />
    </div>
  );
}
