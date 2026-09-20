/**
 * Page/post editor choice (Elementor-parity program).
 *
 * Posts honour the merchant's stored default with the other editor offered
 * explicitly. Pages are builder-only: the block editor was removed from the
 * pages surface. "classic" here IS the block editor (Visual/Code tabs,
 * block toolbar); "builder" is the visual page builder, which never changes.
 */

export type EditorChoice = "builder" | "classic";
export type ContentKindChoice = "page" | "post";

export function isEditorChoice(value: unknown): value is EditorChoice {
  return value === "builder" || value === "classic";
}

/** Kind default when the merchant never chose: pages builder, posts classic. */
export function kindDefaultEditor(kind: ContentKindChoice): EditorChoice {
  return kind === "page" ? "builder" : "classic";
}

/**
 * Resolve which editor a link/action should open.
 * Precedence: explicit request > merchant setting > kind default.
 * Unknown setting values fall back to the kind default (never crash).
 */
export function resolveEditor(opts: {
  kind: ContentKindChoice;
  explicit?: EditorChoice | null;
  setting?: unknown;
}): EditorChoice {
  if (opts.explicit && isEditorChoice(opts.explicit)) return opts.explicit;
  if (isEditorChoice(opts.setting)) return opts.setting;
  return kindDefaultEditor(opts.kind);
}

/** The alternate action to offer alongside the resolved default. */
export function alternateEditor(resolved: EditorChoice): EditorChoice {
  return resolved === "builder" ? "classic" : "builder";
}
