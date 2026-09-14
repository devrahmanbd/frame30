/**
 * Phase 3.2 — repeatable rows for `array` fields.
 *
 * Rows are plain JSON records, so autosave, versioning and the server
 * sanitiser keep working untouched. Reordering is drag *and* keyboard, because
 * a merchant on a touch device or a screen reader still has to be able to
 * arrange a FAQ list.
 */
import { useState } from "react";
import { MAX_ARRAY_ROWS, type Field, type PropRow, type PropScalar } from "@/lib/builder-ast";
import { useLang } from "@/lib/i18n";

type Props = {
  field: Field;
  rows: PropRow[];
  onChange: (rows: PropRow[]) => void;
  renderRowField: (sub: Field, row: PropRow, set: (key: string, value: PropScalar) => void) => React.ReactNode;
};

function summarise(field: Field, row: PropRow, index: number): string {
  const key = field.itemLabel ?? field.fields?.[0]?.key ?? "";
  const value = key ? row[key] : undefined;
  const text = typeof value === "string" ? value.trim() : value !== undefined ? String(value) : "";
  return text || `#${index + 1}`;
}

export function ArrayFieldEditor({ field, rows, onChange, renderRowField }: Props) {
  const { t } = useLang();
  const [open, setOpen] = useState<number | null>(rows.length ? 0 : null);
  const [dragging, setDragging] = useState<number | null>(null);
  const cap = Math.min(field.maxRows ?? MAX_ARRAY_ROWS, MAX_ARRAY_ROWS);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= rows.length || from === to) return;
    const next = rows.slice();
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row!);
    onChange(next);
    setOpen(to);
  };

  const blank = (): PropRow => {
    const row: PropRow = {};
    for (const sub of field.fields ?? []) {
      row[sub.key] = sub.kind === "boolean" ? false : sub.kind === "number" || sub.kind === "range" || sub.kind === "unit" ? (sub.min ?? 0) : "";
    }
    return row;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium">{field.label}</span>
        <span className="text-[0.65rem] text-muted-foreground">
          {rows.length}/{cap}
        </span>
      </div>

      <ul className="space-y-2">
        {rows.map((row, index) => (
          <li
            key={index}
            draggable
            onDragStart={() => setDragging(index)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (dragging !== null) move(dragging, index);
              setDragging(null);
            }}
            className="rounded-fq-md border border-border bg-card"
          >
            <div className="flex items-center gap-1 px-2 py-1.5">
              <button
                type="button"
                onClick={() => setOpen(open === index ? null : index)}
                aria-expanded={open === index}
                className="flex-1 truncate text-left text-xs"
              >
                {summarise(field, row, index)}
              </button>
              <button
                type="button"
                aria-label={t("Move up", "উপরে")}
                onClick={() => move(index, index - 1)}
                disabled={index === 0}
                className="rounded-fq-sm border border-border px-1.5 text-[0.65rem] disabled:opacity-40"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={t("Move down", "নিচে")}
                onClick={() => move(index, index + 1)}
                disabled={index === rows.length - 1}
                className="rounded-fq-sm border border-border px-1.5 text-[0.65rem] disabled:opacity-40"
              >
                ↓
              </button>
              <button
                type="button"
                aria-label={t("Duplicate row", "রো কপি")}
                onClick={() => {
                  if (rows.length >= cap) return;
                  const next = rows.slice();
                  next.splice(index + 1, 0, { ...row });
                  onChange(next);
                }}
                className="rounded-fq-sm border border-border px-1.5 text-[0.65rem]"
              >
                ⧉
              </button>
              <button
                type="button"
                aria-label={t("Remove row", "রো মুছুন")}
                onClick={() => onChange(rows.filter((_, i) => i !== index))}
                className="rounded-fq-sm border border-danger px-1.5 text-[0.65rem] text-danger-foreground"
              >
                ✕
              </button>
            </div>

            {open === index && (
              <div className="space-y-3 border-t border-border p-2">
                {(field.fields ?? []).map((sub) =>
                  renderRowField(sub, row, (key, value) => {
                    const next = rows.slice();
                    next[index] = { ...row, [key]: value };
                    onChange(next);
                  }),
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      <button
        type="button"
        disabled={rows.length >= cap}
        onClick={() => {
          onChange([...rows, blank()]);
          setOpen(rows.length);
        }}
        className="rounded-fq-md border border-border px-2 py-1.5 text-xs hover:bg-muted disabled:opacity-40"
      >
        {t("Add row", "রো যোগ করুন")}
      </button>
    </div>
  );
}
