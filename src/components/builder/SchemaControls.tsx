/**
 * Frame30 — schema-driven widget controls (`propsSchema` render layer).
 *
 * Renders labelled controls from a `PropSchema` (`src/lib/widget-props.ts`).
 * The component is fully controlled — it holds no module or instance state,
 * so two instances over the same schema can never cross-contaminate; all
 * transitions flow through `onChange(key, value, device)` and the exported
 * pure helpers `applySchemaChange` / `applyRepeaterRowChange`, which are the
 * exact transitions the handlers perform (covered by state-transition tests
 * because this repo has no DOM test harness — see `SchemaControls.test.tsx`).
 *
 * Render contract per kind (mirrors `CONTROL_STATUS` in widget-props):
 * - full (text/richtext/number/boolean/select/color/spacing/dimensions/
 *   link/icon/category): complete editable controls.
 * - placeholder-kind (image/media/video/product/collection pickers plus
 *   typography/responsive/visibility/animation): complete editable controls
 *   on the SAME `(field, value, onChange)` contract — the `placeholder`
 *   status comes from the shared `CONTROL_STATUS` vocabulary (untouched
 *   here), while the controls below are the former next batch, now
 *   implemented. Clearing a scalar picker stores `""`; structured editors
 *   commit whole objects with unknown keys preserved, and the shared
 *   `validateProps` value layer is the ONLY validator — this module adds no
 *   rejection rules of its own.
 * - structural (repeater/group): nesting.
 * - unknown kinds render nothing (fail closed, never a fallback input).
 *
 * `showWhen` gates rendering only (validation still applies — see
 * `isFieldVisible`). The device layer supplies the displayed value and
 * `device` tags the `onChange`, but the overrides object itself is never
 * written — its shape passes through untouched, exactly as `validateProps`
 * preserves `bp` layers. Responsive-kind fields additionally document the
 * cascade: a device-tagged write is persisted to that device layer by the
 * host, so desktop values inherit down until overridden.
 */

import { useId } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  CONTROL_STATUS,
  defaultsFor,
  errorsForField,
  fieldsOf,
  isFieldVisible,
  validateProps,
  type PropField,
  type PropSchema,
  type ValidatePropsResult,
  type WidgetProps,
} from "@/lib/widget-props";

/**
 * NEXT BATCH — implemented below. Former placeholders (image / media / video /
 * product / collection pickers plus typography / responsive / visibility /
 * animation structured editors) are full controls on the final contract:
 * `onChange(key, value, device)` with scalar pickers clearing to `""` and
 * structured editors committing whole objects (unknown keys preserved via
 * spread). The value layer (`validateProps`) remains the only validator.
 */
export type SchemaChangeHandler = (
  key: string,
  value: unknown,
  device?: string,
) => void;

export type SchemaControlsProps = {
  schema: PropSchema;
  props: WidgetProps;
  errors?: readonly string[];
  /** Active breakpoint label; values resolve from `overrides[device]`. */
  device?: string;
  /** Read-only responsive layers (`{ [device]: { [key]: value } }`). */
  overrides?: Record<string, WidgetProps>;
  onChange: SchemaChangeHandler;
  /** When set, controls wrap in a form validated by the shared validator. */
  onSubmit?: (clean: WidgetProps) => void;
  onValidationError?: (errors: string[]) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

/** Top-level known keys, groups flattened (presentation-only clusters). */
function knownKeys(schema: PropSchema): Set<string> {
  const out = new Set<string>();
  const walk = (fields: readonly PropField[] | undefined) => {
    for (const f of fields ?? []) {
      if (!isRecord(f)) continue;
      const field = f as unknown as PropField;
      if (field.kind === "group") walk(field.fields);
      else if (typeof field.key === "string") out.add(field.key);
    }
  };
  walk(fieldsOf(schema));
  return out;
}

/**
 * Pure top-level transition behind every scalar control: immutable set for
 * schema-known keys, identity return for unknown keys (fail closed).
 */
export function applySchemaChange(
  schema: PropSchema,
  props: WidgetProps,
  key: string,
  value: unknown,
): WidgetProps {
  if (!knownKeys(schema).has(key)) return props;
  return { ...props, [key]: value };
}

function rowSchemaOf(field: PropField): PropField[] {
  const out: PropField[] = [];
  const walk = (fields: readonly PropField[] | undefined) => {
    for (const f of fields ?? []) {
      if (!isRecord(f)) continue;
      const sub = f as unknown as PropField;
      if (sub.kind === "group") walk(sub.fields);
      else if (sub.kind !== "repeater") out.push(sub);
    }
  };
  walk(field.fields);
  return out;
}

/**
 * Pure nested transition behind repeater row controls: immutable row update.
 * Unknown repeaters, out-of-range indexes and unknown sub-keys return the
 * input reference unchanged (fail closed).
 */
export function applyRepeaterRowChange(
  schema: PropSchema,
  props: WidgetProps,
  repeaterKey: string,
  index: number,
  subKey: string,
  value: unknown,
): WidgetProps {
  const repeater = knownKeys(schema).has(repeaterKey)
    ? topFieldOf(schema, repeaterKey)
    : undefined;
  if (!repeater || repeater.kind !== "repeater") return props;
  const rows = props[repeaterKey];
  if (!Array.isArray(rows) || index < 0 || index >= rows.length) return props;
  if (!rowSchemaOf(repeater).some((s) => s.key === subKey)) return props;
  const row = rows[index];
  const record = isRecord(row) ? row : {};
  const nextRows = rows.map((r, j) =>
    j === index ? { ...record, [subKey]: value } : r,
  );
  return { ...props, [repeaterKey]: nextRows };
}

/**
 * Structured-entry transitions behind the typography / responsive /
 * visibility / animation editors. Objects commit whole (unknown keys
 * preserved via spread — the value layer decides what survives); hostile
 * bases normalize to `{}`, hostile or duplicate keys and over-cap adds
 * return the input reference unchanged (fail closed). No validation here —
 * `validateProps` is the only validator.
 */
const STRUCTURED_KEY_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/;
const HOSTILE_STRUCTURED_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);
const MAX_STRUCTURED_ENTRIES = 50;

