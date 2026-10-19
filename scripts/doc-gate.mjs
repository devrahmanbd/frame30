#!/usr/bin/env node
/**
 * Documentation gate — eight deterministic checks over the canonical docs.
 *
 * Exit codes: 0 clean / 1 findings / 2 harness failure (bad CLI, self-test
 * mismatch, unreadable input, or an unable-to-extract PROP_KINDS set).
 *
 * Usage:
 *   node scripts/doc-gate.mjs              # self-test preflight, then repo scan
 *   node scripts/doc-gate.mjs --self-test  # seeded fixture corpus only
 *   node scripts/doc-gate.mjs --json       # machine report on stdout
 *
 * There is deliberately no CLI suppression flag of any kind. The only
 * suppression is the inline `<!-- doc-gate-ok: <reason> -->` marker on the
 * exact offending line; every instance found is listed in the report.
 *
 * Heuristic limits (pinned by the self-test corpus):
 *
 * Check 1 (source refs). A backticked token counts as a repo path only when
 * it contains a slash. `./` / `../` refs resolve doc-relative first, then at
 * the repo root. A relative ref that resolves nowhere is treated as
 * bundle-internal only inside a Level B bundle document (one that names
 * `dev.theme.json` or a `bundle.*` error); repo-root-looking paths (`src/…`,
 * `docs/…`) are still checked there. Bare filenames, npm specifiers, MIME
 * types, route params, plugin/widget keys and dot-extension lists are not
 * path candidates.
 *
 * Check 2 (commands). `bun|npm run <name>` must be a package.json script;
 * `node|bun scripts/<file>` must exist; `npx|bunx <binary>` must be one of
 * vitest, playwright, tsc or vite. Shell lines are scanned in fenced blocks
 * and inline code alike; `cd` targets are not checked.
 *
 * Check 3 (routes). `/dashboard/…` resolves by exact segment depth against
 * `src/routes/**`, with a `$param` file segment matching one path segment.
 * `/admin/builder` has no route and is permitted only when the same line
 * carries the lowercase `legacy` banner token (case-insensitive).
 *
 * Check 4 (manifest examples). Only fences labelled exactly
 * `plugin-manifest` or `theme-manifest.json` are parsed. Only top-level keys
 * are checked against LABEL_KEYS.
 *
 * Check 5 (field kinds). Scoped to widget-authoring docs: a document must
 * mention `propsSchema` to be scanned, so install-package discriminators such
 * as `kind: "theme"` in package docs are not PropField kinds. Both prose
 * `kind: "x"` and JSON `"kind": "x"` forms are read against PROP_KINDS.
 *
 * Check 6 (authority links). Link presence and normalized target only; a
 * semantic divergence between a doc and its authority is check 8's job.
 * Inline links and reference definitions are accepted; absolute URLs are not.
 *
 * Check 7 (status). `STATUS_REQUIRED` is the single source of what is
 * scanned; the leading block ends at the first `## ` outside a fence. Fenced
 * examples never satisfy the requirement.
 *
 * Check 8 (contradictions). The pinned patterns are line-scoped; a banner
 * (for /admin/builder) or an inline suppression marker is the only escape,
 * and every suppression instance is printed.
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  globSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const FIXTURES = path.join(ROOT, "scripts/fixtures/doc-gate");

/* -------------------------------------------------------------------------- */
/* Pinned config — copied verbatim from the plan; do not paraphrase.          */
/* -------------------------------------------------------------------------- */

