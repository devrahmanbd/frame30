#!/usr/bin/env node
/**
 * Songoskriti imagery generator — spec §4.
 *
 * Generates the 14 raster assets of the manifest via the Gemini Imagen REST
 * API; the 15th file (logo-lockup.svg) is hand-built and committed directly.
 *
 *   POST https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict
 *
 * Security (non-negotiable):
 *   - The key is read ONLY from process.env.GEMINI_API_KEY. When absent the
 *     script throws a clear error and exits non-zero before any network call.
 *   - The key is NEVER logged, printed (not even a prefix), persisted, or
 *     written to disk. It travels only in the Authorization header of the
 *     Imagen request.
 *
 * Behaviour:
 *   - Retry ×2 per asset (3 attempts total), then skip-on-fail with a warning
 *     — the storefront fallback (file-if-exists else /api/public/ph) covers
 *     missing files, so one failed asset never fails the whole run.
 *   - Idempotent: existing files at the target size are skipped unless --force.
 *   - Do NOT run until the owner confirms the key rotation.
 *
 * Usage:
 *   GEMINI_API_KEY=... node scripts/gen-songoskriti-assets.mjs [--force] [--out public/ph/songoskriti]
 *   node scripts/songoskriti-assets-check.mjs   # gate: GREEN when complete
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pngSize } from "./songoskriti-assets-check.mjs";

const ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict";
const MAX_ATTEMPTS = 3; // initial try + retry x2

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error(
    "GEMINI_API_KEY is not set. Export it in the environment (never commit it) " +
      "and re-run. Generation is blocked until the owner confirms key rotation.",
  );
}

const argv = process.argv.slice(2);
const FORCE = argv.includes("--force");
const outFlag = argv.indexOf("--out");
const OUT = resolve(
  import.meta.dirname,
  "..",
  outFlag === -1 ? "public/ph/songoskriti" : argv[outFlag + 1],
);

/**
 * [filename, aspect ratio for the model, prompt].
 * Prompts are art-directed for a cohesive terracotta/ivory heritage look.
 * No people-identifiable faces in prompts where avoidable; commercial-safe.
 */
const ASSETS = [
  [
    "hero-festive.png",
    "16:9",
    "Festive Bengali Eid clothing market at golden hour, terracotta and ivory " +
      "fabric banners, editorial e-commerce hero photograph, warm light, no text",
  ],
  [
    "hero-weaves.png",
    "16:9",
    "Close-up of a traditional Bengali handloom with terracotta jamdani weave " +
      "in progress, artisan hands, ivory threads, editorial craft photograph, no text",
  ],
  [
    "hero-artisans.png",
    "16:9",
    "Bengali artisan workshop weaving kantha quilts, warm window light, " +
      "terracotta and ivory textiles, documentary e-commerce hero photograph, no text",
  ],
  [
    "cat-women.png",
    "1:1",
    "Elegant Bengali jamdani saree in terracotta and ivory draped flat-lay, " +
      "e-commerce category tile, centered, plain warm background, no text",
  ],
  [
    "cat-men.png",
    "1:1",
    "Crisp ivory panjabi kurta with subtle terracotta embroidery flat-lay, " +
      "e-commerce category tile, centered, plain warm background, no text",
  ],
  [
    "cat-kids.png",
    "1:1",
    "Cheerful small Bengali festive kurta for a child in ivory with terracotta " +
      "trim flat-lay, e-commerce category tile, plain warm background, no text",
  ],
  [
    "cat-living.png",
    "1:1",
    "Handwoven Bengali kantha throw in terracotta and ivory folded on a jute " +
      "chair, home-living e-commerce category tile, warm light, no text",
  ],
  [
    "cat-jewelry.png",
    "1:1",
    "Terracotta-and-gold Bengali temple necklace on ivory silk, jewelry " +
      "e-commerce category tile, centered, plain warm background, no text",
  ],
  [
    "cat-newin.png",
    "1:1",
    "Fresh festive Bengali outfit arrangement with marigold accents in " +
      "terracotta and ivory, new-arrivals e-commerce category tile, no text",
  ],
  [
    "prod-panjabi.png",
    "3:4",
    "Ivory men's panjabi kurta with terracotta thread embroidery on a ghost " +
      "mannequin, e-commerce product photo, plain warm studio background, no text",
  ],
  [
    "prod-saree.png",
    "3:4",
    "Terracotta jamdani saree with ivory motifs draped for e-commerce product " +
      "photo, plain warm studio background, no text",
  ],
  [
    "prod-kurta.png",
    "3:4",
    "Women's ivory kurta with terracotta kantha stitch detail on a hanger, " +
      "e-commerce product photo, plain warm studio background, no text",
  ],
  [
    "prod-kantha.png",
    "3:4",
    "Folded kantha-stitched quilt in terracotta and ivory layers, e-commerce " +
      "product photo, plain warm studio background, no text",
  ],
  [
    "prod-necklace.png",
    "3:4",
    "Bengali terracotta temple necklace with gold accents upright on ivory " +
      "stand, e-commerce jewelry product photo, plain warm background, no text",
  ],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function generateOnce(prompt, aspectRatio) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // The key is used here only, in the request header — never logged.
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio,
        personGeneration: "dont_allow",
      },
    }),
  });
  if (!res.ok) throw new Error(`Imagen HTTP ${res.status}`);
  const data = await res.json();
  const b64 = data?.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error("Imagen returned no image bytes");
  return Buffer.from(b64, "base64");
}

async function generateAsset([name, aspectRatio, prompt]) {
  const path = resolve(OUT, name);
  if (!FORCE && existsSync(path)) {
    const size = pngSize(path);
    if (size) {
      console.log(`skip (exists ${size.width}x${size.height}): ${name}`);
      return "skipped";
    }
  }
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const bytes = await generateOnce(prompt, aspectRatio);
      writeFileSync(path, bytes);
      console.log(`ok: ${name} (${bytes.length} bytes)`);
      return "ok";
    } catch (error) {
      lastError = error;
      console.warn(`warn: ${name} attempt ${attempt} failed: ${error.message}`);
      await sleep(1000 * attempt);
    }
  }
  // Skip-on-fail: the file-if-exists else /api/public/ph fallback covers it.
  console.warn(
    `warn: skipping ${name} after ${MAX_ATTEMPTS} attempts (${lastError?.message}). ` +
      `Fallback art covers this asset.`,
  );
  return "failed";
}

mkdirSync(OUT, { recursive: true });
const results = [];
for (const asset of ASSETS) results.push(await generateAsset(asset));
const failed = results.filter((r) => r === "failed").length;
console.log(
  `done: ${results.length - failed}/${results.length} generated` +
    (failed ? `, ${failed} skipped-on-fail (fallback covers them)` : ""),
);
