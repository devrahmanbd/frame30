/**
 * Frame30 — declarative widget props (`propsSchema` value layer).
 *
 * Pure module: no React, no network, no database. This is the SINGLE
 * validator both sides call — the studio validates drafts with it on the
 * client, the save path re-validates with it on the server — so the two can
 * never disagree about what a widget prop may hold.
 *
 * Vocabulary alignment (not duplication):
 * - Field shape mirrors `SettingField` (`src/lib/plugin-manifest.ts:231-249`):
 *   key/label/kind/options/min/max/default. A manifest must not invent
 *   controls, and neither may a widget schema: unknown `kind` values fail
 *   closed (`unknown_kind`, value omitted, never a fallback input).
 * - Groups flatten into the flat props record like `flattenFields`
 *   (`src/lib/builder-ast.ts`), and the URL/markup policy mirrors the
 *   `SAFE_HREF` / `sanitiseText` / `html` handling in `coerceProp` there. The
 *   implementation is local (not imported) so this module stays
 *   dependency-free and safe to run on both sides.
 * - `bp` override layers mirror the `Section.bp` desktop-first layering the
 *   `SectionInspector` edits: base props plus per-device layers, validated
 *   with the same schema, shape preserved.
 *
 * Error codes are keyed strings so either side can attribute them without a
 * shared error type: `<key>.<code>` for fields, `<key>.<index>.<sub>.<code>`
 * for repeater rows, `bp.<device>.<key>.<code>` for override layers.
 */

export const PROP_KINDS = [
  "text",
  "richtext",
  "number",
  "boolean",
  "select",
  "color",
  "typography",
  "spacing",
  "dimensions",
  "responsive",
  "image",
  "media",
  "video",
  "product",
  "collection",
  "category",
  "repeater",
  "group",
  "link",
  "icon",
  "visibility",
  "animation",
] as const;

export type PropKind = (typeof PROP_KINDS)[number];

/**
 * JSON value: the only thing a schema default or comparison value may hold.
 * Schemas cross server-function boundaries (TanStack validates return
 * serializability), so `unknown` here collapses inference tree-wide — every
 * loader payload containing a schema would fail validation. Keep this in
 * sync with JSON: string | number | boolean | null | array | object.
 */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/**
 * Declarative widget prop field. This is the EXACT shape the widget registry
 * builds against — do not change it: a sibling consumes this type verbatim.
 */
export type PropField = {
  key: string;
  label: string;
  help?: string;
  kind:
    | "text"
    | "richtext"
    | "number"
    | "boolean"
    | "select"
    | "color"
    | "typography"
    | "spacing"
    | "dimensions"
    | "responsive"
    | "image"
    | "media"
    | "video"
    | "product"
    | "collection"
    | "category"
    | "repeater"
    | "group"
    | "link"
    | "icon"
    | "visibility"
    | "animation";
  required?: boolean;
  default?: JsonValue;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  fields?: PropField[];
  showWhen?: { key: string; equals: JsonValue };
};

export type PropSchema = { fields: PropField[] } | readonly PropField[];

/**
 * Boundary normalizer between the two schema carriers: the registry's
 * `{ fields: [...] }` object form (the contract shape) and bare arrays
 * (convenience form used across the value-layer tests). Both are accepted
 * everywhere; internally everything iterates the normalized array.
 */
export function fieldsOf(schema: PropSchema): readonly PropField[] {
  // Runtime-exact check with casts: Array.isArray's `any[]` guard does not
  // narrow the readonly-array member, so the union is discriminated manually.
  if (Array.isArray(schema as readonly PropField[]))
    return schema as readonly PropField[];
  return (schema as { fields: PropField[] }).fields;
}

export type WidgetProps = Record<string, unknown>;

export type ValidatePropsResult = {
  ok: boolean;
  errors: string[];
  clean: WidgetProps;
};

/** Oversize-text rejection threshold (8KB) for text-like values. */
export const MAX_TEXT_LENGTH = 8192;

/** Repeater item cap: more items are rejected (`too_many`) and truncated. */
export const MAX_REPEATER_ITEMS = 50;