const IN_SCOPE = [
  "docs/developers/**",
  "docs/04-builder/README.md",
  "docs/04-builder/app-blocks.md",
  "docs/themes/creation.md",
  "docs/themes/packages.md",
  "docs/themes/level-b.md",
  "docs/packages/contract.md",
];
const STATUS_REQUIRED = [
  /* IN_SCOPE markdown minus the index: */
  "docs/developers/community-plugins.md",
  "docs/developers/concepts.md",
  "docs/developers/editor.md",
  "docs/developers/examples.md",
  "docs/developers/getting-started.md",
  "docs/developers/global-chrome.md",
  "docs/developers/guidelines.md",
  "docs/developers/menu-extensions.md",
  "docs/developers/plugins.md",
  "docs/developers/review-policy.md",
  "docs/developers/sdk.md",
  "docs/developers/security-sandbox.md",
  "docs/developers/themeable-widgets.md",
  "docs/developers/themes.md",
  "docs/developers/theme-updates.md",
  "docs/developers/versioning-publishing.md",
  "docs/developers/widget-development.md",
  "docs/04-builder/README.md",
  "docs/04-builder/app-blocks.md",
  "docs/themes/creation.md",
  "docs/themes/packages.md",
  "docs/themes/level-b.md",
  "docs/packages/contract.md",
  // exempt: docs/developers/README.md (index; covered by other checks, no status line)
];
const STATUS_FORMS = [
  /^Last verified: \d{4}-\d{2}-\d{2} @ [0-9a-f]{7,40}$/,
  /^Needs verification$/,
  /^Historical — .+$/,
];
const AUTHORITY_KEYWORDS = {
  /* keyword (case-insensitive) -> authority path */
  propsSchema: "docs/04-builder/app-blocks.md",
  defaultProps: "docs/04-builder/app-blocks.md",
  themeable: "docs/04-builder/app-blocks.md",
  "widget tray": "docs/04-builder/README.md",
  "schema inspector": "docs/04-builder/README.md",
  "theme presentation": "docs/themes/creation.md",
  registerThemePresentation: "docs/themes/creation.md",
  "source-owned": "docs/themes/creation.md",
  "Level B": "docs/packages/contract.md",
};
const CONTRADICTIONS = [
  /* check 8, each with pass/ + fail/ fixtures */
  {
    id: "official-as-zip",
    pattern: /\bofficial\b[^\n.]*\b(downloadable|ZIP)\b/i,
  },
  {
    id: "songoskriti-as-package",
    pattern: /\bSongoskriti\b[^\n.]*\b(package|downloadable|ZIP)\b/i,
  },
  { id: "admin-builder", pattern: /\/admin\/builder/, banner: /legacy/i },
  { id: "no-playwright", pattern: /\bno\s+Playwright\b/i },
  { id: "no-e2e", pattern: /\bno\s+`?\.e2e`?\b/i },
  {
    id: "levelb-official",
    pattern: /\bofficial themes?[^\n.]*\bLevel B\b/i,
  },
];
const LABEL_KEYS = {
  "plugin-manifest": {
    required: ["id", "name", "version", "api", "widgets"],
    allow: [
      "id",
      "name",
      "version",
      "description",
      "api",
      "permissions",
      "widgets",
      "hooks",
      "hooksUrl",
      "i18n",
      "budget",
      "settings",
      "propsSchema",
      "defaultProps",
      "themeable",
    ],
  },
  "theme-manifest.json": {
    required: ["id", "name", "version"],
    allow: [
      "id",
      "name",
      "version",
      "description",
      "tokens",
      "skins",
      "homepage",
      "presentations",
      "assets",
    ],
  },
};
const SUPPRESSION = /<!-- doc-gate-ok: .+ -->/; // must carry a reason

/* -------------------------------------------------------------------------- */
/* Check metadata + small helpers                                             */
/* -------------------------------------------------------------------------- */

const CHECK1 = "1 source-refs";
const CHECK2 = "2 commands";
const CHECK3 = "3 routes";
const CHECK4 = "4 manifest-examples";
const CHECK5 = "5 field-kinds";
const CHECK6 = "6 authority-links";
const CHECK7 = "7 verification-status";
const CHECK8 = "8 contradictions";

const KNOWN_BINARIES = new Set(["vitest", "playwright", "tsc", "vite"]);
const EXTENSION_LIST = /^(?:\.[A-Za-z0-9]+)(?:\/(?:\.[A-Za-z0-9]+))*$/;
const MIME_TYPE =
  /^(?:application|text|image|audio|video|font|multipart|message)\/[a-z0-9.+-]+$/i;
const LINE_SUFFIX = /(?::\d+(?:[-–]\d+)?(?:,\d+(?:[-–]\d+)?)*\+?|:\d+-\.\.\.)$/;

const toRel = (abs) => path.relative(ROOT, abs).split(path.sep).join("/");
const insideRoot = (abs) => {
  const rel = path.relative(ROOT, abs);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function walkFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  if (statSync(dir).isFile()) return [dir];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(abs));
    else out.push(abs);
  }
  return out;
}

function readDoc(abs) {
  const text = readFileSync(abs, "utf8");
  return {
    abs,
    rel: toRel(abs),
    text,
    lines: text.split("\n").map((line) => line.replace(/\r$/, "")),
  };
}

