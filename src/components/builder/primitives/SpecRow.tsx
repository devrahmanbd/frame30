/**
 * Phase 2.7 — the label/value pair used by spec tables, warranty panels and
 * comparison rows.
 *
 * Bangla labels run 15–30% longer than their English counterparts, so the
 * label column is `min-content` capped at 45% and never a fixed width. Values
 * are tabular so model numbers and figures line up column-wise, and a unit is
 * kept `dir="ltr"` so it never reshapes inside a Bangla sentence.
 */

export type SpecPair = {
  key: string;
  group?: string;
  label: string;
  value: string;
  unit?: string;
};

export function SpecValue({ value, unit }: { value: string; unit?: string }) {
  return (
    <span className="tabular-nums">
      {value}
      {unit ? (
        <span dir="ltr" lang="en" className="ms-1 text-muted-foreground">
          {unit}
        </span>
      ) : null}
    </span>
  );
}

export function SpecRow({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-3 py-2 last:border-b-0">
      <dt className="min-w-0 max-w-[45%] text-sm font-medium">{label}</dt>
      <dd className="m-0 text-sm text-muted-foreground">
        <SpecValue value={value} unit={unit} />
      </dd>
    </div>
  );
}

/** Groups pairs in first-seen order; ungrouped pairs land under `""`. */
export function groupSpecs(pairs: SpecPair[]): { group: string; rows: SpecPair[] }[] {
  const out: { group: string; rows: SpecPair[] }[] = [];
  for (const pair of pairs) {
    const group = (pair.group ?? "").trim();
    const bucket = out.find((entry) => entry.group === group);
    if (bucket) bucket.rows.push(pair);
    else out.push({ group, rows: [pair] });
  }
  return out;
}
