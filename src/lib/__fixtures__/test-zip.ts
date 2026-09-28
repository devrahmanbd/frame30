/**
 * Minimal ZIP builder for hardening tests (stored + deflated entries, with a
 * real central directory + EOCD so server-side parsers accept the archive).
 * No dependency — hand-rolled so tests never depend on npm zip libraries.
 */
import { deflateRawSync } from "node:zlib";

export type ZipEntryInput = {
  name: string;
  content: string | Uint8Array;
  /** 0 = stored, 8 = deflated. Defaults to stored. */
  method?: 0 | 8;
};

function crc32(data: Uint8Array): number {
  let table: number[] | null = (crc32 as { t?: number[] }).t ?? null;
  if (!table) {
    table = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    (crc32 as { t?: number[] }).t = table;
  }
  let crc = 0xffffffff;
  for (const b of data) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(v: number): number[] {
  return [v & 0xff, (v >>> 8) & 0xff];
}

function u32(v: number): number[] {
  return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
}

export function buildTestZip(entries: ZipEntryInput[]): Uint8Array {
  const out: number[] = [];
  const central: number[] = [];
  for (const entry of entries) {
    const nameBytes = Array.from(new TextEncoder().encode(entry.name));
    const raw =
      typeof entry.content === "string"
        ? new TextEncoder().encode(entry.content)
        : entry.content;
    const method = entry.method ?? 0;
    const payload = Array.from(method === 8 ? deflateRawSync(raw) : raw);
    const crc = crc32(raw);
    const localOffset = out.length;
    out.push(
      0x50,
      0x4b,
      0x03,
      0x04,
      ...u16(20), // version needed
      ...u16(0x0800), // UTF-8 flag
      ...u16(method),
      ...u16(0),
      ...u16(0), // time/date
      ...u32(crc),
      ...u32(payload.length),
      ...u32(raw.length),
      ...u16(nameBytes.length),
      ...u16(0), // extra length
      ...nameBytes,
      ...payload,
    );
    central.push(
      0x50,
      0x4b,
      0x01,
      0x02,
      ...u16(20),
      ...u16(20),
      ...u16(0x0800),
      ...u16(method),
      ...u16(0),
      ...u16(0),
      ...u32(crc),
      ...u32(payload.length),
      ...u32(raw.length),
      ...u16(nameBytes.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0), // external attrs
      ...u32(localOffset),
      ...nameBytes,
    );
  }
  const centralOffset = out.length;
  out.push(...central);
  const centralSize = out.length - centralOffset;
  out.push(
    0x50,
    0x4b,
    0x05,
    0x06,
    ...u16(0),
    ...u16(0),
    ...u16(entries.length),
    ...u16(entries.length),
    ...u32(centralSize),
    ...u32(centralOffset),
    ...u16(0), // comment length
  );
  return new Uint8Array(out);
}
