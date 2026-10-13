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
 * - placeholder (image/media/video/product/collection pickers plus
 *   typography/responsive/visibility/animation): labelled placeholders with
 *   the SAME props contract — `(field, value, onChange)` — whose full
 *   controls are the documented next batch (see NEXT_BATCH below).
 * - structural (repeater/group): nesting.
 * - unknown kinds render nothing (fail closed, never a fallback input).
 *
 * `showWhen` gates rendering only (validation still applies — see
 * `isFieldVisible`). Responsive `overrides` are read-only: the device layer
 * supplies the displayed value and `device` tags the `onChange`, but the
 * overrides object itself is never written — its shape passes through
 * untouched, exactly as `validateProps` preserves `bp` layers.
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
 * NEXT BATCH (placeholder kinds): full pickers for image / media / video /
 * product / collection (library-backed pickers reusing the MediaPicker data
 * contract: pick stores a URL/key string, clear stores `""`) and structured
 * editors for typography / responsive / visibility / animation. Placeholders
 * below already speak the final contract — `onChange(key, value, device)`
 * with scalar pickers clearing to `""` — so swapping in the full controls
 * changes no call site.
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

const SCALAR_PICKERS = ["image", "media", "video", "product", "collection"];

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

  const renderPlaceholder = (
    field: PropField,
    value: unknown,
    errorKey: string,
  ): ReactNode => {
    const idBase = `${uid}-${field.key}`;
    const scalar = SCALAR_PICKERS.includes(field.kind);
    const current = typeof value === "string" ? value : "";
    return (
      <div
        key={field.key}
        data-field={field.key}
        data-status="placeholder"
        data-placeholder={field.kind}
        className="space-y-1"
      >
        <span className="block text-xs font-medium">
          {field.label}
          {field.required === true ? (
            <span className="ml-1 text-muted-foreground">· required</span>
          ) : null}
        </span>
        {scalar ? (
          <p className="truncate text-xs text-muted-foreground">
            {current || `No ${field.kind} selected`}
          </p>
        ) : null}
        {scalar ? (
          <div className="flex gap-2">
            <button
              type="button"
              disabled
              title={`${field.label} picker lands in the next batch`}
              className="min-h-9 flex-1 cursor-not-allowed rounded-fq-sm border border-border text-xs font-medium text-muted-foreground"
            >
              Select {field.kind}
            </button>
            <button
              type="button"
              onClick={() => onChange(field.key, "", device)}
              className="min-h-9 rounded-fq-sm border border-border px-2 text-xs text-muted-foreground hover:bg-muted"
            >
              Clear
            </button>
          </div>
        ) : null}
        <p className="text-[0.65rem] text-muted-foreground">
          {field.label} picker lands in the next batch — values still validate
          through the shared schema.
        </p>
        {renderHelp(field)}
        {renderErrors(errorsForField(errors, errorKey), idBase)}
      </div>
    );
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
      return renderPlaceholder(field, value, errorKey);
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
      return renderPlaceholder(field, effective[field.key], field.key);
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