function collectMarkdown(dir) {
  return walkFiles(dir)
    .filter((abs) => abs.endsWith(".md"))
    .sort()
    .map(readDoc);
}

function suppressionReason(line) {
  if (!SUPPRESSION.test(line)) return null;
  const match = line.match(/<!-- doc-gate-ok: (.+?) -->/);
  return match ? match[1].trim() : "";
}

function makeContext(docs, options = {}) {
  const ctx = { docs, options, findings: [], suppressions: [] };
  for (const doc of docs) {
    doc.lines.forEach((line, index) => {
      const reason = suppressionReason(line);
      if (reason !== null) {
        ctx.suppressions.push({
          file: doc.rel,
          line: index + 1,
          reason,
        });
      }
    });
  }
  return ctx;
}

function addFinding(ctx, doc, lineNo, check, token, why) {
  const line = doc.lines[lineNo - 1] ?? "";
  if (SUPPRESSION.test(line)) return; // suppression already recorded in the pre-pass
  ctx.findings.push({ file: doc.rel, line: lineNo, check, token, why });
}

/* -------------------------------------------------------------------------- */
/* Check 1 — source refs                                                      */
/* -------------------------------------------------------------------------- */

const isPathCandidate = (raw) => {
  if (!raw || /\s/.test(raw)) return false;
  if (!raw.includes("/")) return false; // bare filenames are ambiguous, not repo paths
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return false; // scheme / plugin key
  if (raw.startsWith("/")) return false; // site-absolute route
  if (/[{}<>…$]/.test(raw)) return false; // templates, route params, ellipsis
  if (raw.includes("://")) return false;
  if (EXTENSION_LIST.test(raw)) return false;
  if (MIME_TYPE.test(raw)) return false;
  return true;
};

function stripLineSuffix(token) {
  let current = token;
  for (;;) {
    const next = current.replace(LINE_SUFFIX, "");
    if (next === current) return current;
    current = next;
  }
}

function check1(ctx) {
  const topLevel = new Set(readdirSync(ROOT));
  for (const doc of ctx.docs) {
    const bundleDoc = /\bdev\.theme\.json\b|\bbundle\.[a-z_]+/.test(doc.text);
    doc.lines.forEach((line, index) => {
      for (const match of line.matchAll(/`([^`\n]+)`/g)) {
        const raw = match[1].trim();
        if (!isPathCandidate(raw)) continue;
        const candidate = stripLineSuffix(raw);
        if (!candidate) continue;

        if (candidate.includes("*") || candidate.includes("?")) {
          const first = candidate.split("/")[0];
          if (!topLevel.has(first)) continue;
          let matches = [];
          try {
            matches = globSync(candidate, { cwd: ROOT });
          } catch {
            matches = [];
          }
          if (matches.length === 0) {
            addFinding(
              ctx,
              doc,
              index + 1,
              CHECK1,
              raw,
              "glob matches no repo path",
            );
          }
          continue;
        }

        const docRelative = path.resolve(path.dirname(doc.abs), candidate);
        if (insideRoot(docRelative) && existsSync(docRelative)) continue;

        const rootRelative = path.resolve(ROOT, candidate);
        if (insideRoot(rootRelative) && existsSync(rootRelative)) continue;

        if (candidate.startsWith("./") || candidate.startsWith("../")) {
          if (bundleDoc) continue; // bundle-internal example path
          addFinding(
            ctx,
            doc,
            index + 1,
            CHECK1,
            raw,
            "relative path does not resolve doc-relative or at the repo root",
          );
          continue;
        }

        if (!topLevel.has(candidate.split("/")[0])) continue; // npm / bundle-relative specifier

        addFinding(
          ctx,
          doc,
          index + 1,
          CHECK1,
          raw,
          "repo path does not exist",
        );
      }
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Check 2 — commands                                                         */
/* -------------------------------------------------------------------------- */

function check2(ctx) {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const scripts = pkg.scripts ?? {};

  for (const doc of ctx.docs) {
    doc.lines.forEach((line, index) => {
      for (const match of line.matchAll(
        /(?:^|[\s`])((?:bun|npm)\s+run\s+([A-Za-z0-9:_-]+))/g,
      )) {
        if (!Object.hasOwn(scripts, match[2])) {
          addFinding(
            ctx,
            doc,
            index + 1,
            CHECK2,
            match[1],
            `package.json has no "${match[2]}" script`,
          );
        }
      }

      for (const match of line.matchAll(
        /(?:^|[\s`])((?:node|bun)\s+(scripts\/[A-Za-z0-9._/-]+))/g,
      )) {
        const rel = match[2].replace(/[.,;:]+$/, "");
        if (!existsSync(path.join(ROOT, rel))) {
          addFinding(
            ctx,
            doc,
            index + 1,
            CHECK2,
            match[1],
            `script file ${rel} does not exist`,
          );
        }
      }

      for (const match of line.matchAll(
        /(?:^|[\s`])((?:npx|bunx)\s+([A-Za-z0-9@._/-]+))/g,
      )) {
        if (match[2].startsWith("-")) continue;
        const binary = match[2].split("/").pop();
        if (!KNOWN_BINARIES.has(binary)) {
          addFinding(
            ctx,
            doc,
            index + 1,
            CHECK2,
            match[1],
            `binary "${binary}" is not one of the pinned known binaries`,
          );
        }
      }
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Check 3 — routes                                                           */
/* -------------------------------------------------------------------------- */

