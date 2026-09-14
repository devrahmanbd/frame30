/**
 * §5 — export controls (pure half).
 *
 * Any export above `EXPORT_REASON_THRESHOLD` rows is a bulk data egress: it
 * needs a stated reason, an audit row, and the async signed-URL job the
 * export centre already runs. The threshold and the reason rules live here so
 * the console can validate before submitting and the server can refuse
 * regardless of what the console did.
 */

export const EXPORT_REASON_THRESHOLD = 1000;

/** Minimum useful reason — "test" is not an answer to a bulk PII export. */
export const EXPORT_REASON_MIN = 10;
export const EXPORT_REASON_MAX = 300;

export function needsExportReason(rowCount: number): boolean {
  return rowCount > EXPORT_REASON_THRESHOLD;
}

export type ExportReasonProblem = "reason_required" | "reason_too_short" | "reason_too_long" | null;

export function checkExportReason(
  rowCount: number,
  reason: string | null | undefined,
): ExportReasonProblem {
  if (!needsExportReason(rowCount)) return null;
  const value = (reason ?? "").trim();
  if (!value) return "reason_required";
  if (value.length < EXPORT_REASON_MIN) return "reason_too_short";
  if (value.length > EXPORT_REASON_MAX) return "reason_too_long";
  return null;
}

export function exportReasonMessage(problem: Exclude<ExportReasonProblem, null>, rowCount: number) {
  switch (problem) {
    case "reason_required":
      return `This export returns ${rowCount} rows. Exports over ${EXPORT_REASON_THRESHOLD} rows need a stated reason.`;
    case "reason_too_short":
      return `Give a reason of at least ${EXPORT_REASON_MIN} characters for a ${rowCount}-row export.`;
    case "reason_too_long":
      return `Keep the export reason under ${EXPORT_REASON_MAX} characters.`;
  }
}