function asStructuredRecord(base: unknown): Record<string, unknown> {
  return isRecord(base) ? base : {};
}

function isWritableStructuredKey(key: string, record: Record<string, unknown>) {
  return (
    STRUCTURED_KEY_RE.test(key) &&
    !HOSTILE_STRUCTURED_KEYS.has(key) &&
    (Object.prototype.hasOwnProperty.call(record, key) ||
      Object.keys(record).length < MAX_STRUCTURED_ENTRIES)
  );
}

export function applyStructuredEntryChange(
  base: unknown,
  subKey: string,
  value: unknown,
): Record<string, unknown> {
  const record = asStructuredRecord(base);
  if (typeof subKey !== "string" || !isWritableStructuredKey(subKey, record))
    return record;
  if (Object.is(record[subKey], value)) return record;
  return { ...record, [subKey]: value };
}

export function applyStructuredEntryRemove(
  base: unknown,
  subKey: string,
): Record<string, unknown> {
  const record = asStructuredRecord(base);
  if (!Object.prototype.hasOwnProperty.call(record, subKey)) return record;
  const next = { ...record };
  delete next[subKey];
  return next;
}

export function applyStructuredListChange(
  base: unknown,
  index: number,
  value: unknown,
): unknown[] {
  const list = Array.isArray(base) ? base : [];
  if (index < 0 || index >= list.length) return list;
  if (Object.is(list[index], value)) return list;
  return list.map((item, i) => (i === index ? value : item));
}

export function applyStructuredListRemove(
  base: unknown,
  index: number,
): unknown[] {
  const list = Array.isArray(base) ? base : [];
  if (index < 0 || index >= list.length) return list;
  return list.filter((_, i) => i !== index);
}

function topFieldOf(schema: PropSchema, key: string): PropField | undefined {
  const walk = (
    fields: readonly PropField[] | undefined,
  ): PropField | undefined => {
    for (const f of fields ?? []) {
      if (!isRecord(f)) continue;
      const field = f as unknown as PropField;
      if (field.kind === "group") {
        const found = walk(field.fields);
        if (found) return found;
      } else if (field.key === key) return field;
    }
    return undefined;
  };
  return walk(fieldsOf(schema));
}

/**
 * Submit path. This is the SAME `validateProps` module the server save path
 * calls — client submit and server re-validation cannot disagree.
 */
export function submitSchemaProps(
  schema: PropSchema,
  props: WidgetProps,
): ValidatePropsResult {
  return validateProps(schema, props);
}

const PICKER_INPUT_TYPE: Record<string, string> = {
  image: "url",
  media: "url",
  video: "url",
  product: "text",
  collection: "text",
};

const PICKER_PLACEHOLDER: Record<string, string> = {
  image: "https://… or /relative",
  media: "https://… or /relative",
  video: "https://… or /relative",
  product: "product-handle",
  collection: "collection-handle",
};

