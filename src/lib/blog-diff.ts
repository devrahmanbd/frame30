/**
 * Phase 1 — revision compare.
 *
 * A word-level diff, pure and bounded, used by the revision panel to show what
 * actually changed between two snapshots before a writer restores one.
 *
 * Why hand-rolled: the classic O(n·m) LCS table is quadratic in memory, which a
 * 5k-word article turns into 25M cells. This uses Myers' O(nd) middle-snake
 * variant over a common-prefix/suffix-trimmed token stream, which for real
 * edits (a paragraph rewritten inside an otherwise identical post) is linear in
 * practice. A hard `maxTokens` ceiling degrades gracefully to a block-level
 * "replaced" result rather than hanging the admin tab.
 */

export const DIFF_LIMITS = {
  maxTokens: 20_000,
  /** Myers' edit-distance ceiling: past this the two texts are unrelated. */
  maxDistance: 4_000,
} as const;

export type DiffOp = "equal" | "insert" | "delete";
export type DiffChunk = { op: DiffOp; text: string };

/** Split into words *and* the whitespace between them, so joins are lossless. */
export function tokenize(value: string): string[] {
  return (value ?? "").match(/\s+|[^\s]+/g) ?? [];
}

function trimCommon(a: string[], b: string[]) {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) {
    end += 1;
  }
  return { start, end };
}

function myers(a: string[], b: string[]): DiffChunk[] {
  const n = a.length;
  const m = b.length;
  const max = Math.min(n + m, DIFF_LIMITS.maxDistance);
  const v = new Map<number, number>([[1, 0]]);
  const trace: Map<number, number>[] = [];

  for (let d = 0; d <= max; d += 1) {
    trace.push(new Map(v));
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d || (k !== d && (v.get(k - 1) ?? 0) < (v.get(k + 1) ?? 0));
      let x = down ? (v.get(k + 1) ?? 0) : (v.get(k - 1) ?? 0) + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x += 1;
        y += 1;
      }
      v.set(k, x);
      if (x >= n && y >= m) return backtrack(a, b, trace, d);
    }
  }
  // Distance ceiling hit: report a wholesale replacement rather than lie.
  const out: DiffChunk[] = [];
  if (a.length) out.push({ op: "delete", text: a.join("") });
  if (b.length) out.push({ op: "insert", text: b.join("") });
  return out;
}

function backtrack(a: string[], b: string[], trace: Map<number, number>[], d: number): DiffChunk[] {
  const ops: DiffChunk[] = [];
  let x = a.length;
  let y = b.length;
  for (let depth = d; depth > 0; depth -= 1) {
    const v = trace[depth]!;
    const k = x - y;
    const down = k === -depth || (k !== depth && (v.get(k - 1) ?? 0) < (v.get(k + 1) ?? 0));
    const prevK = down ? k + 1 : k - 1;
    const prevX = v.get(prevK) ?? 0;
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      x -= 1;
      y -= 1;
      ops.push({ op: "equal", text: a[x]! });
    }
    if (down) {
      y -= 1;
      ops.push({ op: "insert", text: b[y]! });
    } else {
      x -= 1;
      ops.push({ op: "delete", text: a[x]! });
    }
  }
  while (x > 0) {
    x -= 1;
    ops.push({ op: "equal", text: a[x]! });
  }
  return ops.reverse();
}

function merge(chunks: DiffChunk[]): DiffChunk[] {
  const out: DiffChunk[] = [];
  for (const chunk of chunks) {
    if (!chunk.text) continue;
    const last = out[out.length - 1];
    if (last && last.op === chunk.op) last.text += chunk.text;
    else out.push({ ...chunk });
  }
  return out;
}

/** Word diff between two plain-text renderings of a revision. */
export function diffWords(before: string, after: string): DiffChunk[] {
  const a = tokenize(before);
  const b = tokenize(after);
  if (a.length > DIFF_LIMITS.maxTokens || b.length > DIFF_LIMITS.maxTokens) {
    return merge([
      { op: "delete", text: before },
      { op: "insert", text: after },
    ]);
  }
  const { start, end } = trimCommon(a, b);
  const head = a.slice(0, start).join("");
  const tail = a.slice(a.length - end).join("");
  const middle = myers(a.slice(start, a.length - end), b.slice(start, b.length - end));
  return merge([{ op: "equal", text: head }, ...middle, { op: "equal", text: tail }]);
}

export type DiffSummary = { added: number; removed: number; unchanged: number; changed: boolean };

export function summarizeDiff(chunks: DiffChunk[]): DiffSummary {
  const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
  let added = 0;
  let removed = 0;
  let unchanged = 0;
  for (const chunk of chunks) {
    if (chunk.op === "insert") added += words(chunk.text);
    else if (chunk.op === "delete") removed += words(chunk.text);
    else unchanged += words(chunk.text);
  }
  return { added, removed, unchanged, changed: added > 0 || removed > 0 };
}

/** Field-level compare for the non-body columns of a revision. */
export function diffFields<T extends Record<string, string | null>>(before: T, after: T) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys]
    .map((key) => ({ key, before: before[key] ?? "", after: after[key] ?? "" }))
    .filter((row) => row.before !== row.after);
}