/**
 * Deterministic render contract for every union kind. `full` kinds get
 * complete editable controls, `placeholder` kinds get labelled placeholder
 * pickers with the same onChange contract (their full pickers are the next
 * batch), `structural` kinds nest. Anything else is `unknown` and must fail
 * closed — never a fallback input.
 */
export const CONTROL_STATUS: Record<
  PropKind,
  "full" | "placeholder" | "structural"
> = {
  text: "full",
  richtext: "full",
  number: "full",
  boolean: "full",
  select: "full",
  color: "full",
  typography: "placeholder",
  spacing: "full",
  dimensions: "full",
  responsive: "placeholder",
  image: "placeholder",
  media: "placeholder",
  video: "placeholder",
  product: "placeholder",
  collection: "placeholder",
  category: "full",
  repeater: "structural",
  group: "structural",
  link: "full",
  icon: "full",
  visibility: "placeholder",
  animation: "placeholder",
};

export function controlStatus(
  kind: string,
): "full" | "placeholder" | "structural" | "unknown" {
  return (
    ((CONTROL_STATUS as Record<string, string>)[kind] as
      "full" | "placeholder" | "structural" | undefined) ?? "unknown"
  );
}

// ---------------------------------------------------------------------------
// text / markup policy (mirrors builder-ast sanitiseText / SAFE_HREF)
// ---------------------------------------------------------------------------

const SCRIPT_BLOCK_RE = /<\s*(script|style)\b[\s\S]*?(<\s*\/\s*\1\s*>|$)/gi;
const TAG_RE = /<[^>]*>/g;
const RESIDUAL_ANGLE_RE = /[<>]/g;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;

/** Merchant-authored plain text: no markup, no handlers, no scripts survive. */
function stripToText(value: string, limit: number): string {
  return value
    .replace(SCRIPT_BLOCK_RE, "")
    .replace(TAG_RE, "")
    .replace(RESIDUAL_ANGLE_RE, "")
    .replace(CONTROL_CHARS_RE, "")
    .slice(0, limit);
}

/**
 * Rich text keeps benign markup but loses the two things that execute:
 * script/style blocks, inline `on*` handlers, and non-allowlisted
 * href/src/action targets (neutralised to `#`).
 */
