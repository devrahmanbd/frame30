/**
 * Byte-level asset utilities — no dependencies, no image libraries.
 *
 * PNG geometry comes from the IHDR chunk; JPEG geometry from the first
 * SOF0/SOF1/SOF2 marker; SVG is detected from the root element. The
 * returned `format` is what the BYTES are, which is what the gate compares
 * against the file name and the manifest.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function imageInfo(buffer) {
  if (!buffer || buffer.length < 4) {
    return { format: null, width: null, height: null };
  }
  // PNG
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    if (buffer.length < 24) return { format: null, width: null, height: null };
    return {
      format: "png",
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }
  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let i = 2;
    while (i < buffer.length - 9) {
      if (buffer[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = buffer[i + 1];
      if (
        marker === 0xd8 ||
        marker === 0x01 ||
        (marker >= 0xd0 && marker <= 0xd7)
      ) {
        i += 2;
        continue;
      }
      if (marker === 0xd9 || marker === 0xda) break; // EOI / SOS — no frame header
      const length = buffer.readUInt16BE(i + 2);
      const isSof =
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc;
      if (isSof) {
        return {
          format: "jpeg",
          height: buffer.readUInt16BE(i + 5),
          width: buffer.readUInt16BE(i + 7),
        };
      }
      i += 2 + length;
    }
    return { format: "jpeg", width: null, height: null };
  }
  // SVG
  const head = buffer.toString("utf8", 0, Math.min(buffer.length, 512)).trim();
  if (head.startsWith("<?xml")) {
    const body = buffer.toString("utf8", 0, Math.min(buffer.length, 2048));
    if (/<svg[\s>]/i.test(body))
      return { format: "svg", width: null, height: null };
    return { format: null, width: null, height: null };
  }
  if (head.startsWith("<svg") || head.startsWith("<!DOCTYPE svg")) {
    return { format: "svg", width: null, height: null };
  }
  return { format: null, width: null, height: null };
}

export function fileInfo(path) {
  let buffer;
  try {
    buffer = readFileSync(path);
  } catch {
    return null;
  }
  const { format, width, height } = imageInfo(buffer);
  return {
    format,
    width,
    height,
    bytes: buffer.length,
    sha256: sha256(buffer),
  };
}
