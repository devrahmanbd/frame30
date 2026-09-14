/**
 * Elementor-style page builder surface: widget tray, live canvas, inspector.
 *
 * State is one immutable `BuilderDoc` plus an undo/redo stack. Every mutation
 * goes through `commit()` so history, selection and the parent's onChange stay
 * in lockstep. Drag-and-drop is HTML5 native — no dependency, and it degrades
 * to the "add to selected column" button on touch.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Copy,
  Layers,
  Monitor,
  Plus,
  Redo2,
  Smartphone,
  Tablet,
  Trash2,
  Undo2,
} from "lucide-react";
import { useLang } from "@/lib/i18n";
import { PageCanvas, type Selection } from "./PageCanvas";
import {
  COLUMN_PRESETS,
  DEVICE_WIDTH,
  WIDGET_LABEL,
  newSection,
  newWidget,
  starterDoc,
  uid,
  type BuilderDoc,
  type Device,
  type Widget,
  type WidgetType,
} from "@/lib/page-builder";

const WIDGETS: WidgetType[] = [
  "heading",
  "text",
  "image",
  "button",
  "list",
  "quote",
  "divider",
  "spacer",
  "video",
  "html",
  "products",
];

const btn =
  "inline-flex min-h-9 items-center gap-1.5 rounded-fq-md border border-border px-2.5 text-xs font-medium text-foreground hover:bg-muted";
const field =
  "min-h-9 w-full rounded-fq-md border border-border bg-background px-2 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export function PageBuilder({
  doc,
  onChange,
  title,
}: {
  doc: BuilderDoc;
  onChange: (next: BuilderDoc) => void;
  title?: string;
}) {
  const { t } = useLang();
  const [selection, setSelection] = useState<Selection>(null);
  const [device, setDevice] = useState<Device>("desktop");
  const [previewing, setPreviewing] = useState(false);
  const past = useRef<BuilderDoc[]>([]);
  const future = useRef<BuilderDoc[]>([]);
  const dragged = useRef<WidgetType | null>(null);

  const commit = useCallback(
    (next: BuilderDoc) => {
      past.current = [...past.current.slice(-40), doc];
      future.current = [];
      onChange(next);
    },
    [doc, onChange],
  );

  const undo = () => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current = [doc, ...future.current];
    onChange(prev);
  };
  const redo = () => {
    const [next, ...rest] = future.current;
    if (!next) return;
    future.current = rest;
    past.current = [...past.current, doc];
    onChange(next);
  };

  /* ---------------- tree helpers ---------------- */

  const mapSections = (fn: (s: BuilderDoc["sections"][number]) => BuilderDoc["sections"][number] | null) =>
    ({ ...doc, sections: doc.sections.map(fn).filter(Boolean) as BuilderDoc["sections"] });

  const addSection = (spans: number[]) => commit({ ...doc, sections: [...doc.sections, newSection(spans)] });

  const insertWidget = (sectionId: string, columnId: string, index: number, widget: Widget) =>
    commit(
      mapSections((s) =>
        s.id !== sectionId
          ? s
          : {
              ...s,
              columns: s.columns.map((c) =>
                c.id !== columnId
                  ? c
                  : { ...c, widgets: [...c.widgets.slice(0, index), widget, ...c.widgets.slice(index)] },
              ),
            },
      ),
    );

  const updateWidget = (widgetId: string, patch: Partial<Widget["settings"]>) =>
    commit(
      mapSections((s) => ({
        ...s,
        columns: s.columns.map((c) => ({
          ...c,
          widgets: c.widgets.map((w) => (w.id === widgetId ? { ...w, settings: { ...w.settings, ...patch } } : w)),
        })),
      })),
    );

  const removeSelected = () => {
    if (!selection) return;
    if (selection.kind === "section") commit(mapSections((s) => (s.id === selection.sectionId ? null : s)));
    if (selection.kind === "column")
      commit(
        mapSections((s) =>
          s.id !== selection.sectionId ? s : { ...s, columns: s.columns.filter((c) => c.id !== selection.columnId) },
        ),
      );
    if (selection.kind === "widget")
      commit(
        mapSections((s) => ({
          ...s,
          columns: s.columns.map((c) => ({ ...c, widgets: c.widgets.filter((w) => w.id !== selection.widgetId) })),
        })),
      );
    setSelection(null);
  };

  const duplicateSelected = () => {
    if (!selection) return;
    if (selection.kind === "section") {
      const src = doc.sections.find((s) => s.id === selection.sectionId);
      if (!src) return;
      const clone = JSON.parse(JSON.stringify(src)) as BuilderDoc["sections"][number];
      clone.id = uid();
      clone.columns = clone.columns.map((c) => ({ ...c, id: uid(), widgets: c.widgets.map((w) => ({ ...w, id: uid() })) }));
      const i = doc.sections.findIndex((s) => s.id === src.id);
      commit({ ...doc, sections: [...doc.sections.slice(0, i + 1), clone, ...doc.sections.slice(i + 1)] });
    }
    if (selection.kind === "widget") {
      commit(
        mapSections((s) => ({
          ...s,
          columns: s.columns.map((c) => {
            const i = c.widgets.findIndex((w) => w.id === selection.widgetId);
            if (i < 0) return c;
            const clone = { ...c.widgets[i]!, id: uid() };
            return { ...c, widgets: [...c.widgets.slice(0, i + 1), clone, ...c.widgets.slice(i + 1)] };
          }),
        })),
      );
    }
  };

  const moveSection = (sectionId: string, dir: -1 | 1) => {
    const i = doc.sections.findIndex((s) => s.id === sectionId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= doc.sections.length) return;
    const next = [...doc.sections];
    [next[i], next[j]] = [next[j]!, next[i]!];
    commit({ ...doc, sections: next });
  };

  const selectedWidget = useMemo(() => {
    if (selection?.kind !== "widget") return null;
    for (const s of doc.sections)
      for (const c of s.columns) {
        const w = c.widgets.find((x) => x.id === selection.widgetId);
        if (w) return w;
      }
    return null;
  }, [doc, selection]);

  const selectedSection = selection ? doc.sections.find((s) => s.id === selection.sectionId) ?? null : null;

  const patchSection = (patch: Partial<BuilderDoc["sections"][number]>) => {
    if (!selectedSection) return;
    commit(mapSections((s) => (s.id === selectedSection.id ? { ...s, ...patch } : s)));
  };

  /* ---------------- render ---------------- */

  return (
    <div className="rounded-fq-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-2">
        <span className="mr-auto flex items-center gap-2 text-sm font-semibold">
          <Layers className="size-4" aria-hidden />
          {t("Page builder", "পেজ বিল্ডার")}
          {title ? <span className="text-xs font-normal text-muted-foreground">· {title}</span> : null}
        </span>
        <button type="button" className={btn} onClick={undo} aria-label={t("Undo", "আগেরটা")}>
          <Undo2 className="size-3.5" aria-hidden /> {t("Undo", "আগেরটা")}
        </button>
        <button type="button" className={btn} onClick={redo} aria-label={t("Redo", "পরেরটা")}>
          <Redo2 className="size-3.5" aria-hidden /> {t("Redo", "পরেরটা")}
        </button>
        <div className="flex items-center gap-1 rounded-fq-md border border-border p-0.5">
          {([["desktop", Monitor], ["tablet", Tablet], ["mobile", Smartphone]] as const).map(([d, Icon]) => (
            <button
              key={d}
              type="button"
              aria-label={d}
              aria-pressed={device === d}
              onClick={() => setDevice(d)}
              className={`grid size-8 place-items-center rounded-fq-sm ${device === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              <Icon className="size-4" aria-hidden />
            </button>
          ))}
        </div>
        <button type="button" className={btn} onClick={() => setPreviewing((p) => !p)} aria-pressed={previewing}>
          {previewing ? t("Edit", "সম্পাদনা") : t("Preview", "প্রিভিউ")}
        </button>
      </div>

      <div className="grid gap-0 lg:grid-cols-[210px_1fr_260px]">
        {/* Widget tray */}
        <aside className="border-b border-border p-3 lg:border-b-0 lg:border-r">
          <p className="text-xs font-semibold text-muted-foreground">{t("Widgets", "উইজেট")}</p>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {WIDGETS.map((type) => (
              <button
                key={type}
                type="button"
                draggable
                onDragStart={() => {
                  dragged.current = type;
                }}
                onClick={() => {
                  const target =
                    selection && selection.kind !== "section"
                      ? { sectionId: selection.sectionId, columnId: selection.columnId }
                      : (() => {
                          const s = doc.sections[doc.sections.length - 1];
                          return s?.columns[0] ? { sectionId: s.id, columnId: s.columns[0].id } : null;
                        })();
                  if (!target) return;
                  insertWidget(target.sectionId, target.columnId, Number.MAX_SAFE_INTEGER, newWidget(type));
                }}
                className="cursor-grab rounded-fq-md border border-border px-2 py-2 text-[11px] text-foreground hover:border-primary hover:bg-muted"
              >
                {t(WIDGET_LABEL[type].en, WIDGET_LABEL[type].bn)}
              </button>
            ))}
          </div>

          <p className="mt-4 text-xs font-semibold text-muted-foreground">{t("Add section", "সেকশন যোগ")}</p>
          <div className="mt-2 grid gap-1.5">
            {COLUMN_PRESETS.map((p) => (
              <button key={p.key} type="button" className={`${btn} justify-between`} onClick={() => addSection(p.spans)}>
                {p.label}
                <Plus className="size-3.5" aria-hidden />
              </button>
            ))}
            {doc.sections.length === 0 && (
              <button type="button" className={`${btn} justify-center`} onClick={() => commit(starterDoc(title))}>
                {t("Start from template", "টেমপ্লেট থেকে শুরু")}
              </button>
            )}
          </div>
        </aside>

        {/* Canvas */}
        <div className="overflow-auto bg-muted/40 p-4">
          <div
            className="mx-auto max-w-full overflow-hidden rounded-fq-md border border-border bg-background shadow-sm transition-[width]"
            style={{ width: DEVICE_WIDTH[device] }}
          >
            <PageCanvas
              doc={doc}
              editable={!previewing}
              selection={selection}
              onSelect={setSelection}
              onDropWidget={({ sectionId, columnId, index }) => {
                if (!dragged.current) return;
                insertWidget(sectionId, columnId, index, newWidget(dragged.current));
                dragged.current = null;
              }}
            />
          </div>
        </div>

        {/* Inspector */}
        <aside className="border-t border-border p-3 lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground">{t("Settings", "সেটিংস")}</p>
            {selection && (
              <div className="flex gap-1">
                <button type="button" className={btn} onClick={duplicateSelected} aria-label={t("Duplicate", "কপি")}>
                  <Copy className="size-3.5" aria-hidden />
                </button>
                <button type="button" className={btn} onClick={removeSelected} aria-label={t("Delete", "মুছুন")}>
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </div>
            )}
          </div>

          {!selection && (
            <p className="mt-3 text-xs text-muted-foreground">
              {t("Select a section, column or widget to edit it.", "সম্পাদনা করতে সেকশন, কলাম বা উইজেট নির্বাচন করুন।")}
            </p>
          )}

          {selectedWidget && <WidgetInspector widget={selectedWidget} onPatch={(p) => updateWidget(selectedWidget.id, p)} />}

          {selection?.kind === "section" && selectedSection && (
            <div className="mt-3 space-y-2">
              <Row label={t("Background", "ব্যাকগ্রাউন্ড")}>
                <input
                  type="text"
                  placeholder="#ffffff"
                  className={field}
                  value={selectedSection.background ?? ""}
                  onChange={(e) => patchSection({ background: e.target.value || undefined })}
                />
              </Row>
              <Row label={t("Vertical padding", "উল্লম্ব প্যাডিং")}>
                <input
                  type="number"
                  className={field}
                  value={selectedSection.paddingY ?? 40}
                  onChange={(e) => patchSection({ paddingY: Number(e.target.value) || 0 })}
                />
              </Row>
              <Row label={t("Gap", "ফাঁক")}>
                <input
                  type="number"
                  className={field}
                  value={selectedSection.gap ?? 24}
                  onChange={(e) => patchSection({ gap: Number(e.target.value) || 0 })}
                />
              </Row>
              <Row label={t("Width", "প্রস্থ")}>
                <select
                  className={field}
                  value={selectedSection.width ?? "boxed"}
                  onChange={(e) => patchSection({ width: e.target.value as "boxed" | "full" })}
                >
                  <option value="boxed">{t("Boxed", "বক্সড")}</option>
                  <option value="full">{t("Full width", "পূর্ণ প্রস্থ")}</option>
                </select>
              </Row>
              <div className="flex gap-1.5">
                <button type="button" className={btn} onClick={() => moveSection(selectedSection.id, -1)}>
                  {t("Move up", "উপরে")}
                </button>
                <button type="button" className={btn} onClick={() => moveSection(selectedSection.id, 1)}>
                  {t("Move down", "নিচে")}
                </button>
              </div>
            </div>
          )}

          {selection?.kind === "column" && selectedSection && (
            <div className="mt-3 space-y-2">
              {(() => {
                const col = selectedSection.columns.find((c) => c.id === selection.columnId);
                if (!col) return null;
                const patchColumn = (patch: Partial<typeof col>) =>
                  commit(
                    mapSections((s) =>
                      s.id !== selectedSection.id
                        ? s
                        : { ...s, columns: s.columns.map((c) => (c.id === col.id ? { ...c, ...patch } : c)) },
                    ),
                  );
                return (
                  <>
                    <Row label={t("Width (1–12)", "প্রস্থ (১–১২)")}>
                      <input
                        type="number"
                        min={1}
                        max={12}
                        className={field}
                        value={col.span}
                        onChange={(e) => patchColumn({ span: Math.min(12, Math.max(1, Number(e.target.value) || 1)) })}
                      />
                    </Row>
                    <Row label={t("Padding", "প্যাডিং")}>
                      <input
                        type="number"
                        className={field}
                        value={col.padding ?? 0}
                        onChange={(e) => patchColumn({ padding: Number(e.target.value) || 0 })}
                      />
                    </Row>
                    <Row label={t("Background", "ব্যাকগ্রাউন্ড")}>
                      <input
                        type="text"
                        className={field}
                        value={col.background ?? ""}
                        onChange={(e) => patchColumn({ background: e.target.value || undefined })}
                      />
                    </Row>
                    <button
                      type="button"
                      className={btn}
                      onClick={() =>
                        commit(
                          mapSections((s) =>
                            s.id !== selectedSection.id
                              ? s
                              : { ...s, columns: [...s.columns, { id: uid(), span: 6, widgets: [] }] },
                          ),
                        )
                      }
                    >
                      <Plus className="size-3.5" aria-hidden /> {t("Add column", "কলাম যোগ")}
                    </button>
                  </>
                );
              })()}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-[11px] text-muted-foreground">
      {label}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

function WidgetInspector({ widget, onPatch }: { widget: Widget; onPatch: (p: Partial<Widget["settings"]>) => void }) {
  const { t } = useLang();
  const s = widget.settings;
  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-semibold">{t(WIDGET_LABEL[widget.type].en, WIDGET_LABEL[widget.type].bn)}</p>

      {(widget.type === "heading" || widget.type === "text" || widget.type === "quote") && (
        <Row label={t("Content", "বিষয়বস্তু")}>
          <textarea
            rows={3}
            className={`${field} py-2`}
            value={s.text ?? ""}
            onChange={(e) => onPatch({ text: e.target.value })}
          />
        </Row>
      )}

      {widget.type === "heading" && (
        <Row label={t("Level", "লেভেল")}>
          <select className={field} value={s.level ?? 2} onChange={(e) => onPatch({ level: Number(e.target.value) as 1 })}>
            {[1, 2, 3, 4].map((l) => (
              <option key={l} value={l}>{`H${l}`}</option>
            ))}
          </select>
        </Row>
      )}

      {widget.type === "quote" && (
        <Row label={t("Author", "লেখক")}>
          <input className={field} value={s.author ?? ""} onChange={(e) => onPatch({ author: e.target.value })} />
        </Row>
      )}

      {widget.type === "image" && (
        <>
          <Row label={t("Image URL", "ছবির লিংক")}>
            <input className={field} value={s.url ?? ""} onChange={(e) => onPatch({ url: e.target.value })} />
          </Row>
          <Row label={t("Alt text", "বিকল্প টেক্সট")}>
            <input className={field} value={s.alt ?? ""} onChange={(e) => onPatch({ alt: e.target.value })} />
          </Row>
          <Row label={t("Corner radius", "কোণের ব্যাসার্ধ")}>
            <input
              type="number"
              className={field}
              value={s.radius ?? 12}
              onChange={(e) => onPatch({ radius: Number(e.target.value) || 0 })}
            />
          </Row>
        </>
      )}

      {widget.type === "button" && (
        <>
          <Row label={t("Label", "লেবেল")}>
            <input className={field} value={s.label ?? ""} onChange={(e) => onPatch({ label: e.target.value })} />
          </Row>
          <Row label={t("Link", "লিংক")}>
            <input className={field} value={s.href ?? ""} onChange={(e) => onPatch({ href: e.target.value })} />
          </Row>
          <Row label={t("Style", "স্টাইল")}>
            <select
              className={field}
              value={s.variant ?? "primary"}
              onChange={(e) => onPatch({ variant: e.target.value as "primary" })}
            >
              <option value="primary">Primary</option>
              <option value="outline">Outline</option>
              <option value="ghost">Ghost</option>
            </select>
          </Row>
        </>
      )}

      {widget.type === "list" && (
        <Row label={t("Items (one per line)", "আইটেম (প্রতি লাইনে একটি)")}>
          <textarea
            rows={4}
            className={`${field} py-2`}
            value={(s.items ?? []).join("\n")}
            onChange={(e) => onPatch({ items: e.target.value.split("\n") })}
          />
        </Row>
      )}

      {widget.type === "products" && (
        <>
          <Row label={t("Heading", "শিরোনাম")}>
            <input
              className={field}
              value={s.heading ?? ""}
              placeholder={t("Optional", "ঐচ্ছিক")}
              onChange={(e) => onPatch({ heading: e.target.value })}
            />
          </Row>
          <Row label={t("Category handle", "ক্যাটাগরি হ্যান্ডেল")}>
            <input
              className={field}
              value={s.category ?? ""}
              placeholder={t("All products", "সব পণ্য")}
              onChange={(e) => onPatch({ category: e.target.value })}
            />
          </Row>
          <Row label={t("How many", "কতগুলো")}>
            <input
              type="number"
              min={1}
              max={24}
              className={field}
              value={s.limit ?? 4}
              onChange={(e) => onPatch({ limit: Number(e.target.value) || 1 })}
            />
          </Row>
          <Row label={t("Per row", "প্রতি সারিতে")}>
            <input
              type="number"
              min={1}
              max={6}
              className={field}
              value={s.perRow ?? 4}
              onChange={(e) => onPatch({ perRow: Number(e.target.value) || 1 })}
            />
          </Row>
          <Row label={t("Show price", "দাম দেখান")}>
            <input
              type="checkbox"
              className="size-5 accent-[color:var(--primary)]"
              checked={s.showPrice !== false}
              onChange={(e) => onPatch({ showPrice: e.target.checked })}
            />
          </Row>
        </>
      )}

      {widget.type === "spacer" && (
        <Row label={t("Height", "উচ্চতা")}>
          <input
            type="number"
            className={field}
            value={s.height ?? 32}
            onChange={(e) => onPatch({ height: Number(e.target.value) || 0 })}
          />
        </Row>
      )}

      {widget.type === "video" && (
        <Row label={t("Embed URL", "এমবেড লিংক")}>
          <input className={field} value={s.url ?? ""} onChange={(e) => onPatch({ url: e.target.value })} />
        </Row>
      )}

      {widget.type === "html" && (
        <Row label={t("HTML", "এইচটিএমএল")}>
          <textarea rows={5} className={`${field} py-2`} value={s.html ?? ""} onChange={(e) => onPatch({ html: e.target.value })} />
        </Row>
      )}

      {widget.type !== "spacer" && widget.type !== "divider" && (
        <>
          <Row label={t("Align", "অ্যালাইন")}>
            <select className={field} value={s.align ?? "left"} onChange={(e) => onPatch({ align: e.target.value as "left" })}>
              <option value="left">{t("Left", "বাম")}</option>
              <option value="center">{t("Center", "মাঝ")}</option>
              <option value="right">{t("Right", "ডান")}</option>
            </select>
          </Row>
          {(widget.type === "heading" || widget.type === "text" || widget.type === "list") && (
            <Row label={t("Font size", "ফন্ট সাইজ")}>
              <input
                type="number"
                className={field}
                value={s.size ?? 16}
                onChange={(e) => onPatch({ size: Number(e.target.value) || 16 })}
              />
            </Row>
          )}
          <Row label={t("Text colour", "টেক্সট রঙ")}>
            <input className={field} placeholder="#111111" value={s.color ?? ""} onChange={(e) => onPatch({ color: e.target.value || undefined })} />
          </Row>
        </>
      )}

      <Row label={t("Bottom spacing", "নিচের ফাঁক")}>
        <input
          type="number"
          className={field}
          value={s.marginBottom ?? 12}
          onChange={(e) => onPatch({ marginBottom: Number(e.target.value) || 0 })}
        />
      </Row>
    </div>
  );
}
