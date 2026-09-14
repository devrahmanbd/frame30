/**
 * Settlement feed parser. Integer minor units only — a line whose `net` does not
 * equal `gross - fee` is rejected here and again by the database.
 */
export type SettlementLine = { ref: string; gross: number; fee: number; net: number };

export class SettlementParseError extends Error {
  constructor(readonly line: number, reason: string) {
    super(`line ${line}: ${reason}`);
    this.name = "SettlementParseError";
  }
}

const HEADER = ["ref", "gross", "fee", "net"];

export function parseSettlementCsv(csv: string): SettlementLine[] {
  const rows = csv
    .split(/\r?\n/)
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
  if (rows.length === 0) throw new SettlementParseError(0, "empty file");

  const header = rows[0]!.split(",").map((c) => c.trim().toLowerCase());
  const offset = HEADER.every((h, i) => header[i] === h) ? 1 : 0;
  if (offset === 0 && header.length !== 4) {
    throw new SettlementParseError(1, "expected header ref,gross,fee,net");
  }

  const out: SettlementLine[] = [];
  const seen = new Set<string>();
  for (let i = offset; i < rows.length; i += 1) {
    const cells = rows[i]!.split(",").map((c) => c.trim());
    if (cells.length !== 4) throw new SettlementParseError(i + 1, "expected 4 columns");
    const [ref, grossRaw, feeRaw, netRaw] = cells as [string, string, string, string];
    if (!ref) throw new SettlementParseError(i + 1, "missing reference");
    if (seen.has(ref)) throw new SettlementParseError(i + 1, `duplicate reference ${ref}`);
    seen.add(ref);

    const nums = [grossRaw, feeRaw, netRaw].map((v) => {
      if (!/^-?\d+$/.test(v)) throw new SettlementParseError(i + 1, `"${v}" is not integer minor units`);
      return Number(v);
    }) as [number, number, number];
    const [gross, fee, net] = nums;
    if (gross <= 0) throw new SettlementParseError(i + 1, "gross must be positive");
    if (fee < 0) throw new SettlementParseError(i + 1, "fee cannot be negative");
    if (net !== gross - fee) throw new SettlementParseError(i + 1, "net must equal gross minus fee");
    out.push({ ref, gross, fee, net });
  }
  if (out.length === 0) throw new SettlementParseError(1, "no data rows");
  return out;
}