function listRouteSegments() {
  return walkFiles(path.join(ROOT, "src/routes"))
    .filter((abs) => /\.(ts|tsx)$/.test(abs) && !/\.test\.(ts|tsx)$/.test(abs))
    .map((abs) => {
      const rel = path
        .relative(path.join(ROOT, "src/routes"), abs)
        .split(path.sep)
        .join("/")
        .replace(/\.(ts|tsx)$/, "");
      const segments = [];
      for (const part of rel.split("/")) {
        if (part === "_authenticated") continue;
        for (const piece of part.split(".")) {
          if (piece && piece !== "index") segments.push(piece);
        }
      }
      return segments;
    });
}

function resolvesDashboardRoute(route, routeSegments) {
  const want = route.split("/").filter(Boolean);
  if (want[0] !== "dashboard" || want.length < 2) return false;
  return routeSegments.some(
    (segments) =>
      segments.length === want.length &&
      segments.every(
        (segment, index) => segment.startsWith("$") || segment === want[index],
      ),
  );
}

function check3(ctx) {
  const routeSegments = listRouteSegments();
  for (const doc of ctx.docs) {
    doc.lines.forEach((line, index) => {
      for (const match of line.matchAll(
        /(?:^|[^\w/])(\/dashboard\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+)/g,
      )) {
        const route = match[1]
          .split(/[?#]/)[0]
          .replace(/\/+$/, "")
          .replace(/[.,;:)\]}]+$/, "");
        if (!route || /[<>…]/.test(route)) continue;
        if (!resolvesDashboardRoute(route, routeSegments)) {
          addFinding(
            ctx,
            doc,
            index + 1,
            CHECK3,
            route,
            "no file under src/routes matches this dashboard path",
          );
        }
      }

      if (/\/admin\/builder\b/.test(line) && !/\blegacy\b/i.test(line)) {
        addFinding(
          ctx,
          doc,
          index + 1,
          CHECK3,
          "/admin/builder",
          "no /admin/builder route exists; the mention must carry the legacy banner",
        );
      }
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Check 4 — manifest/code examples                                           */
/* -------------------------------------------------------------------------- */

function check4(ctx) {
  for (const doc of ctx.docs) {
    let index = 0;
    while (index < doc.lines.length) {
      const opening = doc.lines[index].match(
        /^```\s*(plugin-manifest|theme-manifest\.json)\s*$/,
      );
      if (!opening) {
        index += 1;
        continue;
      }
      const label = opening[1];
      const startLine = index + 1;
      const body = [];
      index += 1;
      while (index < doc.lines.length && !/^```\s*$/.test(doc.lines[index])) {
        body.push(doc.lines[index]);
        index += 1;
      }
      if (index < doc.lines.length) index += 1; // closing fence

      let parsed;
      try {
        parsed = JSON.parse(body.join("\n"));
      } catch (error) {
        addFinding(
          ctx,
          doc,
          startLine,
          CHECK4,
          label,
          `labeled ${label} block is not valid JSON (${error.message})`,
        );
        continue;
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        addFinding(
          ctx,
          doc,
          startLine,
          CHECK4,
          label,
          `labeled ${label} block must parse to a JSON object`,
        );
        continue;
      }

      const spec = LABEL_KEYS[label];
      const keys = Object.keys(parsed);
      const missing = spec.required.filter((key) => !keys.includes(key));
      const unknown = keys.filter((key) => !spec.allow.includes(key));
      if (missing.length > 0) {
        addFinding(
          ctx,
          doc,
          startLine,
          CHECK4,
          label,
          `missing required key(s): ${missing.join(", ")}`,
        );
      }
      if (unknown.length > 0) {
        addFinding(
          ctx,
          doc,
          startLine,
          CHECK4,
          label,
          `key(s) outside the permitted key set: ${unknown.join(", ")}`,
        );
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Check 5 — field kinds                                                      */
/* -------------------------------------------------------------------------- */

function loadPropKinds() {
  const file = path.join(ROOT, "src/lib/widget-props.ts");
  const text = readFileSync(file, "utf8");
  const match = text.match(
    /export const PROP_KINDS = \[([\s\S]*?)\] as const;/,
  );
  if (!match) {
    throw new Error("cannot extract PROP_KINDS from src/lib/widget-props.ts");
  }
  const kinds = new Set(
    [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]),
  );
  if (kinds.size === 0) {
    throw new Error("PROP_KINDS extraction returned an empty set");
  }
  return kinds;
}

function check5(ctx, propKinds) {
  for (const doc of ctx.docs) {
    // Widget-authoring scope: package-install docs are not prop docs.
    if (!/\bpropsSchema\b/.test(doc.text)) continue;
    doc.lines.forEach((line, index) => {
      for (const match of line.matchAll(/\bkind"?\s*:\s*"([^"]+)"/g)) {
        if (!propKinds.has(match[1])) {
          addFinding(
            ctx,
            doc,
            index + 1,
            CHECK5,
            `kind: "${match[1]}"`,
            `"${match[1]}" is not an exported PROP_KINDS value in a widget-authoring doc`,
          );
        }
      }
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Check 6 — authority links                                                  */
/* -------------------------------------------------------------------------- */

function collectLinkTargets(doc) {
  const targets = [];
  for (const match of doc.text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    targets.push(match[1]);
  }
  for (const match of doc.text.matchAll(/^\[[^\]]+\]:\s*(\S+)/gm)) {
    targets.push(match[1]);
  }
  return targets;
}

function normalizeLinkTarget(doc, target) {
  let value = target.trim();
  if (value.startsWith("<") && value.endsWith(">")) value = value.slice(1, -1);
  value = value.split(/\s+/)[0];
  if (!value || value.startsWith("#")) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null; // absolute URL
  value = value.split("#")[0].split("?")[0];
  if (!value) return null;
  if (value.startsWith("/")) return path.posix.normalize(value.slice(1));
  return path.posix.normalize(
    path.posix.join(path.posix.dirname(doc.rel), value),
  );
}

function check6(ctx) {
  for (const doc of ctx.docs) {
    const links = new Set(
      collectLinkTargets(doc)
        .map((target) => normalizeLinkTarget(doc, target))
        .filter(Boolean),
    );
    for (const [keyword, authority] of Object.entries(AUTHORITY_KEYWORDS)) {
      const pattern = new RegExp(`\\b${escapeRegex(keyword)}\\b`, "i");
      const index = doc.lines.findIndex((line) => pattern.test(line));
      if (index === -1) continue;
      const authorityMissing = !existsSync(path.join(ROOT, authority));
      if (!authorityMissing && links.has(authority)) continue;
      addFinding(
        ctx,
        doc,
        index + 1,
        CHECK6,
        keyword,
        authorityMissing
          ? `authority path ${authority} does not exist`
          : `keyword mention has no markdown link normalizing to ${authority}`,
      );
    }
  }

  // A missing authority with no mention anywhere still has to fail closed.
  for (const [keyword, authority] of Object.entries(AUTHORITY_KEYWORDS)) {
    if (existsSync(path.join(ROOT, authority))) continue;
    const pattern = new RegExp(`\\b${escapeRegex(keyword)}\\b`, "i");
    if (!ctx.docs.some((doc) => pattern.test(doc.text))) {
      ctx.findings.push({
        file: "scripts/doc-gate.mjs",
        line: 1,
        check: CHECK6,
        token: keyword,
        why: `authority path ${authority} does not exist`,
      });
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Check 7 — verification status                                              */
/* -------------------------------------------------------------------------- */

function scanStatusLines(doc) {
  let fence = false;
  const matches = [];
  const suspicious = [];
  for (let index = 0; index < doc.lines.length; index += 1) {
    const line = doc.lines[index];
    if (/^\s*(```|~~~)/.test(line)) {
      fence = !fence;
      continue;
    }
    if (!fence && /^## /.test(line)) break;
    if (fence) continue;
    const form = STATUS_FORMS.findIndex((pattern) => pattern.test(line));
    if (form >= 0) matches.push({ line: index + 1, text: line, form });
    else if (
      /^(Last verified|Needs verification|Historical)\b/.test(line.trim())
    )
      suspicious.push({ line: index + 1, text: line });
  }
  return { matches, suspicious };
}

function check7(ctx) {
  const required = ctx.options.statusRequired ?? new Set(STATUS_REQUIRED);
  const docsByRel = new Map(ctx.docs.map((doc) => [doc.rel, doc]));

  for (const rel of [...required].sort()) {
    const doc = docsByRel.get(rel);
    if (!doc) {
      ctx.findings.push({
        file: rel,
        line: 1,
        check: CHECK7,
        token: "status",
        why: "required status document is missing",
      });
      continue;
    }

    const { matches, suspicious } = scanStatusLines(doc);
    if (matches.length === 0) {
      addFinding(
        ctx,
        doc,
        suspicious[0]?.line ?? 1,
        CHECK7,
        "status",
        suspicious.length > 0
          ? "malformed status line in the leading block"
          : "no status line in the leading block (fenced examples do not count)",
      );
      continue;
    }
    if (matches.length > 1) {
      addFinding(
        ctx,
        doc,
        matches[1].line,
        CHECK7,
        "status",
        `multiple status lines (${matches
          .map((match) => match.line)
          .join(", ")})`,
      );
      continue;
    }

    const match = matches[0];
    if (match.form === 0) {
      const sha = match.text.match(/@ ([0-9a-f]{7,40})$/)?.[1];
      if (!sha) {
        addFinding(
          ctx,
          doc,
          match.line,
          CHECK7,
          match.text,
          "Last verified line has no extractable sha",
        );
        continue;
      }
      const result = spawnSync(
        "git",
        ["rev-parse", "--verify", "--quiet", `${sha}^{commit}`],
        { cwd: ROOT, encoding: "utf8" },
      );
      if (result.status !== 0) {
        addFinding(
          ctx,
          doc,
          match.line,
          CHECK7,
          sha,
          `Last verified sha ${sha} does not resolve in this repo`,
        );
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Check 8 — contradiction lint                                               */
/* -------------------------------------------------------------------------- */

function check8(ctx) {
  for (const doc of ctx.docs) {
    doc.lines.forEach((line, index) => {
      for (const contradiction of CONTRADICTIONS) {
        const match = line.match(contradiction.pattern);
        if (!match) continue;
        if (contradiction.banner && contradiction.banner.test(line)) {
          continue;
        }
        addFinding(
          ctx,
          doc,
          index + 1,
          CHECK8,
          match[0].trim(),
          `contradicts the canonical docs (${contradiction.id})`,
        );
      }
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Runner                                                                     */
/* -------------------------------------------------------------------------- */

const CHECKS = [
  { id: "check1", name: CHECK1, run: (ctx) => check1(ctx) },
  { id: "check2", name: CHECK2, run: (ctx) => check2(ctx) },
  { id: "check3", name: CHECK3, run: (ctx) => check3(ctx) },
  { id: "check4", name: CHECK4, run: (ctx) => check4(ctx) },
  {
    id: "check5",
    name: CHECK5,
    run: (ctx) => check5(ctx, loadPropKinds()),
  },
  { id: "check6", name: CHECK6, run: (ctx) => check6(ctx) },
  { id: "check7", name: CHECK7, run: (ctx) => check7(ctx) },
  { id: "check8", name: CHECK8, run: (ctx) => check8(ctx) },
];

function runChecks(docs, options = {}) {
  const ctx = makeContext(docs, options);
  for (const check of CHECKS) check.run(ctx);
  ctx.findings.sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      a.line - b.line ||
      a.check.localeCompare(b.check) ||
      a.token.localeCompare(b.token),
  );
  return ctx;
}

function expandInScope() {
  const files = [];
  for (const pattern of IN_SCOPE) {
    if (pattern.endsWith("/**")) {
      const dir = path.join(ROOT, pattern.slice(0, -3));
      files.push(...walkFiles(dir).filter((abs) => abs.endsWith(".md")));
    } else {
      const abs = path.join(ROOT, pattern);
      if (existsSync(abs)) files.push(abs);
    }
  }
  const unique = [...new Set(files)]
    .map(toRel)
    .filter(
      (rel) =>
        rel !== "scripts/doc-gate.mjs" &&
        !rel.startsWith("scripts/fixtures/doc-gate/"),
    )
    .sort();
  return unique.map((rel) => readDoc(path.join(ROOT, rel)));
}

/* -------------------------------------------------------------------------- */
/* Self-test                                                                  */
/* -------------------------------------------------------------------------- */

function runSelfTest() {
  const results = [];

  for (const check of CHECKS) {
    const passDir = path.join(FIXTURES, check.id, "pass");
    const failDir = path.join(FIXTURES, check.id, "fail");
    const passDocs = collectMarkdown(passDir);
    const failDocs = collectMarkdown(failDir);

    if (passDocs.length === 0 || failDocs.length === 0) {
      results.push({
        id: check.id,
        name: check.name,
        ok: false,
        error: "missing pass/ or fail/ fixture directory",
        pass: passDocs.map((doc) => path.basename(doc.rel)),
        fail: failDocs.map((doc) => path.basename(doc.rel)),
      });
      continue;
    }

    const passCtx = makeContext(passDocs, {
      statusRequired: new Set(passDocs.map((doc) => doc.rel)),
    });
    check.run(passCtx);
    const failCtx = makeContext(failDocs, {
      statusRequired: new Set(failDocs.map((doc) => doc.rel)),
    });
    check.run(failCtx);

    const passLeaks = passDocs
      .filter((doc) => passCtx.findings.some((f) => f.file === doc.rel))
      .map((doc) => path.basename(doc.rel));
    const failMisses = failDocs
      .filter((doc) => !failCtx.findings.some((f) => f.file === doc.rel))
      .map((doc) => path.basename(doc.rel));

    let suppressionOk = true;
    if (check.id === "check8") {
      const marker = passDocs.find((doc) => doc.rel.endsWith("suppression.md"));
      suppressionOk =
        Boolean(marker) &&
        passCtx.suppressions.some((entry) => entry.file === marker.rel);
    }

    results.push({
      id: check.id,
      name: check.name,
      ok: passLeaks.length === 0 && failMisses.length === 0 && suppressionOk,
      pass: passDocs.map((doc) => path.basename(doc.rel)),
      fail: failDocs.map((doc) => path.basename(doc.rel)),
      passLeaks,
      failMisses,
      ...(check.id === "check8" ? { suppressionListed: suppressionOk } : {}),
    });
  }

  // The CLI must reject an unknown flag. The probe is assembled so this file
  // contains no suppression-flag literal of its own.
  const probeFlag = ["--", "al", "low"].join("");
  const probe = spawnSync(process.execPath, [SCRIPT_PATH, probeFlag], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const probeText = `${probe.stdout ?? ""}${probe.stderr ?? ""}`;
  const cliOk = probe.status === 2 && /unknown flag/i.test(probeText);

  const source = readFileSync(SCRIPT_PATH, "utf8");
  const forbidden = new RegExp(escapeRegex(probeFlag));
  const noCapability = !forbidden.test(source) && !/\bALLOW\s*=/.test(source);

  results.push({
    id: "cli",
    name: "unknown-flag rejection",
    ok: cliOk && noCapability,
    detail: `exit ${probe.status ?? "null"}; no CLI suppression capability in source`,
  });

  return {
    ok: results.every((result) => result.ok),
    checks: results,
  };
}

/* -------------------------------------------------------------------------- */
/* Reporting + CLI                                                            */
/* -------------------------------------------------------------------------- */

function printSelfTest(selfTest) {
  const lines = ["doc gate self-test", ""];
  for (const result of selfTest.checks) {
    const status = result.ok ? "PASS" : "FAIL";
    if (result.id === "cli") {
      lines.push(`  ${status} ${result.name} — ${result.detail}`);
      continue;
    }
    lines.push(
      `  ${status} ${result.id} ${result.name} — pass: ${result.pass.length}, fail: ${result.fail.length}`,
    );
    if (result.passLeaks?.length) {
      lines.push(
        `       pass fixture(s) with findings: ${result.passLeaks.join(", ")}`,
      );
    }
    if (result.failMisses?.length) {
      lines.push(
        `       fail fixture(s) not detected: ${result.failMisses.join(", ")}`,
      );
    }
    if (result.suppressionListed === false) {
      lines.push("       suppression fixture was not listed in the report");
    }
    if (result.error) lines.push(`       ${result.error}`);
  }
  lines.push("", `self-test: ${selfTest.ok ? "PASS" : "FAIL"}`);
  process.stdout.write(`${lines.join("\n")}\n`);
}

function printHuman(ctx, selfTest) {
  const lines = [
    "doc gate — canonical documentation checks",
    `scope: ${ctx.docs.length} documents (${STATUS_REQUIRED.length} require a status line)`,
    `self-test: ${selfTest.ok ? "PASS" : "FAIL"}`,
    "",
  ];

  if (ctx.findings.length === 0) {
    lines.push("findings: 0");
  } else {
    lines.push(`findings: ${ctx.findings.length}`);
    for (const finding of ctx.findings) {
      lines.push(
        `  ${finding.file}:${finding.line} [${finding.check}] ${finding.token}`,
      );
      lines.push(`    ${finding.why}`);
    }
  }

  lines.push("", `suppressions: ${ctx.suppressions.length}`);
  for (const entry of ctx.suppressions) {
    lines.push(`  ${entry.file}:${entry.line} — ${entry.reason}`);
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}

function reportJson(ctx, selfTest, exitCode) {
  const byCheck = {};
  for (const finding of ctx.findings) {
    byCheck[finding.check] = (byCheck[finding.check] ?? 0) + 1;
  }
  const payload = {
    gate: "doc-gate",
    generatedAt: new Date().toISOString(),
    exitCode,
    scope: ctx.docs.map((doc) => doc.rel),
    selfTest,
    counts: {
      documents: ctx.docs.length,
      statusRequired: STATUS_REQUIRED.length,
      findings: ctx.findings.length,
      suppressions: ctx.suppressions.length,
      byCheck,
    },
    findings: ctx.findings,
    suppressions: ctx.suppressions,
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function parseCli(argv) {
  const known = new Set(["--json", "--self-test"]);
  const unknown = argv.filter((arg) => !known.has(arg));
  if (unknown.length > 0) {
    process.stderr.write(
      `doc gate: unknown flag${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}\n`,
    );
    process.stderr.write(
      "usage: node scripts/doc-gate.mjs [--self-test] [--json]\n",
    );
    return null;
  }
  return {
    json: argv.includes("--json"),
    selfTestOnly: argv.includes("--self-test"),
  };
}

function main() {
  const cli = parseCli(process.argv.slice(2));
  if (!cli) return 2;

  const selfTest = runSelfTest();

  if (cli.selfTestOnly) {
    if (cli.json) {
      process.stdout.write(
        `${JSON.stringify(
          {
            gate: "doc-gate-self-test",
            ok: selfTest.ok,
            checks: selfTest.checks,
          },
          null,
          2,
        )}\n`,
      );
    } else {
      printSelfTest(selfTest);
    }
    return selfTest.ok ? 0 : 2;
  }

  if (!selfTest.ok) {
    if (cli.json) {
      process.stdout.write(
        `${JSON.stringify(
          {
            gate: "doc-gate",
            exitCode: 2,
            selfTest,
            findings: [],
            suppressions: [],
          },
          null,
          2,
        )}\n`,
      );
    } else {
      printSelfTest(selfTest);
      process.stderr.write("doc gate: self-test failed; repo scan not run\n");
    }
    return 2;
  }

  const ctx = runChecks(expandInScope(), {
    statusRequired: new Set(STATUS_REQUIRED),
  });
  const exitCode = ctx.findings.length > 0 ? 1 : 0;
  if (cli.json) reportJson(ctx, selfTest, exitCode);
  else printHuman(ctx, selfTest);
  return exitCode;
}

try {
  process.exit(main());
} catch (error) {
  process.stderr.write(
    `doc gate could not run: ${error?.stack ?? error?.message ?? error}\n`,
  );
  process.exit(2);
}
