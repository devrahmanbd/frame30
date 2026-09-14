import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import { SectionRenderer } from "@/components/builder/SectionRenderer";
import { WidgetTray } from "@/components/builder/WidgetTray";
import { PluginProvider } from "@/components/builder/PluginContext";
import { SupportedViewportGate } from "@/components/builder/SupportedViewportGate";
import { pluginListFn } from "@/lib/plugins.functions";
import { LayerTree, NODE_NAME_PROP } from "@/components/builder/LayerTree";
import { SectionInspector } from "@/components/builder/SectionInspector";
import { TokenEditor } from "@/components/builder/TokenEditor";
import { VersionTimeline } from "@/components/builder/VersionTimeline";
import { useBuilderEditor } from "@/hooks/use-builder-editor";
import { cloneNodes, locate, topMost } from "@/lib/builder-tree";
import {
  deleteBlock,
  exportBlocks,
  importBlocks,
  listBlocks,
  saveBlock,
  type SavedBlock,
} from "@/lib/saved-blocks";
import type { Section } from "@/lib/builder-ast";
import { translationCoverage } from "@/lib/translation-coverage";
import { DEVICE_PRESETS } from "@/lib/responsive";
import {
  CLIPBOARD_CHANNEL,
  CLIPBOARD_KEY,
  applyStylePatch,
  createClipboardStore,
  styleSubsetOf,
  type ClipboardPayload,
  type ClipboardRejection,
  type ClipboardStore,
} from "@/lib/builder-clipboard";
import {
  SHORTCUTS,
  detectPlatform,
  formatShortcut,
  isTypingTarget,
  matchShortcut,
  type Platform,
  type ShortcutId,
} from "@/lib/builder-shortcuts";
import { ShortcutHelp } from "@/components/builder/ShortcutHelp";
import { NodeContextMenu, type MenuItem } from "@/components/builder/NodeContextMenu";
import {
  asPlacement,
  isGraftedId,
  linkedBlockId,
  placementCounts,
  placementOwnerOf,
  resolveGlobalBlocks,
  type GlobalBlock,
} from "@/lib/global-blocks";
import {
  globalBlockCreateFn,
  globalBlockDeleteFn,
  globalBlockListFn,
} from "@/lib/global-blocks.functions";

import { LintPanel } from "@/components/builder/LintPanel";
import { SeoDrawer } from "@/components/builder/SeoDrawer";
import { applyPreset } from "@/lib/widget-metadata";
import type { ClassifiedIssue, FixPlan } from "@/lib/builder-lint-fixes";
import { TranslationMeter } from "@/components/builder/TranslationMeter";
import { CustomCodeEditor } from "@/components/builder/CustomCodeEditor";
import {
  BREAKPOINTS,
  EMPTY_AST,
  SLOTS,
  TEMPLATE_KEYS,
  newSection,
  templateOf,
  tokensToCss,
  type Breakpoint,
  type SectionType,
  type Slot,
  type TemplateKey,
} from "@/lib/builder-ast";
import {
  builderAutosaveFn,
  builderCancelScheduleFn,
  builderCommitFn,
  builderInstallFn,
  builderDemoImportFn,
  builderDemoPurgeFn,
  builderPresetSwapFn,
  builderRegistryVersionFn,
  builderPublishFn,
  builderRegistryFn,
  builderRollbackFn,
  builderScheduleFn,
  builderUpdateApplyFn,
  builderUpdatePreviewFn,
  builderWorkspaceFn,
} from "@/lib/themes.functions";