function sanitiseRichText(value: string, limit: number): string {
  const noScripts = value
    .replace(SCRIPT_BLOCK_RE, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  const safeTargets = noScripts.replace(
    /\s+(href|src|action|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (m, name: string, dq?: string, sq?: string, bare?: string) => {
      const target = String(dq ?? sq ?? bare ?? "");
      if (SAFE_HREF.test(target.trim())) return m;
      const q = dq !== undefined ? '"' : sq !== undefined ? "'" : '"';
      return ` ${name}=${q}#${q}`;
    },
  );
  return safeTargets.replace(CONTROL_CHARS_RE, "").slice(0, limit);
}

const SAFE_HREF = /^(https?:\/\/|\/(?!\/)|#|mailto:|tel:)/i;
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const STRUCT_KEY_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/;
const UNIT_RE = /^[a-zA-Z%]{1,8}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isMissingFor(kind: string, raw: unknown): boolean {
  if (raw === undefined || raw === null || raw === "") return true;
  // An empty array is "no rows yet" for repeaters, but a wrong type for
  // every scalar kind (it must not silently become a default).
  return kind === "repeater" && Array.isArray(raw) && raw.length === 0;
}

// ---------------------------------------------------------------------------
// structured values (typography / responsive / visibility / animation)
// ---------------------------------------------------------------------------

const DROP: unique symbol = Symbol("widget-props.drop");

/**
 * Deep-cleans open structured values. Strings lose markup, non-finite
 * numbers / functions / symbols are dropped, arrays are capped, objects are
 * capped and restricted to identifier keys. Returns DROP when nothing
 * salvageable remains at the top level contract (caller emits `type`).
 */
function cleanStructured(value: unknown, depth: number): unknown {
  if (typeof value === "string") return stripToText(value, MAX_TEXT_LENGTH);
  if (typeof value === "number") return Number.isFinite(value) ? value : DROP;
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return DROP;
  if (depth >= 4) return DROP;
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value.slice(0, MAX_REPEATER_ITEMS)) {
      const cleaned = cleanStructured(item, depth + 1);
      if (cleaned !== DROP) out.push(cleaned);
    }
    return out;
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    let count = 0;
    for (const [k, v] of Object.entries(value)) {
      if (count >= MAX_REPEATER_ITEMS) break;
      if (!STRUCT_KEY_RE.test(k)) continue;
      const cleaned = cleanStructured(v, depth + 1);
      if (cleaned === DROP) continue;
      out[k] = cleaned;
      count += 1;
    }
    return out;
  }
  return DROP;
}

// ---------------------------------------------------------------------------
// schema flattening (groups are presentation-only clusters)
// ---------------------------------------------------------------------------

/** Groups nest for display but store flat — same convention as builder-ast. */
function flattenPropFields(schema: PropSchema): PropField[] {
  const out: PropField[] = [];
  for (const field of fieldsOf(schema)) {
    if (!isPlainObject(field)) continue;
    if (String(field.kind) === "group") {
      const nested = Array.isArray(field.fields) ? field.fields : [];
      out.push(...flattenPropFields(nested));
    } else {
      out.push(field);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// defaults
// ---------------------------------------------------------------------------

function kindFallback(field: PropField): unknown {
  switch (String(field.kind)) {
    case "number":
      return field.min ?? 0;
    case "boolean":
      return false;
    case "select":
      return field.options?.[0]?.value ?? "";
    case "color":
      return "#000000";
    case "spacing":
    case "dimensions":
      return { top: 0, right: 0, bottom: 0, left: 0, unit: "px" };
    case "typography":
    case "responsive":
    case "animation":
      return {};
    case "visibility":
    case "repeater":
      return [];
    default:
      return "";
  }
}

type Cleaned = { ok: true; value: unknown } | { ok: false; value?: unknown };

function cleanValue(
  field: PropField,
  raw: unknown,
  path: string,
  errors: string[] | null,
): Cleaned {
  const fail = (code: string): Cleaned => {
    errors?.push(`${path}.${code}`);
    return { ok: false };
  };
  const kind = String(field.kind);

  switch (kind) {
    case "text": {
      if (typeof raw === "number" || typeof raw === "boolean")
        return cleanValue(field, String(raw), path, errors);
      if (typeof raw !== "string") return fail("type");
      const limit = field.max ?? MAX_TEXT_LENGTH;
      if (raw.length > limit) {
        errors?.push(`${path}.too_long`);
        return { ok: false, value: stripToText(raw, limit) };
      }
      return { ok: true, value: stripToText(raw, limit) };
    }
    case "richtext": {
      if (typeof raw === "number" || typeof raw === "boolean")
        return cleanValue(field, String(raw), path, errors);
      if (typeof raw !== "string") return fail("type");
      const limit = field.max ?? MAX_TEXT_LENGTH;
      if (raw.length > limit) {
        errors?.push(`${path}.too_long`);
        return { ok: false, value: sanitiseRichText(raw, limit) };
      }
      return { ok: true, value: sanitiseRichText(raw, limit) };
    }
    case "number": {
      if (typeof raw !== "number" && typeof raw !== "string")
        return fail("type");
      const n = typeof raw === "number" ? raw : Number(raw.trim());
      if (!Number.isFinite(n)) return fail("not_a_number");
      const min = field.min ?? Number.NEGATIVE_INFINITY;
      const max = field.max ?? Number.POSITIVE_INFINITY;
      return { ok: true, value: Math.min(max, Math.max(min, n)) };
    }
    case "boolean": {
      if (raw === true || raw === "true" || raw === 1)
        return { ok: true, value: true };
      if (raw === false || raw === "false" || raw === 0)
        return { ok: true, value: false };
      return fail("type");
    }
    case "select": {
      if (
        typeof raw !== "string" &&
        typeof raw !== "number" &&
        typeof raw !== "boolean"
      )
        return fail("type");
      const s = String(raw);
      const options = Array.isArray(field.options) ? field.options : [];
      return options.some((o) => o?.value === s)
        ? { ok: true, value: s }
        : fail("not_an_option");
    }
    case "color": {
      if (typeof raw !== "string") return fail("type");
      const trimmed = raw.trim();
      return HEX_COLOR.test(trimmed)
        ? { ok: true, value: trimmed.toLowerCase() }
        : fail("not_a_color");
    }
    case "link":
    case "image":
    case "media":
    case "video": {
      if (typeof raw !== "string") return fail("type");
      const trimmed = raw.trim();
      if (trimmed === "") return { ok: true, value: "" };
      const limit = field.max ?? 2048;
      if (trimmed.length > limit) {
        errors?.push(`${path}.too_long`);
        return { ok: false, value: trimmed.slice(0, limit) };
      }
      return SAFE_HREF.test(trimmed)
        ? { ok: true, value: trimmed }
        : fail("not_a_url");
    }
    case "icon":
    case "category":
    case "product":
    case "collection": {
      if (typeof raw !== "string" && typeof raw !== "number")
        return fail("type");
      const s = String(raw);
      const limit = field.max ?? 120;
      if (s.length > limit) {
        errors?.push(`${path}.too_long`);
        return { ok: false, value: stripToText(s.trim(), limit) };
      }
      return { ok: true, value: stripToText(s.trim(), limit) };
    }
    case "spacing":
    case "dimensions": {
      if (!isPlainObject(raw)) return fail("type");
      const side = (k: string): number => {
        const n = Number(raw[k]);
        return Number.isFinite(n) ? n : 0;
      };
      const unit =
        typeof raw.unit === "string" && UNIT_RE.test(raw.unit)
          ? raw.unit
          : "px";
      return {
        ok: true,
        value: {
          top: side("top"),
          right: side("right"),
          bottom: side("bottom"),
          left: side("left"),
          unit,
        },
      };
    }
    case "typography":
    case "responsive":
    case "visibility":
    case "animation": {
      const cleaned = cleanStructured(raw, 0);
      return cleaned === DROP ? fail("type") : { ok: true, value: cleaned };
    }
    case "repeater": {
      if (!Array.isArray(raw)) return fail("type");
      const rowSchema = flattenPropFields(
        (Array.isArray(field.fields) ? field.fields : []) as PropSchema,
      );
      if (raw.length > MAX_REPEATER_ITEMS) {
        errors?.push(`${path}.too_many`);
      }
      const rows: Record<string, unknown>[] = [];
      for (const [index, item] of raw.slice(0, MAX_REPEATER_ITEMS).entries()) {
        if (!isPlainObject(item)) {
          errors?.push(`${path}.${index}.type`);
          continue;
        }
        rows.push(cleanRow(rowSchema, item, `${path}.${index}`, errors));
      }
      return { ok: true, value: rows };
    }
    default:
      // `group` is removed by flattening before validation reaches here, so
      // anything left is an invented kind: fail closed, value omitted.
      return fail("unknown_kind");
  }
}

/** One repeater row: same rules as top level, errors keyed by row path. */
function cleanRow(
  rowSchema: PropField[],
  item: Record<string, unknown>,
  path: string,
  errors: string[] | null,
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const sub of rowSchema) {
    // Repeaters do not nest: a repeater inside a row schema is skipped by
    // design (asserted behaviour, never silent corruption of the row).
    if (String(sub.kind) === "repeater") continue;
    const raw = item[sub.key];
    if (isMissingFor(String(sub.kind), raw)) {
      row[sub.key] =
        sub.default !== undefined
          ? (fallbackFor(sub) ?? kindFallback(sub))
          : kindFallback(sub);
      if (sub.required && sub.default === undefined) {
        errors?.push(`${path}.${sub.key}.required`);
      }
      continue;
    }
    const cleaned = cleanValue(sub, raw, `${path}.${sub.key}`, errors);
    row[sub.key] =
      "value" in cleaned && cleaned.value !== undefined
        ? cleaned.value
        : (fallbackFor(sub) ?? kindFallback(sub));
  }
  return row;
}

/** Declared default cleaned through the field's own rules (dry run). */
function fallbackFor(field: PropField): unknown {
  if (field.default === undefined) return kindFallback(field);
  const dry = cleanValue(field, field.default, field.key, null);
  if (dry.ok && "value" in dry && dry.value !== undefined) return dry.value;
  return kindFallback(field);
}

/**
 * Deep defaults for a schema, groups flattened, repeaters `[]`. Every call
 * returns fresh objects so two widget instances never share references.
 */
export function defaultsFor(schema: PropSchema): WidgetProps {
  const out: WidgetProps = {};
  for (const field of flattenPropFields(schema)) {
    if (controlStatus(String(field.kind)) === "unknown") continue;
    const value = fallbackFor(field);
    if (value !== undefined) out[field.key] = value;
  }
  return out;
}

function validateLayer(
  fields: PropField[],
  input: Record<string, unknown>,
  prefix: string,
  errors: string[],
): WidgetProps {
  const clean: WidgetProps = {};
  for (const field of fields) {
    const path = prefix ? `${prefix}.${field.key}` : field.key;
    if (controlStatus(String(field.kind)) === "unknown") {
      errors.push(`${path}.unknown_kind`);
      continue;
    }
    const raw = input[field.key];
    if (isMissingFor(String(field.kind), raw)) {
      if (field.required && field.default === undefined) {
        errors.push(`${path}.required`);
      }
      const fallback = fallbackFor(field);
      if (fallback !== undefined) clean[field.key] = fallback;
      continue;
    }
    const cleaned = cleanValue(field, raw, path, errors);
    // A failed clean may still carry a salvaged value (e.g. truncated
    // oversize text): prefer it over the blank fallback so merchant content
    // survives alongside the error code.
    if ("value" in cleaned && cleaned.value !== undefined) {
      clean[field.key] = cleaned.value;
    } else {
      const fallback = fallbackFor(field);
      if (fallback !== undefined) clean[field.key] = fallback;
    }
  }
  return clean;
}

/**
 * Validates merchant props against a schema. Unknown top-level properties
 * are stripped; `bp` override layers are validated with the same schema and
 * preserved shape-for-shape. `clean` always carries every known key, so a
 * validated result can be stored or rendered without further guards.
 */
export function validateProps(
  schema: PropSchema,
  props: unknown,
): ValidatePropsResult {
  const errors: string[] = [];
  const fields = flattenPropFields(schema);
  const input = isPlainObject(props) ? (props as Record<string, unknown>) : {};
  const clean = validateLayer(fields, input, "", errors);

  const rawBp = input.bp;
  if (rawBp !== undefined) {
    if (!isPlainObject(rawBp)) {
      errors.push("bp.type");
    } else {
      const bpClean: Record<string, WidgetProps> = {};
      for (const [device, layer] of Object.entries(rawBp)) {
        if (!STRUCT_KEY_RE.test(device) || !isPlainObject(layer)) {
          errors.push(`bp.${device}.type`);
          continue;
        }
        bpClean[device] = validateLayer(fields, layer, `bp.${device}`, errors);
      }
      if (Object.keys(bpClean).length > 0) clean.bp = bpClean;
    }
  }

  return { ok: errors.length === 0, errors, clean };
}

// ---------------------------------------------------------------------------
// showWhen
// ---------------------------------------------------------------------------

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (
    a !== null &&
    b !== null &&
    typeof a === "object" &&
    typeof b === "object"
  ) {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * `showWhen` gates rendering only, never validation: a hidden field's value
 * is still cleaned (executable content never passes) and still required, so
 * toggling visibility cannot lose or smuggle data.
 */
export function isFieldVisible(field: PropField, props: WidgetProps): boolean {
  const rule = field.showWhen;
  if (!rule) return true;
  return valuesEqual(props[rule.key], rule.equals);
}

/** Schema subset visible for the given values, order preserved. */
export function visibleFields(
  schema: PropSchema,
  props: WidgetProps,
): PropField[] {
  return fieldsOf(schema).filter(
    (f) => isPlainObject(f) && isFieldVisible(f as PropField, props),
  ) as PropField[];
}

/** Every error code attributed to one field, including nested row paths. */
export function errorsForField(
  errors: readonly string[],
  key: string,
): string[] {
  const prefix = `${key}.`;
  return errors.filter((e) => e === key || e.startsWith(prefix));
}
