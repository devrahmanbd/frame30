/**
 * Tray → canvas drag-drop payload (Elementor-parity insert gesture).
 *
 * The widget tray drags the DEFAULT preset (multi-preset choice stays
 * click-only). Drops resolve to editor.add(template, slot, type,
 * {parentId, index}) at the drop position; legality is enforced by the
 * editor's own canDrop guard, so this layer never invents placement rules.
 */

export const TRAY_MIME = "application/x-framique-widget";

export type TrayDrop = { type: string; presetKey: string };

export function encodeTrayDrop(drop: TrayDrop): string {
  return JSON.stringify({ type: drop.type, presetKey: drop.presetKey || "default" });
}

type DataTransferLike = {
  types: readonly string[] | DOMStringList;
  getData: (format: string) => string;
};

/** Null for foreign drags, malformed JSON, or wrong shape. Never throws. */
export function decodeTrayDrop(dt: DataTransferLike | null | undefined): TrayDrop | null {
  try {
    if (!dt) return null;
    const types = Array.from(dt.types as unknown as string[]);
    if (!types.includes(TRAY_MIME)) return null;
    const raw = dt.getData(TRAY_MIME);
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as { type?: unknown }).type !== "string" ||
      (parsed as { type: string }).type.length === 0
    ) {
      return null;
    }
    const preset = (parsed as { presetKey?: unknown }).presetKey;
    return {
      type: (parsed as { type: string }).type,
      presetKey: typeof preset === "string" && preset.length > 0 ? preset : "default",
    };
  } catch {
    return null;
  }
}

/**
 * Gap index for a pointer Y given row top offsets. Index N means "insert
 * before row N" (N === tops.length appends). Pure for testability.
 */
export function pickDropIndex(pointerY: number, rowTops: number[]): number {
  let index = 0;
  for (const top of rowTops) {
    if (top <= pointerY) index += 1;
    else break;
  }
  return index;
}