export const Route = createFileRoute("/_authenticated/admin/builder")({
  head: () => ({
    meta: [
      { title: "Theme studio — Framique admin" },
      {
        name: "description",
        content:
          "Compose storefront templates, tune brand tokens, autosave drafts, publish and schedule theme releases.",
      },
      { property: "og:title", content: "Theme studio" },
      { property: "og:description", content: "Storefront template editor with versioning and scheduling." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BuilderRoute,
});

function BuilderRoute() {
  return (
    <SupportedViewportGate>
      <BuilderStudio />
    </SupportedViewportGate>
  );
}

const TEMPLATE_LABEL: Record<TemplateKey, { en: string; bn: string }> = {
  index: { en: "Home", bn: "হোম" },
  product: { en: "Product", bn: "প্রোডাক্ট" },
  collection: { en: "Collection", bn: "কালেকশন" },
  search: { en: "Search results", bn: "সার্চ ফলাফল" },
  cart: { en: "Cart", bn: "কার্ট" },
  checkout: { en: "Checkout", bn: "চেকআউট" },
  blog: { en: "Blog", bn: "ব্লগ" },
  page: { en: "Page", bn: "পেজ" },
};

const SLOT_LABEL: Record<Slot, { en: string; bn: string }> = {
  header: { en: "Header", bn: "হেডার" },
  main: { en: "Main", bn: "মেইন" },
  footer: { en: "Footer", bn: "ফুটার" },
};

// Device frames come from the platform responsive contract, so studio frames
// and production media queries can never drift.
type LocalePreview = "en" | "bn" | "both";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong";
}

function BuilderStudio() {
  const { t } = useLang();
  const qc = useQueryClient();

  const loadWorkspace = useServerFn(builderWorkspaceFn);
  const autosave = useServerFn(builderAutosaveFn);
  const commit = useServerFn(builderCommitFn);
  const publish = useServerFn(builderPublishFn);
  const rollback = useServerFn(builderRollbackFn);
  const schedule = useServerFn(builderScheduleFn);
  const cancelSchedule = useServerFn(builderCancelScheduleFn);
  const registry = useServerFn(builderRegistryFn);
  const install = useServerFn(builderInstallFn);
  const presetSwap = useServerFn(builderPresetSwapFn);
  const registryVersion = useServerFn(builderRegistryVersionFn);
  const demoImport = useServerFn(builderDemoImportFn);
  const demoPurge = useServerFn(builderDemoPurgeFn);
  const previewUpdate = useServerFn(builderUpdatePreviewFn);
  const applyUpdateFn = useServerFn(builderUpdateApplyFn);

  const loadPlugins = useServerFn(pluginListFn);
  const pluginsQuery = useQuery({
    queryKey: ["builder", "plugins"],
    queryFn: () => loadPlugins({}),
    staleTime: 60_000,
  });

  const workspace = useQuery({
    queryKey: ["builder", "workspace"],
    queryFn: () => loadWorkspace({}),
    staleTime: 30_000,
  });

  const [template, setTemplate] = useState<TemplateKey>("index");
  const [slot, setSlot] = useState<Slot>("main");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [previewWidth, setPreviewWidth] = useState<number>(1440);
  const [locale, setLocale] = useState<LocalePreview>("en");
  const [leftTab, setLeftTab] = useState<"layers" | "add" | "blocks">("layers");
  const [addParent, setAddParent] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<SavedBlock[]>([]);
  const [blockName, setBlockName] = useState("");
  const [panel, setPanel] = useState<"inspect" | "seo" | "brand" | "history" | "themes">("inspect");
  const [runAt, setRunAt] = useState("");
  const [pendingInstall, setPendingInstall] = useState<string | null>(null);
  // Phase 1 authoring UX state.
  const clipboardRef = useRef<ClipboardStore | null>(null);
  const [clip, setClip] = useState<ClipboardPayload | null>(null);
  const [platform, setPlatform] = useState<Platform>("other");
  const [helpOpen, setHelpOpen] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const [layerFilter, setLayerFilter] = useState("");
  const [globalName, setGlobalName] = useState("");

  const CLIP_ERROR: Record<ClipboardRejection, { en: string; bn: string }> = {
    empty: { en: "Select a layer first", bn: "আগে একটি লেয়ার বাছুন" },
    too_many_nodes: { en: "That selection is too large to copy", bn: "এই নির্বাচনটি কপি করার জন্য অনেক বড়" },
    too_large: { en: "That selection is too large to copy", bn: "এই নির্বাচনটি কপি করার জন্য অনেক বড়" },
    storage_unavailable: { en: "Clipboard storage is blocked in this browser", bn: "এই ব্রাউজারে ক্লিপবোর্ড স্টোরেজ বন্ধ" },
    version_mismatch: { en: "Clipboard is from another version", bn: "ক্লিপবোর্ড অন্য সংস্করণের" },
    malformed: { en: "Clipboard content could not be read", bn: "ক্লিপবোর্ডের কনটেন্ট পড়া যায়নি" },
  };

  // The clipboard lives outside React so ⌘C in a keyboard handler never races a
  // render, and it is created in an effect because it touches window APIs.
  useEffect(() => {
    const channel =
      typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CLIPBOARD_CHANNEL) : null;
    const store = createClipboardStore({
      storage: window.localStorage,
      channel,
      logger: (event, fields) => console.warn(event, fields),
    });
    clipboardRef.current = store;
    setClip(store.read());
    setPlatform(detectPlatform(navigator.userAgent));
    const off = store.subscribe(setClip);
    const onStorage = (event: StorageEvent) => {
      if (event.key === CLIPBOARD_KEY) store.ingestExternal(event.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      off();
      store.dispose();
      clipboardRef.current = null;
    };
  }, []);

  const device: Breakpoint =
    DEVICE_PRESETS.find((preset) => preset.width === previewWidth)?.bp ?? "desktop";

  const themeId = workspace.data?.theme.id ?? null;

  const initial = useMemo(
    () =>
      workspace.data
        ? { templates: workspace.data.templates, tokens: workspace.data.tokens }
        : null,
    [workspace.data],
  );

  const editor = useBuilderEditor(initial, {
    revision: workspace.data?.revision ?? 0,
    onAutosave: async (doc, revision) => {
      if (!themeId) return;
      await autosave({ data: { themeId, templates: doc.templates, tokens: doc.tokens, revision } });
    },
  });

  const doc = editor.doc;
  const ast = doc ? templateOf(doc.templates, template) : EMPTY_AST;
  const sections = ast[slot];
  const selectedId = selectedIds[0] ?? null;
  const selected = selectedId ? (locate(sections, selectedId)?.node ?? null) : null;
  const issues = doc ? (editor.issues[template] ?? []) : [];
  const coverage = useMemo(
    () => (doc ? translationCoverage(doc.templates) : null),
    [doc],
  );

  useEffect(() => {
    setSelectedIds([]);
    setAddParent(null);
  }, [template, slot]);

  useEffect(() => {
    setBlocks(listBlocks(themeId));
  }, [themeId]);

  /**
   * Phase 2.5 — apply a lint fix as one history entry. Every branch is
   * reversible by undo: `props` writes only schema-owned defaults, `remove`
   * deletes the offending node, `reid` re-keys it, `unnest` drops children the
   * widget may not hold, and `focus` decides nothing — it selects the node and
   * opens the panel that owns the field.
   */
  const applyFix = useCallback(
    (issue: ClassifiedIssue, plan: FixPlan) => {
      const id = issue.sectionId;
      if (plan.kind === "focus") {
        if (id) setSelectedIds([id]);
        setPanel(plan.panel === "seo" ? "seo" : "inspect");
        return;
      }
      if (!id) return;
      if (plan.kind === "remove") {
        editor.remove(template, slot, id);
        setSelectedIds((current) => current.filter((value) => value !== id));
        toast.success(t("Node removed.", "নোড মুছে ফেলা হয়েছে।"));
        return;
      }
      if (plan.kind === "reid") {
        editor.updateNode(template, slot, id, (node) => ({
          ...node,
          id: newSection(node.type).id,
        }));
        setSelectedIds([]);
        toast.success(t("New id assigned.", "নতুন আইডি দেওয়া হয়েছে।"));
        return;
      }
      if (plan.kind === "unnest") {
        editor.updateNode(template, slot, id, ({ children: _children, ...node }) => node as Section);
        toast.success(t("Nested widgets removed.", "ভিতরের উইজেট সরানো হয়েছে।"));
        return;
      }
      editor.updateNode(template, slot, id, (node) => ({
        ...node,
        props: { ...node.props, ...plan.props },
      }));
      setSelectedIds([id]);
      toast.success(t("Fix applied.", "ফিক্স প্রয়োগ হয়েছে।"));
    },
    [editor, slot, t, template],
  );

  const select = useCallback((id: string, mode: "replace" | "toggle") => {
    setSelectedIds((current) =>
      mode === "toggle"
        ? current.includes(id)
          ? current.filter((value) => value !== id)
          : [...current, id]
        : [id],
    );
    setPanel("inspect");
  }, []);

  /** Nodes behind the current selection, deduplicated to top-most subtrees. */
  const selectedNodes = useCallback(() => {
    const ids = topMost(sections, selectedIds);
    return ids.flatMap((id) => {
      const found = locate(sections, id);
      return found ? [found.node] : [];
    });
  }, [sections, selectedIds]);

  const copySelection = useCallback(
    (kind: "nodes" | "style" = "nodes") => {
      const store = clipboardRef.current;
      const nodes = selectedNodes();
      if (!nodes.length) {
        toast.error(t(CLIP_ERROR.empty.en, CLIP_ERROR.empty.bn));
        return 0;
      }
      if (!store) return 0;
      const payload = kind === "style" ? [nodes[0]!] : cloneNodes(nodes);
      const result = store.write({ kind, from: { template, slot }, nodes: payload });
      if (!result.ok) {
        toast.error(t(CLIP_ERROR[result.reason].en, CLIP_ERROR[result.reason].bn));
        return 0;
      }
      if (!result.persisted) {
        // Private mode / quota: the paste still works, but only in this tab.
        toast.message(
          t("Copied for this tab only", "শুধু এই ট্যাবের জন্য কপি হয়েছে"),
          {
            description: t(
              "Browser storage is unavailable, so other tabs will not see it.",
              "ব্রাউজার স্টোরেজ পাওয়া যাচ্ছে না, তাই অন্য ট্যাব এটি দেখবে না।",
            ),
          },
        );
      }
      return payload.length;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedNodes, slot, t, template],
  );

  const pasteClipboard = useCallback(() => {
    const payload = clipboardRef.current?.read() ?? clip;
    if (!payload?.nodes.length) {
      toast.error(t("Clipboard is empty", "ক্লিপবোর্ড খালি"));
      return;
    }
    // Paste lands inside the selected container, else after the slot's tail —
    // and works across templates and tabs because the clipboard lives outside
    // the document, in versioned browser storage.
    const target = selectedId ? locate(sections, selectedId) : null;
    const parentId = target && (target.node.children ? target.node.id : target.parentId);
    const ids = editor.insert(template, slot, payload.nodes, {
      parentId: parentId ?? null,
      ...(target && !target.node.children ? { index: target.index + 1 } : {}),
    });
    if (ids?.length) {
      setSelectedIds(ids);
    } else {
      // `insert` refuses illegal drops (slot legality, depth, node cap).
      toast.error(
        t("That layer is not allowed here", "এই লেয়ারটি এখানে বসানো যাবে না"),
      );
    }
  }, [clip, editor, sections, selectedId, slot, t, template]);

  /** Paste-style: copies the universal style layer, never content props. */
  const pasteStyleOnly = useCallback(() => {
    const payload = clipboardRef.current?.read() ?? clip;
    const source = payload?.style ?? (payload?.nodes[0] ? styleSubsetOf(payload.nodes[0]) : null);
    if (!source) {
      toast.error(t("Copy a layer first", "আগে একটি লেয়ার কপি করুন"));
      return;
    }
    const ids = topMost(sections, selectedIds);
    if (!ids.length) {
      toast.error(t(CLIP_ERROR.empty.en, CLIP_ERROR.empty.bn));
      return;
    }
    for (const id of ids) {
      editor.updateNode(template, slot, id, (node) => applyStylePatch(node, source));
    }
    toast.success(t("Style pasted", "স্টাইল পেস্ট হয়েছে"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip, editor, sections, selectedIds, slot, t, template]);

  const deleteSelection = useCallback(() => {
    if (!selectedIds.length) return;
    editor.removeMany(template, slot, selectedIds);
    setSelectedIds([]);
  }, [editor, selectedIds, slot, template]);

  /**
   * Phase 1.4 — one dispatch table, shared with the `?` overlay. Every id in
   * `SHORTCUTS` must appear here; the contract test enforces it.
   */
  const runShortcut = useCallback(
    (id: ShortcutId) => {
      switch (id) {
        case "undo":
          editor.undo();
          return true;
        case "redo":
          editor.redo();
          return true;
        case "copy":
          return copySelection() > 0;
        case "paste":
          pasteClipboard();
          return true;
        case "paste_style":
          pasteStyleOnly();
          return true;
        case "duplicate": {
          const ids = topMost(sections, selectedIds);
          if (!ids.length) return false;
          editor.duplicateMany(template, slot, ids);
          return true;
        }
        case "delete":
          if (!selectedIds.length) return false;
          deleteSelection();
          return true;
        case "deselect":
          setSelectedIds([]);
          setMenu(null);
          setHelpOpen(false);
          return true;
        case "move_up":
        case "move_down": {
          if (!selectedId) return false;
          editor.nudge(template, slot, selectedId, id === "move_up" ? -1 : 1);
          return true;
        }
        case "save":
          void editor.flush();
          return true;
        case "preview":
          window.open("/", "_blank", "noopener");
          return true;
        case "search_layers":
          setLeftTab("layers");
          setTimeout(() => document.getElementById("layer-search")?.focus(), 0);
          return true;
        case "help":
          setHelpOpen((open) => !open);
          return true;
        default:
          return false;
      }
    },
    [copySelection, deleteSelection, editor, pasteClipboard, pasteStyleOnly, sections, selectedId, selectedIds, slot, template],
  );

  // Studio keyboard map. Typing inside a field or inline text is never hijacked.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const id = matchShortcut(event);
      if (!id) return;
      const handled = runShortcut(id);
      // Only swallow the native binding when we actually did something, so
      // ⌘C with nothing selected still copies the browser's own selection.
      if (handled) event.preventDefault();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [runShortcut]);

  /* ------------------------------------------------ Phase 1.5 global blocks */

  const listGlobals = useServerFn(globalBlockListFn);
  const createGlobalFn = useServerFn(globalBlockCreateFn);
  const deleteGlobalFn = useServerFn(globalBlockDeleteFn);

  const globalsQuery = useQuery({
    queryKey: ["builder", "global-blocks", themeId],
    queryFn: () => listGlobals({ data: { themeId } }),
    enabled: !!themeId,
    staleTime: 15_000,
    retry: 1,
  });
  const globals = useMemo<GlobalBlock[]>(() => globalsQuery.data ?? [], [globalsQuery.data]);

  const globalUsage = useMemo(() => {
    if (!doc) return {} as Record<string, number>;
    const trees = TEMPLATE_KEYS.flatMap((key) => {
      const tpl = templateOf(doc.templates, key);
      return SLOTS.map((s) => tpl[s]);
    });
    return placementCounts(trees);
  }, [doc]);

  const invalidateGlobals = () =>
    qc.invalidateQueries({ queryKey: ["builder", "global-blocks", themeId] });

  /** Replaces the current selection with a linked placement of `block`. */
  const placeLinked = useCallback(
    (block: GlobalBlock, replaceIds: string[] = []) => {
      const anchor = replaceIds[0] ? locate(sections, replaceIds[0]) : selectedId ? locate(sections, selectedId) : null;
      const base = newSection("container");
      const placement = asPlacement(
        { ...base, props: { ...base.props, [NODE_NAME_PROP]: block.name } },
        block,
      );
      const id = editor.insertRaw(template, slot, placement, {
        parentId: anchor?.parentId ?? null,
        ...(anchor ? { index: anchor.index + (replaceIds.length ? 0 : 1) } : {}),
      });
      if (replaceIds.length) editor.removeMany(template, slot, replaceIds);
      setSelectedIds(id ? [id] : []);
    },
    [editor, sections, selectedId, slot, template],
  );

  const saveAsGlobal = useMutation({
    mutationFn: async (name: string) => {
      const nodes = selectedNodes();
      if (!nodes.length) throw new Error(t(CLIP_ERROR.empty.en, CLIP_ERROR.empty.bn));
      if (!name.trim()) throw new Error(t("Name the block first", "আগে ব্লকের নাম দিন"));
      const block = (await createGlobalFn({
        data: { themeId, name: name.trim(), nodes },
      })) as GlobalBlock;
      return { block, replaced: nodes.map((node) => node.id) };
    },
    onSuccess: async ({ block, replaced }) => {
      setGlobalName("");
      await invalidateGlobals();
      placeLinked(block, replaced);
      toast.success(
        t("Saved as a global block", "গ্লোবাল ব্লক হিসেবে সেভ হয়েছে"),
        {
          description: t(
            "Edits to this block update every placement.",
            "এই ব্লকের পরিবর্তন প্রতিটি জায়গায় প্রয়োগ হবে।",
          ),
        },
      );
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const removeGlobal = useMutation({
    mutationFn: (id: string) => deleteGlobalFn({ data: { id } }),
    onSuccess: async () => {
      await invalidateGlobals();
      toast.success(t("Global block deleted", "গ্লোবাল ব্লক মুছে গেছে"));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  /** Turns a placement back into ordinary, independently editable nodes. */
  const detachSelected = useCallback(
    (nodeId: string) => {
      const found = locate(sections, nodeId);
      const blockId = found ? linkedBlockId(found.node) : null;
      const block = blockId ? globals.find((candidate) => candidate.id === blockId) : null;
      if (!found || !block) {
        toast.error(t("That layer is not linked", "এই লেয়ারটি লিংক করা নেই"));
        return;
      }
      editor.detachPlacement(template, slot, nodeId, block.nodes);
      setSelectedIds([]);
      toast.success(t("Detached from the global block", "গ্লোবাল ব্লক থেকে আলাদা হয়েছে"));
    },
    [editor, globals, sections, slot, t, template],
  );

  /** The canvas renders block content grafted in; the stored tree stays lean. */
  const canvas = useMemo(() => resolveGlobalBlocks(sections, globals), [sections, globals]);

  /** Grafted nodes are read-only proxies: selection resolves to the placement. */
  const selectOnCanvas = useCallback(
    (rawId: string, mode: "replace" | "toggle") => {
      const id = isGraftedId(rawId) ? (placementOwnerOf(rawId) ?? rawId) : rawId;
      select(id, mode);
    },
    [select],
  );

  const renameNode = useCallback(
    (id: string, name: string) => {
      editor.updateNode(template, slot, id, (node) => {
        const props = { ...node.props };
        if (name.trim()) props[NODE_NAME_PROP] = name.trim();
        else delete props[NODE_NAME_PROP];
        return { ...node, props };
      });
    },
    [editor, slot, template],
  );

  /* -------------------------------------------------- Phase 1.2 context menu */

  const menuItems = useMemo<MenuItem[]>(() => {
    if (!menu) return [];
    const found = locate(sections, menu.nodeId);
    if (!found) return [];
    const node = found.node;
    const linked = linkedBlockId(node);
    const hint = (id: ShortcutId) => {
      const spec = SHORTCUTS.find((candidate) => candidate.id === id);
      return spec ? formatShortcut(spec, platform) : undefined;
    };
    const items: MenuItem[] = [
      {
        kind: "action",
        id: "duplicate",
        label: t("Duplicate", "ডুপ্লিকেট"),
        hint: hint("duplicate"),
        run: () => editor.duplicate(template, slot, node.id),
      },
      {
        kind: "action",
        id: "copy",
        label: t("Copy", "কপি"),
        hint: hint("copy"),
        run: () => copySelection("nodes"),
      },
      {
        kind: "action",
        id: "copy-style",
        label: t("Copy style", "স্টাইল কপি"),
        run: () => copySelection("style"),
      },
      {
        kind: "action",
        id: "paste",
        label: t("Paste", "পেস্ট"),
        hint: hint("paste"),
        disabled: !clip,
        run: () => pasteClipboard(),
      },
      {
        kind: "action",
        id: "paste-style",
        label: t("Paste style only", "শুধু স্টাইল পেস্ট"),
        hint: hint("paste_style"),
        disabled: !clip,
        run: () => pasteStyleOnly(),
      },
      { kind: "separator", id: "sep-1" },
      {
        kind: "action",
        id: "wrap",
        label: t("Wrap in container", "কনটেইনারে মোড়ান"),
        run: () => {
          const base = newSection("container");
          const wrapperId = editor.insertRaw(template, slot, base, {
            parentId: found.parentId,
            index: found.index,
          });
          if (!wrapperId) {
            toast.error(t("Cannot wrap here", "এখানে মোড়ানো যাবে না"));
            return;
          }
          const copies = editor.insert(template, slot, [node], { parentId: wrapperId });
          editor.remove(template, slot, node.id);
          setSelectedIds(copies?.length ? copies : [wrapperId]);
        },
      },
      {
        kind: "action",
        id: "hide",
        label: node.hidden?.includes(device)
          ? t(`Show on ${device}`, "এই ডিভাইসে দেখান")
          : t(`Hide on ${device}`, "এই ডিভাইসে লুকান"),
        run: () => editor.toggleHidden(template, slot, node.id, device),
      },
      {
        kind: "action",
        id: "save-block",
        label: t("Save as block", "ব্লক হিসেবে সেভ"),
        run: () => {
          setLeftTab("blocks");
          setBlocks(saveBlock(themeId, t("Untitled block", "নামহীন ব্লক"), [node]));
          toast.success(t("Block saved", "ব্লক সেভ হয়েছে"));
        },
      },
      {
        kind: "action",
        id: "detach",
        label: t("Detach global block", "গ্লোবাল ব্লক আলাদা করুন"),
        disabled: !linked,
        run: () => detachSelected(node.id),
      },
      { kind: "separator", id: "sep-2" },
      {
        kind: "action",
        id: "delete",
        label: t("Delete", "মুছুন"),
        hint: hint("delete"),
        danger: true,
        run: () => {
          editor.remove(template, slot, node.id);
          setSelectedIds([]);
        },
      },
    ];
    return items;
  }, [clip, copySelection, detachSelected, device, editor, menu, pasteClipboard, pasteStyleOnly, platform, sections, slot, t, template, themeId]);

  const openMenu = useCallback((nodeId: string, x: number, y: number) => {
    const owner = isGraftedId(nodeId) ? (placementOwnerOf(nodeId) ?? nodeId) : nodeId;
    setMenu({ nodeId: owner, x, y });
  }, []);

  const refresh = () => qc.invalidateQueries({ queryKey: ["builder", "workspace"] });

  const commitDraft = useMutation({
    mutationFn: async () => {
      if (!themeId || !doc) throw new Error("Workspace not ready");
      await editor.flush();
      return commit({ data: { themeId, templates: doc.templates, tokens: doc.tokens } });
    },
    onSuccess: async () => {
      editor.markSaved();
      toast.success(t("Version saved", "ভার্সন সেভ হয়েছে"));
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const publishNow = useMutation({
    mutationFn: async () => {
      if (!themeId || !doc) throw new Error("Workspace not ready");
      await editor.flush();
      return publish({ data: { themeId, templates: doc.templates, tokens: doc.tokens } });
    },
    onSuccess: async () => {
      editor.markSaved();
      toast.success(t("Published to your storefront", "স্টোরফ্রন্টে পাবলিশ হয়েছে"));
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const restore = useMutation({
    mutationFn: (versionId: string) => rollback({ data: { versionId } }),
    onSuccess: async () => {
      toast.success(t("Version restored", "ভার্সন ফেরানো হয়েছে"));
      editor.setDoc(null);
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const scheduleRelease = useMutation({
    mutationFn: async () => {
      if (!themeId) throw new Error("Workspace not ready");
      const version = workspace.data?.versions[0];
      if (!version) throw new Error(t("Save a version first", "আগে একটি ভার্সন সেভ করুন"));
      return schedule({
        data: {
          themeId,
          versionId: version.id,
          action: "publish" as const,
          runAt: new Date(runAt).toISOString(),
        },
      });
    },
    onSuccess: async () => {
      setRunAt("");
      toast.success(t("Release scheduled", "রিলিজ নির্ধারিত হয়েছে"));
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const dropSchedule = useMutation({
    mutationFn: (scheduleId: string) => cancelSchedule({ data: { scheduleId } }),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error)),
  });

  const registryQuery = useQuery({
    queryKey: ["builder", "registry"],
    queryFn: () => registry({}),
    enabled: panel === "themes",
    staleTime: 300_000,
  });

  // Phase 8 — which builder API this runtime accepts, so an incompatible
  // package is visible as such before anyone installs it.
  const versionQuery = useQuery({
    queryKey: ["builder", "registry-version"],
    queryFn: () => registryVersion({}),
    enabled: panel === "themes",
    staleTime: 600_000,
  });
  const compatByKey = new Map(
    (versionQuery.data?.presets ?? []).map((preset) => [preset.key, preset]),
  );

  // Phase 8 — idempotent demo catalogue + draft layout, and a purge that only
  // touches demo-flagged rows.
  const importDemo = useMutation({
    mutationFn: ({ key }: { key: string }) => demoImport({ data: { themeKey: key } }),
    onSuccess: async (result) => {
      toast.success(
        result.imported
          ? t(
              `Demo store imported (${result.products} products)`,
              `ডেমো স্টোর ইমপোর্ট হয়েছে (${result.products} প্রোডাক্ট)`,
            )
          : t("Demo content already present", "ডেমো কনটেন্ট আগেই আছে"),
      );
      editor.setDoc(null);
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const removeDemo = useMutation({
    mutationFn: () => demoPurge({}),
    onSuccess: async () => {
      toast.success(t("Demo content removed", "ডেমো কনটেন্ট মুছে ফেলা হয়েছে"));
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const installTheme = useMutation({
    mutationFn: ({ key, overwriteDraft }: { key: string; overwriteDraft?: boolean }) =>
      install({ data: { key, ...(overwriteDraft ? { overwriteDraft } : {}) } }),
    onSuccess: async () => {
      toast.success(t("Theme installed as a draft version", "থিম ড্রাফট ভার্সন হিসেবে ইনস্টল হয়েছে"));
      editor.setDoc(null);
      await refresh();
    },
    onError: (error) => {
      if (errorMessage(error).includes("builder.draft_exists")) {
        setPendingInstall(installTheme.variables?.key ?? null);
        return;
      }
      toast.error(errorMessage(error));
    },
  });

  // Phase 3.1 — swap the visual preset while keeping every authored section.
  const swapPreset = useMutation({
    mutationFn: ({ key }: { key: string }) =>
      presetSwap({ data: { key, templates: editor.doc?.templates ?? {} } }),
    onSuccess: (result) => {
      editor.replaceDoc({ templates: result.templates, tokens: result.tokens });
      toast.success(
        t(
          `Preset applied — ${result.kept} sections kept, ${result.added} added`,
          `প্রিসেট প্রয়োগ হয়েছে — ${result.kept}টি সেকশন রাখা হয়েছে, ${result.added}টি যোগ হয়েছে`,
        ),
      );
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const updatePreview = useQuery({
    queryKey: ["builder", "update", workspace.data?.theme.sourceKey ?? "none", workspace.data?.revision ?? 0],
    queryFn: () => previewUpdate({ data: {} }),
    enabled: panel === "themes" && !!workspace.data?.theme.sourceKey,
    staleTime: 60_000,
  });

  const applyUpdate = useMutation({
    mutationFn: (mode: "adopt" | "keep_mine") => {
      const preview = updatePreview.data;
      if (!preview) throw new Error(t("No update to apply", "প্রয়োগ করার মতো আপডেট নেই"));
      return applyUpdateFn({
        data: { key: preview.key, mode, expectedRevision: preview.revision },
      });
    },
    onSuccess: async () => {
      toast.success(t("Theme updated as a draft", "থিম ড্রাফট হিসেবে আপডেট হয়েছে"));
      editor.setDoc(null);
      await refresh();
      await updatePreview.refetch();
    },
    onError: (error) => {
      const message = errorMessage(error);
      toast.error(
        message.includes("builder.update_conflict")
          ? t(
              "Someone else edited this theme — reload and review the update again",
              "অন্য কেউ এই থিম এডিট করেছেন — রিলোড করে আবার আপডেট দেখুন",
            )
          : message,
      );
    },
  });

  const busy =
    commitDraft.isPending ||
    publishNow.isPending ||
    restore.isPending ||
    installTheme.isPending ||
    applyUpdate.isPending;

  const status = editor.saving
    ? t("Saving…", "সেভ হচ্ছে…")
    : editor.error
      ? t("Autosave failed — retrying on next edit", "অটোসেভ ব্যর্থ — পরের এডিটে আবার চেষ্টা")
      : editor.dirty
        ? t("Unsaved changes", "অসংরক্ষিত পরিবর্তন")
        : editor.savedAt
          ? t("Draft saved", "ড্রাফট সেভ হয়েছে")
          : t("Up to date", "আপ টু ডেট");

  return (
    <PluginProvider plugins={pluginsQuery.data?.plugins ?? []}>
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-bangla-display text-2xl font-bold">{t("Theme studio", "থিম স্টুডিও")}</h1>
          <p className="text-sm text-muted-foreground">
            {t(
              "Build every storefront template, tune brand tokens, then publish or schedule the release.",
              "প্রতিটি স্টোরফ্রন্ট টেমপ্লেট তৈরি করুন, ব্র্যান্ড টোকেন ঠিক করুন, তারপর পাবলিশ বা শিডিউল করুন।",
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p aria-live="polite" className="text-xs text-muted-foreground">
            {status}
          </p>
          <button
            type="button"
            onClick={editor.undo}
            disabled={!editor.canUndo}
            className="rounded-fq-md border border-border px-3 py-2 text-sm disabled:opacity-50"
          >
            {t("Undo", "আনডু")}
          </button>
          <button
            type="button"
            onClick={editor.redo}
            disabled={!editor.canRedo}
            className="rounded-fq-md border border-border px-3 py-2 text-sm disabled:opacity-50"
          >
            {t("Redo", "রিডু")}
          </button>
          <button
            type="button"
            onClick={() => commitDraft.mutate()}
            disabled={busy || !doc}
            className="rounded-fq-md border border-border px-3 py-2 text-sm disabled:opacity-50"
          >
            {t("Save version", "ভার্সন সেভ")}
          </button>
          <button
            type="button"
            onClick={() => publishNow.mutate()}
            disabled={busy || !doc || issues.some((i) => i.level === "error")}
            className="rounded-fq-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {t("Publish", "পাবলিশ")}
          </button>
        </div>
      </header>

      <nav aria-label={t("Templates", "টেমপ্লেট")} className="flex flex-wrap gap-1">
        {TEMPLATE_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            aria-current={template === key ? "page" : undefined}
            onClick={() => setTemplate(key)}
            className={`rounded-fq-md px-3 py-1.5 text-sm ${
              template === key ? "bg-primary text-primary-foreground" : "border border-border bg-card"
            }`}
          >
            {t(TEMPLATE_LABEL[key].en, TEMPLATE_LABEL[key].bn)}
          </button>
        ))}
      </nav>

      <LintPanel
        issues={issues}
        resolve={(id) => locate(sections, id)?.node ?? null}
        onFix={applyFix}
        onSelect={(id) => {
          setSelectedIds([id]);
          setPanel("inspect");
        }}
      />

      {/* Phase 3.3: বাংলা coverage across every template in this theme. */}
      {coverage && (
        <TranslationMeter
          report={coverage}
          onJump={(target, sectionId) => {
            setTemplate(target);
            setSelectedIds([sectionId]);
          }}
        />
      )}

      {/* Phase 4: theme-scoped custom HTML / CSS / JS, versioned with publish. */}
      <CustomCodeEditor themeId={themeId} />

      <div className="grid gap-4 lg:grid-cols-[300px_1fr_320px]">
        <aside className="space-y-4 rounded-fq-lg border border-border bg-card p-4">
          <div role="tablist" aria-label={t("Layout slots", "লেআউট স্লট")} className="flex gap-1">
            {SLOTS.map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={slot === key}
                onClick={() => setSlot(key)}
                className={`flex-1 rounded-fq-md px-2 py-1.5 text-xs ${
                  slot === key ? "bg-primary text-primary-foreground" : "border border-border"
                }`}
              >
                {t(SLOT_LABEL[key].en, SLOT_LABEL[key].bn)}
              </button>
            ))}
          </div>

          <div role="tablist" aria-label={t("Editor panels", "এডিটর প্যানেল")} className="flex gap-1">
            {(
              [
                ["layers", t("Layers", "লেয়ার")],
                ["add", t("Add", "যোগ")],
                ["blocks", t("Blocks", "ব্লক")],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={leftTab === key}
                onClick={() => setLeftTab(key)}
                className={`flex-1 rounded-fq-md px-2 py-1.5 text-xs ${
                  leftTab === key ? "bg-accent text-accent-foreground" : "border border-border"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {leftTab === "layers" && (
            <>
              <input
                id="layer-search"
                type="search"
                value={layerFilter}
                onChange={(event) => setLayerFilter(event.target.value)}
                placeholder={t("Search layers (/)", "লেয়ার খুঁজুন (/)")}
                aria-label={t("Search layers", "লেয়ার খুঁজুন")}
                className="w-full rounded-fq-md border border-border bg-card px-2 py-1.5 text-xs"
              />
              <LayerTree
                sections={sections}
                selectedIds={selectedIds}
                onSelect={select}
                filter={layerFilter}
                onRename={renameNode}
                onContextMenu={openMenu}
                onMove={(dragId, targetId, position) =>
                  editor.moveNode(template, slot, dragId, targetId, position)
                }
                onNudge={(id, delta) => editor.nudge(template, slot, id, delta)}
                onDuplicate={(id) => editor.duplicate(template, slot, id)}
                onDelete={(id) => {
                  editor.remove(template, slot, id);
                  setSelectedIds((ids) => ids.filter((value) => value !== id));
                }}
                onAddInside={(parentId) => {
                  setAddParent(parentId);
                  setLeftTab("add");
                }}
              />
              <p className="text-[11px] text-muted-foreground">
                {t(
                  "Drag to reorder or nest. Ctrl/⌘ + ↑↓ moves, Ctrl/⌘ + D duplicates, Ctrl/⌘ + C/V copies across templates, Delete removes.",
                  "টেনে সাজান বা ভিতরে নিন। Ctrl/⌘ + ↑↓ সরায়, Ctrl/⌘ + D কপি, Ctrl/⌘ + C/V টেমপ্লেটের মধ্যে কপি, Delete মুছে দেয়।",
                )}
              </p>
              <button
                type="button"
                onClick={() => setHelpOpen(true)}
                className="text-[11px] underline"
              >
                {t("All shortcuts (?)", "সব শর্টকাট (?)")}
              </button>
              {selectedIds.length > 1 && (
                <p className="text-[11px] text-muted-foreground">
                  {selectedIds.length} {t("layers selected", "লেয়ার নির্বাচিত")}
                </p>
              )}
            </>
          )}

          {leftTab === "add" && (
            <div className="space-y-2">
              {addParent && (
                <div className="flex items-center justify-between gap-2 rounded-fq-md border border-border px-2 py-1 text-[11px]">
                  <span className="truncate">
                    {t("Adding inside container", "কনটেইনারের ভিতরে যোগ হচ্ছে")}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAddParent(null)}
                    className="shrink-0 underline"
                  >
                    {t("Clear", "বাতিল")}
                  </button>
                </div>
              )}
              <WidgetTray
                slot={slot}
                onAdd={(type: SectionType, presetKey: string) => {
                  const id = editor.add(template, slot, type, { parentId: addParent });
                  if (id && presetKey && presetKey !== "default") {
                    const { props, dropped } = applyPreset(type, presetKey);
                    editor.updateNode(template, slot, id, (node) => ({ ...node, props }));
                    // A stale preset key is data, not a crash: report and carry on.
                    if (dropped.length) {
                      toast.warning(
                        t(
                          `Ignored ${dropped.length} preset settings this widget no longer has.`,
                          `এই উইজেটে নেই এমন ${dropped.length} প্রিসেট সেটিং বাদ দেওয়া হয়েছে।`,
                        ),
                      );
                    }
                  }
                  if (id) setSelectedIds([id]);
                  setPanel("inspect");
                  setLeftTab("layers");
                }}
                onAddPlugin={(pluginKey: string) => {
                  const id = editor.add(template, slot, "plugin_block", { parentId: addParent });
                  if (id) {
                    editor.setProp(template, slot, id, "pluginKey", pluginKey);
                    setSelectedIds([id]);
                  }
                  setPanel("inspect");
                  setLeftTab("layers");
                }}
              />
            </div>
          )}

          {leftTab === "blocks" && (
            <div className="space-y-3">
              <form
                className="space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const ids = topMost(sections, selectedIds);
                  const nodes = ids.flatMap((id) => {
                    const found = locate(sections, id);
                    return found ? [found.node] : [];
                  });
                  if (!nodes.length) {
                    toast.error(t("Select a layer first", "আগে একটি লেয়ার বাছুন"));
                    return;
                  }
                  setBlocks(saveBlock(themeId, blockName, nodes));
                  setBlockName("");
                  toast.success(t("Block saved", "ব্লক সেভ হয়েছে"));
                }}
              >
                <label htmlFor="block-name" className="block text-xs font-medium">
                  {t("Save selection as a block", "নির্বাচনটি ব্লক হিসেবে সেভ করুন")}
                </label>
                <input
                  id="block-name"
                  value={blockName}
                  onChange={(event) => setBlockName(event.target.value)}
                  placeholder={t("Block name", "ব্লকের নাম")}
                  className="w-full rounded-fq-md border border-border bg-card px-2 py-1.5 text-xs"
                />
                <button
                  type="submit"
                  className="rounded-fq-md border border-border px-2 py-1.5 text-xs hover:bg-muted"
                >
                  {t("Save block", "ব্লক সেভ")}
                </button>
              </form>

              <ul className="space-y-1">
                {blocks.length === 0 && (
                  <li className="text-xs text-muted-foreground">
                    {t("No saved blocks yet.", "এখনো কোনো সেভ করা ব্লক নেই।")}
                  </li>
                )}
                {blocks.map((block) => (
                  <li key={block.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        const ids = editor.insert(template, slot, block.nodes, {
                          parentId: addParent,
                        });
                        if (ids?.length) setSelectedIds(ids);
                        setLeftTab("layers");
                      }}
                      className="min-w-0 flex-1 truncate rounded-fq-md px-2 py-1.5 text-left text-xs hover:bg-muted"
                    >
                      {block.name}
                    </button>
                    <button
                      type="button"
                      aria-label={t("Delete block", "ব্লক মুছুন")}
                      onClick={() => setBlocks(deleteBlock(themeId, block.id))}
                      className="shrink-0 inline-flex min-h-8 items-center rounded-fq-md border border-border px-2 py-1 text-xs"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>

              {/* Phase 3.3: blocks travel between stores as plain JSON. */}
              {/* Phase 1.5: global blocks are stored once and linked everywhere. */}
              <div className="space-y-2 border-t border-border pt-3">
                <form
                  className="space-y-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveAsGlobal.mutate(globalName);
                  }}
                >
                  <label htmlFor="global-name" className="block text-xs font-medium">
                    {t("Save selection as a global block", "নির্বাচনটি গ্লোবাল ব্লক হিসেবে সেভ করুন")}
                  </label>
                  <input
                    id="global-name"
                    value={globalName}
                    onChange={(event) => setGlobalName(event.target.value)}
                    placeholder={t("Global block name", "গ্লোবাল ব্লকের নাম")}
                    className="w-full rounded-fq-md border border-border bg-card px-2 py-1.5 text-xs"
                  />
                  <button
                    type="submit"
                    disabled={saveAsGlobal.isPending || !themeId}
                    className="rounded-fq-md border border-border px-2 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
                  >
                    {saveAsGlobal.isPending
                      ? t("Saving…", "সেভ হচ্ছে…")
                      : t("Save global block", "গ্লোবাল ব্লক সেভ")}
                  </button>
                </form>

                {globalsQuery.isError && (
                  <p className="text-[11px] text-destructive" role="alert">
                    {t("Could not load global blocks.", "গ্লোবাল ব্লক লোড করা যায়নি।")}{" "}
                    <button type="button" className="underline" onClick={() => void globalsQuery.refetch()}>
                      {t("Retry", "আবার চেষ্টা")}
                    </button>
                  </p>
                )}

                <ul className="space-y-1">
                  {globalsQuery.isLoading && (
                    <li className="text-xs text-muted-foreground">{t("Loading…", "লোড হচ্ছে…")}</li>
                  )}
                  {!globalsQuery.isLoading && globals.length === 0 && (
                    <li className="text-xs text-muted-foreground">
                      {t("No global blocks yet.", "এখনো কোনো গ্লোবাল ব্লক নেই।")}
                    </li>
                  )}
                  {globals.map((block) => (
                    <li key={block.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          placeLinked(block);
                          setLeftTab("layers");
                        }}
                        className="min-w-0 flex-1 truncate rounded-fq-md px-2 py-1.5 text-left text-xs hover:bg-muted"
                      >
                        {block.name}
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          ×{globalUsage[block.id] ?? 0}
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={t("Delete global block", "গ্লোবাল ব্লক মুছুন")}
                        disabled={removeGlobal.isPending}
                        onClick={() => {
                          if ((globalUsage[block.id] ?? 0) > 0) {
                            toast.error(
                              t(
                                "Detach every placement before deleting",
                                "মুছার আগে সব জায়গা থেকে আলাদা করুন",
                              ),
                            );
                            return;
                          }
                          removeGlobal.mutate(block.id);
                        }}
                        className="shrink-0 inline-flex min-h-8 items-center rounded-fq-md border border-border px-2 py-1 text-xs disabled:opacity-50"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2 border-t border-border pt-3">
                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={blocks.length === 0}
                    onClick={() => {
                      const json = exportBlocks(themeId, blocks);
                      void navigator.clipboard?.writeText(json);
                      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
                      const link = document.createElement("a");
                      link.href = url;
                      link.download = "framique-blocks.json";
                      link.click();
                      URL.revokeObjectURL(url);
                      toast.success(t("Blocks exported", "ব্লক এক্সপোর্ট হয়েছে"));
                    }}
                    className="rounded-fq-md border border-border px-2 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
                  >
                    {t("Export", "এক্সপোর্ট")}
                  </button>
                  <label className="cursor-pointer rounded-fq-md border border-border px-2 py-1.5 text-xs hover:bg-muted">
                    {t("Import", "ইমপোর্ট")}
                    <input
                      type="file"
                      accept="application/json"
                      className="sr-only"
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (!file) return;
                        const result = importBlocks(themeId, await file.text());
                        setBlocks(result.blocks);
                        if (result.added > 0) {
                          toast.success(
                            t(`${result.added} block(s) imported`, `${result.added}টি ব্লক ইমপোর্ট হয়েছে`),
                          );
                        } else {
                          toast.error(t("Nothing could be imported", "কিছুই ইমপোর্ট করা যায়নি"));
                        }
                      }}
                    />
                  </label>
                </div>
                <p className="text-[0.65rem] text-muted-foreground">
                  {t(
                    "Exported blocks are also copied to your clipboard. Duplicate names are skipped on import.",
                    "এক্সপোর্ট করা ব্লক ক্লিপবোর্ডেও কপি হয়। একই নামের ব্লক ইমপোর্টে বাদ যায়।",
                  )}
                </p>
              </div>
            </div>
          )}

        </aside>

        <section
          className="space-y-3 rounded-fq-lg border border-border bg-muted p-4"
          aria-label={t("Preview", "প্রিভিউ")}
        >
          <div className="flex flex-wrap items-center justify-center gap-2">
            <div role="tablist" aria-label={t("Preview size", "প্রিভিউ সাইজ")} className="flex gap-1">
              {DEVICE_PRESETS.map((preset) => (
                <button
                  key={preset.width}
                  type="button"
                  role="tab"
                  aria-selected={previewWidth === preset.width}
                  onClick={() => setPreviewWidth(preset.width)}
                  className={`rounded-fq-md px-2.5 py-1.5 text-xs tabular-nums ${
                    previewWidth === preset.width
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-card"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div role="tablist" aria-label={t("Preview language", "প্রিভিউ ভাষা")} className="flex gap-1">
              {(
                [
                  ["en", "EN"],
                  ["bn", "বাংলা"],
                  ["both", t("Side by side", "পাশাপাশি")],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={locale === key}
                  onClick={() => setLocale(key)}
                  className={`rounded-fq-md px-2.5 py-1.5 text-xs ${
                    locale === key ? "bg-primary text-primary-foreground" : "border border-border bg-card"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t("Editing the", "এডিট করছেন")} <strong>{device}</strong> {t("layer", "লেয়ার")}
            </p>
          </div>

          <div className="flex justify-center gap-4 overflow-x-auto">
            {(locale === "both" ? (["en", "bn"] as const) : ([locale] as const)).map((frameLang) => (
              <div key={frameLang} className="shrink-0 space-y-1">
                {locale === "both" && (
                  <p className="text-center text-[11px] text-muted-foreground">
                    {frameLang === "en" ? "EN" : "বাংলা"}
                  </p>
                )}
                <div
                  lang={frameLang}
                  dir="ltr"
                  onClick={(event) => {
                    const node = (event.target as HTMLElement).closest("[data-node-id]");
                    const id = node?.getAttribute("data-node-id");
                    if (id) selectOnCanvas(id, event.metaKey || event.ctrlKey || event.shiftKey ? "toggle" : "replace");
                  }}
                  onContextMenu={(event) => {
                    const node = (event.target as HTMLElement).closest("[data-node-id]");
                    const id = node?.getAttribute("data-node-id");
                    if (!id) return;
                    event.preventDefault();
                    selectOnCanvas(id, "replace");
                    openMenu(id, event.clientX, event.clientY);
                  }}
                  className={`space-y-3 rounded-fq-lg border border-border p-4 transition-[width] ${
                    frameLang === "bn" ? "font-bangla" : ""
                  }`}
                  style={{
                    width: `${previewWidth}px`,
                    maxWidth: "100%",
                    ...(doc ? (tokensToCss(doc.tokens) as React.CSSProperties) : {}),
                    backgroundColor: doc?.tokens.surface,
                    color: doc?.tokens.ink,
                  }}
                >
                  {canvas.sections.length === 0 ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">
                      {t("This slot is empty.", "এই স্লট খালি।")}
                    </p>
                  ) : (
                    canvas.sections.map((section) => (
                      <SectionRenderer
                        key={section.id}
                        section={section}
                        editing
                        device={device}
                        locale={frameLang}
                        template={template}
                        selectedIds={selectedIds}
                        onInlineEdit={(nodeId, key, value) => {
                          // Grafted global-block content is a projection: editing
                          // it here would be silently discarded on next resolve.
                          if (isGraftedId(nodeId)) {
                            toast.error(
                              t(
                                "Open the global block to edit its content",
                                "কনটেন্ট বদলাতে গ্লোবাল ব্লকটি খুলুন",
                              ),
                            );
                            return;
                          }
                          editor.setPropAt(template, slot, nodeId, key, value, device);
                        }}
                      />
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>


        <aside className="space-y-3 rounded-fq-lg border border-border bg-card p-4">
          <div role="tablist" aria-label={t("Studio panels", "স্টুডিও প্যানেল")} className="flex flex-wrap gap-1">
            {(
              [
                ["inspect", t("Settings", "সেটিংস")],
                ["seo", t("SEO", "SEO")],
                ["brand", t("Brand", "ব্র্যান্ড")],
                ["history", t("History", "ইতিহাস")],
                ["themes", t("Themes", "থিম")],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={panel === key}
                onClick={() => setPanel(key)}
                className={`rounded-fq-md px-2 py-1.5 text-xs ${
                  panel === key ? "bg-primary text-primary-foreground" : "border border-border"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {panel === "inspect" && (
            <SectionInspector
              section={selected}
              template={template}
              device={device}
              onChange={(key, value, bp) =>
                selected && editor.setPropAt(template, slot, selected.id, key, value, bp)
              }
              onClearOverride={(key, bp) =>
                selected && editor.clearOverride(template, slot, selected.id, key, bp)
              }
              onToggleHidden={(bp) => selected && editor.toggleHidden(template, slot, selected.id, bp)}
              onDelete={() => {
                if (!selected) return;
                editor.remove(template, slot, selected.id);
                setSelectedIds([]);
              }}
              onDuplicate={() => selected && editor.duplicate(template, slot, selected.id)}
              onWhenChange={(rules) => selected && editor.setWhen(template, slot, selected.id, rules)}
              onAbChange={(ab) => selected && editor.setAb(template, slot, selected.id, ab)}
            />
          )}


          {panel === "seo" && (
            <SeoDrawer
              themeId={themeId}
              template={template}
              ast={ast}
              issues={issues}
              storeName={workspace.data?.theme?.name ?? "Store"}
            />
          )}

          {panel === "brand" && doc && <TokenEditor tokens={doc.tokens} onChange={editor.setTokens} />}

          {panel === "history" && (
            <div className="space-y-4">
              <form
                className="space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  scheduleRelease.mutate();
                }}
              >
                <label htmlFor="schedule-at" className="block text-xs font-medium">
                  {t("Schedule publish", "পাবলিশ শিডিউল")}
                </label>
                <input
                  id="schedule-at"
                  type="datetime-local"
                  required
                  value={runAt}
                  onChange={(e) => setRunAt(e.target.value)}
                  className="w-full rounded-fq-md border border-border bg-card px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={scheduleRelease.isPending || !runAt}
                  className="rounded-fq-md border border-border px-3 py-2 text-sm disabled:opacity-50"
                >
                  {t("Schedule", "শিডিউল")}
                </button>
              </form>
              <VersionTimeline
                versions={workspace.data?.versions ?? []}
                schedules={workspace.data?.schedules ?? []}
                busy={busy}
                onRollback={(id) => restore.mutate(id)}
                onCancelSchedule={(id) => dropSchedule.mutate(id)}
              />
            </div>
          )}

          {panel === "themes" && (
            <div className="space-y-2">
              {updatePreview.data && (
                <section
                  className="rounded-fq-md border border-border p-3"
                  aria-labelledby="theme-update-heading"
                >
                  <h3 id="theme-update-heading" className="text-sm font-semibold">
                    {updatePreview.data.available
                      ? t("Update available", "আপডেট রয়েছে")
                      : t("Theme is up to date", "থিম আপ টু ডেট")}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {updatePreview.data.key} · {updatePreview.data.installedVersion ?? "—"} →{" "}
                    {updatePreview.data.latestVersion}
                  </p>
                  {updatePreview.data.available && (
                    <>
                      <ul className="mt-2 space-y-1 text-xs">
                        {updatePreview.data.diff.length === 0 && (
                          <li className="text-muted-foreground">
                            {t("No section changes", "কোনো সেকশন পরিবর্তন নেই")}
                          </li>
                        )}
                        {updatePreview.data.diff.map((entry) => (
                          <li key={entry.template}>
                            <span className="font-medium">
                              {t(
                                TEMPLATE_LABEL[entry.template].en,
                                TEMPLATE_LABEL[entry.template].bn,
                              )}
                            </span>{" "}
                            <span className="text-muted-foreground tabular-nums">
                              +{entry.added.length} {t("new", "নতুন")} · ~{entry.changed.length}{" "}
                              {t("changed", "পরিবর্তিত")} · −{entry.removed.length}{" "}
                              {t("yours not upstream", "আপনার নিজস্ব")}
                            </span>
                          </li>
                        ))}
                        {updatePreview.data.tokensChanged && (
                          <li className="text-muted-foreground">
                            {t("Brand tokens differ", "ব্র্যান্ড টোকেন ভিন্ন")}
                          </li>
                        )}
                      </ul>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => applyUpdate.mutate("adopt")}
                          className="inline-flex min-h-8 items-center rounded-fq-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                        >
                          {t("Adopt new sections", "নতুন সেকশন নিন")}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => applyUpdate.mutate("keep_mine")}
                          className="inline-flex min-h-8 items-center rounded-fq-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                        >
                          {t("Keep mine, add only new", "আমারটা রাখুন, শুধু নতুন যোগ")}
                        </button>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t(
                          "Applied as a draft — review, then publish.",
                          "ড্রাফট হিসেবে প্রয়োগ হবে — দেখে নিয়ে পাবলিশ করুন।",
                        )}
                      </p>
                    </>
                  )}
                </section>
              )}

              {pendingInstall && (
                <div role="alertdialog" aria-label={t("Replace draft", "ড্রাফট প্রতিস্থাপন")}
                  className="rounded-fq-md border border-border p-3">
                  <p className="text-xs">
                    {t(
                      "You have unsaved draft work. Installing replaces it.",
                      "আপনার অসংরক্ষিত ড্রাফট আছে। ইনস্টল করলে সেটি প্রতিস্থাপিত হবে।",
                    )}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        installTheme.mutate({ key: pendingInstall, overwriteDraft: true });
                        setPendingInstall(null);
                      }}
                      className="inline-flex min-h-8 items-center rounded-fq-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                    >
                      {t("Replace draft", "ড্রাফট প্রতিস্থাপন")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingInstall(null)}
                      className="inline-flex min-h-8 items-center rounded-fq-md border border-border px-2 py-1 text-xs hover:bg-muted"
                    >
                      {t("Cancel", "বাতিল")}
                    </button>
                  </div>
                </div>
              )}

              {registryQuery.isLoading && (
                <p className="text-sm text-muted-foreground">{t("Loading themes…", "থিম লোড হচ্ছে…")}</p>
              )}
              {versionQuery.data && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-fq-md border border-border bg-muted/40 p-3 text-xs">
                  <span className="text-muted-foreground">
                    {t("Builder API", "বিল্ডার এপিআই")} {versionQuery.data.builderApi} ·{" "}
                    {t("accepts", "গ্রহণ করে")} {versionQuery.data.presetApiRange}
                  </span>
                  <button
                    type="button"
                    disabled={busy || removeDemo.isPending}
                    onClick={() => removeDemo.mutate()}
                    className="rounded-fq-md border border-border px-2 py-1 hover:bg-muted disabled:opacity-50"
                  >
                    {t("Remove demo content", "ডেমো কনটেন্ট সরান")}
                  </button>
                </div>
              )}
              {(registryQuery.data ?? []).map((theme) => (
                <article key={theme.key} className="rounded-fq-md border border-border p-3">
                  <h3 className="text-sm font-semibold">{theme.nameEn}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {theme.summaryEn} · v{theme.version}
                  </p>
                  <div className="mt-2 flex items-center gap-1" aria-hidden="true">
                    {[theme.tokens.brand, theme.tokens.accent, theme.tokens.surface, theme.tokens.ink].map(
                      (colour) => (
                        <span
                          key={colour}
                          className="size-4 rounded-full border border-border"
                          style={{ backgroundColor: colour }}
                        />
                      ),
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => installTheme.mutate({ key: theme.key })}
                    className="mt-2 inline-flex min-h-8 items-center rounded-fq-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                  >
                    {t("Install as draft", "ড্রাফট হিসেবে ইনস্টল")}
                  </button>
                  <button
                    type="button"
                    disabled={busy || !doc}
                    onClick={() => swapPreset.mutate({ key: theme.key })}
                    className="mt-2 ml-2 inline-flex min-h-8 items-center rounded-fq-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                  >
                    {t("Swap preset, keep content", "প্রিসেট বদলান, কনটেন্ট রাখুন")}
                  </button>
                  <button
                    type="button"
                    disabled={busy || importDemo.isPending || compatByKey.get(theme.key)?.compatible === false}
                    onClick={() => importDemo.mutate({ key: theme.key })}
                    className="mt-2 ml-2 inline-flex min-h-8 items-center rounded-fq-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                  >
                    {t("Install with demo content", "ডেমো কনটেন্ট সহ ইনস্টল")}
                  </button>
                  {compatByKey.get(theme.key)?.compatible === false && (
                    <p className="mt-2 text-xs text-danger">
                      {t("Not compatible with this builder version", "এই বিল্ডার ভার্সনের সাথে সামঞ্জস্যপূর্ণ নয়")}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </aside>
      </div>

      {/* Phase 1.2 / 1.4 overlays live at the end so they escape panel overflow. */}
      <NodeContextMenu
        at={menu ? { x: menu.x, y: menu.y } : null}
        items={menuItems}
        label={t("Layer actions", "লেয়ার অ্যাকশন")}
        onClose={() => setMenu(null)}
      />
      <ShortcutHelp
        open={helpOpen}
        platform={platform}
        onClose={() => setHelpOpen(false)}
      />
    </div>
    </PluginProvider>
  );
}