const PICKER_HINT: Record<string, string> = {
  image: "Image URL — pick stores the URL string, Clear stores an empty value.",
  media: "Media URL — pick stores the URL string, Clear stores an empty value.",
  video: "Video URL — pick stores the URL string, Clear stores an empty value.",
  product: "Product handle — values validate through the shared schema.",
  collection: "Collection handle — values validate through the shared schema.",
};

const sharedInput =
  "w-full rounded-fq-md border border-border bg-card px-3 py-2 text-sm";

export function SchemaControls({
  schema,
  props,
  errors = [],
  device,
  overrides,
  onChange,
  onSubmit,
  onValidationError,
}: SchemaControlsProps) {
  const uid = useId();
  const layer =
    device && overrides && isRecord(overrides[device])
      ? overrides[device]
      : undefined;
  // Device-layer value wins for display; base props are untouched and the
  // overrides object is never written (passthrough).
  const effective: WidgetProps =
    layer !== undefined ? { ...props, ...layer } : props;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const result = validateProps(schema, props);
    if (result.ok) onSubmit?.(result.clean);
    else onValidationError?.(result.errors);
  };

  const renderErrors = (codes: string[], idBase: string): ReactNode => {
    if (codes.length === 0) return null;
    return (
      <div id={`${idBase}-errors`} className="space-y-0.5">
        {codes.map((code) => (
          <p key={code} className="text-[0.65rem] text-danger-foreground">
            {code}
          </p>
        ))}
      </div>
    );
  };

  const renderHeader = (
    field: PropField,
    id: string,
    showOverride: boolean,
  ): ReactNode => (
    <div className="flex items-baseline justify-between gap-2">
      <label htmlFor={id} className="block text-xs font-medium">
        {field.label}
        {field.required === true ? (
          <span className="ml-1 text-muted-foreground">· required</span>
        ) : null}
      </label>
      {showOverride && device ? (
        <span className="text-[0.65rem] text-muted-foreground">
          {device} override
        </span>
      ) : null}
    </div>
  );

  const renderHelp = (field: PropField): ReactNode =>
    field.help ? (
      <p className="text-[0.65rem] text-muted-foreground">{field.help}</p>
    ) : null;

  const renderPicker = (
    field: PropField,
    value: unknown,
    errorKey: string,
    commit: (next: unknown) => void,
  ): ReactNode => {
    const idBase = `${uid}-${field.key}`;
    const inputId = `${idBase}-input`;
    const current = typeof value === "string" ? value : "";
    const showOverride =
      layer !== undefined &&
      Object.prototype.hasOwnProperty.call(layer, field.key);
    return (
      <div
        key={field.key}
        data-field={field.key}
        data-status="placeholder"
        data-placeholder={field.kind}
        className="space-y-1"
      >
        {renderHeader(field, inputId, showOverride)}
        <div className="flex gap-2">
          <input
            id={inputId}
            type={PICKER_INPUT_TYPE[field.kind] ?? "text"}
            placeholder={PICKER_PLACEHOLDER[field.kind] ?? ""}
            value={current}
            onChange={(e) => commit(e.target.value)}
            className={`${sharedInput} min-w-0 flex-1`}
          />
          <button
            type="button"
            onClick={() => commit("")}
            aria-label={`Clear ${field.label}`}
            className="min-h-9 shrink-0 rounded-fq-sm border border-border px-2 text-xs text-muted-foreground hover:bg-muted"
          >
            Clear
          </button>
        </div>
        <p className="text-[0.65rem] text-muted-foreground">
          {PICKER_HINT[field.kind] ??
            "Values validate through the shared schema."}
        </p>
        {renderHelp(field)}
        {renderErrors(errorsForField(errors, errorKey), idBase)}
      </div>
    );
  };

  const structuredShell = (
    field: PropField,
    labelledId: string,
    body: ReactNode,
    errorKey: string,
  ): ReactNode => {
    const idBase = `${uid}-${field.key}`;
    const showOverride =
      layer !== undefined &&
      Object.prototype.hasOwnProperty.call(layer, field.key);
    return (
      <div
        key={field.key}
        data-field={field.key}
        data-status="placeholder"
        data-placeholder={field.kind}
        className="space-y-1"
      >
        {renderHeader(field, labelledId, showOverride)}
        {body}
        {renderHelp(field)}
        {renderErrors(errorsForField(errors, errorKey), idBase)}
      </div>
    );
  };

  const renderTypography = (
    field: PropField,
    value: unknown,
    errorKey: string,
    commit: (next: unknown) => void,
  ): ReactNode => {
    const idBase = `${uid}-${field.key}`;
    const record = asStructuredRecord(value);
    const textOf = (k: string): string =>
      typeof record[k] === "string" ? (record[k] as string) : "";
    const numOf = (k: string): number | "" =>
      typeof record[k] === "number" ? (record[k] as number) : "";
    const set = (k: string, next: unknown) =>
      commit(applyStructuredEntryChange(record, k, next));
    const colorValue = textOf("color");
    return structuredShell(
      field,
      `${idBase}-family`,
      <>
        <div className="grid grid-cols-2 gap-1">
          <div className="space-y-0.5">
            <label
              htmlFor={`${idBase}-family`}
              className="block text-[0.65rem] text-muted-foreground"
            >
              Family
            </label>
            <input
              id={`${idBase}-family`}
              type="text"
              value={textOf("fontFamily")}
              onChange={(e) => set("fontFamily", e.target.value)}
              className={`${sharedInput} px-2 text-xs`}
            />
          </div>
          <div className="space-y-0.5">
            <label
              htmlFor={`${idBase}-size`}
              className="block text-[0.65rem] text-muted-foreground"
            >
              Size
            </label>
            <input
              id={`${idBase}-size`}
              type="number"
              value={numOf("fontSize")}
              onChange={(e) =>
                set(
                  "fontSize",
                  e.target.value === "" ? "" : Number(e.target.value),
                )
              }
              className={`${sharedInput} px-2 text-xs`}
            />
          </div>
          <div className="space-y-0.5">
            <label
              htmlFor={`${idBase}-weight`}
              className="block text-[0.65rem] text-muted-foreground"
            >
              Weight
            </label>
            <select
              id={`${idBase}-weight`}
              value={textOf("fontWeight")}
              onChange={(e) => set("fontWeight", e.target.value)}
              className={`${sharedInput} px-2 text-xs`}
            >
              <option value="">—</option>
              {(["400", "500", "600", "700", "800"] as const).map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-0.5">
            <label
              htmlFor={`${idBase}-lineHeight`}
              className="block text-[0.65rem] text-muted-foreground"
            >
              Line height
            </label>
            <input
              id={`${idBase}-lineHeight`}
              type="number"
              value={numOf("lineHeight")}
              onChange={(e) =>
                set(
                  "lineHeight",
                  e.target.value === "" ? "" : Number(e.target.value),
                )
              }
              className={`${sharedInput} px-2 text-xs`}
            />
          </div>
          <div className="space-y-0.5">
            <label
              htmlFor={`${idBase}-letterSpacing`}
              className="block text-[0.65rem] text-muted-foreground"
            >
              Spacing
            </label>
            <input
              id={`${idBase}-letterSpacing`}
              type="number"
              value={numOf("letterSpacing")}
              onChange={(e) =>
                set(
                  "letterSpacing",
                  e.target.value === "" ? "" : Number(e.target.value),
                )
              }
              className={`${sharedInput} px-2 text-xs`}
            />
          </div>
          <div className="space-y-0.5">
            <label
              htmlFor={`${idBase}-color`}
              className="block text-[0.65rem] text-muted-foreground"
            >
              Color
            </label>
            <div className="flex items-center gap-1">
              <input
                type="color"
                value={
                  /^#[0-9a-f]{6}$/i.test(colorValue) ? colorValue : "#000000"
                }
                onChange={(e) => set("color", e.target.value)}
                aria-label={`${field.label} color picker`}
                className="h-9 w-10 shrink-0 cursor-pointer rounded-fq-sm border border-border bg-card"
              />
              <input
                id={`${idBase}-color`}
                type="text"
                value={colorValue}
                onChange={(e) => set("color", e.target.value)}
                aria-label={`${field.label} color value`}
                className={`${sharedInput} min-w-0 flex-1 px-2 text-xs`}
              />
            </div>
          </div>
        </div>
        <p className="text-[0.65rem] text-muted-foreground">
          Unlisted keys are preserved untouched — values validate through the
          shared schema.
        </p>
      </>,
      errorKey,
    );
  };

  const renderEntriesEditor = (
    field: PropField,
    record: Record<string, unknown>,
    idBase: string,
    commit: (next: unknown) => void,
  ): ReactNode => {
    const keys = Object.keys(record).slice(0, MAX_STRUCTURED_ENTRIES);
    const addEntry = () => {
      const keyEl = document.getElementById(
        `${idBase}-new-key`,
      ) as HTMLInputElement | null;
      const valEl = document.getElementById(
        `${idBase}-new-value`,
      ) as HTMLInputElement | null;
      const nextKey = keyEl?.value.trim() ?? "";
      if (!isWritableStructuredKey(nextKey, record)) return;
      if (Object.prototype.hasOwnProperty.call(record, nextKey)) return;
      commit({ ...record, [nextKey]: valEl?.value ?? "" });
    };
    return (
      <div className="space-y-1">
        {keys.map((k) => {
          const entry = record[k];
          const scalar =
            typeof entry === "string" ||
            typeof entry === "number" ||
            typeof entry === "boolean";
          return (
            <div key={k} className="flex items-center gap-1">
              <span className="w-20 shrink-0 truncate text-[0.65rem] text-muted-foreground">
                {k}
              </span>
              {scalar ? (
                <input
                  id={`${idBase}-entry-${k}`}
                  type="text"
                  value={String(entry)}
                  onChange={(e) =>
                    commit(
                      applyStructuredEntryChange(record, k, e.target.value),
                    )
                  }
                  aria-label={`${field.label} ${k}`}
                  className={`${sharedInput} min-w-0 flex-1 px-2 text-xs`}
                />
              ) : (
                <span className="min-w-0 flex-1 truncate px-2 py-2 text-[0.65rem] text-muted-foreground">
                  Structured value — kept as-is
                </span>
              )}
              <button
                type="button"
                onClick={() => commit(applyStructuredEntryRemove(record, k))}
                aria-label={`Remove ${field.label} ${k}`}
                className="shrink-0 rounded-fq-sm border border-border px-1.5 py-1 text-[0.65rem] text-muted-foreground hover:bg-muted"
              >
                ✕
              </button>
            </div>
          );
        })}
        {keys.length === 0 ? (
          <p className="text-[0.65rem] text-muted-foreground">
            No entries yet — add one below.
          </p>
        ) : null}
        <div className="flex items-center gap-1">
          <input
            id={`${idBase}-new-key`}
            type="text"
            defaultValue=""
            placeholder="key"
            aria-label={`${field.label} new entry key`}
            className={`${sharedInput} min-w-0 flex-1 px-2 text-xs`}
          />
          <input
            id={`${idBase}-new-value`}
            type="text"
            defaultValue=""
            placeholder="value"
            aria-label={`${field.label} new entry value`}
            className={`${sharedInput} min-w-0 flex-1 px-2 text-xs`}
          />
          <button
            type="button"
            onClick={addEntry}
            className="shrink-0 rounded-fq-sm border border-border px-1.5 py-1 text-[0.65rem] text-muted-foreground hover:bg-muted"
          >
            Add
          </button>
        </div>
      </div>
    );
  };

  const renderResponsive = (
    field: PropField,
    value: unknown,
    errorKey: string,
    commit: (next: unknown) => void,
  ): ReactNode => {
    const idBase = `${uid}-${field.key}`;
    const body =
      Array.isArray(value) || isRecord(value) ? (
        <>
          {renderEntriesEditor(
            field,
            Array.isArray(value)
              ? Object.fromEntries(value.map((item, i) => [String(i), item]))
              : (value as Record<string, unknown>),
            idBase,
            (next) => {
              if (Array.isArray(value)) {
                const entries = Object.entries(
                  next as Record<string, unknown>,
                ).sort(([a], [b]) => Number(a) - Number(b));
                commit(entries.map(([, item]) => item));
              } else {
                commit(next);
              }
            },
          )}
          <p className="text-[0.65rem] text-muted-foreground">
            {device && device !== "desktop"
              ? `Editing the ${device} layer — desktop values inherit down until overridden.`
              : "Edits write through the device layer — desktop values inherit down until overridden."}
          </p>
        </>
      ) : (
        <>
          <input
            id={`${idBase}-scalar`}
            type="text"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => commit(e.target.value)}
            className={sharedInput}
          />
          <p className="text-[0.65rem] text-muted-foreground">
            {device && device !== "desktop"
              ? `Editing the ${device} layer — desktop values inherit down until overridden.`
              : "Edits write through the device layer — desktop values inherit down until overridden."}
          </p>
        </>
      );
    return structuredShell(field, `${idBase}-scalar`, body, errorKey);
  };

  const renderVisibility = (
    field: PropField,
    value: unknown,
    errorKey: string,
    commit: (next: unknown) => void,
  ): ReactNode => {
    const idBase = `${uid}-${field.key}`;
    const record = asStructuredRecord(value);
    const shown = (bp: string): boolean =>
      record[bp] === undefined ? true : record[bp] === true;
    const hiddenEverywhere = (["desktop", "tablet", "mobile"] as const).every(
      (bp) => !shown(bp),
    );
    return structuredShell(
      field,
      `${idBase}-desktop`,
      <>
        {(["desktop", "tablet", "mobile"] as const).map((bp) => (
          <label key={bp} className="flex items-center gap-2 text-xs">
            <input
              id={`${idBase}-${bp}`}
              type="checkbox"
              checked={shown(bp)}
              onChange={(e) =>
                commit(applyStructuredEntryChange(record, bp, e.target.checked))
              }
              className="size-4 rounded border-border"
            />
            {bp === "desktop"
              ? "Desktop"
              : bp === "tablet"
                ? "Tablet"
                : "Mobile"}
          </label>
        ))}
        {hiddenEverywhere ? (
          <p className="text-[0.65rem] text-warning-foreground">
            Off on every breakpoint — this value never shows.
          </p>
        ) : null}
        <p className="text-[0.65rem] text-muted-foreground">
          Unlisted keys are preserved untouched — values validate through the
          shared schema.
        </p>
      </>,
      errorKey,
    );
  };

  const renderAnimation = (
    field: PropField,
    value: unknown,
    errorKey: string,
    commit: (next: unknown) => void,
  ): ReactNode => {
    const idBase = `${uid}-${field.key}`;
    const record = asStructuredRecord(value);
    const textOf = (k: string): string =>
      typeof record[k] === "string" ? (record[k] as string) : "";
    const numOf = (k: string): number | "" =>
      typeof record[k] === "number" ? (record[k] as number) : "";
    const set = (k: string, next: unknown) =>
      commit(applyStructuredEntryChange(record, k, next));
    return structuredShell(
      field,
      `${idBase}-type`,
      <>
        <div className="grid grid-cols-2 gap-1">
          <div className="space-y-0.5">
            <label
              htmlFor={`${idBase}-type`}
              className="block text-[0.65rem] text-muted-foreground"
            >
              Effect
            </label>
            <select
              id={`${idBase}-type`}
              value={textOf("type")}
              onChange={(e) => set("type", e.target.value)}
              className={`${sharedInput} px-2 text-xs`}
            >
              <option value="">—</option>
              {(
                ["none", "fade", "fade-up", "slide-in", "zoom-in"] as const
              ).map((effect) => (
                <option key={effect} value={effect}>
                  {effect}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-0.5">
            <label
              htmlFor={`${idBase}-easing`}
              className="block text-[0.65rem] text-muted-foreground"
            >
              Easing
            </label>
            <select
              id={`${idBase}-easing`}
              value={textOf("easing")}
              onChange={(e) => set("easing", e.target.value)}
              className={`${sharedInput} px-2 text-xs`}
            >
              <option value="">—</option>
              {(
                [
                  "ease",
                  "linear",
                  "ease-in",
                  "ease-out",
                  "ease-in-out",
                ] as const
              ).map((ease) => (
                <option key={ease} value={ease}>
                  {ease}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-0.5">
            <label
              htmlFor={`${idBase}-durationMs`}
              className="block text-[0.65rem] text-muted-foreground"
            >
              Duration (ms)
            </label>
            <input
              id={`${idBase}-durationMs`}
              type="number"
              min={0}
              value={numOf("durationMs")}
              onChange={(e) =>
                set(
                  "durationMs",
                  e.target.value === "" ? "" : Number(e.target.value),
                )
              }
              className={`${sharedInput} px-2 text-xs`}
            />
          </div>
          <div className="space-y-0.5">
            <label
              htmlFor={`${idBase}-delayMs`}
              className="block text-[0.65rem] text-muted-foreground"
            >
              Delay (ms)
            </label>
            <input
              id={`${idBase}-delayMs`}
              type="number"
              min={0}
              value={numOf("delayMs")}
              onChange={(e) =>
                set(
                  "delayMs",
                  e.target.value === "" ? "" : Number(e.target.value),
                )
              }
              className={`${sharedInput} px-2 text-xs`}
            />
          </div>
        </div>
        <p className="text-[0.65rem] text-muted-foreground">
          Unlisted keys are preserved untouched — values validate through the
          shared schema.
        </p>
      </>,
      errorKey,
    );
  };

  const renderPlaceholder = (
    field: PropField,
    value: unknown,
    errorKey: string,
    commit: (next: unknown) => void,
  ): ReactNode => {
    if (PICKER_INPUT_TYPE[field.kind] !== undefined) {
      return renderPicker(field, value, errorKey, commit);
    }
    switch (field.kind) {
      case "typography":
        return renderTypography(field, value, errorKey, commit);
      case "responsive":
        return renderResponsive(field, value, errorKey, commit);
      case "visibility":
        return renderVisibility(field, value, errorKey, commit);
      case "animation":
        return renderAnimation(field, value, errorKey, commit);
      default:
        // Unreachable: the caller gates on CONTROL_STATUS, so only the
        // placeholder kinds above arrive here.
        return null;
    }
  };

  const renderFull = (
    field: PropField,
    value: unknown,
    idBase: string,
    errorKey: string,
    commit: (next: unknown) => void,
    labelledId: string,
  ): ReactNode => {
    const showOverride =
      layer !== undefined &&
      Object.prototype.hasOwnProperty.call(layer, field.key);
    const header = renderHeader(field, labelledId, showOverride);
    const help = renderHelp(field);
    const fieldErrors = renderErrors(errorsForField(errors, errorKey), idBase);
    const body = (() => {
      switch (field.kind) {
        case "richtext":
          return (
            <textarea
              id={labelledId}
              rows={4}
              value={typeof value === "string" ? value : ""}
              onChange={(e) => commit(e.target.value)}
              className={sharedInput}
            />
          );
        case "number":
          return (
            <input
              id={labelledId}
              type="number"
              min={field.min}
              max={field.max}
              value={typeof value === "number" ? value : ""}
              onChange={(e) =>
                commit(e.target.value === "" ? "" : Number(e.target.value))
              }
              className={sharedInput}
            />
          );
        case "boolean":
          return (
            <input
              id={labelledId}
              type="checkbox"
              checked={value === true}
              onChange={(e) => commit(e.target.checked)}
              className="size-4 rounded border-border"
            />
          );
        case "select":
          return (
            <select
              id={labelledId}
              value={typeof value === "string" ? value : ""}
              onChange={(e) => commit(e.target.value)}
              className={sharedInput}
            >
              {(field.options ?? []).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          );
        case "color":
          return (
            <div className="flex items-center gap-2">
              <input
                id={labelledId}
                type="color"
                value={
                  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
                    ? value
                    : "#000000"
                }
                onChange={(e) => commit(e.target.value)}
                aria-label={`${field.label} picker`}
                className="h-9 w-16 shrink-0 cursor-pointer rounded-fq-sm border border-border bg-card"
              />
              <input
                value={typeof value === "string" ? value : ""}
                onChange={(e) => commit(e.target.value)}
                aria-label={`${field.label} hex value`}
                className={sharedInput}
              />
            </div>
          );
        case "spacing":
        case "dimensions": {
          const record = isRecord(value) ? value : {};
          const side = (k: string): number =>
            typeof record[k] === "number" ? (record[k] as number) : 0;
          const setSide = (k: string, next: number) =>
            commit({
              top: side("top"),
              right: side("right"),
              bottom: side("bottom"),
              left: side("left"),
              unit:
                typeof record.unit === "string" && record.unit
                  ? record.unit
                  : "px",
              [k]: next,
            });
          return (
            <div className="grid grid-cols-4 gap-1">
              {(["top", "right", "bottom", "left"] as const).map((k, i) => (
                <input
                  key={k}
                  id={i === 0 ? labelledId : `${idBase}-${k}`}
                  type="number"
                  value={side(k)}
                  onChange={(e) => setSide(k, Number(e.target.value || 0))}
                  aria-label={`${field.label} ${k}`}
                  className={`${sharedInput} px-2 text-xs`}
                />
              ))}
            </div>
          );
        }
        case "link":
          return (
            <input
              id={labelledId}
              type="url"
              placeholder="/products or https://…"
              value={typeof value === "string" ? value : ""}
              onChange={(e) => commit(e.target.value)}
              className={sharedInput}
            />
          );
        case "icon":
          return (
            <input
              id={labelledId}
              type="text"
              placeholder="Star, Check, Truck…"
              value={typeof value === "string" ? value : ""}
              onChange={(e) => commit(e.target.value)}
              className={sharedInput}
            />
          );
        case "category":
          return (
            <input
              id={labelledId}
              type="text"
              placeholder="category-handle"
              value={typeof value === "string" ? value : ""}
              onChange={(e) => commit(e.target.value)}
              className={sharedInput}
            />
          );
        default:
          // text
          return (
            <input
              id={labelledId}
              type="text"
              value={
                typeof value === "string" || typeof value === "number"
                  ? String(value)
                  : ""
              }
              onChange={(e) => commit(e.target.value)}
              className={sharedInput}
            />
          );
      }
    })();
    return (
      <div
        key={field.key}
        data-field={field.key}
        data-status="full"
        className="space-y-1"
      >
        {header}
        {body}
        {help}
        {fieldErrors}
      </div>
    );
  };

  const renderControl = (
    field: PropField,
    value: unknown,
    idBase: string,
    errorKey: string,
    commit: (next: unknown) => void,
  ): ReactNode => {
    const status = (CONTROL_STATUS as Record<string, string>)[field.kind];
    if (status === "placeholder") {
      return renderPlaceholder(field, value, errorKey, commit);
    }
    if (status !== "full") return null;
    return renderFull(field, value, idBase, errorKey, commit, idBase);
  };

  const renderRepeater = (field: PropField): ReactNode => {
    const idBase = `${uid}-${field.key}`;
    const rawRows = effective[field.key];
    const rows = Array.isArray(rawRows) ? rawRows : [];
    const rowFields = field.fields ?? [];
    // Codes not attributable to a rendered sub-control stay at the header
    // (cap breaches, dropped non-object rows); the rest render under their
    // own sub-control.
    const attributable = new Set<string>();
    rows.forEach((row, i) => {
      if (!isRecord(row)) return;
      for (const sub of rowSchemaOf(field)) {
        attributable.add(`${field.key}.${i}.${sub.key}.`);
      }
    });
    const headerCodes = errorsForField(errors, field.key).filter((code) =>
      [...attributable].every((prefix) => !code.startsWith(prefix)),
    );
    return (
      <div
        key={field.key}
        data-field={field.key}
        data-status="structural"
        className="space-y-2"
      >
        <span className="block text-xs font-medium">
          {field.label}
          {field.required === true ? (
            <span className="ml-1 text-muted-foreground">· required</span>
          ) : null}
        </span>
        {rows.map((row, i) => {
          if (!isRecord(row)) return null;
          return (
            <div
              key={i}
              className="space-y-2 rounded-fq-md border border-border p-3"
            >
              <p className="text-[0.65rem] font-medium text-muted-foreground">
                Item {i + 1}
              </p>
              {rowFields
                .filter((sub) => isFieldVisible(sub, row))
                .map((sub) =>
                  renderControl(
                    sub,
                    row[sub.key],
                    `${idBase}-${i}-${sub.key}`,
                    `${field.key}.${i}.${sub.key}`,
                    (next) => {
                      const updated = applyRepeaterRowChange(
                        schema,
                        effective,
                        field.key,
                        i,
                        sub.key,
                        next,
                      );
                      onChange(field.key, updated[field.key], device);
                    },
                  ),
                )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() =>
            onChange(field.key, [...rows, defaultsFor(rowFields)], device)
          }
          className="min-h-10 w-full rounded-fq-md border border-dashed border-border text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary"
        >
          Add item
        </button>
        {renderHelp(field)}
        {renderErrors(headerCodes, idBase)}
      </div>
    );
  };

  const renderField = (field: PropField): ReactNode => {
    if (!isRecord(field)) return null;
    if (!isFieldVisible(field, effective)) return null;
    const status = (CONTROL_STATUS as Record<string, string>)[field.kind];
    if (status === "structural") {
      if (field.kind === "repeater") return renderRepeater(field);
      // Group: presentation-only cluster, children store at the flat level.
      return (
        <fieldset
          key={field.key}
          data-field={field.key}
          data-status="structural"
          className="space-y-3 rounded-fq-md border border-border p-3"
        >
          <legend className="px-1 text-xs font-medium">{field.label}</legend>
          {(field.fields ?? [])
            .filter((sub) => isFieldVisible(sub, effective))
            .map((sub) =>
              renderControl(
                sub,
                effective[sub.key],
                `${uid}-${sub.key}`,
                sub.key,
                (next) => onChange(sub.key, next, device),
              ),
            )}
          {renderHelp(field)}
        </fieldset>
      );
    }
    if (status === "placeholder") {
      return renderPlaceholder(field, effective[field.key], field.key, (next) =>
        onChange(field.key, next, device),
      );
    }
    if (status !== "full") return null;
    return renderFull(
      field,
      effective[field.key],
      `${uid}-${field.key}`,
      field.key,
      (next) => onChange(field.key, next, device),
      `${uid}-${field.key}`,
    );
  };

  const visible = fieldsOf(schema).filter(
    (f) => isRecord(f) && isFieldVisible(f as PropField, effective),
  );
  const body = <div className="space-y-4">{visible.map(renderField)}</div>;

  if (!onSubmit) return body;
  return (
    <form onSubmit={handleSubmit}>
      {body}
      <button
        type="submit"
        className="mt-3 min-h-10 rounded-fq-md bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        Apply
      </button>
    </form>
  );
}
