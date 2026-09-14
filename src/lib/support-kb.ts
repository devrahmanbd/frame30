/**
 * Knowledge-base chunking (pure). Retrieval quality starts here: chunks are
 * paragraph-aligned, size-bounded and overlap slightly so an answer never gets
 * cut in half mid-sentence.
 */

export const MAX_CHUNK_CHARS = 700;
export const OVERLAP_CHARS = 80;

export type Chunk = { ordinal: number; body: string };

export function chunkDocument(body: string): Chunk[] {
  const clean = body.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];

  const paragraphs = clean.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  const push = () => {
    const value = current.trim();
    if (value) chunks.push(value);
    current = "";
  };

  for (const para of paragraphs) {
    if (para.length > MAX_CHUNK_CHARS) {
      push();
      for (let i = 0; i < para.length; i += MAX_CHUNK_CHARS - OVERLAP_CHARS) {
        chunks.push(para.slice(i, i + MAX_CHUNK_CHARS).trim());
      }
      continue;
    }
    if ((current + "\n\n" + para).trim().length > MAX_CHUNK_CHARS) push();
    current = current ? `${current}\n\n${para}` : para;
  }
  push();

  return chunks.filter(Boolean).map((value, ordinal) => ({ ordinal, body: value }));
}

/** Extractive snippet around the strongest query term, for the provenance card. */
export function snippet(body: string, query: string, width = 180): string {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const lower = body.toLowerCase();
  let at = -1;
  for (const term of terms) {
    at = lower.indexOf(term);
    if (at >= 0) break;
  }
  if (at < 0) return body.slice(0, width).trim();
  const start = Math.max(0, at - Math.floor(width / 3));
  return `${start > 0 ? "…" : ""}${body.slice(start, start + width).trim()}${
    start + width < body.length ? "…" : ""
  }`;
}
