import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EMPTY_AST,
  TEMPLATE_KEYS,
  astDigest,
  lintTemplate,
  newSection,
  type Breakpoint,
  type PropValue,
  type Section,
  type SectionType,
  type Slot,
  type TemplateKey,
  type TemplateMap,
  type ThemeAst,
  type ThemeTokens,
} from "@/lib/builder-ast";
import {
  TEMPLATE_VARIANT_KEYS,
  baseTemplateKey,
  type TemplateVariantKey,
} from "@/lib/template-variants";
import type { VisibilityRule } from "@/lib/visibility";
import { getWidget } from "@/lib/unified-widget-registry";
import {
  errorsForField,
  fieldsOf,
  validateProps,
  type PropSchema,
} from "@/lib/widget-props";
import {
  canDrop,
  cloneNodes,
  insertNodes,
  locate,
  mapTree,
  moveRelative,
  nudge,
  removeNodes,
  topMost,
  type DropPosition,
} from "@/lib/builder-tree";

/**
 * The editor's document.
 *
 * `templates` is a `TemplateMap`, not a `ThemeTemplates`: the map carries
 * the VARIANT keys (`blog_listing`, `blog_article`, `archive_category`, …)
 * beside the base keys, and a variant is a first-class editable template
 * from Batch C on — the editor can address it, lint it, save it and publish
 * it beside its base.
 */
export type EditorDoc = { templates: TemplateMap; tokens: ThemeTokens };

/**
 * The editor's template IDENTITY: a base key, or one of the CLOSED variant
 * keys (`blog_listing`, `blog_article`, `archive_category`, …).
 *
 * Nothing else is addressable. An unvalidated suffix is not a template: the
 * closed vocabulary (`src/lib/template-variants.ts`) is what the editor, the
 * routes and the publish gate all agree on.
 */
export type EditorTemplateKey = TemplateKey | TemplateVariantKey;

/* ---------------------------------------------------------------------------
 * Frame30 Loop B — client save path: `setPropAt` validation.
 *
 * Schema-carrying widgets (a registry `propsSchema` with fields) validate
 * every write through the SAME `validateProps` module the server save path
 * (`commitVersion`) calls, so the two can never disagree. Legacy widgets (no
 * def, or the empty legacy-unvalidated shape the adapters emit) pass values
 * through exactly as before — the legacy AST pipeline owns them.
 *
 * Refusal contract: unknown keys (including `__proto__`/`constructor`
 * injection) fail with `<key>.unknown_prop`; invalid values fail with the
 * exact `validateProps` field codes. Valid writes store the CLEANED value
 * (clamps, coercions, sanitised text), matching what the server stores.
 * Nothing here throws: hostile shapes fail closed with field errors.
 */

