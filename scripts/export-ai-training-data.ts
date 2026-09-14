#!/usr/bin/env bun
/**
 * CLI Tool: Export Framique AI Training Data Flywheel (SFT & DPO).
 *
 * Usage:
 *   bun run scripts/export-ai-training-data.ts --format=chatml --output=./sft_dataset.jsonl
 *   bun run scripts/export-ai-training-data.ts --format=sharegpt --min-rating=4
 *   bun run scripts/export-ai-training-data.ts --format=dpo --output=./dpo_pairs.jsonl
 *   bun run scripts/export-ai-training-data.ts --verify-pii
 */

import { existsSync, writeFileSync } from "fs";
import { resolve } from "path";
import {
  exportSftDataset,
  exportDpoDataset,
  getCsatAnalytics,
} from "../src/lib/ai-training-data.server";

// PII patterns to assert zero leaks in the exported file
const PII_LEAK_CHECKS = [
  { name: "email", regex: /[\w.+-]+@[\w-]+\.[\w.]{2,}/ },
  { name: "bangladesh_phone", regex: /(?:\+?88)?01[3-9]\d{8}/ },
  { name: "credit_card", regex: /\b(?:\d[ -]?){13,19}\b/ },
];

async function main() {
  const args = process.argv.slice(2);
  const help = args.includes("--help") || args.includes("-h");

  if (help) {
    console.log(`
Framique AI Training Flywheel Exporter (RLHF, SFT, DPO)

Options:
  --format=<chatml|sharegpt|dpo>   Export format (default: chatml)
  --min-rating=<1-5>               Minimum CSAT star rating for SFT (default: 4)
  --output=<path>                  Output JSONL file path
  --verify-pii                     Strict check that no raw PII leaks exist
  --dry-run                        Print stats without writing files
`);
    process.exit(0);
  }

  const formatArg = args.find((a) => a.startsWith("--format="))?.split("=")[1] || "chatml";
  const minRatingArg = Number(args.find((a) => a.startsWith("--min-rating="))?.split("=")[1]) || 4;
  const outputArg = args.find((a) => a.startsWith("--output="))?.split("=")[1];
  const isDryRun = args.includes("--dry-run");
  const verifyPii = args.includes("--verify-pii") || true;

  console.log(`\n🚀 Exporting Framique AI Training Dataset...`);
  console.log(`   Format: ${formatArg}`);
  console.log(`   Min Rating: ${minRatingArg}`);

  let lines: string[] = [];

  if (formatArg === "dpo") {
    const pairs = await exportDpoDataset();
    console.log(`   Synthesized ${pairs.length} DPO preference pairs.`);
    lines = pairs.map((p) => JSON.stringify(p));
  } else {
    const sft = await exportSftDataset({
      format: formatArg === "sharegpt" ? "sharegpt" : "chatml",
      minRating: minRatingArg,
    });
    console.log(`   Gathered ${sft.length} high-quality SFT turns (CSAT >= ${minRatingArg}).`);
    lines = sft.map((item) => JSON.stringify(item));
  }

  // PII Leak Verification
  if (verifyPii && lines.length > 0) {
    console.log(`   🔍 Running PII Leak Check across ${lines.length} lines...`);
    let leakFound = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const check of PII_LEAK_CHECKS) {
        if (check.regex.test(line)) {
          console.error(`   ❌ PII LEAK DETECTED at line ${i + 1} (${check.name}): ${line.slice(0, 80)}`);
          leakFound = true;
        }
      }
    }
    if (leakFound) {
      console.error(`\n🚨 Export aborted due to PII leak detection.`);
      process.exit(1);
    }
    console.log(`   ✅ Zero PII leaks detected! All lines sanitized with [redacted] tags.`);
  }

  if (isDryRun || !outputArg) {
    console.log(`\n📋 Preview (First record):`);
    console.log(lines[0] || "(empty dataset)");
    console.log(`\n💡 To write to a file, pass --output=./dataset.jsonl`);
  } else {
    const targetPath = resolve(process.cwd(), outputArg);
    writeFileSync(targetPath, lines.join("\n") + "\n", "utf8");
    console.log(`\n🎉 Successfully exported ${lines.length} lines to: ${targetPath}`);
  }
}

main().catch((err) => {
  console.error("Export failed:", err);
  process.exit(1);
});