export type SetPropAtVerdict =
  { ok: true; value: unknown } | { ok: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

/**
 * Top-level known keys of a schema. Groups are presentation-only clusters
 * that store flat (same convention as `validateProps` flattening), so the
 * walk recurses through `group` fields only — repeater sub-keys are NOT
 * top-level keys and stay refused at this layer.
 */
export function schemaTopLevelKeys(schema: PropSchema): Set<string> {
  const out = new Set<string>();
  const walk = (fields: readonly unknown[] | undefined) => {
    for (const entry of fields ?? []) {
      if (!isRecord(entry)) continue;
      const field = entry as {
        kind?: unknown;
        key?: unknown;
        fields?: readonly unknown[];
      };
      if (field.kind === "group") {
        walk(field.fields);
      } else if (typeof field.key === "string") {
        out.add(field.key);
      }
    }
  };
  try {
    walk(fieldsOf(schema) as readonly unknown[]);
  } catch {
    // Hostile schema shape: no keys are known, every write is refused below.
  }
  return out;
}

/**
 * Non-empty registry schema for a section, or null for the legacy path.
 * Candidates mirror the inspector resolution (pluginKey first, then the bare
 * type and the `builtin:` alias); the empty adapter shape means
 * legacy-unvalidated, never a bypass. Only the server/client registry copy
 * is consulted — a schema embedded in the section payload is ignored.
 */
function schemaForSectionType(
  section: Pick<Section, "type" | "props">,
): PropSchema | null {
  try {
    const props = isRecord(section.props)
      ? (section.props as Record<string, unknown>)
      : {};
    const candidates: string[] = [];
    if (section.type === "plugin_block") {
      const key = props["pluginKey"];
      if (typeof key === "string" && key.trim()) candidates.push(key.trim());
    }
    if (typeof section.type === "string") {
      candidates.push(section.type, `builtin:${section.type}`);
    }
    for (const id of candidates) {
      const def = getWidget(id);
      const fields = (def?.propsSchema as { fields?: unknown } | undefined)
        ?.fields;
      if (!Array.isArray(fields) || fields.length === 0) continue;
      return def!.propsSchema as unknown as PropSchema;
    }
  } catch {
    // Registry lookup must never break editing: fall through to legacy.
  }
  return null;
}

/**
 * Pure field transition behind `setPropAt` for schema-carrying widgets.
 * `props` supplies context (sibling values); only the edited key's cleaned
 * value is returned, so unrelated properties are preserved by construction.
 */
export function validateSchemaPropEdit(
  schema: PropSchema,
  props: Record<string, unknown>,
  key: string,
  value: unknown,
): SetPropAtVerdict {
  if (!schemaTopLevelKeys(schema).has(key)) {
    return { ok: false, errors: [`${key}.unknown_prop`] };
  }
  const base = isRecord(props) ? props : {};
  let result: ReturnType<typeof validateProps>;
  try {
    result = validateProps(schema, { ...base, [key]: value });
  } catch {
    return { ok: false, errors: [`${key}.invalid`] };
  }
  const fieldErrors = errorsForField(result.errors, key);
  if (fieldErrors.length > 0) return { ok: false, errors: fieldErrors };
  return { ok: true, value: result.clean[key] };
}

/**
 * Pure doc-level transition behind `setPropAt`: resolves the section, finds
 * its schema (if any) and validates. Legacy sections, missing nodes and null
 * docs pass the raw value through — the writer below then behaves exactly as
 * before this change.
 */
export function checkSetPropAt(
  doc: EditorDoc | null,
  template: EditorTemplateKey,
  slot: Slot,
  id: string,
  key: string,
  value: PropValue,
  _device: Breakpoint,
): SetPropAtVerdict {
  try {
    const ast = doc?.templates[template];
    const sections = ast ? ast[slot] : undefined;
    const found =
      Array.isArray(sections) && typeof id === "string"
        ? locate(sections, id)
        : null;
    const section = found?.node;
    if (!section) return { ok: true, value };
    const schema = schemaForSectionType(section);
    if (!schema) return { ok: true, value };
    const props = isRecord(section.props)
      ? (section.props as Record<string, unknown>)
      : {};
    return validateSchemaPropEdit(schema, props, key, value);
  } catch {
    return { ok: false, errors: [`${key}.invalid`] };
  }
}

const HISTORY_LIMIT = 50;

function cloneAst(ast: ThemeAst): ThemeAst {
  return {
    header: [...ast.header],
    main: [...ast.main],
    footer: [...ast.footer],
  };
}

/**
 * Editor state machine: undo/redo history, dirty tracking and a debounced
 * autosave that carries a monotonic revision so a slow request can never
 * overwrite newer work.
 *
 * Phase 0.5: every structural action is tree-aware — it addresses nodes by id
 * anywhere in the slot tree rather than by top-level index.
 */
export function useBuilderEditor(
  initial: EditorDoc | null,
  opts: {
    revision: number;
    onAutosave: (doc: EditorDoc, revision: number) => Promise<unknown>;
    debounceMs?: number;
  },
) {
  const [doc, setDoc] = useState<EditorDoc | null>(initial);
  const [past, setPast] = useState<EditorDoc[]>([]);
  const [future, setFuture] = useState<EditorDoc[]>([]);
  const [savedDigest, setSavedDigest] = useState<string | null>(
    initial ? astDigest(initial.templates, initial.tokens) : null,
  );
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Loop B: last field-error codes refused by `setPropAt` validation.
  // Autosave failures keep using `error`; schema refusals never touch it.
  const [propErrors, setPropErrors] = useState<string[]>([]);
  const revision = useRef(opts.revision);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest doc for the synchronous `setPropAt` pre-check below. Synced in an
  // effect so the render phase stays pure; event handlers always see post-
  // effect state.
  const docRef = useRef<EditorDoc | null>(initial);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  // Adopt the server snapshot once it arrives (or when the theme changes).
  useEffect(() => {
    if (!initial) return;
    setDoc((current) => current ?? initial);
    setSavedDigest(
      (current) => current ?? astDigest(initial.templates, initial.tokens),
    );
    revision.current = Math.max(revision.current, opts.revision);
  }, [initial, opts.revision]);

  const digest = doc ? astDigest(doc.templates, doc.tokens) : null;
  const dirty = !!digest && digest !== savedDigest;

  const commit = useCallback((next: (current: EditorDoc) => EditorDoc) => {
    setDoc((current) => {
      if (!current) return current;
      const updated = next(current);
      setPast((stack) => [...stack.slice(-HISTORY_LIMIT), current]);
      setFuture([]);
      return updated;
    });
  }, []);

  const undo = useCallback(() => {
    setPast((stack) => {
      if (!stack.length) return stack;
      const previous = stack[stack.length - 1]!;
      setDoc((current) => {
        if (current) setFuture((f) => [current, ...f].slice(0, HISTORY_LIMIT));
        return previous;
      });
      return stack.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((stack) => {
      if (!stack.length) return stack;
      const next = stack[0]!;
      setDoc((current) => {
        if (current) setPast((p) => [...p, current].slice(-HISTORY_LIMIT));
        return next;
      });
      return stack.slice(1);
    });
  }, []);

  const flush = useCallback(async () => {
    if (!doc) return;
    const current = astDigest(doc.templates, doc.tokens);
    if (current === savedDigest) return;
    setSaving(true);
    setError(null);
    revision.current += 1;
    try {
      await opts.onAutosave(doc, revision.current);
      setSavedDigest(current);
      setSavedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "autosave_failed");
    } finally {
      setSaving(false);
    }
  }, [doc, savedDigest, opts]);

  // Autosave every few seconds of quiet: an editor crash never loses work.
  useEffect(() => {
    if (!dirty) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), opts.debounceMs ?? 3000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [dirty, flush, opts.debounceMs]);

  // Warn before losing unsaved work on navigation.
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const actions = useMemo(() => {
    const editSlot = (
      template: EditorTemplateKey,
      slot: Slot,
      fn: (sections: Section[]) => Section[],
    ) =>
      commit((current) => {
        const ast = cloneAst(current.templates[template] ?? EMPTY_AST);
        ast[slot] = fn(ast[slot]);
        return {
          ...current,
          templates: { ...current.templates, [template]: ast },
        };
      });

    /** Patch one node anywhere in the tree. */
    const editNode = (
      template: EditorTemplateKey,
      slot: Slot,
      id: string,
      fn: (section: Section) => Section,
    ) =>
      editSlot(template, slot, (sections) =>
        mapTree(sections, (s) => (s.id === id ? fn(s) : s)),
      );

    return {
      /**
       * Add a widget. `target` places it inside a container or after a node;
       * without one it lands at the end of the slot.
       */
      add(
        template: EditorTemplateKey,
        slot: Slot,
        type: SectionType,
        target?: { parentId?: string | null; index?: number },
      ) {
        const section = newSection(type);
        editSlot(template, slot, (sections) => {
          const parentId = target?.parentId ?? null;
          if (!canDrop(sections, [section], parentId).ok) return sections;
          const fallback =
            parentId === null
              ? sections.length
              : (locate(sections, parentId)?.node.children?.length ?? 0);
          return insertNodes(sections, parentId, target?.index ?? fallback, [
            section,
          ]);
        });
        return section.id;
      },
      /** Insert already-built nodes (saved blocks, clipboard) with fresh ids. */
      insert(
        template: EditorTemplateKey,
        slot: Slot,
        nodes: Section[],
        target?: { parentId?: string | null; index?: number },
      ) {
        const copies = cloneNodes(nodes);
        editSlot(template, slot, (sections) => {
          const parentId = target?.parentId ?? null;
          if (!canDrop(sections, copies, parentId).ok) return sections;
          const fallback =
            parentId === null
              ? sections.length
              : (locate(sections, parentId)?.node.children?.length ?? 0);
          return insertNodes(
            sections,
            parentId,
            target?.index ?? fallback,
            copies,
          );
        });
        return copies.map((node) => node.id);
      },
      remove(template: EditorTemplateKey, slot: Slot, id: string) {
        editSlot(
          template,
          slot,
          (sections) => removeNodes(sections, [id]).tree,
        );
      },
      removeMany(
        template: EditorTemplateKey,
        slot: Slot,
        ids: readonly string[],
      ) {
        editSlot(
          template,
          slot,
          (sections) => removeNodes(sections, topMost(sections, ids)).tree,
        );
      },
      /** Reorder within the current parent — the keyboard and arrow-button path. */
      nudge(
        template: EditorTemplateKey,
        slot: Slot,
        id: string,
        delta: -1 | 1,
      ) {
        editSlot(template, slot, (sections) => nudge(sections, id, delta));
      },
      /** Drag-and-drop: place `dragId` before/after/inside `targetId`. */
      moveNode(
        template: EditorTemplateKey,
        slot: Slot,
        dragId: string,
        targetId: string | null,
        position: DropPosition,
      ) {
        editSlot(template, slot, (sections) =>
          moveRelative(sections, dragId, targetId, position),
        );
      },
      duplicate(template: EditorTemplateKey, slot: Slot, id: string) {
        editSlot(template, slot, (sections) => {
          const found = locate(sections, id);
          if (!found) return sections;
          const [copy] = cloneNodes([found.node]);
          if (!copy || !canDrop(sections, [copy], found.parentId).ok)
            return sections;
          return insertNodes(sections, found.parentId, found.index + 1, [copy]);
        });
      },
      duplicateMany(
        template: EditorTemplateKey,
        slot: Slot,
        ids: readonly string[],
      ) {
        for (const id of ids) this.duplicate(template, slot, id);
      },
      setProp(
        template: EditorTemplateKey,
        slot: Slot,
        id: string,
        key: string,
        value: PropValue,
      ) {
        editNode(template, slot, id, (s) => ({
          ...s,
          props: { ...s.props, [key]: value },
        }));
      },
      /**
       * Write a value at the active breakpoint. `desktop` is the base layer, so
       * editing there updates props directly; narrower devices write an
       * override layer that inherits every key it does not declare.
       *
       * Loop B: schema-carrying widgets (registry `propsSchema`) validate
       * through the shared `validateProps` before writing. Refused writes
       * change nothing, record field errors on `propErrors`, and return the
       * verdict; callers that ignore the return value keep today's behavior
       * for legacy widgets (which always pass validation).
       */
      setPropAt(
        template: EditorTemplateKey,
        slot: Slot,
        id: string,
        key: string,
        value: PropValue,
        device: Breakpoint,
      ): SetPropAtVerdict {
        const verdict = checkSetPropAt(
          docRef.current,
          template,
          slot,
          id,
          key,
          value,
          device,
        );
        if (!verdict.ok) {
          setPropErrors(verdict.errors);
          return verdict;
        }
        setPropErrors([]);
        const clean = verdict.value as PropValue;
        editNode(template, slot, id, (s) => {
          if (device === "desktop")
            return { ...s, props: { ...s.props, [key]: clean } };
          const layer = { ...(s.bp?.[device] ?? {}), [key]: clean };
          return { ...s, bp: { ...(s.bp ?? {}), [device]: layer } };
        });
        return verdict;
      },
      /** Phase 3.2: conditional visibility rules for one node. */
      setWhen(
        template: EditorTemplateKey,
        slot: Slot,
        id: string,
        rules: VisibilityRule[],
      ) {
        editNode(template, slot, id, (s) => {
          const next: Section = { ...s };
          if (rules.length) next.when = rules;
          else delete next.when;
          return next;
        });
      },
      /** Phase 3.2: bind (or unbind) a node to an experiment variant. */
      setAb(
        template: EditorTemplateKey,
        slot: Slot,
        id: string,
        ab: Section["ab"],
      ) {
        editNode(template, slot, id, (s) => {
          const next: Section = { ...s };
          if (ab?.experiment && ab.variant) next.ab = ab;
          else delete next.ab;
          return next;
        });
      },
      /** Drop a breakpoint override so the field inherits the base value again. */
      clearOverride(
        template: EditorTemplateKey,
        slot: Slot,
        id: string,
        key: string,
        device: Breakpoint,
      ) {
        editNode(template, slot, id, (s) => {
          if (device === "desktop" || !s.bp?.[device]) return s;
          const layer = { ...s.bp[device] };
          delete layer[key];
          const bp = { ...s.bp };
          if (Object.keys(layer).length) bp[device] = layer;
          else delete bp[device];
          const next: Section = { ...s };
          if (Object.keys(bp).length) next.bp = bp;
          else delete next.bp;
          return next;
        });
      },
      toggleHidden(
        template: EditorTemplateKey,
        slot: Slot,
        id: string,
        breakpoint: Breakpoint,
      ) {
        editNode(template, slot, id, (s) => {
          const hidden = new Set(s.hidden ?? []);
          if (hidden.has(breakpoint)) hidden.delete(breakpoint);
          else hidden.add(breakpoint);
          const next: Section = { ...s };
          if (hidden.size) next.hidden = [...hidden];
          else delete next.hidden;
          return next;
        });
      },
      setTokens(patch: Partial<ThemeTokens>) {
        commit((current) => ({
          ...current,
          tokens: { ...current.tokens, ...patch },
        }));
      },
      /**
       * Phase 1.2: arbitrary single-node transform in one history step. Used by
       * paste-style, rename and the global-block link/unlink actions so those
       * never land as two separate undo entries.
       */
      updateNode(
        template: EditorTemplateKey,
        slot: Slot,
        id: string,
        fn: (section: Section) => Section,
      ) {
        editNode(template, slot, id, fn);
      },
      /**
       * Phase 1.5: insert an already-shaped node (e.g. a global-block
       * placement) verbatim, keeping its reserved props, at the given target.
       */
      insertRaw(
        template: EditorTemplateKey,
        slot: Slot,
        node: Section,
        target?: { parentId?: string | null; index?: number },
      ) {
        editSlot(template, slot, (sections) => {
          const parentId = target?.parentId ?? null;
          if (!canDrop(sections, [node], parentId).ok) return sections;
          const fallback =
            parentId === null
              ? sections.length
              : (locate(sections, parentId)?.node.children?.length ?? 0);
          return insertNodes(sections, parentId, target?.index ?? fallback, [
            node,
          ]);
        });
        return node.id;
      },
      /**
       * Phase 1.5: replace a linked placement with plain copies of the block's
       * nodes, in place, atomically.
       */
      detachPlacement(
        template: EditorTemplateKey,
        slot: Slot,
        id: string,
        nodes: Section[],
      ) {
        editSlot(template, slot, (sections) => {
          const found = locate(sections, id);
          if (!found) return sections;
          const copies = cloneNodes(nodes);
          const stripped = removeNodes(sections, [id]).tree;
          if (!copies.length) return stripped;
          if (!canDrop(stripped, copies, found.parentId).ok) return sections;
          return insertNodes(stripped, found.parentId, found.index, copies);
        });
      },
      replaceDoc(next: EditorDoc) {
        commit(() => next);
      },
    };
  }, [commit]);

  const issues = useMemo(() => {
    if (!doc)
      return {} as Record<
        TemplateKey | TemplateVariantKey,
        ReturnType<typeof lintTemplate>
      >;
    const out = {} as Record<
      TemplateKey | TemplateVariantKey,
      ReturnType<typeof lintTemplate>
    >;
    // The template KEY is part of the lint contract: templates whose <h1> is
    // supplied by the ROUTE (`ROUTE_H1_TEMPLATES`) must not be told they are
    // missing a primary heading, or a merchant who obeys the warning adds a
    // second <h1> next to the route's own. Every other template still owns
    // its heading, so the warning stays exactly as strict as before.
    for (const key of TEMPLATE_KEYS)
      out[key] = lintTemplate(doc.templates[key] ?? EMPTY_AST, key);
    // Every VARIANT is linted with its BASE key (`blog_listing` as `blog`),
    // so a context widget inside a variant is checked against the template
    // that owns the data. Linting a variant as if it were a template would
    // make every context widget inside it a publish-blocking "needs data
    // this template does not provide" error — the same rule the publish
    // gate applies (`lintTemplateMap`, `src/lib/themes.server.ts`).
    for (const variant of TEMPLATE_VARIANT_KEYS) {
      const ast = doc.templates[variant];
      if (!ast) continue;
      const base = baseTemplateKey(variant);
      if (!base) continue;
      out[variant] = lintTemplate(ast, base);
    }
    return out;
  }, [doc]);

  return {
    doc,
    setDoc,
    dirty,
    saving,
    savedAt,
    error,
    /** Last `setPropAt` field-error codes (empty when the last write passed). */
    propErrors,
    issues,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    historyDepth: HISTORY_LIMIT,
    undo,
    redo,
    flush,
    markSaved: () => {
      if (doc) setSavedDigest(astDigest(doc.templates, doc.tokens));
    },
    ...actions,
  };
}
